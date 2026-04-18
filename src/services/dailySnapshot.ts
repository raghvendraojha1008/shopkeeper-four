import { Capacitor } from '@capacitor/core';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

// Directory.Documents = app-internal documents folder (works on all Android versions)
// On Android 10+, public external storage requires MANAGE_EXTERNAL_STORAGE which
// Google Play restricts. Instead we store privately and expose via Share sheet.
const SNAPSHOT_ROOT = 'ShopkeeperLedger/DailySnapshots';
const MAX_DAYS = 7;
const LAST_SNAPSHOT_KEY = 'last_daily_snapshot_date';

// ── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCSV(val: any): string {
  const s = String(val ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCSV(rows: any[], columns: { key: string; label: string }[]): string {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(row =>
    columns.map(c => escapeCSV(row[c.key])).join(',')
  );
  return [header, ...body].join('\r\n');
}

// ── Column definitions per data type ────────────────────────────────────────

const TRANSACTION_COLS = [
  { key: 'date',            label: 'Date' },
  { key: 'type',            label: 'Type' },
  { key: 'party_name',      label: 'Party' },
  { key: 'amount',          label: 'Amount' },
  { key: 'payment_mode',    label: 'Payment Mode' },
  { key: 'payment_purpose', label: 'Purpose' },
  { key: 'bill_no',         label: 'Bill No' },
  { key: 'transaction_id',  label: 'Transaction ID' },
  { key: 'notes',           label: 'Notes' },
  { key: 'created_at',      label: 'Created At' },
];

const LEDGER_COLS = [
  { key: 'date',           label: 'Date' },
  { key: 'type',           label: 'Type' },
  { key: 'party_name',     label: 'Party' },
  { key: 'invoice_no',     label: 'Invoice No' },
  { key: 'total_amount',   label: 'Total Amount' },
  { key: 'discount_amount',label: 'Discount' },
  { key: 'items_summary',  label: 'Items Summary' },
  { key: 'vehicle',        label: 'Vehicle' },
  { key: 'notes',          label: 'Notes' },
  { key: 'created_at',     label: 'Created At' },
];

const EXPENSE_COLS = [
  { key: 'date',       label: 'Date' },
  { key: 'category',   label: 'Category' },
  { key: 'amount',     label: 'Amount' },
  { key: 'notes',      label: 'Notes' },
  { key: 'created_at', label: 'Created At' },
];

const INVENTORY_COLS = [
  { key: 'name',           label: 'Item Name' },
  { key: 'unit',           label: 'Unit' },
  { key: 'current_stock',  label: 'Current Stock' },
  { key: 'min_stock',      label: 'Min Stock' },
  { key: 'sale_rate',      label: 'Sale Rate' },
  { key: 'purchase_rate',  label: 'Purchase Rate' },
  { key: 'gst_percent',    label: 'GST %' },
  { key: 'hsn_code',       label: 'HSN Code' },
  { key: 'price_type',     label: 'Price Type' },
  { key: 'primary_supplier', label: 'Primary Supplier' },
  { key: 'created_at',     label: 'Created At' },
];

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchAllDocs(userId: string, colName: string): Promise<any[]> {
  const ref = collection(db, `users/${userId}/${colName}`);
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── File system helpers ──────────────────────────────────────────────────────

async function ensureDir(path: string, Directory: any, Filesystem: any) {
  try {
    await Filesystem.mkdir({ path, directory: Directory.Documents, recursive: true });
  } catch (_) {}
}

async function writeSnapshotFile(
  dateStr: string,
  fileName: string,
  content: string,
  Filesystem: any,
  Directory: any,
  Encoding: any,
) {
  const dir = `${SNAPSHOT_ROOT}/${dateStr}`;
  await ensureDir(dir, Directory, Filesystem);
  await Filesystem.writeFile({
    path: `${dir}/${fileName}`,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export const DailySnapshotService = {

  /**
   * Run once per day on app start (native only).
   * Captures full snapshot of all data as CSVs to ExternalStorage,
   * which persists even if the app is deleted.
   */
  checkAndRunDailySnapshot: async (userId: string): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;

    const today = new Date().toISOString().split('T')[0];
    const lastRun = localStorage.getItem(LAST_SNAPSHOT_KEY);
    if (lastRun === today) return;

    try {
      await DailySnapshotService.createSnapshot(userId, today);
      localStorage.setItem(LAST_SNAPSHOT_KEY, today);
      await DailySnapshotService.rotateOldSnapshots();
    } catch (e) {
      console.error('[DailySnapshot] failed:', e);
    }
  },

  /**
   * Force-create a snapshot for a given date (always runs, native only).
   */
  createSnapshot: async (userId: string, dateStr: string): Promise<void> => {
    if (!Capacitor.isNativePlatform()) throw new Error('Snapshots only available on Android/iOS');

    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

    // Fetch all data in parallel
    const [transactions, ledgerEntries, expenses, inventory] = await Promise.all([
      fetchAllDocs(userId, 'transactions'),
      fetchAllDocs(userId, 'ledger_entries'),
      fetchAllDocs(userId, 'expenses'),
      fetchAllDocs(userId, 'inventory'),
    ]);

    // Flatten ledger items into a summary string per entry
    const ledgerWithSummary = ledgerEntries.map(entry => ({
      ...entry,
      items_summary: Array.isArray(entry.items)
        ? entry.items.map((it: any) => `${it.item_name}(${it.quantity}${it.unit ?? ''})`).join('; ')
        : '',
    }));

    // Build CSVs
    const txCsv  = buildCSV(transactions,     TRANSACTION_COLS);
    const ldCsv  = buildCSV(ledgerWithSummary, LEDGER_COLS);
    const exCsv  = buildCSV(expenses,          EXPENSE_COLS);
    const invCsv = buildCSV(inventory,         INVENTORY_COLS);

    // Write all 4 files
    await Promise.all([
      writeSnapshotFile(dateStr, 'transactions.csv', txCsv,  Filesystem, Directory, Encoding),
      writeSnapshotFile(dateStr, 'ledger.csv',       ldCsv,  Filesystem, Directory, Encoding),
      writeSnapshotFile(dateStr, 'expenses.csv',     exCsv,  Filesystem, Directory, Encoding),
      writeSnapshotFile(dateStr, 'inventory.csv',    invCsv, Filesystem, Directory, Encoding),
    ]);
  },

  /**
   * Delete snapshot folders older than MAX_DAYS (native only).
   */
  rotateOldSnapshots: async (): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');

      let entries: any[] = [];
      try {
        const result = await Filesystem.readdir({
          path: SNAPSHOT_ROOT,
          directory: Directory.Documents,
        });
        entries = result.files ?? [];
      } catch (_) {
        return;
      }

      // Keep only date-named folders (YYYY-MM-DD) sorted newest first
      const dateFolders = entries
        .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f.name))
        .sort((a, b) => (a.name > b.name ? -1 : 1));

      const toDelete = dateFolders.slice(MAX_DAYS);
      for (const folder of toDelete) {
        try {
          // Delete all files inside first
          const inner = await Filesystem.readdir({
            path: `${SNAPSHOT_ROOT}/${folder.name}`,
            directory: Directory.Documents,
          });
          for (const file of inner.files ?? []) {
            await Filesystem.deleteFile({
              path: `${SNAPSHOT_ROOT}/${folder.name}/${file.name}`,
              directory: Directory.Documents,
            });
          }
          await Filesystem.rmdir({
            path: `${SNAPSHOT_ROOT}/${folder.name}`,
            directory: Directory.Documents,
          });
        } catch (e) {
          console.warn('[DailySnapshot] rotation error for', folder.name, e);
        }
      }
    } catch (e) {
      console.warn('[DailySnapshot] rotate failed:', e);
    }
  },

  /**
   * List all available snapshot dates (newest first). Native only.
   */
  listSnapshotDates: async (): Promise<string[]> => {
    if (!Capacitor.isNativePlatform()) return [];

    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const result = await Filesystem.readdir({
        path: SNAPSHOT_ROOT,
        directory: Directory.Documents,
      });
      return (result.files ?? [])
        .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f.name))
        .map(f => f.name)
        .sort((a, b) => (a > b ? -1 : 1));
    } catch (_) {
      return [];
    }
  },

  /**
   * List CSV files inside a date folder. Native only.
   */
  listFilesForDate: async (dateStr: string): Promise<string[]> => {
    if (!Capacitor.isNativePlatform()) return [];

    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const result = await Filesystem.readdir({
        path: `${SNAPSHOT_ROOT}/${dateStr}`,
        directory: Directory.Documents,
      });
      return (result.files ?? [])
        .filter(f => f.name.endsWith('.csv'))
        .map(f => f.name)
        .sort();
    } catch (_) {
      return [];
    }
  },

  /**
   * Read a specific CSV file content. Native only.
   */
  readSnapshotFile: async (dateStr: string, fileName: string): Promise<string> => {
    if (!Capacitor.isNativePlatform()) throw new Error('Only available on Android/iOS');

    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const result = await Filesystem.readFile({
      path: `${SNAPSHOT_ROOT}/${dateStr}/${fileName}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return result.data as string;
  },

  /**
   * Share (download) a specific CSV file via the native share sheet. Native only.
   */
  shareSnapshotFile: async (dateStr: string, fileName: string): Promise<void> => {
    if (!Capacitor.isNativePlatform()) throw new Error('Only available on Android/iOS');

    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    // Copy file to cache for sharing
    const content = await DailySnapshotService.readSnapshotFile(dateStr, fileName);
    const shareName = `${dateStr}_${fileName}`;

    const result = await Filesystem.writeFile({
      path: shareName,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    let uri = result.uri;
    if (!uri) {
      const uriResult = await Filesystem.getUri({ path: shareName, directory: Directory.Cache });
      uri = uriResult.uri;
    }

    await Share.share({ title: shareName, url: uri });
  },
};
