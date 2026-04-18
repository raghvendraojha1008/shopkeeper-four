import React, { useState, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  Search, FileText, Edit2, Trash2, Filter, Download, Plus,
  ArrowUpRight, ArrowDownLeft, Banknote, Calendar, ArrowLeft,
  TrendingUp, BarChart3
} from 'lucide-react';
import { TrashService } from '../../services/trash';
import { exportService } from '../../services/export';
import { fmtINR } from '../../utils/gstUtils';
import { useUI } from '../../context/UIContext';
import { useData } from '../../context/DataContext';
import { useRole } from '../../context/RoleContext';
import { useSoftDelete } from '../common/UndoSnackbar';
import { formatCurrency } from '../../utils/helpers';
import ManualEntryModal from '../modals/ManualEntryModal';
import { TransactionsSkeleton } from '../common/Skeleton';
import ExportFormatModal from '../common/ExportFormatModal';
import TransactionDetailView from './TransactionDetailView';

// FIX: shared date parser — handles both Firestore Timestamps and YYYY-MM-DD strings.
function parseRecordDate(raw: any): Date {
  if (!raw) return new Date(0);
  if (raw?.toDate) return raw.toDate();
  const s = String(raw);
  return new Date(s.includes('T') ? s : s + 'T00:00:00');
}

function toDateString(raw: any): string {
  return parseRecordDate(raw).toISOString().split('T')[0];
}

interface TransactionsViewProps {
  user: User;
  onBack: () => void;
  appSettings?: any;
}

