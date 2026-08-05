import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import RoznamchaPage from '@/pages/RoznamchaPage'
import DashboardPage from '@/pages/DashboardPage'
import CustomersPage from '@/pages/CustomersPage'
import ExpensesPage from '@/pages/ExpensesPage'
import BackupPage from '@/pages/BackupPage'
import Remainings from './pages/Remainings'
import Invoice from './pages/Invoice'
import Trash from './pages/Trash'
import Settings from './pages/Settings'
import AlertItem from './components/ui/AlertItem'
import { useEffect, useState } from 'react'
import { checkWeeklyBackup, emptyTrash, emptyTrashCs, emptyTrashEx, emptyTrashPy, getAllEntries, getEntriesByDateEx, initDB, updateEntry } from './db/indexedDB'
import { alertMessageAtom, alertTypeAtom, expensesAtom, selectedDateAtom } from './store/atoms'
import { useAtom, useAtomValue } from 'jotai'

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
    </AppLayout>
  )
}
