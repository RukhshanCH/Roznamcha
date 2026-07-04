import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { isModalOpenAtomEx, editingEntryAtomEx, expensesAtom, selectedDateAtom, alertAtom, alertMessageAtom, alertTypeAtom } from '@/store/atoms';
import { updateEntryEx, addEntryEx, getEntriesByDateEx } from '@/db/indexedDB';

const initialFormData = {
    name: '',
    description: '',
    amount: '',
};

export default function EntryFormModalEx() {
    const [isOpen, setIsOpen] = useAtom(isModalOpenAtomEx);
    const [editingEntry, setEditingEntry] = useAtom(editingEntryAtomEx);
    const [selectedDate] = useAtom(selectedDateAtom);
    const [, setExpenses] = useAtom(expensesAtom);
    const [formData, setFormData] = useState(initialFormData);
    const [, setType] = useAtom(alertTypeAtom);
    const [, setMessage] = useAtom(alertMessageAtom);
    const [, setAlert] = useAtom(alertAtom);

    useEffect(() => {
        if (editingEntry) {
            setFormData({
                name: editingEntry.name || '',
                description: editingEntry.description || '',
                amount: editingEntry.amount != null ? String(editingEntry.amount) : '',
            });
        } else {
            setFormData({
                name: '',
                description: '',
                amount: '',
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

        const entryData = {
            name: formData.name,
            description: formData.description,
            amount: parseFloat(formData.amount) || 0,
            date: editingEntry?.date ?? selectedDate,
            createdAt: editingEntry?.createdAt || Date.now(),
        };

        try {
            if (editingEntry?.id) {
                await updateEntryEx({
                    ...entryData,
                    id: editingEntry.id,
                    serialNo: editingEntry.serialNo,
                });

                setType('success');
                setMessage('اندراج میں ترمیم کر دی گئی۔');
            } else {
                const entriesForDate = await getEntriesByDateEx(selectedDate);

                const nextSerial =
                    entriesForDate.length === 0
                        ? 1
                        : Math.max(...entriesForDate.map(e => e.serialNo)) + 1;

                await addEntryEx({
                    ...entryData,
                    serialNo: nextSerial,
                });

                setType('success');
                setMessage('نیا اندراج شامل کر دیا گیا ہے۔');
            }

            const updated = await getEntriesByDateEx(selectedDate);
            setExpenses(updated);
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
                    <button type="button" className="modal-close" onClick={handleClose}>
                        <X />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="nameEx" className="form-label">نام</label>
                        <input
                            type="text"
                            className="form-input"
                            aria-label="Customer Name"
                            id="nameEx"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            placeholder="گاہک کا نام"
                            autoFocus
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="descriptionEx" className="form-label">تفصیل</label>
                        <input
                            type="text"
                            className="form-input"
                            aria-label="Description"
                            id="descriptionEx"
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            placeholder="تفصیل درج کریں"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="amountEx" className="form-label">رقم</label>
                        <input
                            type="number"
                            className="form-input"
                            aria-label="Amount"
                            id="amountEx"
                            value={formData.amount}
                            onChange={(e) => handleChange('amount', e.target.value)}
                            placeholder="رقم درج کریں"
                            required
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleClose} aria-label="Cancel">
                            منسوخ
                        </button>
                        <button type="submit" className="btn btn-primary" aria-label={editingEntry ? 'Save Changes' : 'Add Entry'}>
                            {editingEntry ? 'محفوظ کریں' : 'شامل کریں'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
