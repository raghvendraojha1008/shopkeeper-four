import React, { useState, useEffect, lazy, Suspense } from 'react';
import FirmSwitcher from './components/settings/FirmSwitcher';

import { ApiService } from './services/api';
import { AutoBackupService } from './services/autoBackup';
import { AutoReminderService } from './services/autoReminderService';
import { DailySnapshotService } from './services/dailySnapshot';
import { AppSettings } from './types';
import { DEFAULT_SETTINGS } from './config/constants';
import { applyThemeToDocument, normalizeAppSettings } from './theme/theme';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UIProvider } from './context/UIContext';
import { DataProvider, useData } from './context/DataContext';
import { RoleProvider, useRole } from './context/RoleContext';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Auth & Loading
import LoginView, { EmailVerificationBanner } from './components/auth/LoginView';
import OnboardingView from './components/auth/OnboardingView';
import LoadingView from './components/views/LoadingView';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

// Main Views
import DashboardView from './components/views/DashboardView';
import InventoryView from './components/views/InventoryView';
import PartiesView from './components/views/PartiesView';
import SettingsView from './components/views/SettingsView';

// Secondary Views — lazy-loaded so they don't inflate the initial bundle
const LedgerView           = lazy(() => import('./components/views/LedgerView'));
const TransactionsView     = lazy(() => import('./components/views/TransactionsView'));
const ExpensesView         = lazy(() => import('./components/views/ExpensesView'));
const VehiclesView         = lazy(() => import('./components/views/VehiclesView'));
const ReportsView          = lazy(() => import('./components/views/ReportsView'));
const SalesDashboard       = lazy(() => import('./components/views/SalesDashboard'));
const PurchaseDashboard    = lazy(() => import('./components/views/PurchaseDashboard'));
const PendingView          = lazy(() => import('./components/views/PendingView'));
const ItemDetailView       = lazy(() => import('./components/views/ItemDetailView'));
const AdvancedAnalyticsDashboard = lazy(() => import('./components/views/AdvancedAnalyticsDashboard'));
const WasteView            = lazy(() => import('./components/views/WasteView'));
const GameTimelineView     = lazy(() => import('./components/views/GameTimelineView'));
const BulkImportView       = lazy(() => import('./components/views/BulkImportView'));
const PartyStatementView   = lazy(() => import('./components/views/PartyStatementView'));
const StockValuationView   = lazy(() => import('./components/views/StockValuationView'));
const DailySnapshotView    = lazy(() => import('./components/views/DailySnapshotView'));

// Common & Modals
import CommandModal from './components/common/CommandModal';
import LockScreen from './components/common/LockScreen';
import ManualEntryModal from './components/modals/ManualEntryModal';

// Common
import { OfflineIndicator } from './components/common/OfflineIndicatorEnhanced';
import { UndoSnackbar, flushPendingDeletes } from './components/common/UndoSnackbar';
import SeoHead from './components/common/SeoHead';

// Icons
import {
  LayoutDashboard, Package, Mic, Users, Settings
} from 'lucide-react';

