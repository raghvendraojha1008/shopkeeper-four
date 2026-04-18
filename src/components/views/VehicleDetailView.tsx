import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { 
  ArrowLeft, Truck, Calendar, MapPin, 
  FileText, Filter, CheckCircle2, User as UserIcon, Phone,
  Package, Hash
} from 'lucide-react';
import { exportService } from '../../services/export';
import { useUI } from '../../context/UIContext';

interface VehicleDetailProps {
  vehicle: any;
  user: User;
  onBack: () => void;
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

const VehicleDetailView: React.FC<VehicleDetailProps> = ({ vehicle, user, onBack }) => {
  const { showToast } = useUI();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<any[]>([]);
  
  const [dateRange, setDateRange] = useState({
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const loadTrips = async () => {
        setLoading(true);
        try {
            // Fetch ALL ledger entries (sales/purchases) where this vehicle was used
            const q = query(
                collection(db, `users/${user.uid}/ledger_entries`), 
                where('vehicle', '==', vehicle.vehicle_number)
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Sort by Date Descending
            data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setTrips(data);
        } catch (e) { 
            console.error(e); 
            showToast("Failed to load vehicle history", "error");
        } finally { 
            setLoading(false); 
        }
    };
    loadTrips();
  }, [vehicle, user]);

  // --- FILTERING ---
  const filteredTrips = useMemo(() => {
      return trips.filter(t => toDateString(t.date) >= dateRange.start && toDateString(t.date) <= dateRange.end);
  }, [trips, dateRange]);

  // --- STATS ---
  const stats = useMemo(() => {
      return {
          totalOrders: filteredTrips.length,
          totalRent: filteredTrips.reduce((sum, t) => sum + (Number(t.vehicle_rent) || 0), 0)
      };
  }, [filteredTrips]);

  // --- EXPORT ---
  const handleDownload = async () => {
      if (filteredTrips.length === 0) return showToast("No records to export", "error");
      const data = filteredTrips.map(t => ({
          Date: t.date,
          Invoice: t.invoice_no || '-',
          Party: t.party_name,
          Items: t.items?.map((i:any) => `${i.quantity} ${i.item_name}`).join(', ') || '-',
          Rent: t.vehicle_rent || 0
      }));
      await exportService.exportToCSV(data, Object.keys(data[0]), `Vehicle_${vehicle.vehicle_number}_Report.csv`);
      showToast("Report Saved", "success");
  };

  return (
    <div className="flex flex-col h-full" style={{background:"#0b0e1a"}}>
        {/* STICKY HEADER — only title row is fixed */}
        <div className="flex-shrink-0 px-4 pt-4 md:px-6 pb-3"
          style={{ background: 'rgba(11,14,26,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="p-2 rounded-full glass-icon-btn"><ArrowLeft size={20} className="text-[rgba(240,244,255,0.95)]"/></button>
                <div>
                    <h1 className="text-xl font-black flex items-center gap-2 text-[rgba(226,232,240,0.88)]">
                        {vehicle.vehicle_number}
                    </h1>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <span>{vehicle.model}</span>
                        {vehicle.driver_name && <span>• Driver: {vehicle.driver_name}</span>}
                    </div>
                </div>
            </div>
            <button onClick={handleDownload} className="p-2.5 bg-[rgba(59,130,246,0.12)] text-[#60a5fa] rounded-xl border border-[rgba(59,130,246,0.2)] active:scale-95 transition-all">
                <FileText size={20}/>
            </button>
          </div>
        </div>

        {/* SCROLLABLE — filters + stats + list all scroll together */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        
        {/* FILTERS & STATS */}
        <div className="space-y-4 mb-4">
            {/* Date Range */}
            <div className="p-3 rounded-2xl border border-white/10 flex gap-3 items-center">
                <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">From</label>
                    <input type="date" className="w-full  text-[rgba(240,244,255,0.95)] text-xs font-bold p-2 rounded-lg border-none outline-none" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
                </div>
                <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">To</label>
                    <input type="date" className="w-full  text-[rgba(240,244,255,0.95)] text-xs font-bold p-2 rounded-lg border-none outline-none" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.05)] border border-white/08">
                    <div className="text-[rgba(148,163,184,0.45)] text-[10px] font-bold uppercase mb-1">Total Orders</div>
                    <div className="text-2xl font-black text-[rgba(240,244,255,0.95)]">{stats.totalOrders}</div>
                </div>
                <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.05)] border border-white/08">
                    <div className="text-[rgba(148,163,184,0.45)] text-[10px] font-bold uppercase mb-1">Total Rent</div>
                    <div className="text-2xl font-black text-[#34d399]">₹{stats.totalRent.toLocaleString('en-IN')}</div>
                </div>
            </div>
        </div>

        {/* TRIP LIST */}
        <div className="pb-32 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2">Trip History</h3>
            
            {loading ? <div className="text-center py-10 text-[rgba(148,163,184,0.45)]">Loading history...</div> : 
             filteredTrips.length === 0 ? <div className="text-center py-10 text-[rgba(148,163,184,0.45)] text-sm italic">No trips found in this period.</div> :
             filteredTrips.map((trip, i) => (
                <div key={i} className="p-4 rounded-xl border border-white/10 group">
                    
                    {/* Header: Date & Invoice */}
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 text-[rgba(148,163,184,0.45)] px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Calendar size={10}/> {trip.date}
                            </span>
                            {trip.invoice_no && (
                                <span className="text-[10px] font-bold bg-[rgba(59,130,246,0.12)] text-[#60a5fa] px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Hash size={10}/> {trip.invoice_no}
                                </span>
                            )}
                        </div>
                        <div className="text-right">
                             <div className="font-black text-[#34d399] text-lg">₹{trip.vehicle_rent || 0}</div>
                             <div className="text-[9px] text-slate-400 font-bold uppercase">Rent</div>
                        </div>
                    </div>

                    {/* Party Name */}
                    <div className="font-bold text-sm text-[rgba(226,232,240,0.88)] mb-2">{trip.party_name}</div>

                    {/* Items Table */}
                    {trip.items && trip.items.length > 0 && (
                        <div className="rounded-lg p-2 border border-white/10">
                            {trip.items.map((it: any, idx: number) => (
                                <div key={idx} className="grid grid-cols-12 text-[10px] py-0.5 text-[rgba(203,213,225,0.75)]">
                                    <div className="col-span-8 font-bold truncate pr-1">{it.item_name}</div>
                                    <div className="col-span-4 text-right">{it.quantity} {it.unit}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* Visual Status */}
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-green-600 font-bold">
                         <CheckCircle2 size={10}/> Trip Completed
                    </div>
                </div>
            ))}
        </div>
        </div>{/* end scrollable container */}
    </div>
  );
};

export default VehicleDetailView;








