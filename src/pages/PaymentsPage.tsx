import { useAtom } from "jotai";
import { paymentsAtom, editingEntryAtomPy, isModalOpenAtomPy } from "@/store/atoms";
import { Plus } from "lucide-react";
import TransactionTablePy from "@/components/ui/TransactionTablePy";
import EntryFormModalPy from "@/components/ui/EntryFormModalPy";
import { useEffect } from "react";
import { getPayments } from "@/db/indexedDB";

export default function PaymentsPage() {
  const [, setIsModalOpen] = useAtom(isModalOpenAtomPy);
  const [, setEditingEntry] = useAtom(editingEntryAtomPy);
  const [, setPayments] = useAtom(paymentsAtom);

  useEffect(() => {
    async function loadPayments() {
      const payments = await getPayments();
      setPayments(payments);
    }

    loadPayments();
  }, []);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
       ادائیگیاں
      </h1>
      {/* Add Entry Button */}
      <button className="add-entry-btn" onClick={handleAddNew}>
        <Plus />
        <span>نیا اندراج</span>
      </button>

      {/* Transaction Table */}
      <TransactionTablePy />

      {/* Entry Form Modal */}
      <EntryFormModalPy />
    </div>
  );
}
