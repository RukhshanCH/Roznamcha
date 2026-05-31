import { useEffect, useState } from "react";
import { getWeeklyStats } from "@/db/indexedDB";
import "../styles/dashboard.css";

type Stat = {
  date: string;
  count: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<Stat[]>([]);

  useEffect(() => {
    getWeeklyStats().then(setData);
  }, []);

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const maxDay = data.reduce(
    (max, d) => (d.count > max.count ? d : max),
    data[0] || { date: "", count: 0 }
  );

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
        ڈیش بورڈ
      </h1>
      <h2 style={{ textAlign: "right", color: "var(--accent-green)" }}>ہفتہ وار تجزیات</h2>
      
      <div className="dashboard-container">
        {/* Summary Cards */}
          <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
            <div> کل اندراجات: <br /> <span style={{color: "var(--badge-red)"}}>{total}</span></div>
            <div> سب سے زیادہ فعال دن: <br /> <span style={{color: "var(--accent-gold)"}}>{maxDay.date}</span></div>
          </div>

          {/* Simple Bar Chart */}
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
            {data.map((d) => (
              <div key={d.date} style={{ textAlign: "center" }}>
                <div
                  style={{
                    height: `${d.count * 20}px`,
                    width: "30px",
                    background: "black",
                    marginBottom: "5px",
                  }}
                />
                <small style={{color: "var(--accent-blue)"}}>{d.count}</small>
              </div>
            ))}
          </div>
      </div>
    </div>

  );
}