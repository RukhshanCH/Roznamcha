import type {
  CustomerEntry,
  JournalEntry,
  ExpensesEntry,
  PaymentsEntry,
  LocalDataStore,
} from '@/types';
import {
  getActiveInstallationId,
  getActiveSyncUser,
  getScopedSettingKey,
} from '@/db/syncContext';
import {
  addLocalRecord,
  deleteLocalRecord,
  putLocalRecord,
  putLocalSetting,
} from '@/db/localSync';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

const DB_NAME = 'RoznamchaDB';
const DB_VERSION = 6;
const STORE_NAME = 'entries';
const CUSTOMER_STORE_NAME = 'customers';
const EXPENSES_STORE_NAME = 'expenses';
const PAYMENTS_STORE_NAME = 'payments';
export const SYNC_OUTBOX_STORE_NAME = 'syncOutbox';
export const SYNC_TOMBSTONES_STORE_NAME = 'syncTombstones';
export const DATABASE_VERSION = DB_VERSION;

function isOwnedByActiveUser(record: { ownerUserId?: string }): boolean {
  const userId = getActiveSyncUser();
  return userId !== null && record.ownerUserId === userId;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn('IndexedDB open request blocked. Close other tabs to upgrade the database.');
    };
    request.onsuccess = () => {
      db = request.result;
      db.onversionchange = () => {
        db?.close();
        db = null;
        console.warn('IndexedDB version change detected; the database connection was closed. Reload the page to reconnect.');
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('serialNo', 'serialNo', { unique: false });
      }
      if (!database.objectStoreNames.contains(CUSTOMER_STORE_NAME)) {
        const customerStore = database.createObjectStore(CUSTOMER_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        customerStore.createIndex('date', 'date', { unique: false });
        customerStore.createIndex('serialNo', 'serialNo', { unique: false });
      }
      if (!database.objectStoreNames.contains(EXPENSES_STORE_NAME)) {
        const expensesStore = database.createObjectStore(EXPENSES_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        expensesStore.createIndex('date', 'date', { unique: false });
        expensesStore.createIndex('serialNo', 'serialNo', { unique: false });
      }
      if (!database.objectStoreNames.contains(PAYMENTS_STORE_NAME)) {
        const paymentsStore = database.createObjectStore(PAYMENTS_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        paymentsStore.createIndex('date', 'date', { unique: false });
        paymentsStore.createIndex('serialNo', 'serialNo', { unique: false });
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", {
          keyPath: "key",
        });
      }
      if (!database.objectStoreNames.contains(SYNC_OUTBOX_STORE_NAME)) {
        database.createObjectStore(SYNC_OUTBOX_STORE_NAME, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(SYNC_TOMBSTONES_STORE_NAME)) {
        database.createObjectStore(SYNC_TOMBSTONES_STORE_NAME, { keyPath: 'key' });
      }

      for (const storeName of [
        STORE_NAME,
        CUSTOMER_STORE_NAME,
        EXPENSES_STORE_NAME,
        PAYMENTS_STORE_NAME,
        SYNC_OUTBOX_STORE_NAME,
      ]) {
        const store = (event.target as IDBOpenDBRequest).transaction?.objectStore(storeName);
        if (store && !store.indexNames.contains('cloudId')) {
          store.createIndex('cloudId', 'cloudId', { unique: false });
        }
      }
    };
  });
}

// Get and Set Settings
export async function getSetting<T = string>(key: string): Promise<T | undefined> {
  const database = await initDB();
  const userId = getActiveSyncUser();
  const transaction = database.transaction('settings', 'readonly');
  const store = transaction.objectStore('settings');
  if (!userId) {
    const record = await requestValue<{ value?: T } | undefined>(store.get(key));
    return record?.value;
  }

  const scopedRequest = store.get(getScopedSettingKey(userId, key));
  const legacyRequest = store.get(key);
  const [scoped, legacy] = await Promise.all([
    requestValue<{ value?: T } | undefined>(scopedRequest),
    requestValue<{ value?: T; ownerUserId?: string } | undefined>(legacyRequest),
  ]);
  if (scoped) return scoped.value;

  return legacy?.ownerUserId === userId ? legacy.value : undefined;
}

export async function setSetting<T = string>(key: string, value: T): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction(['settings', SYNC_OUTBOX_STORE_NAME], 'readwrite');
  const complete = transactionDone(transaction);
  putLocalSetting(transaction, key, value);
  await complete;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function withoutSyncMetadata(record: object): Record<string, unknown> {
  const excluded = new Set([
    'id',
    'ownerUserId',
    'cloudId',
    'cloudVersion',
    'syncStatus',
    'sourceInstallationId',
    'sourceLocalId',
  ]);
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !excluded.has(key)),
  );
}

