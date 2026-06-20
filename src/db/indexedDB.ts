import type { CustomerEntry, JournalEntry } from '@/types';

const DB_NAME = 'RoznamchaDB';
const DB_VERSION = 2;
const STORE_NAME = 'entries';
const CUSTOMER_STORE_NAME = 'customers';

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
        database.createObjectStore(CUSTOMER_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
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

export async function deleteEntryCs(id: number): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([CUSTOMER_STORE_NAME], 'readwrite');
    const store = tx.objectStore(CUSTOMER_STORE_NAME);
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

export async function getCustomers(): Promise<CustomerEntry[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction([CUSTOMER_STORE_NAME], 'readonly');
    const store = tx.objectStore(CUSTOMER_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as CustomerEntry[]);
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

// Helper function to trigger file download
function downloadBackup(
  entries: JournalEntry[],
  filename: string
): void {
  const backupData = {
    version: 1,
    backupId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    entries: entries.map(({ id, ...entry }) => ({
      ...entry,
      isBackup: false,
      backupId: undefined,
    })),
  };

  const blob = new Blob(
    [JSON.stringify(backupData, null, 2)],
    {
      type: "application/json",
    }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
// Export functions for backup and import
export async function exportWeeklyData(): Promise<void> {
  const dates = getLast7Dates();

  const allEntries: JournalEntry[] = [];

  for (const date of dates) {
    const entries = await getEntriesByDate(date);
    allEntries.push(...entries);
  }

  downloadBackup(
    allEntries,
    `roznamcha-weekly-backup-${
      new Date().toISOString().split("T")[0]
    }.json`
  );
}
export async function exportMonthlyData(): Promise<void> {
  const allEntries = await getAllEntries();

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const monthlyEntries = allEntries.filter(
    (entry) => new Date(entry.date) >= oneMonthAgo
  );

  downloadBackup(
    monthlyEntries,
    `roznamcha-monthly-backup-${
      new Date().toISOString().split("T")[0]
    }.json`
  );
}
export async function exportAllData(): Promise<void> {
  const allEntries = await getAllEntries();

  downloadBackup(
    allEntries,
    `roznamcha-full-backup-${
      new Date().toISOString().split("T")[0]
    }.json`
  );
}
export async function exportByDateRange(
  startDate: string,
  endDate: string
): Promise<void> {
  const allEntries = await getAllEntries();

  const filtered = allEntries.filter((entry) => {
    const entryDate = new Date(entry.date);
    return (
      entryDate >= new Date(startDate) &&
      entryDate <= new Date(endDate)
    );
  });

  const backupData = {
    version: 1,
    backupId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    range: {
      startDate,
      endDate,
    },
    entries: filtered.map(({ id, ...entry }) => ({
      ...entry,
      isBackup: false,
      backupId: undefined,
    })),
  };

  const blob = new Blob([JSON.stringify(backupData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `roznamcha-${startDate}-to-${endDate}.json`;

  a.click();

  URL.revokeObjectURL(url);
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
export async function importWeeklyData(
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
  const entries: JournalEntry[] = data.entries;

  const allEntries = await getAllEntries();

  const alreadyImported = allEntries.some(
    (e) => e.backupId === backupId
  );

  if (alreadyImported) {
    throw new Error("Backup already imported");
  }

  const db = await initDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  let imported = 0;
  let skipped = 0;

  const skippedEntries: ImportResult["skippedEntries"] = [];

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

    store.add({
      ...rest,
      isBackup: true,
      backupId,
    });

    imported++;
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () =>
      resolve({ imported, skipped, skippedEntries });

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function checkWeeklyBackup() {
  const lastBackup = localStorage.getItem("lastBackup");

  const WEEK = 7 * 24 * 60 * 60 * 1000;

  if (
    !lastBackup ||
    Date.now() - Number(lastBackup) >= WEEK
  ) {
    await exportWeeklyData();

    localStorage.setItem(
      "lastBackup",
      Date.now().toString()
    );
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