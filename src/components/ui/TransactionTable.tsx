import { useAtom } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { entriesAtom, editingEntryAtom, isModalOpenAtom } from '@/store/atoms';
import type { JournalEntry } from '@/types';
import { useMemo } from 'react';

interface Props {
    transactions: JournalEntry[];
}

export default function TransactionTable({ transactions }: Props) {
  const [entries] = useAtom(entriesAtom);
  const [, setEditingEntry] = useAtom(editingEntryAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtom);

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const formatAmount = (value?: number): string => {
    if (value === 0 || value == null) return '---';
    return value.toLocaleString('en-US') + '/-';
  };

  const summary = useMemo(() => {
    const totalPayments = entries.reduce((sum, e) => sum + (e.total || 0), 0);
    const totalAdvance = entries.reduce((sum, e) => sum + (e.advance || 0), 0);
    const totalRemaining = entries.reduce((sum, e) => sum + (e.remaining || 0), 0);
    return {
      totalPayments: totalPayments,
      totalAdvance: totalAdvance,
      totalRemaining: totalRemaining,
      totalEntries: String(entries.length),
    };
  }, [entries]);

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>نمبر شمار</th>
            <th>نام</th>
            <th>موبائل نمبر</th>
            <th>کل رقم</th>
            <th>ادائیگی</th>
            <th>بقیہ رقم</th>
            <th>نوٹ</th>
            <th>عمل</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((entry) => (
            <tr key={entry.id}>
              <td className="serial">{String(entry.serialNo).padStart(2, '0')}</td>
              <td className="name-cell">{entry.name || ''}</td>
              <td className="phone">{entry.mobileNumber || ''}</td>
              <td className={!entry.total ? 'empty-cell' : ''}>
                {formatAmount(entry.total)}
              </td>
              <td className={!entry.advance ? 'empty-cell' : ''}>
                {formatAmount(entry.advance)}
              </td>
              <td className={!entry.remaining ? 'empty-cell' : ''}>
                {formatAmount(entry.remaining)}
              </td>
              <td>{entry.note || ''}</td>
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
                  <span className="label">کل وصولی:</span>
                  <span className="footer-value blue">{formatAmount(summary.totalPayments)}</span>
                </div>
              </td>
              <td colSpan={1}>
                <div className="footer-total-label">
                  <span className="label">کل ادائیگی:</span>
                  <span className="footer-value green">{formatAmount(summary.totalAdvance)}</span>
                </div>
              </td>
              <td colSpan={1}>
                <div className="footer-total-label">
                  <span className="label">کل بقایا:</span>
                  <span className="footer-value gold">{formatAmount(summary.totalRemaining)}</span>
                </div>
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
