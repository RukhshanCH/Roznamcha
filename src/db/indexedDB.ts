import type { CustomerEntry, JournalEntry, ExpensesEntry, PaymentsEntry } from '@/types';

const DB_NAME = 'RoznamchaDB';
const DB_VERSION = 4;
const STORE_NAME = 'entries';
const CUSTOMER_STORE_NAME = 'customers';
const EXPENSES_STORE_NAME = 'expenses';
const PAYMENTS_STORE_NAME = 'payments';

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
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
    };
  });
}

// Get and Set Settings
export async function getSetting<T = string>(key: string): Promise<T | undefined> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("settings", "readonly");
    const store = tx.objectStore("settings");
    const req = store.get(key);

    req.onsuccess = () => {
      // req.result is { key: "companyName", value: "..." } or undefined
      resolve(req.result?.value);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function setSetting<T = string>(key: string, value: T): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    // Because keyPath is "key", we pass the whole object
    const req = store.put({ key, value });

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// CRUD operations for Journal Entries

// Add Entries function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function addEntry(entry: Omit<JournalEntry, 'id'>): Promise<number> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(entry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function addEntryCs(entry: Omit<CustomerEntry, 'id'>): Promise<number> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([CUSTOMER_STORE_NAME], 'readwrite');
    const store = tx.objectStore(CUSTOMER_STORE_NAME);
    const request = store.add(entry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function addEntryEx(entry: Omit<ExpensesEntry, 'id'>): Promise<number> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([EXPENSES_STORE_NAME], 'readwrite');
    const store = tx.objectStore(EXPENSES_STORE_NAME);
    const request = store.add(entry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function addEntryPy(entry: Omit<PaymentsEntry, 'id'>): Promise<number> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([PAYMENTS_STORE_NAME], 'readwrite');
    const store = tx.objectStore(PAYMENTS_STORE_NAME);
    const request = store.add(entry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

// Update Entries function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function updateEntry(entry: JournalEntry): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateEntryCs(entry: CustomerEntry): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([CUSTOMER_STORE_NAME], 'readwrite');
    const store = tx.objectStore(CUSTOMER_STORE_NAME);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateEntryEx(entry: ExpensesEntry): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([EXPENSES_STORE_NAME], 'readwrite');
    const store = tx.objectStore(EXPENSES_STORE_NAME);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateEntryPy(entry: PaymentsEntry): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([PAYMENTS_STORE_NAME], 'readwrite');
    const store = tx.objectStore(PAYMENTS_STORE_NAME);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Delete Entries function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function deleteEntry(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
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

      const updateRequest = store.put(entry);

      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
  });
}

export async function deleteEntryCs(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOMER_STORE_NAME], "readwrite");
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

      const updateRequest = store.put(entry);

      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
  });
}

export async function deleteEntryEx(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([EXPENSES_STORE_NAME], "readwrite");
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

      const updateRequest = store.put(entry);

      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
  });
}

