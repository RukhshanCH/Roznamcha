import {
  exportAllData as exportAllDataLocal,
  exportByDateRange as exportByDateRangeLocal,
  exportMonthlyData as exportMonthlyDataLocal,
  exportWeeklyData as exportWeeklyDataLocal,
  importBackup as importBackupLocal,
} from '@/db/indexedDB';
import {
  getSyncConflicts,
  pushPendingChanges,
  refreshCloudSettings,
  refreshCloudStore,
} from '@/db/cloudSync';
import { getActiveInstallationId, getActiveSyncUser } from '@/db/syncContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSetting, setSetting } from '@/db/primaryRepository';

function isCloudOnline(): boolean {
  return Boolean(
    getActiveSyncUser()
      && getActiveInstallationId()
      && isSupabaseConfigured()
      && typeof navigator !== 'undefined'
      && navigator.onLine,
  );
}

async function prepareSnapshot(): Promise<'supabase' | 'indexeddb-cache'> {
  if (!isCloudOnline()) return 'indexeddb-cache';
  const userId = getActiveSyncUser();
  if (!userId) throw new Error('Sign in before creating a cloud backup.');
  const installationId = getActiveInstallationId();
  if (!installationId) throw new Error('The local installation identity is unavailable.');
  const failures = await pushPendingChanges(userId, installationId);
  const conflicts = await getSyncConflicts(userId);
  if (conflicts.length > 0) {
    throw new Error('Resolve pending cloud conflicts before creating an authoritative backup.');
  }
  if (failures.length > 0) {
    throw new Error(`Pending changes could not be included in the cloud backup: ${failures[0]}`);
  }
  await Promise.all([
    refreshCloudStore(userId, 'entries'),
    refreshCloudStore(userId, 'customers'),
    refreshCloudStore(userId, 'expenses'),
    refreshCloudStore(userId, 'payments'),
    refreshCloudSettings(userId),
  ]);
  return 'supabase';
}

export async function exportAllData(): Promise<void> {
  const source = await prepareSnapshot();
  await exportAllDataLocal(source);
}

export async function exportWeeklyData(): Promise<void> {
  const source = await prepareSnapshot();
  await exportWeeklyDataLocal(source);
}

export async function exportMonthlyData(): Promise<void> {
  const source = await prepareSnapshot();
  await exportMonthlyDataLocal(source);
}

export async function exportByDateRange(startDate: string, endDate: string): Promise<void> {
  const source = await prepareSnapshot();
  await exportByDateRangeLocal(startDate, endDate, source);
}

export async function importBackup(file: File) {
  if (isCloudOnline()) {
    const userId = getActiveSyncUser();
    if (!userId) throw new Error('Sign in before restoring a cloud backup.');
    await Promise.all([
      refreshCloudStore(userId, 'entries'),
      refreshCloudStore(userId, 'customers'),
      refreshCloudStore(userId, 'expenses'),
      refreshCloudStore(userId, 'payments'),
    ]);
  }
  const result = await importBackupLocal(file);
  if (isCloudOnline()) {
    const userId = getActiveSyncUser();
    const installationId = getActiveInstallationId();
    if (!userId || !installationId) {
      throw new Error('The imported data is safely stored locally, but its cloud account context is unavailable.');
    }
    const failures = await pushPendingChanges(userId, installationId);
    const conflicts = await getSyncConflicts(userId);
    if (conflicts.length > 0) {
      throw new Error('The backup was restored locally, but some records need cloud conflict review.');
    }
    if (failures.length > 0) {
      throw new Error(`The backup was restored locally and queued, but cloud sync failed: ${failures[0]}`);
    }
  }
  return result;
}

export async function checkWeeklyBackup(): Promise<void> {
  const lastBackup = await getSetting<string>('localStorage:lastBackup');
  const firstSeen = await getSetting<string>('localStorage:backupFirstVisitSeen');
  const week = 7 * 24 * 60 * 60 * 1000;

  if (!firstSeen) {
    await setSetting('localStorage:backupFirstVisitSeen', Date.now().toString());
    return;
  }
  if (lastBackup && Date.now() - Number(lastBackup) < week) return;

  const confirmed = window.confirm(
    'Would you like to download a weekly backup of your Roznamcha data now? (Recommended)',
  );
  if (confirmed) await exportWeeklyData();
  await setSetting('localStorage:lastBackup', Date.now().toString());
}
