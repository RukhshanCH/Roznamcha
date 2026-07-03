import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { isModalOpenAtomPy, editingEntryAtomPy, paymentsAtom, selectedDateAtom } from '@/store/atoms';
import { updateEntryPy, addEntryPy, deleteEntryPy, renumberEntriesPy, getEntriesByDatePy } from '@/db/indexedDB';

const initialFormData = {
    name: '',
    description: '',
    amount: '',
};

export default function EntryFormModalPy() {
    const [isOpen, setIsOpen] = useAtom(isModalOpenAtomPy);
    const [editingEntry, setEditingEntry] = useAtom(editingEntryAtomPy);
    const [selectedDate] = useAtom(selectedDateAtom);
    const [, setPayments] = useAtom(paymentsAtom);
    const [formData, setFormData] = useState(initialFormData);

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
    }, [editingEntry, setFormData]);

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
            date: selectedDate,
            createdAt: editingEntry?.createdAt || Date.now(),
        };

        try {
            if (editingEntry?.id) {
                await updateEntryPy({
                    ...entryData,
                    id: editingEntry.id,
                    serialNo: editingEntry.serialNo,
                });
            } else {
                const entriesForDate = await getEntriesByDatePy(selectedDate);

                const nextSerial =
                    entriesForDate.length === 0
                        ? 1
                        : Math.max(...entriesForDate.map(e => e.serialNo)) + 1;

                await addEntryPy({
                    ...entryData,
                    serialNo: nextSerial,
                });
            }

            const updated = await getEntriesByDatePy(selectedDate);
            setPayments(updated);
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
            await deleteEntryPy(editingEntry.id);
            await renumberEntriesPy(selectedDate);
            const updated = await getEntriesByDatePy(selectedDate);
            setPayments(updated);
            handleClose();
        } catch (err) {
            console.error('Error deleting entry:', err);
        }
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
                        <label htmlFor="namePy" className="form-label">نام</label>
                        <input
                            type="text"
                            aria-label="Customer Name"
                            id="namePy"
                            className="form-input"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            placeholder="گاہک کا نام"
                            autoFocus
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="descriptionPy" className="form-label">تفصیل</label>
                        <input
                            type="text"
                            aria-label="Description"
                            id="descriptionPy"
                            className="form-input"
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            placeholder="تفصیل درج کریں"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="amountPy" className="form-label">رقم</label>
                        <input
                            type="number"
                            aria-label="Amount"
                            id="amountPy"
                            className="form-input"
                            value={formData.amount}
                            onChange={(e) => handleChange('amount', e.target.value)}
                            placeholder="رقم درج کریں"
                            required
                        />
                    </div>

                    <div className="form-actions">
                        {editingEntry && (
                            <button type="button" className="btn btn-secondary" onClick={handleDelete} aria-label="Delete Entry">
                                حذف کریں
                            </button>
                        )}
                        <button type="button" className="btn btn-secondary" onClick={handleClose} aria-label="Cancel">
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
