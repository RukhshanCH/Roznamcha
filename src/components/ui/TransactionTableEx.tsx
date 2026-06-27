import { useAtom } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { expensesAtom, editingEntryAtomEx, isModalOpenAtomEx } from '@/store/atoms';
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

    const handleEdit = (entry: ExpensesEntry) => {
        setEditingEntry(entry);
        setIsModalOpen(true);
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
                            <td className="name-cell">{entry.name || ''}</td>
                            <td className="phone">{entry.description || ''}</td>
                            <td className="phone">{entry.amount || ''}</td>
                            <td className="phone">
                                {entry.date}
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
