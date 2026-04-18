import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { 
  Filter, Download, Calendar, ArrowUpRight, ArrowDownLeft, 
  Truck, Package, Banknote, FileText, ArrowLeft, TrendingUp, TrendingDown, BarChart3,
  Search, User as UserIcon, Tag, Layers, Briefcase
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { exportService } from '../../services/export';
import { exportServiceV2 } from '../../services/exportServiceV2';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/helpers';

interface ReportsViewProps {
  user: User;
  onBack: () => void;
}

const ReportsView: React.FC<ReportsViewProps> = ({ user, onBack }) => {
  const { showToast } = useUI();
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [mergedData, setMergedData] = useState<any[]>([]);
  const [partyList, setPartyList] = useState<string[]>([]);
  const [itemList, setItemList] = useState<string[]>([]);
  const [purposeList, setPurposeList] = useState<string[]>([]);

  // Filter State
  const [mainTab, setMainTab] = useState<'all' | 'orders' | 'transactions'>('all');
  const [subFilter, setSubFilter] = useState<string>('all'); 
  
  const [searchParty, setSearchParty] = useState('');
  const [searchSecondary, setSearchSecondary] = useState(''); // Acts as Item or Purpose search
  
  const [dateRange, setDateRange] = useState({
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
  });

  // Reset sub-filters and search when main tab changes
  useEffect(() => { 
      setSubFilter('all'); 
      setSearchSecondary(''); 
  }, [mainTab]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [ledgerSnap, transSnap, partiesSnap, invSnap, settingsSnap] = await Promise.all([
          ApiService.getAll(user.uid, 'ledger_entries'),
          ApiService.getAll(user.uid, 'transactions'),
          ApiService.getAll(user.uid, 'parties'),
          ApiService.getAll(user.uid, 'inventory'),
          ApiService.settings.get(user.uid)
        ]);

        const orders = ledgerSnap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id, ...data, docType: 'order',
                sortDate: data.date,
                rent: Number(data.vehicle_rent) || 0,
                itemTotal: (Number(data.total_amount) || 0) - (Number(data.vehicle_rent) || 0),
                itemNames: data.items?.map((i:any) => i.item_name.toLowerCase()).join(' ') || ''
            };
        });

        const transactions = transSnap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id, ...data, docType: 'transaction',
                sortDate: data.date,
                amount: Number(data.amount) || 0
            };
        });

        const all = [...orders, ...transactions].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
        setMergedData(all);

        setPartyList(partiesSnap.docs.map(d => d.data().name));
        setItemList(invSnap.docs.map(d => d.data().name));
        
        // Load Purposes
        if(settingsSnap && settingsSnap.custom_lists && settingsSnap.custom_lists.purposes) {
            setPurposeList(settingsSnap.custom_lists.purposes);
        }

      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    loadData();
  }, [user]);

  const filtered = useMemo(() => {
      return mergedData.filter(item => {
          const inDate = item.sortDate >= dateRange.start && item.sortDate <= dateRange.end;
          if (!inDate) return false;

          if (mainTab === 'orders' && item.docType !== 'order') return false;
          if (mainTab === 'transactions' && item.docType !== 'transaction') return false;

          if (subFilter !== 'all') {
              if (item.type !== subFilter) return false;
          }

          if (searchParty && !item.party_name?.toLowerCase().includes(searchParty.toLowerCase())) return false;

          // DYNAMIC SECONDARY SEARCH LOGIC
          if (searchSecondary) {
              const term = searchSecondary.toLowerCase();
              
              if (mainTab === 'transactions') {
                  // Search PURPOSE
                  if (item.docType === 'transaction') {
                      return item.payment_purpose?.toLowerCase().includes(term);
                  }
                  return false; // Orders don't match purpose search
              } else {
                  // Search ITEM (Default for 'all' and 'orders')
                  if (item.docType === 'order') {
                      return item.itemNames?.includes(term);
                  }
                  return false; // Transactions don't match item search
              }
          }

          return true;
      });
  }, [mergedData, dateRange, mainTab, subFilter, searchParty, searchSecondary]);

  const stats = useMemo(() => {
      return filtered.reduce((acc, item) => {
          if (item.docType === 'order') {
              acc.itemVolume += item.itemTotal;
              acc.rentVolume += item.rent;
          } else {
              if (item.type === 'received') acc.totalIn += item.amount;
              if (item.type === 'paid') acc.totalOut += item.amount;
          }
          return acc;
      }, { itemVolume: 0, rentVolume: 0, totalIn: 0, totalOut: 0 });
  }, [filtered]);

  const handleExport = async () => {
      if (filtered.length === 0) return showToast("No data", "error");

      // ── Flat-row export: orders expand into one row per line item ──
      const rows: string[][] = [];
      const header = ['Date', 'Invoice', 'Category', 'Type', 'Party', 'Item Name', 'Qty', 'Unit', 'Rate', 'GST%', 'Item Total', 'Rent', 'Grand Total', 'Purpose', 'Payment Mode', 'Notes'];
      rows.push(header);

      for (const f of filtered) {
          if (f.docType === 'order') {
              const items: any[] = Array.isArray(f.items) && f.items.length > 0 ? f.items : [null];
              const rent = Number(f.vehicle_rent) || 0;
              items.forEach((item, idx) => {
                  rows.push([
                      f.sortDate || '',
                      idx === 0 ? (f.invoice_no || f.prefixed_id || '-') : '',
                      idx === 0 ? 'Order' : '',
                      idx === 0 ? (f.type || '') : '',
                      idx === 0 ? (f.party_name || '-') : '',
                      item ? item.item_name : '-',
                      item ? String(item.quantity ?? '') : '',
                      item ? (item.unit || '') : '',
                      item ? String(item.rate ?? '') : '',
                      item ? String(item.gst_percent ?? '') : '',
                      item ? String(item.total ?? '') : '',
                      idx === 0 ? String(rent) : '',
                      idx === 0 ? String(f.itemTotal ?? '') : '',
                      idx === 0 ? (f.payment_purpose || '-') : '',
                      idx === 0 ? (f.payment_mode || '') : '',
                      idx === 0 ? (f.notes || '') : '',
                  ]);
              });
          } else {
              rows.push([
                  f.sortDate || '',
                  f.invoice_no || '-',
                  'Transaction',
                  f.type || '',
                  f.party_name || '-',
                  '-', '', '', '', '', '',
                  '',
                  String(f.amount ?? ''),
                  f.payment_purpose || '-',
                  f.payment_mode || '',
                  f.notes || '',
              ]);
          }
      }

      const csvContent = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      await exportService.shareOrDownload(csvContent, `Report_${mainTab}.csv`, 'text/csv');
      showToast("Report CSV Downloaded", "success");
  };

  const handlePdfExport = async () => {
      if (mergedData.length === 0) return showToast("No data for PDF", "error");
      try {
          const [lSnap, tSnap, eSnap, iSnap] = await Promise.all([
              ApiService.getAll(user.uid, 'ledger_entries'),
              ApiService.getAll(user.uid, 'transactions'),
              ApiService.getAll(user.uid, 'expenses'),
              ApiService.getAll(user.uid, 'inventory'),
          ]);
          const settings = await ApiService.settings.get(user.uid);
          await exportServiceV2.fullReportToPdf({
              ledger      : lSnap.docs.map(d => ({ id: d.id, ...d.data() })),
              transactions: tSnap.docs.map(d => ({ id: d.id, ...d.data() })),
              expenses    : eSnap.docs.map(d => ({ id: d.id, ...d.data() })),
              inventory   : iSnap.docs.map(d => ({ id: d.id, ...d.data() })),
              profile     : (settings as any)?.profile,
              dateRange,
          });
          showToast("Full Report PDF Generated!", "success");
      } catch (e) { showToast("PDF export failed", "error"); }
  };

  const getFilterIcon = (type: string) => {
      switch(type) {
          case 'all': return <Layers size={16}/>;
          case 'sell': return <TrendingUp size={16}/>;
          case 'purchase': return <TrendingDown size={16}/>;
          case 'received': return <ArrowDownLeft size={16}/>;
          case 'paid': return <ArrowUpRight size={16}/>;
          default: return <Filter size={16}/>;
      }
  };

  return (
    <div className="flex flex-col h-full px-3 pt-3 md:px-6" style={{background:"#0b0e1a"}}>
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 rounded-full active:scale-95 transition-all"><ArrowLeft size={20} /></button>
              <div>
                  <h1 className="text-xl font-black leading-none">Reports</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{filtered.length} Records</p>
              </div>
          </div>
          <div className="flex gap-2 items-center">
              {/* COMPACT ICON FILTERS */}
              {mainTab === 'orders' && (
                  <div className="flex rounded-xl p-1 gap-1 border border-white/10">
                      {['all', 'sell', 'purchase'].map(t => (
                          <button key={t} onClick={() => setSubFilter(t)} className={`p-2 rounded-md transition-all ${subFilter === t ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-slate-400 hover:text-slate-300'}`} title={t}>
                              {getFilterIcon(t)}
                          </button>
                      ))}
                  </div>
              )}
              {mainTab === 'transactions' && (
                  <div className="flex rounded-xl p-1 gap-1 border border-white/10">
                      {['all', 'received', 'paid'].map(t => (
                          <button key={t} onClick={() => setSubFilter(t)} className={`p-2 rounded-md transition-all ${subFilter === t ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-slate-400 hover:text-slate-300'}`} title={t}>
                              {getFilterIcon(t)}
                          </button>
                      ))}
                  </div>
              )}
              
              <button onClick={handleExport} title="Download CSV" className="p-2.5 rounded-xl active:scale-95 transition-all glass-icon-btn text-emerald-400"><Download size={18}/></button>
              <button onClick={handlePdfExport} title="Download Full PDF Report" className="p-2.5 rounded-xl active:scale-95 transition-all glass-icon-btn text-violet-400" style={{background:'rgba(139,92,246,0.14)', border:'1px solid rgba(139,92,246,0.25)'}}><FileText size={18}/></button>
          </div>
      </div>

      {/* SUMMARY CARD */}
      <div className="p-4 rounded-2xl shadow-lg mb-3 flex justify-between items-center relative overflow-hidden shrink-0" style={{background:"linear-gradient(135deg,rgba(79,70,229,0.85),rgba(99,102,241,0.7))"}}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)"}} />
           <div className="relative z-10">
               {mainTab === 'transactions' ? (
                   <>
                       <div className="text-[10px] font-bold opacity-70 uppercase mb-0.5">Net Cash Flow</div>
                       <div className="text-2xl font-black leading-none mb-1">{formatCurrency(stats.totalIn - stats.totalOut)}</div>
                       <div className="text-[10px] opacity-80"><span className="text-green-300">In: {formatCurrency(stats.totalIn)}</span> • <span className="text-red-300">Out: {formatCurrency(stats.totalOut)}</span></div>
                   </>
               ) : (
                   <>
                       <div className="text-[10px] font-bold opacity-70 uppercase mb-0.5">Item Volume (Excl. Rent)</div>
                       <div className="text-2xl font-black leading-none mb-2">{formatCurrency(stats.itemVolume)}</div>
                       {stats.rentVolume > 0 && (<div className="flex items-center gap-1.5 text-orange-300 bg-[rgba(255,255,255,0.06)]/10 px-2 py-1 rounded-lg w-fit"><Truck size={12} /><span className="text-[10px] font-bold uppercase">Rent: {formatCurrency(stats.rentVolume)}</span></div>)}
                   </>
               )}
           </div>
           <div className="bg-[rgba(255,255,255,0.06)]/10 p-3 rounded-full relative z-10"><BarChart3 size={24} className="text-white"/></div>
           <TrendingUp size={80} className="absolute -bottom-4 -right-4 text-white opacity-5 pointer-events-none"/>
       </div>

      {/* FILTERS & SEARCH */}
      <div className="p-2.5 rounded-xl mb-3 space-y-2 border border-white/08 bg-[rgba(255,255,255,0.04)]">
          {/* Main Tabs */}
          <div className="flex gap-2">
              {['all', 'orders', 'transactions'].map((t) => (
                  <button key={t} onClick={() => setMainTab(t as any)} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${mainTab === t ? 'bg-[rgba(139,92,246,0.25)] text-violet-300 border border-[rgba(139,92,246,0.35)]' : 'bg-[rgba(255,255,255,0.04)] text-[rgba(148,163,184,0.5)] hover:bg-[rgba(255,255,255,0.07)]'}`}>{t}</button>
              ))}
          </div>

          {/* Serial Search Bars */}
          <div className="flex gap-2">
              <div className="relative flex-1">
                  <UserIcon size={12} className="absolute left-2.5 top-2.5 text-slate-400"/>
                  <input className="w-full pl-7 p-2 border border-white/12 rounded-lg text-xs font-bold outline-none" placeholder="Search Party..." value={searchParty} onChange={e => setSearchParty(e.target.value)} list="party-list" />
                  <datalist id="party-list">{partyList.map((p, i) => <option key={i} value={p}/>)}</datalist>
              </div>
              
              {/* DYNAMIC SECOND INPUT: Item OR Purpose */}
              <div className="relative flex-1">
                  {mainTab === 'transactions' ? (
                       <>
                           <Briefcase size={12} className="absolute left-2.5 top-2.5 text-slate-400"/>
                           <input className="w-full pl-7 p-2 border border-white/12 rounded-lg text-xs font-bold outline-none" placeholder="Search Purpose..." value={searchSecondary} onChange={e => setSearchSecondary(e.target.value)} list="purpose-list" />
                           <datalist id="purpose-list">{purposeList.map((p, idx) => <option key={idx} value={p}/>)}</datalist>
                       </>
                  ) : (
                       <>
                           <Tag size={12} className="absolute left-2.5 top-2.5 text-slate-400"/>
                           <input className="w-full pl-7 p-2 border border-white/12 rounded-lg text-xs font-bold outline-none" placeholder="Search Item..." value={searchSecondary} onChange={e => setSearchSecondary(e.target.value)} list="item-list" />
                           <datalist id="item-list">{itemList.map((i, idx) => <option key={idx} value={i}/>)}</datalist>
                       </>
                  )}
              </div>
          </div>

          {/* Date Range */}
          <div className="flex gap-2 items-center p-1.5 rounded-lg border border-white/08">
              <Calendar size={14} className="text-slate-400 ml-1"/>
              <input type="date" className="flex-1 bg-transparent text-[10px] font-bold outline-none text-[rgba(203,213,225,0.7)]" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              <span className="text-slate-300">-</span>
              <input type="date" className="flex-1 bg-transparent text-[10px] font-bold outline-none text-[rgba(203,213,225,0.7)] text-right" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
          </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto pb-20 space-y-2">
          {loading ? <div className="text-center py-10 text-[rgba(148,163,184,0.45)] text-xs">Loading...</div> : filtered.map(item => {
              // --- ORDER ITEM ---
              if (item.docType === 'order') {
                  const isSell = item.type === 'sell';
                  return (
                      <div key={item.id} className="p-3 rounded-xl relative overflow-hidden bg-[rgba(255,255,255,0.05)] border border-white/08">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${isSell ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <div className="pl-2">
                              <div className="flex justify-between items-center mb-1">
                                  <span className="text-[9px] font-bold text-[rgba(148,163,184,0.45)]">{item.date} • #{item.invoice_no || '-'}</span>
                                  <span className={`text-[9px] font-black uppercase ${isSell ? 'text-green-600' : 'text-red-500'}`}>{isSell ? 'SALE' : 'PURCHASE'}</span>
                              </div>
                              <div className="flex justify-between items-center mb-2">
                                  <div className="font-bold text-sm truncate max-w-[65%] text-[rgba(240,244,255,0.9)]">{item.party_name}</div>
                                  <div className="font-black text-base ">{formatCurrency(item.itemTotal)}</div>
                              </div>
                              
                              {/* ITEM DETAILS */}
                              <div className="border-t border-dashed border-slate-200 border-white/10 pt-2 mt-2">
                                  {item.items && item.items.map((i:any, idx:number) => (
                                      <div key={idx} className="flex justify-between text-[10px] text-[rgba(148,163,184,0.6)] mb-0.5">
                                          <span className="font-medium">{i.item_name}</span>
                                          <span>{i.quantity} {i.unit} x ₹{i.rate}</span>
                                      </div>
                                  ))}
                                  {item.rent > 0 && (<div className="flex justify-end items-center gap-1 text-[10px] font-bold text-orange-500 mt-1"><Truck size={10}/> Rent: {formatCurrency(item.rent)}</div>)}
                              </div>
                          </div>
                      </div>
                  );
              } 
              // --- TRANSACTION ITEM ---
              else {
                  const isIn = item.type === 'received';
                  return (
                      <div key={item.id} className="p-3 rounded-xl relative overflow-hidden bg-[rgba(255,255,255,0.05)] border border-white/08">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${isIn ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
                          <div className="pl-2">
                              <div className="flex justify-between items-center mb-1">
                                  <span className="text-[9px] font-bold text-[rgba(148,163,184,0.45)]">{item.date}</span>
                                  <span className={`text-[9px] font-black uppercase ${isIn ? 'text-blue-600' : 'text-orange-500'}`}>{isIn ? 'RECEIVED' : 'PAID'}</span>
                              </div>
                              <div className="flex justify-between items-center mb-1">
                                  <div className="font-bold text-sm truncate max-w-[65%] text-[rgba(240,244,255,0.9)]">{item.party_name}</div>
                                  <div className={`font-black text-base ${isIn ? 'text-blue-600' : 'text-orange-500'}`}>{isIn ? '+' : '-'}{formatCurrency(item.amount)}</div>
                              </div>
                              {/* PURPOSE */}
                              {item.payment_purpose && (
                                  <div className="text-[10px] text-slate-500 italic border-t border-dashed border-[rgba(255,255,255,0.07)] pt-1 mt-1">
                                      Purpose: <span className="font-semibold not-italic">{item.payment_purpose}</span>
                                  </div>
                              )}
                          </div>
                      </div>
                  );
              }
          })}
          {filtered.length === 0 && <div className="text-center py-10 text-[rgba(148,163,184,0.45)]"><p className="text-xs">No entries found.</p></div>}
      </div>
    </div>
  );
};

export default ReportsView;






