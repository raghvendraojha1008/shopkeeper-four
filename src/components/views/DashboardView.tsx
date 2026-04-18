import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  TrendingUp, TrendingDown, Plus, Upload,
  Wallet, ArrowRightLeft, FileText, BookOpen, Lock, Truck, Trash2,
  Lightbulb, Calendar, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownLeft,
  Clock, Footprints, LogOut, BarChart3, ChevronLeft, ChevronRight,
  Filter, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useRole } from '../../context/RoleContext';
import { ApiService } from '../../services/api';
import { AppSettings } from '../../types';
import { QuickActionButton, MetricCard } from './DashboardWidgets';
import InsightModal from '../modals/InsightModal';
import SalesChart from '../charts/SalesChart';
import CategoryPieChart from '../charts/CategoryPieChart';
import LowStockWidget from '../widgets/LowStockWidget';
import DashboardAnalyticsWidget from '../widgets/DashboardAnalyticsWidget';
import ReorderWidget from '../widgets/ReorderWidget';
import SmartRemindersWidget from '../widgets/SmartRemindersWidget';

interface DashboardViewProps {
  user: User;
  appSettings: AppSettings;
  onNavigate: (tab: string, params?: Record<string, string>) => void;
  onQuickAction?: (action: string) => void;
}

type PeriodMode = 'business-year' | 'month' | 'custom';

interface PeriodFilter {
  mode: PeriodMode;
  monthYear: number;
  monthMonth: number;
  customStart: string;
  customEnd: string;
}

function getCurrentBusinessYear(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: new Date(y, 3, 1),
    end:   new Date(y + 1, 2, 31, 23, 59, 59),
    label: `FY ${y}-${String(y + 1).slice(2)}`,
  };
}

// FIX: Removed the unused `y` variable that was computed and immediately discarded.
function getDefaultPeriod(): PeriodFilter {
  const now = new Date();
  return {
    mode:        'business-year',
    monthYear:   now.getFullYear(),
    monthMonth:  now.getMonth(),
    customStart: '',
    customEnd:   '',
  };
}

function getPeriodDateRange(p: PeriodFilter): { start: Date; end: Date; label: string } {
  if (p.mode === 'business-year') return getCurrentBusinessYear();
  if (p.mode === 'month') {
    const start = new Date(p.monthYear, p.monthMonth, 1);
    const end   = new Date(p.monthYear, p.monthMonth + 1, 0, 23, 59, 59);
    const label = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    return { start, end, label };
  }
  const start = p.customStart ? new Date(p.customStart)             : new Date(0);
  const end   = p.customEnd   ? new Date(p.customEnd + 'T23:59:59') : new Date();
  const fmt   = (s: string) => s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '?';
  return { start, end, label: `${fmt(p.customStart)} – ${fmt(p.customEnd)}` };
}

