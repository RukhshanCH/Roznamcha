import { useAtom } from "jotai";
import { expensesAtom, editingEntryAtomEx, isModalOpenAtomEx } from "@/store/atoms";
import { Plus } from "lucide-react";
import TransactionTableEx from "@/components/ui/TransactionTableEx";
import EntryFormModalEx from "@/components/ui/EntryFormModalEx";
import { useEffect } from "react";
import { getExpenses } from "@/db/indexedDB";

export default function ExpensesPage() {
  const [, setIsModalOpen] = useAtom(isModalOpenAtomEx);
  const [, setEditingEntry] = useAtom(editingEntryAtomEx);
  const [, setExpenses] = useAtom(expensesAtom);

  useEffect(() => {
    async function loadExpenses() {
      const expenses = await getExpenses();
      setExpenses(expenses);
    }

    loadExpenses();
  }, []);

  const handleAddNew = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
       اخراجات
      </h1>
      {/* Add Entry Button */}
      <button className="add-entry-btn" onClick={handleAddNew}>
        <Plus />
        <span>نیا اندراج</span>
      </button>

      {/* Transaction Table */}
      <TransactionTableEx />

      {/* Entry Form Modal */}
      <EntryFormModalEx />
    </div>
  );
}
