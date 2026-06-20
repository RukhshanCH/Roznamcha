import { useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { Link } from 'react-router-dom';
import { CalendarDays, Printer, Plus } from 'lucide-react';
import SummaryCard from '@/components/ui/SummaryCard';
import TransactionTable from '@/components/ui/TransactionTable';
import EntryFormModal from '@/components/ui/EntryFormModal';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom } from '@/store/atoms';
import { getEntriesByDate, initDB } from '@/db/indexedDB';

export default function RoznamchaPage() {
  const [entries, setEntries] = useAtom(entriesAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtom);
  const [, setEditingEntry] = useAtom(editingEntryAtom);
  const [dbReady, setDbReady] = useState(false);

  // Initialize IndexedDB and load data
  useEffect(() => {
    async function setup() {
      try {
        await initDB();
        setDbReady(true);

        const data = await getEntriesByDate(selectedDate);

        setEntries(data);

      } catch (err) {
        console.error('Error initializing DB:', err);
      }
    }
    setup();
  }, []);

  // Reload when date changes
  useEffect(() => {
    if (!dbReady) return;
    async function load() {
      const data = await getEntriesByDate(selectedDate);
      setEntries(data);
    }
    load();
  }, [selectedDate, dbReady]);

  const summary = useMemo(() => {
    const totalReceipts = entries.reduce((sum, e) => sum + (e.receipt || 0), 0);
    const totalPayments = entries.reduce((sum, e) => sum + (e.payment || 0), 0);
    const netBalance = entries.reduce((sum, e) => sum + (e.remainingAmount || 0), 0);
    return {
      totalReceipts: totalReceipts.toLocaleString('en-US') + '/-',
      totalPayments: totalPayments.toLocaleString('en-US') + '/-',
      netBalance: netBalance.toLocaleString('en-US') + '/-',
      totalEntries: String(entries.length),
    };
  }, [entries]);

  const handlePrint = () => {
    window.print();
  };

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  return (
    <div>
      {/* Page Title Section */}
      <div className="page-title-section">
        <div className="page-title-left">
          <h1 className="page-title">روزنامچہ رجسٹر</h1>
          <div className="breadcrumb">
            <Link to="/dashboard">ڈیش بورڈ</Link>
            {' / روزنامچہ رجسٹر'}
          </div>
        </div>
        <div className="page-title-right">
          <div className="date-picker-btn">
            <CalendarDays />
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
            />
          </div>
          <button className="print-btn" onClick={handlePrint}>
            <Printer />
            <span>پرنٹ کریں</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <SummaryCard
          label="کل وصولی (جمع)"
          value={summary.totalReceipts}
          icon="wallet"
          variant="blue"
        />
        <SummaryCard
          label="کل ادائیگی (خرچ)"
          value={summary.totalPayments}
          icon="arrowDown"
          variant="green"
        />
        <SummaryCard
          label="کل بقایا"
          value={summary.netBalance}
          icon="scale"
          variant="gold"
        />
        <SummaryCard
          label="کل اندراجات"
          value={summary.totalEntries}
          icon="fileText"
          variant="white"
        />
      </div>

      {/* Add Entry Button */}
      <button className="add-entry-btn" onClick={handleAddNew}>
        <Plus />
        <span>نیا اندراج</span>
      </button>

      {/* Transaction Table */}
      <TransactionTable />

      {/* Entry Form Modal */}
      <EntryFormModal />
    </div>
  );
}
