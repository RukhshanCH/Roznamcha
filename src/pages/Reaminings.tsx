import { useEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { Printer, FileDown, Share2 } from 'lucide-react';
import TransactionTable from '@/components/ui/TransactionTable';
import { entriesAtom, searchAtom } from '@/store/atoms';
import { getAllEntries, initDB } from '@/db/indexedDB';
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import EntryFormModal from '@/components/ui/EntryFormModal';

export default function Remainings() {
    const [entries, setEntries] = useAtom(entriesAtom);
    const [dbReady, setDbReady] = useState(false);
    const pdfRef = useRef<HTMLTableElement | null>(null);

    const search = useAtomValue(searchAtom);

    const filteredRemainings = entries.filter((e) => {

        const matchesSearch =
            e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.mobileNumber.includes(search);

        return Number(e.remaining) > 0 && matchesSearch;
    });

    // Initialize DB once
    useEffect(() => {
        async function setup() {
            try {
                await initDB();
                setDbReady(true);
            } catch (err) {
                console.error("Error initializing DB:", err);
            }
        }

        setup();
    }, []);

    // Load data
    const loadData = async () => {
        const allData = await getAllEntries();
        setEntries(allData);
    };

    useEffect(() => {
        if (!dbReady) return;
        loadData();
    }, [dbReady]);

    const handlePrint = () => {
        window.print();
    };

    const downloadPDF = async () => {
        if (!pdfRef.current) return;

        const canvas = await html2canvas(pdfRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/png");

        const pdf = new jsPDF("p", "mm", "a4");

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

        pdf.save("بقیہ جات.pdf");
    };

    const handleSharePDF = async () => {
        if (!pdfRef.current) return;

        const canvas = await html2canvas(pdfRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/png");

        const pdf = new jsPDF("p", "mm", "a4");

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

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

    return (
        <div>
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
                    <button className="print-btn" onClick={handlePrint}>
                        <Printer />
                        <span>پرنٹ کریں</span>
                    </button>
                </div>
            </div>

            {/* Add Entry Button */}
            <div className="actions-section" style={{paddingBottom: "10px"}}>
                <button
                    className="pdf-btn download-btn"
                    onClick={() => downloadPDF()}
                >
                    <FileDown className="pdf-icon" size={18} />
                    <span className="tooltip">Download PDF</span>
                </button>

                <button
                    className="pdf-btn share-btn"
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
