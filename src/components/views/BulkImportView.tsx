import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Upload, Download, CheckCircle2, AlertTriangle, XCircle,
  Loader2, Package, Users, FileText, ChevronRight, RefreshCw, Eye, EyeOff,
  Wallet, Truck, Receipt,
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { useUI } from '../../context/UIContext';

type ImportType = 'inventory' | 'parties' | 'ledger' | 'transactions' | 'expenses' | 'vehicles';
type Step = 'type' | 'upload' | 'map' | 'preview' | 'done';
interface ColDef { key: string; label: string; required: boolean; hint?: string; }
interface RowResult { mapped: Record<string, string>; errors: string[]; }
interface ImportResult { success: number; skipped: number; rowErrors: string[]; }

const SCHEMA: Record<ImportType, ColDef[]> = {
  inventory: [
    { key: 'name',             label: 'Item Name',        required: true  },
    { key: 'sale_rate',        label: 'Sale Rate',        required: true  },
    { key: 'purchase_rate',    label: 'Purchase Rate',    required: false },
    { key: 'quantity',         label: 'Opening Stock',    required: false, hint: 'Default 0' },
    { key: 'unit',             label: 'Unit',             required: false, hint: 'Pcs/Kg/Bag…' },
    { key: 'hsn_code',         label: 'HSN Code',         required: false },
    { key: 'gst_percent',      label: 'GST %',            required: false, hint: '0/5/12/18/28' },
    { key: 'price_type',       label: 'GST Type',         required: false, hint: 'inclusive/exclusive' },
    { key: 'min_stock',        label: 'Min Stock Alert',  required: false },
    { key: 'primary_supplier', label: 'Primary Supplier', required: false },
  ],
  parties: [
    { key: 'name',         label: 'Party Name',   required: true  },
    { key: 'role',         label: 'Role',         required: true,  hint: 'customer / supplier' },
    { key: 'contact',      label: 'Phone',        required: false },
    { key: 'gstin',        label: 'GSTIN',        required: false },
    { key: 'legal_name',   label: 'Legal Name',   required: false },
    { key: 'address',      label: 'Address',      required: false },
    { key: 'site',         label: 'Site',         required: false },
    { key: 'state',        label: 'State',        required: false },
    { key: 'credit_limit', label: 'Credit Limit', required: false },
  ],
  ledger: [
    { key: 'date',               label: 'Date (YYYY-MM-DD)',     required: true  },
    { key: 'type',               label: 'Type',                  required: true,  hint: 'sell / purchase' },
    { key: 'party_name',         label: 'Party Name',            required: true  },
    { key: 'total_amount',       label: 'Total Amount',          required: true  },
    { key: 'invoice_no',         label: 'Invoice No',            required: false },
    { key: 'bill_no',            label: 'Bill No',               required: false },
    { key: 'seller_invoice_no',  label: 'Seller Invoice No',     required: false },
    { key: 'vehicle',            label: 'Vehicle',               required: false },
    { key: 'vehicle_rent',       label: 'Vehicle Rent',          required: false },
    { key: 'discount_amount',    label: 'Discount',              required: false },
    { key: 'address',            label: 'Address',               required: false },
    { key: 'notes',              label: 'Notes',                 required: false },
  ],
  transactions: [
    { key: 'date',                  label: 'Date (YYYY-MM-DD)',    required: true  },
    { key: 'type',                  label: 'Type',                 required: true,  hint: 'received / paid' },
    { key: 'party_name',            label: 'Party Name',           required: true  },
    { key: 'amount',                label: 'Amount',               required: true  },
    { key: 'payment_mode',          label: 'Payment Mode',         required: false, hint: 'Cash/UPI/Bank Transfer' },
    { key: 'payment_purpose',       label: 'Payment Purpose',      required: false },
    { key: 'transaction_reference', label: 'Bank Ref / UTR No',    required: false },
    { key: 'bill_no',               label: 'Bill No',              required: false },
    { key: 'notes',                 label: 'Notes',                required: false },
  ],
  expenses: [
    { key: 'date',     label: 'Date (YYYY-MM-DD)', required: true  },
    { key: 'category', label: 'Category',          required: true  },
    { key: 'amount',   label: 'Amount',            required: true  },
    { key: 'notes',    label: 'Notes',             required: false },
  ],
  vehicles: [
    { key: 'vehicle_number', label: 'Vehicle Number', required: true  },
    { key: 'model',          label: 'Model',          required: false },
    { key: 'driver_name',    label: 'Driver Name',    required: false },
    { key: 'driver_phone',   label: 'Driver Phone',   required: false },
  ],
};

