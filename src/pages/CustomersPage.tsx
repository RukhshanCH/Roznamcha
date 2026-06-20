import { useAtom } from "jotai";
import { customerAtom, editingEntryAtomCs, isModalOpenAtomCs } from "@/store/atoms";
import { Plus } from "lucide-react";
import TransactionTableCs from "@/components/ui/TransactionTableCs";
import EntryFormModalCs from "@/components/ui/EntryFormModalCs";
import { useEffect } from "react";
import { getCustomers } from "@/db/indexedDB";

export default function CustomersPage() {
  const [, setIsModalOpen] = useAtom(isModalOpenAtomCs);
  const [, setEditingEntry] = useAtom(editingEntryAtomCs);
  const [, setCustomers] = useAtom(customerAtom);

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
      <TransactionTableCs />

      {/* Entry Form Modal */}
      <EntryFormModalCs />
    </div>
  );
}
