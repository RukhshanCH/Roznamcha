import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

type TestRow = Record<string, unknown>;
type TestError = { message: string };
type QueryResult = { data: TestRow[]; error: TestError | null };

interface TestQuery extends PromiseLike<QueryResult> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): TestQuery;
  eq(column: string, value: unknown): TestQuery;
  order(column: string, options?: { ascending?: boolean }): TestQuery;
  range(from: number, to: number): TestQuery;
  maybeSingle(): Promise<{ data: TestRow | null; error: TestError | null }>;
  upsert(
    values: unknown | unknown[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): Promise<{ error: TestError | null }>;
}

function createSupabaseMock() {
  const tables = new Map<string, TestRow[]>();
  const failTable = 'expenses';
  let didFail = false;

  function getRows(table: string, filters: Map<string, unknown>) {
    return (tables.get(table) ?? []).filter((row) =>
      [...filters].every(([key, value]) => row[key] === value),
    );
  }

  function from(table: string): TestQuery {
    const filters = new Map<string, unknown>();
    let range: [number, number] | null = null;
    const builder: TestQuery = {
      select() {
        return builder;
      },
      eq(column, value) {
        filters.set(column, value);
        return builder;
      },
      order() {
        return builder;
      },
      range(from, to) {
        range = [from, to];
        return builder;
      },
      async maybeSingle() {
        return { data: getRows(table, filters)[0] ?? null, error: null };
      },
      async upsert(values, options) {
        if (table === failTable && !didFail) {
          didFail = true;
          return { error: { message: 'Temporary test network failure.' } };
        }

        const rows = tables.get(table) ?? [];
        const incoming = Array.isArray(values) ? values as TestRow[] : [values as TestRow];
        const conflictColumns = options?.onConflict?.split(',') ?? [];
        for (const row of incoming) {
          const currentIndex = rows.findIndex((current) =>
            conflictColumns.length > 0
              && conflictColumns.every((column) => current[column] === row[column]),
          );
          if (currentIndex >= 0) {
            if (!options?.ignoreDuplicates) {
              const current = rows[currentIndex];
              rows[currentIndex] = {
                ...current,
                ...row,
                sync_version: Number(current.sync_version ?? 0) + 1,
                updated_at: new Date().toISOString(),
              };
            }
          } else {
            rows.push({
              ...row,
              sync_version: 1,
              updated_at: new Date().toISOString(),
            });
          }
        }
        tables.set(table, rows);
        return { error: null };
      },
      then(onfulfilled, onrejected) {
        const rows = getRows(table, filters);
        const rangedRows = range ? rows.slice(range[0], range[1] + 1) : rows;
        return Promise.resolve({ data: rangedRows, error: null }).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  return {
    client: { from } as never,
    tables,
  };
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

describe('legacy IndexedDB migration', () => {
  it('requires ownership confirmation, resumes a failed upload, and preserves deleted rows and settings', async () => {
    const mock = createSupabaseMock();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);

    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    const transaction = db.transaction(['entries', 'customers', 'expenses', 'payments', 'settings'], 'readwrite');
    const complete = transactionDone(transaction);
    transaction.objectStore('entries').add({
      serialNo: 1,
      name: 'Ledger row',
      mobileNumber: '03000000000',
      total: 500,
      advance: 100,
      remaining: 400,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
      debtId: 'legacy-debt',
    });
    transaction.objectStore('entries').add({
      serialNo: 2,
      name: 'Deleted row',
      mobileNumber: '',
      total: 0,
      advance: 0,
      remaining: 0,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
      debtId: 'legacy-debt-deleted',
      isDeleted: true,
      deletedAt: new Date(Date.UTC(2024, 0, 3)).toISOString(),
    });
    transaction.objectStore('customers').add({
      serialNo: 1,
      name: 'Customer',
      mobileNumber: '03000000001',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    transaction.objectStore('expenses').add({
      serialNo: 1,
      name: 'Expense',
      description: 'Office',
      amount: 25,
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    transaction.objectStore('payments').add({
      serialNo: 1,
      name: 'Payment',
      description: 'Cash',
      amount: 40,
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    transaction.objectStore('settings').put({ key: 'companyName', value: 'Roznamcha' });
    transaction.objectStore('settings').put({
      key: 'invoiceCounter',
      date: '20240102',
      sequence: 8,
    });
    await complete;

    const { getMigrationPreview, getLocalMigrationState, getSyncInstallationId, migrateLegacyData } =
      await import('@/db/localMigration');
    const preview = await getMigrationPreview('user-a');
    expect(preview.counts.entries).toBe(2);
    expect(preview.deletedCounts.entries).toBe(1);
    expect(preview.counts.settings).toBe(2);

    await expect(migrateLegacyData('user-a', false)).rejects.toThrow(/Confirm that the local data belongs/);
    const installationId = await getSyncInstallationId();
    mock.tables.set('journal_entries', [{
      id: '00000000-0000-4000-8000-000000000099',
      user_id: 'user-a',
      installation_id: installationId,
      local_id: 1,
      serial_no: 1,
      name: 'Conflicting cloud value',
    }]);
    await expect(migrateLegacyData('user-a', true)).rejects.toThrow(/Migration conflict in entries local record 1/);
    expect(mock.tables.get('customers')).toBeUndefined();
    mock.tables.delete('journal_entries');

    await expect(migrateLegacyData('user-a', true)).rejects.toThrow(/Temporary test network failure/);

    const afterFailure = db.transaction('entries', 'readonly').objectStore('entries').getAll();
    const retainedAfterFailure = await new Promise<TestRow[]>((resolve, reject) => {
      afterFailure.onsuccess = () => resolve(afterFailure.result as TestRow[]);
      afterFailure.onerror = () => reject(afterFailure.error);
    });
    expect(retainedAfterFailure).toHaveLength(2);
    expect(retainedAfterFailure.every((row) => row.ownerUserId === undefined)).toBe(true);

    await migrateLegacyData('user-a', false);
    await migrateLegacyData('user-a', false);

    expect(mock.tables.get('journal_entries')).toHaveLength(2);
    expect(mock.tables.get('customers')).toHaveLength(1);
    expect(mock.tables.get('expenses')).toHaveLength(1);
    expect(mock.tables.get('payments')).toHaveLength(1);
    expect(mock.tables.get('user_settings')).toHaveLength(2);
    expect(mock.tables.get('invoice_counters')).toHaveLength(1);
    expect((await getLocalMigrationState('user-a'))?.status).toBe('verified');

    const finalRowsRequest = db.transaction('entries', 'readonly').objectStore('entries').getAll();
    const finalRows = await new Promise<TestRow[]>((resolve, reject) => {
      finalRowsRequest.onsuccess = () => resolve(finalRowsRequest.result as TestRow[]);
      finalRowsRequest.onerror = () => reject(finalRowsRequest.error);
    });
    expect(finalRows).toHaveLength(2);
    expect(finalRows.find((row) => row.isDeleted === true)?.ownerUserId).toBe('user-a');
  });
});
