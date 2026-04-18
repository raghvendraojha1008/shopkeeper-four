import React, { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import { 
  ArrowLeft, Phone, MapPin, Share2, 
  MessageCircle, FileText, Wallet, 
  ChevronDown, ChevronUp, AlertCircle, Calendar, Download, Edit2
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { exportService } from '../../services/export';
import { useUI } from '../../context/UIContext';
import { useData } from '../../context/DataContext';
import { calculateAccounting } from '../../utils/helpers'; 
import ManualEntryModal from '../modals/ManualEntryModal';

interface PartyDetailViewProps { 
    party: any; 
    user: User; 
    onBack: () => void;
    appSettings?: any;
}

// FIX (Issue #2): Handle Firestore Timestamp objects in date comparisons.
function parseRecordDate(raw: any): Date {
  if (!raw) return new Date(0);
  if (raw?.toDate) return raw.toDate();
  return new Date(raw);
}
function toDateString(raw: any): string {
  return parseRecordDate(raw).toISOString().split('T')[0];
}

// FIX (Issue #9): Normalise phone numbers before building WhatsApp URLs.
// Previous code hard-coded "91" prefix which doubled the country code for
// numbers already stored as "919876543210", producing "91919876543210".
function normalisePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (digits.length === 10) return '91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits; // Return as-is for international numbers
}

const PartyDetailView: React.FC<PartyDetailViewProps> = ({ party, user, onBack, appSettings = {} }) => {
  const { showToast } = useUI();
  const { useLedger, useTransactions } = useData();

  // Cached data from react-query (no manual fetch needed)
  const { data: allLedger, refetch: refetchLedger } = useLedger(user.uid);
  const { data: allTransactions, refetch: refetchTransactions } = useTransactions(user.uid);

  const [activeTab, setActiveTab] = useState<'all' | 'orders' | 'payments' | 'summary'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editType, setEditType] = useState<'sales' | 'purchases' | 'transactions'>('sales');

  // Default Date Range: empty (no date pre-selected)
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Pre-indexed lookup: O(1) per party instead of O(N) filter on every render
  const { timeline, stats } = useMemo(() => {
      const partyLedger = allLedger.filter((l: any) => l.party_name === party.name);
      const partyTrans = allTransactions.filter((t: any) => t.party_name === party.name);
      
      const combined = [
          ...partyLedger.map((i: any) => ({...i, docType: 'invoice'})),
          ...partyTrans.map((t: any) => ({...t, docType: 'payment'}))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
          timeline: combined,
          stats: calculateAccounting(partyLedger, partyTrans, party.role)
      };
  }, [allLedger, allTransactions, party.name, party.role]);

  // SMART FILTER: Combines Tab + Date Range
  const filteredList = useMemo(() => {
      let data = timeline;

      // 1. Filter by Tab
      if (activeTab === 'orders') data = data.filter(t => t.docType === 'invoice');
      if (activeTab === 'payments') data = data.filter(t => t.docType === 'payment');

      // 2. Filter by Date Range
      if (dateRange.start) data = data.filter(t => toDateString(t.date) >= dateRange.start);
      if (dateRange.end) data = data.filter(t => toDateString(t.date) <= dateRange.end);

      return data;
  }, [timeline, activeTab, dateRange]);

  // Item-wise summary from filtered invoices
  const itemSummary = useMemo(() => {
      const invoices = filteredList.filter((t: any) => t.docType === 'invoice');
      const map: Record<string, { name: string; unit: string; qty: number; amount: number }> = {};
      invoices.forEach((entry: any) => {
          (entry.items || []).forEach((it: any) => {
              const key = (it.item_name || '').toLowerCase();
              if (!map[key]) map[key] = { name: it.item_name, unit: it.unit || 'Pcs', qty: 0, amount: 0 };
              map[key].qty += Number(it.quantity) || 0;
              map[key].amount += Number(it.total) || (Number(it.quantity) * Number(it.rate)) || 0;
          });
      });
      return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [filteredList]);


  const handleExport = async () => {
      if (filteredList.length === 0) return showToast("No records to export", "error");

      // 1. Define Columns
      const headers = [
          'Date', 'Type', 'Ref No', 
          'Item Name', 'Quantity', 'Rate', 'Item Total', // Item specific columns
          'Order Total', 'Payment Mode', 'Notes', 'Transport'
      ];
      
      const rows: any[] = [];

      // 2. Build Rows (Flatten items)
      filteredList.forEach(t => {
          const isInv = t.docType === 'invoice';
          let typeLabel = '';
          if (isInv) typeLabel = t.type === 'sell' ? 'Sale Invoice' : 'Purchase Bill';
          else typeLabel = t.type === 'received' ? 'Payment Received' : 'Payment Paid';

          // Common data for the order/transaction
          const baseRow = {
              Date: t.date,
              Type: typeLabel,
              'Ref No': t.invoice_no || t.bill_no || t.transaction_id || '-',
              'Order Total': t.total_amount || t.amount || 0,
              'Notes': t.notes || '',
              'Transport': t.vehicle ? `${t.vehicle} (₹${t.vehicle_rent || 0})` : '-'
          };

          if (isInv && t.items && t.items.length > 0) {
              // FOR ORDERS: Create a row for EACH item
              t.items.forEach((item: any) => {
                  rows.push({
                      ...baseRow,
                      'Item Name': item.item_name,
                      'Quantity': item.quantity,
                      'Rate': item.rate,
                      'Item Total': item.total,
                      'Payment Mode': '-' 
                  });
              });
          } else {
              // FOR PAYMENTS (or empty orders): Single row
              rows.push({
                  ...baseRow,
                  'Item Name': isInv ? '(No Items)' : '-',
                  'Quantity': '-',
                  'Rate': '-',
                  'Item Total': '-',
                  'Payment Mode': isInv ? '-' : `${t.payment_mode} - ${t.payment_purpose || ''}`
              });
          }
      });

      const fileName = `${party.name}_Detailed_Report_${dateRange.start}_to_${dateRange.end}.csv`;
      await exportService.exportToCSV(rows, headers, fileName);
      showToast("Detailed Report Downloaded", "success");
  };

  const toggleExpand = (id: string) => {
      setExpandedId(expandedId === id ? null : id);
  };

  // Handle Edit Click
  const handleEditClick = (item: any, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingItem(item);
      
      if (item.docType === 'invoice') {
          setEditType(item.type === 'sell' ? 'sales' : 'purchases');
      } else {
          setEditType('transactions');
      }
      setShowEditModal(true);
  };

  // Refresh data after edit - just invalidate react-query cache
  const refreshData = () => {
      refetchLedger();
      refetchTransactions();
  };

  return (
    <div className="h-full flex flex-col animate-in slide-in-from-right duration-300" style={{background:"#0b0e1a"}}>
        
        {/* COMPACT HEADER */}
        <div className="border-b border-white/10 shrink-0 z-20" style={{background:"rgba(11,14,26,0.95)", backdropFilter:"blur(20px)"}}>
            {/* Top Bar */}
            <div className="flex items-center gap-3 p-3">
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-[rgba(255,255,255,0.1)] glass-icon-btn"><ArrowLeft size={20}/></button>
                <div className="flex-1 min-w-0">
                    <h2 className="font-black text-lg truncate leading-tight">{party.name}</h2>
                    <p className="text-[10px] font-bold uppercase tracking-wider">{party.role}</p>
                </div>
                <div className="flex gap-2">
                    <a href={`tel:${party.contact}`} className="p-2 text-green-400 rounded-lg border border-green-500/20 active:scale-95 transition-all"><Phone size={18}/></a>
                    <a href={`https://wa.me/${normalisePhone(party.contact || '')}`} className="p-2 text-green-400 rounded-lg border border-green-500/20 active:scale-95 transition-all"><MessageCircle size={18}/></a>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 divide-x divide-white/08 border-t border-white/08">
                <div className="p-2 text-center">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Total Bill</div>
                    <div className="text-sm font-black ">₹{stats.totalBilled.toLocaleString('en-IN')}</div>
                </div>
                <div className="p-2 text-center">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Received</div>
                    <div className="text-sm font-black text-green-600">₹{stats.totalPaid.toLocaleString('en-IN')}</div>
                </div>
                <div className={`p-2 text-center ${stats.balance > 0 ? 'bg-[rgba(16,185,129,0.06)]' : 'bg-[rgba(239,68,68,0.06)]'}`}>
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Balance</div>
                    <div className={`text-sm font-black ${stats.balance > 0 ? 'text-green-700' : 'text-red-600'}`}>
                        ₹{Math.abs(stats.balance).toLocaleString('en-IN')} {stats.balance > 0 ? 'Cr' : 'Dr'}
                    </div>
                </div>
            </div>
        </div>

        {/* INFO BAR */}
        {party.address && (
            <div className="bg-slate-100 bg-[#0f1524]/50 px-4 py-1.5 flex items-center gap-2 text-xs font-bold text-[rgba(148,163,184,0.45)] border-b border-white/08 shrink-0">
                <MapPin size={12}/> <span className="truncate">{party.address}</span>
            </div>
        )}

        {/* TABS & DATE FILTERS (Sticky) */}
        <div className="border-b border-white/10 sticky top-0 z-10 shrink-0">
            {/* Tabs */}
            <div className="flex">
                {['all', 'orders', 'payments', 'summary'].map(t => (
                    <button 
                        key={t}
                        onClick={() => setActiveTab(t as any)}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${activeTab === t ? 'border-violet-500 text-violet-300' : 'border-transparent text-[rgba(148,163,184,0.5)]'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>
            
            {/* Date Filter Bar */}
            <div className="flex items-center gap-2 p-2 border-t border-white/08 overflow-x-auto">
                <div className="flex items-center gap-2 border border-white/12 rounded-lg px-2 py-1.5">
                    <Calendar size={14} className="" style={{color:"rgba(148,163,184,0.45)"}}/>
                    <input 
                        type="date" 
                        value={dateRange.start}
                        onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
                        className="bg-transparent text-[10px] font-bold text-[rgba(226,232,240,0.88)] outline-none w-20"
                    />
                    <span className="text-slate-300">-</span>
                    <input 
                        type="date" 
                        value={dateRange.end}
                        onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
                        className="bg-transparent text-[10px] font-bold text-[rgba(226,232,240,0.88)] outline-none w-20"
                    />
                </div>
                <button 
                    onClick={handleExport}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold active:scale-95 transition-all ml-auto whitespace-nowrap bg-[rgba(139,92,246,0.25)] text-violet-300 border border-[rgba(139,92,246,0.3)]"
                >
                    <Download size={12}/> Detailed Export
                </button>
            </div>
        </div>

        {/* SCROLLABLE LIST */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {activeTab === 'summary' ? (
                /* SUMMARY TAB */
                itemSummary.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="p-4 rounded-full mb-3"><AlertCircle size={24}/></div>
                        <p className="text-xs font-bold">No items found for this period</p>
                    </div>
                ) : (
                    <>
                        {/* Summary Total */}
                        <div className="p-3 rounded-xl border border-violet-500/20 bg-[rgba(139,92,246,0.08)]">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold uppercase text-slate-400">Total Items: {itemSummary.length}</span>
                                <span className="font-black text-sm text-violet-300">
                                    ₹{itemSummary.reduce((s, i) => s + i.amount, 0).toLocaleString('en-IN')}
                                </span>
                            </div>
                        </div>

                        {/* Item-wise Table Header */}
                        <div className="flex justify-between text-[9px] font-bold uppercase text-slate-400 px-3">
                            <span className="flex-1">Item</span>
                            <span className="w-20 text-center">Qty</span>
                            <span className="w-24 text-right">Amount</span>
                        </div>

                        {itemSummary.map((it, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-[rgba(255,255,255,0.05)] border border-white/08 flex justify-between items-center">
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm truncate">{it.name}</div>
                                </div>
                                <div className="w-20 text-center">
                                    <span className="text-xs font-bold text-slate-300">{Math.round(it.qty)}</span>
                                    <span className="text-[10px] text-slate-500 ml-1">{it.unit}</span>
                                </div>
                                <div className="w-24 text-right font-black text-sm">
                                    ₹{Math.round(it.amount).toLocaleString('en-IN')}
                                </div>
                            </div>
                        ))}
                    </>
                )
            ) : (
                /* EXISTING LIST VIEW */
                <>
                {filteredList.map((item: any) => {
                const isInv = item.docType === 'invoice';
                const isExpanded = expandedId === item.id;
                
                return (
                    <div key={item.id} onClick={() => toggleExpand(item.id)} className="rounded-xl active:scale-[0.99] transition-transform overflow-hidden bg-[rgba(255,255,255,0.05)] border border-white/08">
                        <div className="p-3 flex justify-between items-start">
                            <div className="flex gap-3">
                                <div className={`p-2.5 rounded-xl flex items-center justify-center h-10 w-10 shrink-0 ${isInv ? "text-blue-400 border border-blue-500/20" : "text-green-400 border border-green-500/20"}`}>
                                    {isInv ? <FileText size={18}/> : <Wallet size={18}/>}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm ">
                                            {isInv ? (item.type === 'sell' ? 'Sale Invoice' : 'Purchase Bill') : (item.type === 'received' ? 'Payment Rec.' : 'Payment Paid')}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 rounded">
                                            #{item.invoice_no || item.bill_no || item.transaction_id?.slice(-8) || 'N/A'}
                                        </span>
                                    </div>
                                    <div className="text-xs font-medium mt-0.5 text-[rgba(148,163,184,0.45)]">
                                        {item.date} • {isInv ? `${(item.items || []).length} Items` : item.payment_mode}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right flex items-start gap-2">
                                <div>
                                    <div className={`font-black text-sm ${isInv ? 'text-[rgba(240,244,255,0.95)]' : 'text-green-600'}`}>
                                        {isInv ? '' : '- '}₹{(item.total_amount || item.amount || 0).toLocaleString('en-IN')}
                                    </div>
                                    <div className="mt-1 text-[rgba(148,163,184,0.3)]">
                                        {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                    </div>
                                </div>
                                <button 
                                    onClick={(e) => handleEditClick(item, e)}
                                    className="p-2 rounded-lg transition-colors glass-icon-btn text-violet-400"
                                    title="Edit"
                                >
                                    <Edit2 size={14}/>
                                </button>
                            </div>
                        </div>

                        {/* EXPANDED DETAILS */}
                        {isExpanded && (
                            <div className="p-3 border-t border-white/08 text-xs animate-in slide-in-from-top-2">
                                {isInv ? (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-slate-400 font-bold uppercase text-[9px] mb-1">
                                            <span>Item</span><span>Qty x Rate</span><span>Total</span>
                                        </div>
                                        {(item.items || []).map((it:any, idx:number) => (
                                            <div key={idx} className="flex justify-between border-b border-dashed border-slate-200 border-white/08 pb-1 mb-1 last:border-0">
                                                <span className="font-bold text-[rgba(203,213,225,0.75)]">{it.item_name}</span>
                                                <span className="" style={{color:"rgba(148,163,184,0.5)"}}>{it.quantity} x {it.rate}</span>
                                                <span className="font-bold">₹{it.total}</span>
                                            </div>
                                        ))}
                                        {item.vehicle && <div className="mt-2 pt-2 border-t border-white/08 text-slate-500 flex gap-2"><span className="font-bold">Transport:</span> {item.vehicle} (₹{item.vehicle_rent})</div>}
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <div className="flex gap-2"><span className="font-bold text-[rgba(148,163,184,0.45)]">Purpose:</span> <span>{item.payment_purpose || '-'}</span></div>
                                        <div className="flex gap-2"><span className="font-bold text-[rgba(148,163,184,0.45)]">Note:</span> <span>{item.notes || '-'}</span></div>
                                        {item.bill_no && <div className="flex gap-2"><span className="font-bold text-[rgba(148,163,184,0.45)]">Ref Bill:</span> <span className="bg-[rgba(245,158,11,0.18)] text-amber-300 px-1 rounded">{item.bill_no}</span></div>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
            
            {filteredList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                    <div className="p-4 rounded-full mb-3"><AlertCircle size={24}/></div>
                    <p className="text-xs font-bold">No records found for this period</p>
                </div>
            )}
                </>
            )}
        </div>

        {/* Edit Modal */}
        <ManualEntryModal 
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            type={editType}
            user={user}
            initialData={editingItem}
            appSettings={appSettings}
            onSuccess={() => { 
                refreshData(); 
                setShowEditModal(false);
                showToast('Updated successfully', 'success');
            }}
        />
    </div>
  );
};

export default PartyDetailView;





