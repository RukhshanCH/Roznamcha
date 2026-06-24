import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { isModalOpenAtomCs, editingEntryAtomCs, customerAtom, selectedDateAtom } from '@/store/atoms';
import { updateEntryCs, addEntryCs, deleteEntryCs, renumberEntriesCs, getEntriesByDateCs } from '@/db/indexedDB';

export default function EntryFormModalCs() {
    const [isOpen, setIsOpen] = useAtom(isModalOpenAtomCs);
    const [editingEntry, setEditingEntry] = useAtom(editingEntryAtomCs);
    const [selectedDate] = useAtom(selectedDateAtom);
    const [, setCustomer] = useAtom(customerAtom);
    const [formData, setFormData] = useState({
        name: '',
        mobileNumber: '',
    });

    useEffect(() => {
        if (editingEntry) {
            setFormData({
                name: editingEntry.name || '',
                mobileNumber: editingEntry.mobileNumber || '',
            });
        } else {
            setFormData({
                name: '',
                mobileNumber: '',
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
            date: selectedDate,
            createdAt: editingEntry?.createdAt || Date.now(),
        };

        try {
            if (editingEntry?.id) {
                await updateEntryCs({
                    ...entryData,
                    id: editingEntry.id,
                    serialNo: editingEntry.serialNo,
                });
            } else {
                const entriesForDate = await getEntriesByDateCs(selectedDate);

                const nextSerial =
                    entriesForDate.length === 0
                        ? 1
                        : Math.max(...entriesForDate.map(e => e.serialNo)) + 1;

                await addEntryCs({
                    ...entryData,
                    serialNo: nextSerial,
                });
            }

            const updated = await getEntriesByDateCs(selectedDate);
            setCustomer(updated);
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
            await deleteEntryCs(editingEntry.id);
            await renumberEntriesCs(selectedDate);
            const updated = await getEntriesByDateCs(selectedDate);
            setCustomer(updated);
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
