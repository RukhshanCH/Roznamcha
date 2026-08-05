import { useEffect, useState } from "react";
import { getWeeklyStats } from "@/db/indexedDB";
import "../styles/dashboard.css";

type Stat = {
  date: string;
  count: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<Stat[]>([]);
  const [BarComponent, setBarComponent] = useState<any>(null);

  useEffect(() => {
    getWeeklyStats().then(setData);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadChart = async () => {
      await import("chart.js/auto");
      const { Bar } = await import("react-chartjs-2");
      if (!cancelled) {
        setBarComponent(() => Bar);
      }
    };

    void loadChart();

    return () => {
      cancelled = true;
    };
  }, []);

  const total = data.reduce((sum, d) => sum + d.count, 0);

  const maxDay = data.reduce(
    (max, d) => (d.count > max.count ? d : max),
    data[0] || { date: "", count: 0 }
  );

  const chartData = {
    labels: data.map((d) =>
      new Date(d.date).toLocaleDateString("ur-PK", {
        weekday: "short",
      })
    ),

    datasets: [
      {
        label: "اندراجات",
        data: data.map((d) => d.count),
        backgroundColor: "rgba(0, 123, 255, 0.7)",
        borderRadius: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: "#000",
        },
      },
      title: {
        display: true,
        text: "ہفتہ وار اندراجات",
        color: "#000",
        font: {
          size: 18,
        },
      },
    },

    scales: {
      x: {
        ticks: {
          color: "#000",
        },
        grid: {
          color: "#000",
        },
      },

      y: {
        beginAtZero: true,
        ticks: {
          color: "#000",
        },
        grid: {
          color: "#000",
        },
      },
    },
  };

  return (
    <div
      style={{
        padding: "40px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-primary)",
          fontSize: "2rem",
          marginBottom: "16px",
        }}
      >
        ڈیش بورڈ
      </h1>

      <h2
        style={{
          textAlign: "right",
          color: "var(--accent-green)",
        }}
      >
        ہفتہ وار تجزیات
      </h2>

      <div className="dashboard-container">
        {/* Summary Cards */}
        <div
          style={{
            display: "flex",
            gap: "20px",
            marginBottom: "30px",
            justifyContent: "center",
          }}
        >
          <div className="dashboard-card">
            کل اندراجات
            <br />
            <span style={{ color: "var(--badge-red)" }}>
              {total}
            </span>
          </div>

          <div className="dashboard-card">
            سب سے زیادہ فعال دن
            <br />
            <span style={{ color: "var(--accent-gold)" }}>
              {maxDay.date}
            </span>
          </div>
        </div>

        {/* Chart */}
        <div
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            color: "#000"
          }}
        >
          {BarComponent ? (
            <BarComponent data={chartData} options={options} />
          ) : (
            <div style={{ padding: "2rem", color: "#4b5563" }}>
              بار چارٹ لوڈ ہو رہا ہے...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}