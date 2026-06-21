import { useAtom, useAtomValue } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { searchAtom, isModalOpenAtomPy, paymentsAtom, editingEntryAtomPy } from '@/store/atoms';
import type { PaymentsEntry } from '@/types';

export default function TransactionTablePy() {
    const [entries] = useAtom(paymentsAtom);
    const [, setEditingEntry] = useAtom(editingEntryAtomPy);
    const [, setIsModalOpen] = useAtom(isModalOpenAtomPy);

    const handleEdit = (entry: PaymentsEntry) => {
        setEditingEntry(entry);
        setIsModalOpen(true);
    };

    const search = useAtomValue(searchAtom);

    const filteredTransactions = entries.filter((t) => {
        const query = search.toLowerCase();

        return (
            t.name.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query) ||
            String(t.amount).includes(query)
        );
    });
    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>نمبر شمار</th>
                        <th>نام</th>
                        <th>تفصیل</th>
                        <th>رقم</th>
                        <th>عمل</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredTransactions.map((entry) => (
                        <tr key={entry.id}>
                            <td className="serial">{String(entry.serialNo).padStart(2, '0')}</td>
                            <td className="name-cell">{entry.name || ''}</td>
                            <td className="phone">{entry.description || ''}</td>
                            <td className="phone">{entry.amount || ''}</td>
                            <td>
                                {entry.name && (
                                    <div className="action-btns">
                                        <button
                                            className="action-btn edit"
                                            onClick={() => handleEdit(entry)}
                                            title="ترمیم"
                                        >
                                            <Pencil />
                                        </button>
                                        <button
                                            className="action-btn delete"
                                            onClick={() => handleEdit(entry)}
                                            title="حذف"
                                        >
                                            <Trash2 />
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}

                    {entries.length === 0 && (
                        <tr>
                            <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
                                کوئی اندراج نہیں۔ نیا اندراج شامل کرنے کے لیے "نیا اندراج" بٹن دبائیں۔
                            </td>
                        </tr>
                    )}

                    {entries.length > 0 && filteredTransactions.length === 0 && (
                        <tr>
                            <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
                                کوئی اندراج نہی۔
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
