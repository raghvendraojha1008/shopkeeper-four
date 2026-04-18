import React, { useMemo } from 'react';
import { AlertTriangle, Package, ArrowRight, Clock, TrendingDown } from 'lucide-react';
import { InventoryItem } from '../../types/models';

interface SalesRecord {
  items?: { item_name: string; quantity: number }[];
  date: string;
  type?: string;
}

interface LowStockWidgetProps {
  items: InventoryItem[];
  salesData?: SalesRecord[];
  onViewAll?: () => void;
  onItemClick?: (item: InventoryItem) => void;
}

/** Calculate average daily sales for an item over the last 30 days */
const calcDaysRemaining = (item: InventoryItem, salesData: SalesRecord[]): number | null => {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  let totalQty = 0;
  let daysSpan = 30;

  for (const record of salesData) {
    if (record.type && record.type !== 'sell') continue;
    const recordDate = new Date(record.date).getTime();
    if (recordDate < thirtyDaysAgo || recordDate > now) continue;

    if (record.items) {
      for (const li of record.items) {
        if (li.item_name?.toLowerCase() === item.name?.toLowerCase()) {
          totalQty += li.quantity || 0;
        }
      }
    }
  }

  if (totalQty === 0) return null; // no sales data
  const avgDaily = totalQty / daysSpan;
  if (avgDaily <= 0) return null;

  return Math.round((item.current_stock || 0) / avgDaily);
};

const LowStockWidget: React.FC<LowStockWidgetProps> = ({ items, salesData = [], onViewAll, onItemClick }) => {
  // Enrich items with days remaining
  const enrichedItems = useMemo(() => {
    return items.map(item => ({
      ...item,
      daysRemaining: salesData.length > 0 ? calcDaysRemaining(item, salesData) : null,
    }));
  }, [items, salesData]);

  if (items.length === 0) {
    return (
      <div className="bg-[rgba(16,185,129,0.08)] p-4 rounded-2xl border border-[rgba(16,185,129,0.2)]">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[rgba(16,185,129,0.15)] rounded-xl">
            <Package size={20} className="text-[#34d399]" />
          </div>
          <div>
            <div className="font-bold text-sm text-[#6ee7b7]">All Stock OK</div>
            <div className="text-xs text-[rgba(110,231,183,0.7)]">No items below minimum level</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[rgba(239,68,68,0.07)] p-4 rounded-2xl border border-[rgba(239,68,68,0.18)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[rgba(239,68,68,0.15)] rounded-lg">
            <AlertTriangle size={16} className="text-[#f87171]" />
          </div>
          <span className="font-bold text-sm text-[#fca5a5]">
            Low Stock Alert ({items.length})
          </span>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-[10px] font-bold text-[#f87171] flex items-center gap-1 hover:underline"
          >
            View All <ArrowRight size={12} />
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {enrichedItems.slice(0, 5).map((item) => (
          <div
            key={item.id}
            onClick={() => onItemClick?.(item)}
            className="bg-[rgba(255,255,255,0.06)]/50 p-2.5 rounded-xl flex items-center justify-between cursor-pointer hover:bg-red-100 hover:bg-[rgba(255,255,255,0.1)] transition-colors gap-3 overflow-hidden"
          >
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm truncate">
                {item.name}
              </div>
              <div className="text-[10px] text-[rgba(148,163,184,0.55)]">
                Min: {item.min_stock} {item.unit}
              </div>
              {/* Smart Alert: Days Remaining */}
              {item.daysRemaining !== null && (
                <div className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${
                  item.daysRemaining <= 3 
                    ? 'text-red-400' 
                    : item.daysRemaining <= 7 
                      ? 'text-orange-400' 
                      : 'text-yellow-400'
                }`}>
                  <Clock size={10} />
                  {item.daysRemaining <= 0 
                    ? 'Out of stock based on sales velocity!' 
                    : `~${item.daysRemaining}d left at current pace`}
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-black text-base text-red-400 tabular-nums whitespace-nowrap">
                {item.current_stock}
              </div>
              <div className="text-[9px] text-[rgba(148,163,184,0.45)]">{item.unit}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Urgent restock callout */}
      {enrichedItems.some(i => i.daysRemaining !== null && i.daysRemaining <= 3) && (
        <div className="mt-2 bg-[rgba(239,68,68,0.12)] rounded-lg p-2 flex items-center gap-2">
          <TrendingDown size={14} className="text-red-600 flex-shrink-0" />
          <span className="text-[10px] font-bold text-red-400">
            {enrichedItems.filter(i => i.daysRemaining !== null && i.daysRemaining <= 3).length} item(s) will run out within 3 days. Order now!
          </span>
        </div>
      )}

      {items.length > 5 && (
        <div className="text-center mt-2">
          <span className="text-[10px] text-red-500">
            +{items.length - 5} more items need restocking
          </span>
        </div>
      )}
    </div>
  );
};

export default LowStockWidget;







