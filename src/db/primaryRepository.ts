import type {
  CustomerEntry,
  ExpensesEntry,
  JournalEntry,
  PaymentsEntry,
} from '@/types';
import {
  addEntry as addEntryLocal,
  addEntryCs as addEntryCsLocal,
  addEntryEx as addEntryExLocal,
  addEntryPy as addEntryPyLocal,
  deleteEntry as deleteEntryLocal,
  deleteEntryCs as deleteEntryCsLocal,
  deleteEntryEx as deleteEntryExLocal,
  deleteEntryPy as deleteEntryPyLocal,
  emptyTrash as emptyTrashLocal,
  emptyTrashCs as emptyTrashCsLocal,
  emptyTrashEx as emptyTrashExLocal,
  emptyTrashPy as emptyTrashPyLocal,
  generateInvoiceNumber as generateInvoiceNumberLocal,
  getAllEntries as getAllEntriesLocal,
  getCustomers as getCustomersLocal,
  getEntriesByDate as getEntriesByDateLocal,
  getEntriesByDateCs as getEntriesByDateCsLocal,
  getEntriesByDateEx as getEntriesByDateExLocal,
  getEntriesByDatePy as getEntriesByDatePyLocal,
  getEntriesByDateRange as getEntriesByDateRangeLocal,
  getExpenses as getExpensesLocal,
  getPayments as getPaymentsLocal,
  getSetting as getSettingLocal,
  getTrashEntries as getTrashEntriesLocal,
  getTrashEntriesCs as getTrashEntriesCsLocal,
  getTrashEntriesEx as getTrashEntriesExLocal,
  getTrashEntriesPy as getTrashEntriesPyLocal,
  initDB,
  permanentlyDeleteEntry as permanentlyDeleteEntryLocal,
  permanentlyDeleteEntryCs as permanentlyDeleteEntryCsLocal,
  permanentlyDeleteEntryEx as permanentlyDeleteEntryExLocal,
  permanentlyDeleteEntryPy as permanentlyDeleteEntryPyLocal,
  renumberEntries as renumberEntriesLocal,
  renumberEntriesCs as renumberEntriesCsLocal,
  renumberEntriesEx as renumberEntriesExLocal,
  renumberEntriesPy as renumberEntriesPyLocal,
  restoreEntry as restoreEntryLocal,
  restoreEntryCs as restoreEntryCsLocal,
  restoreEntryEx as restoreEntryExLocal,
  restoreEntryPy as restoreEntryPyLocal,
  saveInvoiceCounter as saveInvoiceCounterLocal,
  setSetting as setSettingLocal,
  updateEntry as updateEntryLocal,
  updateEntryCs as updateEntryCsLocal,
  updateEntryEx as updateEntryExLocal,
  updateEntryPy as updateEntryPyLocal,
} from '@/db/indexedDB';
import {
  getSyncConflicts,
  pushPendingChanges,
  refreshCloudSettings,
  refreshCloudStore,
} from '@/db/cloudSync';
import { getActiveInstallationId, getActiveSyncUser } from '@/db/syncContext';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type CloudStore = 'entries' | 'customers' | 'expenses' | 'payments';

function isCloudOnline(): boolean {
  return Boolean(
    getActiveSyncUser()
      && getActiveInstallationId()
      && isSupabaseConfigured()
      && typeof navigator !== 'undefined'
      && navigator.onLine,
  );
}

async function refresh(store: CloudStore, date?: string): Promise<void> {
  if (!isCloudOnline()) return;
  const userId = getActiveSyncUser();
  if (!userId) throw new Error('Sign in before reading cloud data.');
  await refreshCloudStore(userId, store, date);
}

async function pushIfOnline(): Promise<void> {
  if (!isCloudOnline()) return;
  const userId = getActiveSyncUser();
  const installationId = getActiveInstallationId();
  if (!userId || !installationId) throw new Error('The active cloud account is unavailable.');

  const failures = await pushPendingChanges(userId, installationId);
  const conflicts = await getSyncConflicts(userId);
  if (conflicts.length > 0) {
    throw new Error('Your change is saved locally, but a cloud conflict needs review.');
  }
  if (failures.length > 0) {
    throw new Error(`Your change is queued locally but has not reached Supabase: ${failures[0]}`);
  }
}

