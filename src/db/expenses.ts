// src/db/expenses.ts
// Feature-specific re-exports for Expense entries
export {
  addEntryEx,
  updateEntryEx,
  deleteEntryEx,
  getEntriesByDateEx,
  getExpenses,
  renumberEntriesEx,
  permanentlyDeleteEntryEx,
  emptyTrashEx,
  getTrashEntriesEx
} from '@/db/indexedDB';