const TEMPLATES: Record<ImportType, string> = {
  inventory:    'Item Name,Sale Rate,Purchase Rate,Opening Stock,Unit,HSN Code,GST %,GST Type,Min Stock Alert,Primary Supplier\nCement Bag 50kg,380,340,100,Bag,2523,18,exclusive,10,Ambuja Cements\nSteel Rod 12mm,72,68,500,Kg,7213,18,inclusive,50,Tata Steel',
  parties:      'Party Name,Role,Phone,GSTIN,Legal Name,Address,Site,State,Credit Limit\nRamesh Enterprises,customer,9876543210,27ABCDE1234F1Z5,Ramesh Pvt Ltd,Mumbai,Main Branch,Maharashtra,50000\nSuresh Traders,supplier,9123456789,,,,Warehouse,Delhi,',
  ledger:       'Date (YYYY-MM-DD),Type,Party Name,Total Amount,Invoice No,Bill No,Seller Invoice No,Vehicle,Vehicle Rent,Discount,Address,Notes\n2024-04-01,sell,Ramesh Enterprises,4500,INV/001,,,,0,0,,Cash\n2024-04-02,purchase,Suresh Traders,12000,,PO/001,SEL-001,MH12AB1234,2000,500,Mumbai,Monthly stock',
  transactions: 'Date (YYYY-MM-DD),Type,Party Name,Amount,Payment Mode,Payment Purpose,Bank Ref / UTR No,Bill No,Notes\n2024-04-01,received,Ramesh Enterprises,5000,UPI,Bill Payment,UTR123456789,,Against INV/001\n2024-04-02,paid,Suresh Traders,12000,Bank Transfer,Advance,NEFT987654321,PO/001,',
  expenses:     'Date (YYYY-MM-DD),Category,Amount,Notes\n2024-04-01,Fuel,500,Delivery truck\n2024-04-02,Electricity,3200,Monthly bill',
  vehicles:     'Vehicle Number,Model,Driver Name,Driver Phone\nMH12AB1234,Tata Ace,Raju,9876543210\nMH14CD5678,Mahindra Bolero,Sunil,9123456789',
};

const COLLECTION: Record<ImportType, string> = {
  inventory: 'inventory', parties: 'parties', ledger: 'ledger_entries',
  transactions: 'transactions', expenses: 'expenses', vehicles: 'vehicles',
};

function parseCSV(text: string): string[][] {
  return text.split(/\r?\n/).filter(l => l.trim()).map(line => {
    const row: string[] = []; let cell = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if ((c === ',' || c === '\t') && !inQ) { row.push(cell.trim()); cell = ''; } else cell += c;
    }
    row.push(cell.trim()); return row;
  });
}

function validateRow(row: Record<string, string>, type: ImportType): string[] {
  const errs: string[] = [];
  for (const col of SCHEMA[type]) {
    if (col.required && !row[col.key]?.trim()) errs.push(`"${col.label}" is required`);
  }
  if (type === 'inventory') {
    if (row.sale_rate && isNaN(+row.sale_rate)) errs.push('Sale Rate must be a number');
    if (row.purchase_rate && row.purchase_rate && isNaN(+row.purchase_rate)) errs.push('Purchase Rate must be a number');
    if (row.price_type && !['inclusive','exclusive'].includes(row.price_type.toLowerCase().trim())) errs.push('GST Type must be inclusive or exclusive');
  }
  if (type === 'parties') {
    const r = row.role?.toLowerCase().trim();
    if (r && r !== 'customer' && r !== 'supplier') errs.push('Role must be customer or supplier');
    if (row.gstin && row.gstin.trim() && row.gstin.trim().length !== 15) errs.push('GSTIN must be 15 characters');
  }
  if (type === 'ledger') {
    const t = row.type?.toLowerCase().trim();
    if (t && t !== 'sell' && t !== 'purchase') errs.push('Type must be sell or purchase');
    if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date.trim())) errs.push('Date must be YYYY-MM-DD');
    if (row.total_amount && isNaN(+row.total_amount)) errs.push('Total Amount must be a number');
  }
  if (type === 'transactions') {
    const t = row.type?.toLowerCase().trim();
    if (t && t !== 'received' && t !== 'paid') errs.push('Type must be received or paid');
    if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date.trim())) errs.push('Date must be YYYY-MM-DD');
    if (row.amount && isNaN(+row.amount)) errs.push('Amount must be a number');
  }
  if (type === 'expenses') {
    if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date.trim())) errs.push('Date must be YYYY-MM-DD');
    if (row.amount && isNaN(+row.amount)) errs.push('Amount must be a number');
  }
  return errs;
}

