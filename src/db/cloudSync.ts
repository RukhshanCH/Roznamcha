import type {
  Database,
  Json,
} from '@/types/database.types';
import type {
  LocalDataStore,
  SyncOutboxRecord,
} from '@/types';
import {
  initDB,
  SYNC_OUTBOX_STORE_NAME,
  SYNC_TOMBSTONES_STORE_NAME,
} from '@/db/indexedDB';
import {
  CLOUD_SETTINGS_INSTALLATION_ID,
  getScopedSettingKey,
} from '@/db/syncContext';
import { getSupabaseClient } from '@/lib/supabase';

type CloudDataStore = LocalDataStore;
type CloudRow =
  | Database['public']['Tables']['journal_entries']['Row']
  | Database['public']['Tables']['customers']['Row']
  | Database['public']['Tables']['expenses']['Row']
  | Database['public']['Tables']['payments']['Row'];
type LocalRecord = Record<string, unknown> & {
  id: number;
  ownerUserId: string;
  cloudId: string;
  cloudVersion?: number;
  syncStatus?: 'pending' | 'synced' | 'conflict';
};
export type SyncConflict = {
  key: string;
  store: CloudDataStore | 'settings';
  localId?: number;
  cloudId?: string;
  remoteVersion?: number;
  settingKey?: string;
};

const DATA_STORES: CloudDataStore[] = ['entries', 'customers', 'expenses', 'payments'];
const PAGE_SIZE = 500;

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function mapLocalToCloud(
  store: CloudDataStore,
  record: LocalRecord,
  userId: string,
  installationId: string,
): Json {
  const identity = {
    id: record.cloudId,
    user_id: userId,
    installation_id: typeof record.sourceInstallationId === 'string'
      ? record.sourceInstallationId
      : installationId,
    local_id: typeof record.sourceLocalId === 'number' ? record.sourceLocalId : record.id,
    serial_no: Number(record.serialNo),
    name: String(record.name ?? ''),
    date: String(record.date),
    created_at: new Date(Number(record.createdAt)).toISOString(),
    is_deleted: record.isDeleted === true,
    deleted_at: typeof record.deletedAt === 'string' ? record.deletedAt : null,
  };

  if (store === 'entries') {
    return {
      ...identity,
      mobile_number: String(record.mobileNumber ?? ''),
      total: Number(record.total),
      advance: Number(record.advance),
      remaining: Number(record.remaining),
      remaining_plus: Number(record.remainingPlus),
      note: String(record.note ?? ''),
      payment_method: record.paymentMethod === 'online' ? 'online' : 'cash',
      debt_id: typeof record.debtId === 'string' ? record.debtId : null,
      is_backup: record.isBackup === true,
      backup_id: typeof record.backupId === 'string' ? record.backupId : null,
    };
  }
  if (store === 'customers') {
    return { ...identity, mobile_number: String(record.mobileNumber ?? '') };
  }
  return {
    ...identity,
    description: String(record.description ?? ''),
    amount: Number(record.amount),
  };
}

function mapCloudToLocal(
  store: CloudDataStore,
  row: CloudRow,
  userId: string,
): Record<string, unknown> {
  const local: Record<string, unknown> = {
    ownerUserId: userId,
    cloudId: row.id,
    cloudVersion: row.sync_version,
    syncStatus: 'synced',
    sourceInstallationId: row.installation_id,
    sourceLocalId: row.local_id,
    serialNo: row.serial_no,
    name: row.name,
    date: row.date,
    createdAt: new Date(row.created_at).getTime(),
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at ?? undefined,
  };

  if (store === 'entries' && 'remaining_plus' in row) {
    Object.assign(local, {
      mobileNumber: row.mobile_number,
      total: Number(row.total),
      advance: Number(row.advance),
      remaining: Number(row.remaining),
      remainingPlus: Number(row.remaining_plus),
      note: row.note,
      paymentMethod: row.payment_method,
      debtId: row.debt_id ?? '',
      isBackup: row.is_backup,
      backupId: row.backup_id ?? undefined,
    });
  } else if (store === 'customers' && 'mobile_number' in row) {
    Object.assign(local, { mobileNumber: row.mobile_number });
  } else if ('amount' in row) {
    Object.assign(local, {
      description: row.description,
      amount: Number(row.amount),
    });
  }
  return local;
}

