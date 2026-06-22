import { useAtom, useAtomValue } from "jotai";
import { customerAtom, editingEntryAtomCs, isModalOpenAtomCs, searchAtom } from "@/store/atoms";
import { FileDown, Plus, Share2 } from "lucide-react";
import TransactionTableCs from "@/components/ui/TransactionTableCs";
import EntryFormModalCs from "@/components/ui/EntryFormModalCs";
import { useEffect } from "react";
import { getCustomers } from "@/db/indexedDB";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CustomerEntry } from "@/types";

export default function CustomersPage() {
  const [, setIsModalOpen] = useAtom(isModalOpenAtomCs);
  const [, setEditingEntry] = useAtom(editingEntryAtomCs);
  const [, setCustomers] = useAtom(customerAtom);
  const customer = useAtomValue(customerAtom);

  useEffect(() => {
    async function loadCustomers() {
      const customers = await getCustomers();
      setCustomers(customers);
    }

    loadCustomers();
  }, []);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const search = useAtomValue(searchAtom);

  const filteredTransactions = customer.filter((t) => {
    const query = search.toLowerCase();

    return (
      t.name.toLowerCase().includes(query) ||
      t.mobileNumber.toLowerCase().includes(query)
    );
  });

  const handleDownloadPDF = (filteredTransactions: CustomerEntry[]) => {
    const doc = new jsPDF();

    doc.text("Gaahak", 14, 15);

    autoTable(doc, {
      head: [["Serial No", "Name", "Mobile Number"]],
      body: filteredTransactions.map((entry) => [
        String(entry.serialNo).padStart(2, "0"),
        entry.name || "",
        entry.mobileNumber || "",
      ]),
      startY: 25,
    });

    doc.save("گاہک.pdf");
  };

  const handleSharePDF = async (filteredTransactions: CustomerEntry[]) => {
    const doc = new jsPDF();

    autoTable(doc, {
      head: [["Serial No", "Name", "Mobile Number"]],
      body: filteredTransactions.map((entry) => [
        String(entry.serialNo).padStart(2, "0"),
        entry.name || "",
        entry.mobileNumber || "",
      ]),
    });

    const pdfBlob = doc.output("blob");
    const file = new File([pdfBlob], "گاہک.pdf", {
      type: "application/pdf",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "گاہک",
        files: [file],
      });
    } else {
      doc.save("گاہک.pdf");
    }
  };

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
        گاہک (کسٹمرز)
      </h1>
      {/* Add Entry Button */}
      <button className="add-entry-btn" onClick={handleAddNew}>
        <Plus />
        <span>نیا اندراج</span>
      </button>

      {/* Transaction Table */}
      <TransactionTableCs transactions={filteredTransactions} />

      {/* Entry Form Modal */}
      <EntryFormModalCs />

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
