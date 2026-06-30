import { useAtom, useAtomValue } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { isModalOpenAtomPy, paymentsAtom, editingEntryAtomPy, searchAtom } from '@/store/atoms';
import type { PaymentsEntry } from '@/types';
import { forwardRef } from 'react';

interface Props {
    transactions: PaymentsEntry[];
    pageName: String;
}

const TransactionTablePy = forwardRef<HTMLTableElement, Props>(
    ({ transactions, pageName }, ref) => {
    const [entries] = useAtom(paymentsAtom);
    const [, setEditingEntry] = useAtom(editingEntryAtomPy);
    const [, setIsModalOpen] = useAtom(isModalOpenAtomPy);
    const search = useAtomValue(searchAtom);

    const handleEdit = (entry: PaymentsEntry) => {
        setEditingEntry(entry);
        setIsModalOpen(true);
    };
    
    const highlightText = (text = "", query = "") => {
        if (!query.trim()) return text;

        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(${escapedQuery})`, "gi");

        return text.split(regex).map((part, index) =>
            part.toLowerCase() === query.toLowerCase() ? (
                <mark key={index} className="bg-yellow-300 text-black px-0.5 rounded">
                    {part}
                </mark>
            ) : (
                part
            )
        );
    };

    return (
        <div className="table-container">
            <table className="data-table" ref={ref}>
                <thead>
                    <tr>
                        <th colSpan={6} style={{ margin: 0, fontSize: "20px" }}>{pageName}</th>
                    </tr>
                    <tr>
                        <th>نمبر شمار</th>
                        <th>نام</th>
                        <th>تفصیل</th>
                        <th>رقم</th>
                        <th>تاریخ</th>
                        <th>عمل</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.map((entry) => (
                        <tr key={entry.id}>
                            <td className="serial">{String(entry.serialNo).padStart(2, '0')}</td>
                            <td className="name-cell">
                                {highlightText(entry.name, search)}
                            </td>
                            <td className="phone">
                                {highlightText(entry.description, search)}
                            </td>
                            <td className="phone">
                                {highlightText(String(entry.amount), search)}
                            </td>
                            <td className="phone">
                                {highlightText(entry.date, search)}
                            </td>
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
