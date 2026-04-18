import React, { useState } from 'react';
import { 
    User, Store, MapPin, Phone, Hash, Globe, 
    List, Plus, Trash2, Shield, Lock, Smartphone, 
    Moon, Bell, IndianRupee, Mail, Key, Palette, Image as ImageIcon, FileSignature, MessageSquare
} from 'lucide-react';
import { updatePassword } from 'firebase/auth'; 
import { SettingsSection, SettingInput, LoadingButton } from './SettingsCommon';
import { GSTService } from '../../services/gstApi';
import { useUI } from '../../context/UIContext';
import { auth } from '../../config/firebase'; 
import { ThemePicker } from './ThemePicker';

export const ProfileTab = ({ formData, setFormData, userEmail }: any) => {
    const { showToast } = useUI();
    const [gstFetching, setGstFetching] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // FIX: already uses functional updater — correct pattern
    const updateProfile = (patch: any) => {
        setFormData((prev: any) => ({
            ...prev,
            profile: { ...(prev.profile || {}), ...patch }
        }));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size (max 500KB)
        if (file.size > 500 * 1024) {
            showToast('Logo size must be less than 500KB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            updateProfile({ logo_base64: base64 });
            showToast('Logo uploaded successfully', 'success');
        };
        reader.readAsDataURL(file);
    };

    const handleFetchGST = async () => {
        const gstin = formData.profile?.gstin;
        if (!gstin || gstin.length !== 15) return showToast('Invalid GSTIN', 'error');
        setGstFetching(true);
        try {
            const data = await GSTService.fetchDetails(gstin);
            if (data) {
                updateProfile({
                    firm_name: data.tradeName || formData.profile?.firm_name,
                    address: data.address || formData.profile?.address,
                    owner_name: data.legalName || formData.profile?.owner_name
                });
                showToast('Business Details Fetched', 'success');
            }
        } catch (e) {
            showToast('Failed to fetch GST details', 'error');
        } finally {
            setGstFetching(false);
        }
    };

    return (
        <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <SettingsSection title="Business Identity" icon={Store}>
                <div className="mb-4">
                    <SettingInput 
                        label="Registered Email" 
                        value={userEmail || ''} 
                        onChange={() => {}} 
                        icon={Mail} 
                        disabled={true} 
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                        <SettingInput 
                            label="GSTIN (Optional)" 
                            value={formData.profile?.gstin || ''} 
                            onChange={(v: string) => updateProfile({ gstin: v.toUpperCase() })} 
                            placeholder="22AAAAA0000A1Z5"
                            icon={Hash}
                        />
                        <button 
                            type="button"
                            onClick={handleFetchGST}
                            disabled={gstFetching || !formData.profile?.gstin}
                            className="absolute right-2 top-8 text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded-lg disabled:opacity-50"
                        >
                            {gstFetching ? 'Fetching...' : 'Auto-Fill'}
                        </button>
                    </div>
                    <SettingInput label="Business Name" value={formData.profile?.firm_name || ''} onChange={(v: string) => updateProfile({ firm_name: v })} icon={Store} placeholder="My Shop Name" />
                    <SettingInput label="Owner Name" value={formData.profile?.owner_name || ''} onChange={(v: string) => updateProfile({ owner_name: v })} icon={User} placeholder="Your Name" />
                    <SettingInput label="Phone Number" value={formData.profile?.contact || ''} onChange={(v: string) => updateProfile({ contact: v })} icon={Phone} placeholder="+91 9876543210" />
                </div>
                <SettingInput label="Email" value={formData.profile?.email || ''} onChange={(v: string) => updateProfile({ email: v })} icon={Mail} placeholder="business@example.com" />
                <SettingInput label="Business Address" value={formData.profile?.address || ''} onChange={(v: string) => updateProfile({ address: v })} icon={MapPin} placeholder="Full Address" />
                <SettingInput label="Website / Link" value={formData.profile?.website || ''} onChange={(v: string) => updateProfile({ website: v })} icon={Globe} placeholder="https://myshop.com" />
            </SettingsSection>

            <SettingsSection title="Invoice & Printing Settings" icon={FileSignature}>
                {/* Business Logo Upload */}
                <div className="mb-4">
                    <label className="text-xs font-bold text-[rgba(203,213,225,0.75)] block mb-2">Business Logo (Max 500KB)</label>
                    <div className="flex gap-3 items-center">
                        {formData.profile?.logo_base64 && (
                            <img 
                                src={formData.profile.logo_base64} 
                                alt="Logo Preview" 
                                className="w-20 h-20 object-contain rounded-lg p-2"
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors active:scale-95"
                        >
                            <ImageIcon className="inline mr-2" size={16} />
                            {formData.profile?.logo_base64 ? 'Change Logo' : 'Upload Logo'}
                        </button>
                        {formData.profile?.logo_base64 && (
                            <button
                                type="button"
                                onClick={() => updateProfile({ logo_base64: undefined })}
                                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-sm font-bold transition-colors"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoUpload}
                        className="hidden"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SettingInput 
                        label="Authorized Signatory Name" 
                        value={formData.profile?.authorized_signatory || ''} 
                        onChange={(v: string) => updateProfile({ authorized_signatory: v })} 
                        icon={FileSignature}
                        placeholder="Name of person authorized to sign"
                    />
                    <SettingInput 
                        label="Business Email (For Invoices)" 
                        value={formData.profile?.business_email || ''} 
                        onChange={(v: string) => updateProfile({ business_email: v })} 
                        icon={Mail}
                        placeholder="contact@business.com"
                    />
                </div>

                <div className="mt-4 p-3 bg-[rgba(59,130,246,0.08)] rounded-lg border border-[rgba(59,130,246,0.2)]">
                    <p className="text-xs text-[#93c5fd]">
                        These details will appear in all generated invoices and receipts. The logo and signatory name are optional but recommended for professional documents.
                    </p>
                </div>
            </SettingsSection>
        </div>
    );
};

export const GeneralTab = ({ formData, setFormData }: any) => {
    // FIX: use functional updater (prev =>) instead of stale closure spread
    const updatePreferences = (patch: any) => {
        setFormData((prev: any) => ({
            ...prev,
            preferences: {
                ...(prev.preferences || {}),
                ...patch,
            },
        }));
    };

    const updateAutomation = (patch: any) => {
        setFormData((prev: any) => ({
            ...prev,
            automation: {
                ...(prev.automation || {}),
                ...patch,
            },
        }));
    };

    return (
        <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <SettingsSection title="App Preferences" icon={Store}>
                <div className="flex items-center justify-between p-2 border-b border-white/07 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg text-[rgba(203,213,225,0.7)]"><Moon size={20}/></div>
                        <div>
                            <div className="font-bold text-sm text-[rgba(226,232,240,0.88)]">Dark Mode</div>
                            <div className="text-xs text-[rgba(148,163,184,0.45)]">Reduce eye strain at night</div>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={!!formData.dark_mode} 
                            onChange={e => { const v = e.target.checked; setFormData((prev: any) => ({...prev, dark_mode: v})); }} 
                        />
                        <div className="w-11 h-6 bg-[rgba(255,255,255,0.1)] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                    </label>
                </div>

                <div className="flex items-center justify-between p-2 border-b border-white/07 pb-4 pt-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[rgba(245,158,11,0.15)] text-[#fbbf24]"><Bell size={20}/></div>
                        <div>
                            <div className="font-bold text-sm text-[rgba(226,232,240,0.88)]">Notifications</div>
                            <div className="text-xs text-[rgba(148,163,184,0.45)]">Payment reminders & alerts</div>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={!!formData.notifications_enabled} 
                            onChange={e => { const v = e.target.checked; setFormData((prev: any) => ({...prev, notifications_enabled: v})); }} 
                        />
                        <div className="w-11 h-6 bg-[rgba(255,255,255,0.1)] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                </div>

                {/* ── Auto WhatsApp Reminder ─────────────────────────────── */}
                <div className="flex items-center justify-between p-2 border-b border-white/07 pb-4 pt-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[rgba(34,197,94,0.15)] text-[#4ade80]">
                            <MessageSquare size={20}/>
                        </div>
                        <div>
                            <div className="font-bold text-sm text-[rgba(226,232,240,0.88)]">Auto WhatsApp Reminders</div>
                            <div className="text-xs text-[rgba(148,163,184,0.45)]">Daily alert for overdue customers</div>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={!!formData.automation?.auto_reminder_enabled}
                            onChange={e => updateAutomation({ auto_reminder_enabled: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-[rgba(255,255,255,0.1)] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                </div>

                {/* Reminder period selector — only visible when reminder is enabled */}
                {!!formData.automation?.auto_reminder_enabled && (
                    <div className="px-2 pt-3 pb-1">
                        <label className="block text-xs font-bold text-[rgba(148,163,184,0.6)] mb-2">
                            Reminder Period (days overdue)
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {[7, 10, 15, 21, 30].map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => updateAutomation({ auto_reminder_days: d })}
                                    className="px-4 py-2 rounded-xl text-sm font-black transition-all active:scale-95"
                                    style={
                                        (formData.automation?.auto_reminder_days ?? 15) === d
                                            ? { background: 'rgba(34,197,94,0.2)', border: '1.5px solid rgba(74,222,128,0.5)', color: '#4ade80' }
                                            : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.6)' }
                                    }>
                                    {d}d
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-[rgba(148,163,184,0.4)] mt-2">
                            Notify daily if any customer has dues pending for this many days or more.
                        </p>
                    </div>
                )}

                <div className="pt-4 px-2">
                    <SettingInput
                        label="Currency Symbol"
                        value={formData.currency_symbol || '₹'}
                        onChange={(v: string) => setFormData((prev: any) => ({...prev, currency_symbol: v}))}
                        icon={IndianRupee}
                        placeholder="₹"
                    />
                </div>

                {/* GST View Toggle */}
                <div className="flex items-center justify-between p-2 border-b border-white/07 pb-4 pt-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[rgba(59,130,246,0.15)] text-[#60a5fa]"><Hash size={20}/></div>
                        <div>
                            <div className="font-bold text-sm text-[rgba(226,232,240,0.88)]">GST View</div>
                            <div className="text-xs text-[rgba(148,163,184,0.45)]">Show GSTIN, CGST/SGST across app</div>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={!!formData.automation?.auto_calculate_gst} 
                            onChange={e => updateAutomation({ auto_calculate_gst: e.target.checked })} 
                        />
                        <div className="w-11 h-6 bg-[rgba(255,255,255,0.1)] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                    </label>
                </div>

                {/* Auto Payment Distribution Toggle */}
                <div className="flex items-center justify-between p-2 border-b border-white/07 pb-4 pt-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[rgba(16,185,129,0.15)] text-[#34d399]"><IndianRupee size={20}/></div>
                        <div>
                            <div className="font-bold text-sm text-[rgba(226,232,240,0.88)]">Auto Payment Distribution</div>
                            <div className="text-xs text-[rgba(148,163,184,0.45)]">Distribute unlinked payments to orders (FIFO)</div>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={formData.automation?.auto_distribute_payments !== false}
                            onChange={e => updateAutomation({ auto_distribute_payments: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-[rgba(255,255,255,0.1)] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                </div>

                {/* ── Dynamic Navigation ─────────────────────────────────── */}
                <div className="flex items-center justify-between p-2 pt-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[rgba(99,102,241,0.15)] text-[#818cf8]">
                            <Smartphone size={20}/>
                        </div>
                        <div>
                            <div className="font-bold text-sm text-[rgba(226,232,240,0.88)]">Dynamic Navigation</div>
                            <div className="text-xs text-[rgba(148,163,184,0.45)]">Auto-hide bottom bar on detail pages</div>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={formData.preferences?.dynamic_nav !== false}
                            onChange={e => updatePreferences({ dynamic_nav: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-[rgba(255,255,255,0.1)] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                </div>
            </SettingsSection>

            <SettingsSection title="Theme" icon={Palette}>
                <div className="px-2">
                    <ThemePicker
                        value={formData.preferences?.theme}
                        onChange={(id) => updatePreferences({ theme: id })}
                        custom={formData.preferences?.custom_primary_hsl}
                        onChangeCustom={(hsl) => updatePreferences({ theme: 'custom', custom_primary_hsl: hsl })}
                    />
                    <p className="mt-3 text-[10px] text-slate-400 italic">
                        Tip: Choose a heartwarming color, then tap <span className="font-bold">Save</span>.
                    </p>
                </div>
            </SettingsSection>
        </div>
    );
};

export const ListsTab = ({ formData, setFormData }: any) => {
    const { confirm, showToast } = useUI();
    const [newItem, setNewItem] = useState('');
    const [activeList, setActiveList] = useState('payment_modes');

    const listTypes = [
        { id: 'payment_modes', label: 'Payment Modes' },
        { id: 'expense_types', label: 'Expense Categories' },
        { id: 'vehicle_types', label: 'Vehicle Types' },
        { id: 'staff', label: 'Staff Members' },
        { id: 'purposes', label: 'Payment Purposes' }
    ];

    const handleAdd = () => {
        if (!newItem.trim()) return;
        const trimmed = newItem.trim();
        // FIX: functional updater to avoid stale closure
        setFormData((prev: any) => {
            const current = prev.custom_lists?.[activeList] || [];
            return {
                ...prev,
                custom_lists: {
                    ...prev.custom_lists,
                    [activeList]: [...current, trimmed]
                }
            };
        });
        setNewItem('');
        showToast('Item added', 'success');
    };

    const handleRemove = async (idx: number) => {
        const confirmed = await confirm('Delete Item', "Are you sure you want to delete this item?");
        if (!confirmed) return;

        // FIX: functional updater to avoid stale closure
        setFormData((prev: any) => {
            const current = prev.custom_lists?.[activeList] || [];
            return {
                ...prev,
                custom_lists: {
                    ...prev.custom_lists,
                    [activeList]: current.filter((_: any, i: number) => i !== idx)
                }
            };
        });
        showToast('Item deleted', 'success');
    };

    return (
        <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <div className="flex overflow-x-auto pb-2 gap-2 scrollbar-hide">
                {listTypes.map(l => (
                    <button
                        key={l.id}
                        onClick={() => setActiveList(l.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${activeList === l.id ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30' : 'border border-white/10 text-slate-400'}`}
                    >
                        {l.label}
                    </button>
                ))}
            </div>

            <SettingsSection title={`Manage ${listTypes.find(l => l.id === activeList)?.label}`} icon={List}>
                <div className="flex gap-2 mb-4">
                    <input 
                        className="flex-1  border border-white/12 rounded-xl px-4 text-sm font-bold outline-none"
                        placeholder="Add new item..."
                        value={newItem}
                        onChange={e => setNewItem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <button onClick={handleAdd} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700"><Plus size={20}/></button>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {(formData.custom_lists?.[activeList] || []).map((item: string, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-3 rounded-xl border border-white/10 group">
                            <span className="font-bold text-sm text-[rgba(203,213,225,0.75)]">{item}</span>
                            <button onClick={() => handleRemove(idx)} className="text-slate-400 hover:text-red-500 opacity-100 transition-opacity"><Trash2 size={16}/></button>
                        </div>
                    ))}
                    {(formData.custom_lists?.[activeList] || []).length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-xs italic">No items in this list yet.</div>
                    )}
                </div>
            </SettingsSection>
        </div>
    );
};

export const SecurityTab = ({ formData, setFormData }: any) => {
    const { showToast } = useUI();
    const [newPassword, setNewPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    // FIX: functional updater to avoid stale closure
    const updateSecurity = (field: string, value: any) => {
        setFormData((prev: any) => ({
            ...prev,
            security: {
                ...(prev.security || {}),
                [field]: value
            }
        }));
    };

    const handleChangePassword = async () => {
        if (newPassword.length < 6) return showToast('Password too short (min 6 chars)', 'error');
        if (!auth.currentUser) return;

        setPasswordLoading(true);
        try {
            await updatePassword(auth.currentUser, newPassword);
            showToast('Password updated successfully', 'success');
            setNewPassword('');
        } catch (error: any) {
            console.error(error);
            showToast(error.message || 'Failed to update password. Re-login required.', 'error');
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <SettingsSection title="App Access" icon={Shield}>
                <div className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[rgba(139,92,246,0.15)] text-[#a78bfa]"><Lock size={20}/></div>
                        <div>
                            <div className="font-bold text-sm text-[rgba(226,232,240,0.88)]">App Lock</div>
                            <div className="text-xs text-[rgba(148,163,184,0.45)]">Require PIN on startup</div>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                             checked={!!formData.security?.enabled} 
                             onChange={e => updateSecurity('enabled', e.target.checked)} 
                        />
                         <div className="w-11 h-6 bg-[rgba(255,255,255,0.1)] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                    </label>
                </div>
                
                 {formData.security?.enabled && (
                    <div className="pt-2 animate-in slide-in-from-top-2">
                         <SettingInput 
                            label="Set 4-Digit PIN" 
                            type="number"
                            value={formData.security?.pin || ''} 
                            onChange={(v: string) => {
                                if (v.length <= 4) updateSecurity('pin', v);
                            }} 
                            icon={Smartphone}
                            placeholder="0000"
                        />
                    </div>
                )}
            </SettingsSection>

            <SettingsSection title="Account Security" icon={Key}>
                 <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <SettingInput 
                            label="New Password" 
                            type="password"
                            value={newPassword} 
                            onChange={setNewPassword} 
                            icon={Lock}
                            placeholder="Enter new password"
                        />
                    </div>
                    <LoadingButton 
                        loading={passwordLoading}
                        onClick={handleChangePassword}
                        label="Update"
                        className="text-[rgba(148,163,184,0.7)] h-[46px] mb-[1px] bg-[rgba(255,255,255,0.06)]"
                    />
                 </div>
                 <p className="text-[10px] text-slate-400 italic">Note: If you logged in via Google, you cannot change password here.</p>
            </SettingsSection>
        </div>
    );
};