async function getOutbox(userId: string): Promise<SyncOutboxRecord[]> {
  const db = await initDB();
  const transaction = db.transaction(SYNC_OUTBOX_STORE_NAME, 'readonly');
  const records = await requestValue<SyncOutboxRecord[]>(
    transaction.objectStore(SYNC_OUTBOX_STORE_NAME).getAll(),
  );
  return records.filter((record) => record.userId === userId);
}

async function getLocalRecord(store: CloudDataStore, localId: number): Promise<LocalRecord | undefined> {
  const db = await initDB();
  const transaction = db.transaction(store, 'readonly');
  return requestValue(transaction.objectStore(store).get(localId));
}

function jsonValue(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === 'object') {
    const result: { [key: string]: Json | undefined } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) result[key] = jsonValue(item);
    }
    return result;
  }
  throw new Error('A local setting cannot be represented as JSON.');
}

async function saveOutboxError(record: SyncOutboxRecord, message: string, remoteVersion?: number): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(SYNC_OUTBOX_STORE_NAME, 'readwrite');
  const complete = transactionDone(transaction);
  const store = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
  const current = await requestValue<SyncOutboxRecord | undefined>(store.get(record.key));
  if (current?.mutationId === record.mutationId) {
    store.put({
      ...current,
      attempts: current.attempts + 1,
      lastError: message,
      ...(remoteVersion === undefined ? {} : { cloudVersion: remoteVersion }),
    });
  }
  await complete;
}