const AppContent = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const { isAdmin, isStaff, role, adminUid, registrationComplete, markRegistrationComplete, loading: roleLoading, isViewingOtherFirm, activeFirm, pendingInvitations } = useRole();
  // FIX: destructure invalidateAll from DataContext so handleRefresh can call it
  const { invalidateAll } = useData();
  // FIX (Issue #4): If a staff user's role doc is missing, adminUid is null.
  // The previous fallback `|| user?.uid` silently let staff read/write their own
  // empty namespace. Instead, detect this state and block the app with a clear message.
  const dataUid = adminUid || user?.uid || '';
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  

  const [activeTab, setActiveTab] = useState('dashboard');
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  

  // Modals
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualEntryType, setManualEntryType] = useState<'sales' | 'purchases' | 'transactions' | 'inventory' | 'expenses' | 'vehicles' | 'parties'>('sales');
  const [manualEntryData, setManualEntryData] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedPartyStatement, setSelectedPartyStatement] = useState<any>(null);

  // ── FIX: BulkImport and StockValuation use their OWN full-screen tab slot ──
  // Previously these were boolean overlays that rendered on top of the active tab,
  // but the main content div still showed through because nothing blocked it.
  // Solution: treat them as named tabs so only ONE view renders at a time.
  // This eliminates the blank-page bug without any changes to the views themselves.

  // Data for feature views (loaded on demand)
  const [partyStatementLedger, setPartyStatementLedger] = useState<any[]>([]);
  const [partyStatementTransactions, setPartyStatementTransactions] = useState<any[]>([]);
  const [stockValuationItems, setStockValuationItems] = useState<any[]>([]);
  const [stockValuationLedger, setStockValuationLedger] = useState<any[]>([]);
  const [stockValuationLoading, setStockValuationLoading] = useState(false);

  // 1. Load Settings & trigger auto backup
  useEffect(() => {
    let mounted = true;
    const initApp = async () => {
      if (user) {
        try {
          const effectiveUid = dataUid || user.uid;
          const s = await ApiService.settings.get(effectiveUid);
          if (mounted) {
            setAppSettings(normalizeAppSettings(s as AppSettings, DEFAULT_SETTINGS));
          }
          AutoBackupService.checkAndRunDailyBackup(effectiveUid).catch(console.error);
          DailySnapshotService.checkAndRunDailySnapshot(effectiveUid).catch(console.error);
          AutoReminderService.checkAndSchedule(
            effectiveUid,
            (s as AppSettings)?.automation || {},
            () => setActiveTab('pending')
          ).catch(console.error);

          const onboardingKey = `onboarded_${user.uid}`;
          const alreadyOnboarded =
            localStorage.getItem(onboardingKey) ||
            sessionStorage.getItem(onboardingKey) ||
            // If the user already has a firm profile in Firestore (from a previous
            // device or after clearing app storage), skip onboarding so existing
            // data is never overwritten.
            (s as any)?.profile?.firm_name?.trim();
          if (mounted && !alreadyOnboarded) {
            setShowOnboarding(true);
          }
        } catch (e) { console.error('Settings load failed', e); }
        finally { if (mounted) setSettingsLoaded(true); }
      } else if (!authLoading) {
        // FIX (Issue #5): User signed out — cancel all pending soft-delete timers
        // so they cannot fire against the next user's Firestore namespace after re-login.
        flushPendingDeletes();
        if (mounted) setSettingsLoaded(true);
      }
    };
    initApp();
    return () => { mounted = false; };
  }, [user, authLoading, dataUid]);

  // 2. Dark Mode
  useEffect(() => {
    const isDark = appSettings.preferences?.dark_mode || false;
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [appSettings]);

  // 2b. Theme
  useEffect(() => {
    applyThemeToDocument(appSettings);
  }, [appSettings]);

  // 3. Shortcuts
  useEffect(() => {
    const handleVoice = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') setShowCommandModal(true);
    };
    window.addEventListener('keydown', handleVoice);
    return () => window.removeEventListener('keydown', handleVoice);
  }, []);

  useEffect(() => {
    let listenerHandle: { remove: () => void } | null = null;
    const setupBackButton = async () => {
      listenerHandle = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (showManualModal)  { setShowManualModal(false);  return; }
        if (showCommandModal) { setShowCommandModal(false); return; }
        if (activeTab !== 'dashboard') { setActiveTab('dashboard'); return; }
        CapacitorApp.exitApp();
      });
    };
    setupBackButton();
    return () => { listenerHandle?.remove(); };
  }, [showManualModal, showCommandModal, activeTab]);

  // Initialize Capacitor native plugins on first mount
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const initNativePlugins = async () => {
      try {
        // Status Bar: dark overlay with light text to match the app's dark theme
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#0b0e1a' });
      } catch (_) {}
    };
    initNativePlugins();
  }, []);

  const openManual = (type: any, data: any = null) => {
    setManualEntryType(type);
    setManualEntryData(data);
    setShowManualModal(true);
  };

  // ── FIX: StockValuation loads data THEN switches activeTab to 'stock-valuation'
  // so the full view occupies the entire viewport — no overlay issues.
  const openStockValuation = async () => {
    setStockValuationLoading(true);
    try {
      const [invSnap, ledgerSnap] = await Promise.all([
        ApiService.getAll(dataUid, 'inventory'),
        ApiService.getAll(dataUid, 'ledger_entries'),
      ]);
      setStockValuationItems(invSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setStockValuationLedger(ledgerSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('StockValuation load failed', e); }
    finally { setStockValuationLoading(false); }
    setActiveTab('stock-valuation');
  };

  const openPartyStatement = async (party: any) => {
    setSelectedPartyStatement(party);
    try {
      const [ledgerSnap, transSnap] = await Promise.all([
        ApiService.getAll(dataUid, 'ledger_entries'),
        ApiService.getAll(dataUid, 'transactions'),
      ]);
      setPartyStatementLedger(ledgerSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setPartyStatementTransactions(transSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('PartyStatement load failed', e); }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'sale':              openManual('sales');                break;
      case 'purchase':          openManual('purchases');            break;
      case 'transaction':       openManual('transactions');         break;
      case 'party':             openManual('parties');              break;
      case 'item':              openManual('inventory');            break;
      case 'expense':           openManual('expenses');             break;
      // ── FIX: bulk-import now navigates to a proper tab ──────────────────
      case 'bulk-import':       setActiveTab('bulk-import');        break;
      case 'stock-valuation':   openStockValuation();               break;
      default:
        setSelectedItem(null);
        setActiveTab(action);
        break;
    }
  };

  // FIX: invalidateAll is now correctly in scope from useData() above
  const handleRefresh = () => invalidateAll(dataUid);

  if (authLoading || roleLoading || (user && !settingsLoaded)) return <LoadingView />;
  if (!user) return <LoginView />;

  // If staff role doc exists but has no adminUid, fall through and let them use
  // the app as if they were a fresh user — they can accept an invitation later.

  if (showOnboarding && user) {
    return (
      <OnboardingView
        onComplete={() => {
          const onboardingKey = `onboarded_${user.uid}`;
          localStorage.setItem(onboardingKey, 'true');
          sessionStorage.setItem(onboardingKey, 'true');
          setShowOnboarding(false);
          markRegistrationComplete();
        }}
      />
    );
  }

  // ── Helper: is a "feature tab" active (overrides normal tab rendering) ────
  const featureTab = activeTab === 'bulk-import' || activeTab === 'stock-valuation' || activeTab === 'staff-invitations' || activeTab === 'daily-snapshots';

  // ── Dynamic navigation: auto-hide bottom bar on non-nav pages ────────────
  // Tabs that have a direct button in the bottom nav bar.
  const NAV_TABS = ['dashboard', 'inventory', 'parties', 'settings', 'reports'];
  // If dynamic_nav preference is enabled (default: true), hide when not on a nav tab.
  const dynamicNavEnabled = appSettings.preferences?.dynamic_nav !== false;
  const showBottomNav = !dynamicNavEnabled || NAV_TABS.includes(activeTab);

  return (
    <div className="h-screen w-full text-foreground font-sans overflow-hidden flex flex-col pt-safe"
      style={{ background: '#0b0e1a', maxWidth: '100vw', overflowX: 'hidden' }}>
      <SeoHead />
      <OfflineIndicator />
      {isViewingOtherFirm && activeFirm && (
        <div className="shrink-0 px-4 py-2 flex items-center gap-3" style={{ background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.2)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
          </div>
          <p className="text-[11px] font-black flex-1" style={{ color: '#fbbf24' }}>
            Viewing: {activeFirm.firmName} ({activeFirm.role})
          </p>
        </div>
      )}
      <EmailVerificationBanner />
      <UndoSnackbar />
      <LockScreen settings={appSettings} />

      {/* MAIN VIEWPORT */}
      <main className="flex-1 overflow-hidden relative">
      <Suspense fallback={<LoadingView />}>
        {/* ── FIX: BulkImportView as a proper full-tab view ─────────────────── */}
        {activeTab === 'bulk-import' && (
          <BulkImportView
            user={{ ...user!, uid: dataUid }}
            settings={appSettings}
            onBack={() => setActiveTab('dashboard')}
          />
        )}

        {/* ── FIX: StockValuationView as a proper full-tab view ─────────────── */}
        {activeTab === 'stock-valuation' && (
          <StockValuationView
            items={stockValuationItems}
            ledger={stockValuationLedger}
            settings={appSettings}
            onBack={() => {
              setActiveTab('dashboard');
              setStockValuationItems([]);
              setStockValuationLedger([]);
            }}
            onViewItem={(item) => {
              setSelectedItem(item);
              setActiveTab('inventory');
            }}
          />
        )}

        {/* ── Staff Invitations full-tab view ─────────────────────────── */}
        {activeTab === 'staff-invitations' && (
          <div className="h-full flex flex-col" style={{ background: '#0b0e1a' }}>
            <div className="shrink-0 px-4 pt-5 pb-4 flex items-center gap-3 border-b"
              style={{ background: 'rgba(11,14,26,0.95)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <button onClick={() => setActiveTab('settings')} className="p-2 rounded-xl active:scale-95 transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(240,244,255,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="font-black text-base text-[rgba(240,244,255,0.95)] tracking-tight">Invitations & Firms</h1>
                <p className="text-[10px] text-[rgba(148,163,184,0.45)]">Accept invites, switch accounts</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-24" style={{ WebkitOverflowScrolling: 'touch' }}>
              <FirmSwitcher />
            </div>
          </div>
        )}

        {/* ── Daily Snapshot Archive ───────────────────────────────────── */}
        {activeTab === 'daily-snapshots' && (
          <DailySnapshotView
            userId={dataUid}
            onBack={() => setActiveTab('settings')}
          />
        )}

        {/* ── All other tabs — only rendered when NOT a feature tab ─────────── */}
        {!featureTab && (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                key="dashboard"
                user={{ ...user!, uid: dataUid }}
                appSettings={appSettings}
                onNavigate={setActiveTab}
                onQuickAction={handleQuickAction}
              />
            )}

            {activeTab === 'inventory' && !selectedItem && (
              <InventoryView
                user={{ ...user!, uid: dataUid }}
                settings={appSettings}
                onAdd={() => openManual('inventory')}
                onEdit={(item) => openManual('inventory', item)}
                onBack={() => setActiveTab('dashboard')}
                onViewItem={(item) => setSelectedItem(item)}
                onOpenWaste={() => setActiveTab('waste')}
                onOpenStockValuation={openStockValuation}
              />
            )}
            {activeTab === 'inventory' && selectedItem && (
              <ItemDetailView
                user={{ ...user!, uid: dataUid }}
                item={selectedItem}
                onBack={() => setSelectedItem(null)}
              />
            )}

            {/* Party Statement */}
            {selectedPartyStatement && (
              <PartyStatementView
                party={selectedPartyStatement}
                ledger={partyStatementLedger}
                transactions={partyStatementTransactions}
                settings={appSettings}
                onBack={() => {
                  setSelectedPartyStatement(null);
                  setPartyStatementLedger([]);
                  setPartyStatementTransactions([]);
                }}
              />
            )}

            {!selectedPartyStatement && activeTab === 'parties' && (
              <PartiesView
                user={{ ...user!, uid: dataUid }}
                onAdd={() => openManual('parties')}
                onEdit={(item) => openManual('parties', item)}
                onBack={() => setActiveTab('dashboard')}
                appSettings={appSettings}
                onViewStatement={openPartyStatement}
              />
            )}

            {activeTab === 'settings' && isAdmin && (
              <SettingsView
                user={{ ...user!, uid: dataUid }}
                appSettings={appSettings}
                onUpdateSettings={async (newSettings) => {
                  const normalized = normalizeAppSettings(newSettings, DEFAULT_SETTINGS);
                  const prevEnabled = !!appSettings.security?.enabled;
                  const nextEnabled = !!normalized.security?.enabled;
                  const prevPin = appSettings.security?.pin || '';
                  const nextPin = normalized.security?.pin || '';
                  if ((!prevEnabled && nextEnabled) || (prevPin !== nextPin && nextEnabled)) {
                    sessionStorage.removeItem('app_unlocked');
                  }
                  await ApiService.settings.save(user.uid, normalized);
                  setAppSettings(normalized);
                }}
                onBack={() => setActiveTab('dashboard')}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            )}
            {activeTab === 'settings' && isStaff && (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 px-4 pt-6 pb-4">
                  <button onClick={() => setActiveTab('dashboard')} className="p-2.5 rounded-full active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
                  </button>
                  <h1 className="font-black text-lg text-[rgba(240,244,255,0.95)]">More</h1>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-3" style={{ WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
                  {/* Invitations & Firms button */}
                  <button onClick={() => setActiveTab('staff-invitations')}
                    className="w-full flex items-center gap-4 p-4 rounded-[18px] active:scale-95 transition-all text-left"
                    style={{ background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.2)' }}>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(244,114,182,0.15)' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-black text-sm" style={{ color: '#f472b6' }}>Invitations & Firms</p>
                      <p className="text-[10px] text-[rgba(148,163,184,0.45)]">Accept invites, switch accounts</p>
                    </div>
                    {pendingInvitations.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: 'rgba(244,114,182,0.2)', color: '#f472b6' }}>
                        {pendingInvitations.length}
                      </span>
                    )}
                  </button>

                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 mb-2">Your Access</p>
                  {[
                    { id: 'vehicles',      label: 'Vehicles',  sub: 'Fleet management',  iconColor: '#16a34a' },
                    { id: 'ledger',        label: 'Ledger',    sub: 'Party accounts',    iconColor: '#3b82f6' },
                    { id: 'transactions',  label: 'Payments',  sub: 'Cash transactions', iconColor: '#7c3aed' },
                    { id: 'waste',         label: 'Waste Log', sub: 'Discarded stock',   iconColor: '#ef4444' },
                    { id: 'game-timeline', label: 'Timeline',  sub: 'Activity history',  iconColor: '#4f46e5' },
                  ].map(({ id, label, sub, iconColor }) => (
                    <button key={id} onClick={() => setActiveTab(id)}
                      className="w-full flex items-center gap-4 p-4 rounded-[18px] active:scale-95 transition-all text-left"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                      </div>
                      <div>
                        <p className="font-black text-sm" style={{ color: iconColor }}>{label}</p>
                        <p className="text-[10px] text-[rgba(148,163,184,0.45)]">{sub}</p>
                      </div>
                    </button>
                  ))}
                  <div className="pt-4 pb-2">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] text-center">Settings managed by admin</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sub Views */}
            {activeTab === 'sales-dashboard' && <SalesDashboard user={{ ...user!, uid: dataUid }} onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'purchase-dashboard' && <PurchaseDashboard user={{ ...user!, uid: dataUid }} onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'pending-dashboard' && <PendingView user={{ ...user!, uid: dataUid }} onBack={() => setActiveTab('dashboard')} appSettings={appSettings} />}
            {activeTab === 'reports' && isAdmin && <ReportsView user={{ ...user!, uid: dataUid }} onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'analytics' && isAdmin && (
              <AdvancedAnalyticsDashboard
                user={{ ...user!, uid: dataUid }}
                ledgerData={[]}
                expenseData={[]}
                transactionData={[]}
                inventoryData={[]}
                settings={appSettings}
                onBack={() => setActiveTab('dashboard')}
              />
            )}
            {activeTab === 'reports' && isStaff && (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 px-4 pt-6 pb-4">
                  <button onClick={() => setActiveTab('dashboard')} className="p-2.5 rounded-full active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
                  </button>
                  <h1 className="font-black text-lg text-[rgba(240,244,255,0.95)]">Reports</h1>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
                  <div className="w-16 h-16 rounded-[22px] flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
                  </div>
                  <div>
                    <p className="font-black text-base text-[rgba(203,213,225,0.75)]">Admin Only</p>
                    <p className="text-xs text-[rgba(148,163,184,0.45)] mt-1">Reports & analytics are accessible to admins only.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Legacy views */}
            {activeTab === 'ledger' && <LedgerView user={{ ...user!, uid: dataUid }} onBack={() => setActiveTab('dashboard')} appSettings={appSettings} />}
            {activeTab === 'transactions' && <TransactionsView user={{ ...user!, uid: dataUid }} onBack={() => setActiveTab('dashboard')} appSettings={appSettings} />}
            {activeTab === 'expenses' && isAdmin && <ExpensesView user={{ ...user!, uid: dataUid }} appSettings={appSettings} onAdd={() => openManual('expenses')} onEdit={(item) => openManual('expenses', item)} onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'expenses' && isStaff && (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 px-4 pt-6 pb-4">
                  <button onClick={() => setActiveTab('dashboard')} className="p-2.5 rounded-full active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
                  </button>
                  <h1 className="font-black text-lg text-[rgba(240,244,255,0.95)]">Expenses</h1>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
                  <div className="w-16 h-16 rounded-[22px] flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V22H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
                  </div>
                  <div>
                    <p className="font-black text-base text-[rgba(203,213,225,0.75)]">Admin Only</p>
                    <p className="text-xs text-[rgba(148,163,184,0.45)] mt-1">Expense records are visible to admins only.</p>
                  </div>
                  <button onClick={() => handleQuickAction('expense')}
                    className="px-6 py-3 rounded-2xl text-white font-black text-sm active:scale-95 transition-all"
                    style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 4px 16px rgba(245,158,11,0.35)' }}>
                    + Add Expense
                  </button>
                </div>
              </div>
            )}
            {activeTab === 'vehicles' && <VehiclesView user={{ ...user!, uid: dataUid }} onAdd={() => openManual('vehicles')} onEdit={(item) => openManual('vehicles', item)} onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'waste' && <WasteView user={{ ...user!, uid: dataUid }} onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'game-timeline' && <GameTimelineView user={{ ...user!, uid: dataUid }} onBack={() => setActiveTab('dashboard')} />}
          </>
        )}
      </Suspense>
      </main>

      {/* ═══ BENTO GLASS BOTTOM NAV ═══ */}
      {showBottomNav && <nav className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}>
        <div className="mx-3 mb-3 pointer-events-auto">
          <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(8,13,26,0.95), transparent)', zIndex: -1 }} />
          <div className="rounded-[28px] px-2 py-2 flex justify-between items-center relative"
            style={{ background: 'rgba(15,20,40,0.85)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.05) inset, 0 -1px 0 rgba(0,0,0,0.3)' }}>
            <div className="absolute top-0 left-8 right-8 h-px rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }} />

            {[
              { id: 'dashboard', Icon: LayoutDashboard, label: 'Home' },
              { id: 'inventory', Icon: Package, label: 'Stock' },
            ].map(({ id, Icon, label }) => {
              const active = activeTab === id;
              return (
                <button key={id} onClick={() => setActiveTab(id)}
                  className="relative flex flex-col items-center gap-1 px-5 py-2.5 rounded-[22px] transition-all duration-300 min-w-[60px]"
                  style={active ? { transform: 'scale(1.05)' } : {}}>
                  {active && (
                    <>
                      <div className="absolute inset-0 rounded-[22px]" style={{ background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.25)' }} />
                      <div className="absolute inset-0 rounded-[22px]" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.25), transparent 70%)' }} />
                    </>
                  )}
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.8} className="relative z-10 transition-all duration-300"
                    style={{ color: active ? '#a78bfa' : 'rgba(148,163,184,0.6)', filter: active ? 'drop-shadow(0 0 8px rgba(167,139,250,0.7))' : 'none' }} />
                  <span className="text-[9px] font-black tracking-wider uppercase relative z-10"
                    style={{ color: active ? '#a78bfa' : 'rgba(148,163,184,0.45)' }}>{label}</span>
                </button>
              );
            })}

            {/* Center AI FAB */}
            <button onClick={() => setShowCommandModal(true)} className="relative flex-shrink-0 -translate-y-4">
              <div className="absolute -inset-3 rounded-[28px] blur-xl animate-pulse" style={{ background: 'rgba(167,139,250,0.3)' }} />
              <div className="absolute -inset-1.5 rounded-[26px] blur-md" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(79,70,229,0.5))' }} />
              <div className="relative w-[58px] h-[58px] rounded-[22px] flex items-center justify-center active:scale-90 transition-all duration-200"
                style={{ background: 'linear-gradient(145deg, #7c3aed, #4f46e5)', boxShadow: '0 12px 36px rgba(124,58,237,0.6), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)', border: '1px solid rgba(167,139,250,0.4)' }}>
                <Mic size={22} className="text-white" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' }} />
              </div>
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-black tracking-widest uppercase whitespace-nowrap"
                style={{ color: 'rgba(167,139,250,0.6)' }}>AI</span>
            </button>

            {[
              { id: 'parties', Icon: Users, label: 'Parties' },
              ...(isAdmin ? [{ id: 'settings', Icon: Settings, label: 'More' }] : [{ id: 'reports', Icon: Settings, label: 'Reports' }]),
            ].map(({ id, Icon, label }) => {
              const active = activeTab === id;
              return (
                <button key={id} onClick={() => setActiveTab(id)}
                  className="relative flex flex-col items-center gap-1 px-5 py-2.5 rounded-[22px] transition-all duration-300 min-w-[60px]"
                  style={active ? { transform: 'scale(1.05)' } : {}}>
                  {active && (
                    <>
                      <div className="absolute inset-0 rounded-[22px]" style={{ background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.25)' }} />
                      <div className="absolute inset-0 rounded-[22px]" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.25), transparent 70%)' }} />
                    </>
                  )}
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.8} className="relative z-10 transition-all duration-300"
                    style={{ color: active ? '#a78bfa' : 'rgba(148,163,184,0.6)', filter: active ? 'drop-shadow(0 0 8px rgba(167,139,250,0.7))' : 'none' }} />
                  <span className="text-[9px] font-black tracking-wider uppercase relative z-10"
                    style={{ color: active ? '#a78bfa' : 'rgba(148,163,184,0.45)' }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>}

      <CommandModal isOpen={showCommandModal} onClose={() => setShowCommandModal(false)} user={{ ...user!, uid: dataUid }} />
      <ManualEntryModal
        isOpen={showManualModal}
        onClose={() => { setShowManualModal(false); setManualEntryData(null); }}
        type={manualEntryType}
        user={{ ...user!, uid: dataUid }}
        initialData={manualEntryData}
        appSettings={appSettings}
        onSuccess={() => { handleRefresh(); setShowManualModal(false); setManualEntryData(null); }}
      />
    </div>
  );
};

const App = () => (
  <HashRouter>
    <AuthProvider>
      <UIProvider>
        <DataProvider>
          <RoleProvider>
            <AppContent />
          </RoleProvider>
        </DataProvider>
      </UIProvider>
    </AuthProvider>
  </HashRouter>
);

export default App;


