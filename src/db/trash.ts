// src/db/trash.ts
// Feature‑specific re‑exports for trash utilities
export {
  getTrashEntries,
  getTrashEntriesCs,
  getTrashEntriesEx,
  getTrashEntriesPy,
  restoreEntry,
  restoreEntryCs,
  restoreEntryEx,
  restoreEntryPy,
  permanentlyDeleteEntry,
  permanentlyDeleteEntryCs,
  permanentlyDeleteEntryEx,
  permanentlyDeleteEntryPy,
  emptyTrash,
  emptyTrashCs,
  emptyTrashEx,
  emptyTrashPy
} from '@/db/indexedDB';
