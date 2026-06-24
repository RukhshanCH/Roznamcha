import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom } from '@/store/atoms';
import { addEntry, updateEntry, deleteEntry, getEntriesByDate, renumberEntries, getAllEntries } from '@/db/indexedDB';

interface Props {
  isRemaining: Boolean
}

export default function EntryFormModal({isRemaining}:Props) {
  const [isOpen, setIsOpen] = useAtom(isModalOpenAtom);
  const [editingEntry, setEditingEntry] = useAtom(editingEntryAtom);
  const [selectedDate] = useAtom(selectedDateAtom);
  const [, setEntries] = useAtom(entriesAtom);
  const [formData, setFormData] = useState({
    name: '',
    mobileNumber: '',
    total: '',
    advance: '',
    remaining: '',
    note: '',
  });

  const isDisabled = !formData.name || Number(formData.total) < 0 || Number(formData.advance) < 0 || Number(formData.advance) > Number(formData.total);

  useEffect(() => {
    if (editingEntry) {
      setFormData({
        name: editingEntry.name || '',
        mobileNumber: editingEntry.mobileNumber || '',
        total: editingEntry.total ? String(editingEntry.total) : '',
        advance: editingEntry.advance ? String(editingEntry.advance) : '',
        remaining: editingEntry.remaining ? String(editingEntry.remaining) : '',
        note: editingEntry.note || '',
      });
    } else {
      setFormData({
        name: '',
        mobileNumber: '',
        total: '',
        advance: '',
        remaining: '',
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

    const total = Number(formData.total) || 0;
    const advance = Number(formData.advance) || 0;
    const entryData = {
      name: formData.name,
      mobileNumber: formData.mobileNumber,
      total: total,
      advance: advance,
      remaining: total - advance,
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
        const entriesForDate = await getEntriesByDate(selectedDate);

        const nextSerial =
          entriesForDate.length === 0
            ? 1
            : Math.max(...entriesForDate.map(e => e.serialNo)) + 1;
        
        await addEntry({
          ...entryData,
          serialNo: nextSerial + 1,
        });
      }

      const updated = isRemaining ? await getAllEntries() : await getEntriesByDate(selectedDate);
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
      const updated = isRemaining ? await getAllEntries() : await getEntriesByDate(selectedDate);
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
              <label className="form-label"> کل رقم</label>
              <input
                type="number"
                className="form-input"
                value={formData.total}
                onChange={(e) => handleChange('total', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">ادائیگی</label>
              <input
                type="number"
                className="form-input"
                value={formData.advance}
                onChange={(e) => handleChange('advance', e.target.value)}
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
            <button disabled={isDisabled} type="submit" className={`btn ${isDisabled ? 'btn-disabled' : 'btn-primary'}`}>
              {editingEntry ? 'محفوظ کریں' : 'شامل کریں'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
