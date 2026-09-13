// src/db/customers.ts
// Feature-specific re-exports for Customer entries
export {
  addEntryCs,
  updateEntryCs,
  deleteEntryCs,
  getCustomers,
  getEntriesByDateCs,
  renumberEntriesCs,
  permanentlyDeleteEntryCs,
  emptyTrashCs,
  getTrashEntriesCs
} from '@/db/indexedDB';
