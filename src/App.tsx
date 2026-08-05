import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import AlertItem from './components/ui/AlertItem'
import { Suspense, lazy, useEffect, useState } from 'react'
import { checkWeeklyBackup, emptyTrash, emptyTrashCs, emptyTrashEx, emptyTrashPy, getAllEntries, getEntriesByDateEx, initDB, updateEntry } from './db/indexedDB'
import { alertMessageAtom, alertTypeAtom, expensesAtom, selectedDateAtom } from './store/atoms'
import { useAtom, useAtomValue } from 'jotai'

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
  const [, setExpenses] = useAtom(expensesAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const [dbReady, setDbReady] = useState(false);
  const [type,] = useAtom(alertTypeAtom);
  const [message,] = useAtom(alertMessageAtom);

  // Initialize DB once
  useEffect(() => {
    async function setup() {
      try {
        await initDB();
        await emptyTrash();
        await emptyTrashCs();
        await emptyTrashEx();
        await emptyTrashPy();
        setDbReady(true);
        const entries = await getAllEntries();

        for (const entry of entries) {
          if (!entry.debtId) {
            await updateEntry({
              ...entry,
              debtId: crypto.randomUUID(),
            });
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

    void (async () => {
      const data = await getEntriesByDateEx(selectedDate);
      setExpenses(data);
    })();
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
