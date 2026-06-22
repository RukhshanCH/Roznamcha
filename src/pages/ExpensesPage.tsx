import { useAtom, useAtomValue } from "jotai";
import { expensesAtom, editingEntryAtomEx, isModalOpenAtomEx, selectedDateAtom, searchAtom } from "@/store/atoms";
import { Link } from 'react-router-dom';
import { CalendarDays, FileDown, Plus, Printer, Share2 } from "lucide-react";
import TransactionTableEx from "@/components/ui/TransactionTableEx";
import EntryFormModalEx from "@/components/ui/EntryFormModalEx";
import { useEffect, useState } from "react";
import { getEntriesByDateEx, initDB } from "@/db/indexedDB";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ExpensesEntry } from "@/types";

export default function ExpensesPage() {
  const [, setExpenses] = useAtom(expensesAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtomEx);
  const [, setEditingEntry] = useAtom(editingEntryAtomEx);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [dbReady, setDbReady] = useState(false);
  const [search] = useAtom(searchAtom);
  const expenses = useAtomValue(expensesAtom);

  const filteredTransactions = expenses.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      String(t.amount).includes(query)
    );
  });

  // Initialize IndexedDB and load data
  useEffect(() => {
    async function setup() {
      try {
        await initDB();
        setDbReady(true);

        const data = await getEntriesByDateEx(selectedDate);

        setExpenses(data);

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
      const data = await getEntriesByDateEx(selectedDate);
      setExpenses(data);
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

  const handleDownloadPDF = (filteredTransactions: ExpensesEntry[]) => {
    const doc = new jsPDF();

    doc.text("Ekhrajaat", 14, 15);

    autoTable(doc, {
      head: [["Serial No", "Name", "Description", "Amount"]],
      body: filteredTransactions.map((entry) => [
        String(entry.serialNo).padStart(2, "0"),
        entry.name || "",
        entry.description || "",
        entry.amount || "",
      ]),
      startY: 25,
    });

    doc.save("اخراجات.pdf");
  };

  const handleSharePDF = async (filteredTransactions: ExpensesEntry[]) => {
    const doc = new jsPDF();

    autoTable(doc, {
      head: [["Serial No", "Name", "Description", "Amount"]],
      body: filteredTransactions.map((entry) => [
        String(entry.serialNo).padStart(2, "0"),
        entry.name || "",
        entry.description || "",
        entry.amount || "",
      ]),
    });

    const pdfBlob = doc.output("blob");
    const file = new File([pdfBlob], "اخراجات.pdf", {
      type: "application/pdf",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "اخراجات",
        files: [file],
      });
    } else {
      doc.save("اخراجات.pdf");
    }
  };

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
        اخراجات
      </h1>
      <div className="page-title-section">
        <div className="page-title-left">
          <div className="breadcrumb">
            <Link to="/dashboard">ڈیش بورڈ</Link>
            {' / اخراجات'}
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
      <TransactionTableEx transactions={filteredTransactions} />

      {/* Entry Form Modal */}
      <EntryFormModalEx />

      <button
        className="pdf-btn share-btn"
        onClick={() => handleSharePDF(filteredTransactions)}
      >
        <Share2 className="pdf-icon" size={18} />
        <span className="tooltip">Share PDF</span>
      </button>
      <button
        className="pdf-btn download-btn"
        onClick={() => handleDownloadPDF(filteredTransactions)}
      >
        <FileDown className="pdf-icon" size={18} />
        <span className="tooltip">Download PDF</span>
      </button>
    </div>
  );
}
