import { useEffect, useState } from "react";
import { getWeeklyStats } from "@/db/indexedDB";
import "../styles/dashboard.css";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

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
          color: "#fff",
        },
        grid: {
          color: "#333",
        },
      },

      y: {
        beginAtZero: true,
        ticks: {
          color: "#fff",
        },
        grid: {
          color: "#333",
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
          }}
        >
          <Bar data={chartData} options={options} />
        </div>
      </div>
    </div>
  );
}