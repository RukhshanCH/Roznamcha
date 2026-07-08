import React, { useState, useCallback, useRef, useEffect } from "react";
import Logo from "../assets/Logo.png";
import {
  generateInvoiceNumber,
  initDB,
  saveInvoiceCounter,
} from "@/db/indexedDB";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface FlexOption {
  value: string;
  label: string;
  price: number;
}

interface FlexGroup {
  group: string;
  options: FlexOption[];
}

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  measure1: number;
  measure2: number;
}

interface NextInvoice {
  invoiceNo: string;
  date: string;
  sequence: number;
}

// ═══════════════════════════════════════════════════════════════
// DATA & CONFIG
// ═══════════════════════════════════════════════════════════════

const FLEX_GROUPS: FlexGroup[] = [
  {
    group: "China Flex",
    options: [
      { value: "china-200", label: "200 gram", price: 22 },
      { value: "china-220", label: "220 gram", price: 25 },
      { value: "china-240", label: "240 gram", price: 30 },
    ],
  },
  {
    group: "Star Flex",
    options: [
      { value: "star-300", label: "300 gram", price: 40 },
      { value: "star-350", label: "350 gram", price: 50 },
      { value: "star-400", label: "400 gram", price: 70 },
    ],
  },
  {
    group: "Others",
    options: [
      { value: "One Way Vision", label: "One Way Vision", price: 150 },
      { value: "Vinyl", label: "Vinyl", price: 150 },
      { value: "Back Light", label: "Back Light", price: 150 },
      { value: "Reflector", label: "Reflector", price: 150 },
    ],
  },
];

const PRICE_MAP: Record<string, number> = {};
FLEX_GROUPS.forEach((g) =>
  g.options.forEach((o) => (PRICE_MAP[o.value] = o.price))
);

