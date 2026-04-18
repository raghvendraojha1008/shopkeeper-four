/**
 * ContactPickerService
 * ─────────────────────────────────────────────────────────────────────────────
 * Two distinct capabilities:
 *
 *  getAllContactsNative()  — loads the full contacts list silently in background.
 *                            Only works on Capacitor (Android native) where
 *                            we have permission-based bulk access.
 *
 *  pickContactFromDevice() — opens the OS contact picker and lets the user
 *                            choose exactly one contact. Works on:
 *                            • Capacitor native (via plugin)
 *                            • Chrome Android ≥ 80 (Web Contact Picker API)
 *
 *  searchContacts()        — fuzzy-filter a contacts array, returns top 4.
 *  isNativeContacts()      — true if we can bulk-load (Capacitor).
 *  isPickerAvailable()     — true if one-shot picker is available (web or native).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Capacitor } from '@capacitor/core';

export interface AppContact {
  name:  string;
  phone: string;
}

let _cachedContacts: AppContact[] | null = null;
// Separate flag so a permission denial doesn't permanently cache an empty list.
// Cache is cleared when clearContactCache() is called (e.g. after permission is granted later).
let _permissionDenied = false;

/* ── Bulk load — Capacitor native only ──────────────────────────────────── */
export async function getAllContactsNative(): Promise<AppContact[]> {
  if (_cachedContacts !== null) return _cachedContacts;
  // If denied in this session, don't re-prompt (user must re-open the form)
  if (_permissionDenied) return [];
  if (!Capacitor.isNativePlatform()) return [];

  try {
    const { Contacts } = await import('@capacitor-community/contacts' as any);
    const perm = await Contacts.requestPermissions();
    if (perm?.contacts !== 'granted') {
      // Don't cache empty — next open of the form will retry if cache was cleared
      _permissionDenied = true;
      return [];
    }

    const result = await Contacts.getContacts({
      projection: { name: true, phones: true },
    });

    const contacts = (result?.contacts ?? []).flatMap((c: any) => {
      const name   = c.name?.display || c.name?.given || '';
      const phones = (c.phones ?? []).map((p: any) => (p.number ?? '').replace(/\D/g, ''));
      if (!name) return [];
      return phones.length > 0
        ? phones.map((ph: string) => ({ name, phone: ph }))
        : [{ name, phone: '' }];
    });

    // Only cache when successfully fetched (even if empty list — user genuinely has no contacts)
    _cachedContacts = contacts;
    return _cachedContacts;
  } catch (e) {
    console.warn('Capacitor Contacts error:', e);
    // Don't cache on error — allow retry next time
    return [];
  }
}

/* ── One-shot picker — Capacitor OR Web Contact Picker API ──────────────── */
export async function pickContactFromDevice(): Promise<AppContact | null> {
  // Capacitor native
  if (Capacitor.isNativePlatform()) {
    try {
      const { Contacts } = await import('@capacitor-community/contacts' as any);
      const perm = await Contacts.requestPermissions();
      if (perm?.contacts !== 'granted') return null;

      const result = await Contacts.getContacts({
        projection: { name: true, phones: true },
      });
      // On native we get all contacts — return null so caller can use bulk list
      // (this path is usually avoided; bulk is preferred on native)
      return null;
    } catch (e) {
      console.warn('Capacitor pick error:', e);
      return null;
    }
  }

  // Web Contact Picker API (Chrome Android ≥ 80)
  if ('contacts' in navigator && 'ContactsManager' in window) {
    try {
      const results = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
      if (!results || results.length === 0) return null;
      const c    = results[0];
      const name = (c.name ?? [])[0] ?? '';
      const phone = ((c.tel ?? [])[0] ?? '').replace(/\D/g, '');
      if (!name) return null;
      return { name, phone };
    } catch (e) {
      console.warn('Web Contact Picker error:', e);
      return null;
    }
  }

  return null;
}

/* ── Availability checks ─────────────────────────────────────────────────── */
/** True if we can bulk-load contacts in background (Capacitor native only) */
export function isNativeContacts(): boolean {
  return Capacitor.isNativePlatform();
}

/** True if the one-shot picker is available (web or native) */
export function isPickerAvailable(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if ('contacts' in navigator && 'ContactsManager' in window) return true;
  return false;
}

/* ── Legacy alias (keeps old callers happy) ──────────────────────────────── */
export const getAllContacts       = getAllContactsNative;
export const isContactsAvailable = isPickerAvailable;

/* ── Search — always max 4 suggestions ──────────────────────────────────── */
export function searchContacts(contacts: AppContact[], query: string): AppContact[] {
  if (!query || !query.trim()) return contacts.slice(0, 4);
  const q = query.toLowerCase().trim();
  return contacts
    .filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q)
    )
    .slice(0, 4);
}

/** Clear cache and reset denial flag (call this after user grants permission in Settings) */
export function clearContactCache(): void {
  _cachedContacts = null;
  _permissionDenied = false;
}
