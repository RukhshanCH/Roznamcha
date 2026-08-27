import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { getEntriesByDateRange } from "@/db/indexedDB";
import "../styles/dashboard.css";

const BarChart = lazy(() => import("@/components/dashboard/BarChart"));

type Stat = {
  date: string;
  count: number;
};

type RangeType = "weekly" | "monthly" | "custom";

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayString = () => formatLocalDate(new Date());
const getDateNDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatLocalDate(date);
};

export default function DashboardPage() {
  const [data, setData] = useState<Stat[]>([]);
  const [rangeType, setRangeType] = useState<RangeType>("weekly");
  const [customStart, setCustomStart] = useState(() => getDateNDaysAgo(29));
  const [customEnd, setCustomEnd] = useState(() => todayString());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rangeLabel = useMemo(() => {
    switch (rangeType) {
      case "monthly":
        return "مہینہ وار تجزیات";
      case "custom":
        return "اپنی مرضی کی تاریخ";
      default:
        return "ہفتہ وار تجزیات";
    }
  }, [rangeType]);

  const startDate = useMemo(() => {
    if (rangeType === "weekly") return getDateNDaysAgo(6);
    if (rangeType === "monthly") {
      const now = new Date();
      return formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
    }
    return customStart;
  }, [rangeType, customStart]);

  const endDate = useMemo(() => (rangeType === "custom" ? customEnd : todayString()), [rangeType, customEnd]);

  useEffect(() => {
    const loadData = async () => {
      if (new Date(startDate) > new Date(endDate)) {
        setData([]);
        setErrorMessage("براہ کرم درست شروع اور ختم تاریخ منتخب کریں۔");
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const entries = await getEntriesByDateRange(startDate, endDate);
        const countsByDate = entries.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.date] = (acc[entry.date] || 0) + 1;
          return acc;
        }, {});

        const stats: Stat[] = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
          const date = formatLocalDate(dt);
          stats.push({ date, count: countsByDate[date] || 0 });
        }

        setData(stats);
      } catch {
        setErrorMessage("تجزیاتی ڈیٹا لوڈ کرنے میں مسئلہ۔ دوبارہ کوشش کریں۔");
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [startDate, endDate]);

  const total = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data]);
  const average = useMemo(() => (data.length ? Math.round(total / data.length) : 0), [data, total]);

  const maxDay = useMemo(
    () =>
      data.reduce(
        (max, d) => (d.count > max.count ? d : max),
        data[0] || { date: "", count: 0 }
      ),
    [data]
  );

  const formatDateForDisplay = (date: string) =>
    new Date(date).toLocaleDateString("ur-PK", {
      day: "numeric",
      month: "short",
    });

  const formatLabel = (date: string) => {
    const parsed = new Date(date);
    return rangeType === "weekly"
      ? parsed.toLocaleDateString("ur-PK", { weekday: "short" })
      : parsed.toLocaleDateString("ur-PK", { day: "numeric", month: "short" });
  };

  const chartData = useMemo(
    () => ({
      labels: data.map((d) => formatLabel(d.date)),
      datasets: [
        {
          label: "اندراجات",
          data: data.map((d) => d.count),
          backgroundColor: "rgba(59, 130, 246, 0.85)",
          borderRadius: 16,
          maxBarThickness: 42,
        },
      ],
    }),
    [data, rangeType]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: "#1f2937",
          },
        },
        title: {
          display: true,
          text: `${rangeLabel} ${startDate === endDate ? startDate : `${startDate} - ${endDate}`}`,
          color: "#111827",
          font: {
            size: 20,
            weight: "bold" as const,
          },
        },
        tooltip: {
          callbacks: {
            label: (context: { parsed: { y: number | null } }) => ` ${context.parsed.y ?? 0} اندراج`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#1f2937",
            font: {
              size: 12,
            },
          },
          grid: {
            color: "rgba(148, 163, 184, 0.18)",
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#1f2937",
            font: {
              size: 12,
            },
          },
          grid: {
            color: "rgba(148, 163, 184, 0.18)",
          },
        },
      },
    }),
    [rangeLabel, startDate, endDate]
  );

  const displayRange =
    startDate === endDate
      ? formatDateForDisplay(startDate)
      : `${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}`;

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-caption">اپنی روزانہ کاروباری کارکردگی پر نظر رکھیں</p>
          <h1>ڈیش بورڈ</h1>
          <p className="dashboard-subtitle">{rangeLabel} — {displayRange}</p>
        </div>

        <div className="dashboard-tabs">
          {(["weekly", "monthly", "custom"] as RangeType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={type === rangeType ? "dashboard-tab active" : "dashboard-tab"}
              onClick={() => setRangeType(type)}
            >
              {type === "weekly" ? "ہفتہ وار" : type === "monthly" ? "ماہانہ" : "کسٹم"}
            </button>
          ))}
        </div>
      </header>

      <div className="dashboard-container">
        {rangeType === "custom" && (
          <div className="dashboard-range-form">
            <label className="dashboard-range-label">
              شروع تاریخ
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="dashboard-range-input"
              />
            </label>
            <label className="dashboard-range-label">
              ختم تاریخ
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="dashboard-range-input"
              />
            </label>
          </div>
        )}

        <div className="dashboard-summary-grid">
          <article className="dashboard-card dashboard-card-highlight">
            <span className="dashboard-card-label">کل اندراجات</span>
            <strong className="dashboard-card-value">{total}</strong>
          </article>
          <article className="dashboard-card dashboard-card-soft">
            <span className="dashboard-card-label">اوسط روزانہ</span>
            <strong className="dashboard-card-value">{average}</strong>
          </article>
          <article className="dashboard-card dashboard-card-soft">
            <span className="dashboard-card-label">سب سے مصروف دن</span>
            <strong className="dashboard-card-value">
              {maxDay.date
                ? new Date(maxDay.date).toLocaleDateString("ur-PK", {
                    day: "numeric",
                    month: "short",
                  })
                : "-"}
            </strong>
          </article>
        </div>

        <section className="dashboard-chart-panel">
          {errorMessage ? (
            <div className="dashboard-empty-state">{errorMessage}</div>
          ) : isLoading ? (
            <div className="dashboard-empty-state">تجزیاتی ڈیٹا لوڈ ہو رہا ہے...</div>
          ) : (
            <Suspense fallback={<div className="dashboard-empty-state">بار چارٹ لوڈ ہو رہا ہے...</div>}>
              <BarChart data={chartData} options={options} />
            </Suspense>
          )}
        </section>
      </div>
    </div>
  );
}