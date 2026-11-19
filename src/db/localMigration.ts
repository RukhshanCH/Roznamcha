import type { Json } from '@/types/database.types';
import type { SyncOutboxRecord } from '@/types';
import { getSupabaseClient } from '@/lib/supabase';
import { DATABASE_VERSION, initDB, SYNC_OUTBOX_STORE_NAME } from '@/db/indexedDB';
import { CLOUD_SETTINGS_INSTALLATION_ID, getScopedSettingKey } from '@/db/syncContext';

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

export type MigrationStoreName = 'entries' | 'customers' | 'expenses' | 'payments';
type StoreName = MigrationStoreName;
type RawRecord = Record<string, unknown> & { id?: number };
type RawSetting = Record<string, unknown> & { key: string };
type NormalizedMigrationDates = Record<StoreName, Map<number, string>>;
type LocalMigrationSnapshot = {
  stores: Record<StoreName, RawRecord[]>;
  settings: RawSetting[];
  outbox: SyncOutboxRecord[];
  browserSettings: BrowserSettingsSnapshot;
};
type BrowserSettingsSnapshot = {
  eligible: boolean;
  available: boolean;
  values: Partial<Record<(typeof BACKUP_STORAGE_KEYS)[number], string | null>>;
};
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

export interface MigrationDateIssue {
  store: MigrationStoreName;
  localId: number | null;
  value: string;
  name: string | null;
  serialNo: number | null;
}

interface LocalMigrationState {
  status: MigrationStatus;
  ownerUserId?: string;
  error?: string;
}

type RemoteRowRef = { id: string; local_id: number; sync_version: number };
type MigrationSettingResolution = {
  choice: 'local' | 'cloud';
  cloudVersion: number | null;
  cloudValue: Json | null;
};
type MigratedSetting = {
  value: Json;
  syncVersion: number;
  updatedAt: string;
};

export class MigrationSettingConflictError extends Error {
  readonly settingKey: string;
  readonly localValue: Json;
  readonly cloudValue: Json | null;
  readonly cloudVersion: number | null;

  constructor(
    settingKey: string,
    localValue: Json,
    cloudValue: Json | null,
    cloudVersion: number | null,
  ) {
    super(`The local and cloud values for "${settingKey}" differ. Choose which value to keep.`);
    this.name = 'MigrationSettingConflictError';
    this.settingKey = settingKey;
    this.localValue = localValue;
    this.cloudValue = cloudValue;
    this.cloudVersion = cloudVersion;
  }
}

export class MigrationDateValidationError extends Error {
  readonly issues: MigrationDateIssue[];

  constructor(issues: MigrationDateIssue[]) {
    super(
      `Local data was not fully migrated. Cannot migrate records with invalid dates: ${issues.map((issue) =>
        `${issue.store} record ${issue.localId ?? '<unknown>'} has date ${issue.value}`,
      ).join('; ')}. Correct the listed dates to valid, unambiguous calendar dates and retry. Local records were not modified.`,
    );
    this.name = 'MigrationDateValidationError';
    this.issues = issues;
  }
}

function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function parseVerifiedRecordRefs(value: Json): Record<StoreName, RemoteRowRef[]> {
  if (!Array.isArray(value)) {
    throw new Error('The server returned invalid verified record versions.');
  }
  const result: Record<StoreName, RemoteRowRef[]> = {
    entries: [],
    customers: [],
    expenses: [],
    payments: [],
  };
  for (const item of value) {
    if (item === null || Array.isArray(item) || typeof item !== 'object') {
      throw new Error('The server returned an invalid verified record reference.');
    }
    const row = item as { [key: string]: Json | undefined };
    const store = row.store;
    const id = row.id;
    const localId = row.local_id;
    const syncVersion = row.sync_version;
    if ((store !== 'entries' && store !== 'customers' && store !== 'expenses' && store !== 'payments')
      || typeof id !== 'string'
      || typeof localId !== 'number' || !Number.isSafeInteger(localId)
      || typeof syncVersion !== 'number' || !Number.isSafeInteger(syncVersion)) {
      throw new Error('The server returned an invalid verified record reference.');
    }
    result[store].push({ id, local_id: localId, sync_version: syncVersion });
  }
  return result;
}

function recordsWithVersions(
  rows: Array<Record<string, unknown>>,
  references: RemoteRowRef[],
  uploadedVersions: Map<number, number>,
): Array<Record<string, unknown>> {
  const byLocalId = new Map(references.map((reference) => [reference.local_id, reference]));
  return rows.map((row) => {
    const reference = byLocalId.get(Number(row.local_id));
    if (!reference) {
      throw new Error(`Could not verify local record ${row.local_id}: cloud row is missing.`);
    }
    const uploadedVersion = uploadedVersions.get(Number(row.local_id));
    if (uploadedVersion === undefined) {
      throw new Error(`Could not preserve uploaded sync version for local record ${row.local_id}.`);
    }
    return { ...row, id: reference.id, sync_version: uploadedVersion };
  });
}

