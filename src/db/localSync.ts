import type { LocalDataStore, SyncOutboxRecord, SyncTombstoneRecord } from '@/types';
import { getActiveInstallationId, getActiveSyncUser, getScopedSettingKey } from '@/db/syncContext';

const SYNC_OUTBOX_STORE_NAME = 'syncOutbox';
const SYNC_TOMBSTONES_STORE_NAME = 'syncTombstones';
const SYNC_NEEDED_EVENT = 'roznamcha:sync-needed';

function notifySyncNeeded(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_NEEDED_EVENT));
}

type LocalRecord = {
  id?: number;
  ownerUserId?: string;
  cloudId?: string;
  cloudVersion?: number;
  syncStatus?: 'pending' | 'synced' | 'conflict';
  sourceInstallationId?: string;
  sourceLocalId?: number;
};

function activeContext() {
  const userId = getActiveSyncUser();
  const installationId = getActiveInstallationId();
  if (userId && !installationId) {
    throw new Error('The local sync installation has not been initialized.');
  }
  return { userId, installationId };
}

function queueRecord(
  transaction: IDBTransaction,
  store: LocalDataStore,
  record: LocalRecord,
  localId: number,
  operation: SyncOutboxRecord['operation'] = 'upsert',
): IDBRequest | undefined {
  const { userId, installationId } = activeContext();
  if (!userId || !installationId) return;

  const cloudId = typeof record.cloudId === 'string' ? record.cloudId : crypto.randomUUID();
  const sourceInstallationId = record.sourceInstallationId ?? installationId;
  const sourceLocalId = record.sourceLocalId ?? localId;
  const syncedRecord = {
    ...record,
    ownerUserId: userId,
    cloudId,
    sourceInstallationId,
    sourceLocalId,
    syncStatus: operation === 'upsert' ? 'pending' : record.syncStatus,
  };

  const recordRequest = operation === 'upsert'
    ? transaction.objectStore(store).put(syncedRecord)
    : undefined;

  const outboxRecord: SyncOutboxRecord = {
    key: `${userId}:${store}:${localId}`,
    mutationId: crypto.randomUUID(),
    userId,
    store,
    localId,
    operation,
    cloudId,
    cloudVersion: record.cloudVersion,
    createdAt: Date.now(),
    attempts: 0,
  };
  transaction.objectStore(SYNC_OUTBOX_STORE_NAME).put(outboxRecord);
  notifySyncNeeded();
  return recordRequest;
}

export function addLocalRecord<T extends object>(
  transaction: IDBTransaction,
  store: LocalDataStore,
  record: T,
): IDBRequest {
  const { userId, installationId } = activeContext();
  const localRecord = userId && installationId
    ? {
        ...record,
        ownerUserId: userId,
        cloudId: crypto.randomUUID(),
        sourceInstallationId: installationId,
        syncStatus: 'pending' as const,
      }
    : record;
  const request = transaction.objectStore(store).add(localRecord);
  request.addEventListener('success', () => {
    if (typeof request.result === 'number' && userId && installationId) {
      queueRecord(
        transaction,
        store,
        { ...localRecord, id: request.result } as LocalRecord,
        request.result,
      );
    }
  });
  return request;
}

export function putLocalRecord<T extends LocalRecord>(
  transaction: IDBTransaction,
  store: LocalDataStore,
  record: T,
): IDBRequest {
  if (typeof record.id !== 'number') throw new Error(`Cannot update ${store} without a local ID.`);
  const { userId } = activeContext();
  if (!userId) {
    return transaction.objectStore(store).put(record);
  }
  if (record.ownerUserId !== userId) {
    throw new Error(`Cannot update a ${store} record owned by a different account.`);
  }
  const request = queueRecord(transaction, store, record, record.id);
  if (!request) throw new Error(`Could not queue the ${store} record for synchronization.`);
  return request;
}

export function deleteLocalRecord(
  transaction: IDBTransaction,
  store: LocalDataStore,
  record: LocalRecord,
): void {
  if (typeof record.id !== 'number') throw new Error(`Cannot delete ${store} without a local ID.`);
  const userId = getActiveSyncUser();
  if (userId && record.ownerUserId !== userId) {
    throw new Error(`Cannot delete a ${store} record owned by a different account.`);
  }
  const { installationId } = activeContext();
  if (userId && installationId) {
    const tombstoneRecord = {
      ...record,
      cloudId: typeof record.cloudId === 'string' ? record.cloudId : crypto.randomUUID(),
      sourceInstallationId: record.sourceInstallationId ?? installationId,
      sourceLocalId: record.sourceLocalId ?? record.id,
    };
    queueRecord(transaction, store, tombstoneRecord, record.id, 'delete');
    const tombstone: SyncTombstoneRecord = {
      key: `${userId}:${store}:${tombstoneRecord.cloudId}`,
      userId,
      store,
      cloudId: tombstoneRecord.cloudId,
      installationId: tombstoneRecord.sourceInstallationId,
      sourceLocalId: tombstoneRecord.sourceLocalId,
      deletedAt: Date.now(),
    };
    transaction.objectStore(SYNC_TOMBSTONES_STORE_NAME).put(tombstone);
  }
  transaction.objectStore(store).delete(record.id);
}

export function putLocalSetting(
  transaction: IDBTransaction,
  key: string,
  value: unknown,
): void {
  const { userId, installationId } = activeContext();
  if (!userId || !installationId) {
    transaction.objectStore('settings').put({ key, value });
    return;
  }

  const localKey = getScopedSettingKey(userId, key);
  const store = transaction.objectStore('settings');
  const existingRequest = store.get(localKey);
  existingRequest.onsuccess = () => {
    const existing = existingRequest.result as Record<string, unknown> | undefined;
    const setting = {
      ...existing,
      key: localKey,
      userSettingKey: key,
      value,
      ownerUserId: userId,
      sourceInstallationId: installationId,
      cloudVersion: existing?.cloudVersion,
      syncStatus: 'pending' as const,
      updatedAt: Date.now(),
    };
    store.put(setting);
    transaction.objectStore(SYNC_OUTBOX_STORE_NAME).put({
      key: `${userId}:settings:${key}`,
      mutationId: crypto.randomUUID(),
      userId,
      store: 'settings',
      settingKey: key,
      operation: 'upsert',
      cloudVersion: typeof existing?.cloudVersion === 'number' ? existing.cloudVersion : undefined,
      createdAt: Date.now(),
      attempts: 0,
    } satisfies SyncOutboxRecord);
    notifySyncNeeded();
  };
}
