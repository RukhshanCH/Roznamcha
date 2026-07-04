import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { isModalOpenAtomCs, editingEntryAtomCs, customerAtom, selectedDateAtom } from '@/store/atoms';
import { updateEntryCs, addEntryCs, getCustomers } from '@/db/indexedDB';

const initialFormData = {
    name: '',
    mobileNumber: '',
};

export default function EntryFormModalCs() {
    const [isOpen, setIsOpen] = useAtom(isModalOpenAtomCs);
    const [editingEntry, setEditingEntry] = useAtom(editingEntryAtomCs);
    const [selectedDate] = useAtom(selectedDateAtom);
    const [, setCustomer] = useAtom(customerAtom);
    const [formData, setFormData] = useState(initialFormData);

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
                const entriesForDate = await getCustomers();

                const nextSerial =
                    entriesForDate.length === 0
                        ? 1
                        : Math.max(...entriesForDate.map(e => e.serialNo)) + 1;

                await addEntryCs({
                    ...entryData,
                    serialNo: nextSerial,
                });
            }

            const updated = await getCustomers();
            setCustomer(updated);
            handleClose();
        } catch (err) {
            console.error('Error saving entry:', err);
            alert('اندراج محفوظ کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔');
        }
        setFormData(initialFormData);
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
                    <button type="button" aria-label="Close" className="modal-close" onClick={handleClose}>
                        <X />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="nameCs" className="form-label">نام</label>
                        <input
                            type="text"
                            aria-label="Customer Name"
                            id="nameCs"
                            className="form-input"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            placeholder="گاہک کا نام"
                            autoFocus
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="mobileNumberCs" className="form-label">موبائل نمبر</label>
                        <input
                            type="tel"
                            aria-label="Customer Mobile Number"
                            pattern="[0-9]{4}-[0-9]{7}"
                            id="mobileNumberCs"
                            className="form-input"
                            value={formData.mobileNumber}
                            onChange={(e) => handleChange('mobileNumber', e.target.value)}
                            placeholder="0300-1234567"
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
