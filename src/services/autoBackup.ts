import { Capacitor } from '@capacitor/core';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

const BACKUP_FOLDER = 'ShopkeeperLedger_Backups';
const MAX_BACKUPS = 7;
const BACKUP_HOUR = 2; // 2 AM default

const COLLECTIONS = ['ledger_entries', 'transactions', 'inventory', 'parties', 'vehicles', 'expenses', 'settings'];

/** Convert an array of objects to a CSV string with a header row */
function toCsv(headers: string[], rows: any[][]): string {
  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
}

/** Save a file to the Documents backup folder (native only) */
async function saveBackupFile(filename: string, content: string): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  try {
    await Filesystem.mkdir({ path: BACKUP_FOLDER, directory: Directory.Documents, recursive: true });
  } catch (_) {}
  await Filesystem.writeFile({
    path: `${BACKUP_FOLDER}/${filename}`,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
}

/** Save all detailed CSV files alongside the JSON backup */
async function saveDetailedCsvFiles(userId: string, dateStr: string, data: Record<string, any[]>): Promise<void> {
  // 1. Parties CSV
  const partyHeaders = ['id', 'name', 'role', 'contact', 'gstin', 'address', 'city', 'state', 'site', 'balance'];
  const partyRows = (data['parties'] || []).map((p: any) => [
    p.id, p.name, p.role, p.contact, p.gstin, p.address, p.city, p.state, p.site, p.balance ?? '',
  ]);
  await saveBackupFile(`parties_${dateStr}.csv`, toCsv(partyHeaders, partyRows));

  // 2. Ledger entries CSV — one row per line-item so all item details are preserved
  const ledgerHeaders = ['date', 'invoice_no', 'type', 'party_name', 'site', 'item_name', 'qty', 'unit', 'rate', 'item_total', 'gst_pct', 'rent', 'discount', 'grand_total', 'payment_mode', 'vehicle_no', 'notes'];
  const ledgerRows: any[][] = [];
  for (const e of (data['ledger_entries'] || [])) {
    const items: any[] = Array.isArray(e.items) && e.items.length > 0 ? e.items : [null];
    items.forEach((item: any, idx: number) => {
      ledgerRows.push([
        idx === 0 ? (e.date || '') : '',
        idx === 0 ? (e.invoice_no || e.prefixed_id || '') : '',
        idx === 0 ? (e.type || '') : '',
        idx === 0 ? (e.party_name || '') : '',
        idx === 0 ? (e.site || '') : '',
        item ? item.item_name : '',
        item ? (item.quantity ?? '') : '',
        item ? (item.unit || '') : '',
        item ? (item.rate ?? '') : '',
        item ? (item.total ?? '') : '',
        item ? (item.gst_percent ?? '') : '',
        idx === 0 ? (e.vehicle_rent ?? '') : '',
        idx === 0 ? (e.discount_amount ?? '') : '',
        idx === 0 ? (e.total_amount ?? '') : '',
        idx === 0 ? (e.payment_mode || '') : '',
        idx === 0 ? (e.vehicle_no || '') : '',
        idx === 0 ? (e.notes || '') : '',
      ]);
    });
  }
  await saveBackupFile(`ledger_${dateStr}.csv`, toCsv(ledgerHeaders, ledgerRows));

  // 3. Transactions CSV
  const txHeaders = ['date', 'type', 'party_name', 'amount', 'payment_mode', 'purpose', 'notes', 'received_by', 'paid_by'];
  const txRows = (data['transactions'] || []).map((t: any) => [
    t.date, t.type, t.party_name, t.amount, t.payment_mode, t.payment_purpose, t.notes, t.received_by, t.paid_by,
  ]);
  await saveBackupFile(`transactions_${dateStr}.csv`, toCsv(txHeaders, txRows));
}

export const AutoBackupService = {
  /**
   * Create a full backup and save to device Documents folder (native only).
   * Also saves detailed CSV files (parties, ledger with item rows, transactions).
   */
  createLocalBackup: async (userId: string, label?: string) => {
    if (!Capacitor.isNativePlatform()) {
      return { success: false, message: 'Auto-backup only available on Android/iOS' };
    }

    const backupData: any = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      userId,
      data: {}
    };

    for (const colName of COLLECTIONS) {
      const colRef = collection(db, `users/${userId}/${colName}`);
      const snap = await getDocs(colRef);
      backupData.data[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const dateStr = new Date().toISOString().split('T')[0];
    // Use date-only filename so same-day writes overwrite the previous backup
    // keeping exactly one backup slot per day for clean 7-day rolling rotation.
    const fileName = label
      ? `backup_${label}_${dateStr}.json`
      : `backup_${dateStr}.json`;

    const filePath = `${BACKUP_FOLDER}/${fileName}`;

    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

      try {
        await Filesystem.mkdir({
          path: BACKUP_FOLDER,
          directory: Directory.Documents,
          recursive: true
        });
      } catch (_) {
        // Folder may already exist
      }

      await Filesystem.writeFile({
        path: filePath,
        data: JSON.stringify(backupData, null, 2),
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      // Also save detailed CSV files (accessible via file manager) alongside JSON
      try {
        await saveDetailedCsvFiles(userId, dateStr, backupData.data);
      } catch (csvErr) {
        console.warn('CSV backup step failed (JSON backup still saved):', csvErr);
      }

      return { success: true, fileName, message: `Backup saved: ${fileName}` };
    } catch (e: any) {
      console.error('Auto backup failed:', e);
      return { success: false, message: e.message || 'Backup failed' };
    }
  },

  /**
   * Rotate old backups, keeping only the last MAX_BACKUPS (native only)
   */
  rotateBackups: async () => {
    if (!Capacitor.isNativePlatform()) return 0;

    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const result = await Filesystem.readdir({
        path: BACKUP_FOLDER,
        directory: Directory.Documents
      });

      const backupFiles = result.files
        .filter(f => f.name.startsWith('backup_') && f.name.endsWith('.json'))
        .sort((a, b) => (a.name > b.name ? -1 : 1));

      const toDelete = backupFiles.slice(MAX_BACKUPS);
      for (const file of toDelete) {
        await Filesystem.deleteFile({
          path: `${BACKUP_FOLDER}/${file.name}`,
          directory: Directory.Documents
        });
      }

      return toDelete.length;
    } catch (e) {
      console.error('Rotation failed:', e);
      return 0;
    }
  },

  /**
   * List all available backups (native only)
   */
  listBackups: async () => {
    if (!Capacitor.isNativePlatform()) return [];

    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const result = await Filesystem.readdir({
        path: BACKUP_FOLDER,
        directory: Directory.Documents
      });

      return result.files
        .filter(f => f.name.startsWith('backup_') && f.name.endsWith('.json'))
        .sort((a, b) => (a.name > b.name ? -1 : 1))
        .map(f => ({
          name: f.name,
          date: f.name.match(/backup_(\d{4}-\d{2}-\d{2})/)?.[1] || 'Unknown',
          size: f.size
        }));
    } catch (_) {
      return [];
    }
  },

  /**
   * Restore from a specific backup file (native only)
   */
  restoreFromFile: async (fileName: string) => {
    if (!Capacitor.isNativePlatform()) throw new Error('Restore from file is only available on Android/iOS');

    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const result = await Filesystem.readFile({
        path: `${BACKUP_FOLDER}/${fileName}`,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      return JSON.parse(result.data as string);
    } catch (e: any) {
      console.error('Restore read failed:', e);
      throw new Error('Could not read backup file');
    }
  },

  /**
   * Manual backup for a specific day label
   */
  createManualBackup: async (userId: string, dayLabel: string) => {
    return AutoBackupService.createLocalBackup(userId, dayLabel);
  },

  /**
   * Schedule check — call this on app start (native only).
   * Uses localStorage to track last backup date to avoid duplicates.
   */
  checkAndRunDailyBackup: async (userId: string) => {
    if (!Capacitor.isNativePlatform()) return null;

    const LAST_BACKUP_KEY = 'last_auto_backup_date';
    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();

    let lastBackup: string | null = null;
    try { lastBackup = localStorage.getItem(LAST_BACKUP_KEY); }
    catch (_) { try { lastBackup = sessionStorage.getItem(LAST_BACKUP_KEY); } catch (__) {} }

    if (lastBackup === today) return null;
    if (currentHour < BACKUP_HOUR) return null;

    try {
      const result = await AutoBackupService.createLocalBackup(userId);
      if (result.success) {
        try { localStorage.setItem(LAST_BACKUP_KEY, today); }
        catch (_) { try { sessionStorage.setItem(LAST_BACKUP_KEY, today); } catch (__) {} }
        await AutoBackupService.rotateBackups();
      }
      return result;
    } catch (e) {
      console.error('Daily auto-backup error:', e);
      return null;
    }
  }
};
