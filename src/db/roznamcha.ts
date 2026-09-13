// src/db/roznamcha.ts
// Feature-specific exports for Roznamcha entries
export {
  addEntry,
  updateEntry,
  deleteEntry,
  getAllEntries,
  getEntriesByDate,
  getEntriesByDateRange,
  renumberEntries,
  permanentlyDeleteEntry,
  emptyTrash,
  initDB,
  generateInvoiceNumber,
  saveInvoiceCounter,

} from '@/db/indexedDB';