function assertVerifiedRecordSets(
  stores: Record<StoreName, RawRecord[]>,
  references: Record<StoreName, RemoteRowRef[]>,
): void {
  for (const store of Object.keys(stores) as StoreName[]) {
    const expectedLocalIds = new Set(stores[store].map((record) =>
      Number(typeof record.sourceLocalId === 'number' ? record.sourceLocalId : record.id),
    ));
    const actualLocalIds = references[store].map((reference) => reference.local_id);
    if (actualLocalIds.length !== expectedLocalIds.size
      || new Set(actualLocalIds).size !== actualLocalIds.length
      || actualLocalIds.some((localId) => !expectedLocalIds.has(localId))) {
      throw new Error(`The server returned an incomplete verified ${store} record set.`);
    }
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function getAll<T>(store: IDBObjectStore): Promise<T[]> {
  return requestResult(store.getAll() as IDBRequest<T[]>);
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function isSerializationOrDeadlockError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === 'string' ? record.code : '';
  return code === '40001' || code === '40P01';
}

type MigrationRpcName =
  | 'migrate_user_record'
  | 'migrate_user_setting'
  | 'migrate_invoice_counter'
  | 'verify_user_migration';

export async function rpcMigrationRetry<T>(
  name: MigrationRpcName,
  args: Record<string, Json>,
): Promise<{ data: T | null; error: unknown | null }> {
  // These RPCs are idempotent or accept a migration identity. Never retry network,
  // validation, ownership, or arbitrary application errors.
  const delays = [100, 300, 900];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const response = await getSupabaseClient().rpc(name, args as never) as unknown as {
      data: T | null;
      error: unknown | null;
    };
    if (!response.error) return response;
    if (!isSerializationOrDeadlockError(response.error) || attempt === delays.length) return response;
    await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
  }
  throw new Error('Unreachable migration RPC retry state.');
}

async function readAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).getAll());
}