async function getOwnedSettingsForBackup(): Promise<Array<{ key: string; value: unknown }>> {
  const database = await initDB();
  const transaction = database.transaction('settings', 'readonly');
  const records = await requestValue<Array<Record<string, unknown>>>(
    transaction.objectStore('settings').getAll(),
  );
  const userId = getActiveSyncUser();
  return records.flatMap((record) => {
    if (typeof record.ownerUserId !== 'string' || record.ownerUserId !== userId) return [];
    if (typeof record.key !== 'string' || record.key.startsWith('@sync:')) return [];
    const key = typeof record.userSettingKey === 'string'
      ? record.userSettingKey
      : record.key;
    if (key.includes('::')) return [];
    return [{ key, value: record.value ?? Object.fromEntries(
      Object.entries(record).filter(([field]) =>
        !['key', 'ownerUserId', 'cloudVersion', 'syncStatus', 'sourceInstallationId'].includes(field),
      ),
    ) }];
  });
}

async function getOwnedRecordsIncludingDeleted<T extends { ownerUserId?: string }>(
  storeName: LocalDataStore,
): Promise<T[]> {
  const database = await initDB();
  const transaction = database.transaction(storeName, 'readonly');
  const records = await requestValue<T[]>(transaction.objectStore(storeName).getAll());
  return records.filter(isOwnedByActiveUser);
}

// CRUD operations for Journal Entries

// Add Entries function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function addEntry(entry: Omit<JournalEntry, 'id'>): Promise<number> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const request = addLocalRecord(transaction, STORE_NAME, entry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function addEntryCs(entry: Omit<CustomerEntry, 'id'>): Promise<number> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([CUSTOMER_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const request = addLocalRecord(tx, CUSTOMER_STORE_NAME, entry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function addEntryEx(entry: Omit<ExpensesEntry, 'id'>): Promise<number> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([EXPENSES_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const request = addLocalRecord(tx, EXPENSES_STORE_NAME, entry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function addEntryPy(entry: Omit<PaymentsEntry, 'id'>): Promise<number> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([PAYMENTS_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const request = addLocalRecord(tx, PAYMENTS_STORE_NAME, entry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

// Update Entries function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function updateEntry(entry: JournalEntry): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const request = putLocalRecord(transaction, STORE_NAME, entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateEntryCs(entry: CustomerEntry): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([CUSTOMER_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const request = putLocalRecord(tx, CUSTOMER_STORE_NAME, entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateEntryEx(entry: ExpensesEntry): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([EXPENSES_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const request = putLocalRecord(tx, EXPENSES_STORE_NAME, entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateEntryPy(entry: PaymentsEntry): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([PAYMENTS_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const request = putLocalRecord(tx, PAYMENTS_STORE_NAME, entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Delete Entries function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function deleteEntry(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, SYNC_OUTBOX_STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const entry = getRequest.result;

      if (!entry) {
        reject(new Error("Entry not found"));
        return;
      }

      entry.isDeleted = true;
      entry.deletedAt = new Date().toISOString();

      const updateRequest = putLocalRecord(transaction, STORE_NAME, entry);

      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
  });
}

export async function deleteEntryCs(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOMER_STORE_NAME, SYNC_OUTBOX_STORE_NAME], "readwrite");
    const store = transaction.objectStore(CUSTOMER_STORE_NAME);

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const entry = getRequest.result;

      if (!entry) {
        reject(new Error("Entry not found"));
        return;
      }

      entry.isDeleted = true;
      entry.deletedAt = new Date().toISOString();

      const updateRequest = putLocalRecord(transaction, CUSTOMER_STORE_NAME, entry);

      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
  });
}

export async function deleteEntryEx(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([EXPENSES_STORE_NAME, SYNC_OUTBOX_STORE_NAME], "readwrite");
    const store = transaction.objectStore(EXPENSES_STORE_NAME);

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const entry = getRequest.result;

      if (!entry) {
        reject(new Error("Entry not found"));
        return;
      }

      entry.isDeleted = true;
      entry.deletedAt = new Date().toISOString();

      const updateRequest = putLocalRecord(transaction, EXPENSES_STORE_NAME, entry);

      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
  });
}

export async function deleteEntryPy(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PAYMENTS_STORE_NAME, SYNC_OUTBOX_STORE_NAME], "readwrite");
    const store = transaction.objectStore(PAYMENTS_STORE_NAME);

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const entry = getRequest.result;

      if (!entry) {
        reject(new Error("Entry not found"));
        return;
      }

      entry.isDeleted = true;
      entry.deletedAt = new Date().toISOString();

      const updateRequest = putLocalRecord(transaction, PAYMENTS_STORE_NAME, entry);

      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
  });
}