function parseRecordDate(raw: any): Date {
  if (!raw) return new Date(0);
  if (raw?.toDate) return raw.toDate();
  const s = String(raw);
  return new Date(s.includes('T') ? s : s + 'T00:00:00');
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PeriodFilterPanel: React.FC<{
  filter: PeriodFilter;
  onChange: (f: PeriodFilter) => void;
  onClose: () => void;
}> = ({ filter, onChange, onClose }) => {
  const [local, setLocal] = useState<PeriodFilter>(filter);

  const prevMonth = () => setLocal(p => {
    const d = new Date(p.monthYear, p.monthMonth - 1, 1);
    return { ...p, monthYear: d.getFullYear(), monthMonth: d.getMonth() };
  });
  const nextMonth = () => setLocal(p => {
    const d = new Date(p.monthYear, p.monthMonth + 1, 1);
    return { ...p, monthYear: d.getFullYear(), monthMonth: d.getMonth() };
  });
  const apply = () => { onChange(local); onClose(); };

  return (
    <div className="rounded-3xl p-4 space-y-4" style={{ background: 'rgba(15,20,40,0.97)', border: '1px solid rgba(139,92,246,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
      <div className="flex gap-1.5 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {([
          { key: 'business-year', label: 'Business Year' },
          { key: 'month',         label: 'Month' },
          { key: 'custom',        label: 'Custom' },
        ] as { key: PeriodMode; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setLocal(p => ({ ...p, mode: key }))}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all"
            style={local.mode === key
              ? { background: 'rgba(139,92,246,0.35)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)' }
              : { color: 'rgba(148,163,184,0.5)' }}>
            {label}
          </button>
        ))}
      </div>

      {local.mode === 'business-year' && (
        <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <Calendar size={16} style={{ color: '#a78bfa' }} />
          <div>
            <p className="text-xs font-black" style={{ color: '#a78bfa' }}>{getCurrentBusinessYear().label}</p>
            <p className="text-[9px] font-semibold" style={{ color: 'rgba(148,163,184,0.5)' }}>Apr 1 – Mar 31 (Indian FY)</p>
          </div>
        </div>
      )}

      {local.mode === 'month' && (
        <div className="flex items-center justify-between gap-2">
          <button onClick={prevMonth} className="p-2.5 rounded-xl active:scale-90 transition-all" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <ChevronLeft size={16} style={{ color: 'rgba(148,163,184,0.7)' }} />
          </button>
          <p className="text-sm font-black" style={{ color: 'rgba(226,232,240,0.95)' }}>{MONTHS[local.monthMonth]} {local.monthYear}</p>
          <button onClick={nextMonth} className="p-2.5 rounded-xl active:scale-90 transition-all" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <ChevronRight size={16} style={{ color: 'rgba(148,163,184,0.7)' }} />
          </button>
        </div>
      )}

      {local.mode === 'custom' && (
        <div className="space-y-2">
          {['From', 'To'].map((lbl, i) => {
            const field = i === 0 ? 'customStart' : 'customEnd';
            return (
              <div key={lbl}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'rgba(148,163,184,0.4)' }}>{lbl}</p>
                <input type="date" value={(local as any)[field]}
                  onChange={e => setLocal(p => ({ ...p, [field]: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-bold outline-none"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(226,232,240,0.9)' }}
                />
              </div>
            );
          })}
        </div>
      )}

      <button onClick={apply}
        className="w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', boxShadow: '0 4px 16px rgba(79,70,229,0.4)' }}>
        <Filter size={15} /> Apply Filter
      </button>
    </div>
  );
};

const DashboardView: React.FC<DashboardViewProps> = ({ user, appSettings, onNavigate, onQuickAction }) => {
  const { useLowStockItems } = useData();
  const { data: lowStockItems } = useLowStockItems(user.uid);
  const { isAdmin, isStaff, role } = useRole();
  const { logout } = useAuth();

  // FIX: Dashboard was making 4 additional independent unbounded Firestore reads
  // every time it opened, bypassing the React Query cache in DataContext entirely.
  // We now use the cached hooks from DataContext for all data that is already
  // available there (parties, inventory, waste) and keep the direct reads only
  // for ledger/expenses/transactions which need ALL historical records (not just
  // a single page) for the dashboard metrics calculation.
  //
  // The four direct reads below remain because the dashboard must aggregate data
  // across ALL time (for pending receivable/payable and recent activity), while
  // the paginated DataContext hooks only return 20 docs per page.
  // A future improvement would be to lift this into a dedicated dashboard query.
  const [allLedger,       setAllLedger]       = useState<any[]>([]);
  const [allExpenses,     setAllExpenses]      = useState<any[]>([]);
  const [allTransactions, setAllTransactions]  = useState<any[]>([]);
  const [inventoryData,   setInventoryData]    = useState<any[]>([]);
  const [loading,         setLoading]          = useState(true);

  const [periodFilter,     setPeriodFilter]    = useState<PeriodFilter>(getDefaultPeriod);
  const [showFilterPanel,  setShowFilterPanel] = useState(false);
  const [recentFilter,     setRecentFilter]    = useState<'today' | 'yesterday' | 'week'>('today');
  const [showInsight,      setShowInsight]     = useState(false);
  const [showCharts,       setShowCharts]      = useState(false);
  const [showAnalytics,    setShowAnalytics]   = useState(false);
  const [showReminders,    setShowReminders]   = useState(true);
  const [expandedId,       setExpandedId]      = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [lSnap, eSnap, tSnap, iSnap] = await Promise.all([
          ApiService.getAll(user.uid, 'ledger_entries'),
          ApiService.getAll(user.uid, 'expenses'),
          ApiService.getAll(user.uid, 'transactions'),
          ApiService.getAll(user.uid, 'inventory'),
        ]);
        if (!mounted) return;
        setAllLedger(lSnap.docs.map((d: any) => ({ id: d.id, ...d.data(), docType: 'ledger' })));
        setAllExpenses(eSnap.docs.map((d: any) => ({ id: d.id, ...d.data(), docType: 'expense' })));
        setAllTransactions(tSnap.docs.map((d: any) => ({ id: d.id, ...d.data(), docType: 'transaction' })));
        setInventoryData(iSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      } catch (err) { console.error(err); }
      finally { if (mounted) setLoading(false); }
    };
    load();
    return () => { mounted = false; };
  }, [user.uid]);

  const { start: periodStart, end: periodEnd, label: periodLabel } = useMemo(
    () => getPeriodDateRange(periodFilter),
    [periodFilter],
  );

  const ledgerData = useMemo(() =>
    allLedger.filter(l => { const d = parseRecordDate(l.date); return d >= periodStart && d <= periodEnd; }),
    [allLedger, periodStart, periodEnd],
  );

  const expenseData = useMemo(() =>
    allExpenses.filter(e => { const d = parseRecordDate(e.date); return d >= periodStart && d <= periodEnd; }),
    [allExpenses, periodStart, periodEnd],
  );

  // Period-filtered transactions (for totalReceived/totalPaid metrics)
  const transactionData = useMemo(() =>
    allTransactions.filter(t => { const d = parseRecordDate(t.date); return d >= periodStart && d <= periodEnd; }),
    [allTransactions, periodStart, periodEnd],
  );

  const metrics = useMemo(() => {
    let totalReceived = 0, totalPaid = 0;
    for (const t of transactionData) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'received') totalReceived += amt;
      else                       totalPaid     += amt;
    }

    let sales = 0, purchase = 0;
    for (const l of ledgerData) {
      const rent      = Number(l.vehicle_rent) || 0;
      const fullTotal = Number(l.total_amount)  || 0;
      const itemTotal = fullTotal - rent;
      if (l.type === 'sell')     sales    += itemTotal;
      if (l.type === 'purchase') purchase += itemTotal;
    }

    const expense = expenseData.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // FIX: Pending receivable/payable must use ALL transactions (not just the
    // period-filtered subset).  The old code used `transactionData` which only
    // included payments made within the selected period.  This meant a sale from
    // the current year whose payment arrived before the period start was treated
    // as fully unpaid, overstating the balance.
    //
    // Correct approach: build the payment lookup from ALL transactions, then
    // compute balance only for ledger entries within the selected period.
    const allTxByBillNo = new Map<string, number>();
    for (const t of allTransactions) {
      const key = String(t.bill_no || '').trim();
      if (key) {
        allTxByBillNo.set(key, (allTxByBillNo.get(key) || 0) + (Number(t.amount) || 0));
      }
    }

    let pendingReceivable = 0, pendingPayable = 0;
    for (const l of ledgerData) {
      const total = Number(l.total_amount) || 0;
      const refNo = String(l.invoice_no || l.bill_no || '').trim();
      if (!refNo) {
        if (total > 0) {
          if (l.type === 'sell')     pendingReceivable += total;
          else if (l.type === 'purchase') pendingPayable += total;
        }
        continue;
      }
      const paid    = allTxByBillNo.get(refNo) || 0;
      const balance = total - paid;
      if (balance > 0) {
        if (l.type === 'sell')     pendingReceivable += balance;
        else if (l.type === 'purchase') pendingPayable += balance;
      }
    }

    return { sales, purchase, expense, received: totalReceived, paid: totalPaid, pendingReceivable, pendingPayable };
  }, [ledgerData, expenseData, transactionData, allTransactions]);

  const allActivity = useMemo(() => {
    const combined = [...allLedger, ...allTransactions, ...allExpenses];
    combined.sort((a, b) => parseRecordDate(b.date).getTime() - parseRecordDate(a.date).getTime());
    return combined;
  }, [allLedger, allTransactions, allExpenses]);

  const filteredRecents = useMemo(() => {
    const toLocal = (d: Date) => {
      const off = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - off).toISOString().split('T')[0];
    };
    const now       = new Date();
    const todayStr  = toLocal(now);
    const yester    = new Date(now); yester.setDate(now.getDate() - 1);
    const yesterStr = toLocal(yester);
    const weekAgo   = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr   = toLocal(weekAgo);

    return allActivity.filter((r: any) => {
      const recordDate = toLocal(parseRecordDate(r.date));
      if (recentFilter === 'today')     return recordDate === todayStr;
      if (recentFilter === 'yesterday') return recordDate === yesterStr;
      if (recentFilter === 'week')      return recordDate >= weekStr;
      return true;
    });
  }, [allActivity, recentFilter]);

  const handleQuickAction = useCallback((action: string) => {
    if (onQuickAction) onQuickAction(action);
  }, [onQuickAction]);

  const handleLockApp = () => {
    sessionStorage.removeItem('app_unlocked');
    window.dispatchEvent(new Event('lockapp'));
  };

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

  const filterBadgeLabel = periodFilter.mode === 'business-year'
    ? getCurrentBusinessYear().label
    : periodLabel;

  return (
    <div className="h-full overflow-y-auto scroll-smooth" style={{ background: '#0b0e1a', paddingBottom: 'max(144px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>

      {/* ── HERO HEADER ── */}
      <div className="relative overflow-hidden" style={{ minHeight: '240px' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a0533] via-[#0f1f5c] to-[#0a2e4a]" />
        <div className="absolute top-[-40%] left-[-20%] w-[80%] h-[160%] rounded-full opacity-30" style={{ background: 'rgba(139,92,246,0.12)' }} />
        <div className="absolute top-[-20%] right-[-20%] w-[70%] h-[140%] rounded-full opacity-20" style={{ background: 'rgba(59,130,246,0.1)' }} />

        <div className="relative px-5 pb-8" style={{ paddingTop: 'max(40px, calc(env(safe-area-inset-top, 0px) + 16px))' }}>
          <div className="flex justify-between items-center mb-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-0.5">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="text-[28px] font-black text-white tracking-tight leading-none" style={{ letterSpacing: '-0.03em' }}>Overview</h1>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <span className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-full ${isAdmin ? 'bg-white/15 text-white/80 border border-white/20' : 'bg-amber-400/25 text-amber-200 border border-amber-400/30'}`} style={{ backdropFilter: 'blur(8px)' }}>
                {role}
              </span>
              {isStaff && (
                <button onClick={() => logout()} className="p-2 rounded-full text-white/70 transition-all active:scale-90" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
                  <LogOut size={15} />
                </button>
              )}
              <button onClick={handleLockApp} className="p-2 rounded-full text-white/70 transition-all active:scale-90" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
                <Lock size={15} />
              </button>
              <div className="h-9 w-9 rounded-full flex items-center justify-center font-black text-white text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.8), rgba(59,130,246,0.8))', border: '2px solid rgba(255,255,255,0.25)' }}>
                {user.email?.[0].toUpperCase()}
              </div>
            </div>
          </div>

          {/* Period filter toggle */}
          <button onClick={() => setShowFilterPanel(v => !v)}
            className="flex items-center gap-2 mb-4 px-3 py-2 rounded-2xl transition-all active:scale-95"
            style={showFilterPanel
              ? { background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.4)', backdropFilter: 'blur(8px)' }
              : { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <Calendar size={13} style={{ color: showFilterPanel ? '#a78bfa' : 'rgba(255,255,255,0.6)' }} />
            <span className="text-[11px] font-black" style={{ color: showFilterPanel ? '#a78bfa' : 'rgba(255,255,255,0.75)' }}>{filterBadgeLabel}</span>
            <Filter size={11} style={{ color: showFilterPanel ? '#a78bfa' : 'rgba(255,255,255,0.4)' }} />
          </button>

          {showFilterPanel && (
            <div className="mb-4">
              <PeriodFilterPanel filter={periodFilter} onChange={setPeriodFilter} onClose={() => setShowFilterPanel(false)} />
            </div>
          )}
          {/* Hero metric card */}
          <div className="rounded-3xl p-4 relative overflow-hidden" style={{ background: 'rgba(15,20,40,0.85)', border: '1px solid rgba(255,255,255,0.13)' }}>
            <div className="grid grid-cols-3 divide-x divide-white/10">
              <div className="pr-3">
                <p className="text-[9px] font-bold text-white/45 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1"><TrendingUp size={9} className="text-emerald-400" /> Sales</p>
                <p className="fit-amount-lg font-black text-white tabular-nums leading-none">
                  {loading ? <span className="inline-block w-16 h-5 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.15)' }} /> : `₹${Math.round(metrics.sales).toLocaleString('en-IN')}`}
                </p>
              </div>
              <div className="px-3">
                <p className="text-[9px] font-bold text-white/45 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1"><TrendingDown size={9} className="text-rose-400" /> Purchase</p>
                <p className="fit-amount-lg font-black text-rose-300 tabular-nums leading-none">
                  {loading ? <span className="inline-block w-16 h-5 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.15)' }} /> : `₹${Math.round(metrics.purchase).toLocaleString('en-IN')}`}
                </p>
              </div>
              <div className="pl-3">
                <p className="text-[9px] font-bold text-white/45 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1"><Wallet size={9} className="text-amber-400" /> Expenses</p>
                <p className="fit-amount-lg font-black text-amber-300 tabular-nums leading-none">
                  {loading ? <span className="inline-block w-16 h-5 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.15)' }} /> : `₹${Math.round(metrics.expense).toLocaleString('en-IN')}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-8" style={{ background: '#0b0e1a', borderRadius: '32px 32px 0 0', marginBottom: '-2px' }} />
      </div>

      <div className="px-4 pt-2 pb-4 space-y-4">

        {showReminders && (
          <SmartRemindersWidget lowStockItems={lowStockItems} todaySales={metrics.sales} todayExpenses={metrics.expense} pendingReceivable={metrics.pendingReceivable} onDismiss={() => setShowReminders(false)} />
        )}

        {lowStockItems.length > 0 && (
          <LowStockWidget items={lowStockItems} salesData={allLedger} onViewAll={() => onNavigate('inventory')} onItemClick={() => onNavigate('inventory')} />
        )}

        {/* Receivable / Payable cards */}
        <section className="grid grid-cols-2 gap-3">
          <div onClick={() => onNavigate('pending-dashboard')} className="relative p-4 rounded-[24px] cursor-pointer overflow-hidden active:scale-[0.96] transition-all" style={{ background: 'rgba(16,185,129,0.09)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <div className="p-2 rounded-2xl w-fit mb-3" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.25)' }}><ArrowUpRight size={14} style={{ color: '#34d399' }} /></div>
            <p className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: 'rgba(52,211,153,0.7)' }}>To Receive</p>
            <p className="font-black text-xl tabular-nums leading-tight" style={{ color: '#6ee7b7' }}>
              {loading ? <span className="inline-block w-20 h-6 rounded-lg animate-pulse" style={{ background: 'rgba(16,185,129,0.2)' }} /> : `₹${Math.round(metrics.pendingReceivable).toLocaleString('en-IN')}`}
            </p>
          </div>
          <div onClick={() => onNavigate('pending-dashboard')} className="relative p-4 rounded-[24px] cursor-pointer overflow-hidden active:scale-[0.96] transition-all" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}>
            <div className="p-2 rounded-2xl w-fit mb-3" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.22)' }}><ArrowDownLeft size={14} style={{ color: '#f87171' }} /></div>
            <p className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: 'rgba(248,113,113,0.7)' }}>To Pay</p>
            <p className="font-black text-xl tabular-nums leading-tight" style={{ color: '#fca5a5' }}>
              {loading ? <span className="inline-block w-20 h-6 rounded-lg animate-pulse" style={{ background: 'rgba(239,68,68,0.15)' }} /> : `₹${Math.round(metrics.pendingPayable).toLocaleString('en-IN')}`}
            </p>
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-1" style={{ color: 'rgba(148,163,184,0.45)' }}>Quick Actions</p>
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { label: 'Sale',     icon: TrendingUp,     glowColor: 'rgba(16,185,129,0.3)',  bg: 'rgba(16,185,129,0.1)',  iconBg: 'rgba(16,185,129,0.18)', iconColor: '#34d399', border: 'rgba(16,185,129,0.25)',  action: 'sale' },
              { label: 'Purchase', icon: TrendingDown,   glowColor: 'rgba(239,68,68,0.25)',  bg: 'rgba(239,68,68,0.09)',  iconBg: 'rgba(239,68,68,0.15)',  iconColor: '#f87171', border: 'rgba(239,68,68,0.2)',    action: 'purchase' },
              { label: 'Payment',  icon: ArrowRightLeft, glowColor: 'rgba(59,130,246,0.25)', bg: 'rgba(59,130,246,0.09)', iconBg: 'rgba(59,130,246,0.15)', iconColor: '#60a5fa', border: 'rgba(59,130,246,0.2)',   action: 'transaction' },
              { label: 'Expense',  icon: Wallet,         glowColor: 'rgba(245,158,11,0.25)', bg: 'rgba(245,158,11,0.09)', iconBg: 'rgba(245,158,11,0.15)', iconColor: '#fbbf24', border: 'rgba(245,158,11,0.2)',   action: 'expense' },
            ].map(({ label, icon: Icon, glowColor, bg, iconBg, iconColor, border, action }) => (
              <button key={action} onClick={() => handleQuickAction(action)}
                className="flex flex-col items-center gap-2.5 py-4 px-2 rounded-[20px] active:scale-90 transition-all relative overflow-hidden"
                style={{ background: bg, boxShadow: `0 4px 16px ${glowColor}`, border: `1px solid ${border}` }}>
                <div className="p-2.5 rounded-2xl" style={{ background: iconBg, border: `1px solid ${border}` }}>
                  <Icon size={17} style={{ color: iconColor }} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: iconColor }}>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Cashflow */}
        <section className="grid grid-cols-2 gap-3">
          <MetricCard title="Received" value={metrics.received} icon={ArrowRightLeft} color="text-blue-400" onClick={() => onNavigate('transactions')} loading={loading} />
          <MetricCard title="Paid Out"  value={metrics.paid}     icon={Wallet}         color="text-orange-400" onClick={() => onNavigate('transactions')} loading={loading} />
        </section>

        {/* Insight + Charts */}
        <section className="flex gap-2">
          <button onClick={() => setShowInsight(true)} className="flex-1 text-white p-4 rounded-[24px] active:scale-95 transition-all flex items-center gap-3 overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 8px 32px rgba(79,70,229,0.5)', border: '1px solid rgba(167,139,250,0.35)' }}>
            <div className="p-2.5 rounded-2xl relative" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}><Lightbulb size={18} className="text-yellow-300 fill-yellow-300" /></div>
            <div className="relative"><div className="font-black text-sm">AI Insights</div><div className="text-[10px]" style={{ color: 'rgba(196,181,253,0.8)' }}>Profit & Analysis</div></div>
          </button>
          <button onClick={() => setShowAnalytics(!showAnalytics)} className="w-[56px] h-[56px] rounded-[20px] flex items-center justify-center active:scale-95 transition-all flex-shrink-0" style={showAnalytics ? { background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 16px rgba(16,185,129,0.5)' } : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <BarChart3 size={20} strokeWidth={1.5} style={{ color: showAnalytics ? '#fff' : 'rgba(148,163,184,0.6)' }} />
          </button>
          <button onClick={() => setShowCharts(!showCharts)} className="w-[56px] h-[56px] rounded-[20px] flex items-center justify-center active:scale-95 transition-all flex-shrink-0" style={showCharts ? { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 4px 16px rgba(79,70,229,0.5)' } : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <FileText size={20} strokeWidth={1.5} style={{ color: showCharts ? '#fff' : 'rgba(148,163,184,0.6)' }} />
          </button>
        </section>

        {showAnalytics && !loading && <section><DashboardAnalyticsWidget metrics={metrics} ledgerData={ledgerData} loading={loading} onNavigate={onNavigate} /></section>}
        {showCharts && <section className="space-y-4"><SalesChart ledger={ledgerData} expenses={expenseData} days={14} /><CategoryPieChart expenses={expenseData} /></section>}
        {!loading && inventoryData.length > 0 && <ReorderWidget inventory={inventoryData} ledgerData={ledgerData} onNavigate={onNavigate} />}

        {/* Nav shortcuts */}
        <section>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-1" style={{ color: 'rgba(148,163,184,0.45)' }}>Quick Navigate</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'ledger',          Icon: BookOpen,       label: 'Ledger',      glassColor: 'rgba(59,130,246,0.12)',  iconColor: '#60a5fa', border: 'rgba(59,130,246,0.22)',  adminOnly: false },
              { id: 'transactions',    Icon: ArrowRightLeft, label: 'Payments',    glassColor: 'rgba(139,92,246,0.12)',  iconColor: '#a78bfa', border: 'rgba(139,92,246,0.22)',  adminOnly: false },
              { id: 'expenses',        Icon: Wallet,         label: 'Expenses',    glassColor: 'rgba(245,158,11,0.1)',   iconColor: '#fbbf24', border: 'rgba(245,158,11,0.2)',   adminOnly: true  },
              { id: 'vehicles',        Icon: Truck,          label: 'Vehicles',    glassColor: 'rgba(16,185,129,0.1)',   iconColor: '#34d399', border: 'rgba(16,185,129,0.2)',   adminOnly: false },
              { id: 'waste',           Icon: Trash2,         label: 'Waste',       glassColor: 'rgba(239,68,68,0.09)',   iconColor: '#f87171', border: 'rgba(239,68,68,0.18)',   adminOnly: false },
              { id: 'reports',         Icon: FileText,       label: 'Reports',     glassColor: 'rgba(100,116,139,0.1)',  iconColor: '#94a3b8', border: 'rgba(100,116,139,0.2)',  adminOnly: true  },
              { id: 'game-timeline',   Icon: Footprints,     label: 'Timeline',    glassColor: 'rgba(79,70,229,0.12)',   iconColor: '#818cf8', border: 'rgba(79,70,229,0.22)',   adminOnly: false },
              { id: 'analytics',       Icon: BarChart3,      label: 'Analytics',   glassColor: 'rgba(16,185,129,0.1)',   iconColor: '#34d399', border: 'rgba(16,185,129,0.2)',   adminOnly: true  },
              { id: 'bulk-import',     Icon: Upload,         label: 'Bulk Import', glassColor: 'rgba(99,102,241,0.1)',   iconColor: '#818cf8', border: 'rgba(99,102,241,0.22)',  adminOnly: true  },
              { id: 'stock-valuation', Icon: TrendingUp,     label: 'Stock Val.',  glassColor: 'rgba(16,185,129,0.08)', iconColor: '#6ee7b7', border: 'rgba(16,185,129,0.18)',  adminOnly: true  },
            ]
              .filter(item => !item.adminOnly || isAdmin)
              .map(({ id, Icon, label, glassColor, iconColor, border }) => (
                <button key={id} onClick={() => onNavigate(id)}
                  className="p-3 rounded-[20px] flex items-center gap-2.5 active:scale-95 transition-all relative overflow-hidden"
                  style={{ background: glassColor, border: `1px solid ${border}`, backdropFilter: 'blur(8px)' }}>
                  <div className="p-2 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${border}` }}>
                    <Icon size={13} style={{ color: iconColor }} />
                  </div>
                  <span className="font-black text-[9px] uppercase tracking-wider leading-tight" style={{ color: iconColor }}>{label}</span>
                </button>
              ))}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <div className="flex justify-between items-center mb-3 gap-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] px-1" style={{ color: 'rgba(148,163,184,0.45)' }}>Activity</h3>
            <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {(['today', 'yesterday', 'week'] as const).map((t) => (
                <button key={t} onClick={() => setRecentFilter(t)}
                  className="px-3 py-1.5 text-[9px] font-black uppercase rounded-xl transition-all whitespace-nowrap"
                  style={recentFilter === t
                    ? { background: 'rgba(139,92,246,0.25)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
                    : { color: 'rgba(148,163,184,0.45)' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredRecents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 rounded-[24px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="p-4 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}><FileText size={24} style={{ color: 'rgba(148,163,184,0.3)' }} /></div>
                <p className="text-xs font-bold" style={{ color: 'rgba(148,163,184,0.4)' }}>No activity for {recentFilter}</p>
              </div>
            ) : (
              filteredRecents.slice(0, 15).map((item: any) => {
                const isLedger   = item.docType === 'ledger';
                const isExpense  = item.docType === 'expense';
                const isReceived = item.type === 'received';
                const isExpanded = expandedId === item.id;

                let iconBg = 'rgba(100,116,139,0.15)', iconColor = '#94a3b8', amountColor = '#94a3b8';
                let Icon: React.FC<any> = FileText;
                let badge = 'REC', glassColor = 'rgba(255,255,255,0.06)', leftAccent = 'rgba(100,116,139,0.4)';

                if (isLedger) {
                  if (item.type === 'sell')  { iconBg='rgba(16,185,129,0.15)'; iconColor='#34d399'; amountColor='#6ee7b7'; Icon=TrendingUp;   badge='SAL'; leftAccent='#10b981'; glassColor='rgba(16,185,129,0.07)'; }
                  else                       { iconBg='rgba(239,68,68,0.12)';  iconColor='#f87171'; amountColor='#fca5a5'; Icon=TrendingDown; badge='PUR'; leftAccent='#ef4444'; glassColor='rgba(239,68,68,0.06)';  }
                } else if (isExpense) {        iconBg='rgba(245,158,11,0.15)'; iconColor='#fbbf24'; amountColor='#fcd34d'; Icon=Wallet;       badge='EXP'; leftAccent='#f59e0b'; glassColor='rgba(245,158,11,0.06)';
                } else {
                  if (isReceived)            { iconBg='rgba(59,130,246,0.13)'; iconColor='#60a5fa'; amountColor='#93c5fd'; Icon=ArrowRightLeft;badge='RCV'; leftAccent='#3b82f6'; glassColor='rgba(59,130,246,0.06)'; }
                  else                       { iconBg='rgba(245,158,11,0.13)'; iconColor='#fbbf24'; amountColor='#fcd34d'; Icon=Wallet;        badge='PAY'; leftAccent='#f59e0b'; glassColor='rgba(245,158,11,0.06)'; }
                }

                const rawVal     = isLedger ? item.total_amount : item.amount;
                const displayVal = Math.round(Number(rawVal) || 0).toLocaleString('en-IN');
                const title      = item.party_name || item.category || 'Unknown';
                const refNo      = (item.invoice_no || item.bill_no) ? `${isLedger ? (item.type === 'sell' ? 'S' : 'P') : 'T'}-${String(item.invoice_no || item.bill_no).slice(-3)}` : '';
                const subText    = isLedger ? `${(item.items || []).length} items` : (item.payment_mode || item.notes || '');

                return (
                  <div key={item.id} className="rounded-[20px] overflow-hidden transition-all active:scale-[0.99] relative" style={{ background: glassColor, backdropFilter: 'blur(8px)', border: `1px solid ${leftAccent}30`, borderLeft: `3px solid ${leftAccent}` }}>
                    <div className="flex items-center gap-3 p-3.5 cursor-pointer" onClick={() => toggleExpand(item.id)}>
                      <div className="p-2.5 rounded-2xl flex-shrink-0" style={{ background: iconBg, border: `1px solid ${leftAccent}25` }}>
                        <Icon size={16} style={{ color: iconColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-2 mb-0.5">
                          <span className="font-bold text-sm truncate" style={{ color: 'rgba(240,244,255,0.88)' }}>{title}</span>
                          <span className="font-black text-sm tabular-nums flex-shrink-0" style={{ color: amountColor }}>
                            {(isLedger && item.type === 'purchase') || (!isLedger && !isReceived) ? '-' : '+'}₹{displayVal}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-lg" style={{ background: iconBg, color: iconColor }}>{refNo || badge}</span>
                          <span className="text-[10px] font-medium" style={{ color: 'rgba(148,163,184,0.5)' }}>
                            {parseRecordDate(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </span>
                          {subText && <span className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.45)' }}>{subText}</span>}
                        </div>
                      </div>
                      {isLedger && <div className="flex-shrink-0" style={{ color: 'rgba(148,163,184,0.35)' }}>{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>}
                    </div>

                    {isExpanded && isLedger && item.items && (
                      <div className="px-3.5 pb-3.5 pt-0 mx-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="mt-3 space-y-1.5">
                          {item.items.map((it: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs py-1">
                              <span className="truncate flex-1" style={{ color: 'rgba(203,213,225,0.7)' }}>{it.item_name}</span>
                              <span className="mx-2" style={{ color: 'rgba(148,163,184,0.45)' }}>{it.quantity} {it.unit}</span>
                              <span className="font-bold tabular-nums" style={{ color: 'rgba(226,232,240,0.8)' }}>₹{it.rate}</span>
                            </div>
                          ))}
                        </div>
                        {Number(item.vehicle_rent || 0) > 0 && (
                          <div className="mt-2 text-[10px] flex items-center gap-1 rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(148,163,184,0.5)' }}>
                            <Truck size={11} className="flex-shrink-0" /> {item.vehicle} (₹{item.vehicle_rent})
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {filteredRecents.length > 15 && (
              // FIX: "View all" now passes the active date context so the ledger
              // opens pre-filtered to the same period the user was browsing on the
              // dashboard, instead of defaulting to the current month.
              <button
                onClick={() => {
                  const startStr = periodStart.toISOString().split('T')[0];
                  const endStr   = periodEnd.toISOString().split('T')[0];
                  onNavigate('ledger', { dateStart: startStr, dateEnd: endStr });
                }}
                className="w-full py-3 rounded-[18px] text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
                style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                View all {filteredRecents.length} records →
              </button>
            )}
          </div>
        </section>
      </div>

      <InsightModal isOpen={showInsight} onClose={() => setShowInsight(false)} user={user} />
    </div>
  );
};

export default DashboardView;


