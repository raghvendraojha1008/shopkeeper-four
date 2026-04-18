import React, { useRef, useState, useEffect } from 'react';
import { Database, Download, Upload, AlertTriangle, RefreshCw, FileSpreadsheet, History, Trash2, Smartphone, Clock, Calendar, Cloud } from 'lucide-react';
import { ApiService } from '../../services/api';
import { AuditService } from '../../services/audit';
import { exportService } from '../../services/export';
import { AutoBackupService } from '../../services/autoBackup';
import { SyncQueueService } from '../../services/syncQueue';
import { useSyncControl } from '../../hooks/useOnlineStatus';
import { useUI } from '../../context/UIContext';
import { SettingsSection, LoadingButton } from './SettingsCommon';
import RecycleBin from '../common/RecycleBin';

export const SettingsDataZone = ({ user }: any) => {
    const { showToast, confirm } = useUI();
    const { isSyncing, syncMessage, syncProgress, syncNow, queueCount } = useSyncControl();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [backupLoading, setBackupLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [excelLoading, setExcelLoading] = useState(false);
    const [showAuditLog, setShowAuditLog] = useState(false);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [showRecycleBin, setShowRecycleBin] = useState(false);
    const [localBackupLoading, setLocalBackupLoading] = useState(false);
    const [localBackups, setLocalBackups] = useState<any[]>([]);
    const [showLocalBackups, setShowLocalBackups] = useState(false);
    const [restoreLocalLoading, setRestoreLocalLoading] = useState<string | null>(null);

    useEffect(() => {
        loadLocalBackups();
    }, []);

    const loadLocalBackups = async () => {
        const backups = await AutoBackupService.listBackups();
        setLocalBackups(backups);
    };

    const handleLocalBackup = async () => {
        setLocalBackupLoading(true);
        try {
            const result = await AutoBackupService.createLocalBackup(user.uid, 'manual');
            if (result.success) {
                showToast(result.message, 'success');
                await loadLocalBackups();
            } else {
                showToast(result.message, 'error');
            }
        } catch (e: any) {
            showToast('Local backup failed: ' + e.message, 'error');
        } finally {
            setLocalBackupLoading(false);
        }
    };

    const handleRestoreLocal = async (fileName: string) => {
        const confirmed = await confirm('Restore Backup', `Restore data from ${fileName}? This will overwrite current data.`);
        if (!confirmed) return;
        
        setRestoreLocalLoading(fileName);
        try {
            const backupData = await AutoBackupService.restoreFromFile(fileName);
            const data = backupData.data || backupData;
            await ApiService.restoreBackup(user.uid, data);
            showToast('Data restored. Reloading...', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } catch (e: any) {
            showToast('Restore failed: ' + e.message, 'error');
            setRestoreLocalLoading(null);
        }
    };

    const handleBackup = async () => {
        setBackupLoading(true);
        try {
            const [ledger, transactions, inventory, parties, vehicles, expenses] = await Promise.all([
                ApiService.getAll(user.uid, 'ledger_entries'),
                ApiService.getAll(user.uid, 'transactions'),
                ApiService.getAll(user.uid, 'inventory'),
                ApiService.getAll(user.uid, 'parties'),
                ApiService.getAll(user.uid, 'vehicles'),
                ApiService.getAll(user.uid, 'expenses')
            ]);

            const backupData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                data: {
                    ledger_entries: ledger.docs.map(d => ({ id: d.id, ...d.data() })),
                    transactions: transactions.docs.map(d => ({ id: d.id, ...d.data() })),
                    inventory: inventory.docs.map(d => ({ id: d.id, ...d.data() })),
                    parties: parties.docs.map(d => ({ id: d.id, ...d.data() })),
                    vehicles: vehicles.docs.map(d => ({ id: d.id, ...d.data() })),
                    expenses: expenses.docs.map(d => ({ id: d.id, ...d.data() }))
                }
            };

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ledger_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url); // Free memory
            
            showToast('Backup downloaded successfully', 'success');
        } catch (e) {
            console.error(e);
            showToast('Backup generation failed. Check internet.', 'error');
        } finally {
            setBackupLoading(false);
        }
    };

    const handleExportExcel = async () => {
        setExcelLoading(true);
        try {
            const [ledger, transactions, inventory, parties] = await Promise.all([
                ApiService.getAll(user.uid, 'ledger_entries'),
                ApiService.getAll(user.uid, 'transactions'),
                ApiService.getAll(user.uid, 'inventory'),
                ApiService.getAll(user.uid, 'parties')
            ]);

            // Export Ledger
            const ledgerData = ledger.docs.map(d => {
                const data = d.data();
                return {
                    Date: data.date,
                    Type: data.type === 'sell' ? 'Sale' : 'Purchase',
                    Party: data.party_name,
                    Invoice: data.invoice_no || '-',
                    Items: data.items?.map((i: any) => `${i.quantity} ${i.item_name}`).join('; ') || '-',
                    Total: data.total_amount,
                    Vehicle: data.vehicle || '-',
                    Rent: data.vehicle_rent || 0
                };
            });
            
            // Export Transactions
            const transData = transactions.docs.map(d => {
                const data = d.data();
                return {
                    Date: data.date,
                    Type: data.type === 'received' ? 'Received' : 'Paid',
                    Party: data.party_name,
                    Amount: data.amount,
                    Mode: data.payment_mode || 'Cash',
                    Reference: data.bill_no || '-',
                    Notes: data.notes || '-'
                };
            });

            // Export Inventory
            const invData = inventory.docs.map(d => {
                const data = d.data();
                return {
                    Name: data.name,
                    Unit: data.unit,
                    Stock: data.current_stock,
                    'Min Stock': data.min_stock,
                    'Sale Rate': data.sale_rate,
                    'Purchase Rate': data.purchase_rate,
                    HSN: data.hsn_code || '-',
                    GST: data.gst_percent || 0
                };
            });

            // Export Parties
            const partyData = parties.docs.map(d => {
                const data = d.data();
                return {
                    Name: data.name,
                    Role: data.role,
                    Contact: data.contact || '-',
                    Address: data.address || '-',
                    GSTIN: data.gstin || '-',
                    Site: data.site || '-'
                };
            });

            // Download all as separate CSVs
            if (ledgerData.length > 0) {
                await exportService.exportToCSV(ledgerData, Object.keys(ledgerData[0]), 'Ledger_Export.csv');
            }
            if (transData.length > 0) {
                await exportService.exportToCSV(transData, Object.keys(transData[0]), 'Transactions_Export.csv');
            }
            if (invData.length > 0) {
                await exportService.exportToCSV(invData, Object.keys(invData[0]), 'Inventory_Export.csv');
            }
            if (partyData.length > 0) {
                await exportService.exportToCSV(partyData, Object.keys(partyData[0]), 'Parties_Export.csv');
            }

            showToast('Excel files exported successfully', 'success');
        } catch (e) {
            console.error(e);
            showToast('Export failed', 'error');
        } finally {
            setExcelLoading(false);
        }
    };

    const loadAuditLogs = async () => {
        const logs = await AuditService.getRecent(user.uid, 50);
        setAuditLogs(logs);
        setShowAuditLog(true);
    };

    const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // FIX 1: Added Title 'Restore Backup'
        const confirmed = await confirm('Restore Backup', 'Overwrite all current data? This cannot be undone.');
        if (!confirmed) {
            if (fileInputRef.current) fileInputRef.current.value = ''; 
            return;
        }

        setRestoreLoading(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const raw = JSON.parse(ev.target?.result as string);
                const data = raw.data || raw; 
                
                await ApiService.restoreBackup(user.uid, data);
                showToast('Data restored successfully. Reloading...', 'success');
                setTimeout(() => window.location.reload(), 2000);
            } catch (err) {
                console.error(err);
                showToast('Invalid backup file format', 'error');
                setRestoreLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleResetApp = async () => {
        // FIX 2: Added Title 'Factory Reset'
        const confirmed = await confirm('Factory Reset', 'This will permanently delete ALL data. Are you sure?');
        if (!confirmed) return;

        // FIX 3: Added Title 'Irreversible Action'
        const doubleCheck = await confirm('Irreversible Action', 'Are you really sure? This action is irreversible.');
        if (!doubleCheck) return;

        try {
            await ApiService.factoryReset(user.uid);
            showToast('App reset complete. Restarting...', 'success');
            setTimeout(() => window.location.reload(), 1500);
        } catch(e) {
            showToast('Reset failed', 'error');
        }
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
             <SettingsSection title="Data Management" icon={Database}>
                
                {/* Offline Sync Section */}
                <div className="bg-[rgba(99,102,241,0.08)] p-4 rounded-xl border border-[rgba(99,102,241,0.2)] mb-4 flex gap-3">
                    <Cloud className="text-indigo-400 shrink-0" size={20}/>
                    <div className="flex-1">
                        <h4 className="font-bold text-sm text-[#a5b4fc]">Offline Sync</h4>
                        <p className="text-xs text-[rgba(165,180,252,0.7)] mt-1">
                            {queueCount > 0 
                                ? `${queueCount} pending item${queueCount !== 1 ? 's' : ''} waiting to sync` 
                                : 'All data synchronized'}
                        </p>
                        {syncMessage && (
                            <p className="text-xs text-indigo-400 mt-1 font-medium">
                                {syncMessage}
                            </p>
                        )}
                        {syncProgress && (
                            <div className="mt-2 w-full bg-[rgba(99,102,241,0.2)] h-1.5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-600 transition-all duration-300"
                                    style={{
                                        width: `${(syncProgress.processed / syncProgress.total) * 100}%`,
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <LoadingButton 
                    loading={isSyncing}
                    onClick={syncNow}
                    icon={RefreshCw}
                    label={queueCount > 0 ? `Sync Now (${queueCount} pending)` : 'Sync Now'}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mb-4"
                    disabled={queueCount === 0 && !isSyncing}
                />

                {/* Backup & Restore Section */}
                <div className="bg-[rgba(59,130,246,0.07)] p-4 rounded-xl border border-[rgba(59,130,246,0.18)] mb-4 flex gap-3">
                    <Database className="text-blue-400 shrink-0" size={20}/>
                    <div>
                        <h4 className="font-bold text-sm text-[#93c5fd]">Backup & Restore</h4>
                        <p className="text-xs text-blue-400 mt-1">Keep your data safe. Download a JSON backup regularly.</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <LoadingButton 
                        loading={backupLoading}
                        onClick={handleBackup}
                        icon={Download}
                        label="JSON Backup"
                        className="text-white" style={{background:"linear-gradient(135deg,#4f46e5,#7c3aed)"}}
                    />
                    
                    <div className="relative">
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleRestore}
                            accept=".json"
                            className="hidden"
                        />
                        <LoadingButton 
                            loading={restoreLoading}
                            onClick={() => fileInputRef.current?.click()}
                            icon={Upload}
                            label="Restore"
                            className="w-full border border-white/12 rounded-xl"
                        />
                    </div>
                </div>

                {/* Excel Export Section */}
                <div className="bg-[rgba(16,185,129,0.07)] p-4 rounded-xl border border-[rgba(16,185,129,0.18)] mb-4 flex gap-3">
                    <FileSpreadsheet className="text-green-600 shrink-0" size={20}/>
                    <div>
                        <h4 className="font-bold text-sm text-[#6ee7b7]">Export to Excel/CSV</h4>
                        <p className="text-xs text-[rgba(110,231,183,0.7)] mt-1">Download all data as spreadsheets for external use.</p>
                    </div>
                </div>
                
                <LoadingButton 
                    loading={excelLoading}
                    onClick={handleExportExcel}
                    icon={FileSpreadsheet}
                    label="Export All as CSV"
                    className="w-full bg-green-600 text-white"
                />

                {/* Recycle Bin Section */}
                <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="bg-[rgba(244,63,94,0.07)] p-4 rounded-xl border border-[rgba(244,63,94,0.18)] mb-4 flex gap-3">
                        <Trash2 className="text-[#f87171] shrink-0" size={20}/>
                        <div>
                            <h4 className="font-bold text-sm text-[#fca5a5]">Recycle Bin</h4>
                            <p className="text-xs text-[rgba(252,165,165,0.7)] mt-1">Recover recently deleted items or permanently remove them.</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => setShowRecycleBin(true)}
                        className="w-full py-3 bg-[rgba(244,63,94,0.10)] text-[#fca5a5] rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border border-[rgba(244,63,94,0.2)]"
                    >
                        <Trash2 size={16}/> Open Recycle Bin
                    </button>
                </div>
            </SettingsSection>

            {/* Local Auto-Backup Section */}
            <SettingsSection title="Device Backup (Auto)" icon={Smartphone}>
                <div className="bg-[rgba(99,102,241,0.07)] p-4 rounded-xl border border-[rgba(99,102,241,0.18)] mb-4 flex gap-3">
                    <Clock className="text-indigo-400 shrink-0" size={20}/>
                    <div>
                        <h4 className="font-bold text-sm text-[#a5b4fc]">Auto Daily Backup</h4>
                        <p className="text-xs text-[rgba(165,180,252,0.7)] mt-1">Automatically saves data daily to your device. Keeps last 7 days.</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <LoadingButton
                        loading={localBackupLoading}
                        onClick={handleLocalBackup}
                        icon={Download}
                        label="Backup Now"
                        className="bg-indigo-600 text-white"
                    />
                    <button
                        onClick={() => { loadLocalBackups(); setShowLocalBackups(!showLocalBackups); }}
                        className="py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border border-white/12"
                    >
                        <Calendar size={16}/> View Backups ({localBackups.length})
                    </button>
                </div>

                {showLocalBackups && (
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                        {localBackups.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 text-xs italic">No local backups found</div>
                        ) : localBackups.map((b, i) => (
                            <div key={i} className="flex justify-between items-center p-3 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)]">
                                <div>
                                    <div className="font-bold text-xs text-[rgba(203,213,225,0.75)]">{b.date}</div>
                                    <div className="text-[10px] text-[rgba(148,163,184,0.45)]">{b.name}</div>
                                </div>
                                <button
                                    onClick={() => handleRestoreLocal(b.name)}
                                    disabled={restoreLocalLoading === b.name}
                                    className="px-3 py-1.5 bg-[rgba(99,102,241,0.15)] text-indigo-300 rounded-lg text-[10px] font-bold active:scale-95 disabled:opacity-50"
                                >
                                    {restoreLocalLoading === b.name ? 'Restoring...' : 'Restore'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </SettingsSection>

            {/* Audit Log Section */}
            <SettingsSection title="Activity Log" icon={History}>
                <div className="bg-[rgba(255,255,255,0.04)] p-4 rounded-xl border border-white/10 mb-4">
                    <p className="text-xs text-[rgba(148,163,184,0.55)]">
                        Track all changes made to your data. See who edited, deleted, or created entries.
                    </p>
                </div>
                
                <button 
                    onClick={loadAuditLogs}
                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border border-white/12"
                >
                    <History size={16}/> View Activity Log
                </button>
            </SettingsSection>

            <div className="bg-[rgba(239,68,68,0.07)] p-5 rounded-2xl border border-[rgba(239,68,68,0.2)] mt-8">
                <div className="flex items-center gap-2 text-red-600 font-black mb-4 uppercase text-xs tracking-widest">
                    <AlertTriangle size={16}/> Danger Zone
                </div>
                <p className="text-xs text-red-500 mb-4 font-medium">Resetting the app will delete all customers, inventory, and transaction history permanently.</p>
                <button 
                    onClick={handleResetApp} 
                    className="w-full py-4 rounded-xl border border-red-500/30 text-red-400 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                    <RefreshCw size={16}/> Factory Reset App
                </button>
            </div>

            {/* Audit Log Modal */}
            {showAuditLog && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
                    <div className="w-full max-w-lg max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-white/10 animate-in slide-in-from-bottom-8 duration-300">
                        <div className="p-4 border-b border-white/10 flex justify-between items-center sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl">
                                    <History size={20} className="text-[rgba(203,213,225,0.7)]"/>
                                </div>
                                <div>
                                    <h3 className="font-black ">Activity Log</h3>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">Last 50 changes</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowAuditLog(false)}
                                className="p-2 rounded-full active:scale-95 transition-all hover:bg-[rgba(255,255,255,0.1)]"
                            >
                                <RefreshCw size={16} className="text-slate-400 rotate-45"/>
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-3">
                            {auditLogs.length === 0 ? (
                                <div className="text-center py-10">
                                    <History size={40} className="mx-auto mb-3 text-slate-300"/>
                                    <p className="text-sm font-bold text-[rgba(148,163,184,0.45)]">No activity recorded yet</p>
                                </div>
                            ) : (
                                auditLogs.map((log, i) => (
                                    <div key={log.id || i} className="p-3 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)]">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                                log.action === 'create' ? 'bg-[rgba(16,185,129,0.15)] text-emerald-400' :
                                                log.action === 'update' ? 'bg-[rgba(59,130,246,0.15)] text-blue-400' :
                                                log.action === 'delete' ? 'bg-[rgba(239,68,68,0.15)] text-red-400' :
                                                'bg-[rgba(139,92,246,0.2)] text-violet-300'
                                            }`}>
                                                {log.action}
                                            </span>
                                            <span className="text-[10px] text-[rgba(148,163,184,0.45)]">
                                                {new Date(log.timestamp).toLocaleString('en-IN')}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-[rgba(226,232,240,0.88)] text-[rgba(240,244,255,0.95)]">{log.summary}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Collection: {log.collection}</p>
                                        {log.user_email && (
                                            <p className="text-[10px] text-slate-500 mt-0.5">By: {log.user_email}</p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Recycle Bin Modal */}
            {showRecycleBin && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center">
                    <div className="w-full h-full sm:max-w-lg sm:max-h-[85vh] sm:rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
                        <RecycleBin user={user} onBack={() => setShowRecycleBin(false)} />
                    </div>
                </div>
            )}
        </div>
    );
};







