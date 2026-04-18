import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  Search, FileText, Edit2, Trash2, Filter, Download, Plus,
  Package, Truck, Calendar, BarChart3,
  ArrowLeft, BadgePercent, CheckCircle2, Clock, AlertCircle,
  IndianRupee
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { TrashService } from '../../services/trash';
import { useSoftDelete } from '../common/UndoSnackbar';
import { exportServiceV2 } from '../../services/exportServiceV2';
import { exportService } from '../../services/export';
import { useUI } from '../../context/UIContext';
import { useData } from '../../context/DataContext';
import ManualEntryModal from '../modals/ManualEntryModal';
import { formatCurrency } from '../../utils/helpers';
import { LedgerSkeleton } from '../common/Skeleton';
import ExportFormatModal from '../common/ExportFormatModal';
import LedgerEntryDetailView from './LedgerEntryDetailView';
import { Virtuoso } from 'react-virtuoso';
import { computePaymentDistribution } from '../../utils/paymentDistribution';

function parseRecordDate(raw: any): Date {
  if (!raw) return new Date(0);
  if (raw?.toDate) return raw.toDate();
  const s = String(raw);
  return new Date(s.includes('T') ? s : s + 'T00:00:00');
}

function toDateString(raw: any): string {
  return parseRecordDate(raw).toISOString().split('T')[0];
}

interface LedgerViewProps {
  user: User;
  onBack: () => void;
  appSettings?: any;
  typeFilter?: 'sell' | 'purchase';
}

const StatusTag: React.FC<{ status: 'paid' | 'partial' | 'pending' }> = ({ status }) => {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black"
        style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}>
        <CheckCircle2 size={9} /> Paid
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black"
        style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
        <Clock size={9} /> Partially Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black"
      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
      <AlertCircle size={9} /> Pending
    </span>
  );
};

