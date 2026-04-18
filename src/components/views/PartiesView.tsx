import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  Search, Plus, Filter, Phone, MapPin,
  Edit2, Trash2, ArrowLeft
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { useUI } from '../../context/UIContext';
import ManualEntryModal from '../modals/ManualEntryModal';
import { calculateAccounting } from '../../utils/helpers';
import { PartiesSkeleton } from '../common/Skeleton';
import { TrashService } from '../../services/trash';
import { useSoftDelete } from '../common/UndoSnackbar';
import PartyDetailView from './PartyDetailView';
import { Virtuoso } from 'react-virtuoso';

interface PartiesViewProps {
  user: User;
  onAdd?: () => void;
  onEdit?: (item: any) => void;
  onBack?: () => void;
  appSettings?: any;
  onViewStatement?: (party: any) => void;
}

const PartiesView: React.FC<PartiesViewProps> = ({ user, onAdd, onEdit, onBack, appSettings = {}, onViewStatement }) => {
  const { showToast, confirm } = useUI();
  const { scheduleDelete } = useSoftDelete();
  const [loading, setLoading] = useState(true);

  const [parties, setParties] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'customer' | 'supplier'>('all');

  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingParty, setEditingParty] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, l, t] = await Promise.all([
        ApiService.getAll(user.uid, 'parties'),
        ApiService.getAll(user.uid, 'ledger_entries'),
        ApiService.getAll(user.uid, 'transactions')
      ]);
      setParties(p.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setLedger(l.docs.map((d: any) => d.data()));
      setTransactions(t.docs.map((d: any) => d.data()));
    } catch (e) {
      console.error(e);
      showToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleLocalUpdate = (updatedItem: any) => {
    if (editingParty) {
      setParties(prev => prev.map(p => p.id === updatedItem.id ? { ...p, ...updatedItem } : p));
    } else {
      setParties(prev => [updatedItem, ...prev]);
    }
    setShowModal(false);
    setEditingParty(null);
  };

  const handleDelete = useCallback(async (id: string, party: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirm("Delete Party?", "This will NOT delete their transactions.")) {
      scheduleDelete({
        id,
        collection: 'parties',
        itemName: party.name,
        onOptimistic: () => setParties(prev => prev.filter(p => p.id !== id)),
        onRestore: () => setParties(prev => [...prev, party]),
        onCommit: async () => { await TrashService.moveToTrash(user.uid, 'parties', id); },
      });
    }
  }, [confirm, scheduleDelete, user.uid]);

  const handleEditClick = useCallback((party: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingParty(party);
    setShowModal(true);
  }, []);

  const handleAddClick = () => {
    setEditingParty(null);
    setShowModal(true);
  };

  const ledgerByParty = useMemo(() => {
    const map: Record<string, any[]> = {};
    ledger.forEach(l => {
      const name = l.party_name;
      if (!map[name]) map[name] = [];
      map[name].push(l);
    });
    return map;
  }, [ledger]);

  const transactionsByParty = useMemo(() => {
    const map: Record<string, any[]> = {};
    transactions.forEach(t => {
      const name = t.party_name;
      if (!map[name]) map[name] = [];
      map[name].push(t);
    });
    return map;
  }, [transactions]);

  const filteredParties = useMemo(() => {
    return parties.filter(p => {
      const name = (p.name || '').toLowerCase();
      const matchesSearch = name.includes(search.toLowerCase()) ||
        (p.contact || '').includes(search);
      const matchesRole = filterRole === 'all' || p.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [parties, search, filterRole]);

  // PERF FIX: calculateAccounting was called inside the render loop for EVERY party
  // on EVERY render (search keystrokes, filter toggles, etc). With 100+ parties this
  // was running 100+ times per keystroke. Memoized here so it only recomputes when
  // the underlying ledger/transaction data actually changes.
  const partyAccounting = useMemo(() => {
    const map: Record<string, { totalBilled: number; totalPaid: number; balance: number }> = {};
    for (const party of parties) {
      map[party.id] = calculateAccounting(
        ledgerByParty[party.name] || [],
        transactionsByParty[party.name] || [],
        party.role
      );
    }
    return map;
  }, [parties, ledgerByParty, transactionsByParty]);

  // PERF: Stable card renderer reference — prevents Virtuoso from re-creating
  // every row component when parent state changes (e.g. search input typing).
  const renderPartyCard = useCallback((party: any) => {
    const { totalBilled, totalPaid, balance } = partyAccounting[party.id] || { totalBilled: 0, totalPaid: 0, balance: 0 };

    return (
      // PERF FIX: No backdropFilter on cards — inline styles bypass the global CSS
      // override in SeoHead.tsx. PartiesView cards were already clean; keeping note
      // here so this is not accidentally added in future.
      <div
        data-list-item
        onClick={() => setSelectedParty(party)}
        className="p-3.5 rounded-2xl active:scale-[0.98] transition-all relative group overflow-hidden"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex justify-between items-start mb-2 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2 overflow-hidden">
              <h3 className="font-bold text-sm truncate text-[rgba(240,244,255,0.9)]">{party.name}</h3>
              {party.prefixed_id && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 text-[rgba(148,163,184,0.45)]">
                  {party.prefixed_id}
                </span>
              )}
              <span
                style={party.role === 'customer'
                  ? { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }
                  : { background: 'rgba(245,158,11,0.13)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
                className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase flex-shrink-0"
              >
                {party.role === 'customer' ? 'Customer' : 'Supplier'}
              </span>
            </div>
            {party.address && (
              <div className="flex items-center gap-1 text-[10px] mt-0.5 truncate text-[rgba(148,163,184,0.45)]">
                <MapPin size={9} className="flex-shrink-0" /> <span className="truncate">{party.address}</span>
              </div>
            )}
          </div>

          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={(e) => handleEditClick(party, e)}
              className="w-9 h-9 rounded-xl active:scale-90 transition-all flex items-center justify-center"
              style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.18)" }}
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={(e) => handleDelete(party.id, party, e)}
              className="w-9 h-9 rounded-xl active:scale-90 transition-all flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 py-2 mb-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="min-w-0 overflow-hidden">
            <div className="text-[8px] uppercase font-bold mb-0.5 text-[rgba(148,163,184,0.45)]">{party.role === 'customer' ? 'Total Sales' : 'Total Purchase'}</div>
            <div className="font-bold text-[10px] tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-[rgba(203,213,225,0.75)]">₹{Math.round(totalBilled).toLocaleString('en-IN')}</div>
          </div>
          <div className="min-w-0 overflow-hidden">
            <div className="text-[8px] uppercase font-bold mb-0.5 text-[rgba(148,163,184,0.45)]">{party.role === 'customer' ? 'Total Rec.' : 'Total Paid'}</div>
            <div className="font-bold text-[10px] tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-[rgba(203,213,225,0.75)]">₹{Math.round(totalPaid).toLocaleString('en-IN')}</div>
          </div>
          <div className="text-right min-w-0 overflow-hidden">
            <div className="text-[8px] uppercase font-bold mb-0.5 text-[rgba(148,163,184,0.45)]">Balance</div>
            <div
              style={balance > 0 ? { color: '#34d399' } : balance < 0 ? { color: '#f87171' } : { color: 'rgba(148,163,184,0.4)' }}
              className="font-black text-xs tabular-nums whitespace-nowrap"
            >
              ₹{Math.abs(Math.round(balance)).toLocaleString('en-IN')} {balance > 0 ? 'Cr' : balance < 0 ? 'Dr' : '—'}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center text-[10px] overflow-hidden">
          <a href={`tel:${party.contact}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 font-bold text-[rgba(148,163,184,0.55)] px-2 py-1 rounded-lg truncate">
            <Phone size={10} className="flex-shrink-0" /> <span className="truncate">{party.contact}</span>
          </a>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onViewStatement && (
              <button
                onClick={(e) => { e.stopPropagation(); onViewStatement(party); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black active:scale-95 transition-all"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                Account Book
              </button>
            )}
            <div className="text-[9px] font-bold text-violet-400 flex items-center gap-1">
              View Ledger <ArrowLeft className="rotate-180" size={10} />
            </div>
          </div>
        </div>
      </div>
    );
  }, [partyAccounting, handleEditClick, handleDelete, onViewStatement]);

  if (loading) return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-white/08">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            {onBack && <button onClick={onBack} className="p-2 -ml-2"><ArrowLeft size={20} style={{ color: "rgba(148,163,184,0.45)" }} /></button>}
            <h1 className="text-xl font-black">Parties</h1>
          </div>
        </div>
      </div>
      <PartiesSkeleton count={5} />
    </div>
  );

  if (selectedParty) {
    return (
      <PartyDetailView
        party={selectedParty}
        user={user}
        onBack={() => setSelectedParty(null)}
        appSettings={appSettings}
      />
    );
  }

  return (
    // PERF: flex-col with fixed height so Virtuoso can measure and activate.
    // Previously overflow-y-auto on the outer div fought with Virtuoso's own scroller.
    <div className="h-full flex flex-col" style={{ background: "#0b0e1a" }}>

      {/* HEADER */}
      <div className="sticky top-0 z-30 px-4 pb-3 flex-shrink-0" style={{ background: "rgba(11,14,26,0.93)", paddingTop: 'max(16px, calc(env(safe-area-inset-top, 0px) + 8px))' }}>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} className="p-2 -ml-1 rounded-2xl active:scale-95 transition-all">
                <ArrowLeft size={16} className="text-[rgba(203,213,225,0.7)]" />
              </button>
            )}
            <div>
              <h1 className="text-xl font-black tracking-tight">Parties</h1>
              <p className="text-[10px] font-semibold text-[rgba(148,163,184,0.45)]">{filteredParties.length} contacts</p>
            </div>
          </div>
          <button
            onClick={handleAddClick}
            className="text-white p-2.5 rounded-2xl active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 4px 14px rgba(79,70,229,0.4)" }}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 rounded-2xl flex items-center px-3 border border-white/10" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              className="bg-transparent w-full p-2.5 text-sm font-semibold outline-none text-[rgba(240,244,255,0.88)] placeholder-[rgba(148,163,184,0.4)]"
              placeholder="Search parties..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex rounded-2xl p-1 gap-0.5 border border-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
            {(['all', 'customer', 'supplier'] as const).map(r => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className="px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all"
                style={filterRole === r ? { background: 'rgba(139,92,246,0.25)', color: '#a78bfa' } : { color: 'rgba(148,163,184,0.4)' }}
              >
                {r === 'all' ? 'All' : r === 'customer' ? 'Cust' : 'Supp'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* VIRTUALIZED LIST */}
      <div className="flex-1 min-h-0">
        {filteredParties.length === 0 ? (
          <div className="text-center py-10">
            <p className="font-bold text-[rgba(148,163,184,0.45)]">No parties found</p>
          </div>
        ) : (
          <Virtuoso
            style={{ height: '100%' }}
            data={filteredParties}
            overscan={300}
            itemContent={(_index, party) => (
              <div className="px-4 pt-2">
                {renderPartyCard(party)}
              </div>
            )}
            components={{
              Footer: () => <div className="h-24" />,
            }}
          />
        )}
      </div>

      <ManualEntryModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        type="parties"
        user={user}
        initialData={editingParty}
        appSettings={appSettings}
        onSuccess={handleLocalUpdate}
      />
    </div>
  );
};

export default PartiesView;
