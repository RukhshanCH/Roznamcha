import { exportWeeklyData, importWeeklyData } from "@/db/indexedDB";

export default function BackupPage() {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', marginBottom: '16px' }}>
        بیک اپ
      </h1>
      <p style={{ fontFamily: 'var(--font-primary)', color: 'var(--text-secondary)' }}>
        یہاں ڈیٹا کا بیک اپ لیا جا سکتا ہے۔
      </p>

      <div className="actions">
        <button className="btn export-btn" onClick={exportWeeklyData}>
          Export This Week
        </button>

        <label className="btn import-btn" htmlFor="file">Import</label>
        <input
          hidden
          id="file"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];

            if (!file) return;

            // extra validation
            if (!file.name.endsWith(".json")) {
              alert("Only JSON files are allowed.");
              return;
            }

            try {
              await importWeeklyData(file);

              alert("Data imported successfully!");
            } catch (error) {
              alert("Failed to import data.");
              console.error(error);
            }

            // reset input so same file can be selected again
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
