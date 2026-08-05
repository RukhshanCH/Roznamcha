import { useAtom, useAtomValue } from "jotai";
import { alertAtom, alertMessageAtom, alertTypeAtom, customerAtom, editingEntryAtomCs, isModalOpenAtomCs, searchAtom, selectedDateAtom } from "@/store/atoms";
import { FileDown, Plus, Share2 } from "lucide-react";
import TransactionTableCs from "@/components/ui/TransactionTableCs";
import EntryFormModalCs from "@/components/ui/EntryFormModalCs";
import { useEffect, useRef } from "react";
import { deleteEntryCs, getCustomers, renumberEntriesCs } from "@/db/indexedDB";
import Modal from "@/components/ui/Modal";

export default function CustomersPage() {
  const [, setIsModalOpen] = useAtom(isModalOpenAtomCs);
  const [editingEntry, setEditingEntry] = useAtom(editingEntryAtomCs);
  const [customers, setCustomers] = useAtom(customerAtom);
  const [selectedDate] = useAtom(selectedDateAtom);
  const search = useAtomValue(searchAtom);
  const pdfRef = useRef<HTMLTableElement | null>(null);
  const [, setAlert] = useAtom(alertAtom);
  const [, setType] = useAtom(alertTypeAtom);
  const [, setMessage] = useAtom(alertMessageAtom);

  const filteredTransactions = customers.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.mobileNumber.toLowerCase().includes(query)
    );
  });

  // Load data
  useEffect(() => {
    const loadData = async () => {
      const allData = await getCustomers();
      setCustomers(allData);
    };
    void loadData();
  }, [selectedDate, setCustomers]);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const downloadPDF = async () => {
    if (!pdfRef.current) return;

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

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

      pdf.save("گاہک.pdf");
    }
    catch {
      setType("error");
      setMessage("PDF ڈاؤن لوڈ کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔");

      setAlert(true);
      setTimeout(() => {
        setAlert(false);
      }, 3000);
    }
  };

  const handleSharePDF = async () => {
    if (!pdfRef.current) return;

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

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
      const file = new File([pdfBlob], "Customers.pdf", {
        type: "application/pdf",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Customers",
          files: [file],
        });
      } else {
        pdf.save("گاہک.pdf");
      }
    }
    catch {
      setType("error");
      setMessage("PDF  شیئر  کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔");

      setAlert(true);
      setTimeout(() => {
        setAlert(false);
      }, 3000);
    }
  };

  const handleDelete = async () => {
    if (!editingEntry?.id) return;

    try {
      await deleteEntryCs(editingEntry.id);
      await renumberEntriesCs(selectedDate);

      const updated = await getCustomers();
      setCustomers(updated);

      setType("success");
      setMessage("اندراج حذف کر دیا گیا ہے۔");

    } catch (err) {
      setType("error");
      setMessage(err instanceof Error ? err.message : "اندراج حذف کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔");
    }

    setAlert(true);

    setTimeout(() => {
      setAlert(false);
    }, 3000);
  };

  return (
    <div style={{ textAlign: 'center' }}>

      <Modal
        title="کیا آپ واقعی اس اندراج کو حذف کرنا چاہتے ہیں؟"
        submitText="حذف کریں"
        handleSubmit={() => handleDelete()}
        type="button"
        aria-label="Delete Entry"
      />

      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
        گاہک (کسٹمرز)
      </h1>

      {/* Add Entry Button */}
      <div className="actions-section">
        <button type="button" className="add-entry-btn" onClick={handleAddNew}>
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
      <TransactionTableCs transactions={filteredTransactions} ref={pdfRef} pageName={"گاہک"} />

      {/* Entry Form Modal */}
      <EntryFormModalCs />
    </div>
  );
}
