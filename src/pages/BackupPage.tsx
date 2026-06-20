import { exportAllData, exportByDateRange, exportMonthlyData, exportWeeklyData, importWeeklyData } from "@/db/indexedDB";
import { useState } from "react";
import "../styles/backup.css";

export default function BackupPage() {
  const [showModal, setShowModal] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleExport = async () => {
    if (!startDate || !endDate) {
      alert("Please select both dates");
      return;
    }

    await exportByDateRange(startDate, endDate);

    alert("Custom backup exported!");
    setShowModal(false);
    setStartDate("");
    setEndDate("");
  };

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
        بیک اپ
      </h1>
      <p style={{ fontFamily: 'var(--font-primary)', color: 'var(--text-secondary)' }}>
        یہاں ڈیٹا کا بیک اپ لیا جا سکتا ہے۔
      </p>

      <div className="actions">
        <button
          className="btn export-btn"
          onClick={async () => {
            await exportWeeklyData();
            alert("Weekly backup exported successfully!");
          }}
        >
          Weekly Backup
        </button>

        <button
          className="btn export-btn"
          onClick={async () => {
            await exportMonthlyData();
            alert("Monthly backup exported successfully!");
          }}
        >
          Monthly Backup
        </button>

        <button
          className="btn export-btn"
          onClick={async () => {
            await exportAllData();
            alert("Full backup exported successfully!");
          }}
        >
          All Backup
        </button>

        <div>
          <button
            className="btn export-btn"
            onClick={() => setShowModal(true)}
          >
            Export Custom Range
          </button>

          {showModal && (
            <div className="modal-overlay" onClick={() => setShowModal(false)}>
              <div
                className="modal"
                onClick={(e) => e.stopPropagation()}
              >
                <h2>Export Custom Range</h2>

                <div className="date-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="date-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    className="btn cancel-btn"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>

                  <button
                    className="btn export-btn"
                    onClick={handleExport}
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <label className="btn import-btn" htmlFor="file">
          Import Backup
        </label>

        <input
          hidden
          id="file"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];

            if (!file) return;

            try {
              const result = await importWeeklyData(file);

              alert(
                `Imported: ${result.imported}, Skipped: ${result.skipped}`
              );
            } catch (error) {
              alert("Failed to import backup.");
            }

            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
