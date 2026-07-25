interface Props {
  companyName: string;
  selectedDate: string;
  summary: {
    totalPayments: string;
    totalAdvance: string;
    totalRemaining: string;
    totalExpense: string;
    remainingBalance: string;
    totalEntries: string;
  };
  transactions: Array<{
    id?: number;
    name: string;
    mobileNumber?: string;
    note?: string;
    total?: number;
    advance?: number;
    remaining?: number | string;
  }>;
  expenses: Array<{
    name: string;
    description?: string;
    amount?: number;
  }>;
}

export default function PrintableRoznamcha({
  companyName,
  selectedDate,
  summary,
  transactions,
  expenses,
}: Props) {
  return (
    <div
      style={{
        width: "100%",
        padding: "40px",
        backgroundColor: "#F5F0E8",
        fontFamily: "'UrduPrintFont', 'Jameel Noori Nastaleeq', Tahoma, sans-serif",
        direction: "rtl",
        textAlign: "right",
        color: "#3E2723",
        lineHeight: 1.8,
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .print-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .print-table th {
          background: #8B7355;
          color: white;
          padding: 8px;
          font-size: 13px;
          border: 1px solid #6D5A44;
        }
        .print-table td {
          padding: 8px;
          border: 1px solid #D7CCC8;
          font-size: 12px;
          background: white;
        }
        .print-table tr:nth-child(even) td {
          background: #FAF7F2;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 24px;
        }
        .summary-card {
          background: white;
          border: 1px solid #D7CCC8;
          border-top: 3px solid;
          padding: 10px;
          border-radius: 4px;
        }
        .summary-label {
          font-size: 11px;
          color: #8B7355;
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 13px;
          color: #3E2723;
          font-weight: bold;
        }
      `}</style>

      <div style={{ textAlign: "center", borderBottom: "2px solid #8B7355", paddingBottom: 16, marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0, color: "#5D4037" }}>{companyName}</h1>
        <p style={{ fontSize: 16, margin: "6px 0 0", color: "#8B7355" }}>روزنامچہ رجسٹر</p>
        <p style={{ fontSize: 12, margin: "4px 0 0", color: "#666" }}>تاریخ: {selectedDate}</p>
      </div>

      <div style={{ fontSize: 14, marginBottom: 10, color: "#5D4037", background: "#E8E0D5", padding: "8px 12px", borderRadius: 4 }}>
        خلاصہ
      </div>
      <div className="summary-grid">
        <div className="summary-card" style={{ borderTopColor: "#3B82F6" }}>
          <div className="summary-label">تمام بل کا جمع</div>
          <div className="summary-value">{summary.totalPayments}</div>
        </div>
        <div className="summary-card" style={{ borderTopColor: "#22C55E" }}>
          <div className="summary-label">کل ادائیگی/ایڈوانس</div>
          <div className="summary-value">{summary.totalAdvance}</div>
        </div>
        <div className="summary-card" style={{ borderTopColor: "#EAB308" }}>
          <div className="summary-label">کل بقایا</div>
          <div className="summary-value">{summary.totalRemaining}</div>
        </div>
        <div className="summary-card" style={{ borderTopColor: "#6B7280" }}>
          <div className="summary-label">کل اندراجات</div>
          <div className="summary-value">{summary.totalEntries}</div>
        </div>
        <div className="summary-card" style={{ borderTopColor: "#EF4444" }}>
          <div className="summary-label">کل اخراجات</div>
          <div className="summary-value">{summary.totalExpense}</div>
        </div>
        <div className="summary-card" style={{ borderTopColor: "#A855F7" }}>
          <div className="summary-label">کل ادائیگی - کل اخراجات</div>
          <div className="summary-value">{summary.remainingBalance}</div>
        </div>
      </div>

      <div style={{ fontSize: 14, marginBottom: 10, color: "#5D4037", background: "#E8E0D5", padding: "8px 12px", borderRadius: 4 }}>
        روزنامچہ
      </div>
      <table className="print-table">
        <thead>
          <tr>
            <th>نمبر</th>
            <th>نام</th>
            <th>فون</th>
            <th>نوٹ</th>
            <th>کل بل</th>
            <th>ایڈوانس</th>
            <th>بقایا</th>
          </tr>
        </thead>
        <tbody>
          {transactions.length > 0 ? (
            transactions.map((t, i) => (
              <tr key={t.id ?? i}>
                <td>{i + 1}</td>
                <td>{t.name}</td>
                <td>{t.mobileNumber || '-'}</td>
                <td>{t.note || '-'}</td>
                <td>{(t.total || 0).toLocaleString('en-US')}/-</td>
                <td>{(t.advance || 0).toLocaleString('en-US')}/-</td>
                <td>{(Number(t.remaining) || 0).toLocaleString('en-US')}/-</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan={7} style={{ textAlign: "center" }}>کوئی اندراج نہیں</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ fontSize: 14, marginBottom: 10, color: "#5D4037", background: "#E8E0D5", padding: "8px 12px", borderRadius: 4 }}>
        اخراجات
      </div>
      <table className="print-table">
        <thead>
          <tr>
            <th>نمبر</th>
            <th>نام</th>
            <th>تفصیل</th>
            <th>رقم</th>
          </tr>
        </thead>
        <tbody>
          {expenses.length > 0 ? (
            expenses.map((e, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{e.name}</td>
                <td>{e.description || '-'}</td>
                <td>{(e.amount || 0).toLocaleString('en-US')}/-</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan={4} style={{ textAlign: "center" }}>کوئی خرچہ نہیں</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ textAlign: "center", fontSize: 10, color: "#999", marginTop: 30, borderTop: "1px solid #D7CCC8", paddingTop: 10 }}>
        کمپیوٹرائزڈ روزنامچہ سسٹم
      </div>
    </div>
  );
}