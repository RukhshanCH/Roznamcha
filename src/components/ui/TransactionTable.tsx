import { useAtom, useAtomValue } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';
import { entriesAtom, editingEntryAtom, isModalOpenAtom, searchAtom } from '@/store/atoms';
import type { JournalEntry } from '@/types';

export default function TransactionTable() {
  const [entries] = useAtom(entriesAtom);
  const [, setEditingEntry] = useAtom(editingEntryAtom);
  const [, setIsModalOpen] = useAtom(isModalOpenAtom);

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const search = useAtomValue(searchAtom);
  
      const filteredTransactions = entries.filter((t) => {
          const query = search.toLowerCase();
  
          return (
              t.name.toLowerCase().includes(query) ||
              t.mobileNumber.toLowerCase().includes(query)
          );
      });
  
  const formatAmount = (value?: number): string => {
    if (value === 0 || value == null) return '---';
    return value.toLocaleString('en-US') + '/-';
  };

  const totalReceipts = entries.reduce((sum, e) => sum + (e.receipt || 0), 0);
  const totalPayments = entries.reduce((sum, e) => sum + (e.payment || 0), 0);
  const netBalance = entries.reduce((sum, e) => sum + (e.remainingAmount || 0), 0);

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>نمبر شمار</th>
            <th>نام</th>
            <th>موبائل نمبر</th>
            <th>نقد رقم</th>
            <th>ادائیگی</th>
            <th>وصولی</th>
            <th>باقیہ</th>
            <th>بقیہ رقم</th>
            <th>جمع اچهلی رقم</th>
            <th>نوٹ</th>
            <th>عمل</th>
          </tr>
        </thead>
        <tbody>
          {filteredTransactions.map((entry) => (
            <tr key={entry.id}>
              <td className="serial">{String(entry.serialNo).padStart(2, '0')}</td>
              <td className="name-cell">{entry.name || ''}</td>
              <td className="phone">{entry.mobileNumber || ''}</td>
              <td className={!entry.cashAmount ? 'empty-cell' : ''}>
                {formatAmount(entry.cashAmount)}
              </td>
              <td className={!entry.payment ? 'empty-cell' : ''}>
                {formatAmount(entry.payment)}
              </td>
              <td className={!entry.receipt ? 'empty-cell' : ''}>
                {formatAmount(entry.receipt)}
              </td>
              <td className={!entry.balance ? 'empty-cell' : ''}>
                {entry.balance === 0 && !entry.name ? '' : formatAmount(entry.balance)}
              </td>
              <td className={!entry.remainingAmount ? 'empty-cell' : ''}>
                {formatAmount(entry.remainingAmount)}
              </td>
              <td className={!entry.previousBalance ? 'empty-cell' : ''}>
                {entry.previousBalance ? formatAmount(entry.previousBalance) : '---'}
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

          {entries.length > 0 && filteredTransactions.length === 0 && (
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
              <td colSpan={5}>
                <div className="footer-total-label">
                  <span className="label">کل وصولی:</span>
                  <span className="footer-value blue">{formatAmount(totalReceipts)}</span>
                </div>
              </td>
              <td colSpan={3}>
                <div className="footer-total-label">
                  <span className="label">کل خرچہ:</span>
                  <span className="footer-value green">{formatAmount(totalPayments)}</span>
                </div>
              </td>
              <td colSpan={3}>
                <div className="footer-total-label">
                  <span className="label">بقایا:</span>
                  <span className="footer-value gold">{formatAmount(netBalance)}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