async function write<T>(operation: () => Promise<T>): Promise<T> {
  const result = await operation();
  await pushIfOnline();
  return result;
}

async function writeTrash(operation: () => Promise<void>): Promise<void> {
  await operation();
  await pushIfOnline();
}

export { initDB };

export async function addEntry(entry: Omit<JournalEntry, 'id'>): Promise<number> {
  return write(() => addEntryLocal(entry));
}
export async function addEntryCs(entry: Omit<CustomerEntry, 'id'>): Promise<number> {
  return write(() => addEntryCsLocal(entry));
}
export async function addEntryEx(entry: Omit<ExpensesEntry, 'id'>): Promise<number> {
  return write(() => addEntryExLocal(entry));
}
export async function addEntryPy(entry: Omit<PaymentsEntry, 'id'>): Promise<number> {
  return write(() => addEntryPyLocal(entry));
}
export async function updateEntry(entry: JournalEntry): Promise<void> {
  return write(() => updateEntryLocal(entry));
}
export async function updateEntryCs(entry: CustomerEntry): Promise<void> {
  return write(() => updateEntryCsLocal(entry));
}
export async function updateEntryEx(entry: ExpensesEntry): Promise<void> {
  return write(() => updateEntryExLocal(entry));
}
export async function updateEntryPy(entry: PaymentsEntry): Promise<void> {
  return write(() => updateEntryPyLocal(entry));
}
export async function deleteEntry(id: number): Promise<void> {
  return writeTrash(() => deleteEntryLocal(id));
}
export async function deleteEntryCs(id: number): Promise<void> {
  return writeTrash(() => deleteEntryCsLocal(id));
}
export async function deleteEntryEx(id: number): Promise<void> {
  return writeTrash(() => deleteEntryExLocal(id));
}
export async function deleteEntryPy(id: number): Promise<void> {
  return writeTrash(() => deleteEntryPyLocal(id));
}

export async function getAllEntries(): Promise<JournalEntry[]> {
  await refresh('entries');
  return getAllEntriesLocal();
}
export async function getEntriesByDate(date: string): Promise<JournalEntry[]> {
  await refresh('entries', date);
  return getEntriesByDateLocal(date);
}
export async function getEntriesByDateRange(startDate: string, endDate: string): Promise<JournalEntry[]> {
  await refresh('entries');
  return getEntriesByDateRangeLocal(startDate, endDate);
}
export async function getCustomers(): Promise<CustomerEntry[]> {
  await refresh('customers');
  return getCustomersLocal();
}
export async function getEntriesByDateCs(date: string): Promise<CustomerEntry[]> {
  await refresh('customers', date);
  return getEntriesByDateCsLocal(date);
}
export async function getExpenses(): Promise<ExpensesEntry[]> {
  await refresh('expenses');
  return getExpensesLocal();
}
export async function getEntriesByDateEx(date: string): Promise<ExpensesEntry[]> {
  await refresh('expenses', date);
  return getEntriesByDateExLocal(date);
}
export async function getPayments(): Promise<PaymentsEntry[]> {
  await refresh('payments');
  return getPaymentsLocal();
}
export async function getEntriesByDatePy(date: string): Promise<PaymentsEntry[]> {
  await refresh('payments', date);
  return getEntriesByDatePyLocal(date);
}

