import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { CalendarDays, Printer, Plus, FileDown, Share2, Files } from 'lucide-react';
import SummaryCard from '@/components/ui/SummaryCard';
import TransactionTable from '@/components/ui/TransactionTable';
import EntryFormModal from '@/components/ui/EntryFormModal';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom, searchAtom } from '@/store/atoms';
import { getAllEntries, getEntriesByDate, initDB } from '@/db/indexedDB';
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function RoznamchaPage() {
  const [entries, setEntries] = useAtom(entriesAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtom);
  const [, setEditingEntry] = useAtom(editingEntryAtom);
  const [dbReady, setDbReady] = useState(false);
  const pdfRef = useRef<HTMLTableElement | null>(null);

  const search = useAtomValue(searchAtom);

  const filteredTransactions = entries.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.mobileNumber.toLowerCase().includes(query)
    );
  });

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
  
    // Load data
    const loadData = async () => {
      if (search.trim() === "") {
        const data = await getEntriesByDate(selectedDate);
        setEntries(data);
      } else {
        const allData = await getAllEntries();
        setEntries(allData);
      }
    };
  
    useEffect(() => {
      if (!dbReady) return;
      loadData();
    }, [dbReady, selectedDate]);

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

  const handlegetAll = async () => {
    setEntries(await getAllEntries())
  }

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const downloadPDF = async () => {
    if (!pdfRef.current) return;

    const canvas = await html2canvas(pdfRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    pdf.save("روزنامچہ.pdf");
  };

  const handleSharePDF = async () => {
    if (!pdfRef.current) return;

    const canvas = await html2canvas(pdfRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    const pdfBlob = pdf.output("blob");
    const file = new File([pdfBlob], "Roznamcha.pdf", {
      type: "application/pdf",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Roznamcha",
        files: [file],
      });
    } else {
      pdf.save("روزنامچہ.pdf");
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
          <button className="print-btn" onClick={handlegetAll}>
            <Files />
            <span>تمام ڈیٹا</span>
          </button>
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
            onClick={() => downloadPDF()}
          >
            <FileDown className="pdf-icon" size={18} />
            <span className="tooltip">Download PDF</span>
          </button>

          <button
            className="pdf-btn share-btn"
            onClick={() => handleSharePDF()}
          >
            <Share2
              className="pdf-icon" size={18} />
            <span className="tooltip">Share PDF</span>
          </button>

        </div>
      </div>

      {/* Transaction Table */}
      <TransactionTable ref={pdfRef} transactions={filteredTransactions} pageName={"روزنامچہ"} isRemaining={true} />

      {/* Entry Form Modal */}
      <EntryFormModal />
    </div>
  );
}
