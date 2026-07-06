import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { entriesAtom, selectedDateAtom, isModalOpenAtom, editingEntryAtom, remainingPlusAtom, alertAtom, alertMessageAtom, alertTypeAtom } from '@/store/atoms';
import { addEntry, updateEntry, getEntriesByDate, getAllEntries } from '@/db/indexedDB';

interface Props {
  isRemaining: Boolean
}

const initialFormData = {
  name: '',
  mobileNumber: '',
  total: '',
  advance: '',
  remaining: '',
  remainingPlus: '',
  note: '',
};

export default function EntryFormModal({ isRemaining }: Props) {
  const [isOpen, setIsOpen] = useAtom(isModalOpenAtom);
  const [editingEntry, setEditingEntry] = useAtom(editingEntryAtom);
  const [selectedDate] = useAtom(selectedDateAtom);
  const [, setEntries] = useAtom(entriesAtom);
  const [remainingPlusValue,] = useAtom(remainingPlusAtom);
  const [formData, setFormData] = useState(initialFormData);
  const [, setAlert] = useAtom(alertAtom);
  const [, setType] = useAtom(alertTypeAtom);
  const [, setMessage] = useAtom(alertMessageAtom);

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

  const handleClose = () => {
    setIsOpen(false);
    setEditingEntry(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setEditingEntry(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setIsOpen, setEditingEntry]);

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

        setType('success');
        setMessage('اندراج میں ترمیم کر دی گئی۔');

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

          setType('success');
          setMessage('اندراج میں ترمیم کر دی گئی۔');

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

            debtId: editingEntry.debtId,
          });
        }

        setType('success');
        setMessage('اندراج میں ترمیم کر دی گئی۔');
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
          debtId: crypto.randomUUID(),
        });

        setType('success');
        setMessage('اندراج محفوظ کر دیا گیا ہے۔');
      }

      const updated = isRemaining ? await getAllEntries() : await getEntriesByDate(selectedDate);
      setEntries(updated);
      handleClose();

    } catch (err) {
      setType('error');
      setMessage(err instanceof Error ? err.message : editingEntry?.id ? 'اندراج محفوظ کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔' : 'اندراج شامل کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔');
    }
    setFormData(initialFormData);

    setAlert(true);

    setTimeout(() => {
      setAlert(false);
    }, 3000);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            {editingEntry ? 'اندراج میں ترمیم کریں' : 'نیا اندراج'}
          </h2>
          <button type="button" className="modal-close" onClick={handleClose} aria-label="Close Modal">
            <X />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name" className="form-label">نام</label>
            <input
              type="text"
              aria-label="Customer Name"
              id="name"
              className="form-input"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="گاہک کا نام"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="mobileNumber">
              موبائل نمبر
            </label>
            <input
              type="tel"
              aria-label="Customer Mobile Number"
              id="mobileNumber"
              className="form-input"
              pattern="[0-9]{4}-[0-9]{7}"
              value={formData.mobileNumber}
              onChange={(e) => handleChange('mobileNumber', e.target.value)}
              placeholder="0300-1234567"
            />
          </div>

          {
            !remainingPlusValue ?
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="total">
                    کل رقم
                  </label>
                  <input
                    type="number"
                    aria-label="Total Amount"
                    id="total"
                    className="form-input"
                    value={formData.total}
                    onChange={(e) => handleChange('total', e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="advance">
                    ادائیگی
                  </label>
                  <input
                    type="number"
                    aria-label="Advance Payment"
                    id="advance"
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
                  <label className="form-label" htmlFor="remaining">
                    بقیہ رقم
                  </label>
                  <input
                    type="number"
                    aria-label="Remaining Amount"
                    id="remaining"
                    className="form-input"
                    value={editingEntry?.remaining ?? 0}
                    readOnly
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="remainingPlus">
                    ادائیگی
                  </label>
                  <input
                    type="number"
                    aria-label="Additional Payment"
                    id="remainingPlus"
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
            <label className="form-label" htmlFor="note">
              نوٹ
            </label>
            <input
              type="text"
              aria-label="Additional Note"
              id="note"
              className="form-input"
              value={formData.note}
              onChange={(e) => handleChange('note', e.target.value)}
              placeholder="اضافی نوٹ"
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={handleClose} aria-label="Cancel">
              منسوخ
            </button>
            <button disabled={isDisabled} type="submit" className={`btn ${isDisabled ? 'btn-disabled' : 'btn-primary'}`} aria-label={editingEntry ? 'Save Changes' : 'Add Entry'}>
              {editingEntry ? 'محفوظ کریں' : 'شامل کریں'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