export async function deleteEntryPy(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PAYMENTS_STORE_NAME], "readwrite");
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

      const updateRequest = store.put(entry);

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
        entry => !entry.isDeleted
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
    const index = store.index('date');
    const request = index.getAll(date);

    request.onsuccess = () => {
      const entries = (request.result as JournalEntry[])
        .filter(entry => !entry.isDeleted)
        .sort((a, b) => a.serialNo - b.serialNo);

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
        entry => !entry.isDeleted
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

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result as CustomerEntry[];

      const filtered = entries
        .filter(e => e.date === date && !e.isDeleted)
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
        entry => !entry.isDeleted
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

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result as ExpensesEntry[];

      const filtered = entries
        .filter(e => e.date === date && !e.isDeleted)
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
        entry => !entry.isDeleted
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

    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result as PaymentsEntry[];

      const filtered = entries
        .filter(e => e.date === date && !e.isDeleted)
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
        entry => entry.isDeleted
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
        entry => entry.isDeleted
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
        entry => entry.isDeleted
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
        entry => entry.isDeleted
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
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const dateIndex = store.index("date");

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const deletedEntry = getRequest.result as JournalEntry;

      if (!deletedEntry) {
        reject(new Error("Entry not found"));
        return;
      }

      const dateRequest = dateIndex.getAll(deletedEntry.date);

      dateRequest.onerror = () => reject(dateRequest.error);

      dateRequest.onsuccess = () => {
        const activeEntries = (dateRequest.result as JournalEntry[])
          .filter(e => !e.isDeleted && e.id !== deletedEntry.id)
          .sort((a, b) => a.serialNo - b.serialNo);

        // Shift serial numbers to make space
        activeEntries.forEach(entry => {
          if (entry.serialNo >= deletedEntry.serialNo) {
            entry.serialNo += 1;
            store.put(entry);
          }
        });

        // Restore entry
        deletedEntry.isDeleted = false;
        delete deletedEntry.deletedAt;

        store.put(deletedEntry);
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function restoreEntryCs(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOMER_STORE_NAME, "readwrite");
    const store = tx.objectStore(CUSTOMER_STORE_NAME);


    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const deletedEntry = getRequest.result as CustomerEntry;

      if (!deletedEntry) {
        reject(new Error("Entry not found"));
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
              e.id !== deletedEntry.id
          )
          .sort((a, b) => a.serialNo - b.serialNo);

        // Shift entries to make room
        activeEntries.forEach(entry => {
          if (entry.serialNo >= deletedEntry.serialNo) {
            entry.serialNo++;
            store.put(entry);
          }
        });

        // Restore the deleted entry
        deletedEntry.isDeleted = false;
        delete deletedEntry.deletedAt;

        store.put(deletedEntry);
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function restoreEntryEx(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPENSES_STORE_NAME, "readwrite");
    const store = tx.objectStore(EXPENSES_STORE_NAME);

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const deletedEntry = getRequest.result as ExpensesEntry;

      if (!deletedEntry) {
        reject(new Error("Entry not found"));
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
              e.id !== deletedEntry.id
          )
          .sort((a, b) => a.serialNo - b.serialNo);

        // Shift entries to make room
        activeEntries.forEach(entry => {
          if (entry.serialNo >= deletedEntry.serialNo) {
            entry.serialNo++;
            store.put(entry);
          }
        });

        // Restore the deleted entry
        deletedEntry.isDeleted = false;
        delete deletedEntry.deletedAt;

        store.put(deletedEntry);
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function restoreEntryPy(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAYMENTS_STORE_NAME, "readwrite");
    const store = tx.objectStore(PAYMENTS_STORE_NAME);

    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);

    getRequest.onsuccess = () => {
      const deletedEntry = getRequest.result as PaymentsEntry;

      if (!deletedEntry) {
        reject(new Error("Entry not found"));
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
              e.id !== deletedEntry.id
          )
          .sort((a, b) => a.serialNo - b.serialNo);

        // Shift entries to make room
        activeEntries.forEach(entry => {
          if (entry.serialNo >= deletedEntry.serialNo) {
            entry.serialNo++;
            store.put(entry);
          }
        });

        // Restore the deleted entry
        deletedEntry.isDeleted = false;
        delete deletedEntry.deletedAt;

        store.put(deletedEntry);
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Permanent Delete function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function permanentlyDeleteEntry(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function permanentlyDeleteEntryCs(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CUSTOMER_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CUSTOMER_STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function permanentlyDeleteEntryEx(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(EXPENSES_STORE_NAME, "readwrite");
    const store = transaction.objectStore(EXPENSES_STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function permanentlyDeleteEntryPy(id: number): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PAYMENTS_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PAYMENTS_STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Empty Trash function created for Roznamcha, CustomerEntry, ExpensesEntry, and PaymentsEntry
export async function emptyTrash(): Promise<void> {
  const trashItems = await getTrashEntries();

  const db = await initDB();

  // 15 days ago
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    trashItems.forEach(item => {
      if (
        item.id !== undefined &&
        item.deletedAt &&
        new Date(item.deletedAt).getTime() <= cutoff
      ) {
        store.delete(item.id);
      }
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function emptyTrashCs(): Promise<void> {
  const trashItems = await getTrashEntries();

  const db = await initDB();

  // 15 days ago
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CUSTOMER_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CUSTOMER_STORE_NAME);

    trashItems.forEach(item => {
      if (
        item.id !== undefined &&
        item.deletedAt &&
        new Date(item.deletedAt).getTime() <= cutoff
      ) {
        store.delete(item.id);
      }
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function emptyTrashEx(): Promise<void> {
  const trashItems = await getTrashEntries();

  const db = await initDB();

  // 15 days ago
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(EXPENSES_STORE_NAME, "readwrite");
    const store = transaction.objectStore(EXPENSES_STORE_NAME);

    trashItems.forEach(item => {
      if (
        item.id !== undefined &&
        item.deletedAt &&
        new Date(item.deletedAt).getTime() <= cutoff
      ) {
        store.delete(item.id);
      }
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function emptyTrashPy(): Promise<void> {
  const trashItems = await getTrashEntries();

  const db = await initDB();

  // 15 days ago
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PAYMENTS_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PAYMENTS_STORE_NAME);

    trashItems.forEach(item => {
      if (
        item.id !== undefined &&
        item.deletedAt &&
        new Date(item.deletedAt).getTime() <= cutoff
      ) {
        store.delete(item.id);
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
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    entries.forEach((entry, index) => {
      entry.serialNo = index + 1;
      store.put(entry);
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
    const tx = db.transaction(CUSTOMER_STORE_NAME, 'readwrite');
    const store = tx.objectStore(CUSTOMER_STORE_NAME);

    entries.forEach((entry, index) => {
      store.put({
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
    const tx = db.transaction(EXPENSES_STORE_NAME, 'readwrite');
    const store = tx.objectStore(EXPENSES_STORE_NAME);

    entries.forEach((entry, index) => {
      store.put({
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
    const tx = db.transaction(PAYMENTS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PAYMENTS_STORE_NAME);

    entries.forEach((entry, index) => {
      store.put({
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
  range?: { startDate: string; endDate: string }
): void {
  const backupData = {
    version: 1,
    backupId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    ...(range && { range }),

    entries: entries.map(({ id, ...entry }) => ({
      ...entry,
      isBackup: false,
      backupId: undefined,
    })),

    customers: customers.map(({ id, ...customer }) => ({
      ...customer,
    })),

    expenses: expenses.map(({ id, ...expense }) => ({
      ...expense,
    })),

    payments: payments.map(({ id, ...payment }) => ({
      ...payment,
    })),
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
export async function exportWeeklyData(): Promise<void> {
  const dates = getLast7Dates();

  const entries: JournalEntry[] = [];

  for (const date of dates) {
    entries.push(...await getEntriesByDate(date));
  }

  downloadBackup(
    entries,
    await getCustomers(),
    await getExpenses(),
    await getPayments(),
    `roznamcha-weekly-backup-${new Date().toISOString().split("T")[0]}.json`
  );
}

export async function exportMonthlyData(): Promise<void> {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const entries = (await getAllEntries()).filter(
    entry => new Date(entry.date) >= oneMonthAgo
  );

  const customers = (await getCustomers()).filter(
    customer => new Date(customer.createdAt) >= oneMonthAgo
  );

  const expenses = (await getExpenses()).filter(
    expense => new Date(expense.createdAt) >= oneMonthAgo
  );

  const payments = (await getPayments()).filter(
    payment => new Date(payment.createdAt) >= oneMonthAgo
  );

  downloadBackup(
    entries,
    customers,
    expenses,
    payments,
    `roznamcha-monthly-backup-${new Date().toISOString().split("T")[0]}.json`
  );
}

export async function exportAllData(): Promise<void> {
  downloadBackup(
    await getAllEntries(),
    await getCustomers(),
    await getExpenses(),
    await getPayments(),
    `roznamcha-full-backup-${new Date().toISOString().split("T")[0]}.json`
  );
}

export async function exportByDateRange(
  startDate: string,
  endDate: string
): Promise<void> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const entries = (await getAllEntries()).filter(entry => {
    const d = new Date(entry.date);
    return d >= start && d <= end;
  });

  const customers = (await getCustomers()).filter(customer => {
    const d = new Date(customer.createdAt);
    return d >= start && d <= end;
  });

  const expenses = (await getExpenses()).filter(expense => {
    const d = new Date(expense.createdAt);
    return d >= start && d <= end;
  });

  const payments = (await getPayments()).filter(payment => {
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
    }
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

  // Prevent importing the same backup twice
  const allEntries = await getAllEntries();

  const alreadyImported = allEntries.some(
    (e) => e.backupId === backupId
  );

  if (alreadyImported) {
    throw new Error("Backup already imported");
  }

  const existingCustomers = await getCustomers();
  const existingExpenses = await getExpenses();
  const existingPayments = await getPayments();

  const db = await initDB();

  const tx = db.transaction(
    [
      STORE_NAME,
      CUSTOMER_STORE_NAME,
      EXPENSES_STORE_NAME,
      PAYMENTS_STORE_NAME,
    ],
    "readwrite"
  );

  const entriesStore = tx.objectStore(STORE_NAME);
  const customersStore = tx.objectStore(CUSTOMER_STORE_NAME);
  const expensesStore = tx.objectStore(EXPENSES_STORE_NAME);
  const paymentsStore = tx.objectStore(PAYMENTS_STORE_NAME);

  let imported = 0;
  let skipped = 0;

  const skippedEntries: ImportResult["skippedEntries"] = [];

  // Import Roznamcha entries
  for (const entry of entries) {
    const { id, ...rest } = entry;

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

    entriesStore.add({
      ...rest,
      isBackup: true,
      backupId,
    });

    imported++;
  }

  // Import customers
  for (const customer of customers) {
    const { id, ...rest } = customer;

    const duplicate = existingCustomers.some(
      (c) =>
        c.serialNo === customer.serialNo &&
        c.createdAt === customer.createdAt
    );

    if (!duplicate) {
      customersStore.add(rest);
      imported++;
    } else {
      skipped++;
    }
  }

  // Import expenses
  for (const expense of expenses) {
    const { id, ...rest } = expense;

    const duplicate = existingExpenses.some(
      (e) =>
        e.serialNo === expense.serialNo &&
        e.createdAt === expense.createdAt
    );

    if (!duplicate) {
      expensesStore.add(rest);
      imported++;
    } else {
      skipped++;
    }
  }

  // Import payments
  for (const payment of payments) {
    const { id, ...rest } = payment;

    const duplicate = existingPayments.some(
      (p) =>
        p.serialNo === payment.serialNo &&
        p.createdAt === payment.createdAt
    );

    if (!duplicate) {
      paymentsStore.add(rest);
      imported++;
    } else {
      skipped++;
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () =>
      resolve({
        imported,
        skipped,
        skippedEntries,
      });

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function checkWeeklyBackup() {
  const lastBackup = localStorage.getItem("lastBackup");
  const firstSeen = localStorage.getItem("backupFirstVisitSeen");

  const WEEK = 7 * 24 * 60 * 60 * 1000;

  // If this is the user's first visit, mark it and do not trigger or prompt a backup.
  if (!firstSeen) {
    localStorage.setItem("backupFirstVisitSeen", Date.now().toString());
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
      localStorage.setItem("lastBackup", Date.now().toString());
    } else {
      // Record that user was asked and declined so we don't prompt on every visit; wait another week before asking again.
      localStorage.setItem("lastBackup", Date.now().toString());
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

export function getInvoiceCounter(): Promise<any> {
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction("settings", "readonly");
    const store = transaction.objectStore("settings");

    const request = store.get("invoiceCounter");

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => reject(request.error);
  });
}

export function saveInvoiceCounter(
  date: string,
  sequence: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction("settings", "readwrite");
    const store = transaction.objectStore("settings");

    store.put({
      key: "invoiceCounter",
      date,
      sequence,
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function generateInvoiceNumber() {
  const today = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  const counter = await getInvoiceCounter();

  let sequence = 1;

  if (counter && counter.date === today) {
    sequence = counter.sequence + 1;
  }

  return {
    invoiceNo: `INV-${today}-${String(sequence).padStart(3, "0")}`,
    date: today,
    sequence,
  };
}