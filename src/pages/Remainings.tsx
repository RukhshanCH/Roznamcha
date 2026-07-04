import { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { Printer, FileDown, Share2 } from 'lucide-react';
import TransactionTable from '@/components/ui/TransactionTable';
import { alertAtom, alertMessageAtom, alertTypeAtom, editingEntryAtom, entriesAtom, searchAtom, selectedDateAtom } from '@/store/atoms';
import { deleteEntry, getAllEntries, renumberEntries } from '@/db/indexedDB';
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import EntryFormModal from '@/components/ui/EntryFormModal';
import Modal from '@/components/ui/Modal';
import AlertItem from '@/components/ui/AlertItem';

export default function Remainings() {
    const [entries, setEntries] = useAtom(entriesAtom);
    const pdfRef = useRef<HTMLTableElement | null>(null);
    const search = useAtomValue(searchAtom);
    const [selectedDate,] = useAtom(selectedDateAtom);
    const editingEntry = useAtomValue(editingEntryAtom);
    const [, setAlert] = useAtom(alertAtom);
    const [type, setType] = useAtom(alertTypeAtom);
    const [message, setMessage] = useAtom(alertMessageAtom);

    const filteredRemainings = entries.filter((e) => {

        const matchesSearch =
            e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.mobileNumber.includes(search);

        return Number(e.remaining) > 0 && matchesSearch && !e.note.includes("Dated");
    });

    // Load data
    useEffect(() => {
        const loadData = async () => {
            const allData = await getAllEntries();
            setEntries(allData);
        };
        void loadData();
    }, [setEntries]);

    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    const downloadPDF = async () => {
        if (!pdfRef.current) return;

        const canvas = await html2canvas(pdfRef.current, {
            scale: window.devicePixelRatio > 1 ? 2 : 1,
            useCORS: true,
            backgroundColor: "#F5F0E8",
        });

        const imgData = canvas.toDataURL("image/png");

        const pdf = new jsPDF("p", "mm", "a4");

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
            position = heightLeft - imgHeight;

            pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);

            heightLeft -= pdfHeight;
        }

        pdf.save("بقیہ جات.pdf");
    };

    const handleSharePDF = async () => {
        if (!pdfRef.current) return;

        const canvas = await html2canvas(pdfRef.current, {
            scale: window.devicePixelRatio > 1 ? 2 : 1,
            useCORS: true,
            backgroundColor: "#F5F0E8",
        });

        const imgData = canvas.toDataURL("image/png");

        const pdf = new jsPDF("p", "mm", "a4");

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
            position = heightLeft - imgHeight;

            pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);

            heightLeft -= pdfHeight;
        }

        const pdfBlob = pdf.output("blob");
        const file = new File([pdfBlob], "Remainings.pdf", {
            type: "application/pdf",
        });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: "Remainings",
                files: [file],
            });
        } else {
            pdf.save("بقیہ جات.pdf");
        }
    };

    const handleDelete = async () => {
        if (!editingEntry?.id) return;

        try {
            await deleteEntry(editingEntry.id);
            await renumberEntries(selectedDate);

            const updated = await getAllEntries();
            setEntries(updated);
            setType("success");
            setMessage("اندراج حذف کر دیا گیا ہے۔");
        } catch (err) {
            setType("error");
            setMessage("اندراج حذف کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔");
        }

        setAlert(true);

        setTimeout(() => {
            setAlert(false);
        }, 3000);
    };

    return (
        <div>

            <AlertItem message={message} type={type as 'success' | 'error' | 'info'} />

            <Modal
                title="کیا آپ واقعی اس اندراج کو حذف کرنا چاہتے ہیں؟"
                submitText="حذف کریں"
                handleSubmit={() => handleDelete()}
                type="button"
                aria-label="Delete Entry"
            />

            <h1 className="page-title">بقیہ جات</h1>
            {/* Page Title Section */}
            <div className="page-title-section">
                <div className="page-title-left">
                    <div className="breadcrumb">
                        <Link to="/dashboard">ڈیش بورڈ</Link>
                        {' / روزنامچہ رجسٹر'}
                    </div>
                </div>
                <div className="page-title-right">
                    <button type="button" aria-label="Print" className="print-btn" onClick={handlePrint}>
                        <Printer />
                        <span>پرنٹ کریں</span>
                    </button>
                </div>
            </div>

            {/* Add Entry Button */}
            <div className="actions-section" style={{ paddingBottom: "10px" }}>
                <button
                    className="pdf-btn download-btn"
                    type="button"
                    aria-label="Download PDF"
                    onClick={() => downloadPDF()}
                >
                    <FileDown className="pdf-icon" size={18} />
                    <span className="tooltip">Download PDF</span>
                </button>

                <button
                    className="pdf-btn share-btn"
                    type="button"
                    aria-label="Share PDF"
                    onClick={() => handleSharePDF()}
                >
                    <Share2
                        className="pdf-icon" size={18} />
                    <span className="tooltip">Share PDF</span>
                </button>
            </div>

            {/* Transaction Table */}
            <TransactionTable ref={pdfRef} transactions={filteredRemainings} pageName={"بقیہ جات"} isRemaining={true} />

            {/* Entry Form Modal */}
            <EntryFormModal isRemaining={true} />
        </div>
    );
}
