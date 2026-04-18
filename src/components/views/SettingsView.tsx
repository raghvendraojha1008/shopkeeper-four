import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { 
  User as UserIcon, Lock, Database, LogOut, ArrowLeft, ChevronRight,
  List, Check, Settings as SettingsIcon, Users,
  FileText as FileTextIcon, Bell, Building2, HardDrive
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { AppSettings } from '../../types';
import { haptic } from '../../utils/haptics';

// IMPORT SUB-COMPONENTS
import { LoadingButton } from '../settings/SettingsCommon';
import { ProfileTab, GeneralTab, ListsTab, SecurityTab } from '../settings/SettingsTabs';
import { SettingsDataZone } from '../settings/SettingsDataZone';
import UserManagement from '../settings/UserManagement';
import InvoiceTemplateSettings from '../settings/InvoiceTemplateSettings';
import FirmSwitcher from '../settings/FirmSwitcher';

interface SettingsViewProps {
  user: User;
  appSettings: AppSettings;
  onUpdateSettings: (s: AppSettings) => Promise<void>;
  onBack: () => void;
  onNavigate: (tab: string) => void;
}

type SettingsSection = 'menu' | 'profile' | 'general' | 'invoice' | 'users' | 'lists' | 'security' | 'data' | 'invitations';

const SECTIONS: { id: SettingsSection; label: string; sub: string; icon: React.ElementType; color: string; bg: string }[] = [
  { id: 'profile',      label: 'Firm Profile',      sub: 'Business name, address, GSTIN',   icon: UserIcon,       color: '#60a5fa', bg: 'rgba(59,130,246,0.12)' },
  { id: 'general',      label: 'General',            sub: 'Theme, currency, preferences',    icon: SettingsIcon,   color: '#a78bfa', bg: 'rgba(139,92,246,0.12)' },
  { id: 'invoice',      label: 'Invoice Template',   sub: 'Logo, footer, tax settings',      icon: FileTextIcon,   color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  { id: 'invitations',  label: 'Invitations & Firms', sub: 'Accept invites, switch firms',  icon: Building2,      color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
  { id: 'users',        label: 'Users & Access',     sub: 'Staff accounts, permissions',     icon: Users,          color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
  { id: 'lists',        label: 'Custom Lists',       sub: 'Categories, units, tags',         icon: List,           color: '#fbbf24', bg: 'rgba(245,158,11,0.12)' },
  { id: 'security',     label: 'Security',           sub: 'PIN lock, auto-lock timer',       icon: Lock,           color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  { id: 'data',         label: 'Data & Backup',      sub: 'Export, import, reset',           icon: Database,       color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
];

const SettingsView: React.FC<SettingsViewProps> = ({ user, appSettings, onUpdateSettings, onBack, onNavigate }) => {
  const { logout } = useAuth();
  const { showToast } = useUI();
  
  const [activeSection, setActiveSection] = useState<SettingsSection>('menu');
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState<any>(
    JSON.parse(JSON.stringify(appSettings || { security: {} }))
  );

  // FIX: Track whether the user has unsaved local edits.
  // Only sync from the parent prop when there are NO local edits
  // (i.e. on first open or after a successful save), so typing
  // doesn't get wiped by parent re-renders.
  const isDirtyRef = useRef(false);

  useEffect(() => {
    if (appSettings && !isDirtyRef.current) {
      setFormData(JSON.parse(JSON.stringify(appSettings)));
    }
  }, [appSettings]);

  // Wrap setFormData so we can mark the form as dirty whenever the user edits anything
  const setFormDataWithDirty = (updater: any) => {
    isDirtyRef.current = true;
    setFormData(updater);
  };

  const handleSave = async () => {
    setLoading(true);
    haptic.medium();
    try {
      await onUpdateSettings(formData);
      // After a successful save the local state IS in sync with the parent,
      // so we can safely accept future prop updates again.
      isDirtyRef.current = false;
      showToast('Settings Saved', 'success');
      haptic.success();
    } catch (e) {
      console.error(e);
      showToast('Save failed. Try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reset dirty flag when navigating away (back to menu = discard local edits)
  const handleBackToMenu = () => {
    isDirtyRef.current = false;
    // Re-sync with latest saved settings when user navigates back
    setFormData(JSON.parse(JSON.stringify(appSettings || { security: {} })));
    setActiveSection('menu');
  };

  const handleLogout = async () => {
    haptic.medium();
    await logout();
  };

  const needsSave = activeSection !== 'menu' && activeSection !== 'users' && activeSection !== 'data' && activeSection !== 'invitations';
  const currentSection = SECTIONS.find(s => s.id === activeSection);

  // ── MENU PAGE ──────────────────────────────────────────────────────────────
  if (activeSection === 'menu') {
    return (
      <div className="h-full flex flex-col" style={{ background: '#0b0e1a' }}>
        {/* Header */}
        <div className="shrink-0 px-4 pt-5 pb-4 flex items-center gap-3 border-b"
          style={{ background: 'rgba(11,14,26,0.95)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}>
          <button onClick={onBack} className="p-2 rounded-xl active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <ArrowLeft size={18} className="text-[rgba(240,244,255,0.95)]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-lg text-[rgba(240,244,255,0.95)] tracking-tight">Settings</h1>
            <p className="text-[10px] text-[rgba(148,163,184,0.5)] truncate">{user.email}</p>
          </div>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 pb-32" style={{ WebkitOverflowScrolling: 'touch' }}>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[rgba(148,163,184,0.4)] px-1 mb-3">Configure your app</p>
          {SECTIONS.map(({ id, label, sub, icon: Icon, color, bg }) => (
            <button key={id} onClick={() => setActiveSection(id)}
              className="w-full flex items-center gap-4 p-4 rounded-[20px] active:scale-[0.98] transition-all text-left"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="w-11 h-11 rounded-[16px] flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
                <Icon size={19} style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-[rgba(240,244,255,0.9)]">{label}</p>
                <p className="text-[10px] text-[rgba(148,163,184,0.45)] truncate">{sub}</p>
              </div>
              <ChevronRight size={16} style={{ color: 'rgba(148,163,184,0.3)', flexShrink: 0 }} />
            </button>
          ))}

          {/* Daily Data Archive */}
          <button onClick={() => onNavigate('daily-snapshots')}
            className="w-full flex items-center gap-4 p-4 rounded-[20px] active:scale-[0.98] transition-all text-left"
            style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <div className="w-11 h-11 rounded-[16px] flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(52,211,153,0.1)' }}>
              <HardDrive size={19} style={{ color: '#34d399' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm" style={{ color: '#34d399' }}>Daily Data Archive</p>
              <p className="text-[10px] text-[rgba(148,163,184,0.45)] truncate">Last 7 days · CSV · Survives reinstall</p>
            </div>
            <ChevronRight size={16} style={{ color: 'rgba(52,211,153,0.3)', flexShrink: 0 }} />
          </button>

          {/* Version + Logout */}
          <div className="pt-4 space-y-2">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-4 p-4 rounded-[20px] active:scale-[0.98] transition-all text-left"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <div className="w-11 h-11 rounded-[16px] flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <LogOut size={19} style={{ color: '#f87171' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm" style={{ color: '#f87171' }}>Logout</p>
                <p className="text-[10px] text-[rgba(148,163,184,0.4)]">Sign out of your account</p>
              </div>
            </button>
            <p className="text-center text-[9px] text-[rgba(148,163,184,0.2)] font-bold uppercase tracking-widest pt-2">
              Version 1.0.0 · Build 2025
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── SUB-PAGE ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" style={{ background: '#0b0e1a' }}>
      {/* Sub-page header */}
      <div className="shrink-0 px-4 pt-5 pb-4 flex items-center gap-3 border-b"
        style={{ background: 'rgba(11,14,26,0.95)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <button onClick={handleBackToMenu} className="p-2 rounded-xl active:scale-95 transition-all"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ArrowLeft size={18} className="text-[rgba(240,244,255,0.95)]" />
        </button>
        {currentSection && (
          <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
            style={{ background: currentSection.bg }}>
            <currentSection.icon size={16} style={{ color: currentSection.color }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-base text-[rgba(240,244,255,0.95)] tracking-tight">
            {currentSection?.label ?? 'Settings'}
          </h1>
          <p className="text-[10px] text-[rgba(148,163,184,0.45)] truncate">
            {currentSection?.sub}
          </p>
        </div>
        {needsSave && (
          <LoadingButton loading={loading} onClick={handleSave} icon={Check} label="Save"
            className="py-2 px-4 rounded-xl font-black text-sm text-white"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-5" style={{ WebkitOverflowScrolling: 'touch' }}>
        {activeSection === 'profile'  && <ProfileTab formData={formData} setFormData={setFormDataWithDirty} userEmail={user.email} />}
        {activeSection === 'general'  && <GeneralTab formData={formData} setFormData={setFormDataWithDirty} />}
        {activeSection === 'invoice'  && <InvoiceTemplateSettings settings={formData} onUpdateSettings={async (s: any) => { setFormDataWithDirty(s); }} />}
        {activeSection === 'users'    && <UserManagement />}
        {activeSection === 'invitations' && <FirmSwitcher />}
        {activeSection === 'lists'    && <ListsTab formData={formData} setFormData={setFormDataWithDirty} />}
        {activeSection === 'security' && <SecurityTab formData={formData} setFormData={setFormDataWithDirty} />}
        {activeSection === 'data'     && <SettingsDataZone user={user} />}
      </div>
    </div>
  );
};

export default SettingsView;
