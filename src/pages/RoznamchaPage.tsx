import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { CalendarDays, Printer, Plus, FileDown, Share2, Files } from 'lucide-react';
import SummaryCard from '@/components/ui/SummaryCard';
import TransactionTable from '@/components/ui/TransactionTable';
import EntryFormModal from '@/components/ui/EntryFormModal';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom, searchAtom, expensesAtom, showAllAtom } from '@/store/atoms';
import { getAllEntries, getEntriesByDate } from '@/db/indexedDB';
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import TransactionTableEx from '@/components/ui/TransactionTableEx';

export default function RoznamchaPage() {
  const [entries, setEntries] = useAtom(entriesAtom);
  const [entriesEx] = useAtom(expensesAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtom);
  const [, setEditingEntry] = useAtom(editingEntryAtom);
  const pdfRef = useRef<HTMLTableElement | null>(null);
  const expenses = useAtomValue(expensesAtom);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showAll, setShowAll] = useAtom(showAllAtom);

  const search = useAtomValue(searchAtom);

  const filteredTransactions = entries.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.mobileNumber.toLowerCase().includes(query)
    );
  });

  const filteredTransactionsEx = expenses.filter((t) => {
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
      const data = await getEntriesByDate(selectedDate);
      setEntries(data);
    } else {
      const allData = await getAllEntries();
      setEntries(allData);
    }
  };

  const loadDataAll = async () => {
    if (showAll) {
      setEntries(await getAllEntries());
    } else {
      setEntries(await getEntriesByDate(selectedDate));
    }
  };

  useEffect(() => {
    loadData();
    loadDataAll();
  }, [selectedDate, showAll, search]);

  const summary = useMemo(() => {
    const totalPayments = entries.reduce((sum, e) => sum + (e.total || 0), 0);
    const totalAdvance = entries.reduce((sum, e) => sum + (e.advance || 0), 0);
    const totalRemaining = entries.reduce((sum, e) => sum + (e.remaining || 0), 0);
    const totalExpense = entriesEx.reduce((sum, e) => sum + (e.amount || 0), 0);
    const remainingBalance = totalAdvance - totalExpense;
    return {
      totalPayments: totalPayments.toLocaleString('en-US') + '/-',
      totalAdvance: totalAdvance.toLocaleString('en-US') + '/-',
      totalRemaining: totalRemaining.toLocaleString('en-US') + '/-',
      totalExpense: totalExpense.toLocaleString('en-US') + '/-',
      remainingBalance: remainingBalance.toLocaleString('en-US') + '/-',
      totalEntries: String(entries.length),
    };
  }, [entries, entriesEx]);

  const handlePrint = () => {
    window.print();
  };

  const handlegetAll = async () => {
    setShowAll(true);
    setEntries(await getAllEntries())
  }

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowAll(false);
    setSelectedDate(e.target.value);
  };

  const downloadPDF = async () => {
    if (!pdfRef.current) return;

    setIsGeneratingPdf(true);

    // Wait for React to render TransactionTableEx
    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = await html2canvas(pdfRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    setIsGeneratingPdf(false);

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

    pdf.save("روزنامچہ.pdf");
  };

  const handleSharePDF = async () => {
    if (!pdfRef.current) return;

    setIsGeneratingPdf(true);

    // Wait for React to render TransactionTableEx
    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = await html2canvas(pdfRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    setIsGeneratingPdf(false);

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

      <div ref={pdfRef}>
        {/* Summary Cards */}
        <div className="summary-cards">
          <SummaryCard
            label="تمام بل کا جمع"
            value={summary.totalPayments}
            icon="wallet"
            variant="blue"
          />
          <SummaryCard
            label="کل ادائیگی/ایڈوانس"
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
          <SummaryCard
            label="کل اخراجات"
            value={summary.totalExpense}
            icon="receipt"
            variant="red"
          />
          <SummaryCard
            label="کل ادائیگی - کل اخراجات (بقایا رقم)"
            value={summary.remainingBalance}
            icon="fileWarning"
            variant="green"
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
        <TransactionTable transactions={filteredTransactions} pageName={"روزنامچہ"} isRemaining={false} />
        {isGeneratingPdf && (
          <TransactionTableEx transactions={filteredTransactionsEx} pageName={"اخراجات"} />
        )}

        {/* Entry Form Modal */}
        <EntryFormModal isRemaining={false} />
      </div>
    </div>
  );
}
