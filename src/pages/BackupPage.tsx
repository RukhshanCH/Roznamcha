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
        <button className="btn export-btn" onClick={async () => { await exportWeeklyData(); alert("Data exported successfully!") }}>
          Export This Week
        </button>

        <label className="btn import-btn" htmlFor="file">
          Import
        </label>

        <input
          hidden
          id="file"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];

            if (!file) return;

            if (!file.name.endsWith(".json")) {
              alert("Only JSON files are allowed.");
              return;
            }

            try {
              const result = await importWeeklyData(file);

              alert(
                `Imported: ${result.imported}, Skipped: ${result.skipped}`
              );

              if (result.skippedEntries.length) {
                // console.log("Skipped entries:", result.skippedEntries);
              }
            } catch (error) {
              if (
                error instanceof Error &&
                error.message === "Backup already imported"
              ) {
                alert("This backup has already been imported.");
              } else {
                alert("Failed to import backup.");
              }

              console.error(error);
            }

            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