// Get all Entries function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function getAllEntries(): Promise<JournalEntry[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result.filter(
        entry => !entry.isDeleted && isOwnedByActiveUser(entry)
      );

      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getEntriesByDate(date: string): Promise<JournalEntry[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    // Use index if present, otherwise fallback to scanning all records
    let request: IDBRequest;
    if ((store.indexNames && (store.indexNames as any).contains && (store.indexNames as any).contains('date')) || (store.indexNames && (store.indexNames as any).length && Array.from(store.indexNames as any).includes('date'))) {
      const index = store.index('date');
      request = index.getAll(date);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const all = request.result as JournalEntry[];
      const entries = (all.filter(entry => !entry.isDeleted && isOwnedByActiveUser(entry)) as JournalEntry[])
        .filter(e => e.date === date)
        .sort((a, b) => a.serialNo - b.serialNo);

      resolve(entries);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getEntriesByDateRange(startDate: string, endDate: string): Promise<JournalEntry[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    let request: IDBRequest;
    if ((store.indexNames && (store.indexNames as any).contains && (store.indexNames as any).contains('date')) || (store.indexNames && (store.indexNames as any).length && Array.from(store.indexNames as any).includes('date'))) {
      const index = store.index('date');
      const range = IDBKeyRange.bound(startDate, endDate);
      request = index.getAll(range);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const all = request.result as JournalEntry[];
      const entries = (all.filter(entry => !entry.isDeleted && isOwnedByActiveUser(entry)) as JournalEntry[])
        .filter(e => e.date >= startDate && e.date <= endDate)
        .sort((a, b) => {
          if (a.date === b.date) return a.serialNo - b.serialNo;
          return a.date.localeCompare(b.date);
        });

      resolve(entries);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getCustomers(): Promise<CustomerEntry[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CUSTOMER_STORE_NAME, "readonly");
    const store = transaction.objectStore(CUSTOMER_STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result.filter(
        entry => !entry.isDeleted && isOwnedByActiveUser(entry)
      );

      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getEntriesByDateCs(date: string): Promise<CustomerEntry[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(CUSTOMER_STORE_NAME, "readonly");
    const store = tx.objectStore(CUSTOMER_STORE_NAME);

    let request: IDBRequest;
    if ((store.indexNames && (store.indexNames as any).contains && (store.indexNames as any).contains('date')) || (store.indexNames && (store.indexNames as any).length && Array.from(store.indexNames as any).includes('date'))) {
      const index = store.index('date');
      request = index.getAll(date);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const all = request.result as CustomerEntry[];

      const filtered = all
        .filter(e => !e.isDeleted && isOwnedByActiveUser(e))
        .filter(e => e.date === date)
        .sort((a, b) => a.serialNo - b.serialNo);

      resolve(filtered);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getExpenses(): Promise<ExpensesEntry[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(EXPENSES_STORE_NAME, "readonly");
    const store = transaction.objectStore(EXPENSES_STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result.filter(
        entry => !entry.isDeleted && isOwnedByActiveUser(entry)
      );

      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getEntriesByDateEx(date: string): Promise<ExpensesEntry[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(EXPENSES_STORE_NAME, "readonly");
    const store = tx.objectStore(EXPENSES_STORE_NAME);

    let request: IDBRequest;
    if ((store.indexNames && (store.indexNames as any).contains && (store.indexNames as any).contains('date')) || (store.indexNames && (store.indexNames as any).length && Array.from(store.indexNames as any).includes('date'))) {
      const index = store.index('date');
      request = index.getAll(date);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const all = request.result as ExpensesEntry[];

      const filtered = all
        .filter(e => !e.isDeleted && isOwnedByActiveUser(e))
        .filter(e => e.date === date)
        .sort((a, b) => a.serialNo - b.serialNo);

      resolve(filtered);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getPayments(): Promise<PaymentsEntry[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PAYMENTS_STORE_NAME, "readonly");
    const store = transaction.objectStore(PAYMENTS_STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result.filter(
        entry => !entry.isDeleted && isOwnedByActiveUser(entry)
      );

      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getEntriesByDatePy(date: string): Promise<PaymentsEntry[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(PAYMENTS_STORE_NAME, "readonly");
    const store = tx.objectStore(PAYMENTS_STORE_NAME);

    let request: IDBRequest;
    if ((store.indexNames && (store.indexNames as any).contains && (store.indexNames as any).contains('date')) || (store.indexNames && (store.indexNames as any).length && Array.from(store.indexNames as any).includes('date'))) {
      const index = store.index('date');
      request = index.getAll(date);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const all = request.result as PaymentsEntry[];

      const filtered = all
        .filter(e => !e.isDeleted && isOwnedByActiveUser(e))
        .filter(e => e.date === date)
        .sort((a, b) => a.serialNo - b.serialNo);

      resolve(filtered);
    };

    request.onerror = () => reject(request.error);
  });
}

// Trash function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function getTrashEntries(): Promise<JournalEntry[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result.filter(
        entry => entry.isDeleted && isOwnedByActiveUser(entry)
      );

      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getTrashEntriesCs(): Promise<CustomerEntry[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CUSTOMER_STORE_NAME, "readonly");
    const store = transaction.objectStore(CUSTOMER_STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result.filter(
        entry => entry.isDeleted && isOwnedByActiveUser(entry)
      );

      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getTrashEntriesEx(): Promise<ExpensesEntry[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(EXPENSES_STORE_NAME, "readonly");
    const store = transaction.objectStore(EXPENSES_STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result.filter(
        entry => entry.isDeleted && isOwnedByActiveUser(entry)
      );

      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getTrashEntriesPy(): Promise<PaymentsEntry[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PAYMENTS_STORE_NAME, "readonly");
    const store = transaction.objectStore(PAYMENTS_STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result.filter(
        entry => entry.isDeleted && isOwnedByActiveUser(entry)
      );

      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

// Restore function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function restoreEntry(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, SYNC_OUTBOX_STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const dateIndex = store.index("date");

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const deletedEntry = getRequest.result as JournalEntry | undefined;

      if (!deletedEntry) {
        reject(new Error("Entry not found"));
        return;
      }
      if (!isOwnedByActiveUser(deletedEntry)) {
        reject(new Error("Cannot restore an entry owned by a different account."));
        return;
      }

      const dateRequest = dateIndex.getAll(deletedEntry.date);

      dateRequest.onerror = () => reject(dateRequest.error);

      dateRequest.onsuccess = () => {
        const activeEntries = (dateRequest.result as JournalEntry[])
          .filter(e => !e.isDeleted && isOwnedByActiveUser(e) && e.id !== deletedEntry.id)
          .sort((a, b) => a.serialNo - b.serialNo);

        // Shift serial numbers to make space
        activeEntries.forEach(entry => {
          if (entry.serialNo >= deletedEntry.serialNo) {
            entry.serialNo += 1;
            putLocalRecord(tx, STORE_NAME, entry);
          }
        });

        // Restore entry
        deletedEntry.isDeleted = false;
        delete deletedEntry.deletedAt;

        putLocalRecord(tx, STORE_NAME, deletedEntry);
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function restoreEntryCs(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([CUSTOMER_STORE_NAME, SYNC_OUTBOX_STORE_NAME], "readwrite");
    const store = tx.objectStore(CUSTOMER_STORE_NAME);


    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const deletedEntry = getRequest.result as CustomerEntry | undefined;

      if (!deletedEntry) {
        reject(new Error("Entry not found"));
        return;
      }
      if (!isOwnedByActiveUser(deletedEntry)) {
        reject(new Error("Cannot restore an entry owned by a different account."));
        return;
      }

      const allRequest = store.getAll();

      allRequest.onerror = () => reject(allRequest.error);

      allRequest.onsuccess = () => {
        const activeEntries = (allRequest.result as CustomerEntry[])
          .filter(
            e =>
              e.date === deletedEntry.date &&
              !e.isDeleted &&
              isOwnedByActiveUser(e) &&
              e.id !== deletedEntry.id
          )
          .sort((a, b) => a.serialNo - b.serialNo);

        // Shift entries to make room
        activeEntries.forEach(entry => {
          if (entry.serialNo >= deletedEntry.serialNo) {
            entry.serialNo++;
            putLocalRecord(tx, CUSTOMER_STORE_NAME, entry);
          }
        });

        // Restore the deleted entry
        deletedEntry.isDeleted = false;
        delete deletedEntry.deletedAt;

        putLocalRecord(tx, CUSTOMER_STORE_NAME, deletedEntry);
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function restoreEntryEx(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([EXPENSES_STORE_NAME, SYNC_OUTBOX_STORE_NAME], "readwrite");
    const store = tx.objectStore(EXPENSES_STORE_NAME);

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const deletedEntry = getRequest.result as ExpensesEntry | undefined;

      if (!deletedEntry) {
        reject(new Error("Entry not found"));
        return;
      }
      if (!isOwnedByActiveUser(deletedEntry)) {
        reject(new Error("Cannot restore an entry owned by a different account."));
        return;
      }

      const allRequest = store.getAll();

      allRequest.onerror = () => reject(allRequest.error);

      allRequest.onsuccess = () => {
        const activeEntries = (allRequest.result as ExpensesEntry[])
          .filter(
            e =>
              e.date === deletedEntry.date &&
              !e.isDeleted &&
              isOwnedByActiveUser(e) &&
              e.id !== deletedEntry.id
          )
          .sort((a, b) => a.serialNo - b.serialNo);

        // Shift entries to make room
        activeEntries.forEach(entry => {
          if (entry.serialNo >= deletedEntry.serialNo) {
            entry.serialNo++;
            putLocalRecord(tx, EXPENSES_STORE_NAME, entry);
          }
        });

        // Restore the deleted entry
        deletedEntry.isDeleted = false;
        delete deletedEntry.deletedAt;

        putLocalRecord(tx, EXPENSES_STORE_NAME, deletedEntry);
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function restoreEntryPy(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([PAYMENTS_STORE_NAME, SYNC_OUTBOX_STORE_NAME], "readwrite");
    const store = tx.objectStore(PAYMENTS_STORE_NAME);

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const deletedEntry = getRequest.result as PaymentsEntry | undefined;

      if (!deletedEntry) {
        reject(new Error("Entry not found"));
        return;
      }
      if (!isOwnedByActiveUser(deletedEntry)) {
        reject(new Error("Cannot restore an entry owned by a different account."));
        return;
      }

      const allRequest = store.getAll();

      allRequest.onerror = () => reject(allRequest.error);

      allRequest.onsuccess = () => {
        const activeEntries = (allRequest.result as PaymentsEntry[])
          .filter(
            e =>
              e.date === deletedEntry.date &&
              !e.isDeleted &&
              isOwnedByActiveUser(e) &&
              e.id !== deletedEntry.id
          )
          .sort((a, b) => a.serialNo - b.serialNo);

        // Shift entries to make room
        activeEntries.forEach(entry => {
          if (entry.serialNo >= deletedEntry.serialNo) {
            entry.serialNo++;
            putLocalRecord(tx, PAYMENTS_STORE_NAME, entry);
          }
        });

        // Restore the deleted entry
        deletedEntry.isDeleted = false;
        delete deletedEntry.deletedAt;

        putLocalRecord(tx, PAYMENTS_STORE_NAME, deletedEntry);
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Permanent Delete function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
async function permanentlyDeleteLocalRecord(storeName: LocalDataStore, id: number): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(
    [storeName, SYNC_OUTBOX_STORE_NAME, SYNC_TOMBSTONES_STORE_NAME],
    'readwrite',
  );
  const complete = transactionDone(transaction);
  const store = transaction.objectStore(storeName);
  const request = store.get(id);
  request.onsuccess = () => {
    if (request.result) {
      deleteLocalRecord(transaction, storeName, request.result);
    }
  };
  await complete;
}

export async function permanentlyDeleteEntry(id: number): Promise<void> {
  return permanentlyDeleteLocalRecord(STORE_NAME, id);
}

export async function permanentlyDeleteEntryCs(id: number): Promise<void> {
  return permanentlyDeleteLocalRecord(CUSTOMER_STORE_NAME, id);
}

export async function permanentlyDeleteEntryEx(id: number): Promise<void> {
  return permanentlyDeleteLocalRecord(EXPENSES_STORE_NAME, id);
}

export async function permanentlyDeleteEntryPy(id: number): Promise<void> {
  return permanentlyDeleteLocalRecord(PAYMENTS_STORE_NAME, id);
}

// Empty Trash function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function emptyTrash(): Promise<void> {
  const trashItems = await getTrashEntries();

  const db = await initDB();

  // 15 days ago
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, SYNC_OUTBOX_STORE_NAME, SYNC_TOMBSTONES_STORE_NAME], "readwrite");
    trashItems.forEach(item => {
      if (
        item.id !== undefined &&
        item.deletedAt &&
        new Date(item.deletedAt).getTime() <= cutoff
      ) {
        deleteLocalRecord(transaction, STORE_NAME, item);
      }
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function emptyTrashCs(): Promise<void> {
  const trashItems = await getTrashEntriesCs();

  const db = await initDB();

  // 15 days ago
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOMER_STORE_NAME, SYNC_OUTBOX_STORE_NAME, SYNC_TOMBSTONES_STORE_NAME], "readwrite");
    trashItems.forEach(item => {
      if (
        item.id !== undefined &&
        item.deletedAt &&
        new Date(item.deletedAt).getTime() <= cutoff
      ) {
        deleteLocalRecord(transaction, CUSTOMER_STORE_NAME, item);
      }
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function emptyTrashEx(): Promise<void> {
  const trashItems = await getTrashEntriesEx();

  const db = await initDB();

  // 15 days ago
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([EXPENSES_STORE_NAME, SYNC_OUTBOX_STORE_NAME, SYNC_TOMBSTONES_STORE_NAME], "readwrite");
    trashItems.forEach(item => {
      if (
        item.id !== undefined &&
        item.deletedAt &&
        new Date(item.deletedAt).getTime() <= cutoff
      ) {
        deleteLocalRecord(transaction, EXPENSES_STORE_NAME, item);
      }
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function emptyTrashPy(): Promise<void> {
  const trashItems = await getTrashEntriesPy();

  const db = await initDB();

  // 15 days ago
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PAYMENTS_STORE_NAME, SYNC_OUTBOX_STORE_NAME, SYNC_TOMBSTONES_STORE_NAME], "readwrite");
    trashItems.forEach(item => {
      if (
        item.id !== undefined &&
        item.deletedAt &&
        new Date(item.deletedAt).getTime() <= cutoff
      ) {
        deleteLocalRecord(transaction, PAYMENTS_STORE_NAME, item);
      }
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// This function returns the maximum serial number for a given date. If there are no entries for that date, it returns 0.
export async function getMaxSerialNo(date: string): Promise<number> {
  const entries = await getEntriesByDate(date);
  if (entries.length === 0) return 0;
  return Math.max(...entries.map((e) => e.serialNo));
}

export async function renumberEntries(date: string): Promise<void> {
  const entries = await getEntriesByDate(date);
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    entries.forEach((entry, index) => {
      entry.serialNo = index + 1;
      putLocalRecord(transaction, STORE_NAME, entry);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function renumberEntriesCs(date: string): Promise<void> {
  const entries = await getEntriesByDateCs(date);

  // Sort by current serial number
  entries.sort((a, b) => a.serialNo - b.serialNo);

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([CUSTOMER_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    entries.forEach((entry, index) => {
      putLocalRecord(tx, CUSTOMER_STORE_NAME, {
        ...entry,
        serialNo: index + 1,
      });
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renumberEntriesEx(date: string): Promise<void> {
  const entries = await getEntriesByDateEx(date);

  // Sort by current serial number
  entries.sort((a, b) => a.serialNo - b.serialNo);

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([EXPENSES_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    entries.forEach((entry, index) => {
      putLocalRecord(tx, EXPENSES_STORE_NAME, {
        ...entry,
        serialNo: index + 1,
      });
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renumberEntriesPy(date: string): Promise<void> {
  const entries = await getEntriesByDatePy(date);

  // Sort by current serial number
  entries.sort((a, b) => a.serialNo - b.serialNo);

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([PAYMENTS_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    entries.forEach((entry, index) => {
      putLocalRecord(tx, PAYMENTS_STORE_NAME, {
        ...entry,
        serialNo: index + 1,
      });
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getLast7Dates(): string[] {
  const dates: string[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  return dates;
}

// Helper function to trigger file download
function downloadBackup(
  entries: JournalEntry[],
  customers: CustomerEntry[],
  expenses: ExpensesEntry[],
  payments: PaymentsEntry[],
  filename: string,
  range?: { startDate: string; endDate: string },
  settings: Array<{ key: string; value: unknown }> = [],
  source: 'supabase' | 'indexeddb-cache' = 'indexeddb-cache',
): void {
  const backupData = {
    version: 1,
    backupId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    source,
    ...(range && { range }),
    settings,

    entries: entries.map((entry) => ({
      ...withoutSyncMetadata(entry),
      isBackup: false,
      backupId: undefined,
    })),

    customers: customers.map((customer) => withoutSyncMetadata(customer)),

    expenses: expenses.map((expense) => withoutSyncMetadata(expense)),

    payments: payments.map((payment) => withoutSyncMetadata(payment)),
  };

  const blob = new Blob(
    [JSON.stringify(backupData, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 500);
}

// Export functions for backup and import
export async function exportWeeklyData(source: 'supabase' | 'indexeddb-cache' = 'indexeddb-cache'): Promise<void> {
  const dates = getLast7Dates();

  const dateSet = new Set(dates);
  const entries = (await getOwnedRecordsIncludingDeleted<JournalEntry>(STORE_NAME))
    .filter((entry) => dateSet.has(entry.date));

  downloadBackup(
    entries,
    await getOwnedRecordsIncludingDeleted<CustomerEntry>(CUSTOMER_STORE_NAME),
    await getOwnedRecordsIncludingDeleted<ExpensesEntry>(EXPENSES_STORE_NAME),
    await getOwnedRecordsIncludingDeleted<PaymentsEntry>(PAYMENTS_STORE_NAME),
    `roznamcha-weekly-backup-${new Date().toISOString().split("T")[0]}.json`,
    undefined,
    await getOwnedSettingsForBackup(),
    source,
  );
}

export async function exportMonthlyData(source: 'supabase' | 'indexeddb-cache' = 'indexeddb-cache'): Promise<void> {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const entries = (await getOwnedRecordsIncludingDeleted<JournalEntry>(STORE_NAME)).filter(
    entry => new Date(entry.date) >= oneMonthAgo
  );

  const customers = (await getOwnedRecordsIncludingDeleted<CustomerEntry>(CUSTOMER_STORE_NAME)).filter(
    customer => new Date(customer.createdAt) >= oneMonthAgo
  );

  const expenses = (await getOwnedRecordsIncludingDeleted<ExpensesEntry>(EXPENSES_STORE_NAME)).filter(
    expense => new Date(expense.createdAt) >= oneMonthAgo
  );

  const payments = (await getOwnedRecordsIncludingDeleted<PaymentsEntry>(PAYMENTS_STORE_NAME)).filter(
    payment => new Date(payment.createdAt) >= oneMonthAgo
  );

  downloadBackup(
    entries,
    customers,
    expenses,
    payments,
    `roznamcha-monthly-backup-${new Date().toISOString().split("T")[0]}.json`,
    undefined,
    await getOwnedSettingsForBackup(),
    source,
  );
}

export async function exportAllData(source: 'supabase' | 'indexeddb-cache' = 'indexeddb-cache'): Promise<void> {
  downloadBackup(
    await getOwnedRecordsIncludingDeleted<JournalEntry>(STORE_NAME),
    await getOwnedRecordsIncludingDeleted<CustomerEntry>(CUSTOMER_STORE_NAME),
    await getOwnedRecordsIncludingDeleted<ExpensesEntry>(EXPENSES_STORE_NAME),
    await getOwnedRecordsIncludingDeleted<PaymentsEntry>(PAYMENTS_STORE_NAME),
    `roznamcha-full-backup-${new Date().toISOString().split("T")[0]}.json`,
    undefined,
    await getOwnedSettingsForBackup(),
    source,
  );
}

export async function exportByDateRange(
  startDate: string,
  endDate: string,
  source: 'supabase' | 'indexeddb-cache' = 'indexeddb-cache',
): Promise<void> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const entries = (await getOwnedRecordsIncludingDeleted<JournalEntry>(STORE_NAME)).filter(entry => {
    const d = new Date(entry.date);
    return d >= start && d <= end;
  });

  const customers = (await getOwnedRecordsIncludingDeleted<CustomerEntry>(CUSTOMER_STORE_NAME)).filter(customer => {
    const d = new Date(customer.createdAt);
    return d >= start && d <= end;
  });

  const expenses = (await getOwnedRecordsIncludingDeleted<ExpensesEntry>(EXPENSES_STORE_NAME)).filter(expense => {
    const d = new Date(expense.createdAt);
    return d >= start && d <= end;
  });

  const payments = (await getOwnedRecordsIncludingDeleted<PaymentsEntry>(PAYMENTS_STORE_NAME)).filter(payment => {
    const d = new Date(payment.createdAt);
    return d >= start && d <= end;
  });

  downloadBackup(
    entries,
    customers,
    expenses,
    payments,
    `roznamcha-${startDate}-to-${endDate}.json`,
    {
      startDate,
      endDate,
    },
    await getOwnedSettingsForBackup(),
    source,
  );
}

type ImportResult = {
  imported: number;
  skipped: number;
  skippedEntries: {
    serialNo: number;
    date: string;
    reason: string;
  }[];
};

// Returns number of entries imported and skipped (with reasons)
export async function importBackup(
  file: File
): Promise<ImportResult> {
  const text = await file.text();
  const data = JSON.parse(text);

  if (
    !data.version ||
    !data.backupId ||
    !Array.isArray(data.entries)
  ) {
    throw new Error("Invalid backup file");
  }

  const backupId = data.backupId;

  const entries: JournalEntry[] = data.entries ?? [];
  const customers: CustomerEntry[] = data.customers ?? [];
  const expenses: ExpensesEntry[] = data.expenses ?? [];
  const payments: PaymentsEntry[] = data.payments ?? [];
  const settings: Array<{ key: string; value: unknown }> = Array.isArray(data.settings)
    ? data.settings
    : [];
  if (settings.some((setting) => typeof setting.key !== 'string'
    || setting.key.startsWith('@sync:')
    || setting.key.includes('::'))) {
    throw new Error('Backup contains an invalid setting key.');
  }

  // Prevent importing the same backup twice
  const allEntries = await getOwnedRecordsIncludingDeleted<JournalEntry>(STORE_NAME);
  const importMarker = await getSetting<boolean>(`backupImported:${backupId}`);

  const alreadyImported = allEntries.some(
    (e) => e.backupId === backupId
  );

  if (alreadyImported || importMarker) {
    throw new Error("Backup already imported");
  }

  const existingCustomers = await getOwnedRecordsIncludingDeleted<CustomerEntry>(CUSTOMER_STORE_NAME);
  const existingExpenses = await getOwnedRecordsIncludingDeleted<ExpensesEntry>(EXPENSES_STORE_NAME);
  const existingPayments = await getOwnedRecordsIncludingDeleted<PaymentsEntry>(PAYMENTS_STORE_NAME);

  const db = await initDB();

  const tx = db.transaction(
    [
      STORE_NAME,
      CUSTOMER_STORE_NAME,
      EXPENSES_STORE_NAME,
      PAYMENTS_STORE_NAME,
      SYNC_OUTBOX_STORE_NAME,
      'settings',
    ],
    "readwrite"
  );

  let imported = 0;
  let skipped = 0;

  const skippedEntries: ImportResult["skippedEntries"] = [];

  // Import Roznamcha entries
  for (const entry of entries) {
    const rest = withoutSyncMetadata(entry);

    const duplicate = allEntries.some(
      (e) =>
        e.date === entry.date &&
        e.serialNo === entry.serialNo
    );

    if (duplicate) {
      skipped++;

      skippedEntries.push({
        serialNo: entry.serialNo,
        date: entry.date,
        reason: "Duplicate entry",
      });

      continue;
    }

    addLocalRecord(tx, STORE_NAME, {
      ...rest,
      isBackup: true,
      backupId,
    });

    imported++;
  }

  // Import customers
  for (const customer of customers) {
    const rest = withoutSyncMetadata(customer);

    const duplicate = existingCustomers.some(
      (c) =>
        c.serialNo === customer.serialNo &&
        c.createdAt === customer.createdAt
    );

    if (!duplicate) {
      addLocalRecord(tx, CUSTOMER_STORE_NAME, rest);
      imported++;
    } else {
      skipped++;
    }
  }

  // Import expenses
  for (const expense of expenses) {
    const rest = withoutSyncMetadata(expense);

    const duplicate = existingExpenses.some(
      (e) =>
        e.serialNo === expense.serialNo &&
        e.createdAt === expense.createdAt
    );

    if (!duplicate) {
      addLocalRecord(tx, EXPENSES_STORE_NAME, rest);
      imported++;
    } else {
      skipped++;
    }
  }

  // Import payments
  for (const payment of payments) {
    const rest = withoutSyncMetadata(payment);

    const duplicate = existingPayments.some(
      (p) =>
        p.serialNo === payment.serialNo &&
        p.createdAt === payment.createdAt
    );

    if (!duplicate) {
      addLocalRecord(tx, PAYMENTS_STORE_NAME, rest);
      imported++;
    } else {
      skipped++;
    }
  }

  for (const setting of settings) {
    putLocalSetting(tx, setting.key, setting.value);
  }
  putLocalSetting(tx, `backupImported:${backupId}`, true);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('roznamcha:data-changed'));
      resolve({
        imported,
        skipped,
        skippedEntries,
      });
    };

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function checkWeeklyBackup() {
  const userId = getActiveSyncUser();
  const lastBackupKey = userId ? `${userId}:lastBackup` : 'lastBackup';
  const firstSeenKey = userId ? `${userId}:backupFirstVisitSeen` : 'backupFirstVisitSeen';
  const lastBackup = localStorage.getItem(lastBackupKey);
  const firstSeen = localStorage.getItem(firstSeenKey);

  const WEEK = 7 * 24 * 60 * 60 * 1000;

  // If this is the user's first visit, mark it and do not trigger or prompt a backup.
  if (!firstSeen) {
    localStorage.setItem(firstSeenKey, Date.now().toString());
    return;
  }

  if (!lastBackup || Date.now() - Number(lastBackup) >= WEEK) {
    // Ask user before downloading. If they accept, perform the export and record the time.
    // If they decline, record the time anyway to avoid prompting on every visit for the next week.
    let userConfirmed = false;

    try {
      userConfirmed = window.confirm(
        "Would you like to download a weekly backup of your Roznamcha data now? (Recommended)"
      );
    } catch (err) {
      // In non-browser environments or if confirm is not available, default to not downloading automatically.
      userConfirmed = false;
    }

    if (userConfirmed) {
      await exportWeeklyData();
      localStorage.setItem(lastBackupKey, Date.now().toString());
    } else {
      // Record that user was asked and declined so we don't prompt on every visit; wait another week before asking again.
      localStorage.setItem(lastBackupKey, Date.now().toString());
    }
  }
}

export async function getWeeklyStats() {
  const stats: { date: string; count: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);

    const dateStr = d.toISOString().split("T")[0];

    const entries = await getEntriesByDate(dateStr);

    stats.push({
      date: dateStr,
      count: entries.length,
    });
  }

  return stats;
}

export async function getInvoiceCounter(): Promise<{ date: string; sequence: number } | undefined> {
  const database = await initDB();
  const userId = getActiveSyncUser();
  const transaction = database.transaction('settings', 'readonly');
  const store = transaction.objectStore('settings');
  const key = userId ? getScopedSettingKey(userId, 'invoiceCounter') : 'invoiceCounter';
  const request = store.get(key);
  const record = await requestValue<Record<string, unknown> | undefined>(request);
  if (record?.value && typeof record.value === 'object') {
    const value = record.value as { date?: unknown; sequence?: unknown };
    if (typeof value.date === 'string' && typeof value.sequence === 'number') {
      return { date: value.date, sequence: value.sequence };
    }
  }
  if (userId && record?.ownerUserId !== userId) return undefined;
  if (typeof record?.date === 'string' && typeof record.sequence === 'number') {
    return { date: record.date, sequence: record.sequence };
  }
  return undefined;
}

export async function saveInvoiceCounter(
  date: string,
  sequence: number
): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction(['settings', SYNC_OUTBOX_STORE_NAME], 'readwrite');
  const complete = transactionDone(transaction);
  putLocalSetting(transaction, 'invoiceCounter', { date, sequence });
  await complete;
}

export async function generateInvoiceNumber() {
  const today = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  let sequence: number;
  const onlineAllocation = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();
  if (onlineAllocation) {
    const formattedDate = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`;
    const { data, error } = await getSupabaseClient().rpc('next_invoice_sequence', {
      p_date: formattedDate,
    });
    if (error) throw new Error(`Could not allocate an invoice number: ${error.message}`);
    sequence = data;
  } else {
    const counter = await getInvoiceCounter();
    sequence = counter && counter.date === today ? counter.sequence + 1 : 1;
  }

  await saveInvoiceCounter(today, sequence);

  return {
    invoiceNo: `INV-${today}-${String(sequence).padStart(3, "0")}${onlineAllocation ? '' : `-${getOfflineInvoiceSuffix()}`}`,
    date: today,
    sequence,
  };
}

function getOfflineInvoiceSuffix(): string {
  const installationId = getActiveInstallationId();
  if (!installationId) {
    throw new Error('The local installation identity is unavailable for offline invoice numbering.');
  }
  return installationId.replace(/-/g, '').slice(0, 6).toUpperCase();
}