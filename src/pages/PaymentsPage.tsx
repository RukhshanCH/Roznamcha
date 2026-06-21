import { useAtom } from "jotai";
import { Link } from 'react-router-dom';
import { paymentsAtom, editingEntryAtomPy, isModalOpenAtomPy, selectedDateAtom } from "@/store/atoms";
import { CalendarDays, Plus, Printer } from "lucide-react";
import TransactionTablePy from "@/components/ui/TransactionTablePy";
import EntryFormModalPy from "@/components/ui/EntryFormModalPy";
import { useEffect, useState } from "react";
import { getEntriesByDatePy, initDB } from "@/db/indexedDB";

export default function PaymentsPage() {
  const [, setIsModalOpen] = useAtom(isModalOpenAtomPy);
  const [, setEditingEntry] = useAtom(editingEntryAtomPy);
  const [, setPayments] = useAtom(paymentsAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [dbReady, setDbReady] = useState(false);

  // Initialize IndexedDB and load data
  useEffect(() => {
    async function setup() {
      try {
        await initDB();
        setDbReady(true);

        const data = await getEntriesByDatePy(selectedDate);

        setPayments(data);

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
      const data = await getEntriesByDatePy(selectedDate);
      setPayments(data);
    }
    load();
  }, [selectedDate, dbReady]);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
        ادائیگیاں
      </h1>
      <div className="page-title-section">
        <div className="page-title-left">
          <div className="breadcrumb">
            <Link to="/dashboard">ڈیش بورڈ</Link>
            {' / ادائیگیاں'}
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
      {/* Add Entry Button */}
      <button className="add-entry-btn" onClick={handleAddNew}>
        <Plus />
        <span>نیا اندراج</span>
      </button>

      {/* Transaction Table */}
      <TransactionTablePy />

      {/* Entry Form Modal */}
      <EntryFormModalPy />
    </div>
  );
}
