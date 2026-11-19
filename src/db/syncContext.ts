import type { SyncOutboxRecord } from '@/types';

export const CLOUD_SETTINGS_INSTALLATION_ID = '00000000-0000-0000-0000-000000000000';

let activeUserId: string | null = null;
let activeInstallationId: string | null = null;

export function setActiveSyncUser(userId: string | null): void {
  activeUserId = userId;
  if (!userId) activeInstallationId = null;
}

export function setActiveSyncContext(userId: string, installationId: string): void {
  activeUserId = userId;
  activeInstallationId = installationId;
}

export function getActiveSyncUser(): string | null {
  return activeUserId;
}

export function getActiveInstallationId(): string | null {
  return activeInstallationId;
}

export function getScopedSettingKey(userId: string, key: string): string {
  return `${userId}::${key}`;
}

export function isSyncOutboxRecord(value: unknown): value is SyncOutboxRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SyncOutboxRecord>;
  return typeof record.key === 'string'
    && typeof record.mutationId === 'string'
    && typeof record.userId === 'string'
    && typeof record.store === 'string'
    && (record.operation === 'upsert' || record.operation === 'delete');
}
