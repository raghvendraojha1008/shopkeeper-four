import { where, orderBy } from 'firebase/firestore';

export const formatCurrency = (amount: number | string) => {
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(num);
};

export const formatDate = (date: any) => {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// FIXED: Returns strict local YYYY-MM-DD without timezone shifts
export const getCurrentMonthRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); 
  
  // Create dates at noon to avoid DST/midnight shifts
  const start = new Date(year, month, 1, 12, 0, 0);
  const end = new Date(year, month + 1, 0, 12, 0, 0);

  const toLocalISO = (d: Date) => {
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  return { 
      start: toLocalISO(start), 
      end: toLocalISO(end) 
  };
};

export const getDateObj = (date: any) => {
    return date && date.toDate ? date.toDate() : new Date(date || 0);
};

export const calculateAccounting = (ledger: any[], transactions: any[], role: string) => {
    let totalBilled = 0;
    let totalPaid = 0;

    ledger.forEach(l => {
        if((role === 'customer' && l.type === 'sell') || (role === 'supplier' && l.type === 'purchase')) {
            totalBilled += (Number(l.total_amount) || 0);
        }
    });

    transactions.forEach(t => {
        if((role === 'customer' && t.type === 'received') || (role === 'supplier' && t.type === 'paid')) {
            totalPaid += (Number(t.amount) || 0);
        }
    });

    return { totalBilled, totalPaid, balance: totalBilled - totalPaid };
};

export const getQueryConstraints = (config: any) => {
    const constraints: any[] = [];
    if (config.dateFilter?.start && config.dateFilter?.end) {
        const start = new Date(config.dateFilter.start);
        const end = new Date(config.dateFilter.end);
        end.setHours(23, 59, 59, 999);
        constraints.push(where('date', '>=', start));
        constraints.push(where('date', '<=', end));
    }
    if (config.sortField) {
        constraints.push(orderBy(config.sortField, config.sortDirection || 'desc'));
    }
    return constraints;
};






