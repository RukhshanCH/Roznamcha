import { useAtom, useAtomValue } from "jotai";
import { customerAtom, editingEntryAtomCs, isModalOpenAtomCs, searchAtom, selectedDateAtom } from "@/store/atoms";
import { FileDown, Plus, Share2 } from "lucide-react";
import TransactionTableCs from "@/components/ui/TransactionTableCs";
import EntryFormModalCs from "@/components/ui/EntryFormModalCs";
import { useEffect, useRef } from "react";
import { getCustomers } from "@/db/indexedDB";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function CustomersPage() {
  const [, setIsModalOpen] = useAtom(isModalOpenAtomCs);
  const [, setEditingEntry] = useAtom(editingEntryAtomCs);
  const [customers, setCustomers] = useAtom(customerAtom);
  const [selectedDate] = useAtom(selectedDateAtom);
  const search = useAtomValue(searchAtom);
  const pdfRef = useRef<HTMLTableElement | null>(null);

  const filteredTransactions = customers.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.mobileNumber.toLowerCase().includes(query)
    );
  });

  // Load data
  const loadData = async () => {
    const allData = await getCustomers();
    setCustomers(allData);
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
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

    pdf.save("گاہک.pdf");
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
  };

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
        گاہک (کسٹمرز)
      </h1>

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
      <TransactionTableCs transactions={filteredTransactions} ref={pdfRef} pageName={"گاہک"} />

      {/* Entry Form Modal */}
      <EntryFormModalCs />
    </div>
  );
}
