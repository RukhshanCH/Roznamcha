import { exportAllData, exportByDateRange, exportMonthlyData, exportWeeklyData, importBackup } from "@/db/indexedDB";
import { alertAtom, alertTypeAtom, alertMessageAtom } from "@/store/atoms";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";

export default function BackupPage() {
  const [showModal, setShowModal] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [, setAlert] = useAtom(alertAtom);
  const [, setType] = useAtom(alertTypeAtom);
  const [, setMessage] = useAtom(alertMessageAtom);

  const isDisabled = (!startDate || !endDate) || startDate > endDate;

  const handleExport = async () => {
    if (!startDate || !endDate) {
      setType("error");
      setMessage("براہ کرم دونوں تاریخیں منتخب کریں۔");

      setAlert(true);
      setTimeout(() => {
        setAlert(false);
      }, 3000);
      return;
    }

    if (startDate > endDate) {
      setType("error");
      setMessage("آغاز کی تاریخ، اختتامی تاریخ سے پہلے کی ہونی چاہیے۔");

      setAlert(true);
      setTimeout(() => {
        setAlert(false);
      }, 3000);
      return;
    }

    try {
      await exportByDateRange(startDate, endDate);

      setType("success");
      setMessage("Custom backup exported successfully!");

      setShowModal(false);

      setStartDate("");
      setEndDate("");

    } catch (error) {
      setType("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong!");
    }

    setAlert(true);
    setTimeout(() => {
      setAlert(false);
    }, 3000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModal(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setShowModal]);

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <span style={{position: "fixed", bottom: "10px", left: "10px", color: "var(--text-secondary)"}}>
        Note: Refresh Page once after a Download
      </span>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '50px' }}>
        بیک اپ
      </h1>

      <div className="actions">
        <button
          className="btn export-btn"
          onClick={async () => {
            try {
              await exportWeeklyData();
              setType("success");
              setMessage("Weekly backup exported successfully!")

            } catch (error) {
              setType("error");
              setMessage(error instanceof Error ? error.message : "Something went wrong!");
            }

            setAlert(true)
            setTimeout(() => {
              setAlert(false);
            }, 3000)
          }}
        >
          Weekly Backup
        </button>

        <button
          className="btn export-btn"
          onClick={async () => {
            try {
              await exportMonthlyData();
              setType("success");
              setMessage("Monthly backup exported successfully!")

            } catch (error) {
              setType("error");
              setMessage(error instanceof Error ? error.message : "Something went wrong!");
            }

            setAlert(true)
            setTimeout(() => {
              setAlert(false);
            }, 3000)
          }}
        >
          Monthly Backup
        </button>

        <button
          className="btn export-btn"
          onClick={async () => {
            try {
              await exportAllData();
              setType("success");
              setMessage("Full backup exported successfully!")

            } catch (error) {
              setType("error");
              setMessage(error instanceof Error ? error.message : "Something went wrong!");
            }

            setAlert(true)
            setTimeout(() => {
              setAlert(false);
            }, 3000)
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
                  <label htmlFor="startDate">Start Date</label>
                  <input
                    id="startDate"
                    type="date"
                    aria-label="Select start date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="date-group">
                  <label htmlFor="endDate">End Date</label>
                  <input
                    id="endDate"
                    type="date"
                    aria-label="Select end date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    className="btn cancel-btn"
                    onClick={() => setShowModal(false)}
                    type="button"
                    aria-label="Cancel"
                  >
                    Cancel
                  </button>

                  <button
                    className={`btn ${isDisabled ? "btn-disabled" : "export-btn"}`}
                    onClick={handleExport}
                    type="button"
                    aria-label="Export"
                    autoFocus
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
          aria-label="Import Backup"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];

            if (!file) return;

            try {
              const result = await importBackup(file);

              setType("success");
              setMessage(
                `Imported: ${result.imported}, Skipped: ${result.skipped}`
              );
            } catch (error) {
              setType("error");
              setMessage("Failed to import backup.\n" + error);
            }

            setAlert(true);
            setTimeout(() => {
              setAlert(false);
            }, 3000);

            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
