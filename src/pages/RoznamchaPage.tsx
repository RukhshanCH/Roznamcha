import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { CalendarDays, Printer, Plus, FileDown, Share2, Files, Loader2 } from 'lucide-react';
import SummaryCard from '@/components/ui/SummaryCard';
import TransactionTable from '@/components/ui/TransactionTable';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom, searchAtom, expensesAtom, showAllAtom, remainingPlusAtom, alertAtom, alertMessageAtom, alertTypeAtom } from '@/store/atoms';
import Modal from '@/components/ui/Modal';
import { deleteEntry, getAllEntries, getEntriesByDate, renumberEntries } from '@/db/indexedDB';
import { useSetting } from "@/hooks/useSetting";
import { urduFontPath } from "@/fonts/urduFonts";
import type { JournalEntry } from '@/types';

const EntryFormModal = lazy(() => import('@/components/ui/EntryFormModal'));
const PrintableRoznamcha = lazy(() => import('@/components/ui/PrintableRoznamcha'));

export default function RoznamchaPage() {
  const [entries, setEntries] = useAtom(entriesAtom);
  const [entriesEx] = useAtom(expensesAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtom);
  const [, setEditingEntry] = useAtom(editingEntryAtom);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showAll, setShowAll] = useAtom(showAllAtom);
  const [, setRemainigPlus] = useAtom(remainingPlusAtom);
  const search = useAtomValue(searchAtom);
  const editingEntry = useAtomValue(editingEntryAtom);
  const [, setAlert] = useAtom(alertAtom);
  const [, setType] = useAtom(alertTypeAtom);
  const [, setMessage] = useAtom(alertMessageAtom);
  const [companyName] = useSetting(
    "companyName",
    "Company Name"
  );
  const printRef = useRef<HTMLDivElement>(null);

  // ─── Inject Urdu font globally ───
  useEffect(() => {
    const styleId = 'urdu-pdf-font';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @font-face {
        font-family: 'UrduPrintFont';
        src: url('${urduFontPath}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
    `;
    document.head.appendChild(style);

    const preload = document.createElement('div');
    preload.style.cssText = 'position:absolute;left:-9999px;font-family:UrduPrintFont;font-size:24px;';
    preload.textContent = 'روزنامچہ';
    document.body.appendChild(preload);

    document.fonts.load("24px UrduPrintFont").then(() => {
      document.body.removeChild(preload);
    });
  }, []);

  const filteredTransactions = entries.filter((t) => {
    const query = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(query) ||
      t.mobileNumber.toLowerCase().includes(query) ||
      t.note.toLowerCase().includes(query)
    );
  });

  const filteredTransactionsEx = entriesEx.filter((t) => {
    const query = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      String(t.amount).includes(query)
    );
  });

  const refreshEntries = async () => {
    if (showAll) {
      setEntries(await getAllEntries());
    } else {
      setEntries(await getEntriesByDate(selectedDate));
    }
  };

  useEffect(() => {
    const loadEntries = async () => {
      if (search.trim() !== "") {
        setEntries(await getAllEntries());
        return;
      }
      await refreshEntries();
    };
    loadEntries();
  }, [selectedDate, showAll, search, setEntries, refreshEntries]);

  const summary = useMemo(() => {
    const totalPayments = search.trim() !== ""
      ? filteredTransactions.reduce((sum, e) => sum + (e.total || 0), 0)
      : entries.reduce((sum, e) => sum + (e.total || 0), 0);

    const totalAdvance = search.trim() !== ""
      ? filteredTransactions.reduce((sum, e) => sum + (e.advance || 0), 0)
      : entries.reduce((sum, e) => sum + (e.advance || 0), 0);

    const latestEntries = new Map<string, JournalEntry>();
    for (const entry of search.trim() !== "" ? filteredTransactions : entries) {
      const key = entry.debtId || `old-${entry.id}`;
      const existing = latestEntries.get(key);
      if (!existing || entry.createdAt > existing.createdAt) {
        latestEntries.set(key, entry);
      }
    }

    const totalRemaining = [...latestEntries.values()].reduce(
      (sum, e) => sum + (Number(e.remaining) || 0),
      0
    );

    const totalExpense = search.trim() !== ""
      ? filteredTransactionsEx.reduce((sum, e) => sum + (e.amount || 0), 0)
      : entriesEx.reduce((sum, e) => sum + (e.amount || 0), 0);

    const remainingBalance = totalAdvance - totalExpense;

    const sourceEntries = search.trim() !== "" ? filteredTransactions : entries;
    const totalCashAdvance = sourceEntries
      .filter(e => !e.paymentMethod || e.paymentMethod === 'cash')
      .reduce((sum, e) => sum + (e.advance || 0), 0);
    const totalOnlineAdvance = sourceEntries
      .filter(e => e.paymentMethod === 'online')
      .reduce((sum, e) => sum + (e.advance || 0), 0);

    return {
      totalPayments: totalPayments.toLocaleString('en-US') + '/-',
      totalAdvance: totalAdvance.toLocaleString('en-US') + '/-',
      totalRemaining: totalRemaining.toLocaleString('en-US') + '/-',
      totalExpense: totalExpense.toLocaleString('en-US') + '/-',
      remainingBalance: remainingBalance.toLocaleString('en-US') + '/-',
      totalEntries: String(entries.length),
      totalCashAdvance: totalCashAdvance.toLocaleString('en-US') + '/-',
      totalOnlineAdvance: totalOnlineAdvance.toLocaleString('en-US') + '/-',
    };
  }, [entries, filteredTransactionsEx, filteredTransactions, entriesEx]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handlegetAll = async () => {
    setShowAll(true);
    setEntries(await getAllEntries());
  };

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
    setRemainigPlus(false);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowAll(false);
    setSelectedDate(e.target.value);
  };

  const generatePDFBlob = async (): Promise<Blob> => {
    if (!printRef.current) throw new Error("Print element not found");

    if (entriesEx.length === 0 && filteredTransactionsEx.length === 0) {
      throw new Error("اخراجات کا ڈیٹا لوڈ نہیں ہوا۔ براہ کرم پہلے اخراجات دیکھیں یا ریفریش کریں۔");
    }

    await document.fonts.load("24px UrduPrintFont");
    await document.fonts.load("16px UrduPrintFont");
    await document.fonts.load("14px UrduPrintFont");
    await document.fonts.load("12px UrduPrintFont");
    await document.fonts.ready;

    await new Promise((r) => setTimeout(r, 300));

    const element = printRef.current;

    const htmlToImage = await import('html-to-image');
    const { default: jsPDF } = await import('jspdf');

    const dataUrl = await htmlToImage.toPng(element, {
      pixelRatio: 3,
      backgroundColor: "#F5F0E8",
      width: element.scrollWidth,
      height: element.scrollHeight,
      style: { margin: '0' },
      fontEmbedCSS: `
        @font-face {
          font-family: 'UrduPrintFont';
          src: url('${urduFontPath}') format('truetype');
        }
      `,
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => { img.onload = resolve; });

    const imgWidth = img.width;
    const imgHeight = img.height;
    const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
    const imgX = (pdfWidth - imgWidth * ratio) / 2;

    let heightLeft = imgHeight * ratio;
    let position = 0;

    pdf.addImage(dataUrl, "PNG", imgX, 0, imgWidth * ratio, imgHeight * ratio);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight * ratio;
      pdf.addPage();
      pdf.addImage(dataUrl, "PNG", imgX, position, imgWidth * ratio, imgHeight * ratio);
      heightLeft -= pdfHeight;
    }

    return pdf.output("blob");
  };

  // ─── DOWNLOAD ───
  const downloadPDF = async () => {
    try {
      setIsGeneratingPdf(true);
      setType("info");
      setMessage("PDF تیار ہو رہا ہے... براہ کرم انتظار کریں۔");
      setAlert(true);

      const blob = await generatePDFBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `روزنامچہ__${selectedDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setType("success");
      setMessage("PDF کامیابی سے ڈاؤن لوڈ ہو گیا۔");
      setAlert(true);
      setTimeout(() => setAlert(false), 2500);
    } catch (error) {
      setType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "PDF ڈاؤن لوڈ کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔"
      );
      setAlert(true);
      setTimeout(() => setAlert(false), 4000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // ─── SHARE ───
  const handleSharePDF = async () => {
    try {
      setIsGeneratingPdf(true);
      setType("info");
      setMessage("PDF تیار ہو رہا ہے... براہ کرم انتظار کریں۔");
      setAlert(true);

      const blob = await generatePDFBlob();

      const file = new File([blob], `روزنامچہ__${selectedDate}.pdf`, {
        type: "application/pdf",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "روزنامچہ", files: [file] });

        setType("success");
        setMessage("PDF کامیابی سے شیئر ہو گیا۔");
        setAlert(true);
        setTimeout(() => setAlert(false), 2500);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `روزنامچہ__${selectedDate}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setType("success");
        setMessage("PDF کامیابی سے ڈاؤن لوڈ ہو گیا۔");
        setAlert(true);
        setTimeout(() => setAlert(false), 2500);
      }
    } catch (error) {
      setType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "PDF شیئر کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔"
      );
      setAlert(true);
      setTimeout(() => setAlert(false), 4000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEntry?.id) return;
    try {
      await deleteEntry(editingEntry.id);
      await renumberEntries(selectedDate);
      const updated = await getEntriesByDate(selectedDate);
      setEntries(updated);
      setType("success");
      setMessage("اندراج حذف کر دیا گیا ہے۔");
    } catch (err) {
      setType("error");
      setMessage("اندراج حذف کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔");
    }
    setAlert(true);
    setTimeout(() => setAlert(false), 3000);
  };

  return (
    <div>
      <Modal
        title="کیا آپ واقعی اس اندراج کو حذف کرنا چاہتے ہیں؟"
        submitText="حذف کریں"
        handleSubmit={() => handleDelete()}
        type="button"
        aria-label="Delete Entry"
      />

      <div className="header">
        <h1 className="page-title">
          <span className="title-text-wrapper">{companyName}</span> &nbsp;
          <span className="subtitle">روزنامچہ رجسٹر</span>
        </h1>
      </div>

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
              aria-label="Select Date"
              onChange={handleDateChange}
            />
          </div>
          <button type="button" className="print-btn" onClick={handlegetAll} aria-label="Get All Data">
            <Files />
            <span>تمام ڈیٹا</span>
          </button>
          <button type="button" className="print-btn" onClick={handlePrint} aria-label="Print">
            <Printer />
            <span>پرنٹ کریں</span>
          </button>
        </div>
      </div>

      {/* Hidden printable area — rendered invisibly, NOT off-screen */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <div
          ref={printRef}
          style={{
            width: "794px",
            margin: "0 auto",
          }}
        >
          <Suspense fallback={null}>
            <PrintableRoznamcha
              companyName={companyName}
              selectedDate={selectedDate}
              summary={summary}
              transactions={filteredTransactions}
              expenses={filteredTransactionsEx}
            />
          </Suspense>
        </div>
      </div>

      <div>
        <div className="summary-cards">
          <SummaryCard label="تمام بل کا جمع" value={summary.totalPayments} icon="wallet" variant="blue" />
          <SummaryCard label="کل ادائیگی/ایڈوانس" value={summary.totalAdvance} icon="arrowDown" variant="green" />
          <SummaryCard label="کل بقایا" value={summary.totalRemaining} icon="scale" variant="gold" />
          <SummaryCard label="کل اندراجات" value={summary.totalEntries} icon="fileText" variant="white" />
          <SummaryCard label="کل اخراجات" value={summary.totalExpense} icon="receipt" variant="red" />
          <SummaryCard label="نقد ادائیگی (Cash)" value={summary.totalCashAdvance} icon="banknote" variant="teal" />
          <SummaryCard label="آن لائن ادائیگی (Online)" value={summary.totalOnlineAdvance} icon="smartphone" variant="orange" />
          <SummaryCard label="کل ادائیگی - کل اخراجات (بقایا رقم)" value={summary.remainingBalance} icon="fileWarning" variant="purple" />
        </div>

        <div className="actions-section">
          <button type="button" className="add-entry-btn" onClick={handleAddNew} aria-label="Add New Entry">
            <Plus />
            <span>نیا اندراج</span>
          </button>

          <div className="pdf-actions">
            {/* DOWNLOAD BUTTON */}
            <button
              className="pdf-btn download-btn"
              type="button"
              aria-label="Download PDF"
              onClick={downloadPDF}
              disabled={isGeneratingPdf}
            >
              {isGeneratingPdf ? (
                <Loader2 className="pdf-icon animate-spin" size={18} />
              ) : (
                <FileDown className="pdf-icon" size={18} />
              )}
              <span className="tooltip">
                {isGeneratingPdf ? "تیار ہو رہا ہے..." : "Download PDF"}
              </span>
            </button>

            {/* SHARE BUTTON */}
            <button
              className="pdf-btn share-btn"
              type="button"
              aria-label="Share PDF"
              onClick={handleSharePDF}
              disabled={isGeneratingPdf}
            >
              {isGeneratingPdf ? (
                <Loader2 className="pdf-icon animate-spin" size={18} />
              ) : (
                <Share2 className="pdf-icon" size={18} />
              )}
              <span className="tooltip">
                {isGeneratingPdf ? "تیار ہو رہا ہے..." : "Share PDF"}
              </span>
            </button>
          </div>
        </div>

        <TransactionTable transactions={filteredTransactions} pageName={"روزنامچہ"} isRemaining={false} />
        <Suspense fallback={null}>
          <EntryFormModal isRemaining={false} />
        </Suspense>
      </div>
    </div>
  );
}