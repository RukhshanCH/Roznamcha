import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import RoznamchaPage from '@/pages/RoznamchaPage'
import DashboardPage from '@/pages/DashboardPage'
import DailyEntryPage from '@/pages/DailyEntryPage'
import CustomersPage from '@/pages/CustomersPage'
import ExpensesPage from '@/pages/ExpensesPage'
import PaymentsPage from '@/pages/PaymentsPage'
import BackupPage from '@/pages/BackupPage'
import { useEffect, useState } from 'react'
import { checkWeeklyBackup, getEntriesByDateEx, initDB } from './db/indexedDB'
import Remainings from './pages/Remainings'
import { expensesAtom, selectedDateAtom } from './store/atoms'
import { useAtom, useAtomValue } from 'jotai'


export default function App() {
  const [, setExpenses] = useAtom(expensesAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const [dbReady, setDbReady] = useState(false);

  // Initialize DB once
  useEffect(() => {
    async function setup() {
      try {
        await initDB();
        setDbReady(true);
      } catch (err) {
        console.error("Error initializing DB:", err);
      }
    }

    setup();
  }, []);

  useEffect(() => {
    if (!dbReady) return;

    const load = async () => {
      const data = await getEntriesByDateEx(selectedDate);
      setExpenses(data);
    };

    load();
  }, [dbReady, selectedDate]);

  useEffect(() => {
    checkWeeklyBackup();
  }, []);
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/daily-entry" element={<DailyEntryPage />} />
        <Route path="/roznamcha" element={<RoznamchaPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/remainings" element={<Remainings />} />
        <Route path="/backup" element={<BackupPage />} />
      </Routes>
    </AppLayout>
  )
}