function transformRow(row: Record<string, string>, type: ImportType): any {
  const ts = new Date().toISOString();
  if (type === 'inventory') return {
    name: row.name?.trim(), sale_rate: +row.sale_rate || 0, purchase_rate: +row.purchase_rate || 0,
    current_stock: +row.quantity || 0, unit: row.unit?.trim() || 'Pcs', hsn_code: row.hsn_code?.trim() || '',
    gst_percent: +row.gst_percent || 0, price_type: row.price_type?.toLowerCase().trim() || 'exclusive',
    min_stock: +row.min_stock || 5, primary_supplier: row.primary_supplier?.trim() || '',
    created_at: ts, source: 'bulk_import',
  };
  if (type === 'parties') return {
    name: row.name?.trim(), role: row.role?.toLowerCase().trim() || 'customer',
    contact: row.contact?.trim() || '', gstin: row.gstin?.trim().toUpperCase() || '',
    legal_name: row.legal_name?.trim() || '', address: row.address?.trim() || '',
    site: row.site?.trim() || '', state: row.state?.trim() || '',
    credit_limit: +row.credit_limit || 0, created_at: ts, source: 'bulk_import',
  };
  if (type === 'transactions') return {
    date: row.date?.trim(), type: row.type?.toLowerCase().trim() || 'received',
    party_name: row.party_name?.trim(), amount: +row.amount || 0,
    payment_mode: row.payment_mode?.trim() || '', payment_purpose: row.payment_purpose?.trim() || '',
    transaction_reference: row.transaction_reference?.trim().toUpperCase() || '',
    bill_no: row.bill_no?.trim() || '', notes: row.notes?.trim() || '',
    created_at: ts, source: 'bulk_import',
  };
  if (type === 'expenses') return {
    date: row.date?.trim(), category: row.category?.trim() || '',
    amount: +row.amount || 0, notes: row.notes?.trim() || '',
    created_at: ts, source: 'bulk_import',
  };
  if (type === 'vehicles') return {
    vehicle_number: row.vehicle_number?.trim().toUpperCase() || '',
    model: row.model?.trim() || '', driver_name: row.driver_name?.trim() || '',
    driver_phone: row.driver_phone?.trim() || '', created_at: ts, source: 'bulk_import',
  };
  // ledger
  return {
    date: row.date?.trim(), type: row.type?.toLowerCase().trim() || 'sell',
    party_name: row.party_name?.trim(), total_amount: +row.total_amount || 0,
    invoice_no: row.invoice_no?.trim() || '', bill_no: row.bill_no?.trim() || '',
    seller_invoice_no: row.seller_invoice_no?.trim() || '',
    vehicle: row.vehicle?.trim() || '', vehicle_rent: +row.vehicle_rent || 0,
    discount_amount: +row.discount_amount || 0, address: row.address?.trim() || '',
    notes: row.notes?.trim() || '', items: [], created_at: ts, source: 'bulk_import',
  };
}

const GCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>{children}</div>
);

interface Props { user: any; settings: any; onBack: () => void; }

