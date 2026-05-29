import type { JournalEntry } from '@/types';

const DB_NAME = 'RoznamchaDB';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

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
    };
  });
}

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

export async function deleteEntry(id: number): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllEntries(): Promise<JournalEntry[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as JournalEntry[]);
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
      const entries = request.result as JournalEntry[];
      entries.sort((a, b) => a.serialNo - b.serialNo);
      resolve(entries);
    };
    request.onerror = () => reject(request.error);
  });
}

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
function getLast7Dates(): string[] {
  const dates: string[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  return dates;
}
export async function exportWeeklyData(): Promise<void> {
  const dates = getLast7Dates();

  const allEntries: JournalEntry[] = [];

  for (const date of dates) {
    const entries = await getEntriesByDate(date);
    allEntries.push(...entries);
  }

  const blob = new Blob(
    [JSON.stringify(allEntries, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `roznamcha-week-${new Date().toISOString().split("T")[0]}-backup.json`;
  a.click();

  URL.revokeObjectURL(url);
}
export async function importWeeklyData(file: File): Promise<void> {
  const text = await file.text();
  const entries: JournalEntry[] = JSON.parse(text);

  const db = await initDB();

  // collect entries to import first
  const entriesToAdd: Omit<JournalEntry, "id">[] = [];

  for (const entry of entries) {
    const existingEntries = await getEntriesByDate(entry.date);

    const alreadyExists = existingEntries.some(
      (e) => e.serialNo === entry.serialNo
    );

    if (!alreadyExists) {
      const { id, ...rest } = entry;
      entriesToAdd.push(rest);
    }
  }

  // NOW start transaction
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  for (const entry of entriesToAdd) {
    store.add(entry);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

setInterval(() => {
  exportWeeklyData();
}, 7 * 24 * 60 * 60 * 1000);