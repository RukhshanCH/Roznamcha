import { useAtom, useAtomValue } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { customerAtom, editingEntryAtomCs, isModalOpenAtomCs, searchAtom, showModalAtom } from '@/store/atoms';
import type { CustomerEntry } from '@/types';
import { forwardRef } from "react";

interface Props {
    transactions: CustomerEntry[];
    pageName: String;
}

const TransactionTableCs = forwardRef<HTMLTableElement, Props>(
    ({ transactions, pageName }, ref) => {
        const [entries] = useAtom(customerAtom);
        const [, setEditingEntry] = useAtom(editingEntryAtomCs);
        const [, setIsModalOpen] = useAtom(isModalOpenAtomCs);
        const [, setShowModal] = useAtom(showModalAtom);
        const search = useAtomValue(searchAtom);
        
        const handleEdit = (entry: CustomerEntry) => {
            setEditingEntry(entry);
            setIsModalOpen(true);
        };

        const onDeleteClick = (entry: CustomerEntry) => {
            setEditingEntry(entry);
            setShowModal(true);
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
                            <th colSpan={5} style={{ margin: 0, fontSize: "20px" }}>{pageName}</th>
                        </tr>
                        <tr>
                            <th>نمبر شمار</th>
                            <th>نام</th>
                            <th>موبائل نمبر</th>
                            <th>تاریخ</th>
                            <th>عمل</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map((entry, index) => (
                            <tr key={entry.id}>
                                <td className="serial">{index + 1}</td>
                                <td className="name-cell">
                                    {highlightText(entry.name, search)}
                                </td>
                                <td className="phone">
                                    {highlightText(entry.mobileNumber, search)}
                                </td>
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
                </table>
            </div>
        );
    })

export default TransactionTableCs;
