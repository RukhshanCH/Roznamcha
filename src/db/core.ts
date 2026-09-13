// src/db/core.ts
// Core IndexedDB utilities used across feature modules.

const DB_NAME = 'RoznamchaDB';
const DB_VERSION = 4;
export const STORE_NAME = 'entries';
export const CUSTOMER_STORE_NAME = 'customers';
export const EXPENSES_STORE_NAME = 'expenses';
export const PAYMENTS_STORE_NAME = 'payments';

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
        console.warn('IndexedDB version change detected; the database connection was closed. Reload the page to reconnect.');
      };
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('serialNo', 'serialNo', { unique: false });
      }
      if (!database.objectStoreNames.contains(CUSTOMER_STORE_NAME)) {
        const customerStore = database.createObjectStore(CUSTOMER_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        customerStore.createIndex('date', 'date', { unique: false });
        customerStore.createIndex('serialNo', 'serialNo', { unique: false });
      }
      if (!database.objectStoreNames.contains(EXPENSES_STORE_NAME)) {
        const expensesStore = database.createObjectStore(EXPENSES_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        expensesStore.createIndex('date', 'date', { unique: false });
        expensesStore.createIndex('serialNo', 'serialNo', { unique: false });
      }
      if (!database.objectStoreNames.contains(PAYMENTS_STORE_NAME)) {
        const paymentsStore = database.createObjectStore(PAYMENTS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        paymentsStore.createIndex('date', 'date', { unique: false });
        paymentsStore.createIndex('serialNo', 'serialNo', { unique: false });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// Settings helpers
export async function getSetting<T = string>(key: string): Promise<T | undefined> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value);
    req.onerror = () => reject(req.error);
  });
}

export async function setSetting<T = string>(key: string, value: T): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
