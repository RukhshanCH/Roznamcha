import { useAtom } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { isModalOpenAtomPy, paymentsAtom, editingEntryAtomPy, selectedDateAtom } from '@/store/atoms';
import type { PaymentsEntry } from '@/types';
import { forwardRef } from 'react';

interface Props {
    transactions: PaymentsEntry[];
}

const TransactionTablePy = forwardRef<HTMLTableElement, Props>(
    ({ transactions }, ref) => {
    const [entries] = useAtom(paymentsAtom);
    const [, setEditingEntry] = useAtom(editingEntryAtomPy);
    const [, setIsModalOpen] = useAtom(isModalOpenAtomPy);
    const [selectedDate,] = useAtom(selectedDateAtom);

    const handleEdit = (entry: PaymentsEntry) => {
        setEditingEntry(entry);
        setIsModalOpen(true);
    };

    return (
        <div className="table-container">
            <table className="data-table" ref={ref}>
                <thead>
                    <tr>
                        <th colSpan={2} style={{ margin: 0, fontSize: "20px" }}>روزنامچہ</th>
                        <th colSpan={2} style={{ margin: 0, fontSize: "14px", color: "#555" }}>
                            تاریخ: {selectedDate}
                        </th>
                    </tr>
                    <tr>
                        <th>نمبر شمار</th>
                        <th>نام</th>
                        <th>تفصیل</th>
                        <th>رقم</th>
                        <th>عمل</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.map((entry) => (
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

                    {entries.length > 0 && transactions.length === 0 && (
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
})

export default TransactionTablePy;
