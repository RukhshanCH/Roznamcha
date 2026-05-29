import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom } from '@/store/atoms';
import { addEntry, updateEntry, deleteEntry, getEntriesByDate, renumberEntries, getMaxSerialNo } from '@/db/indexedDB';

export default function EntryFormModal() {
  const [isOpen, setIsOpen] = useAtom(isModalOpenAtom);
  const [editingEntry, setEditingEntry] = useAtom(editingEntryAtom);
  const [selectedDate] = useAtom(selectedDateAtom);
  const [, setEntries] = useAtom(entriesAtom);

  const [formData, setFormData] = useState({
    name: '',
    mobileNumber: '',
    cashAmount: '',
    payment: '',
    receipt: '',
    balance: '',
    remainingAmount: '',
    previousBalance: '',
    note: '',
  });

  useEffect(() => {
    if (editingEntry) {
      setFormData({
        name: editingEntry.name || '',
        mobileNumber: editingEntry.mobileNumber || '',
        cashAmount: editingEntry.cashAmount ? String(editingEntry.cashAmount) : '',
        payment: editingEntry.payment ? String(editingEntry.payment) : '',
        receipt: editingEntry.receipt ? String(editingEntry.receipt) : '',
        balance: editingEntry.balance ? String(editingEntry.balance) : '',
        remainingAmount: editingEntry.remainingAmount ? String(editingEntry.remainingAmount) : '',
        previousBalance: editingEntry.previousBalance ? String(editingEntry.previousBalance) : '',
        note: editingEntry.note || '',
      });
    } else {
      setFormData({
        name: '',
        mobileNumber: '',
        cashAmount: '',
        payment: '',
        receipt: '',
        balance: '',
        remainingAmount: '',
        previousBalance: '',
        note: '',
      });
    }
  }, [editingEntry]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const entryData = {
      name: formData.name,
      mobileNumber: formData.mobileNumber,
      cashAmount: Number(formData.cashAmount) || 0,
      payment: Number(formData.payment) || 0,
      receipt: Number(formData.receipt) || 0,
      balance: Number(formData.balance) || 0,
      remainingAmount: Number(formData.remainingAmount) || 0,
      previousBalance: Number(formData.previousBalance) || 0,
      note: formData.note,
      date: selectedDate,
      createdAt: Date.now(),
    };

    try {
      if (editingEntry?.id) {
        await updateEntry({
          ...entryData,
          id: editingEntry.id,
          serialNo: editingEntry.serialNo,
        });
      } else {
        const maxSerial = await getMaxSerialNo(selectedDate);
        await addEntry({
          ...entryData,
          serialNo: maxSerial + 1,
        });
      }

      const updated = await getEntriesByDate(selectedDate);
      setEntries(updated);
      handleClose();
    } catch (err) {
      console.error('Error saving entry:', err);
      alert('اندراج محفوظ کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔');
    }
  };

  const handleDelete = async () => {
    if (!editingEntry?.id) return;
    if (!confirm('کیا آپ واقعی اس اندراج کو حذف کرنا چاہتے ہیں؟')) return;

    try {
      await deleteEntry(editingEntry.id);
      await renumberEntries(selectedDate);
      const updated = await getEntriesByDate(selectedDate);
      setEntries(updated);
      handleClose();
    } catch (err) {
      console.error('Error deleting entry:', err);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingEntry(null);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {editingEntry ? 'اندراج میں ترمیم کریں' : 'نیا اندراج'}
          </h2>
          <button className="modal-close" onClick={handleClose}>
            <X />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">نام</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="گاہک کا نام"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">موبائل نمبر</label>
            <input
              type="tel"
              className="form-input"
              value={formData.mobileNumber}
              onChange={(e) => handleChange('mobileNumber', e.target.value)}
              placeholder="0300-1234567"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">وصولی (جمع)</label>
              <input
                type="number"
                className="form-input"
                value={formData.receipt}
                onChange={(e) => handleChange('receipt', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">ادائیگی (خرچ)</label>
              <input
                type="number"
                className="form-input"
                value={formData.payment}
                onChange={(e) => handleChange('payment', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">نقد رقم</label>
              <input
                type="number"
                className="form-input"
                value={formData.cashAmount}
                onChange={(e) => handleChange('cashAmount', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">بقیہ رقم</label>
              <input
                type="number"
                className="form-input"
                value={formData.remainingAmount}
                onChange={(e) => handleChange('remainingAmount', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">باقیہ</label>
              <input
                type="number"
                className="form-input"
                value={formData.balance}
                onChange={(e) => handleChange('balance', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">جمع اچهلی رقم</label>
              <input
                type="number"
                className="form-input"
                value={formData.previousBalance}
                onChange={(e) => handleChange('previousBalance', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">نوٹ</label>
            <input
              type="text"
              className="form-input"
              value={formData.note}
              onChange={(e) => handleChange('note', e.target.value)}
              placeholder="اضافی نوٹ"
            />
          </div>

          <div className="form-actions">
            {editingEntry && (
              <button type="button" className="btn btn-secondary" onClick={handleDelete}>
                حذف کریں
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              منسوخ
            </button>
            <button type="submit" className="btn btn-primary">
              {editingEntry ? 'محفوظ کریں' : 'شامل کریں'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
