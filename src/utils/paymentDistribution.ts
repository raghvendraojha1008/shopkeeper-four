export interface OrderPaymentStatus {
  orderId: string;
  orderTotal: number;
  directPaid: number;
  autoPaid: number;
  totalPaid: number;
  balance: number;
  status: 'paid' | 'partial' | 'pending';
}

function parseDate(raw: any): Date {
  if (!raw) return new Date(0);
  if (raw?.toDate) return raw.toDate();
  const s = String(raw);
  return new Date(s.includes('T') ? s : s + 'T00:00:00');
}

export function computePaymentDistribution(
  orders: any[],
  transactions: any[],
  autoDistribute: boolean = true
): Map<string, OrderPaymentStatus> {
  const result = new Map<string, OrderPaymentStatus>();

  for (const order of orders) {
    if (!order.id) continue;
    result.set(order.id, {
      orderId: order.id,
      orderTotal: Number(order.total_amount) || 0,
      directPaid: 0,
      autoPaid: 0,
      totalPaid: 0,
      balance: 0,
      status: 'pending',
    });
  }

  // Step 1: Apply directly linked transactions (by bill_no match on the order)
  const usedTransactionIds = new Set<string>();

  for (const tx of transactions) {
    if (!tx.bill_no || !tx.id) continue;
    const billNo = String(tx.bill_no).trim();

    const linkedOrder = orders.find(o => {
      const refNo = String(o.invoice_no || o.bill_no || '').trim();
      if (!refNo || refNo !== billNo) return false;
      if (tx.type === 'received' && o.type !== 'sell') return false;
      if (tx.type === 'paid' && o.type !== 'purchase') return false;
      return true;
    });

    if (!linkedOrder || !result.has(linkedOrder.id)) continue;
    result.get(linkedOrder.id)!.directPaid += Number(tx.amount) || 0;
    usedTransactionIds.add(tx.id);
  }

  // Step 2: Auto-distribute unlinked payments FIFO by party+type
  if (autoDistribute) {
    // Group orders by (party_name :: order_type)
    const groupedOrders = new Map<string, any[]>();
    for (const order of orders) {
      const key = `${order.party_name || ''}::${order.type || ''}`;
      if (!groupedOrders.has(key)) groupedOrders.set(key, []);
      groupedOrders.get(key)!.push(order);
    }

    // Sum unlinked transactions by (party_name :: matching_order_type)
    const groupedPool = new Map<string, number>();
    for (const tx of transactions) {
      if (usedTransactionIds.has(tx.id)) continue;
      const orderType = tx.type === 'received' ? 'sell' : 'purchase';
      const key = `${tx.party_name || ''}::${orderType}`;
      groupedPool.set(key, (groupedPool.get(key) || 0) + (Number(tx.amount) || 0));
    }

    for (const [key, pOrders] of groupedOrders) {
      let pool = groupedPool.get(key) || 0;
      if (pool <= 0) continue;

      const sorted = [...pOrders].sort(
        (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()
      );

      for (const order of sorted) {
        if (pool <= 0) break;
        const status = result.get(order.id)!;
        const pending = status.orderTotal - status.directPaid;
        if (pending <= 0) continue;
        const applied = Math.min(pool, pending);
        status.autoPaid += applied;
        pool -= applied;
      }
    }
  }

  // Step 3: Compute final status
  for (const [, status] of result) {
    status.totalPaid = status.directPaid + status.autoPaid;
    status.balance = status.totalPaid - status.orderTotal;
    if (status.totalPaid >= status.orderTotal) {
      status.status = 'paid';
    } else if (status.totalPaid > 0) {
      status.status = 'partial';
    } else {
      status.status = 'pending';
    }
  }

  return result;
}