async function readMigrationSnapshot(
  db: IDBDatabase,
  browserSettings: BrowserSettingsSnapshot,
): Promise<LocalMigrationSnapshot> {
  const storeNames: StoreName[] = ['entries', 'customers', 'expenses', 'payments'];
  const transaction = db.transaction(
    [...storeNames, 'settings', SYNC_OUTBOX_STORE_NAME],
    'readonly',
  );
  const complete = transactionResult(transaction);
  const [entries, customers, expenses, payments, settings, outbox] = await Promise.all([
    getAll<RawRecord>(transaction.objectStore('entries')),
    getAll<RawRecord>(transaction.objectStore('customers')),
    getAll<RawRecord>(transaction.objectStore('expenses')),
    getAll<RawRecord>(transaction.objectStore('payments')),
    getAll<RawSetting>(transaction.objectStore('settings')),
    getAll<SyncOutboxRecord>(transaction.objectStore(SYNC_OUTBOX_STORE_NAME)),
  ]);
  await complete;
  return {
    stores: { entries, customers, expenses, payments },
    settings,
    outbox,
    browserSettings,
  };
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

function canonicalSnapshot(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Array.isArray(value)) return `[${value.map(canonicalSnapshot).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalSnapshot((value as Record<string, unknown>)[key])}`,
    ).join(',')}}`;
  }
  return `${typeof value}:${JSON.stringify(value)}`;
}

function sameRows<T>(left: T[], right: T[], keyOf: (row: T) => string): boolean {
  if (left.length !== right.length) return false;
  const rightByKey = new Map(right.map((row) => [keyOf(row), row]));
  return left.every((row) => {
    const current = rightByKey.get(keyOf(row));
    return current !== undefined && canonicalSnapshot(current) === canonicalSnapshot(row);
  });
}

function sameStores(
  expected: Record<StoreName, RawRecord[]>,
  current: Record<StoreName, RawRecord[]>,
): boolean {
  return (Object.keys(expected) as StoreName[]).every((store) =>
    sameRows(expected[store], current[store], (record) => String(record.id)),
  );
}

function sameUserSettings(expected: RawSetting[], current: RawSetting[]): boolean {
  return sameRows(
    expected.filter((record) => !isSystemSetting(record)),
    current.filter((record) => !isSystemSetting(record)),
    (record) => record.key,
  );
}

function isValidLegacyBrowserTimestamp(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp >= 0;
}

function captureBrowserSettings(ownerUserId: string | undefined, userId: string): BrowserSettingsSnapshot {
  if (ownerUserId && ownerUserId !== userId) {
    return {
      eligible: false,
      available: true,
      values: {},
    };
  }
  if (typeof localStorage === 'undefined') {
    return {
      eligible: true,
      available: false,
      values: {},
    };
  }
  try {
    const values: BrowserSettingsSnapshot['values'] = {};
    for (const key of BACKUP_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null && !isValidLegacyBrowserTimestamp(value)) {
        throw new Error(`Browser setting "${key}" contains a malformed timestamp value.`);
      }
      values[key] = value;
    }
    return { eligible: true, available: true, values };
  } catch (error) {
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      throw new Error(`Browser localStorage is unavailable: ${error.message}`);
    }
    throw error;
  }
}

function assertBrowserSnapshot(snapshot: BrowserSettingsSnapshot): void {
  // Browser storage and IndexedDB cannot participate in one atomic transaction.
  // Recheck browser values before stable-ID/final writes and once more after finalization.
  if (!snapshot.eligible) return;
  if (!snapshot.available) {
    throw new Error('Browser localStorage was unavailable during migration preparation.');
  }
  if (typeof localStorage === 'undefined') {
    throw new Error('Browser localStorage became unavailable during migration.');
  }
  try {
    for (const key of BACKUP_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null && !isValidLegacyBrowserTimestamp(value)) {
        throw new Error(`Browser setting "${key}" became malformed during migration.`);
      }
      if (snapshot.values[key] !== value) {
        throw new Error(`Browser setting "${key}" changed during migration. The newer local value was preserved.`);
      }
    }
  } catch (error) {
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      throw new Error(`Browser localStorage became unavailable during migration: ${error.message}`);
    }
    throw error;
  }
}

function getLegacyBrowserSettings(
  ownerUserId: string | undefined,
  userId: string,
  snapshot?: BrowserSettingsSnapshot,
): RawSetting[] {
  const browserSnapshot = snapshot ?? captureBrowserSettings(ownerUserId, userId);
  if (!browserSnapshot.eligible || !browserSnapshot.available) {
    if (browserSnapshot.eligible && !browserSnapshot.available) {
      throw new Error('Browser localStorage is unavailable. Migration cannot safely snapshot browser settings.');
    }
    return [];
  }
  return BACKUP_STORAGE_KEYS.flatMap((key) => {
    const value = browserSnapshot.values[key];
    return value === null || value === undefined ? [] : [{ key: `localStorage:${key}`, value }];
  });
}

async function compensateBrowserMismatch(
  db: IDBDatabase,
  userId: string,
  stores: Record<StoreName, RawRecord[]>,
): Promise<void> {
  const transaction = db.transaction(
    ['entries', 'customers', 'expenses', 'payments', 'settings', SYNC_OUTBOX_STORE_NAME],
    'readwrite',
  );
  const complete = transactionResult(transaction);
  for (const store of ['entries', 'customers', 'expenses', 'payments'] as StoreName[]) {
    const objectStore = transaction.objectStore(store);
    for (const record of stores[store]) {
      const localId = validId(record, store);
      const currentRequest = objectStore.get(localId);
      currentRequest.onsuccess = () => {
        const current = currentRequest.result as RawRecord | undefined;
        if (!current) return;
        objectStore.put({
          ...current,
          ownerUserId: userId,
          cloudId: typeof record.cloudId === 'string'
            ? record.cloudId
            : typeof current.cloudId === 'string'
              ? current.cloudId
              : undefined,
          sourceInstallationId: typeof record.sourceInstallationId === 'string'
            ? record.sourceInstallationId
            : current.sourceInstallationId,
          sourceLocalId: typeof record.sourceLocalId === 'number'
            ? record.sourceLocalId
            : localId,
          syncStatus: 'pending',
        });
        transaction.objectStore(SYNC_OUTBOX_STORE_NAME).put({
          key: `${userId}:${store}:${localId}`,
          mutationId: crypto.randomUUID(),
          userId,
          store,
          localId,
          operation: 'upsert',
          cloudId: typeof record.cloudId === 'string'
            ? record.cloudId
            : typeof current.cloudId === 'string'
              ? current.cloudId
              : undefined,
          cloudVersion: typeof current.cloudVersion === 'number' ? current.cloudVersion : undefined,
          createdAt: Date.now(),
          attempts: 0,
        } satisfies SyncOutboxRecord);
      };
    }
  }
  const settingsStore = transaction.objectStore('settings');
  settingsStore.put({
    key: `${RUN_KEY_PREFIX}${userId}`,
    value: { status: 'failed', ownerUserId: userId, error: 'Browser setting changed during migration finalization.' } satisfies LocalMigrationState,
  });
  await complete;
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

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysPerMonth[month - 1];
}

function normalizeDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (isValidCalendarDate(normalized)) return normalized;

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(normalized);
  if (compact) {
    const date = `${compact[1]}-${compact[2]}-${compact[3]}`;
    return isValidCalendarDate(date) ? date : null;
  }

  const timestamp = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(normalized);
  if (timestamp
    && isValidCalendarDate(timestamp[1])
    && Number.isFinite(Date.parse(normalized))) {
    return timestamp[1];
  }

  const separated = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/.exec(normalized);
  if (separated) {
    const first = Number(separated[1]);
    const second = Number(separated[3]);
    const year = separated[4];
    let month: number;
    let day: number;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      month = first;
      day = second;
    } else {
      return null;
    }
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return isValidCalendarDate(date) ? date : null;
  }

  return null;
}

function describeDateValue(value: unknown): string {
  if (value === undefined) return '<missing>';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    const displayed = value.length > 80 ? `${value.slice(0, 77)}...` : value;
    return JSON.stringify(displayed);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (typeof value === 'object') return Object.prototype.toString.call(value);
  return String(value);
}

function assertMigrationDates(stores: Record<StoreName, RawRecord[]>): void {
  const issues: MigrationDateIssue[] = [];
  for (const store of ['entries', 'customers', 'expenses', 'payments'] as const) {
    for (const record of stores[store]) {
      if (normalizeDateOnly(record.date) === null) {
        issues.push({
          store,
          localId: typeof record.id === 'number' && Number.isSafeInteger(record.id) ? record.id : null,
          value: describeDateValue(record.date),
          name: typeof record.name === 'string' ? record.name : null,
          serialNo: typeof record.serialNo === 'number' ? record.serialNo : null,
        });
      }
    }
  }
  if (issues.length > 0) throw new MigrationDateValidationError(issues);
}

function dateOnly(value: unknown, field: string, localId?: number): string {
  const normalized = normalizeDateOnly(value);
  if (normalized === null) {
    const record = localId === undefined ? field : `${field} record ${localId}`;
    throw new Error(
      `Cannot migrate ${record} with an invalid date (${describeDateValue(value)}).`,
    );
  }
  return normalized;
}

export async function repairMigrationRecordDate(
  userId: string,
  store: MigrationStoreName,
  localId: number,
  date: string,
): Promise<void> {
  const normalizedDate = normalizeDateOnly(date);
  if (normalizedDate === null || normalizedDate !== date) {
    throw new Error('Enter a valid date in YYYY-MM-DD format.');
  }
  if (!Number.isSafeInteger(localId)) {
    throw new Error(`Cannot repair ${store} without a valid local record ID.`);
  }

  const db = await initDB();
  const transaction = db.transaction(store, 'readwrite');
  const complete = transactionResult(transaction);
  const records = transaction.objectStore(store);
  const request = records.get(localId);
  let validationError: Error | null = null;
  request.onsuccess = () => {
    const record = request.result as RawRecord | undefined;
    if (!record) {
      validationError = new Error(`Local ${store} record ${localId} no longer exists.`);
      transaction.abort();
      return;
    }
    if (typeof record.ownerUserId === 'string' && record.ownerUserId !== userId) {
      validationError = new Error(`Local ${store} record ${localId} belongs to a different account.`);
      transaction.abort();
      return;
    }
    if (normalizeDateOnly(record.date) !== null) {
      validationError = new Error(`Local ${store} record ${localId} changed. Review it again before correcting its date.`);
      transaction.abort();
      return;
    }
    records.put({ ...record, date: normalizedDate });
  };
  try {
    await complete;
  } catch (error) {
    if (validationError) throw validationError;
    throw error;
  }
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
    date: dateOnly(record.date, store, localId),
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

function getNormalizedDates(rows: Array<Record<string, unknown>>): Map<number, string> {
  return new Map(rows.map((row) => [Number(row.local_id), String(row.date)] as const));
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

async function uploadMigratedRecords(
  store: StoreName,
  rows: Array<Record<string, unknown>>,
  uploadedVersions: Record<StoreName, Map<number, number>>,
): Promise<void> {
  await Promise.all(rows.map(async (row) => {
    const { data, error } = await rpcMigrationRetry<Array<{
      applied: boolean;
      row_id: string | null;
      sync_version: number | null;
    }>>('migrate_user_record', {
      p_store: store,
      p_payload: row as Json,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error(`The server did not verify ${store} record ${row.local_id}.`);
    if (!result.applied) {
      throw new Error(
        `Migration conflict in ${store} local record ${row.local_id}: cloud data changed or differs. Local data was preserved.`,
      );
    }
    if (typeof result.sync_version !== 'number' || !Number.isSafeInteger(result.sync_version)) {
      throw new Error(`The server did not return a valid sync version for ${store} record ${row.local_id}.`);
    }
    uploadedVersions[store].set(Number(row.local_id), result.sync_version);
  }));
}

async function verifyStore(
  table: StoreName,
  userId: string,
  installationId: string,
  expectedRows: Array<Record<string, unknown>>,
): Promise<RemoteRowRef[]> {
  const supabase = getSupabaseClient();
  const result: Array<Record<string, unknown>> = [];
  const pageSize = 500;
  if (table === 'entries') {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .order('local_id')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      result.push(...data);
      if (data.length < pageSize) break;
    }
  } else if (table === 'customers') {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('customers')
        .select('*')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .order('local_id')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      result.push(...data);
      if (data.length < pageSize) break;
    }
  } else if (table === 'expenses') {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('expenses')
        .select('*')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .order('local_id')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      result.push(...data);
      if (data.length < pageSize) break;
    }
  } else {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('payments')
        .select('*')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .order('local_id')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      result.push(...data);
      if (data.length < pageSize) break;
    }
  }
  if (result.length !== expectedRows.length) {
    throw new Error(`${table} verification failed: expected ${expectedRows.length}, found ${result.length}.`);
  }
  const remoteByLocalId = new Map(result.map((row) => [Number(row.local_id), row]));
  const references: RemoteRowRef[] = [];
  for (const expected of expectedRows) {
    const remote = remoteByLocalId.get(Number(expected.local_id));
    if (!remote) {
      throw new Error(`${table} verification failed: local record ${expected.local_id} is missing.`);
    }
    const mismatchedField = Object.entries(expected).find(([key, value]) => {
      if (key === 'id' || key === 'sync_version' || key === 'updated_at') return false;
      return normalizedField(remote[key], key) !== normalizedField(value, key);
    })?.[0];
    if (mismatchedField) {
      throw new Error(
        `${table} verification failed for local record ${expected.local_id}: cloud field "${mismatchedField}" differs.`,
      );
    }
    references.push({
      id: String(remote.id),
      local_id: Number(remote.local_id),
      sync_version: Number(remote.sync_version),
    });
  }
  return references;
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
): Promise<Map<number, number>> {
  const existingRows = await getExistingInstallationRows(store, userId, installationId);
  const existingByLocalId = new Map(
    existingRows.map((row) => [Number(row.local_id), row]),
  );
  const existingVersions = new Map<number, number>();
  for (const expected of expectedRows) {
    const existing = existingByLocalId.get(Number(expected.local_id));
    if (!existing) continue;
    const mismatchedField = Object.entries(expected).find(([key, value]) => {
      if (key === 'id' || key === 'sync_version' || key === 'updated_at') return false;
      return normalizedField(existing[key], key) !== normalizedField(value, key);
    })?.[0];
    if (mismatchedField) {
      throw new Error(
        `Migration conflict in ${store} local record ${expected.local_id}: cloud field "${mismatchedField}" differs. Local data was preserved and not uploaded over the cloud record.`,
      );
    }
    const syncVersion = Number(existing.sync_version);
    if (!Number.isSafeInteger(syncVersion) || syncVersion < 1) {
      throw new Error(`The server returned an invalid sync version for ${store} record ${expected.local_id}.`);
    }
    existingVersions.set(Number(expected.local_id), syncVersion);
  }
  return existingVersions;
}

async function saveStableIds(
  db: IDBDatabase,
  installationId: string,
  snapshot: LocalMigrationSnapshot,
): Promise<Record<StoreName, RawRecord[]>> {
  assertBrowserSnapshot(snapshot.browserSettings);
  const storeNames = ['entries', 'customers', 'expenses', 'payments'] as const;
  const transaction = db.transaction(
    [...storeNames, 'settings', SYNC_OUTBOX_STORE_NAME],
    'readwrite',
  );
  const complete = transactionResult(transaction);
  const [entries, customers, expenses, payments, settings, outbox] = await Promise.all([
    getAll<RawRecord>(transaction.objectStore('entries')),
    getAll<RawRecord>(transaction.objectStore('customers')),
    getAll<RawRecord>(transaction.objectStore('expenses')),
    getAll<RawRecord>(transaction.objectStore('payments')),
    getAll<RawSetting>(transaction.objectStore('settings')),
    getAll<SyncOutboxRecord>(transaction.objectStore(SYNC_OUTBOX_STORE_NAME)),
  ]);
  const currentStores = { entries, customers, expenses, payments };
  if (!sameStores(snapshot.stores, currentStores)
    || !sameUserSettings(snapshot.settings, settings)
    || !sameRows(snapshot.outbox, outbox, (record) => record.key)) {
    await complete;
    throw new Error('Local data changed during migration preparation. No local changes were overwritten; retry migration.');
  }

  const stableStores: Record<StoreName, RawRecord[]> = {
    entries: [],
    customers: [],
    expenses: [],
    payments: [],
  };
  for (const store of storeNames) {
    const records = currentStores[store];
    const objectStore = transaction.objectStore(store);
    for (const record of records) {
      const stableRecord: RawRecord = {
        ...record,
        cloudId: typeof record.cloudId === 'string' ? record.cloudId : crypto.randomUUID(),
        sourceInstallationId: typeof record.sourceInstallationId === 'string'
          ? record.sourceInstallationId
          : installationId,
        sourceLocalId: typeof record.sourceLocalId === 'number'
          ? record.sourceLocalId
          : validId(record, store),
      };
      if (store === 'entries' && !stableRecord.debtId) {
        stableRecord.debtId = crypto.randomUUID();
      }
      objectStore.put(stableRecord);
      stableStores[store].push(stableRecord);
    }
  }
  await complete;
  return stableStores;
}

async function finalizeLocalMigration(
  db: IDBDatabase,
  userId: string,
  installationId: string,
  snapshot: LocalMigrationSnapshot,
  stores: Record<StoreName, RawRecord[]>,
  references: Record<StoreName, RemoteRowRef[]>,
  normalizedDates: NormalizedMigrationDates,
  settings: RawSetting[],
  migratedSettings: Map<string, MigratedSetting>,
  beforeBrowserPostCommitCheck?: () => void | Promise<void>,
): Promise<void> {
  assertBrowserSnapshot(snapshot.browserSettings);
  const storeNames: StoreName[] = ['entries', 'customers', 'expenses', 'payments'];
  const transaction = db.transaction(
    [...storeNames, 'settings', SYNC_OUTBOX_STORE_NAME],
    'readwrite',
  );
  const complete = transactionResult(transaction);
  const [entries, customers, expenses, payments, currentSettings, currentOutbox] = await Promise.all([
    getAll<RawRecord>(transaction.objectStore('entries')),
    getAll<RawRecord>(transaction.objectStore('customers')),
    getAll<RawRecord>(transaction.objectStore('expenses')),
    getAll<RawRecord>(transaction.objectStore('payments')),
    getAll<RawSetting>(transaction.objectStore('settings')),
    getAll<SyncOutboxRecord>(transaction.objectStore(SYNC_OUTBOX_STORE_NAME)),
  ]);
  const currentStores = { entries, customers, expenses, payments };
  if (!sameStores(stores, currentStores)
    || !sameUserSettings(snapshot.settings, currentSettings)
    || !sameRows(snapshot.outbox, currentOutbox, (record) => record.key)) {
    await complete;
    throw new Error('Local data changed during migration. No local changes were overwritten; retry migration.');
  }

  for (const store of storeNames) {
    const byLocalId = new Map(references[store].map((row) => [row.local_id, row]));
    const objectStore = transaction.objectStore(store);
    for (const record of currentStores[store]) {
      const localId = validId(record, store);
      const sourceLocalId = typeof record.sourceLocalId === 'number' ? record.sourceLocalId : localId;
      const remote = byLocalId.get(sourceLocalId);
      if (!remote) throw new Error(`Could not finalize ${store} record ${localId}: cloud row is missing.`);
      const normalizedDate = normalizedDates[store].get(sourceLocalId);
      if (!normalizedDate) {
        throw new Error(`Could not finalize ${store} record ${localId}: migrated date is missing.`);
      }
      objectStore.put({
        ...record,
        date: normalizedDate,
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
    const migrated = migratedSettings.get(setting.key);
    if (migrated) {
      settingsStore.put({
        key: getScopedSettingKey(userId, setting.key),
        userSettingKey: setting.key,
        value: migrated.value,
        ownerUserId: userId,
        sourceInstallationId: CLOUD_SETTINGS_INSTALLATION_ID,
        cloudVersion: migrated.syncVersion,
        updatedAt: new Date(migrated.updatedAt).getTime(),
        syncStatus: 'synced',
      });
    }
  }

  settingsStore.put({ key: OWNER_KEY, value: userId });
  settingsStore.put({
    key: `${RUN_KEY_PREFIX}${userId}`,
    value: { status: 'verified', ownerUserId: userId } satisfies LocalMigrationState,
  });
  settingsStore.delete(PENDING_USER_KEY);

  await complete;

  if (beforeBrowserPostCommitCheck) await beforeBrowserPostCommitCheck();
  try {
    assertBrowserSnapshot(snapshot.browserSettings);
  } catch (browserError) {
    await compensateBrowserMismatch(db, userId, stores);
    throw browserError;
  }
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
  const browserSettings = getLegacyBrowserSettings(
    ownerUserId,
    userId,
    captureBrowserSettings(ownerUserId, userId),
  );
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
  settingResolutions: Record<string, MigrationSettingResolution> = {},
  beforeStableIds?: () => void | Promise<void>,
  beforeBrowserPostCommitCheck?: () => void | Promise<void>,
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

  const browserSettings = captureBrowserSettings(ownerUserId, userId);
  const initialSnapshot = await readMigrationSnapshot(db, browserSettings);
  let stores = initialSnapshot.stores;
  assertMigrationDates(stores);
  const installationId = await getInstallationId(db);

  const browserSettingRecords = getLegacyBrowserSettings(ownerUserId, userId, browserSettings);
  for (const [store, records] of Object.entries(stores) as Array<[StoreName, RawRecord[]]>) {
    if (records.some((record) => typeof record.ownerUserId === 'string' && record.ownerUserId !== userId)) {
      throw new Error(`Local ${store} data is already linked to a different account and was not migrated.`);
    }
  }
  const settings = [
    ...initialSnapshot.settings.filter((record) =>
    !isSystemSetting(record)
    && (isUnowned(record) || isOwnedBy(record, userId)),
    ),
    ...browserSettingRecords,
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
    if (beforeStableIds) await beforeStableIds();
    stores = await saveStableIds(db, installationId, initialSnapshot);
    const snapshot: LocalMigrationSnapshot = { ...initialSnapshot, stores };

    await updateMigrationRun(userId, installationId, 'running', counts);
    const { entries, customers, expenses, payments } = stores;
    const journalRows = entries.map((record) => mapJournalEntry(record, userId, installationId));
    const customerRows = customers.map((record) => mapCustomer(record, userId, installationId));
    const expenseRows = expenses.map((record) => mapAmount(record, 'expenses', userId, installationId));
    const paymentRows = payments.map((record) => mapAmount(record, 'payments', userId, installationId));
    const normalizedDates: NormalizedMigrationDates = {
      entries: getNormalizedDates(journalRows),
      customers: getNormalizedDates(customerRows),
      expenses: getNormalizedDates(expenseRows),
      payments: getNormalizedDates(paymentRows),
    };
    const uploadedVersions: Record<StoreName, Map<number, number>> = {
      entries: new Map(),
      customers: new Map(),
      expenses: new Map(),
      payments: new Map(),
    };

    for (const store of ['entries', 'customers', 'expenses', 'payments'] as const) {
      const existingVersions = await assertMigrationRowsCompatible(
        store,
        userId,
        installationId,
        {
          entries: journalRows,
          customers: customerRows,
          expenses: expenseRows,
          payments: paymentRows,
        }[store],
      );
      for (const [localId, version] of existingVersions) {
        uploadedVersions[store].set(localId, version);
      }
    }

    const pendingRows = (store: StoreName, rows: Array<Record<string, unknown>>) =>
      rows.filter((row) => !uploadedVersions[store].has(Number(row.local_id)));
    const pendingEntries = pendingRows('entries', journalRows);
    const pendingCustomers = pendingRows('customers', customerRows);
    const pendingExpenses = pendingRows('expenses', expenseRows);
    const pendingPayments = pendingRows('payments', paymentRows);

    await pushBatches(pendingEntries.length, 'entries', pendingEntries, (batch) =>
      uploadMigratedRecords('entries', batch, uploadedVersions), onProgress);
    await pushBatches(pendingCustomers.length, 'customers', pendingCustomers, (batch) =>
      uploadMigratedRecords('customers', batch, uploadedVersions), onProgress);
    await pushBatches(pendingExpenses.length, 'expenses', pendingExpenses, (batch) =>
      uploadMigratedRecords('expenses', batch, uploadedVersions), onProgress);
    await pushBatches(pendingPayments.length, 'payments', pendingPayments, (batch) =>
      uploadMigratedRecords('payments', batch, uploadedVersions), onProgress);

    const migratedSettings = new Map<string, MigratedSetting>();
    await pushBatches(settings.length, 'settings', settings, async (batch) => {
      for (const record of batch) {
        const value = settingValue(record);
        const resolution = settingResolutions[record.key];
        const { data, error } = await rpcMigrationRetry<Array<{
          applied: boolean;
          value: Json | null;
          sync_version: number | null;
          updated_at: string | null;
          conflict: boolean;
        }>>('migrate_user_setting', {
          p_key: record.key,
          p_value: value,
          p_resolution: resolution?.choice ?? null,
          p_expected_version: resolution?.cloudVersion ?? null,
          p_expected_cloud_value: resolution?.cloudValue ?? null,
        });
        if (error) throw error;
        const result = data?.[0];
        if (!result) throw new Error(`The server did not verify setting "${record.key}".`);
        if (!result.applied || result.conflict
          || result.sync_version === null || result.updated_at === null) {
          throw new MigrationSettingConflictError(
            record.key,
            value,
            result.value,
            result.sync_version,
          );
        }
        const expectedValue = resolution?.choice === 'cloud'
          ? resolution.cloudValue
          : value;
        if (canonicalJson(result.value as Json) !== canonicalJson(expectedValue)) {
          throw new MigrationSettingConflictError(
            record.key,
            value,
            result.value,
            result.sync_version,
          );
        }
        migratedSettings.set(record.key, {
          value: expectedValue,
          syncVersion: result.sync_version,
          updatedAt: result.updated_at,
        });
      }
    }, onProgress);

    let migratedInvoiceCounter: { invoiceDate: string; sequence: number } | null = null;
    const counter = settings.find((record) => record.key === 'invoiceCounter');
    if (counter) {
      const invoiceDate = counterDate(counter.date);
      const sequence = numeric(counter.sequence, 'invoiceCounter.sequence');
      if (sequence > 0) {
        const { data, error } = await rpcMigrationRetry<number>('migrate_invoice_counter', {
          p_invoice_date: invoiceDate,
          p_sequence: sequence,
        });
        if (error) throw error;
        if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < sequence) {
          throw new Error('The server did not confirm a monotonic invoice counter migration.');
        }
        migratedInvoiceCounter = { invoiceDate, sequence: data };
      }
    }

    onProgress?.({ stage: 'verifying', store: 'all', completed: 0, total: Object.values(counts).reduce((sum, count) => sum + count, 0) });
    const referencesByStore: Record<StoreName, RemoteRowRef[]> = {
      entries: await verifyStore('entries', userId, installationId, journalRows),
      customers: await verifyStore('customers', userId, installationId, customerRows),
      expenses: await verifyStore('expenses', userId, installationId, expenseRows),
      payments: await verifyStore('payments', userId, installationId, paymentRows),
    };
    const recordsForAtomicVerification = {
      entries: recordsWithVersions(journalRows, referencesByStore.entries, uploadedVersions.entries),
      customers: recordsWithVersions(customerRows, referencesByStore.customers, uploadedVersions.customers),
      expenses: recordsWithVersions(expenseRows, referencesByStore.expenses, uploadedVersions.expenses),
      payments: recordsWithVersions(paymentRows, referencesByStore.payments, uploadedVersions.payments),
    };
    if (settings.length > 0) {
      const { data: remoteSettings, error } = await getSupabaseClient().from('user_settings')
        .select('key,value,sync_version,updated_at')
        .eq('user_id', userId)
        .eq('source_installation_id', CLOUD_SETTINGS_INSTALLATION_ID);
      if (error) throw error;
      const remoteByKey = new Map(remoteSettings.map((record) => [record.key, record]));
      for (const [key, expected] of migratedSettings) {
        const remote = remoteByKey.get(key);
        if (!remote || canonicalJson(remote.value) !== canonicalJson(expected.value)
          || remote.sync_version !== expected.syncVersion) {
          throw new Error(`Settings verification failed for "${key}": cloud value or version differs.`);
        }
      }
    }

    const { data: verificationResults, error: verificationError } = await rpcMigrationRetry<Array<{
      verified: boolean;
      record_versions: Json;
    }>>(
      'verify_user_migration',
      {
        p_installation_id: installationId,
        p_source_db_version: DATABASE_VERSION,
        p_store_counts: counts as Json,
        p_records: recordsForAtomicVerification as Json,
        p_settings: Array.from(migratedSettings, ([key, setting]) => ({
          key,
          value: setting.value,
          sync_version: setting.syncVersion,
        })) as Json,
        p_invoice_counter: migratedInvoiceCounter
          ? {
            invoice_date: migratedInvoiceCounter.invoiceDate,
            sequence: migratedInvoiceCounter.sequence,
          } as Json
          : {} as Json,
      },
    );
    if (verificationError) throw verificationError;
    const verification = verificationResults?.[0];
    if (!verification?.verified) {
      throw new Error('Atomic migration verification failed: cloud data changed or differs from local data.');
    }
    const verifiedReferences = parseVerifiedRecordRefs(verification.record_versions);
    assertVerifiedRecordSets(stores, verifiedReferences);

    await finalizeLocalMigration(
      db,
      userId,
      installationId,
      snapshot,
      stores,
      verifiedReferences,
      normalizedDates,
      settings,
      migratedSettings,
      beforeBrowserPostCommitCheck,
    );
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