const BulkImportView: React.FC<Props> = ({ user, settings, onBack }) => {
  const { showToast } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep]           = useState<Step>('type');
  const [type, setType]           = useState<ImportType>('inventory');
  const [headers, setHeaders]     = useState<string[]>([]);
  const [rawRows, setRawRows]     = useState<string[][]>([]);
  const [mapping, setMapping]     = useState<Record<string, string>>({});
  const [rows, setRows]           = useState<RowResult[]>([]);
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<ImportResult | null>(null);
  const [showAll, setShowAll]     = useState(false);

  const TYPE_INFO: Record<ImportType, { Icon: any; label: string; color: string; bg: string; border: string }> = {
    inventory:    { Icon: Package,  label: 'Inventory Items',               color: '#34d399', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.25)'  },
    parties:      { Icon: Users,    label: 'Parties (Customers/Suppliers)', color: '#60a5fa', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)'  },
    ledger:       { Icon: FileText, label: 'Ledger Entries',                color: '#a78bfa', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)' },
    transactions: { Icon: Wallet,   label: 'Transactions (Payments)',       color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
    expenses:     { Icon: Receipt,  label: 'Expenses',                      color: '#f87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)'  },
    vehicles:     { Icon: Truck,    label: 'Vehicles',                      color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.25)' },
  };
  const ti = TYPE_INFO[type];

  const validRows   = useMemo(() => rows.filter(r => r.errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter(r => r.errors.length > 0),  [rows]);
  const displayRows = showAll ? rows : (invalidRows.length ? invalidRows : rows);

  const dlTemplate = () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([TEMPLATES[type]], { type: 'text/csv' })), download: `${type}_template.csv` });
    a.click();
  };

  const parseFile = useCallback(async (file: File) => {
    try {
      const all = parseCSV(await file.text());
      if (all.length < 2) { showToast('File needs header row + data rows', 'error'); return; }
      const hdrs = all[0]; const data = all.slice(1).slice(0, 1000);
      setHeaders(hdrs); setRawRows(data);
      const auto: Record<string, string> = {};
      for (const col of SCHEMA[type]) {
        const m = hdrs.find(h => h.toLowerCase().replace(/[\s_-]/g,'').includes(col.key.replace(/_/g,'').toLowerCase()) || h.toLowerCase().split(' ')[0] === col.label.toLowerCase().split(' ')[0]);
        if (m) auto[col.key] = m;
      }
      setMapping(auto); setStep('map');
    } catch { showToast('Could not read file — use CSV format', 'error'); }
  }, [type]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ''; };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f); };

  const buildPreview = () => {
    setRows(rawRows.map(row => {
      const mapped: Record<string, string> = {};
      for (const col of SCHEMA[type]) { const h = mapping[col.key]; mapped[col.key] = h ? (row[headers.indexOf(h)] ?? '') : ''; }
      return { mapped, errors: validateRow(mapped, type) };
    }));
    setStep('preview');
  };

  const runImport = async () => {
    setImporting(true); let success = 0, skipped = invalidRows.length; const rowErrors: string[] = [];
    try {
      for (let i = 0; i < validRows.length; i++) {
        try { await ApiService.add(user.uid, COLLECTION[type], transformRow(validRows[i].mapped, type)); success++; }
        catch (e: any) { rowErrors.push(`Row ${i+1}: ${e.message}`); skipped++; }
      }
      setResult({ success, skipped, rowErrors }); setStep('done');
      showToast(`Imported ${success} records!`, 'success');
    } catch (e: any) { showToast('Import failed: ' + e.message, 'error'); }
    finally { setImporting(false); }
  };

  const reset = () => { setStep('type'); setHeaders([]); setRawRows([]); setMapping({}); setRows([]); setResult(null); };
  const STEPS: Step[] = ['type','upload','map','preview','done'];
  const si = STEPS.indexOf(step);

  return (
    <div className="h-full overflow-y-auto pb-28" style={{ background: '#0b0e1a' }}>
      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pb-3" style={{paddingTop: 'max(16px, calc(env(safe-area-inset-top, 0px) + 8px))',  background: 'rgba(11,14,26,0.96)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 rounded-xl active:scale-95" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.7)' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-black text-white">Bulk Import</h1>
            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.4)' }}>CSV · Excel · Google Sheets</p>
          </div>
        </div>
        {/* Step bar */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black transition-all"
                style={i === si ? { background: ti.bg, color: ti.color, border: `1px solid ${ti.border}` }
                     : i < si  ? { background: 'rgba(52,211,153,0.1)', color: '#34d399' }
                                : { color: 'rgba(148,163,184,0.3)' }}>
                {i < si && '✓ '}{s}
              </div>
              {i < 4 && <div className="flex-1 h-px" style={{ background: i < si ? '#34d399' : 'rgba(255,255,255,0.07)' }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* STEP 1 — TYPE */}
        {step === 'type' && (
          <>
            <p className="text-sm font-bold" style={{ color: 'rgba(148,163,184,0.6)' }}>What would you like to import?</p>
            {(Object.entries(TYPE_INFO) as [ImportType, typeof ti][]).map(([t, m]) => {
              const sel = type === t;
              return (
                <button key={t} onClick={() => setType(t)} className="w-full flex items-center gap-4 p-4 rounded-2xl active:scale-[0.98] transition-all"
                  style={sel ? { background: m.bg, border: `1.5px solid ${m.border}` } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: sel ? `${m.color}22` : 'rgba(255,255,255,0.06)', border: `1px solid ${sel ? m.border : 'rgba(255,255,255,0.08)'}` }}>
                    <m.Icon size={22} style={{ color: sel ? m.color : 'rgba(148,163,184,0.5)' }} />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-black text-sm" style={{ color: sel ? m.color : 'rgba(226,232,240,0.85)' }}>{m.label}</p>
                    <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>
                      {t === 'inventory' ? 'Name, rate, stock, HSN, GST type' : t === 'parties' ? 'Customers & suppliers with GSTIN, state' : t === 'ledger' ? 'Sales & purchase entries with vehicle' : t === 'transactions' ? 'Payments received & paid with UTR' : t === 'expenses' ? 'Date, category, amount' : 'Vehicle number, driver details'}
                    </p>
                  </div>
                  {sel && <CheckCircle2 size={18} style={{ color: m.color }} />}
                </button>
              );
            })}
            <button onClick={() => setStep('upload')} className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: 'white', boxShadow: '0 8px 24px rgba(79,70,229,0.4)' }}>
              Continue <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* STEP 2 — UPLOAD */}
        {step === 'upload' && (
          <>
            <GCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">Download Template</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>Fill this CSV and upload below</p>
                </div>
                <button onClick={dlTemplate} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black flex-shrink-0 active:scale-95"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
                  <Download size={13} /> Template
                </button>
              </div>
              <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-3 py-1 text-[8px] font-bold uppercase tracking-widest" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.4)' }}>
                  Sample format
                </div>
                <pre className="px-3 py-2 text-[9px] font-mono overflow-x-auto" style={{ color: 'rgba(148,163,184,0.6)' }}>
                  {TEMPLATES[type].split('\n').slice(0, 3).join('\n')}
                </pre>
              </div>
            </GCard>

            <div onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-4 p-10 rounded-3xl border-2 border-dashed cursor-pointer active:scale-[0.98] transition-all"
              style={{ borderColor: `${ti.color}55`, background: `${ti.color}07` }}>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onFile} />
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${ti.color}18`, border: `1px solid ${ti.color}33` }}>
                <Upload size={28} style={{ color: ti.color }} />
              </div>
              <div className="text-center">
                <p className="font-black text-white text-sm">Drop your file here</p>
                <p className="text-[11px] mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>or tap to browse · CSV or TSV</p>
              </div>
            </div>

            <GCard>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2.5" style={{ color: 'rgba(148,163,184,0.4)' }}>How to export from your app</p>
              {[['Google Sheets','File → Download → CSV'],['Excel','File → Save As → CSV (Comma Delimited)'],['Numbers','File → Export To → CSV'],['OpenOffice','File → Save As → Text CSV']].map(([app, s]) => (
                <div key={app} className="flex gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: ti.color }} />
                  <p className="text-[10px] font-semibold" style={{ color: 'rgba(148,163,184,0.5)' }}><span className="font-black" style={{ color: 'rgba(226,232,240,0.7)' }}>{app}: </span>{s}</p>
                </div>
              ))}
            </GCard>

            <button onClick={() => setStep('type')} className="w-full py-3 rounded-2xl font-black text-sm active:scale-95"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.6)' }}>← Back</button>
          </>
        )}

        {/* STEP 3 — MAP */}
        {step === 'map' && (
          <>
            <GCard>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-black text-white">Match Columns</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>{rawRows.length} rows in your file</p>
                </div>
                <span className="text-[10px] font-black px-2.5 py-1.5 rounded-xl" style={{ background: ti.bg, color: ti.color, border: `1px solid ${ti.border}` }}>
                  {SCHEMA[type].filter(c => mapping[c.key]).length}/{SCHEMA[type].length} mapped
                </span>
              </div>
              {SCHEMA[type].map(col => {
                const mapped = !!mapping[col.key];
                return (
                  <div key={col.key} className="flex items-center gap-3 p-3 rounded-xl mb-2 transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: mapped ? `1px solid ${ti.border}` : '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black" style={{ color: mapped ? ti.color : 'rgba(226,232,240,0.7)' }}>{col.label}</span>
                        {col.required && <span className="text-[9px] font-black text-red-400">*</span>}
                      </div>
                      {col.hint && <p className="text-[9px] mt-0.5" style={{ color: 'rgba(148,163,184,0.35)' }}>{col.hint}</p>}
                    </div>
                    <select value={mapping[col.key] || ''} onChange={e => setMapping(m => ({ ...m, [col.key]: e.target.value }))}
                      className="text-[11px] font-bold rounded-xl px-2.5 py-1.5 outline-none max-w-[48%]"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(226,232,240,0.9)' }}>
                      <option value="">— Skip —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                );
              })}
            </GCard>

            <GCard>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(148,163,184,0.4)' }}>Your file's column headers</p>
              <div className="flex flex-wrap gap-1.5">
                {headers.map(h => (
                  <span key={h} className="text-[9px] font-bold px-2.5 py-1 rounded-lg"
                    style={{ background: Object.values(mapping).includes(h) ? ti.bg : 'rgba(255,255,255,0.06)', color: Object.values(mapping).includes(h) ? ti.color : 'rgba(148,163,184,0.6)', border: `1px solid ${Object.values(mapping).includes(h) ? ti.border : 'rgba(255,255,255,0.08)'}` }}>
                    {h}
                  </span>
                ))}
              </div>
            </GCard>

            <div className="flex gap-3">
              <button onClick={() => setStep('upload')} className="flex-1 py-3.5 rounded-2xl font-black text-sm active:scale-95" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.6)' }}>← Back</button>
              <button onClick={buildPreview} disabled={SCHEMA[type].some(c => c.required && !mapping[c.key])} className="flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
                style={{ background: `linear-gradient(135deg,#4f46e5,#7c3aed)`, color: 'white' }}>
                <Eye size={15} /> Preview →
              </button>
            </div>
          </>
        )}

        {/* STEP 4 — PREVIEW */}
        {step === 'preview' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[{l:'Total',v:rows.length,c:'#60a5fa',bg:'rgba(59,130,246,0.12)'},{l:'Ready',v:validRows.length,c:'#34d399',bg:'rgba(16,185,129,0.12)'},{l:'Errors',v:invalidRows.length,c:'#f87171',bg:'rgba(239,68,68,0.1)'}].map((s, i) => (
                <div key={i} className="py-3 rounded-2xl text-center" style={{ background: s.bg, border: `1px solid ${s.c}33` }}>
                  <p className="text-2xl font-black" style={{ color: s.c }}>{s.v}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide mt-0.5" style={{ color: `${s.c}99` }}>{s.l}</p>
                </div>
              ))}
            </div>

            {invalidRows.length > 0 && validRows.length > 0 && (
              <button onClick={() => setShowAll(v => !v)} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black active:scale-95"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.6)' }}>
                {showAll ? <><EyeOff size={12} /> Show errors only</> : <><Eye size={12} /> Show all rows</>}
              </button>
            )}

            <div className="space-y-2 max-h-[52vh] overflow-y-auto">
              {displayRows.map((r, i) => {
                const hasErr = r.errors.length > 0;
                const nameKey = type === 'ledger' ? 'party_name' : 'name';
                return (
                  <div key={i} className="rounded-2xl overflow-hidden"
                    style={{ background: hasErr ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.05)', border: `1px solid ${hasErr ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)'}` }}>
                    <button onClick={() => setExpanded(expanded === i ? null : i)} className="w-full flex items-center gap-3 px-3 py-2.5">
                      {hasErr ? <XCircle size={15} style={{ color: '#f87171', flexShrink: 0 }} /> : <CheckCircle2 size={15} style={{ color: '#34d399', flexShrink: 0 }} />}
                      <span className="text-xs font-bold flex-1 text-left truncate" style={{ color: 'rgba(226,232,240,0.85)' }}>{r.mapped[nameKey] || `Row ${i+1}`}</span>
                      {hasErr && <span className="text-[9px] font-black px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171' }}>{r.errors.length} error{r.errors.length > 1 ? 's' : ''}</span>}
                    </button>
                    {expanded === i && (
                      <div className="px-3 pb-3 space-y-2">
                        {hasErr && r.errors.map((e, j) => (
                          <div key={j} className="flex items-start gap-1.5"><AlertTriangle size={10} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} /><span className="text-[10px] font-semibold" style={{ color: '#f87171' }}>{e}</span></div>
                        ))}
                        <div className="grid grid-cols-2 gap-1.5 mt-1">
                          {Object.entries(r.mapped).filter(([, v]) => v).map(([k, v]) => (
                            <div key={k} className="px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                              <p className="text-[8px] font-bold uppercase" style={{ color: 'rgba(148,163,184,0.4)' }}>{k}</p>
                              <p className="text-[10px] font-bold truncate" style={{ color: 'rgba(203,213,225,0.8)' }}>{v}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {invalidRows.length > 0 && (
              <div className="flex items-start gap-2.5 p-3 rounded-2xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={14} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }} />
                <p className="text-[11px] font-semibold leading-relaxed" style={{ color: 'rgba(251,191,36,0.8)' }}>
                  {invalidRows.length} row{invalidRows.length > 1 ? 's' : ''} with errors will be skipped. Fix in your file and re-import, or proceed to import {validRows.length} valid rows.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('map')} className="flex-1 py-3.5 rounded-2xl font-black text-sm active:scale-95" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.6)' }}>← Back</button>
              <button onClick={runImport} disabled={importing || validRows.length === 0} className="flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: 'white' }}>
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {importing ? 'Importing…' : `Import ${validRows.length}`}
              </button>
            </div>
          </>
        )}

        {/* STEP 5 — DONE */}
        {step === 'done' && result && (
          <div className="flex flex-col items-center text-center gap-6 py-6">
            <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)' }}>
              <CheckCircle2 size={44} style={{ color: '#34d399' }} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Import Complete!</h2>
              <p className="text-sm mt-1 font-semibold" style={{ color: 'rgba(148,163,184,0.5)' }}>Records added to your {TYPE_INFO[type].label}</p>
            </div>
            <div className="w-full grid grid-cols-2 gap-3">
              {[{l:'Imported',v:result.success,c:'#34d399',bg:'rgba(16,185,129,0.12)'},{l:'Skipped',v:result.skipped,c:'#f87171',bg:'rgba(239,68,68,0.1)'}].map((s, i) => (
                <div key={i} className="py-4 rounded-2xl" style={{ background: s.bg, border: `1px solid ${s.c}33` }}>
                  <p className="text-3xl font-black" style={{ color: s.c }}>{s.v}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5" style={{ color: `${s.c}88` }}>{s.l}</p>
                </div>
              ))}
            </div>
            {result.rowErrors.length > 0 && (
              <div className="w-full text-left p-3 rounded-2xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-[10px] font-black text-red-400 mb-1.5">Row import errors:</p>
                {result.rowErrors.slice(0, 5).map((e, i) => <p key={i} className="text-[9px] font-semibold" style={{ color: 'rgba(248,113,113,0.7)' }}>{e}</p>)}
              </div>
            )}
            <div className="w-full flex gap-3">
              <button onClick={reset} className="flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.7)' }}>
                <RefreshCw size={15} /> Import More
              </button>
              <button onClick={onBack} className="flex-1 py-3.5 rounded-2xl font-black text-sm active:scale-95" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: 'white' }}>Done ✓</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkImportView;






