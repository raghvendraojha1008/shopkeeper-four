import React, { useState, useEffect } from 'react';
import { Search, Calendar, X } from 'lucide-react';
import { useDebounce } from '../../hooks/usePaginatedData';

interface FilterBarProps {
  onSearch: (term: string) => void;
  onDateChange: (range: { start: string, end: string }) => void;
  searchTerm?: string;
  dateRange?: { start: string, end: string };
}

const FilterBar: React.FC<FilterBarProps> = ({ onSearch, onDateChange, searchTerm, dateRange }) => {
  const [val, setVal] = useState(searchTerm || '');
  const dbVal = useDebounce(val, 400);
  useEffect(() => { if (dbVal !== undefined) onSearch(dbVal); }, [dbVal, onSearch]);
  const hasDateFilter = dateRange?.start || dateRange?.end;
  const clearDates = () => onDateChange && onDateChange({ start: '', end: '' });

  return (
    <div className="mb-4 space-y-2.5 no-print">
      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          className="w-full pl-10 pr-10 py-3 font-bold text-sm outline-none text-[rgba(226,232,240,0.88)] text-[rgba(240,244,255,0.95)] placeholder-slate-400"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            boxShadow: 'none',
          }}
          placeholder="Search records..."
          value={val}
          onChange={e => setVal(e.target.value)}
        />
        {val && (
          <button onClick={() => setVal('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{background:'rgba(0,0,0,0.07)'}}>
            <X size={12} className="" style={{color:"rgba(148,163,184,0.5)"}} />
          </button>
        )}
      </div>

      {/* Date Range */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[16px]"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
        <Calendar size={15} className="text-slate-400 flex-shrink-0" />
        <div className="flex flex-1 items-center gap-2">
          <div className="flex-1">
            <div className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400 mb-0.5">From</div>
            <input
              type="date"
              className="w-full bg-transparent border-0 p-0 text-xs font-bold text-[rgba(203,213,225,0.8)] focus:ring-0 outline-none"
              value={dateRange?.start || ''}
              onChange={e => onDateChange && onDateChange({ ...dateRange!, start: e.target.value })}
            />
          </div>
          <div className="w-px h-6 flex-shrink-0" style={{background:'rgba(255,255,255,0.1)'}} />
          <div className="flex-1">
            <div className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400 mb-0.5">To</div>
            <input
              type="date"
              className="w-full bg-transparent border-0 p-0 text-xs font-bold text-[rgba(203,213,225,0.8)] focus:ring-0 outline-none text-right"
              value={dateRange?.end || ''}
              onChange={e => onDateChange && onDateChange({ ...dateRange!, end: e.target.value })}
            />
          </div>
        </div>
        {hasDateFilter && (
          <button onClick={clearDates}
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{background:'rgba(239,68,68,0.15)'}}>
            <X size={12} style={{color:'#ef4444'}} />
          </button>
        )}
      </div>
    </div>
  );
};
export default FilterBar;







