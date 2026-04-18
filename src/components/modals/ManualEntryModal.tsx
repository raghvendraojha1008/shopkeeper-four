import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User } from 'firebase/auth';
import { ArrowLeft, Save } from 'lucide-react';
import { ApiService } from '../../services/api';
import { SyncQueueService } from '../../services/syncQueue';
import { GSTService } from '../../services/gstApi';
import { AppSettings } from '../../types';
import { haptic } from '../../utils/haptics';
import { useUI } from '../../context/UIContext';
import { getIDForEntry } from '../../utils/idGenerator';

// IMPORT SUB-COMPONENTS
import { InventoryForm, PartyForm, VehicleForm, ExpenseForm } from './manual/SimpleForms';
import { OrderForm, TransactionForm } from './manual/TransactionForms';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'sales' | 'purchases' | 'transactions' | 'inventory' |
        'expenses' | 'vehicles' | 'parties';
  user: User | null;
  initialData?: any;
  appSettings: AppSettings;
  onSuccess?: (data: any) => void;
  onLocalSave?: (data: any) => void;
}

const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ isOpen, onClose, type, user, initialData, appSettings, onSuccess, onLocalSave }) => {
  const { showToast } = useUI();
  const [loading, setLoading] = useState(false);
  const [gstFetching, setGstFetching] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [items, setItems] = useState<any[]>([{ item_name: '', quantity: '', rate: '', hsn_code: '', gst_percent: '', unit: 'Pcs', total: 0, price_type: 'exclusive' }]);

  // NEW: State for Auto-Add Party Checkbox (Default ON)
  const [autoAddParty, setAutoAddParty] = useState(true);

  const [linkedPayments, setLinkedPayments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [vehicleList, setVehicleList] = useState<string[]>([]);
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [ledgerRecords, setLedgerRecords] = useState<any[]>([]);

  // FIX (Critical #1): Guard ref prevents the form-init block from running more than once
  // per modal open, even if parent causes re-renders while the async load() is in flight.
  const initializedRef = useRef(false);

  // ── EFFECT 1: runs ONCE on open — initialises formData immediately ──────────────
  // Separated from the async data-load effect so a parent re-render can never
  // wipe out what the user has already typed.
  useEffect(() => {
    if (!isOpen) {
      // Reset guard when modal closes so next open reinitialises correctly.
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (initialData) {
      setFormData(initialData);
      if (initialData.items) setItems(initialData.items);
    } else {
      const init: any = { date: new Date().toISOString().split('T')[0] };
      if (type === 'transactions') {
        init.type = 'received';
        init.transaction_id = getIDForEntry('received');
      }
      if (type === 'sales') {
        init.invoice_no = getIDForEntry('sell');
      }
      if (type === 'purchases') {
        init.bill_no = getIDForEntry('purchase');
      }
      setFormData(init);
      setItems([{ item_name: '', quantity: '', rate: '', hsn_code: '', gst_percent: '', unit: 'Pcs', total: 0, price_type: 'exclusive' }]);
    }
    setLinkedPayments([]);
    setAutoAddParty(true);
  }, [isOpen]); // intentionally omit initialData/type — we only want this once per open

  // ── EFFECT 2: async data load — never touches formData directly ───────────────
  useEffect(() => {
    if (!isOpen || !user) return;

    const load = async () => {
      const [parties, inv, veh, ledger] = await Promise.all([
        ApiService.getAll(user.uid, 'parties'),
        ApiService.getAll(user.uid, 'inventory'),
        ApiService.getAll(user.uid, 'vehicles'),
        (type === 'transactions' || type === 'sales' || type === 'purchases')
          ? ApiService.getAll(user.uid, 'ledger_entries')
          : Promise.resolve({ docs: [] })
      ]);

      const p = parties.docs.map((d: any) => d.data());
      setCustomers(p.filter((x: any) => x.role === 'customer'));
      setSuppliers(p.filter((x: any) => x.role === 'supplier'));

      const invData = inv.docs.map((d: any) => d.data());
      setInventoryList(invData);
      setItemNames(invData.map((d: any) => d.name));

      setVehicleList(veh.docs.map((d: any) => d.data().vehicle_number));

      const ledgerDocs = ledger.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setLedgerRecords(ledgerDocs);

      if (type === 'transactions') {
        setAvailableOrders(ledgerDocs);
      }

      if (initialData && (type === 'sales' || type === 'purchases')) {
        const refNo = type === 'sales' ? initialData.invoice_no : initialData.bill_no;
        if (refNo) {
          const allTrans = await ApiService.getAll(user.uid, 'transactions');
          const relevant = allTrans.docs
            .map((d: any) => ({ id: d.id, ...d.data() }))
            .filter((t: any) => String(t.bill_no) === String(refNo));
          setLinkedPayments(relevant);
        }
      }

      // FIX (Critical #2): Only auto-set invoice_no if the field is still empty/untouched.
      // Previously this ran unconditionally after the async fetch and silently overwrote
      // any invoice number the user had already typed.
      if (!initialData && type === 'sales') {
        const maxNum = ledgerDocs
          .filter((d: any) => d.type === 'sell')
          .reduce((max: number, curr: any) => {
            const raw = String(curr['invoice_no'] || '0');
            const digits = raw.replace(/^[^0-9]*/, '');
            const num = parseInt(digits || '0', 10);
            return !isNaN(num) && num > max ? num : max;
          }, 0);
        setFormData((prev: any) => {
          // Guard: only set if still untouched
          if (prev.invoice_no) return prev;
          return { ...prev, invoice_no: maxNum + 1 };
        });
      }
    };

    load();
  }, [isOpen, user, type]); // intentionally excludes initialData to avoid re-running on edit open

  const handleChange = (field: string, value: any) => {
    setFormData((p: any) => {
      const newState = { ...p, [field]: value };
      if (field === 'party_name') {
        const allParties = [...customers, ...suppliers];
        const matchedParty = allParties.find(party => party.name === value);
        if (matchedParty && matchedParty.address) {
          newState.address = matchedParty.address;
        }
        if (type === 'sales') newState.paid_by = value;
        else if (type === 'purchases') newState.paid_to = value;
      }
      // When user picks a linked invoice/bill, extract the invoice_no and store as bill_no
      if (field === 'linked_invoice') {
        const invoicePart = String(value).split(' | ')[0]?.trim();
        newState.bill_no = (invoicePart && invoicePart !== 'No Inv') ? invoicePart : '';
      }
      return newState;
    });
  };

  const handleFetchGSTIN = async () => {
    if (!formData.gstin || formData.gstin.length !== 15) return showToast('Invalid GSTIN', 'error');
    setGstFetching(true);
    try {
      const data = await GSTService.fetchDetails(formData.gstin);
      if (data) {
        setFormData((prev: any) => ({
          ...prev,
          name: data.tradeName || data.legalName || prev.name,
          legal_name: (data.legalName && data.legalName !== data.tradeName) ? data.legalName : '',
          address: data.address || '',
          gstin: formData.gstin
        }));
        showToast('GST Details Fetched', 'success');
      }
    } catch (e) {
      showToast('Failed to fetch GST details', 'error');
    } finally {
      setGstFetching(false);
    }
  };

  const activePartyList = useMemo(() => {
    const custNames = customers.map(c => c.name);
    const suppNames = suppliers.map(s => s.name);
    if (type === 'sales') return custNames;
    if (type === 'purchases') return suppNames;
    if (type === 'transactions') return formData.type === 'received' ? custNames : suppNames;
    return [...custNames, ...suppNames];
  }, [type, formData.type, customers, suppliers]);

  const filteredOrders = useMemo(() => {
    if (type !== 'transactions') return [];
    const relevantType = formData.type === 'received' ? 'sell' : 'purchase';
    return availableOrders
      .filter(o => o.type === relevantType)
      .map(o => `${o.invoice_no || 'No Inv'} | ${o.party_name} | ${o.date}`);
  }, [availableOrders, formData.type, type]);

  const handleItemChange = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };

      if (field === 'item_name') {
        const matchedItem = inventoryList.find(x => x.name === value);
        if (matchedItem) {
          updated.hsn_code = matchedItem.hsn_code || '';
          updated.gst_percent = matchedItem.gst_percent || '';
          updated.rate = type === 'sales' ? (matchedItem.sale_rate || '') : (matchedItem.purchase_rate || '');
          updated.unit = matchedItem.unit || 'Pcs';
          updated.price_type = matchedItem.price_type || 'exclusive';
        }
      }

      const rate = Number(updated.rate) || 0;
      const gst = Number(updated.gst_percent) || 0;

      if (field === 'total') {
        const newTotal = Number(value) || 0;
        updated.total = newTotal;
        if (rate > 0) {
          const effectiveRate = updated.price_type === 'inclusive' ? rate : rate * (1 + gst / 100);
          updated.quantity = (newTotal / effectiveRate).toFixed(2);
        } else {
          updated.quantity = 0;
        }
      } else {
        const qty = Number(updated.quantity) || 0;
        if (updated.price_type === 'inclusive') updated.total = qty * rate;
        else updated.total = (qty * rate) * (1 + gst / 100);
      }
      return updated;
    }));
  };

  const calculateTotal = () => {
    const itemsTotal = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const rent = Number(formData.vehicle_rent) || 0;
    const discount = Number(formData.discount_amount) || 0;
    return itemsTotal + rent - discount;
  };

  const handleRemoveLinkedPayment = async (index: number, payment: any) => {
    if (!payment._isNew && payment.id) {
      try {
        if (navigator.onLine) {
          await ApiService.delete(user!.uid, 'transactions', payment.id);
          showToast("Payment record deleted", "success");
        } else {
          SyncQueueService.addToQueue(user!.uid, 'delete', 'transactions', {}, payment.id);
          showToast("Deletion queued — will apply when online", "info");
        }
      } catch (e) {
        console.error(e);
        showToast("Failed to delete payment", "error");
        return;
      }
    }
    setLinkedPayments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!user || loading) return;

    // FIX (Issue #8): Validate required fields before saving to Firestore.
    // Previously a user could tap Save on a completely blank form and an empty
    // document would be written. These are the minimum viable checks.
    if (!formData.date) {
      showToast("Please enter a date", "error");
      return;
    }
    if (
      (type === 'sales' || type === 'purchases' || type === 'transactions') &&
      !formData.party_name?.trim()
    ) {
      showToast("Please enter a party name", "error");
      return;
    }
    if (
      (type === 'sales' || type === 'purchases') &&
      !items.some((i: any) => i.item_name?.trim())
    ) {
      showToast("Please add at least one item", "error");
      return;
    }

    setLoading(true);
    haptic.medium();
    try {
      const payload: any = JSON.parse(JSON.stringify(formData));
      let collection = '';

      // --- AUTO ADD PARTY LOGIC ---
      if (autoAddParty && payload.party_name &&
        (type === 'sales' || type === 'purchases' || type === 'transactions')) {

        let role = 'customer';
        if (type === 'purchases') role = 'supplier';
        if (type === 'transactions' && payload.type === 'paid') role = 'supplier';

        // FIX (Medium #2): Case-insensitive duplicate check to prevent "Rahul Traders" / "rahul traders" duplicates
        const exists = [...customers, ...suppliers].some(
          p => (p.name || '').toLowerCase() === (payload.party_name || '').toLowerCase()
        );

        if (!exists) {
          const newParty = {
            name: payload.party_name,
            role: role,
            address: payload.address || '',
            contact: '',
            created_at: new Date().toISOString()
          };
          if (navigator.onLine) {
            await ApiService.add(user.uid, 'parties', newParty);
          } else {
            SyncQueueService.addToQueue(user.uid, 'create', 'parties', newParty);
          }
        }
      }
      // ----------------------------

      if (type === 'sales' || type === 'purchases') {
        collection = 'ledger_entries';
        payload.items = items;
        payload.total_amount = calculateTotal();
        payload.type = type === 'sales' ? 'sell' : 'purchase';

        if (!initialData?.id) {
          if (type === 'sales' && !payload.invoice_no) {
            payload.invoice_no = getIDForEntry('sell');
          } else if (type === 'purchases' && !payload.bill_no) {
            payload.bill_no = getIDForEntry('purchase');
          }
        }
      } else if (type === 'transactions') {
        collection = 'transactions';
        payload.amount = Number(payload.amount);

        if (!initialData?.id && !payload.transaction_id) {
          payload.transaction_id = getIDForEntry(payload.type as 'received' | 'paid');
        }
      } else if (type === 'inventory') {
        collection = 'inventory';
        payload.sale_rate = Number(payload.sale_rate) || 0;
        payload.purchase_rate = Number(payload.purchase_rate) || 0;
        payload.quantity = Number(payload.quantity) || 0;
        payload.min_stock = Number(payload.min_stock) || 0;

        // FIX (Issue #3): InventoryForm saves opening stock to `payload.quantity`
        // but every view that tracks stock reads `item.current_stock`. For new
        // items, sync current_stock from quantity so stock is never zero on create.
        // For edits we do NOT overwrite current_stock — it is managed by sale/purchase
        // auto-deductions and should not be reset to the opening quantity on every edit.
        if (!initialData?.id) {
          payload.current_stock = payload.quantity;
        }

        if (!initialData?.id && !payload.item_id) {
          payload.item_id = getIDForEntry('inventory');
        }
      } else if (type === 'expenses') collection = 'expenses';
      else if (type === 'vehicles') collection = 'vehicles';
      else if (type === 'parties') {
        collection = 'parties';

        if (!initialData?.id && !payload.party_id) {
          payload.party_id = getIDForEntry('party', payload.role);
        }
      }

      if (onLocalSave) {
        const newLinkedPayments = linkedPayments.filter(p => p._isNew);
        onLocalSave({ ...payload, collection, _linkedPayments: newLinkedPayments });
        onClose();
        haptic.success();
        return;
      }

      const isOffline = !navigator.onLine;

      if (initialData?.id) {
        if (isOffline) {
          SyncQueueService.addToQueue(user.uid, 'update', collection, payload, initialData.id);
        } else {
          await ApiService.update(user.uid, collection, initialData.id, payload);
        }
      } else {
        payload.created_at = new Date().toISOString();
        if (isOffline) {
          SyncQueueService.addToQueue(user.uid, 'create', collection, payload);
        } else {
          await ApiService.add(user.uid, collection, payload);
        }
      }

      if (linkedPayments.length > 0) {
        const newPayments = linkedPayments.filter(p => p._isNew);
        const txType = type === 'sales' ? 'received' : 'paid';
        newPayments.forEach(pay => {
          const transPayload = {
            date: pay.date,
            amount: pay.amount,
            payment_mode: pay.payment_mode,
            payment_purpose: pay.payment_purpose,
            party_name: pay.party_name || payload.party_name,
            bill_no: pay.bill_no || payload.invoice_no || payload.bill_no,
            notes: pay.notes,
            created_at: new Date().toISOString(),
            type: txType,
            transaction_id: getIDForEntry(txType)
          };
          if (isOffline) {
            SyncQueueService.addToQueue(user.uid, 'create', 'transactions', transPayload);
          } else {
            ApiService.add(user.uid, 'transactions', transPayload);
          }
        });
        if (!isOffline) await new Promise(r => setTimeout(r, 0)); // flush microtasks
      }

      // Inventory auto-update — only when online (needs current stock read)
      if (!isOffline && (type === 'sales' || type === 'purchases') && appSettings.automation?.auto_update_inventory) {
        const isSale = type === 'sales';
        const invSnap = await ApiService.getAll(user.uid, 'inventory');
        const allInvDocs = invSnap.docs;

        const stockUpdates = (payload.items || []).map(async (lineItem: any) => {
          if (!lineItem.item_name) return;
          const match = allInvDocs.find((d: any) =>
            d.data().name?.toLowerCase() === lineItem.item_name?.toLowerCase()
          );
          if (!match) return;
          const current = Number(match.data().current_stock) || 0;
          const qty = Number(lineItem.quantity) || 0;
          const newStock = isSale ? Math.max(0, current - qty) : current + qty;
          await ApiService.update(user.uid, 'inventory', match.id, { current_stock: newStock });
        });
        await Promise.all(stockUpdates);
      }

      haptic.success();
      if (isOffline) {
        showToast('Saved offline — will sync when online', 'info');
      }
      onClose();
      onSuccess?.(payload);
    } catch (err) {
      console.error(err);
      showToast('Save failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;
  const staffList = appSettings.custom_lists?.staff || ['Owner', 'Manager', 'Staff'];

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex justify-center items-end p-0 backdrop-blur-md" style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
      <div className="w-full max-w-2xl rounded-t-3xl shadow-2xl h-auto flex flex-col border border-white/12 transform transition-all" style={{background:"#0d1120", maxHeight:'92dvh'}}>
        <div className="p-4 flex items-center gap-3 shrink-0 rounded-t-3xl border-b border-white/10" style={{background:"linear-gradient(135deg,rgba(79,70,229,0.25),rgba(124,58,237,0.15))"}}>
          <button onClick={onClose} className="p-2 rounded-full transition-all active:scale-90" style={{background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)'}}><ArrowLeft size={18}/></button>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-base leading-tight capitalize tracking-tight">
              {initialData ? 'Edit' : 'New'} {type === 'sales' ? 'Sale' : type === 'purchases' ? 'Purchase' : type === 'transactions' ? 'Payment' : type === 'inventory' ? 'Item' : type}
            </h2>
            <p className="text-[10px] font-bold text-[rgba(148,163,184,0.5)] mt-0.5">
              {type === 'sales' || type === 'purchases' ? 'Fill details + add items below' : 'Fill all required fields'}
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4 bg-[#0b0e1a]">

          {type === 'inventory' && <InventoryForm formData={formData} handleChange={handleChange} />}

          {type === 'parties' && <PartyForm formData={formData} handleChange={handleChange} handleFetchGSTIN={handleFetchGSTIN} gstFetching={gstFetching} />}

          {type === 'vehicles' && <VehicleForm formData={formData} handleChange={handleChange} />}

          {type === 'expenses' && <ExpenseForm formData={formData} handleChange={handleChange} expenseTypes={appSettings.custom_lists?.expense_types} />}

          {(type === 'sales' || type === 'purchases') && (
            <OrderForm
              type={type} formData={formData} handleChange={handleChange}
              items={items} setItems={setItems} itemNames={itemNames}
              handleItemChange={handleItemChange}
              customers={customers.map(c => c.name)}
              suppliers={suppliers.map(s => s.name)}
              vehicleList={vehicleList} staffList={staffList}
              calculateTotal={calculateTotal}
              linkedPayments={linkedPayments}
              setLinkedPayments={setLinkedPayments}
              onRemoveLinkedPayment={handleRemoveLinkedPayment}
              appSettings={appSettings}
              autoAddParty={autoAddParty}
              setAutoAddParty={setAutoAddParty}
            />
          )}

          {type === 'transactions' && (
            <TransactionForm
              formData={formData} handleChange={handleChange}
              activePartyList={activePartyList} filteredOrders={filteredOrders}
              availableOrders={availableOrders}
              appSettings={appSettings}
              autoAddParty={autoAddParty}
              setAutoAddParty={setAutoAddParty}
            />
          )}
        </form>
        <div className="shrink-0 border-t border-white/08 bg-[#0b0e1a]"
          style={{ padding: '12px 16px', paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }}>
          <button onClick={handleSubmit} disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3.5 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2">
            {loading ? 'Saving...' : <><Save size={20}/> Save Record</>}
          </button>
        </div>
      </div>
    </div>
  );
};
export default ManualEntryModal;


