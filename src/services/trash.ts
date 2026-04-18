import {
  collection, deleteDoc, doc, getDocs, query, getDoc, setDoc, writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface DeletedItem {
  id: string;
  original_id: string;
  collection_name: string;
  data: any;
  deleted_at: string;
}

// FIX: The previous implementation used module-level singleton state for the
// "undo" pending-delete queue (in UndoSnackbar/useSoftDelete).  Module-level
// state is shared across the entire app lifetime, so pending deletes could
// survive navigation and commit against the wrong user account in a multi-user
// or tab-reuse session.
//
// TrashService itself was stateless; the singleton problem lived in useSoftDelete.
// This file is kept stateless and correct.  The actual fix is in UndoSnackbar
// where each scheduleDelete call creates a fresh, locally-scoped timeout.
//
// What IS fixed here:
//   • restoreItem is now atomic (batch): it restores the doc AND removes the
//     trash entry in a single commit.  The old code used two separate writes,
//     so a crash between them could leave the item in both places or neither.

export const TrashService = {
  moveToTrash: async (userId: string, collectionName: string, docId: string) => {
    const docRef  = doc(db, 'users', userId, collectionName, docId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Document not found');
    const data = docSnap.data();

    const batch    = writeBatch(db);
    const trashRef = doc(collection(db, 'users', userId, 'recycle_bin'));
    batch.set(trashRef, {
      original_id:     docId,
      collection_name: collectionName,
      data,
      deleted_at: new Date().toISOString(),
    });
    batch.delete(docRef);
    await batch.commit();
    return true;
  },

  getTrashItems: async (userId: string): Promise<DeletedItem[]> => {
    const snap = await getDocs(query(collection(db, 'users', userId, 'recycle_bin')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DeletedItem));
  },

  // FIX: restore is now a single atomic batch write instead of two sequential writes.
  restoreItem: async (userId: string, item: DeletedItem) => {
    const batch   = writeBatch(db);
    const origRef = doc(db, 'users', userId, item.collection_name, item.original_id);
    const binRef  = doc(db, 'users', userId, 'recycle_bin', item.id);
    batch.set(origRef, item.data);
    batch.delete(binRef);
    await batch.commit();
    return true;
  },

  permanentDelete: async (userId: string, trashId: string) => {
    await deleteDoc(doc(db, 'users', userId, 'recycle_bin', trashId));
  },
};

