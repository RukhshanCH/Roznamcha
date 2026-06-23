import { useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { CalendarDays, Printer, Plus, FileDown, Share2 } from 'lucide-react';
import SummaryCard from '@/components/ui/SummaryCard';
import TransactionTable from '@/components/ui/TransactionTable';
import EntryFormModal from '@/components/ui/EntryFormModal';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom, searchAtom } from '@/store/atoms';
import { getEntriesByDate, initDB } from '@/db/indexedDB';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { JournalEntry } from "@/types";

export default function RoznamchaPage() {
  const [entries, setEntries] = useAtom(entriesAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtom);
  const [, setEditingEntry] = useAtom(editingEntryAtom);
  const [dbReady, setDbReady] = useState(false);

  const search = useAtomValue(searchAtom);

  const filteredTransactions = entries.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.mobileNumber.toLowerCase().includes(query)
    );
  });

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
    const totalPayments = entries.reduce((sum, e) => sum + (e.total || 0), 0);
    const totalAdvance = entries.reduce((sum, e) => sum + (e.advance || 0), 0);
    const totalRemaining = entries.reduce((sum, e) => sum + (e.remaining || 0), 0);
    return {
      totalPayments: totalPayments.toLocaleString('en-US') + '/-',
      totalAdvance: totalAdvance.toLocaleString('en-US') + '/-',
      totalRemaining: totalRemaining.toLocaleString('en-US') + '/-',
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

  const handleDownloadPDF = (filteredTransactions: JournalEntry[]) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.text("روزنامچہ", 14, 15);
    doc.text(selectedDate, pageWidth - 14, 15, { align: "right" });

    autoTable(doc, {
      head: [["Serial No", "Name", "Mobile Number", "Total Amount", "Advance Payment", "Remaining Amount", "Note"]],
      body: filteredTransactions.map((entry) => [
        String(entry.serialNo).padStart(2, "0"),
        entry.name || "",
        entry.mobileNumber || "",
        entry.total || "",
        entry.advance || "",
        entry.remaining || "",
        entry.note || "",
      ]),
      startY: 25,
    });

    doc.save("روزنامچہ.pdf");
  };

  const handleSharePDF = async (filteredTransactions: JournalEntry[]) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.text("روزنامچہ", 14, 15);
    doc.text(selectedDate, pageWidth - 14, 15, { align: "right" });

    autoTable(doc, {
      head: [["Serial No", "Name", "Mobile Number", "Total Amount", "Advance Payment", "Remaining Amount", "Note"]],
      body: filteredTransactions.map((entry) => [
        String(entry.serialNo).padStart(2, "0"),
        entry.name || "",
        entry.mobileNumber || "",
        entry.total || "",
        entry.advance || "",
        entry.remaining || "",
        entry.note || "",
      ]),
    });

    const pdfBlob = doc.output("blob");
    const file = new File([pdfBlob], "روزنامچہ.pdf", {
      type: "application/pdf",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "روزنامچہ",
        files: [file],
      });
    } else {
      doc.save("روزنامچہ.pdf");
    }
  };

  return (
    <div>
      <h1 className="page-title">روزنامچہ رجسٹر</h1>
      {/* Page Title Section */}
      <div className="page-title-section">
        <div className="page-title-left">
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
          value={summary.totalPayments}
          icon="wallet"
          variant="blue"
        />
        <SummaryCard
          label="کل ادائیگی"
          value={summary.totalAdvance}
          icon="arrowDown"
          variant="green"
        />
        <SummaryCard
          label="کل بقایا"
          value={summary.totalRemaining}
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
      <div className="actions-section">
        <button className="add-entry-btn" onClick={handleAddNew}>
          <Plus />
          <span>نیا اندراج</span>
        </button>
        
        <div className="pdf-actions">
          <button
            className="pdf-btn download-btn"
            onClick={() => handleDownloadPDF(filteredTransactions)}
          >
            <FileDown className="pdf-icon" size={18} />
            <span className="tooltip">Download PDF</span>
          </button>

          <button
            className="pdf-btn share-btn"
            onClick={() => handleSharePDF(filteredTransactions)}
          >
            <Share2
              className="pdf-icon" size={18} />
            <span className="tooltip">Share PDF</span>
          </button>
          
        </div>
      </div>

      {/* Transaction Table */}
      <TransactionTable transactions={filteredTransactions} />

      {/* Entry Form Modal */}
      <EntryFormModal />
    </div>
  );
}
