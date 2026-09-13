// src/db/payments.ts
// Feature-specific re-exports for Payment entries
export {
  addEntryPy,
  updateEntryPy,
  deleteEntryPy,
  getEntriesByDatePy,
  getPayments,
  renumberEntriesPy,
  permanentlyDeleteEntryPy,
  emptyTrashPy,
  getTrashEntriesPy
} from '@/db/indexedDB';
