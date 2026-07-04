import { useAtom, useAtomValue } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { expensesAtom, editingEntryAtomEx, isModalOpenAtomEx, searchAtom, showModalAtom } from '@/store/atoms';
import type { ExpensesEntry } from '@/types';
import { forwardRef, useMemo } from "react";

interface Props {
    transactions: ExpensesEntry[];
    pageName: String;
}

const TransactionTableEx = forwardRef<HTMLTableElement, Props>(({ transactions, pageName }, ref) => {
    const [entries] = useAtom(expensesAtom);
    const [, setEditingEntry] = useAtom(editingEntryAtomEx);
    const [, setIsModalOpen] = useAtom(isModalOpenAtomEx);
    const [, setShowModal] = useAtom(showModalAtom);
    const search = useAtomValue(searchAtom);

    const handleEdit = (entry: ExpensesEntry) => {
        setEditingEntry(entry);
        setIsModalOpen(true);
    };

    const onDeleteClick = (entry: ExpensesEntry) => {
        setEditingEntry(entry);
        setShowModal(true);
    };

    const formatAmount = (value?: number): string => {
        if (value === 0 || value == null) return '---';
        return value.toLocaleString('en-US') + '/-';
    };

    const summary = useMemo(() => {
        const totalExpense = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
        return {
            totalExpense: totalExpense,
        };
    }, [entries]);

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
                            <td className="serial">{entry.serialNo}</td>
                            <td className="name-cell">
                                {highlightText(entry.name, search)}
                            </td>
                            <td className="phone">
                                {highlightText(entry.description, search)}</td>

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
                                            onClick={() => onDeleteClick(entry)}
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
                {entries.length > 0 && (
                    <tfoot className="table-footer">
                        <tr>
                            <td colSpan={4}>
                                <div className="footer-total-label">
                                    <span className="label">کل اخراجات:</span>
                                    <span className="footer-value gold">{formatAmount(summary.totalExpense)}</span>
                                </div>
                            </td>
                            <td colSpan={2}></td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
})

export default TransactionTableEx;