export async function getTrashEntries(): Promise<JournalEntry[]> {
  await refresh('entries');
  return getTrashEntriesLocal();
}
export async function getTrashEntriesCs(): Promise<CustomerEntry[]> {
  await refresh('customers');
  return getTrashEntriesCsLocal();
}
export async function getTrashEntriesEx(): Promise<ExpensesEntry[]> {
  await refresh('expenses');
  return getTrashEntriesExLocal();
}
export async function getTrashEntriesPy(): Promise<PaymentsEntry[]> {
  await refresh('payments');
  return getTrashEntriesPyLocal();
}
export async function restoreEntry(id: number): Promise<void> {
  return writeTrash(() => restoreEntryLocal(id));
}
export async function restoreEntryCs(id: number): Promise<void> {
  return writeTrash(() => restoreEntryCsLocal(id));
}
export async function restoreEntryEx(id: number): Promise<void> {
  return writeTrash(() => restoreEntryExLocal(id));
}
export async function restoreEntryPy(id: number): Promise<void> {
  return writeTrash(() => restoreEntryPyLocal(id));
}
export async function permanentlyDeleteEntry(id: number): Promise<void> {
  return writeTrash(() => permanentlyDeleteEntryLocal(id));
}
export async function permanentlyDeleteEntryCs(id: number): Promise<void> {
  return writeTrash(() => permanentlyDeleteEntryCsLocal(id));
}
export async function permanentlyDeleteEntryEx(id: number): Promise<void> {
  return writeTrash(() => permanentlyDeleteEntryExLocal(id));
}
export async function permanentlyDeleteEntryPy(id: number): Promise<void> {
  return writeTrash(() => permanentlyDeleteEntryPyLocal(id));
}

export async function emptyTrash(): Promise<void> {
  await refresh('entries');
  return writeTrash(emptyTrashLocal);
}
export async function emptyTrashCs(): Promise<void> {
  await refresh('customers');
  return writeTrash(emptyTrashCsLocal);
}
export async function emptyTrashEx(): Promise<void> {
  await refresh('expenses');
  return writeTrash(emptyTrashExLocal);
}
export async function emptyTrashPy(): Promise<void> {
  await refresh('payments');
  return writeTrash(emptyTrashPyLocal);
}
export async function renumberEntries(date: string): Promise<void> {
  return writeTrash(() => renumberEntriesLocal(date));
}
export async function renumberEntriesCs(date: string): Promise<void> {
  return writeTrash(() => renumberEntriesCsLocal(date));
}
export async function renumberEntriesEx(date: string): Promise<void> {
  return writeTrash(() => renumberEntriesExLocal(date));
}
export async function renumberEntriesPy(date: string): Promise<void> {
  return writeTrash(() => renumberEntriesPyLocal(date));
}

export async function getSetting<T = string>(key: string): Promise<T | undefined> {
  if (!isCloudOnline()) return getSettingLocal<T>(key);
  const userId = getActiveSyncUser();
  if (!userId) throw new Error('Sign in before reading cloud settings.');
  const cachedSetting = await getCachedSetting(userId, key);
  if (cachedSetting?.syncStatus === 'pending' || cachedSetting?.syncStatus === 'conflict') {
    return cachedSetting.value as T;
  }
  const { data, error } = await getSupabaseClient()
    .from('user_settings')
    .select('value,source_installation_id,sync_version,updated_at')
    .eq('user_id', userId)
    .eq('key', key)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    await refreshCloudSettings(userId);
    return getSettingLocal<T>(key);
  }
  const db = await initDB();
  const transaction = db.transaction('settings', 'readwrite');
  const complete = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not update the local settings cache.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update the local settings cache.'));
  });
  transaction.objectStore('settings').put({
    key: `${userId}::${key}`,
    userSettingKey: key,
    value: data.value,
    ownerUserId: userId,
    sourceInstallationId: data.source_installation_id,
    cloudVersion: data.sync_version,
    updatedAt: new Date(data.updated_at).getTime(),
    syncStatus: 'synced',
  });
  await complete;
  return data.value as T;
}

async function getCachedSetting(userId: string, key: string): Promise<Record<string, unknown> | undefined> {
  const db = await initDB();
  const transaction = db.transaction('settings', 'readonly');
  const request = transaction.objectStore('settings').get(`${userId}::${key}`);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not read the local settings cache.'));
  });
}

export async function setSetting<T = string>(key: string, value: T): Promise<void> {
  return write(() => setSettingLocal(key, value));
}

export async function generateInvoiceNumber() {
  return write(() => generateInvoiceNumberLocal());
}

export async function saveInvoiceCounter(date: string, sequence: number): Promise<void> {
  return write(() => saveInvoiceCounterLocal(date, sequence));
}