const DEFAULT_FLEX = "china-220";

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const Invoice: React.FC = () => {
  const pdfRef = useRef<HTMLDivElement>(null);

  // ── Invoice number lifecycle ───────────────────────────────
  const [nextInvoice, setNextInvoice] = useState<NextInvoice | null>(null);
  const [invoiceNo, setInvoiceNo] = useState<string>("");

  useEffect(() => {
    initDB().then(() =>
      generateInvoiceNumber().then((n) => {
        setNextInvoice(n);
        setInvoiceNo(n.invoiceNo);
      })
    );
  }, []);

  const refreshInvoiceNumber = useCallback(async () => {
    const n = await generateInvoiceNumber();
    setNextInvoice(n);
    setInvoiceNo(n.invoiceNo);
    return n;
  }, []);

  // ── Header state ───────────────────────────────────────────
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  const todayStr = today.toISOString().split("T")[0];

  const [issueDate, setIssueDate] = useState<string>(todayStr);
  const [clientName, setClientName] = useState<string>("");
  const [contactNo, setContactNo] = useState<string>("");
  const [designing, setDesigning] = useState<string>("0");
  const [paid, setPaid] = useState<string>("0");

  // ── Items state ────────────────────────────────────────────
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: 1,
      description: DEFAULT_FLEX,
      quantity: 1,
      unitPrice: PRICE_MAP[DEFAULT_FLEX],
      measure1: 0,
      measure2: 0,
    },
  ]);
  const [nextId, setNextId] = useState<number>(2);

  // ── Derived totals ─────────────────────────────────────────
  const calculateRowAmount = useCallback((item: InvoiceItem): number => {
    const area = item.measure1 * item.measure2;
    return item.unitPrice * item.quantity * area;
  }, []);

  const grandTotal = items.reduce(
    (sum, item) => sum + calculateRowAmount(item),
    0
  );
  const TotalSum = Number(grandTotal) + Number(designing);
  const Remaining = Number(TotalSum) - Number(paid);

  // ── Handlers ───────────────────────────────────────────────
  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: nextId,
        description: DEFAULT_FLEX,
        quantity: 1,
        unitPrice: PRICE_MAP[DEFAULT_FLEX],
        measure1: 0,
        measure2: 0,
      },
    ]);
    setNextId((prev) => prev + 1);
  };

  const deleteRow = (id: number) => {
    setItems((prev) => {
      if (prev.length <= 1) {
        return [
          {
            id: prev[0].id,
            description: DEFAULT_FLEX,
            quantity: 0,
            unitPrice: PRICE_MAP[DEFAULT_FLEX],
            measure1: 0,
            measure2: 0,
          },
        ];
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const updateItem = (
    id: number,
    field: keyof InvoiceItem,
    rawValue: string
  ) => {
    let value: string | number = rawValue;
    if (field !== "description") {
      value = parseFloat(rawValue) || 0;
      if (value < 0) value = 0;
    }

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value } as InvoiceItem;
        if (field === "description") {
          updated.unitPrice = PRICE_MAP[value as string] ?? 0;
        }
        return updated;
      })
    );
  };

  const handleReset = useCallback(() => {
    setItems([
      {
        id: nextId,
        description: DEFAULT_FLEX,
        quantity: 1,
        unitPrice: PRICE_MAP[DEFAULT_FLEX],
        measure1: 0,
        measure2: 0,
      },
    ]);
    setNextId((prev) => prev + 1);
    setIssueDate(todayStr);
    setClientName("");
    setContactNo("");
    setDesigning("0");
    setPaid("0");
  }, [nextId, todayStr]);

  const handlePrint = () => window.print();

  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!pdfRef.current) return;

    // Ensure we have a fresh invoice number
    const next = nextInvoice || (await refreshInvoiceNumber());
    await saveInvoiceCounter(next.date, next.sequence);
    setInvoiceNo(next.invoiceNo);

    setDownloading(true);

    try {
      // 1. Clone the invoice node
      const clone = pdfRef.current.cloneNode(true) as HTMLElement;

      // 2. Strip any stray buttons (safety)
      clone.querySelectorAll("button").forEach((b) => b.remove());

      // 3. Convert inputs & selects → plain text
      clone
        .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")
        .forEach((el) => {
          const textDiv = document.createElement("div");

          if (el instanceof HTMLSelectElement) {
            textDiv.textContent =
              el.options[el.selectedIndex]?.text.trim() || el.value;
          } else {
            textDiv.textContent = el.value;
          }

          // Copy only typographic styles
          const computed = window.getComputedStyle(el);
          textDiv.style.fontFamily = computed.fontFamily;
          textDiv.style.fontSize = computed.fontSize;
          textDiv.style.fontWeight = computed.fontWeight;
          textDiv.style.color = "#000";
          textDiv.style.textAlign = computed.textAlign;
          textDiv.style.lineHeight = computed.lineHeight;

          // Remove input chrome
          textDiv.style.border = "none";
          textDiv.style.background = "transparent";
          textDiv.style.outline = "none";
          textDiv.style.boxShadow = "none";
          textDiv.style.padding = "2px 0";
          textDiv.style.margin = "0";
          textDiv.style.display = "block";
          textDiv.style.width = "100%";
          textDiv.style.boxSizing = "border-box";

          if (el.parentNode) {
            el.parentNode.replaceChild(textDiv, el);
          }
        });

      // 4. Mount off-screen
      clone.style.position = "absolute";
      clone.style.left = "-9999px";
      clone.style.top = "0";
      clone.style.width = `${pdfRef.current.offsetWidth}px`;
      clone.style.margin = "0";
      document.body.appendChild(clone);

      // 5. Wait for layout
      await document.fonts.ready;
      await new Promise<void>((r) => setTimeout(r, 150));

      // 6. Capture
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#F5F0E8",
        logging: false,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight,
      });

      // 7. Cleanup clone immediately
      if (document.body.contains(clone)) {
        document.body.removeChild(clone);
      }

      // 8. Build PDF
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      const totalPages = Math.ceil(imgHeight / pdfHeight);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        const offset = -(i * pdfHeight);
        pdf.addImage(imgData, "PNG", 0, offset, pdfWidth, imgHeight);
      }

      pdf.save(`Invoice__${next.invoiceNo}.pdf`);
    } catch (error: unknown) {
      console.error("PDF Error:", error);
      alert(
        error instanceof Error
          ? error.message
          : "PDF ڈاؤن لوڈ کرنے میں خرابی۔ براہ کرم دوبارہ کوشش کریں۔"
      );
    } finally {
      setDownloading(false);
      handleReset();
      refreshInvoiceNumber();
    }
  }, [nextInvoice, refreshInvoiceNumber, handleReset]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div dir="ltr" className="invoice-wrapper">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* INVOICE CONTENT ONLY — html2canvas captures this ref    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div dir="ltr" className="invoice-container" ref={pdfRef}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div className="logo">
            <img src={Logo} alt="Al-Jannat Flex" />
          </div>
          <div>
            <h1 className="invoice">INVOICE</h1>
          </div>
        </div>

        {/* Header Bar */}
        <div className="header-bar-in">
          <div>
            INVOICE NO.
            <input type="text" value={invoiceNo} readOnly />
          </div>
          <div>
            ISSUE DATE
            <input
              type="text"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
        </div>

        {/* Addresses */}
        <div className="addresses">
          <div className="address-box">
            <h3>NAME</h3>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Enter client name"
            />
          </div>
          <div className="address-box">
            <h3>CONTACT NO.</h3>
            <input
              type="text"
              value={contactNo}
              onChange={(e) => setContactNo(e.target.value)}
              placeholder="Enter contact number"
            />
          </div>
        </div>

        {/* Items Table */}
        <table>
          <thead>
            <tr>
              <th>DESCRIPTION</th>
              <th className="qty-col">QUANTITY</th>
              <th className="price-col">UNIT PRICE</th>
              <th className="price-col">MEASUREMENTS</th>
              <th className="amount-col">AMOUNT</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <select
                    value={item.description}
                    onChange={(e) =>
                      updateItem(item.id, "description", e.target.value)
                    }
                  >
                    {FLEX_GROUPS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>

                <td className="qty-col">
                  <div className="qty">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.id, "quantity", e.target.value)
                      }
                    />
                    <span>pcs</span>
                  </div>
                </td>

                <td className="price-col">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(item.id, "unitPrice", e.target.value)
                    }
                    tabIndex={-1}
                    style={{ cursor: "default", color: "#666" }}
                  />
                </td>

                <td className="price-col">
                  <div className="measure-cell">
                    <div className="measure-row">
                      <svg
                        className="measure-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="6" y="4" width="12" height="16" rx="2" />
                      </svg>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="H"
                        value={item.measure1 || ""}
                        onChange={(e) =>
                          updateItem(item.id, "measure1", e.target.value)
                        }
                      />
                    </div>
                    <div className="measure-row">
                      <svg
                        className="measure-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="4" y="6" width="16" height="12" rx="2" />
                      </svg>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="W"
                        value={item.measure2 || ""}
                        onChange={(e) =>
                          updateItem(item.id, "measure2", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </td>

                <td className="amount-col">
                  <input
                    type="number"
                    value={calculateRowAmount(item).toFixed(2)}
                    readOnly
                    tabIndex={-1}
                  />
                </td>

                <td>
                  <button
                    className="delete-btn"
                    onClick={() => deleteRow(item.id)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="add-row-btn" onClick={addRow}>
          + Add Item
        </button>

        {/* Summary */}
        <div className="summary">
          <div className="summary-row">
            <span>SubTotal (Rs.):</span>
            <input type="number" value={grandTotal} readOnly tabIndex={-1} />
          </div>
          <div className="summary-row">
            <span>Designing (Rs.):</span>
            <input
              type="number"
              value={designing}
              tabIndex={-1}
              onChange={(e) => setDesigning(e.target.value)}
            />
          </div>
        </div>

        <div className="summary">
          <div className="summary-row total">
            <span>Total (Rs.):</span>
            <input
              type="number"
              value={TotalSum.toFixed(2)}
              readOnly
              tabIndex={-1}
            />
          </div>
          <div className="summary-row">
            <span>Paid (Rs.):</span>
            <input
              type="number"
              value={paid}
              tabIndex={-1}
              onChange={(e) => setPaid(e.target.value)}
            />
          </div>
          <div className="summary-row total">
            <span>Remaining (Rs.):</span>
            <input
              type="number"
              value={Remaining.toFixed(2)}
              readOnly
              tabIndex={-1}
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ACTION BUTTONS — OUTSIDE pdfRef, never captured         */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="actions no-print">
        <button className="btn-print" onClick={handlePrint}>
          Print / Save PDF
        </button>
        <button
          className="btn-print"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? "Generating PDF..." : "Download PDF"}
        </button>
        <button className="btn-reset" onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  );
};

export default Invoice;