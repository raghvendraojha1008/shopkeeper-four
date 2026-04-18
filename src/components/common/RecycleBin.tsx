import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react';
import { TrashService, DeletedItem } from '../../services/trash';
import { useUI } from '../../context/UIContext';
import { haptic } from '../../utils/haptics';

interface RecycleBinProps { user: User; onBack: () => void; }

const RecycleBin: React.FC<RecycleBinProps> = ({ user, onBack }) => {
    const { showToast, confirm } = useUI();
    const [items, setItems] = useState<DeletedItem[]>([]);
    const [loading, setLoading] = useState(true);

    const loadItems = async () => {
        setLoading(true);
        try {
            const data = await TrashService.getTrashItems(user.uid);
            // Sort by newest deleted first
            data.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
            setItems(data);
        } catch (e) { console.error(e); showToast("Failed to load trash", "error"); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadItems(); }, [user]);

    const handleRestore = async (item: DeletedItem) => {
        haptic.medium();
        try {
            await TrashService.restoreItem(user.uid, item);
            setItems(prev => prev.filter(i => i.id !== item.id));
            showToast("Item Restored", "success");
            haptic.success();
        } catch (e) { showToast("Restore failed", "error"); haptic.error(); }
    };

    const handlePermanentDelete = async (item: DeletedItem) => {
        if(await confirm("Delete Forever?", "This cannot be undone.")) {
            haptic.heavy();
            try {
                await TrashService.permanentDelete(user.uid, item.id);
                setItems(prev => prev.filter(i => i.id !== item.id));
                showToast("Permanently Deleted", "success");
            } catch (e) { showToast("Delete failed", "error"); }
        }
    };

    const getIcon = (col: string) => {
        if(col.includes('ledger')) return "📖";
        if(col.includes('inventory')) return "📦";
        if(col.includes('transactions')) return "💰";
        if(col.includes('parties')) return "👥";
        if(col.includes('vehicles')) return "🚚";
        if(col.includes('expenses')) return "💸";
        return "📄";
    };

    return (
        <div className="flex flex-col h-full px-4 pb-6">
            <div className="flex items-center gap-3 mb-6 mt-2">
                <button onClick={onBack} className="p-2 rounded-full glass-icon-btn"><ArrowLeft size={20} className="text-[rgba(240,244,255,0.95)]"/></button>
                <h1 className="text-2xl font-black text-[rgba(240,244,255,0.95)]">Recycle Bin</h1>
            </div>
            
            {loading ? (
                <div className="flex-1 flex justify-center items-center text-[rgba(148,163,184,0.45)]">Loading...</div>
            ) : items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 space-y-4">
                    <Trash2 size={64} className="text-[rgba(255,255,255,0.2)]"/>
                    <h3 className="text-lg font-bold text-[rgba(148,163,184,0.6)]">Bin is Empty</h3>
                    <p className="text-xs text-[rgba(148,163,184,0.45)] max-w-[200px]">Items deleted from Ledger or Inventory will appear here.</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto space-y-3 pb-20">
                    {items.map(item => (
                        <div key={item.id} className="p-4 rounded-xl flex justify-between items-center bg-[rgba(255,255,255,0.05)] border border-white/08">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg">{getIcon(item.collection_name)}</span>
                                    <span className="text-[10px] font-bold bg-[rgba(239,68,68,0.12)] text-[#f87171] rounded px-2 py-0.5">
                                        {new Date(item.deleted_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="font-bold text-sm text-[rgba(226,232,240,0.88)]">
                                    {item.data.party_name || item.data.name || item.data.vehicle_number || item.data.notes || 'Unknown Item'}
                                </div>
                                <div className="text-xs text-[rgba(148,163,184,0.45)] capitalize">
                                    {item.collection_name.replace('_', ' ')}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleRestore(item)} className="p-2 bg-[rgba(16,185,129,0.15)] text-[#34d399] rounded-lg border border-[rgba(16,185,129,0.2)] active:scale-95">
                                    <RotateCcw size={18}/>
                                </button>
                                <button onClick={() => handlePermanentDelete(item)} className="p-2 bg-[rgba(239,68,68,0.12)] text-[#f87171] rounded-lg border border-[rgba(239,68,68,0.18)] active:scale-95">
                                    <Trash2 size={18}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
export default RecycleBin;