const LedgerView: React.FC<LedgerViewProps> = ({ user, onBack, appSettings, typeFilter }) => {
  const { confirm, showToast } = useUI();
  const { useLedger, useParties, useTransactions } = useData();

  const { data: entries, isLoading: loading, refetch, setData } = useLedger(user.uid);
  const { data: partiesRaw } = useParties(user.uid);
  const { data: transactions } = useTransactions(user.uid);
  const parties = useMemo(() => partiesRaw as any[], [partiesRaw]);

  const [fetchedSettings, setFetchedSettings] = useState<any>({});
  const settings = appSettings && Object.keys(appSettings).length > 0 ? appSettings : fetchedSettings;

  const [searchTerm, setSearchTerm] = useState('');
  const [currentFilter, setCurrentFilter] = useState<'all' | 'sell' | 'purchase'>(typeFilter || 'all');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editData, setEditData] = useState<any | null>(null);
  const [entryType, setEntryType] = useState<'sales' | 'purchases'>('sales');
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => { if (typeFilter) setCurrentFilter(typeFilter); }, [typeFilter]);

  useEffect(() => {
    if (!appSettings || Object.keys(appSettings).length === 0) {
      ApiService.settings.get(user.uid).then(s => setFetchedSettings(s || {}));
    }
  }, [user.uid, appSettings]);

  const handleAdd = () => {
    setEntryType(currentFilter === 'purchase' ? 'purchases' : 'sales');
    setEditData(null);
    setShowEntryModal(true);
  };

  const handleEdit = (item: any) => {
    setEntryType(item.type === 'sell' ? 'sales' : 'purchases');
    setEditData(item);
    setShowEntryModal(true);
  };

  const { scheduleDelete } = useSoftDelete();

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = entries.find(i => i.id === id);
    if (!item) return;
    scheduleDelete({
      id,
      collection: 'ledger_entries',
      itemName: item.party_name || 'Ledger Entry',
      onOptimistic: () => setData(old => old.filter(i => i.id !== id)),
      onRestore: () => setData(old => [...old, item].sort((a, b) => parseRecordDate(b.date).getTime() - parseRecordDate(a.date).getTime())),
      onCommit: async () => { await TrashService.moveToTrash(user.uid, 'ledger_entries', id); },
    });
  }, [entries, user.uid, scheduleDelete, setData]);

  const cycleFilter = () => {
    if (currentFilter === 'all') setCurrentFilter('sell');
    else if (currentFilter === 'sell') setCurrentFilter('purchase');
    else setCurrentFilter('all');
  };

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const matchesSearch =
        e.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = currentFilter === 'all' ? true : e.type === currentFilter;
      const recordDate = toDateString(e.date);
      const matchesDate = recordDate >= dateRange.start && recordDate <= dateRange.end;
      return matchesSearch && matchesType && matchesDate;
    });
  }, [entries, searchTerm, currentFilter, dateRange]);

  const searchSuggestions = useMemo(() => {
    return parties
      .filter(p => {
        if (currentFilter === 'sell') return p.role === 'customer';
        if (currentFilter === 'purchase') return p.role === 'supplier';
        return true;
      })
      .map(p => p.name);
  }, [parties, currentFilter]);

  // Compute payment distribution for all ledger entries (not just filtered)
  // so FIFO distribution is correct across all orders of a party
  const paymentStatusMap = useMemo(() => {
    const autoDistribute = settings?.automation?.auto_distribute_payments !== false;
    return computePaymentDistribution(entries, transactions, autoDistribute);
  }, [entries, transactions, settings]);

  const { itemVolume, rentVolume, totalPaid, totalPending } = useMemo(() => {
    return filtered.reduce(
      (acc, item) => {
        const rent = Number(item.vehicle_rent) || 0;
        const fullTotal = Number(item.total_amount) || 0;
        const ps = paymentStatusMap.get(item.id);
        const paid = ps?.totalPaid || 0;
        const pending = ps ? Math.max(0, ps.orderTotal - ps.totalPaid) : fullTotal;
        return {
          itemVolume: acc.itemVolume + (fullTotal - rent),
          rentVolume: acc.rentVolume + rent,
          totalPaid: acc.totalPaid + paid,
          totalPending: acc.totalPending + pending,
        };
      },
      { itemVolume: 0, rentVolume: 0, totalPaid: 0, totalPending: 0 },
    );
  }, [filtered, paymentStatusMap]);

  const enrichedFiltered = useMemo(() => {
    const gstEnabled = !!settings?.automation?.auto_calculate_gst;
    return filtered.map(item => {
      const rent = Number(item.vehicle_rent) || 0;
      const discount = Number(item.discount_amount) || 0;
      const fullTotal = Number(item.total_amount) || 0;
      const itemTotal = fullTotal - rent;
      const partyMatch = parties?.find((p: any) => p.name === item.party_name);
      const totalGstPercent = item.items?.reduce(
        (sum: number, i: any) => sum + (Number(i.gst_percent) || 0), 0
      ) / (item.items?.length || 1);
      const ps = paymentStatusMap.get(item.id);
      return {
        ...item,
        _rent: rent,
        _discount: discount,
        _itemTotal: itemTotal,
        _gstEnabled: gstEnabled,
        _partyMatch: partyMatch,
        _totalGstPercent: totalGstPercent,
        _paidAmount: ps?.totalPaid || 0,
        _pendingAmount: ps ? Math.max(0, ps.orderTotal - ps.totalPaid) : fullTotal,
        _paymentStatus: ps?.status || 'pending',
      };
    });
  }, [filtered, parties, settings, paymentStatusMap]);

  const getItemSummary = (items: any[]) => {
    if (!items || items.length === 0) return 'No Items';
    const first = items[0];
    const count = items.length;
    return `${first.quantity} ${first.unit || ''} x ₹${first.rate} ${first.item_name}${count > 1 ? ` + ${count - 1} more` : ''}`;
  };

  const handleExportFormat = async (format: 'pdf' | 'excel') => {
    setShowExportModal(false);
    if (filtered.length === 0) return showToast('No data to export', 'error');

    if (format === 'excel') {
      const headerRow = ['Date', 'Invoice', 'Type', 'Party', 'Site', 'Item Name', 'Qty', 'Unit', 'Rate', 'Item Amount', 'GST%', 'Item Total', 'Rent', 'Discount', 'Grand Total', 'Payment Mode', 'Vehicle', 'Notes'];
      const dataRows: string[][] = [];

      for (const e of filtered) {
        const rent  = Number(e.vehicle_rent) || 0;
        const disc  = Number(e.discount_amount) || 0;
        const total = Number(e.total_amount) || 0;
        const items: any[] = Array.isArray(e.items) && e.items.length > 0 ? e.items : [null];

        items.forEach((item, idx) => {
          dataRows.push([
            toDateString(e.date),
            idx === 0 ? (e.invoice_no || e.prefixed_id || '-') : '',
            idx === 0 ? (e.type === 'sell' ? 'Sale' : 'Purchase') : '',
            idx === 0 ? (e.party_name || '-') : '',
            idx === 0 ? (e.site || '') : '',
            item ? item.item_name : '-',
            item ? String(item.quantity ?? '') : '',
            item ? (item.unit || '') : '',
            item ? String(item.rate ?? '') : '',
            item ? String(Number(item.quantity || 0) * Number(item.rate || 0)) : '',
            item ? String(item.gst_percent ?? '') : '',
            item ? String(item.total ?? '') : '',
            idx === 0 ? rent.toFixed(2) : '',
            idx === 0 ? disc.toFixed(2) : '',
            idx === 0 ? total.toFixed(2) : '',
            idx === 0 ? (e.payment_mode || '') : '',
            idx === 0 ? (e.vehicle_no || '') : '',
            idx === 0 ? (e.notes || '') : '',
          ]);
        });
      }

      const summaryRows = [[], ['Net Item Volume', itemVolume.toFixed(2)], ['Total Rent', rentVolume.toFixed(2)], ['Total Paid', totalPaid.toFixed(2)], ['Total Pending', totalPending.toFixed(2)]];

      const allRows = [
        [settings?.profile?.firm_name || 'Business'],
        [currentFilter === 'all' ? 'LEDGER REPORT' : currentFilter === 'sell' ? 'SALES REPORT' : 'PURCHASE REPORT'],
        ['Period:', `${dateRange.start} to ${dateRange.end}`],
        [],
        headerRow,
        ...dataRows,
        ...summaryRows,
      ];
      const csv = allRows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      await exportService.shareOrDownload(csv, `Ledger_${currentFilter}.csv`, 'text/csv');
      showToast('CSV Downloaded', 'success');
    } else {
      try {
        const profile = await ApiService.settings.get(user.uid);
        await exportServiceV2.ledgerToPdf(filtered, profile);
        showToast('PDF Downloaded', 'success');
      } catch (e: any) {
        console.error('Export error:', e);
        showToast('Export failed: ' + (e?.message || 'Unknown'), 'error');
      }
    }
  };

  const title = currentFilter === 'all' ? 'Ledger' : (currentFilter === 'sell' ? 'Sales' : 'Purchases');

  const renderLedgerCard = useCallback((item: any) => {
    const {
      _rent: rent, _discount: discount, _itemTotal: itemTotal,
      _gstEnabled: gstEnabled, _partyMatch: partyMatch, _totalGstPercent: totalGstPercent,
      _paidAmount: paidAmount, _pendingAmount: pendingAmount, _paymentStatus: paymentStatus,
    } = item;

    return (
      <div
        data-list-item
        onClick={() => setSelectedDetail(item)}
        className="p-3.5 rounded-2xl active:scale-[0.98] transition-all relative overflow-hidden cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', minHeight: 80 }}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-r-full ${item.type === 'sell' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        <div className="pl-3">
          <div className="flex items-center justify-between mb-1.5 overflow-hidden gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden flex-wrap">
              <span className="text-[9px] font-bold text-slate-400 flex-shrink-0">{toDateString(item.date)}</span>
              {(item.prefixed_id || item.invoice_no) && (
                <span className="text-[9px] font-mono font-bold text-slate-400 px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1">
                  #{item.prefixed_id || item.invoice_no}
                  {discount > 0 && <BadgePercent size={9} className="text-orange-500" />}
                </span>
              )}
              {gstEnabled && (
                totalGstPercent > 0 ? (
                  <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-[rgba(59,130,246,0.15)] text-blue-400">GST {Math.round(totalGstPercent)}%</span>
                ) : (
                  <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-[rgba(255,255,255,0.05)] text-[rgba(148,163,184,0.35)]">Non-GST</span>
                )
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <StatusTag status={paymentStatus} />
              <span style={item.type === 'sell' ? { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' } : { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }} className="text-[9px] font-black uppercase flex-shrink-0 px-2 py-0.5 rounded-full">
                {item.type === 'sell' ? 'Sale' : 'Purchase'}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center mb-1 overflow-hidden gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="font-bold text-sm truncate text-[rgba(240,244,255,0.9)]">{item.party_name}</div>
              {gstEnabled && partyMatch?.gstin && (
                <div className="text-[9px] font-mono text-blue-400 truncate min-w-0">GSTIN: {partyMatch.gstin}</div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-black text-base tabular-nums whitespace-nowrap" style={{ color: item.type === 'sell' ? 'rgba(52,211,153,0.9)' : 'rgba(248,113,113,0.9)' }}>
                ₹{Math.round(itemTotal).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-[rgba(148,163,184,0.55)] flex items-center gap-1.5 mb-1 overflow-hidden">
            <Package size={12} className="shrink-0 opacity-50" />
            <span className="truncate min-w-0">{getItemSummary(item.items)}</span>
          </div>

          {/* Payment status row */}
          <div className="flex items-center gap-2 mt-1.5">
            {paidAmount > 0 && (
              <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: '#34d399' }}>
                <IndianRupee size={9} />Paid: ₹{Math.round(paidAmount).toLocaleString('en-IN')}
              </span>
            )}
            {pendingAmount > 0 && (
              <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: '#fbbf24' }}>
                <IndianRupee size={9} />Pending: ₹{Math.round(pendingAmount).toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {rent > 0 && (
            <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-orange-500 mt-1 border-t border-dashed border-[rgba(255,255,255,0.07)] pt-1">
              <Truck size={10} />
              <span className="whitespace-nowrap">Rent: ₹{Math.round(rent).toLocaleString('en-IN')}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-orange-500 mt-1">
              <BadgePercent size={10} />
              <span className="whitespace-nowrap">Discount: -₹{Math.round(discount).toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-white/08 flex justify-end gap-2">
          <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1 text-[10px] font-bold active:scale-95 transition-all"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Edit2 size={11} /> Edit
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id, e); }}
            className="p-1.5 rounded-lg active:scale-95 transition-all"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  }, [handleEdit, handleDelete, parties, settings, paymentStatusMap]);

  if (selectedDetail) {
    return (
      <LedgerEntryDetailView
        entry={selectedDetail}
        settings={settings}
        parties={parties}
        onBack={() => setSelectedDetail(null)}
        onEdit={(item) => { setSelectedDetail(null); handleEdit(item); }}
      />
    );
  }

  return (
    <>
      <div className="h-full flex flex-col" style={{ background: '#0b0e1a' }}>
        {showExportModal && (
          <ExportFormatModal onSelect={handleExportFormat} onClose={() => setShowExportModal(false)} />
        )}

        {/* STICKY HEADER */}
        <div className="sticky top-0 z-30 px-4 pb-3" style={{ background: 'rgba(11,14,26,0.93)', backdropFilter: 'blur(20px)', boxShadow: '0 1px 0 rgba(255,255,255,0.05)', paddingTop: 'max(16px, calc(env(safe-area-inset-top, 0px) + 8px))' }}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <button onClick={onBack} className="p-2 rounded-2xl active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.7)' }}>
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-xl font-black leading-none tracking-tight">{title}</h1>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[rgba(148,163,184,0.45)]">{filtered.length} entries</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={cycleFilter} className="p-2.5 rounded-2xl active:scale-95 transition-all" style={currentFilter !== 'all' ? { background: 'rgba(139,92,246,0.25)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' } : { background: 'rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Filter size={16} />
              </button>
              <button onClick={() => setShowExportModal(true)} className="p-2.5 rounded-2xl active:scale-95 transition-all glass-icon-btn text-emerald-400">
                <Download size={16} />
              </button>
              <button onClick={handleAdd} className="bg-primary text-primary-foreground p-2.5 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all">
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* VIRTUALIZED LIST */}
        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="px-3 md:px-6 pt-3">
              <LedgerSkeleton count={5} />
            </div>
          ) : (
            <Virtuoso
              style={{ height: '100%' }}
              data={enrichedFiltered}
              overscan={300}
              components={{
                Header: () => (
                  <div className="px-3 md:px-6 pt-3">
                    {/* TOTAL SUMMARY CARD */}
                    <div className="text-white p-4 rounded-3xl mb-3 relative overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 8px 32px rgba(79,70,229,0.4)', border: '1px solid rgba(167,139,250,0.3)' }}>
                      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, white 0%, transparent 60%)' }} />
                      <div className="relative z-10 flex justify-between items-start">
                        <div>
                          <div className="text-[9px] font-bold opacity-70 uppercase tracking-widest mb-1">Net Volume (Excl. Rent)</div>
                          <div className="text-2xl font-black leading-none mb-2 tabular-nums">₹{Math.round(itemVolume).toLocaleString('en-IN')}</div>
                          {rentVolume > 0 && (
                            <div className="flex items-center gap-1.5 text-orange-300 px-2.5 py-1 rounded-full w-fit bg-white/10 mb-2">
                              <Truck size={11} /><span className="text-[10px] font-bold">Rent: ₹{Math.round(rentVolume).toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          <div className="flex gap-2 mt-1">
                            <div className="px-2.5 py-1 rounded-full bg-white/10 flex items-center gap-1.5">
                              <CheckCircle2 size={10} className="text-emerald-300" />
                              <span className="text-[10px] font-bold text-emerald-200">Paid: ₹{Math.round(totalPaid).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="px-2.5 py-1 rounded-full bg-white/10 flex items-center gap-1.5">
                              <AlertCircle size={10} className="text-amber-300" />
                              <span className="text-[10px] font-bold text-amber-200">Pending: ₹{Math.round(totalPending).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white/15 p-3 rounded-2xl relative z-10 flex-shrink-0"><BarChart3 size={22} className="text-white" /></div>
                      </div>
                    </div>
                    {/* SEARCH */}
                    <div className="p-3 rounded-3xl border border-white/10 mb-3 space-y-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
                          <input
                            className="w-full pl-8 p-2 border border-white/12 rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder={currentFilter === 'sell' ? 'Search Customer...' : currentFilter === 'purchase' ? 'Search Supplier...' : 'Search Party...'}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            list="ledger-search-suggestions"
                          />
                          <datalist id="ledger-search-suggestions">{searchSuggestions.map((name, i) => <option key={i} value={name} />)}</datalist>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center p-2 rounded-2xl border border-white/08">
                        <Calendar size={13} className="text-slate-400 ml-1 flex-shrink-0" />
                        <input type="date" className="flex-1 bg-transparent text-[10px] font-semibold outline-none text-[rgba(203,213,225,0.7)]" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                        <span className="text-slate-300">—</span>
                        <input type="date" className="flex-1 bg-transparent text-[10px] font-semibold outline-none text-[rgba(203,213,225,0.7)] text-right" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
                      </div>
                    </div>
                    {enrichedFiltered.length === 0 && (
                      <div className="flex items-center justify-center py-16 text-slate-400">
                        <div className="text-center">
                          <FileText size={32} className="mx-auto mb-2 opacity-30" />
                          <div className="text-sm font-bold">No entries found</div>
                        </div>
                      </div>
                    )}
                  </div>
                ),
                Footer: () => <div className="h-24" />,
              }}
              itemContent={(_index, item) => (
                <div className="px-3 md:px-6 pb-1.5">
                  {renderLedgerCard(item)}
                </div>
              )}
            />
          )}
        </div>
      </div>

      <ManualEntryModal
        isOpen={showEntryModal}
        onClose={() => setShowEntryModal(false)}
        type={entryType}
        user={user}
        initialData={editData}
        appSettings={settings}
        onSuccess={() => refetch()}
      />
    </>
  );
};

export default LedgerView;
