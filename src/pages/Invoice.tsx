import React, { useState, useCallback } from 'react';
import Logo from "../assets/Logo.png"
import { generateInvoiceNumber, initDB, saveInvoiceCounter } from '@/db/indexedDB';

// ── Invoice number ──────────────────────────────────────────
await initDB();
const next = await generateInvoiceNumber();

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
  measure1: number; // width / vertical
  measure2: number; // height / horizontal
}

// ═══════════════════════════════════════════════════════════════
// DATA & CONFIG
// ═══════════════════════════════════════════════════════════════

const FLEX_GROUPS: FlexGroup[] = [
  {
    group: 'China Flex',
    options: [
      { value: 'china-200', label: '200 gram', price: 22 },
      { value: 'china-220', label: '220 gram', price: 25 },
      { value: 'china-240', label: '240 gram', price: 30 },
    ],
  },
  {
    group: 'Star Flex',
    options: [
      { value: 'star-300', label: '300 gram', price: 40 },
      { value: 'star-350', label: '350 gram', price: 50 },
      { value: 'star-400', label: '400 gram', price: 70 },
    ],
  },
  {
    group: 'Others',
    options: [
      { value: 'One Way Vision', label: 'One Way Vision', price: 150 },
      { value: 'Vinyl', label: 'Vinyl', price: 150 },
      { value: 'Back Light', label: 'Back Light', price: 150 },
      { value: 'Reflector', label: 'Reflector', price: 150 },
    ],
  },
];

/** Map of flex value → unit price (Rs) */
const PRICE_MAP: Record<string, number> = {};
FLEX_GROUPS.forEach((g) => g.options.forEach((o) => (PRICE_MAP[o.value] = o.price)));

/** Default selection for new rows */
const DEFAULT_FLEX = 'china-220';

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const Invoice: React.FC = () => {

  const today = new Date();

  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());

  const todayStr = today.toISOString().split('T')[0];

  // ── Header state ───────────────────────────────────────────
  const [invoiceNo, setInvoiceNo] = useState<string>('0');
  const [issueDate, setIssueDate] = useState<string>(todayStr);
  const [clientName, setClientName] = useState<string>('');
  const [contactNo, setContactNo] = useState<string>('');
  const [designing, setDesigning] = useState<string>('0');
  const [paid, setPaid] = useState<string>('0');

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
    // Original logic: price × qty × (measure1 × measure2)
    const area = item.measure1 * item.measure2;
    return item.unitPrice * item.quantity * area;
  }, []);

  const grandTotal = items.reduce((sum, item) => sum + calculateRowAmount(item), 0);
  const TotalSum = Number(grandTotal) + Number(designing)
  const Remaining = Number(TotalSum) - Number(paid)

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
      // BUG FIX #4: Prevent empty table — keep at least one row
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

  const updateItem = (id: number, field: keyof InvoiceItem, rawValue: string) => {
    let value: string | number = rawValue;
    if (field !== 'description') {
      value = parseFloat(rawValue) || 0;
      if (value < 0) value = 0;
    }

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value } as InvoiceItem;

        // FEATURE: Auto-set unit price when description changes
        if (field === 'description') {
          updated.unitPrice = PRICE_MAP[value as string] ?? 0;
        }
        return updated;
      })
    );
  };

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    setInvoiceNo(next.invoiceNo);
    await saveInvoiceCounter(next.date, next.sequence);
    handleReset();
  }

  const handleReset = () => {
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
    setClientName('');
    setContactNo('');
    setDesigning('0');
    setPaid('0');
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div dir='ltr' className="invoice-wrapper">
      <div className="invoice-container">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {/* Logo */}
          <div className="logo">
            <img src={Logo} alt="Al-Jannat Flex" />
          </div>
          <div>
            <h1 className='invoice'>
              INVOICE
            </h1>
          </div>
        </div>

        {/* Header Bar */}
        <div className="header-bar-in">
          <div>
            INVOICE NO.
            <input
              type="text"
              value={invoiceNo}
              readOnly
            />
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
                {/* Description Select */}
                <td>
                  <select
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                  >
                    {FLEX_GROUPS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}&nbsp;&nbsp;&nbsp;&nbsp;
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>

                {/* Quantity */}
                <td className="qty-col">
                  <div className="qty">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                    />
                    <span>pcs</span>
                  </div>
                </td>

                {/* Unit Price (auto-set) */}
                <td className="price-col">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                    tabIndex={-1}
                    style={{ cursor: 'default', color: '#666' }}
                  />
                </td>

                {/* Measurements */}
                <td className="price-col">
                  <div className="measure-cell">
                    <div className="measure-row">
                      <svg className="measure-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="6" y="4" width="12" height="16" rx="2" />
                      </svg>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="H"
                        value={item.measure1 || ''}
                        onChange={(e) => updateItem(item.id, 'measure1', e.target.value)}
                      />
                    </div>
                    <div className="measure-row">
                      <svg className="measure-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="6" width="16" height="12" rx="2" />
                      </svg>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="W"
                        value={item.measure2 || ''}
                        onChange={(e) => updateItem(item.id, 'measure2', e.target.value)}
                      />
                    </div>
                  </div>
                </td>

                {/* Amount */}
                <td className="amount-col">
                  <input
                    type="number"
                    value={calculateRowAmount(item).toFixed(2)}
                    readOnly
                    tabIndex={-1}
                  />
                </td>

                {/* Delete */}
                <td>
                  <button className="delete-btn" onClick={() => deleteRow(item.id)}>
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
            <input type="number" value={designing} tabIndex={-1}
              onChange={(e) => setDesigning(e.target.value)} />
          </div>
        </div>

        <div className="summary">
          <div className="summary-row total">
            <span>Total (Rs.):</span>
            <input type="number" value={TotalSum.toFixed(2)} readOnly tabIndex={-1} />
          </div>
          <div className="summary-row">
            <span>Paid (Rs.):</span>
            <input type="number" value={paid} tabIndex={-1}
              onChange={(e) => setPaid(e.target.value)} />
          </div>
          <div className="summary-row total">
            <span>Remaining (Rs.):</span>
            <input type="number" value={Remaining.toFixed(2)} readOnly tabIndex={-1} />
          </div>
        </div>

        {/* Actions */}
        <div className="actions">
          <button className="btn-print" onClick={handlePrint}>
            Print / Save PDF
          </button>
          <button className="btn-print" onClick={handleDownload}>
            Download PDF
          </button>
          <button className="btn-reset" onClick={handleReset}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default Invoice;