async function pushSetting(record: SyncOutboxRecord, userId: string): Promise<void> {
  if (!record.settingKey) throw new Error('A setting outbox record is missing its key.');
  const db = await initDB();
  const readTransaction = db.transaction(['settings', SYNC_OUTBOX_STORE_NAME], 'readonly');
  const readSettings = readTransaction.objectStore('settings');
  const readOutbox = readTransaction.objectStore(SYNC_OUTBOX_STORE_NAME);
  const localKey = getScopedSettingKey(userId, record.settingKey);
  const [setting, currentOutbox] = await Promise.all([
    requestValue<Record<string, unknown> | undefined>(readSettings.get(localKey)),
    requestValue<SyncOutboxRecord | undefined>(readOutbox.get(record.key)),
  ]);
  if (currentOutbox?.mutationId !== record.mutationId) {
    return;
  }
  if (!setting || setting.ownerUserId !== userId) {
    throw new Error(`Local setting "${record.settingKey}" is unavailable for this account.`);
  }
  const { data, error } = await getSupabaseClient().rpc('sync_user_setting', {
    p_key: record.settingKey,
    p_value: jsonValue(setting.value),
    p_installation_id: CLOUD_SETTINGS_INSTALLATION_ID,
    p_expected_version: setting.sourceInstallationId === CLOUD_SETTINGS_INSTALLATION_ID
      ? record.cloudVersion
        ?? (typeof setting.cloudVersion === 'number' ? setting.cloudVersion : null)
      : null,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error('The server did not confirm the requested setting update.');

  const transaction = db.transaction(['settings', SYNC_OUTBOX_STORE_NAME], 'readwrite');
  const complete = transactionDone(transaction);
  const settings = transaction.objectStore('settings');
  const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
  const updatedSettingRequest = settings.get(localKey);
  const updatedOutboxRequest = outbox.get(record.key);
  let loaded = 0;
  const applyIfCurrent = () => {
    loaded += 1;
    if (loaded !== 2) return;
    const updatedSetting = updatedSettingRequest.result as Record<string, unknown> | undefined;
    const updatedOutbox = updatedOutboxRequest.result as SyncOutboxRecord | undefined;
    if (updatedOutbox?.mutationId === record.mutationId && updatedSetting?.ownerUserId === userId) {
      if (result.applied && updatedSetting.value === null) {
        // A null setting value deletes the cloud row (see the
        // sync_user_setting migration). Drop the local record too, so the
        // setting falls back to its default everywhere and the next write
        // starts from a clean insert instead of a stale expected version.
        settings.delete(localKey);
        outbox.delete(record.key);
      } else if (!result.applied) {
        settings.put({
          ...updatedSetting,
          cloudVersion: result.sync_version ?? updatedSetting.cloudVersion,
          syncStatus: 'conflict',
        });
        outbox.put({
          ...updatedOutbox,
          cloudVersion: result.sync_version ?? updatedOutbox.cloudVersion,
          attempts: updatedOutbox.attempts + 1,
          lastError: 'The remote setting changed while this device had unsynced edits.',
        });
      } else {
        settings.put({
          ...updatedSetting,
          cloudVersion: result.sync_version ?? updatedSetting.cloudVersion,
          syncStatus: 'synced',
          updatedAt: result.updated_at ? new Date(result.updated_at).getTime() : Date.now(),
        });
        outbox.delete(record.key);
      }
    }
  };
  updatedSettingRequest.onsuccess = applyIfCurrent;
  updatedOutboxRequest.onsuccess = applyIfCurrent;
  await complete;
}

async function markRecordSynced(
  outboxRecord: SyncOutboxRecord,
  version: number,
  storeName: CloudDataStore,
): Promise<void> {
  if (typeof outboxRecord.localId !== 'number') throw new Error('An outbox record is missing its local ID.');
  const db = await initDB();
  const transaction = db.transaction([storeName, SYNC_OUTBOX_STORE_NAME], 'readwrite');
  const complete = transactionDone(transaction);
  const store = transaction.objectStore(storeName);
  const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
  const [record, currentOutbox] = await Promise.all([
    requestValue<LocalRecord | undefined>(store.get(outboxRecord.localId)),
    requestValue<SyncOutboxRecord | undefined>(outbox.get(outboxRecord.key)),
  ]);
  if (currentOutbox?.mutationId === outboxRecord.mutationId) {
    if (outboxRecord.operation === 'upsert' && record) {
      store.put({ ...record, cloudVersion: version, syncStatus: 'synced' });
    }
    outbox.delete(outboxRecord.key);
  }
  await complete;
}

async function markRecordConflict(
  outboxRecord: SyncOutboxRecord,
  remoteVersion: number | undefined,
  message: string,
): Promise<void> {
  if (typeof outboxRecord.localId !== 'number') {
    await saveOutboxError(outboxRecord, message, remoteVersion);
    return;
  }
  const storeName = outboxRecord.store as CloudDataStore;
  const db = await initDB();
  const transaction = db.transaction([storeName, SYNC_OUTBOX_STORE_NAME], 'readwrite');
  const complete = transactionDone(transaction);
  const store = transaction.objectStore(storeName);
  const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
  const [record, currentOutbox] = await Promise.all([
    requestValue<LocalRecord | undefined>(store.get(outboxRecord.localId)),
    requestValue<SyncOutboxRecord | undefined>(outbox.get(outboxRecord.key)),
  ]);
  if (currentOutbox?.mutationId === outboxRecord.mutationId) {
    if (record) store.put({
      ...record,
      cloudVersion: remoteVersion ?? record.cloudVersion,
      syncStatus: 'conflict',
    });
    outbox.put({
      ...currentOutbox,
      attempts: currentOutbox.attempts + 1,
      cloudVersion: remoteVersion ?? currentOutbox.cloudVersion,
      lastError: message,
    });
  }
  await complete;
}

async function pushRecord(
  outboxRecord: SyncOutboxRecord,
  userId: string,
  installationId: string,
): Promise<void> {
  if (typeof outboxRecord.localId !== 'number') throw new Error('An outbox record is missing its local ID.');
  const store = outboxRecord.store as CloudDataStore;
  if (!DATA_STORES.includes(store)) throw new Error('An outbox record names an unsupported data store.');
  const localRecord = await getLocalRecord(store, outboxRecord.localId);
  if (outboxRecord.operation === 'delete') {
    if (!outboxRecord.cloudId) throw new Error('A delete outbox record is missing its cloud ID.');
    const { data, error } = await getSupabaseClient().rpc('delete_user_record', {
      p_store: store,
      p_id: outboxRecord.cloudId,
      p_expected_version: outboxRecord.cloudVersion ?? null,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error('The server did not confirm the requested deletion.');
    if (!result.applied) {
      await markRecordConflict(outboxRecord, result.sync_version ?? undefined, 'The remote record changed before this delete synced.');
      return;
    }
    await markRecordSynced(outboxRecord, result.sync_version ?? 0, store);
    return;
  }

  if (!localRecord || localRecord.ownerUserId !== userId) {
    throw new Error('The local record is no longer available to its owning account.');
  }
  const payload = mapLocalToCloud(store, localRecord, userId, installationId);
  const { data, error } = await getSupabaseClient().rpc('sync_user_record', {
    p_store: store,
    p_payload: payload,
    p_expected_version: outboxRecord.cloudVersion ?? localRecord.cloudVersion ?? null,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error('The server did not confirm the requested record update.');
  if (!result.applied) {
    await markRecordConflict(outboxRecord, result.sync_version ?? undefined, 'The remote record changed before this update synced.');
    return;
  }
  await markRecordSynced(outboxRecord, result.sync_version ?? 1, store);
}

async function pushOutbox(userId: string, installationId: string): Promise<string[]> {
  const failures: string[] = [];
  for (const record of await getOutbox(userId)) {
    if (record.lastError?.toLowerCase().includes('remote record changed')) continue;
    try {
      if (record.store === 'settings') await pushSetting(record, userId);
      else await pushRecord(record, userId, installationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud synchronization failed.';
      failures.push(message);
      await saveOutboxError(record, message);
    }
  }
  return failures;
}

export async function pushPendingChanges(userId: string, installationId: string): Promise<string[]> {
  return pushOutbox(userId, installationId);
}

async function fetchCloudPage(
  store: CloudDataStore,
  userId: string,
  offset: number,
  date?: string,
): Promise<CloudRow[]> {
  const supabase = getSupabaseClient();
  let result;
  switch (store) {
    case 'entries':
      {
        let query = supabase.from('journal_entries').select('*').eq('user_id', userId);
        if (date) query = query.eq('date', date);
        result = await query.order('id').range(offset, offset + PAGE_SIZE - 1);
      }
      break;
    case 'customers':
      {
        let query = supabase.from('customers').select('*').eq('user_id', userId);
        if (date) query = query.eq('date', date);
        result = await query.order('id').range(offset, offset + PAGE_SIZE - 1);
      }
      break;
    case 'expenses':
      {
        let query = supabase.from('expenses').select('*').eq('user_id', userId);
        if (date) query = query.eq('date', date);
        result = await query.order('id').range(offset, offset + PAGE_SIZE - 1);
      }
      break;
    case 'payments':
      {
        let query = supabase.from('payments').select('*').eq('user_id', userId);
        if (date) query = query.eq('date', date);
        result = await query.order('id').range(offset, offset + PAGE_SIZE - 1);
      }
      break;
  }
  if (result.error) throw result.error;
  return result.data;
}

async function mergeCloudRecord(storeName: CloudDataStore, row: CloudRow, userId: string): Promise<boolean> {
  const db = await initDB();
  const transaction = db.transaction(
    [storeName, SYNC_OUTBOX_STORE_NAME, SYNC_TOMBSTONES_STORE_NAME],
    'readwrite',
  );
  const complete = transactionDone(transaction);
  const store = transaction.objectStore(storeName);
  const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
  const tombstones = transaction.objectStore(SYNC_TOMBSTONES_STORE_NAME);
  const existingRequest = store.index('cloudId').get(row.id);
  const tombstoneKey = `${userId}:${storeName}:${row.id}`;
  const tombstoneRequest = tombstones.get(tombstoneKey);
  let mergeError: Error | null = null;
  let changed = false;
  let loaded = 0;
  const mergeWhenReady = () => {
    loaded += 1;
    if (loaded !== 2) return;
    if (tombstoneRequest.result && row.is_deleted) return;
    if (tombstoneRequest.result) {
      tombstones.delete(tombstoneKey);
      changed = true;
    }
    const existing = existingRequest.result as LocalRecord | undefined;
    if (!existing) {
      store.add(mapCloudToLocal(storeName, row, userId));
      changed = true;
      return;
    }
    if (existing.ownerUserId !== userId) {
      mergeError = new Error('A cloud record matched a local record owned by a different account.');
      transaction.abort();
      return;
    }
    const outboxRequest = outbox.get(`${userId}:${storeName}:${existing.id}`);
    outboxRequest.onsuccess = () => {
      const outboxRecord = outboxRequest.result as SyncOutboxRecord | undefined;
      if (outboxRecord) {
        if (row.sync_version > (existing.cloudVersion ?? 0)
          && outboxRecord.operation === 'upsert') {
          store.put({ ...existing, cloudVersion: row.sync_version, syncStatus: 'conflict' });
          outbox.put({
            ...outboxRecord,
            cloudVersion: row.sync_version,
            lastError: 'The remote record changed while this device had unsynced edits.',
          });
          changed = true;
        }
        return;
      }
      if (row.sync_version > (existing.cloudVersion ?? 0)) {
        store.put({ ...mapCloudToLocal(storeName, row, userId), id: existing.id });
        changed = true;
      }
    };
  };
  existingRequest.onsuccess = mergeWhenReady;
  tombstoneRequest.onsuccess = mergeWhenReady;
  try {
    await complete;
  } catch (error) {
    if (mergeError) throw mergeError;
    throw error;
  }
  return changed;
}

async function pullData(userId: string, storeFilter?: CloudDataStore, date?: string): Promise<boolean> {
  let changed = false;
  for (const store of storeFilter ? [storeFilter] : DATA_STORES) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rows = await fetchCloudPage(store, userId, offset, date);
      for (const row of rows) {
        changed = (await mergeCloudRecord(store, row, userId)) || changed;
      }
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return changed;
}

export async function refreshCloudStore(
  userId: string,
  store: CloudDataStore,
  date?: string,
): Promise<void> {
  const changed = await pullData(userId, store, date);
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('roznamcha:data-changed'));
  }
}

export async function refreshCloudSettings(userId: string): Promise<void> {
  const changed = await pullSettings(userId);
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('roznamcha:data-changed'));
  }
}

async function pullSettings(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const newestByKey = new Map<string, typeof data[number]>();
  for (const row of data) {
    const current = newestByKey.get(row.key);
    if (!current
      || (row.source_installation_id === CLOUD_SETTINGS_INSTALLATION_ID
        && current.source_installation_id !== CLOUD_SETTINGS_INSTALLATION_ID)) {
      newestByKey.set(row.key, row);
    }
  }
  const db = await initDB();
  const transaction = db.transaction(['settings', SYNC_OUTBOX_STORE_NAME], 'readwrite');
  const complete = transactionDone(transaction);
  const settings = transaction.objectStore('settings');
  const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
  const localSettingsRequest = settings.getAll();
  const outboxRequest = outbox.getAll();
  let changed = false;
  let loaded = 0;
  const mergeWhenReady = () => {
    loaded += 1;
    if (loaded !== 2) return;
    const localByKey = new Map(
      (localSettingsRequest.result as Record<string, unknown>[]).map((record) => [record.key, record]),
    );
    const pendingKeys = new Set(
      (outboxRequest.result as SyncOutboxRecord[])
        .filter((record) => record.userId === userId && record.store === 'settings')
        .map((record) => record.settingKey),
    );
    for (const [key, row] of newestByKey) {
      if (pendingKeys.has(key)) continue;
      const localKey = getScopedSettingKey(userId, key);
      const current = localByKey.get(localKey);
      const remoteTime = new Date(row.updated_at).getTime();
      if (current
        && current.cloudVersion === row.sync_version
        && current.sourceInstallationId === row.source_installation_id
        && JSON.stringify(current.value) === JSON.stringify(row.value)) {
        continue;
      }
      settings.put({
        key: localKey,
        userSettingKey: key,
        value: row.value,
        ownerUserId: userId,
        sourceInstallationId: row.source_installation_id,
        cloudVersion: row.sync_version,
        updatedAt: remoteTime,
        syncStatus: 'synced',
      });
      changed = true;
    }
  };
  localSettingsRequest.onsuccess = mergeWhenReady;
  outboxRequest.onsuccess = mergeWhenReady;
  await complete;
  return changed;
}

export async function synchronizeUserData(userId: string, installationId: string): Promise<{ failures: string[] }> {
  const failures = await pushOutbox(userId, installationId);
  const dataChanged = await pullData(userId);
  const settingsChanged = await pullSettings(userId);
  if ((dataChanged || settingsChanged) && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('roznamcha:data-changed'));
  }
  return { failures };
}

export async function getSyncConflicts(userId: string): Promise<SyncConflict[]> {
  const records = await getOutbox(userId);
  return records
    .filter((record) => Boolean(record.lastError?.toLowerCase().includes('remote')
      && record.lastError.toLowerCase().includes('changed')))
    .map((record) => ({
      key: record.key,
      store: record.store as CloudDataStore,
      localId: record.localId,
      cloudId: record.cloudId,
      remoteVersion: record.cloudVersion,
      settingKey: record.settingKey,
    }));
}

export async function getSyncQueueCount(userId: string): Promise<number> {
  return (await getOutbox(userId)).length;
}

async function fetchCloudRecord(
  store: CloudDataStore,
  userId: string,
  cloudId: string,
): Promise<CloudRow | null> {
  const supabase = getSupabaseClient();
  switch (store) {
    case 'entries': {
      const { data, error } = await supabase.from('journal_entries').select('*')
        .eq('user_id', userId).eq('id', cloudId).maybeSingle();
      if (error) throw error;
      return data;
    }
    case 'customers': {
      const { data, error } = await supabase.from('customers').select('*')
        .eq('user_id', userId).eq('id', cloudId).maybeSingle();
      if (error) throw error;
      return data;
    }
    case 'expenses': {
      const { data, error } = await supabase.from('expenses').select('*')
        .eq('user_id', userId).eq('id', cloudId).maybeSingle();
      if (error) throw error;
      return data;
    }
    case 'payments': {
      const { data, error } = await supabase.from('payments').select('*')
        .eq('user_id', userId).eq('id', cloudId).maybeSingle();
      if (error) throw error;
      return data;
    }
  }
}

export async function resolveSyncConflict(
  userId: string,
  conflict: SyncConflict,
  choice: 'local' | 'cloud',
): Promise<void> {
  const db = await initDB();
  const storeName = conflict.store;
  const outboxKey = conflict.key;
  const outboxRead = db.transaction(SYNC_OUTBOX_STORE_NAME, 'readonly');
  const outboxRecord = await requestValue<SyncOutboxRecord | undefined>(
    outboxRead.objectStore(SYNC_OUTBOX_STORE_NAME).get(outboxKey),
  );
  if (!outboxRecord || outboxRecord.userId !== userId) {
    throw new Error('The sync conflict is no longer available.');
  }

  if (storeName === 'settings') {
    if (!conflict.settingKey) throw new Error('The settings conflict is missing its key.');
    const localKey = getScopedSettingKey(userId, conflict.settingKey);
    if (choice === 'local') {
      const transaction = db.transaction(['settings', SYNC_OUTBOX_STORE_NAME], 'readwrite');
      const complete = transactionDone(transaction);
      const settings = transaction.objectStore('settings');
      const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
      const settingRequest = settings.get(localKey);
      const outboxRequest = outbox.get(outboxKey);
      let loaded = 0;
      const applyLocal = () => {
        loaded += 1;
        if (loaded !== 2) return;
        const setting = settingRequest.result as Record<string, unknown> | undefined;
        const pending = outboxRequest.result as SyncOutboxRecord | undefined;
        if (!setting || pending?.mutationId !== outboxRecord.mutationId) return;
        setting.cloudVersion = conflict.remoteVersion ?? setting.cloudVersion;
        setting.sourceInstallationId = CLOUD_SETTINGS_INSTALLATION_ID;
        setting.syncStatus = 'pending';
        settings.put(setting);
        outbox.put({
          ...pending,
          cloudVersion: conflict.remoteVersion ?? pending.cloudVersion,
          mutationId: crypto.randomUUID(),
          attempts: 0,
          lastError: undefined,
        });
      };
      settingRequest.onsuccess = applyLocal;
      outboxRequest.onsuccess = applyLocal;
      await complete;
      return;
    }

    const { data: remoteSettings, error: remoteError } = await getSupabaseClient()
      .from('user_settings').select('*')
      .eq('user_id', userId).eq('key', conflict.settingKey);
    if (remoteError) throw remoteError;
    const remoteSetting = remoteSettings.find((setting) =>
      setting.source_installation_id === CLOUD_SETTINGS_INSTALLATION_ID,
    ) ?? [...remoteSettings].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    )[0];
    const transaction = db.transaction(['settings', SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const complete = transactionDone(transaction);
    const settings = transaction.objectStore('settings');
    const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
    const outboxRequest = outbox.get(outboxKey);
    outboxRequest.onsuccess = () => {
      const current = outboxRequest.result as SyncOutboxRecord | undefined;
      if (current?.mutationId !== outboxRecord.mutationId) return;
      if (remoteSetting) {
        settings.put({
          key: localKey,
          userSettingKey: conflict.settingKey,
          value: remoteSetting.value,
          ownerUserId: userId,
          sourceInstallationId: remoteSetting.source_installation_id,
          cloudVersion: remoteSetting.sync_version,
          updatedAt: new Date(remoteSetting.updated_at).getTime(),
          syncStatus: 'synced',
        });
      } else {
        settings.delete(localKey);
      }
      outbox.delete(outboxKey);
    };
    await complete;
    return;
  }
  if (!DATA_STORES.includes(storeName)) throw new Error('This conflict cannot be resolved as a data record.');

  if (choice === 'local') {
    const transaction = db.transaction([storeName, SYNC_OUTBOX_STORE_NAME], 'readwrite');
    const complete = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
    const localRequest = typeof outboxRecord.localId === 'number'
      ? store.get(outboxRecord.localId)
      : null;
    const currentOutboxRequest = outbox.get(outboxKey);
    const applyChoice = () => {
      if (localRequest && !localRequest.readyState) return;
      if (!currentOutboxRequest.readyState) return;
      const currentOutbox = currentOutboxRequest.result as SyncOutboxRecord | undefined;
      if (currentOutbox?.mutationId !== outboxRecord.mutationId) return;
      if (localRequest?.result) {
        store.put({
          ...localRequest.result,
          cloudVersion: conflict.remoteVersion ?? localRequest.result.cloudVersion,
          syncStatus: 'pending',
        });
      }
      outbox.put({
        ...currentOutbox,
        cloudVersion: conflict.remoteVersion ?? currentOutbox.cloudVersion,
        mutationId: crypto.randomUUID(),
        attempts: 0,
        lastError: undefined,
      });
    };
    if (localRequest) localRequest.onsuccess = applyChoice;
    currentOutboxRequest.onsuccess = applyChoice;
    await complete;
    return;
  }

  if (!conflict.cloudId) throw new Error('The conflict is missing its cloud record ID.');
  const remote = await fetchCloudRecord(storeName, userId, conflict.cloudId);
  const transaction = db.transaction(
    [storeName, SYNC_OUTBOX_STORE_NAME, SYNC_TOMBSTONES_STORE_NAME],
    'readwrite',
  );
  const complete = transactionDone(transaction);
  const store = transaction.objectStore(storeName);
  const outbox = transaction.objectStore(SYNC_OUTBOX_STORE_NAME);
  const tombstones = transaction.objectStore(SYNC_TOMBSTONES_STORE_NAME);
  const currentOutboxRequest = outbox.get(outboxKey);
  const localRequest = typeof outboxRecord.localId === 'number'
    ? store.get(outboxRecord.localId)
    : null;
  let loaded = 0;
  const applyCloudChoice = () => {
    loaded += 1;
    if (loaded !== (localRequest ? 2 : 1)) return;
    const currentOutbox = currentOutboxRequest.result as SyncOutboxRecord | undefined;
    if (currentOutbox?.mutationId !== outboxRecord.mutationId) return;
    const localRecord = localRequest?.result as LocalRecord | undefined;
    if (remote) {
      const mapped = mapCloudToLocal(storeName, remote, userId);
      if (localRecord) store.put({ ...mapped, id: localRecord.id });
      else store.add(mapped);
      tombstones.delete(`${userId}:${storeName}:${remote.id}`);
    } else if (localRecord) {
      store.delete(localRecord.id);
      tombstones.put({
        key: `${userId}:${storeName}:${conflict.cloudId}`,
        userId,
        store: storeName,
        cloudId: conflict.cloudId,
        installationId: String(localRecord.sourceInstallationId ?? ''),
        sourceLocalId: Number(localRecord.sourceLocalId ?? localRecord.id),
        deletedAt: Date.now(),
      });
    }
    outbox.delete(outboxKey);
  };
  if (localRequest) localRequest.onsuccess = applyCloudChoice;
  currentOutboxRequest.onsuccess = applyCloudChoice;
  await complete;
}
