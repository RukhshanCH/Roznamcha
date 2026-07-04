import { useAtom, useAtomValue } from "jotai";
import { expensesAtom, editingEntryAtomEx, isModalOpenAtomEx, selectedDateAtom, searchAtom, showAllAtom } from "@/store/atoms";
import { Link } from 'react-router-dom';
import { CalendarDays, FileDown, Plus, Printer, Share2, Files } from "lucide-react";
import TransactionTableEx from "@/components/ui/TransactionTableEx";
import EntryFormModalEx from "@/components/ui/EntryFormModalEx";
import { useCallback, useEffect, useRef } from "react";
import { deleteEntryEx, getEntriesByDateEx, getExpenses, renumberEntriesEx } from "@/db/indexedDB";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Modal from "@/components/ui/Modal";

export default function ExpensesPage() {
  const [, setExpenses] = useAtom(expensesAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtomEx);
  const [editingEntry, setEditingEntry] = useAtom(editingEntryAtomEx);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [search] = useAtom(searchAtom);
  const expenses = useAtomValue(expensesAtom);
  const pdfRef = useRef<HTMLTableElement | null>(null);
  const [showAll, setShowAll] = useAtom(showAllAtom);

  const filteredTransactions = expenses.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      String(t.amount).includes(query)
    );
  });

  // Load data
  useEffect(() => {
    const loadEntries = async () => {
      if (search.trim() !== "") {
        setExpenses(await getExpenses());
        return;
      }

      if (showAll) {
        setExpenses(await getExpenses());
      } else {
        setExpenses(await getEntriesByDateEx(selectedDate));
      }
    };

    loadEntries();
  }, [selectedDate, showAll, search, setExpenses]);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handlegetAll = async () => {
    setShowAll(true);
    setExpenses(await getExpenses())
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowAll(false);
    setSelectedDate(e.target.value);
  };

  const downloadPDF = async () => {
    if (!pdfRef.current) return;

    const canvas = await html2canvas(pdfRef.current, {
      scale: window.devicePixelRatio > 1 ? 2 : 1,
      useCORS: true,
      backgroundColor: "#F5F0E8",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;

      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);

      heightLeft -= pdfHeight;
    }
    pdf.save("اخراجات__" + selectedDate + ".pdf");
  };

  const handleSharePDF = async () => {
    if (!pdfRef.current) return;

    const canvas = await html2canvas(pdfRef.current, {
      scale: window.devicePixelRatio > 1 ? 2 : 1,
      useCORS: true,
      backgroundColor: "#F5F0E8",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;

      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);

      heightLeft -= pdfHeight;
    }

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
      pdf.save("اخراجات__" + selectedDate + ".pdf");
    }
  };
  
    const handleDelete = async () => {
      if (!editingEntry?.id) return;
  
      try {
        await deleteEntryEx(editingEntry.id);
        await renumberEntriesEx(selectedDate);
        const updated = await getEntriesByDateEx(selectedDate);
        setExpenses(updated);
      } catch (err) {
        console.error('Error deleting entry:', err);
      }
    };

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      
      <Modal
        title="کیا آپ واقعی اس اندراج کو حذف کرنا چاہتے ہیں؟"
        submitText="حذف کریں"
        handleSubmit={() => handleDelete()}
        type="button"
        aria-label="Delete Entry"
      />

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
            <label htmlFor="datePickerEx">
              <CalendarDays />
            </label>
            <input
              type="date"
              aria-label="Select Date"
              id="datePickerEx"
              value={selectedDate}
              onChange={handleDateChange}
            />
          </div>
          <button type="button" aria-label="Download All Data" className="print-btn" onClick={handlegetAll}>
            <Files />
            <span>تمام ڈیٹا</span>
          </button>
          <button type="button" aria-label="Print" className="print-btn" onClick={handlePrint}>
            <Printer />
            <span>پرنٹ کریں</span>
          </button>
        </div>
      </div>
      {/* Add Entry Button */}
      <div className="actions-section">
        <button type="button" aria-label="Add New Entry" className="add-entry-btn" onClick={handleAddNew}>
          <Plus />
          <span>نیا اندراج</span>
        </button>

        <div className="pdf-actions">
          <button
            className="pdf-btn download-btn"
            type="button"
            aria-label="Download PDF"
            onClick={() => downloadPDF()}
          >
            <FileDown className="pdf-icon" size={18} />
            <span className="tooltip">Download PDF</span>
          </button>

          <button
            className="pdf-btn share-btn"
            type="button"
            aria-label="Share PDF"
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
