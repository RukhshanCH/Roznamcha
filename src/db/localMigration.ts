import type { Json } from '@/types/database.types';
import { getSupabaseClient } from '@/lib/supabase';
import { DATABASE_VERSION, initDB, SYNC_OUTBOX_STORE_NAME } from '@/db/indexedDB';

const INSTALLATION_KEY = '@sync:installationId';
const PENDING_USER_KEY = '@sync:pendingMigrationUser';
const OWNER_KEY = '@sync:legacyDataOwner';
const RUN_KEY_PREFIX = '@sync:migration:';
const BACKUP_STORAGE_KEYS = ['lastBackup', 'backupFirstVisitSeen'] as const;
const BATCH_SIZE = 50;
const NUMERIC_COLUMNS = new Set([
  'local_id',
  'serial_no',
  'total',
  'advance',
  'remaining',
  'remaining_plus',
  'amount',
]);

type StoreName = 'entries' | 'customers' | 'expenses' | 'payments';
type RawRecord = Record<string, unknown> & { id?: number };
type RawSetting = Record<string, unknown> & { key: string };
type MigrationStatus = 'pending' | 'running' | 'failed' | 'verified';

export interface MigrationProgress {
  stage: 'preparing' | 'uploading' | 'verifying' | 'complete';
  store: string;
  completed: number;
  total: number;
}

export interface MigrationPreview {
  counts: Record<StoreName | 'settings', number>;
  deletedCounts: Record<StoreName, number>;
  hasLegacyData: boolean;
  pendingForAnotherUser: boolean;
  alreadyVerified: boolean;
}

interface LocalMigrationState {
  status: MigrationStatus;
  ownerUserId?: string;
  error?: string;
}

type RemoteRowRef = { id: string; local_id: number; sync_version: number };

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

async function readAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).getAll());
}

async function readSetting<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  const transaction = db.transaction('settings', 'readonly');
  const result = await requestResult(transaction.objectStore('settings').get(key)) as { value?: T } | undefined;
  return result?.value;
}

async function writeSettings(db: IDBDatabase, records: Array<{ key: string; value: unknown }>): Promise<void> {
  const transaction = db.transaction('settings', 'readwrite');
  const complete = transactionResult(transaction);
  const store = transaction.objectStore('settings');
  for (const record of records) store.put(record);
  await complete;
}

async function getInstallationId(db: IDBDatabase): Promise<string> {
  const current = await readSetting<unknown>(db, INSTALLATION_KEY);
  if (typeof current === 'string' && current.length > 0) return current;

  const installationId = crypto.randomUUID();
  await writeSettings(db, [{ key: INSTALLATION_KEY, value: installationId }]);
  return installationId;
}

export async function getSyncInstallationId(): Promise<string> {
  return getInstallationId(await initDB());
}

function isOwnedBy(record: RawRecord | RawSetting, userId: string): boolean {
  return record.ownerUserId === userId;
}

function isUnowned(record: RawRecord | RawSetting): boolean {
  return typeof record.ownerUserId !== 'string';
}

function isSystemSetting(record: RawSetting): boolean {
  return record.key.startsWith('@sync:') || record.key.includes('::');
}

function getLegacyBrowserSettings(ownerUserId: string | undefined, userId: string): RawSetting[] {
  if (typeof localStorage === 'undefined' || (ownerUserId && ownerUserId !== userId)) return [];
  return BACKUP_STORAGE_KEYS.flatMap((key) => {
    const value = localStorage.getItem(key);
    return value === null ? [] : [{ key: `localStorage:${key}`, value }];
  });
}

function validId(record: RawRecord, store: string): number {
  if (typeof record.id !== 'number' || !Number.isSafeInteger(record.id)) {
    throw new Error(`Cannot migrate ${store} record with an invalid local ID.`);
  }
  return record.id;
}

function text(value: unknown, field: string, defaultValue = ''): string {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'string') throw new Error(`Cannot migrate a record with an invalid ${field}.`);
  return value;
}

function numeric(value: unknown, field: string, defaultValue = 0): number {
  if (value === undefined || value === null) return defaultValue;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Cannot migrate a record with an invalid ${field}.`);
  return parsed;
}

function dateOnly(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Cannot migrate a record with an invalid ${field} date.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Cannot migrate a record with an invalid ${field} date.`);
  }
  return value;
}

