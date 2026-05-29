import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import RoznamchaPage from '@/pages/RoznamchaPage'
import DashboardPage from '@/pages/DashboardPage'
import DailyEntryPage from '@/pages/DailyEntryPage'
import CustomersPage from '@/pages/CustomersPage'
import ExpensesPage from '@/pages/ExpensesPage'
import ReportsPage from '@/pages/ReportsPage'
import PaymentsPage from '@/pages/PaymentsPage'
import SettingsPage from '@/pages/SettingsPage'
import UsersPage from '@/pages/UsersPage'
import BackupPage from '@/pages/BackupPage'

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/daily-entry" element={<DailyEntryPage />} />
        <Route path="/roznamcha" element={<RoznamchaPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/backup" element={<BackupPage />} />
      </Routes>
    </AppLayout>
  )
}
