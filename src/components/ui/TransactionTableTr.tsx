import { useAtomValue } from 'jotai';
import { searchAtom } from '@/store/atoms';
import { useEffect, useState } from "react";
import {
    getTrashEntries,
    restoreEntry,
    permanentlyDeleteEntry,
    getTrashEntriesCs,
    getTrashEntriesPy,
    getTrashEntriesEx,
    restoreEntryEx,
    restoreEntryPy,
    restoreEntryCs,
    permanentlyDeleteEntryEx,
    permanentlyDeleteEntryCs,
    permanentlyDeleteEntryPy
} from "@/db/indexedDB";
import type { CustomerEntry, ExpensesEntry, JournalEntry, PaymentsEntry, TrashItem } from "@/types";
import { RotateCcw, Undo2 } from "lucide-react";

export default function TransactionTableTr() {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [entriesCs, setEntriesCs] = useState<CustomerEntry[]>([]);
    const [entriesEx, setEntriesEx] = useState<ExpensesEntry[]>([]);
    const [entriesPy, setEntriesPy] = useState<PaymentsEntry[]>([]);

    const loadTrash = async () => {
        const [data, dataCs, dataEx, dataPy] = await Promise.all([
            getTrashEntries(),
            getTrashEntriesCs(),
            getTrashEntriesEx(),
            getTrashEntriesPy(),
        ]);

        setEntries(data);
        setEntriesCs(dataCs);
        setEntriesEx(dataEx);
        setEntriesPy(dataPy);
    };

    useEffect(() => {
        loadTrash();
    }, [setEntries, setEntriesCs, setEntriesEx, setEntriesPy]);

    const allTrash: TrashItem[] = [
        ...entries.map(item => ({
            id: item.id!,
            serialNo: item.serialNo,
            store: "journal" as const,
            type: "Journal" as const,
            name: item.name,
            mobileNumber: item.mobileNumber,
            amount: item.total,
            date: item.date,
            deletedAt: item.deletedAt,
            original: item,
        })),

        ...entriesCs.map(item => ({
            id: item.id!,
            serialNo: item.serialNo,
            store: "customers" as const,
            type: "Customer" as const,
            name: item.name,
            mobileNumber: item.mobileNumber,
            date: item.date,
            deletedAt: item.deletedAt,
            original: item,
        })),

        ...entriesEx.map(item => ({
            id: item.id!,
            serialNo: item.serialNo,
            store: "expenses" as const,
            type: "Expense" as const,
            name: item.name,
            description: item.description,
            amount: item.amount,
            date: item.date,
            deletedAt: item.deletedAt,
            original: item,
        })),

        ...entriesPy.map(item => ({
            id: item.id!,
            serialNo: item.serialNo,
            store: "payments" as const,
            type: "Payment" as const,
            name: item.name,
            description: item.description,
            amount: item.amount,
            date: item.date,
            deletedAt: item.deletedAt,
            original: item,
        })),
    ];

    const handleRestore = async (item: TrashItem) => {
        if (!confirm('کیا آپ واقعی اس اندراج کو بحال کرنا چاہتے ہیں؟')) return;

        switch (item.store) {
            case "journal":
                await restoreEntry(item.id);
                break;

            case "customers":
                await restoreEntryCs(item.id);
                break;

            case "expenses":
                await restoreEntryEx(item.id);
                break;

            case "payments":
                await restoreEntryPy(item.id);
                break;
        }

        // Refresh the table
        loadTrash();
    };

    const handlePermanentDelete = async (item: TrashItem) => {
        if (!confirm('کیا آپ واقعی اس اندراج کو حذف کرنا چاہتے ہیں؟')) return;

        switch (item.store) {
            case "journal":
                await permanentlyDeleteEntry(item.id);
                break;

            case "customers":
                await permanentlyDeleteEntryCs(item.id);
                break;

            case "expenses":
                await permanentlyDeleteEntryEx(item.id);
                break;

            case "payments":
                await permanentlyDeleteEntryPy(item.id);
                break;
        }

        loadTrash();
    };

    const search = useAtomValue(searchAtom);

    const formatAmount = (value?: number): string => {
        if (value === 0 || value == null) return '---';
        return value.toLocaleString('en-US') + '/-';
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
            <table className="data-table">
                <thead>
                    <tr>
                        <th colSpan={10} style={{ margin: 0, fontSize: "20px" }}>ری سائیکل بن</th>
                    </tr>
                    <tr>
                        <th>نمبر شمار</th>
                        <th>نمبر</th>
                        <th>قسم</th>
                        <th>نام</th>
                        <th>موبائل نمبر</th>
                        <th>رقم</th>
                        {
                            search.trim() !== "" && (
                                <th>تاریخ</th>
                            )
                        }
                        <th colSpan={search.trim() !== "" ? 3 : 6}>عمل</th>
                    </tr>
                </thead>
                <tbody>
                    {allTrash.length === 0 ? (
                        <tr>
                            <td style={{ textAlign: "center" }}>
                                ری سائیکل بن خالی ہے۔
                            </td>
                        </tr>
                    ) : (
                        allTrash.map((entry, index) => (
                            <tr key={`${entry.type}-${entry.id}`}>
                                <td className="serial">{String(index + 1).padStart(2, '0')}</td>
                                <td className="serial">{String(entry.serialNo).padStart(2, '0')}</td>
                                <td className="name-cell">
                                    {highlightText(entry.type, search)}
                                </td>
                                <td className="name-cell">
                                    {highlightText(entry.name, search)}
                                </td>
                                <td className="phone">
                                    {highlightText(entry.mobileNumber, search)}
                                </td>
                                <td className={!entry.amount ? 'empty-cell' : ''}>
                                    {formatAmount(entry.amount)}
                                </td>
                                <td className="phone">
                                    {
                                        search.trim() !== "" && (
                                            highlightText(entry.date, search)
                                        )
                                    }
                                </td>
                                <td className='action-btns'>
                                    <button
                                        onClick={() => handleRestore(entry)}
                                        className="action-btn edit"
                                        title="بحال کریں"
                                        aria-label="restore"
                                    >
                                        <RotateCcw />
                                    </button>

                                    <button
                                        onClick={() => handlePermanentDelete(entry)}
                                        className="action-btn delete"
                                        title="مستقل حذف کریں"
                                        aria-label="permanent-delete"
                                    >
                                        <Undo2 />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}
