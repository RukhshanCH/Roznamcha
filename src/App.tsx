import { Routes, Route, Navigate } from '@/router'
import AppLayout from '@/components/layout/AppLayout'
import AuthGate from '@/components/auth/AuthGate'
import LocalDataGate from '@/components/auth/LocalDataGate'
import AlertItem from './components/ui/AlertItem'
import { Suspense, lazy, useEffect, useState } from 'react'
import { checkWeeklyBackup } from '@/db/backup';
import { emptyTrash, emptyTrashCs, emptyTrashEx, emptyTrashPy } from '@/db/trash';
import { getAllEntries, initDB, updateEntry } from '@/db/roznamcha';
import { getEntriesByDateEx } from '@/db/expenses';
import { getSetting, setSetting } from '@/db/core';
import {
  alertMessageAtom,
  alertTypeAtom,
  expensesAtom,
  selectedDateAtom,
  syncRequestAtom,
  syncStatusAtom,
  userAtom,
} from './store/atoms'
import { useAtom, useAtomValue } from 'jotai'
import { getSyncConflicts, getSyncQueueCount, synchronizeUserData } from '@/db/cloudSync';
import { getActiveInstallationId } from '@/db/syncContext';

const RoznamchaPage = lazy(() => import('@/pages/RoznamchaPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const ExpensesPage = lazy(() => import('@/pages/ExpensesPage'))
const BackupPage = lazy(() => import('@/pages/BackupPage'))
const Remainings = lazy(() => import('./pages/Remainings'))
const Invoice = lazy(() => import('./pages/Invoice'))
const Trash = lazy(() => import('./pages/Trash'))
const Settings = lazy(() => import('./pages/Settings'))

export default function App() {
  return (
    <AuthGate>
      <LocalDataGate>
        <AuthenticatedApp />
      </LocalDataGate>
    </AuthGate>
  );
}

function AuthenticatedApp() {
  const [, setExpenses] = useAtom(expensesAtom);
  const user = useAtomValue(userAtom);
  const syncRequest = useAtomValue(syncRequestAtom);
  const [, setSyncStatus] = useAtom(syncStatusAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const [dbReady, setDbReady] = useState(false);
  const [type,] = useAtom(alertTypeAtom);
  const [message,] = useAtom(alertMessageAtom);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    let inFlight = false;

    async function refreshQueue() {
      if (!user?.id) return;
      const [queued, conflicts] = await Promise.all([
        getSyncQueueCount(user.id),
        getSyncConflicts(user.id),
      ]);
      if (active) {
        setSyncStatus((state) => ({
          ...state,
          queued,
          conflicts,
        }));
      }
    }

    async function synchronize() {
      if (!user?.id || inFlight) return;
      if (!navigator.onLine) {
        try {
          await refreshQueue();
          if (active) setSyncStatus((state) => ({ ...state, phase: 'offline' }));
        } catch (queueError) {
          if (active) {
            setSyncStatus((state) => ({
              ...state,
              phase: 'error',
              error: queueError instanceof Error ? queueError.message : 'Could not read the local sync queue.',
            }));
          }
        }
        return;
      }
      const installationId = getActiveInstallationId();
      if (!installationId) {
        setSyncStatus((state) => ({
          ...state,
          phase: 'error',
          error: 'The local installation identity is unavailable.',
        }));
        return;
      }
      inFlight = true;
      if (active) setSyncStatus((state) => ({ ...state, phase: 'syncing', error: undefined }));
      try {
        const result = await synchronizeUserData(user.id, installationId);
        const [queued, conflicts] = await Promise.all([
          getSyncQueueCount(user.id),
          getSyncConflicts(user.id),
        ]);
        if (!active) return;
        setSyncStatus({
          phase: conflicts.length > 0
            ? 'conflict'
            : result.failures.length > 0
              ? 'error'
              : queued > 0
                ? 'pending'
                : 'synced',
          queued,
          conflicts,
          error: result.failures[0],
        });
      } catch (syncError) {
        if (!active) return;
        const syncMessage = syncError instanceof Error ? syncError.message : 'Cloud synchronization failed.';
        try {
          const [queued, conflicts] = await Promise.all([
            getSyncQueueCount(user.id),
            getSyncConflicts(user.id),
          ]);
          setSyncStatus({
            phase: conflicts.length > 0 ? 'conflict' : 'error',
            queued,
            conflicts,
            error: syncMessage,
          });
        } catch (queueError) {
          setSyncStatus((state) => ({
            ...state,
            phase: 'error',
            error: `${syncMessage} Could not inspect the local sync queue: ${queueError instanceof Error ? queueError.message : 'unknown error'}`,
          }));
        }
      } finally {
        inFlight = false;
      }
    }

    const handleOnline = () => { void synchronize(); };
    const handleOffline = () => {
      void refreshQueue().then(() => {
        if (active) setSyncStatus((state) => ({ ...state, phase: 'offline' }));
      }).catch((queueError) => {
        if (active) {
          setSyncStatus((state) => ({
            ...state,
            phase: 'error',
            error: queueError instanceof Error ? queueError.message : 'Could not read the local sync queue.',
          }));
        }
      });
    };
    const timer = window.setInterval(() => { void synchronize(); }, 30_000);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleOnline);
    window.addEventListener('roznamcha:sync-needed', handleOnline);
    void synchronize();

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleOnline);
      window.removeEventListener('roznamcha:sync-needed', handleOnline);
      setSyncStatus({ phase: 'idle', queued: 0, conflicts: [] });
    };
  }, [setSyncStatus, syncRequest, user?.id]);

  // Initialize DB once
  useEffect(() => {
    async function setup() {
      try {
        await initDB();
        // Run trash cleanup in parallel
        await Promise.all([emptyTrash(), emptyTrashCs(), emptyTrashEx(), emptyTrashPy()]);
        setDbReady(true);

        // One-time migration: add debtId to entries that don't have it
        const migrationDone = await getSetting('debtIdMigrationDone');
        if (!migrationDone) {
          const entries = await getAllEntries();
          let needsMigration = false;
          for (const entry of entries) {
            if (!entry.debtId) {
              needsMigration = true;
              await updateEntry({
                ...entry,
                debtId: crypto.randomUUID(),
              });
            }
          }
          // Mark migration as done even if no entries needed it
          await setSetting('debtIdMigrationDone', 'true');
          if (needsMigration) {
            console.log('debtId migration completed');
          }
        }
      } catch (err) {
        console.error("Error initializing DB:", err);
      }
    }

    setup();
  }, []);

  useEffect(() => {
    if (!dbReady) return;

    const loadExpenses = async () => {
      const data = await getEntriesByDateEx(selectedDate);
      setExpenses(data);
    };
    void loadExpenses();
    window.addEventListener('roznamcha:data-changed', loadExpenses);
    return () => window.removeEventListener('roznamcha:data-changed', loadExpenses);
  }, [dbReady, selectedDate, setExpenses]);

  useEffect(() => {
    checkWeeklyBackup();
  }, []);

  return (
    <AppLayout>

      <AlertItem message={message} type={type as 'success' | 'error' | 'info'} />

      <Suspense fallback={<div className="min-h-screen bg-background text-foreground">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/roznamcha" element={<RoznamchaPage />} />
          <Route path="/invoice" element={<Invoice />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/recycle" element={<Trash />} />
          <Route path="/remainings" element={<Remainings />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </AppLayout>
  )
}
