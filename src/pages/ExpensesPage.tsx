import { useAtom, useAtomValue } from "jotai";
import { expensesAtom, editingEntryAtomEx, isModalOpenAtomEx, selectedDateAtom, searchAtom } from "@/store/atoms";
import { Link } from 'react-router-dom';
import { CalendarDays, FileDown, Plus, Printer, Share2, Files } from "lucide-react";
import TransactionTableEx from "@/components/ui/TransactionTableEx";
import EntryFormModalEx from "@/components/ui/EntryFormModalEx";
import { useEffect, useRef } from "react";
import { getEntriesByDateEx, getExpenses } from "@/db/indexedDB";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function ExpensesPage() {
  const [, setExpenses] = useAtom(expensesAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtomEx);
  const [, setEditingEntry] = useAtom(editingEntryAtomEx);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [search] = useAtom(searchAtom);
  const expenses = useAtomValue(expensesAtom);
  const pdfRef = useRef<HTMLTableElement | null>(null);

  const filteredTransactions = expenses.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      String(t.amount).includes(query)
    );
  });

  // Load data
  const loadData = async () => {
    if (search.trim() === "") {
      const data = await getEntriesByDateEx(selectedDate);
      setExpenses(data);
    } else {
      const allData = await getExpenses();
      setExpenses(allData);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate, search]);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handlegetAll = async () => {
    setExpenses(await getExpenses())
  }

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

    pdf.save("اخراجات.pdf");
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
    const file = new File([pdfBlob], "Akhrajaat.pdf", {
      type: "application/pdf",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Akhrajaat",
        files: [file],
      });
    } else {
      pdf.save("اخراجات.pdf");
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
      <TransactionTableEx transactions={filteredTransactions} ref={pdfRef} pageName={"اخراجات"} />

      {/* Entry Form Modal */}
      <EntryFormModalEx />
    </div>
  );
}
