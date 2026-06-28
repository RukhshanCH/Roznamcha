import { useAtom, useAtomValue } from "jotai";
import { Link } from 'react-router-dom';
import { paymentsAtom, editingEntryAtomPy, isModalOpenAtomPy, selectedDateAtom, searchAtom, showAllAtom } from "@/store/atoms";
import { CalendarDays, FileDown, Plus, Printer, Share2, Files } from "lucide-react";
import TransactionTablePy from "@/components/ui/TransactionTablePy";
import EntryFormModalPy from "@/components/ui/EntryFormModalPy";
import { useEffect, useRef } from "react";
import { getEntriesByDatePy, getPayments } from "@/db/indexedDB";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function PaymentsPage() {
  const [, setIsModalOpen] = useAtom(isModalOpenAtomPy);
  const [, setEditingEntry] = useAtom(editingEntryAtomPy);
  const [, setPayments] = useAtom(paymentsAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const payments = useAtomValue(paymentsAtom);
  const pdfRef = useRef<HTMLTableElement | null>(null);
  const [showAll, setShowAll] = useAtom(showAllAtom);


  const search = useAtomValue(searchAtom);

  const filteredTransactions = payments.filter((t) => {
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
        setPayments(await getPayments());
        return;
      }

      if (showAll) {
        setPayments(await getPayments());
      } else {
        setPayments(await getEntriesByDatePy(selectedDate));
      }
    };

    loadEntries();
  }, [selectedDate, showAll, search]);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handlegetAll = async () => {
    setShowAll(true);
    setPayments(await getPayments())
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
    pdf.save("ادائیگیاں__" + selectedDate + ".pdf");
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
    const file = new File([pdfBlob], "Payments.pdf", {
      type: "application/pdf",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Payments",
        files: [file],
      });
    } else {
      pdf.save("ادائیگیاں__" + selectedDate + ".pdf");
    }
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
      <TransactionTablePy transactions={filteredTransactions} ref={pdfRef} pageName={"ادائیگیاں"} />

      {/* Entry Form Modal */}
      <EntryFormModalPy />
    </div>
  );
}
