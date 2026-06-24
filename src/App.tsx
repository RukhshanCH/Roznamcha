import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import RoznamchaPage from '@/pages/RoznamchaPage'
import DashboardPage from '@/pages/DashboardPage'
import DailyEntryPage from '@/pages/DailyEntryPage'
import CustomersPage from '@/pages/CustomersPage'
import ExpensesPage from '@/pages/ExpensesPage'
import PaymentsPage from '@/pages/PaymentsPage'
import BackupPage from '@/pages/BackupPage'
import { useEffect } from 'react'
import { checkWeeklyBackup } from './db/indexedDB'
import Remainings from './pages/Reaminings'

export default function App() {
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