const TransactionsView: React.FC<TransactionsViewProps> = ({ user, onBack, appSettings }) => {
  const { confirm, showToast } = useUI();
  const { useTransactions, useParties } = useData();
  const { isStaff } = useRole();

  const { data: transactions, isLoading: loading, refetch, setData } = useTransactions(user.uid);
  const { data: parties } = useParties(user.uid);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentFilter, setCurrentFilter] = useState<'all' | 'received' | 'paid'>('all');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editData, setEditData] = useState<any | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const { scheduleDelete } = useSoftDelete();

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = transactions.find(t => t.id === id);
    if (!item) return;
    scheduleDelete({
      id,
      collection: 'transactions',
      itemName: item.party_name || 'Transaction',
      onOptimistic: () => setData(old => old.filter(i => i.id !== id)),
      onRestore: () => setData(old => [...old, item].sort((a, b) => parseRecordDate(b.date).getTime() - parseRecordDate(a.date).getTime())),
      onCommit: async () => { await TrashService.moveToTrash(user.uid, 'transactions', id); },
    });
  }, [transactions, user.uid, scheduleDelete, setData]);

  const handleAdd  = useCallback(() => { setEditData(null);   setShowEntryModal(true); }, []);
  const handleEdit = useCallback((item: any) => { setEditData(item); setShowEntryModal(true); }, []);

  const cycleFilter = () => {
    if (currentFilter === 'all') setCurrentFilter('received');
    else if (currentFilter === 'received') setCurrentFilter('paid');
    else setCurrentFilter('all');
  };

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch =
        t.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.bill_no?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = currentFilter === 'all' ? true : t.type === currentFilter;
      // FIX: use toDateString (which calls parseRecordDate) so Timestamp values
      // are normalised before string comparison.
      const recordDate = toDateString(t.date);
      const matchesDate = recordDate >= dateRange.start && recordDate <= dateRange.end;
      return matchesSearch && matchesType && matchesDate;
    });
  }, [transactions, searchTerm, currentFilter, dateRange]);

  const stats = useMemo(() => {
    return filtered.reduce(
      (acc, t) => {
        if (t.type === 'received') acc.in  += Number(t.amount);
        else                        acc.out += Number(t.amount);
        return acc;
      },
      { in: 0, out: 0 },
    );
  }, [filtered]);

  const searchSuggestions = useMemo(() => {
    return parties
      .filter(p => {
        if (currentFilter === 'received') return p.role === 'customer';
        if (currentFilter === 'paid')     return p.role === 'supplier';
        return true;
      })
      .map(p => p.name);
  }, [parties, currentFilter]);

  const handleExportFormat = async (format: 'pdf' | 'excel') => {
    setShowExportModal(false);
    if (filtered.length === 0) return showToast('No data to export', 'error');

    if (format === 'excel') {
      const rows: any[][] = [
        [appSettings?.profile?.firm_name || 'Business'],
        ['TRANSACTIONS REPORT'],
        ['Period:', `${dateRange.start} to ${dateRange.end}`],
        [],
        ['Date', 'Type', 'Party', 'Amount', 'Mode', 'Bill Ref', 'Txn ID', 'Notes'],
        ...filtered.map(t => [
          toDateString(t.date),
          t.type === 'received' ? 'Received' : 'Paid',
          t.party_name,
          t.amount,
          t.payment_mode || '-',
          t.bill_no || '-',
          t.transaction_id || '-',
          t.notes || '-',
        ]),
        [],
        ['Total In (Received)', stats.in.toFixed(2)],
        ['Total Out (Paid)',    stats.out.toFixed(2)],
        ['Net Flow',           (stats.in - stats.out).toFixed(2)],
      ];
      const csv = rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
      await exportService.shareOrDownload(csv, `Transactions_${currentFilter}.csv`, 'text/csv');
      showToast('Excel Downloaded', 'success');
    } else {
      try {
        const { jsPDF } = await import('jspdf');
        const atMod = await import('jspdf-autotable');
        const autoTable = (atMod as any).default || atMod;
        const doc = new jsPDF();
        const PW = doc.internal.pageSize.width;
        const m = 14;

        doc.setFillColor(79, 70, 229); doc.rect(0, 0, PW, 22, 'F');
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text('TRANSACTIONS REPORT', PW / 2, 14, { align: 'center' });

        doc.setTextColor(30, 40, 60); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text(appSettings?.profile?.firm_name || 'Business', m, 32);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
        doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, m, 39);

        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 163, 74);
        doc.text(`Received: ${fmtINR(stats.in)}`,  PW - m - 60, 32);
        doc.setTextColor(220, 38, 38);
        doc.text(`Paid: ${fmtINR(stats.out)}`, PW - m - 60, 39);

        autoTable(doc, {
          startY: 44, margin: { left: m, right: m },
          head: [['Date', 'Type', 'Party', 'Mode', 'Ref', 'Amount']],
          body: filtered.map(t => [
            toDateString(t.date),
            t.type === 'received' ? 'Received' : 'Paid',
            t.party_name,
            t.payment_mode || 'Cash',
            t.bill_no || '-',
            `${t.type === 'received' ? '+' : '-'}${fmtINR(Number(t.amount))}`,
          ]),
          headStyles: { fillColor: [79, 70, 229], fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 1) {
              data.cell.styles.textColor = data.cell.text[0] === 'Received' ? [22, 163, 74] : [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          },
        });

        const b64 = doc.output('datauristring').split(',')[1];
        await exportService.saveBase64File(b64, `Transactions_${currentFilter}.pdf`);
        showToast('PDF Downloaded', 'success');
      } catch { showToast('Export failed', 'error'); }
    }
  };

  const title = currentFilter === 'all' ? 'Transactions' : (currentFilter === 'received' ? 'Received' : 'Paid');

  if (selectedDetail) {
    return (
      <TransactionDetailView
        transaction={selectedDetail}
        settings={appSettings || {}}
        onBack={() => setSelectedDetail(null)}
        onEdit={(item) => { setSelectedDetail(null); handleEdit(item); }}
      />
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto" style={{ background: '#0b0e1a' }}>
        {showExportModal && (
          <ExportFormatModal onSelect={handleExportFormat} onClose={() => setShowExportModal(false)} />
        )}

        {/* STICKY HEADER */}
        <div className="sticky top-0 z-30 px-3 pb-2 md:px-6" style={{ background: 'rgba(11,14,26,0.92)', backdropFilter: 'blur(20px)', paddingTop: 'max(12px, calc(env(safe-area-inset-top, 0px) + 6px))' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 rounded-full active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.7)' }}>
                <ArrowLeft size={16} />
              </button>
              <div>
                <h1 className="text-xl font-black leading-none">{title}</h1>
                <p className="text-[10px] font-bold uppercase text-[rgba(148,163,184,0.45)]">{filtered.length} Entries</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={cycleFilter} className={`p-2 rounded-xl shadow-sm active:scale-95 transition-all border ${currentFilter !== 'all' ? 'bg-[rgba(139,92,246,0.25)] text-violet-300 border-[rgba(139,92,246,0.3)]' : 'bg-[rgba(255,255,255,0.06)] text-[rgba(148,163,184,0.45)] border-[rgba(255,255,255,0.08)]'}`}>
                <Filter size={16} />
              </button>
              <button onClick={() => setShowExportModal(true)} className="p-2 rounded-xl active:scale-95 transition-all" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Download size={16} />
              </button>
              <button onClick={handleAdd} className="text-white p-2 rounded-xl shadow-lg active:scale-95 bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] transition-all">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="px-3 md:px-6">
          {/* TOTAL SUMMARY CARD */}
          <div className="p-3 rounded-2xl shadow-lg mb-3 flex justify-between items-center relative overflow-hidden border border-[rgba(79,70,229,0.3)]" style={{ background: 'rgba(79,70,229,0.15)', backdropFilter: 'blur(20px)' }}>
            <div className="relative z-10">
              <div className="text-[10px] font-bold opacity-70 uppercase mb-0.5">Net Cash Flow</div>
              <div className="text-xl font-black leading-none mb-2">{formatCurrency(stats.in - stats.out)}</div>
              <div className="flex gap-2 text-[10px] font-bold">
                <span className="text-green-300 flex items-center gap-1"><ArrowDownLeft size={10} /> In: {formatCurrency(stats.in)}</span>
                <span className="text-orange-300 flex items-center gap-1"><ArrowUpRight size={10} /> Out: {formatCurrency(stats.out)}</span>
              </div>
            </div>
            <div className="bg-[rgba(255,255,255,0.06)]/10 p-2 rounded-full relative z-10">
              <BarChart3 size={24} className="text-white" />
            </div>
            <TrendingUp size={80} className="absolute -bottom-4 -right-4 text-white opacity-5 pointer-events-none" />
          </div>

          {/* SEARCH & DATE */}
          <div className="p-2.5 rounded-xl mb-3 space-y-2 border border-white/08" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <input
                  className="w-full pl-8 p-2 border border-white/12 rounded-lg text-xs font-bold outline-none"
                  placeholder={currentFilter === 'received' ? 'Search Customer...' : (currentFilter === 'paid' ? 'Search Supplier...' : 'Search Party...')}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  list="trans-search-suggestions"
                />
                <datalist id="trans-search-suggestions">
                  {searchSuggestions.map((name, i) => <option key={i} value={name} />)}
                </datalist>
              </div>
            </div>
            <div className="flex gap-2 items-center p-1.5 rounded-lg border border-white/08">
              <Calendar size={14} className="text-slate-400 ml-1" />
              <input type="date" className="flex-1 bg-transparent text-[10px] font-bold outline-none text-[rgba(203,213,225,0.7)]" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
              <span className="text-slate-300">-</span>
              <input type="date" className="flex-1 bg-transparent text-[10px] font-bold outline-none text-[rgba(203,213,225,0.7)] text-right" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
            </div>
          </div>

          <div className="pb-20 space-y-2">
            {loading ? (
              <TransactionsSkeleton count={6} />
            ) : filtered.map(item => {
              const isReceived = item.type === 'received';
              return (
                <div key={item.id}
                  onClick={() => setSelectedDetail(item)}
                  className="p-2 rounded-xl active:scale-[0.98] transition-all relative overflow-hidden cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', backdropFilter: 'blur(16px)' }}>
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r-full ${isReceived ? 'bg-blue-500' : 'bg-orange-500'}`} />
                  <div className="pl-2">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[rgba(148,163,184,0.45)]">{toDateString(item.date)}</span>
                        {item.bill_no && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-[rgba(148,163,184,0.4)]">Ref: {item.bill_no}</span>
                        )}
                      </div>
                      <span style={isReceived ? { color: '#60a5fa' } : { color: '#fbbf24' }} className="text-[9px] font-black uppercase">
                        {isReceived ? '↓ RECEIVED' : '↑ PAID'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-1">
                      <div className="font-bold text-sm truncate max-w-[65%] text-[rgba(240,244,255,0.9)]">{item.party_name}</div>
                      <div style={isReceived ? { color: '#93c5fd' } : { color: '#fcd34d' }} className="font-black text-base">
                        {isReceived ? '+' : '-'}₹{Number(item.amount).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="text-[10px] flex items-center gap-1.5 text-[rgba(148,163,184,0.45)]">
                      <Banknote size={12} className="shrink-0" />
                      <span>{item.payment_mode}</span>
                      {item.notes && <span className="truncate max-w-[150px]">• {item.notes}</span>}
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/08 flex justify-end gap-2">
                    {!isStaff && (
                      <button onClick={(e) => handleDelete(item.id, e)} className="p-1.5 rounded-lg bg-[rgba(239,68,68,0.12)] text-red-400">
                        <Trash2 size={12} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedDetail(item); }}
                      className="px-3 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold bg-[rgba(255,255,255,0.07)] text-[rgba(203,213,225,0.65)]">
                      <FileText size={12} /> View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ManualEntryModal
        isOpen={showEntryModal}
        onClose={() => setShowEntryModal(false)}
        type="transactions"
        user={user}
        initialData={editData}
        appSettings={appSettings || {}}
        onSuccess={() => refetch()}
      />
    </>
  );
};

export default TransactionsView;