function timestamp(value: unknown, field: string): string {
  const parsed = typeof value === 'number' || typeof value === 'string'
    ? new Date(value)
    : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Cannot migrate a record with an invalid ${field} timestamp.`);
  return parsed.toISOString();
}

function nullableTimestamp(value: unknown, field: string): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : timestamp(value, field);
}

function asJson(value: unknown, field: string): Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => asJson(item, field));
  if (typeof value === 'object') {
    const result: { [key: string]: Json | undefined } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) result[key] = asJson(item, field);
    }
    return result;
  }
  throw new Error(`Cannot migrate setting "${field}" because it is not JSON-compatible.`);
}

function settingValue(record: RawSetting): Json {
  if (Object.prototype.hasOwnProperty.call(record, 'value')) {
    return asJson(record.value, record.key);
  }
  return asJson(Object.fromEntries(
    Object.entries(record).filter(([key]) =>
      !['key', 'ownerUserId', 'cloudId', 'cloudVersion', 'syncStatus'].includes(key),
    ),
  ), record.key);
}

function commonFields(record: RawRecord, store: StoreName, userId: string, installationId: string) {
  const localId = validId(record, store);
  return {
    id: typeof record.cloudId === 'string' ? record.cloudId : crypto.randomUUID(),
    user_id: userId,
    installation_id: typeof record.sourceInstallationId === 'string'
      ? record.sourceInstallationId
      : installationId,
    local_id: typeof record.sourceLocalId === 'number' ? record.sourceLocalId : localId,
    serial_no: numeric(record.serialNo, 'serialNo'),
    date: dateOnly(record.date, store),
    created_at: timestamp(record.createdAt, 'createdAt'),
    is_deleted: record.isDeleted === true,
    deleted_at: nullableTimestamp(record.deletedAt, 'deletedAt'),
  };
}

function mapJournalEntry(record: RawRecord, userId: string, installationId: string) {
  if (record.paymentMethod !== undefined
    && record.paymentMethod !== 'cash'
    && record.paymentMethod !== 'online') {
    throw new Error('Cannot migrate a journal entry with an invalid payment method.');
  }
  const paymentMethod: 'cash' | 'online' = record.paymentMethod === 'online' ? 'online' : 'cash';
  return {
    ...commonFields(record, 'entries', userId, installationId),
    name: text(record.name, 'name'),
    mobile_number: text(record.mobileNumber, 'mobileNumber'),
    total: numeric(record.total, 'total'),
    advance: numeric(record.advance, 'advance'),
    remaining: numeric(record.remaining, 'remaining'),
    remaining_plus: numeric(record.remainingPlus, 'remainingPlus'),
    note: text(record.note, 'note'),
    payment_method: paymentMethod,
    debt_id: text(record.debtId, 'debtId') || null,
    is_backup: record.isBackup === true,
    backup_id: text(record.backupId, 'backupId') || null,
  };
}

function mapCustomer(record: RawRecord, userId: string, installationId: string) {
  return {
    ...commonFields(record, 'customers', userId, installationId),
    name: text(record.name, 'name'),
    mobile_number: text(record.mobileNumber, 'mobileNumber'),
  };
}

function mapAmount(record: RawRecord, store: 'expenses' | 'payments', userId: string, installationId: string) {
  return {
    ...commonFields(record, store, userId, installationId),
    name: text(record.name, 'name'),
    description: text(record.description, 'description'),
    amount: numeric(record.amount, 'amount'),
  };
}

function counterDate(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Cannot migrate the invoice counter because its date is missing.');
  }
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  const normalized = compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : value;
  return dateOnly(normalized, 'invoice counter');
}

async function updateMigrationRun(
  userId: string,
  installationId: string,
  status: MigrationStatus,
  counts: Record<string, number>,
  error: string | null = null,
) {
  const { error: runError } = await getSupabaseClient()
    .from('migration_runs')
    .upsert({
      user_id: userId,
      installation_id: installationId,
      source_db_version: DATABASE_VERSION,
      status,
      store_counts: counts,
      last_error: error,
      completed_at: status === 'verified' ? new Date().toISOString() : null,
    }, { onConflict: 'user_id,installation_id' });
  if (runError) throw runError;
}

async function pushBatches<T>(
  total: number,
  store: string,
  rows: T[],
  upload: (batch: T[]) => Promise<void>,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    await upload(batch);
    onProgress?.({
      stage: 'uploading',
      store,
      completed: Math.min(offset + batch.length, rows.length),
      total,
    });
  }
}

async function uploadJournal(
  rows: ReturnType<typeof mapJournalEntry>[],
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journal_entries')
    .upsert(rows, { onConflict: 'user_id,installation_id,local_id', ignoreDuplicates: true });
  if (error) throw error;
}

async function uploadCustomers(
  rows: ReturnType<typeof mapCustomer>[],
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('customers')
    .upsert(rows, { onConflict: 'user_id,installation_id,local_id', ignoreDuplicates: true });
  if (error) throw error;
}

async function uploadExpenses(
  rows: ReturnType<typeof mapAmount>[],
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('expenses')
    .upsert(rows, { onConflict: 'user_id,installation_id,local_id', ignoreDuplicates: true });
  if (error) throw error;
}

async function uploadPayments(
  rows: ReturnType<typeof mapAmount>[],
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('payments')
    .upsert(rows, { onConflict: 'user_id,installation_id,local_id', ignoreDuplicates: true });
  if (error) throw error;
}

async function verifyStore(
  table: StoreName,
  userId: string,
  installationId: string,
  expected: number,
): Promise<RemoteRowRef[]> {
  const supabase = getSupabaseClient();
  const result: RemoteRowRef[] = [];
  const pageSize = 500;
  if (table === 'entries') {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('journal_entries')
        .select('id,local_id,sync_version')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      result.push(...data);
      if (data.length < pageSize) break;
    }
  } else if (table === 'customers') {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('customers')
        .select('id,local_id,sync_version')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      result.push(...data);
      if (data.length < pageSize) break;
    }
  } else if (table === 'expenses') {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('expenses')
        .select('id,local_id,sync_version')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      result.push(...data);
      if (data.length < pageSize) break;
    }
  } else {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('payments')
        .select('id,local_id,sync_version')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      result.push(...data);
      if (data.length < pageSize) break;
    }
  }
  if (result.length !== expected) {
    throw new Error(`${table} verification failed: expected ${expected}, found ${result.length}.`);
  }
  return result;
}

async function getExistingInstallationRows(
  store: StoreName,
  userId: string,
  installationId: string,
): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabaseClient();
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += 500) {
    let result;
    switch (store) {
      case 'entries':
        result = await supabase.from('journal_entries').select('*')
          .eq('user_id', userId).eq('installation_id', installationId)
          .order('id').range(offset, offset + 499);
        break;
      case 'customers':
        result = await supabase.from('customers').select('*')
          .eq('user_id', userId).eq('installation_id', installationId)
          .order('id').range(offset, offset + 499);
        break;
      case 'expenses':
        result = await supabase.from('expenses').select('*')
          .eq('user_id', userId).eq('installation_id', installationId)
          .order('id').range(offset, offset + 499);
        break;
      case 'payments':
        result = await supabase.from('payments').select('*')
          .eq('user_id', userId).eq('installation_id', installationId)
          .order('id').range(offset, offset + 499);
        break;
    }
    if (result.error) throw result.error;
    rows.push(...result.data);
    if (result.data.length < 500) break;
  }
  return rows;
}

function normalizedField(value: unknown, key: string): unknown {
  if ((key === 'created_at' || key === 'deleted_at') && typeof value === 'string') {
    return new Date(value).toISOString();
  }
  if (NUMERIC_COLUMNS.has(key) && value !== null && value !== undefined) {
    return Number(value);
  }
  return value;
}

async function assertMigrationRowsCompatible(
  store: StoreName,
  userId: string,
  installationId: string,
  expectedRows: Array<Record<string, unknown>>,
): Promise<void> {
  const existingRows = await getExistingInstallationRows(store, userId, installationId);
  const existingByLocalId = new Map(
    existingRows.map((row) => [Number(row.local_id), row]),
  );
  for (const expected of expectedRows) {
    const existing = existingByLocalId.get(Number(expected.local_id));
    if (!existing) continue;
    const mismatchedField = Object.entries(expected).find(([key, value]) => {
      if (key === 'sync_version' || key === 'updated_at') return false;
      return normalizedField(existing[key], key) !== normalizedField(value, key);
    })?.[0];
    if (mismatchedField) {
      throw new Error(
        `Migration conflict in ${store} local record ${expected.local_id}: cloud field "${mismatchedField}" differs. Local data was preserved and not uploaded over the cloud record.`,
      );
    }
  }
}

async function saveStableIds(
  db: IDBDatabase,
  installationId: string,
  stores: Record<StoreName, RawRecord[]>,
): Promise<void> {
  const transaction = db.transaction(Object.keys(stores), 'readwrite');
  const complete = transactionResult(transaction);
  for (const [store, records] of Object.entries(stores) as Array<[StoreName, RawRecord[]]>) {
    const objectStore = transaction.objectStore(store);
    for (const record of records) {
      record.cloudId = typeof record.cloudId === 'string' ? record.cloudId : crypto.randomUUID();
      record.sourceInstallationId = typeof record.sourceInstallationId === 'string'
        ? record.sourceInstallationId
        : installationId;
      record.sourceLocalId = typeof record.sourceLocalId === 'number'
        ? record.sourceLocalId
        : validId(record, store);
      if (store === 'entries' && !record.debtId) record.debtId = crypto.randomUUID();
      objectStore.put(record);
    }
  }
  await complete;
}

async function finalizeLocalMigration(
  db: IDBDatabase,
  userId: string,
  installationId: string,
  stores: Record<StoreName, RawRecord[]>,
  references: Record<StoreName, RemoteRowRef[]>,
  settings: RawSetting[],
): Promise<void> {
  const storeNames = [...Object.keys(stores), 'settings', SYNC_OUTBOX_STORE_NAME];
  const transaction = db.transaction(storeNames, 'readwrite');
  const complete = transactionResult(transaction);

  for (const store of Object.keys(stores) as StoreName[]) {
    const byLocalId = new Map(references[store].map((row) => [row.local_id, row]));
    const objectStore = transaction.objectStore(store);
    for (const record of stores[store]) {
      const localId = validId(record, store);
      const sourceLocalId = typeof record.sourceLocalId === 'number' ? record.sourceLocalId : localId;
      const remote = byLocalId.get(sourceLocalId);
      if (!remote) throw new Error(`Could not finalize ${store} record ${localId}: cloud row is missing.`);
      objectStore.put({
        ...record,
        ownerUserId: userId,
        cloudId: remote.id,
        cloudVersion: remote.sync_version,
        syncStatus: 'synced',
        sourceInstallationId: installationId,
        sourceLocalId: localId,
      });
      transaction.objectStore(SYNC_OUTBOX_STORE_NAME).delete(`${userId}:${store}:${localId}`);
    }
  }

  const settingsStore = transaction.objectStore('settings');
  for (const setting of settings) {
    settingsStore.put({ ...setting, ownerUserId: userId });
  }

  settingsStore.put({ key: OWNER_KEY, value: userId });
  settingsStore.put({
    key: `${RUN_KEY_PREFIX}${userId}`,
    value: { status: 'verified', ownerUserId: userId } satisfies LocalMigrationState,
  });
  settingsStore.delete(PENDING_USER_KEY);

  await complete;

  if (typeof localStorage !== 'undefined') {
    for (const key of BACKUP_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) localStorage.setItem(`${userId}:${key}`, value);
    }
  }
}

export async function getLocalMigrationState(userId: string): Promise<LocalMigrationState | null> {
  const db = await initDB();
  return await readSetting<LocalMigrationState>(db, `${RUN_KEY_PREFIX}${userId}`) ?? null;
}

export async function getMigrationPreview(userId: string): Promise<MigrationPreview> {
  const db = await initDB();
  const [entries, customers, expenses, payments, settings, pendingUser, ownerUserId, state] = await Promise.all([
    readAll<RawRecord>(db, 'entries'),
    readAll<RawRecord>(db, 'customers'),
    readAll<RawRecord>(db, 'expenses'),
    readAll<RawRecord>(db, 'payments'),
    readAll<RawSetting>(db, 'settings'),
    readSetting<string>(db, PENDING_USER_KEY),
    readSetting<string>(db, OWNER_KEY),
    getLocalMigrationState(userId),
  ]);
  const counts = {
    entries: entries.filter(isUnowned).length,
    customers: customers.filter(isUnowned).length,
    expenses: expenses.filter(isUnowned).length,
    payments: payments.filter(isUnowned).length,
    settings: settings.filter((record) => !isSystemSetting(record) && isUnowned(record)).length,
  };
  const deletedCounts = {
    entries: entries.filter((record) => isUnowned(record) && record.isDeleted === true).length,
    customers: customers.filter((record) => isUnowned(record) && record.isDeleted === true).length,
    expenses: expenses.filter((record) => isUnowned(record) && record.isDeleted === true).length,
    payments: payments.filter((record) => isUnowned(record) && record.isDeleted === true).length,
  };
  const browserSettings = getLegacyBrowserSettings(ownerUserId, userId);
  counts.settings += browserSettings.length;
  const hasLegacyData = Object.values(counts).some((count) => count > 0);
  return {
    counts,
    deletedCounts,
    hasLegacyData,
    pendingForAnotherUser: typeof pendingUser === 'string' && pendingUser !== userId,
    alreadyVerified: state?.status === 'verified' && state.ownerUserId === userId,
  };
}

export async function completeEmptyMigration(userId: string): Promise<void> {
  const db = await initDB();
  await getInstallationId(db);
  const transaction = db.transaction('settings', 'readwrite');
  const complete = transactionResult(transaction);
  const store = transaction.objectStore('settings');
  store.put({
    key: `${RUN_KEY_PREFIX}${userId}`,
    value: { status: 'verified', ownerUserId: userId } satisfies LocalMigrationState,
  });
  store.delete(PENDING_USER_KEY);
  await complete;
}

export async function migrateLegacyData(
  userId: string,
  confirmedOwnership: boolean,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<void> {
  const db = await initDB();
  const [pendingUser, ownerUserId, state] = await Promise.all([
    readSetting<string>(db, PENDING_USER_KEY),
    readSetting<string>(db, OWNER_KEY),
    getLocalMigrationState(userId),
  ]);
  if (state?.status === 'verified' && state.ownerUserId === userId) return;
  if (pendingUser && pendingUser !== userId) {
    throw new Error('A previous migration is pending for a different account. Sign in to that account to resume it.');
  }
  if (!confirmedOwnership && pendingUser !== userId) {
    throw new Error('Confirm that the local data belongs to this account before uploading it.');
  }

  const installationId = await getInstallationId(db);
  const [entries, customers, expenses, payments, allSettings] = await Promise.all([
    readAll<RawRecord>(db, 'entries'),
    readAll<RawRecord>(db, 'customers'),
    readAll<RawRecord>(db, 'expenses'),
    readAll<RawRecord>(db, 'payments'),
    readAll<RawSetting>(db, 'settings'),
  ]);
  const stores: Record<StoreName, RawRecord[]> = { entries, customers, expenses, payments };

  const browserSettings = getLegacyBrowserSettings(ownerUserId, userId);
  for (const [store, records] of Object.entries(stores) as Array<[StoreName, RawRecord[]]>) {
    if (records.some((record) => typeof record.ownerUserId === 'string' && record.ownerUserId !== userId)) {
      throw new Error(`Local ${store} data is already linked to a different account and was not migrated.`);
    }
  }
  const settings = [
    ...allSettings.filter((record) =>
    !isSystemSetting(record)
    && (isUnowned(record) || isOwnedBy(record, userId)),
    ),
    ...browserSettings,
  ];
  if (settings.some((record) => typeof record.ownerUserId === 'string' && record.ownerUserId !== userId)) {
    throw new Error('Local settings are already linked to a different account and were not migrated.');
  }

  const dataCounts = Object.fromEntries(
    Object.entries(stores).map(([store, records]) => [store, records.length]),
  );
  const counts = { ...dataCounts, settings: settings.length };
  const initialTransaction = db.transaction('settings', 'readwrite');
  const initialComplete = transactionResult(initialTransaction);
  initialTransaction.objectStore('settings').put({ key: PENDING_USER_KEY, value: userId });
  initialTransaction.objectStore('settings').put({
    key: `${RUN_KEY_PREFIX}${userId}`,
    value: { status: 'running', ownerUserId: userId } satisfies LocalMigrationState,
  });
  await initialComplete;

  try {
    onProgress?.({ stage: 'preparing', store: 'all', completed: 0, total: Object.values(counts).reduce((sum, count) => sum + count, 0) });
    await saveStableIds(db, installationId, stores);

    await updateMigrationRun(userId, installationId, 'running', counts);
    const journalRows = entries.map((record) => mapJournalEntry(record, userId, installationId));
    const customerRows = customers.map((record) => mapCustomer(record, userId, installationId));
    const expenseRows = expenses.map((record) => mapAmount(record, 'expenses', userId, installationId));
    const paymentRows = payments.map((record) => mapAmount(record, 'payments', userId, installationId));

    await assertMigrationRowsCompatible('entries', userId, installationId, journalRows);
    await assertMigrationRowsCompatible('customers', userId, installationId, customerRows);
    await assertMigrationRowsCompatible('expenses', userId, installationId, expenseRows);
    await assertMigrationRowsCompatible('payments', userId, installationId, paymentRows);

    await pushBatches(entries.length, 'entries', journalRows, uploadJournal, onProgress);
    await pushBatches(customers.length, 'customers', customerRows, uploadCustomers, onProgress);
    await pushBatches(expenses.length, 'expenses', expenseRows, uploadExpenses, onProgress);
    await pushBatches(payments.length, 'payments', paymentRows, uploadPayments, onProgress);

    const settingRows = settings.map((record) => ({
      user_id: userId,
      key: record.key,
      source_installation_id: installationId,
      value: settingValue(record),
    }));
    await pushBatches(settings.length, 'settings', settingRows, async (batch) => {
      const { error } = await getSupabaseClient()
        .from('user_settings')
        .upsert(batch, { onConflict: 'user_id,key,source_installation_id' });
      if (error) throw error;
    }, onProgress);

    const counter = settings.find((record) => record.key === 'invoiceCounter');
    if (counter) {
      const invoiceDate = counterDate(counter.date);
      const sequence = numeric(counter.sequence, 'invoiceCounter.sequence');
      if (sequence > 0) {
        const supabase = getSupabaseClient();
        const { data: existing, error: existingError } = await supabase
          .from('invoice_counters')
          .select('sequence')
          .eq('user_id', userId)
          .eq('invoice_date', invoiceDate)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing || existing.sequence < sequence) {
          const { error } = await supabase.from('invoice_counters').upsert({
            user_id: userId,
            invoice_date: invoiceDate,
            sequence,
          }, { onConflict: 'user_id,invoice_date' });
          if (error) throw error;
        }
      }
    }

    onProgress?.({ stage: 'verifying', store: 'all', completed: 0, total: Object.values(counts).reduce((sum, count) => sum + count, 0) });
    const referencesByStore: Record<StoreName, RemoteRowRef[]> = {
      entries: await verifyStore('entries', userId, installationId, entries.length),
      customers: await verifyStore('customers', userId, installationId, customers.length),
      expenses: await verifyStore('expenses', userId, installationId, expenses.length),
      payments: await verifyStore('payments', userId, installationId, payments.length),
    };
    if (settings.length > 0) {
      const { data: remoteSettings, error } = await getSupabaseClient()
        .from('user_settings')
        .select('key')
        .eq('user_id', userId)
        .eq('source_installation_id', installationId);
      if (error) throw error;
      if (remoteSettings.length !== settings.length) {
        throw new Error(`Settings verification failed: expected ${settings.length}, found ${remoteSettings.length}.`);
      }
    }

    await updateMigrationRun(userId, installationId, 'verified', counts);
    await finalizeLocalMigration(db, userId, installationId, stores, referencesByStore, settings);
    onProgress?.({ stage: 'complete', store: 'all', completed: 1, total: 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed for an unknown reason.';
    try {
      await updateMigrationRun(userId, installationId, 'failed', counts, message);
      await writeSettings(db, [{
        key: `${RUN_KEY_PREFIX}${userId}`,
        value: { status: 'failed', ownerUserId: userId, error: message } satisfies LocalMigrationState,
      }]);
    } catch (statusError) {
      const statusMessage = statusError instanceof Error ? statusError.message : 'Could not save migration status.';
      throw new Error(`${message} Migration status could not be saved: ${statusMessage}`);
    }
    throw error;
  }
}

