import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { isModalOpenAtomEx, editingEntryAtomEx, expensesAtom, selectedDateAtom } from '@/store/atoms';
import { updateEntryEx, addEntryEx, getExpenses, deleteEntryEx, renumberEntriesEx } from '@/db/indexedDB';

export default function EntryFormModalEx() {
    const [isOpen, setIsOpen] = useAtom(isModalOpenAtomEx);
    const [editingEntry, setEditingEntry] = useAtom(editingEntryAtomEx);
    const [selectedDate] = useAtom(selectedDateAtom);
    const [, setExpenses] = useAtom(expensesAtom);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        amount: '',
    });

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
                await updateEntryEx({
                    ...entryData,
                    id: editingEntry.id,
                    serialNo: editingEntry.serialNo,
                });
            } else {
                const expenses = await getExpenses();

                const nextSerial =
                    expenses.length === 0
                        ? 1
                        : Math.max(...expenses.map(e => e.serialNo)) + 1;

                await addEntryEx({
                    ...entryData,
                    serialNo: nextSerial,
                });
            }

            const updated = await getExpenses();
            setExpenses(updated);
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
            await deleteEntryEx(editingEntry.id);
            await renumberEntriesEx(selectedDate);
            const updated = await getExpenses();
            setExpenses(updated);
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
                        <label className="form-label">تفصیل</label>
                        <input
                            type="text"
                            className="form-input"
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            placeholder="تفصیل درج کریں"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">رقم</label>
                        <input
                            type="number"
                            className="form-input"
                            value={formData.amount}
                            onChange={(e) => handleChange('amount', e.target.value)}
                            placeholder="رقم درج کریں"
                            required
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
