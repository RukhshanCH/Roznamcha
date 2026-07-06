import { useAtom, useAtomValue } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { entriesAtom, editingEntryAtom, isModalOpenAtom, remainingPlusAtom, searchAtom, showModalAtom } from '@/store/atoms';
import type { JournalEntry } from '@/types';
import { useMemo } from 'react';
import { forwardRef } from "react";
import React from 'react';

interface Props {
  transactions: JournalEntry[];
  pageName: String;
  isRemaining: Boolean
}

const TransactionTable = forwardRef<HTMLTableElement, Props>(
  ({ transactions, pageName, isRemaining }, _ref) => {
    const [entries] = useAtom(entriesAtom);
    const [, setEditingEntry] = useAtom(editingEntryAtom);
    const [, setIsModalOpen] = useAtom(isModalOpenAtom);
    const [, setRemainigPlus] = useAtom(remainingPlusAtom);
    const [, setShowModal] = useAtom(showModalAtom);
    const search = useAtomValue(searchAtom);

    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());

    const todayStr = today.toISOString().split('T')[0];

    const handleEdit = (entry: JournalEntry) => {
      setEditingEntry(entry);
      setIsModalOpen(true);
      setRemainigPlus(false)
    };

    const onDeleteClick = (entry: JournalEntry) => {
      setEditingEntry(entry);
      setShowModal(true);
    };

    const handleRemaining = (entry: JournalEntry) => {
      setEditingEntry(entry);
      setRemainigPlus(true)
      setIsModalOpen(true);
    }
    const formatAmount = (value?: number): string => {
      if (value === 0 || value == null) return '---';
      return value.toLocaleString('en-US') + '/-';
    };

    const summary = useMemo(() => {
      const totalPayments = search.trim() !== "" ? transactions.reduce((sum, e) => sum + (e.total || 0), 0) : entries.reduce((sum, e) => sum + (e.total || 0), 0);
      const totalAdvance = search.trim() !== "" ? transactions.reduce((sum, e) => sum + (e.advance || 0), 0) : entries.reduce((sum, e) => sum + (e.advance || 0), 0);

      const latestEntries = new Map<string, JournalEntry>();

      for (const entry of search.trim() !== "" ? transactions : entries) {
        const key = entry.debtId || `old-${entry.id}`;

        const existing = latestEntries.get(key);

        if (!existing || entry.createdAt > existing.createdAt) {
          latestEntries.set(key, entry);
        }
      }

      const totalRemaining = [...latestEntries.values()].reduce(
        (sum, e) => sum + (Number(e.remaining) || 0),
        0
      );

      return {
        totalPayments,
        totalAdvance,
        totalRemaining,
        totalEntries: String(entries.length),
      };
    }, [entries, transactions]);

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
              <th colSpan={9} style={{ margin: 0, fontSize: "20px" }}>{pageName}</th>
            </tr>
            <tr>
              <th>نمبر شمار</th>
              <th>نام</th>
              <th>موبائل نمبر</th>
              <th>کل رقم</th>
              <th>ادائیگی/ایڈوانس</th>
              <th>بقیہ رقم</th>
              <th>نوٹ</th>
              {
                search.trim() !== "" && (
                  <th>تاریخ</th>
                )
              }
              <th colSpan={search.trim() !== "" ? 3 : 6}>عمل</th>
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
                  {highlightText(entry.mobileNumber, search)}
                </td>
                <td className={!entry.total ? 'empty-cell' : ''}>
                  {formatAmount(entry.total)}
                </td>
                <td className={!entry.advance ? 'empty-cell' : ''}>
                  {formatAmount(entry.advance)}
                </td>
                <td className={!entry.remaining ? 'empty-cell' : ''}>
                  {formatAmount(entry.remaining)}
                </td>
                <td className="note-cell">
                  {entry.note.split("\n").map((line, i) => (
                    <React.Fragment key={i}>
                      {highlightText(line, search)}
                      <br />
                    </React.Fragment>
                  ))}
                </td>
                <td className="phone">
                  {
                    search.trim() !== "" && (
                      highlightText(entry.date, search)
                    )
                  }
                </td>
                <td>
                  {entry.name && (
                    <div className="action-btns">
                      {
                        entry.remaining > 0 && entry.date !== todayStr && !entry.note.includes("Dated") && (
                          <button
                            style={{ color: "green" }}
                            className="action-btn"
                            onClick={() => handleRemaining(entry)}
                            title="بقیہ"
                            aria-label="remaining"
                          >
                            <Pencil />
                          </button>
                        )
                      }
                      <button
                        className="action-btn edit"
                        onClick={() => handleEdit(entry)}
                        title="ترمیم"
                        aria-label="edit"
                      >
                        <Pencil />
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => onDeleteClick(entry)}
                        title="حذف"
                        aria-label="delete"
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
                <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
                  کوئی اندراج نہیں۔ نیا اندراج شامل کرنے کے لیے "نیا اندراج" بٹن دبائیں۔
                </td>
              </tr>
            )}

            {entries.length > 0 && transactions.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
                  کوئی اندراج نہی۔
                </td>
              </tr>
            )}
          </tbody>

          {entries.length > 0 && (
            <tfoot className="table-footer">
              <tr>
                {
                  !isRemaining ?
                    <>
                      <td colSpan={2}>
                        <div className="footer-total-label">
                          <span className="label">کل وصولی:</span>
                          <span className="footer-value blue">{formatAmount(summary.totalPayments)}</span>
                        </div>
                      </td>
                      <td colSpan={2}>
                        <div className="footer-total-label">
                          <span className="label">کل ادائیگی:</span>
                          <span className="footer-value green">{formatAmount(summary.totalAdvance)}</span>
                        </div>
                      </td>
                    </>
                    :
                    ""
                }
                <td colSpan={!isRemaining ? 2 : 6}>
                  <div className="footer-total-label">
                    <span className="label">کل بقایا:</span>
                    <span className="footer-value gold">{formatAmount(summary.totalRemaining)}</span>
                  </div>
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  })

export default TransactionTable;
