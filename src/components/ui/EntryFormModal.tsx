import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom, remainingPlusAtom } from '@/store/atoms';
import { addEntry, updateEntry, deleteEntry, getEntriesByDate, renumberEntries, getAllEntries } from '@/db/indexedDB';

interface Props {
  isRemaining: Boolean
}

export default function EntryFormModal({ isRemaining }: Props) {
  const [isOpen, setIsOpen] = useAtom(isModalOpenAtom);
  const [editingEntry, setEditingEntry] = useAtom(editingEntryAtom);
  const [selectedDate] = useAtom(selectedDateAtom);
  const [, setEntries] = useAtom(entriesAtom);
  const [remainingPlusValue,] = useAtom(remainingPlusAtom);
  const initialFormData = {
    name: '',
    mobileNumber: '',
    total: '',
    advance: '',
    remaining: '',
    remainingPlus: '',
    note: '',
  };
  const [formData, setFormData] = useState(initialFormData);

  const isDisabled = !formData.name || Number(formData.total) < 0 || Number(formData.advance) < 0 || Number(formData.advance) > Number(formData.total);

  useEffect(() => {
    if (editingEntry) {
      setFormData({
        name: editingEntry.name || '',
        mobileNumber: editingEntry.mobileNumber || '',
        total: editingEntry.total ? String(editingEntry.total) : '',
        advance: editingEntry.advance ? String(editingEntry.advance) : '',
        remaining: editingEntry.remaining ? String(editingEntry.remaining) : '',
        remainingPlus: editingEntry.remainingPlus ? String(editingEntry.remainingPlus) : '',
        note: editingEntry.note || '',
      });
    } else {
      setFormData({
        name: '',
        mobileNumber: '',
        total: '',
        advance: '',
        remaining: '',
        remainingPlus: '',
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
    const remainingPlus = Number(formData.remainingPlus) || 0;
    const entryData = {
      name: formData.name,
      mobileNumber: formData.mobileNumber,
      total: total,
      advance: !remainingPlusValue ? advance : advance + remainingPlus,
      remaining: !remainingPlusValue ? total - advance : total - advance - remainingPlus,
      remainingPlus,
      note: formData.note,
      date: editingEntry?.date ?? selectedDate,
      createdAt: editingEntry?.createdAt ?? Date.now(),
    };

    try {
      if (editingEntry?.id) {
        const updatedEntry = {
          ...editingEntry,
          ...entryData,
          id: editingEntry.id,
          serialNo: editingEntry.serialNo,
          date: editingEntry.date,
          createdAt: editingEntry.createdAt
        };

        await updateEntry(updatedEntry);

        // Create automatic entry only when updating remaining payment
        if (remainingPlusValue && remainingPlus > 0) {
          const today = new Date();
          today.setMinutes(today.getMinutes() - today.getTimezoneOffset());

          const todayStr = today.toISOString().split('T')[0];

          const todayEntries = await getEntriesByDate(todayStr);

          const nextSerial =
            todayEntries.length === 0
              ? 1
              : Math.max(...todayEntries.map(e => e.serialNo)) + 1;
          
          const newRemaining = editingEntry.remaining - remainingPlus;
          const isNill = newRemaining === 0;
          
          await updateEntry({
            ...editingEntry,
            note: isNill ? "Nil" + "\nDated: " + todayStr : String(editingEntry.remaining) + '-' + String(remainingPlus) + '=' + String(editingEntry.remaining - remainingPlus) + "\nDated: " + todayStr,
          });

          await addEntry({
            serialNo: nextSerial,
            name: editingEntry.name,
            mobileNumber: editingEntry.mobileNumber,

            total: editingEntry.remaining,            // previous remaining
            advance: remainingPlus,                  // amount paid today
            remaining: editingEntry.remaining - remainingPlus,
            remainingPlus: 0,

            note: " بقیہ رقم۔ تاریخ: " + editingEntry.date,
            date: todayStr,
            createdAt: Date.now(),
          });
        }
      }
      else {
        const entriesForDate = await getEntriesByDate(selectedDate);

        const nextSerial =
          entriesForDate.length === 0
            ? 1
            : Math.max(...entriesForDate.map(e => e.serialNo)) + 1;

        await addEntry({
          ...entryData,
          serialNo: nextSerial,
        });
      }

      const updated = isRemaining ? await getAllEntries() : await getEntriesByDate(selectedDate);
      setEntries(updated);
      handleClose();
    } catch (err) {
      console.error('Error saving entry:', err);
      alert('اندراج محفوظ کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔');
    }
    setFormData(initialFormData);
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

          {
            !remainingPlusValue ?
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
                    max={formData.total}
                  />
                </div>
              </div>
              :
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label"> بقیہ رقم</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editingEntry?.remaining ?? 0}
                    readOnly
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">ادائیگی</label>
                  <input
                    type="number"
                    className="form-input"
                    onChange={(e) => handleChange('remainingPlus', e.target.value)}
                    placeholder="0"
                    min="0"
                    max={editingEntry?.remaining}
                  />
                </div>
              </div>
          }

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
