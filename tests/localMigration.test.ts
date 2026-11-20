import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

describe('migration RPC retry policy', () => {
  it.each([
    ['40001', 'serialization failure'],
    ['40P01', 'deadlock detected'],
  ])('bounds retries for PostgreSQL %s errors', async (code, message) => {
    vi.useFakeTimers();
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code, message } })
      .mockResolvedValueOnce({ data: null, error: { code, message } })
      .mockResolvedValueOnce({ data: null, error: { code, message } })
      .mockResolvedValueOnce({ data: [{ applied: true }], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
    const { rpcMigrationRetry } = await import('@/db/localMigration');
    const promise = rpcMigrationRetry<Array<{ applied: boolean }>>(
      'migrate_user_record',
      { p_store: 'entries', p_payload: { local_id: 1 } },
    );
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(900);
    await expect(promise).resolves.toEqual({
      data: [{ applied: true }],
      error: null,
    });
    expect(rpc).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('does not retry validation, ownership, network, or message-only deadlock errors', async () => {
    const { rpcMigrationRetry } = await import('@/db/localMigration');
    const cases = [
      { code: '22023', message: 'Invalid payload' },
      { code: '42501', message: 'Ownership denied' },
      { code: 'NETWORK_ERROR', message: 'Failed to fetch' },
      { code: 'PGRST999', message: 'deadlock detected by application wrapper' },
    ];
    for (const error of cases) {
      const rpc = vi.fn().mockResolvedValue({ data: null, error });
      vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
      await expect(rpcMigrationRetry('migrate_user_setting', {
        p_key: 'theme',
        p_value: 'dark',
      })).resolves.toEqual({ data: null, error });
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it('caps retryable PostgreSQL errors at three delays and does not return success', async () => {
    vi.useFakeTimers();
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'Could not serialize access' },
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
    const { rpcMigrationRetry } = await import('@/db/localMigration');
    const promise = rpcMigrationRetry('migrate_invoice_counter', {
      p_invoice_date: '2024-01-02',
      p_sequence: 8,
    });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(900);
    await expect(promise).resolves.toEqual({
      data: null,
      error: { code: '40001', message: 'Could not serialize access' },
    });
    expect(rpc).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});

type TestRow = Record<string, unknown>;
type TestError = { message: string };
type QueryResult = { data: TestRow[]; error: TestError | null };

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]));
  }
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    return keys.length === Object.keys(rightRecord).length
      && keys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key)
        && sameJson(leftRecord[key], rightRecord[key]));
  }
  return false;
}

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
  let raceNextRecord = false;
  let raceBeforeFinalVerification = false;
  let invoiceAllocationSequence: number | null = null;
  let naturalKeyRecordId: string | null = null;
  let beforeRecordMigration: (() => Promise<void>) | null = null;
  let restoreAdvancedVersionRecord = false;
  const recordMigrationCalls: Array<{ store: string; localId: number }> = [];

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

  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === 'set_user_migration_status') {
      const rows = tables.get('migration_runs') ?? [];
      const installation = String(args.p_installation_id);
      const existing = rows.find((row) =>
        row.user_id === 'user-a' && row.installation_id === installation,
      );
      const values = {
        user_id: 'user-a',
        installation_id: installation,
        source_db_version: args.p_source_db_version,
        status: args.p_status,
        store_counts: args.p_store_counts,
        last_error: args.p_last_error,
      };
      if (existing) Object.assign(existing, values);
      else rows.push(values);
      tables.set('migration_runs', rows);
      return { data: null, error: null };
    }

    if (name === 'migrate_user_record') {
      const store = String(args.p_store);
      const table = store === 'entries' ? 'journal_entries' : store;
      const payload = args.p_payload as TestRow;
      recordMigrationCalls.push({ store, localId: Number(payload.local_id) });
      if (beforeRecordMigration) {
        const callback = beforeRecordMigration;
        beforeRecordMigration = null;
        await callback();
      }
      if (store === failTable && !didFail) {
        didFail = true;
        return { data: null, error: { message: 'Temporary test network failure.' } };
      }

      const rows = tables.get(table) ?? [];
      let existing = rows.find((row) =>
        row.user_id === payload.user_id
        && row.installation_id === payload.installation_id
        && row.local_id === payload.local_id,
      );
      if (!existing && store === 'entries' && naturalKeyRecordId) {
        existing = { ...payload, id: naturalKeyRecordId, sync_version: 1 };
        naturalKeyRecordId = null;
        rows.push(existing);
        tables.set(table, rows);
      }
      if (raceNextRecord) {
        raceNextRecord = false;
        if (existing) existing.name = 'Concurrent cloud edit';
        else {
          existing = { ...payload, name: 'Concurrent cloud edit', sync_version: 1 };
          rows.push(existing);
        }
        tables.set(table, rows);
      }

      if (!existing) {
        existing = { ...payload, sync_version: 1, updated_at: new Date().toISOString() };
        rows.push(existing);
        tables.set(table, rows);
        return { data: [{ applied: true, row_id: existing.id, sync_version: existing.sync_version }], error: null };
      }

      const same = Object.entries(payload).every(([key, value]) => {
        if (key === 'id' || key === 'sync_version' || key === 'updated_at') return true;
        if (key === 'created_at') {
          return new Date(String(existing?.[key])).getTime() === new Date(String(value)).getTime();
        }
        return existing?.[key] === value;
      });
      return {
        data: [{
          applied: same,
          row_id: existing.id,
          sync_version: existing.sync_version,
        }],
        error: null,
      };
    }

    if (name === 'migrate_user_setting') {
      const key = String(args.p_key);
      const localValue = args.p_value;
      const canonicalInstallationId = '00000000-0000-0000-0000-000000000000';
      const rows = tables.get('user_settings') ?? [];
      const matching = rows.filter((row) => row.user_id === 'user-a' && row.key === key);
      const canonical = matching.find((row) => row.source_installation_id === canonicalInstallationId);
      const latest = canonical ?? matching[matching.length - 1];
      const resolution = args.p_resolution;
      let chosenValue = localValue;
      const localResolutionAlreadyApplied = resolution === 'local'
        && canonical
        && sameJson(canonical.value, localValue);

      if (resolution === 'cloud') {
        if (!latest
          || !sameJson(latest.value, args.p_expected_cloud_value)
          || (args.p_expected_version !== null && latest.sync_version !== args.p_expected_version)) {
          return {
            data: [{
              applied: false,
              conflict: true,
              value: latest?.value ?? null,
              sync_version: latest?.sync_version ?? null,
              updated_at: latest?.updated_at ?? null,
            }],
            error: null,
          };
        }
        chosenValue = latest.value;
      } else if (resolution === 'local' && !localResolutionAlreadyApplied) {
        if (!sameJson(latest?.value, args.p_expected_cloud_value)
          || (args.p_expected_version !== null && latest.sync_version !== args.p_expected_version)) {
          return {
            data: [{
              applied: false,
              conflict: true,
              value: latest?.value ?? null,
              sync_version: latest?.sync_version ?? null,
              updated_at: latest?.updated_at ?? null,
            }],
            error: null,
          };
        }
      } else if (resolution !== 'local' && matching.some((row) => !sameJson(row.value, localValue))) {
        return {
          data: [{
            applied: false,
            conflict: true,
            value: latest?.value ?? null,
            sync_version: latest?.sync_version ?? null,
            updated_at: latest?.updated_at ?? null,
          }],
          error: null,
        };
      }

      let target = canonical;
      if (!target) {
        target = {
          user_id: 'user-a',
          key,
          value: chosenValue,
          source_installation_id: canonicalInstallationId,
          sync_version: 1,
          updated_at: new Date().toISOString(),
        };
        rows.push(target);
      } else if (!sameJson(target.value, chosenValue)) {
        if (resolution !== 'local' || target.sync_version !== args.p_expected_version) {
          return {
            data: [{
              applied: false,
              conflict: true,
              value: target.value,
              sync_version: target.sync_version,
              updated_at: target.updated_at,
            }],
            error: null,
          };
        }
        target.value = chosenValue;
        target.sync_version = Number(target.sync_version) + 1;
        target.updated_at = new Date().toISOString();
      }
      tables.set('user_settings', rows);
      return {
        data: [{
          applied: true,
          conflict: false,
          value: target.value,
          sync_version: target.sync_version,
          updated_at: target.updated_at,
        }],
        error: null,
      };
    }

    if (name === 'migrate_invoice_counter') {
      const invoiceDate = String(args.p_invoice_date);
      const rows = tables.get('invoice_counters') ?? [];
      let counter = rows.find((row) =>
        row.user_id === 'user-a' && row.invoice_date === invoiceDate,
      );
      if (invoiceAllocationSequence !== null) {
        if (!counter) {
          counter = { user_id: 'user-a', invoice_date: invoiceDate, sequence: 0 };
          rows.push(counter);
        }
        counter.sequence = Math.max(Number(counter.sequence), invoiceAllocationSequence);
        invoiceAllocationSequence = null;
      }
      if (!counter) {
        counter = { user_id: 'user-a', invoice_date: invoiceDate, sequence: Number(args.p_sequence) };
        rows.push(counter);
      } else {
        counter.sequence = Math.max(Number(counter.sequence), Number(args.p_sequence));
      }
      tables.set('invoice_counters', rows);
      return { data: counter.sequence, error: null };
    }

    if (name === 'verify_user_migration') {
      const installationId = args.p_installation_id;
      const records = args.p_records as Record<string, TestRow[]>;
      const settings = args.p_settings as TestRow[];
      if (raceBeforeFinalVerification) {
        raceBeforeFinalVerification = false;
        const remote = tables.get('journal_entries')?.[0];
        if (remote) {
          const originalName = remote.name;
          remote.name = 'Concurrent cloud edit';
          remote.sync_version = Number(remote.sync_version ?? 0) + 1;
          if (restoreAdvancedVersionRecord) {
            remote.name = originalName;
            remote.sync_version = Number(remote.sync_version) + 1;
            restoreAdvancedVersionRecord = false;
          }
        }
      }

      const recordVersions: TestRow[] = [];
      for (const [store, expectedRows] of Object.entries(records)) {
        const table = store === 'entries' ? 'journal_entries' : store;
        const rows = (tables.get(table) ?? []).filter((row) =>
          row.user_id === 'user-a' && row.installation_id === installationId,
        );
        if (rows.length !== expectedRows.length) {
          return { data: [{ verified: false, record_versions: [] }], error: null };
        }
        for (const expected of expectedRows) {
          const remote = rows.find((row) => row.local_id === expected.local_id);
          if (!remote || (typeof expected.sync_version === 'number'
            && Number(remote.sync_version) !== Number(expected.sync_version))) {
            return { data: [{ verified: false, record_versions: [] }], error: null };
          }
          if (!Object.entries(expected).every(([key, value]) => {
            if (key === 'updated_at') return true;
            if (key === 'created_at') {
              return new Date(String(remote[key])).getTime() === new Date(String(value)).getTime();
            }
            return sameJson(remote[key], value);
          })) {
            return { data: [{ verified: false, record_versions: [] }], error: null };
          }
          recordVersions.push({
            store,
            id: remote.id,
            local_id: remote.local_id,
            sync_version: remote.sync_version,
          });
        }
      }
      for (const expected of settings) {
        const remote = tables.get('user_settings')?.find((row) =>
          row.user_id === 'user-a'
          && row.key === expected.key
          && row.source_installation_id === '00000000-0000-0000-0000-000000000000',
        );
        if (!remote
          || !sameJson(remote.value, expected.value)
          || remote.sync_version !== expected.sync_version) {
          return { data: [{ verified: false, record_versions: [] }], error: null };
        }
      }
      const invoiceCounter = args.p_invoice_counter as TestRow;
      if (Object.keys(invoiceCounter).length > 0) {
        const remote = tables.get('invoice_counters')?.find((row) =>
          row.user_id === 'user-a' && row.invoice_date === invoiceCounter.invoice_date,
        );
        if (!remote || remote.sequence !== invoiceCounter.sequence) {
          return { data: [{ verified: false, record_versions: [] }], error: null };
        }
      }
      return { data: [{ verified: true, record_versions: recordVersions }], error: null };
    }

    return { data: null, error: { message: `Unknown RPC ${name}` } };
  }

  return {
    client: { from, rpc } as never,
    tables,
    recordMigrationCalls,
    raceNextRecord: () => { raceNextRecord = true; },
    raceBeforeFinalVerification: () => { raceBeforeFinalVerification = true; },
    restoreAdvancedVersionRecord: () => { restoreAdvancedVersionRecord = true; },
    raceInvoiceAllocation: (sequence: number) => { invoiceAllocationSequence = sequence; },
    useDifferentNaturalKeyId: (id: string) => { naturalKeyRecordId = id; },
    setBeforeRecordMigration: (callback: () => Promise<void>) => { beforeRecordMigration = callback; },
  };
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function clearLocalDatabase(db: IDBDatabase): Promise<void> {
  const stores = ['entries', 'customers', 'expenses', 'payments', 'settings', 'syncOutbox'];
  const transaction = db.transaction(stores, 'readwrite');
  const complete = transactionDone(transaction);
  for (const store of stores) transaction.objectStore(store).clear();
  await complete;
}

describe('legacy IndexedDB migration', () => {
  beforeEach(() => {
    const storage = new Map<string, string>([
      ['lastBackup', '1700000000000'],
      ['backupFirstVisitSeen', '1699000000000'],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  it.each([
    { label: 'missing', date: undefined, displayed: '<missing>' },
    { label: 'null', date: null, displayed: 'null' },
    { label: 'empty', date: '', displayed: '""' },
    { label: 'malformed', date: 'not-a-date', displayed: '"not-a-date"' },
    { label: 'out-of-range calendar date', date: '2024-02-30', displayed: '"2024-02-30"' },
    { label: 'out-of-range month', date: '2024-13-01', displayed: '"2024-13-01"' },
    { label: 'ambiguous legacy date', date: '03/04/2024', displayed: '"03/04/2024"' },
    { label: 'unsupported numeric date', date: 1704067200000, displayed: '1704067200000' },
  ])('reports and preserves a $label customer date', async ({ date, displayed }) => {
    const mock = createSupabaseMock();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    await clearLocalDatabase(db);

    const seed = db.transaction('customers', 'readwrite');
    const complete = transactionDone(seed);
    const add = seed.objectStore('customers').add({
      serialNo: 1,
      name: 'Customer with invalid date',
      mobileNumber: '',
      date,
      createdAt: Date.UTC(2024, 0, 2),
    });
    const localId = await new Promise<number>((resolve, reject) => {
      add.onsuccess = () => resolve(Number(add.result));
      add.onerror = () => reject(add.error);
    });
    await complete;

    const { migrateLegacyData } = await import('@/db/localMigration');
    await expect(migrateLegacyData('user-a', true)).rejects.toThrow(
      `customers record ${localId} has date ${displayed}`,
    );
    expect(mock.recordMigrationCalls).toHaveLength(0);

    const request = db.transaction('customers', 'readonly').objectStore('customers').getAll();
    const retained = await new Promise<TestRow[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as TestRow[]);
      request.onerror = () => reject(request.error);
    });
    expect(retained).toHaveLength(1);
    expect(retained[0].id).toBe(localId);
    expect(retained[0].date).toBe(date);
    expect(retained[0].cloudId).toBeUndefined();
    expect(mock.tables.get('customers')).toBeUndefined();
    await clearLocalDatabase(db);
  });

  it('normalizes only valid, unambiguous legacy customer dates', async () => {
    const mock = createSupabaseMock();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    await clearLocalDatabase(db);

    const seed = db.transaction('customers', 'readwrite');
    const complete = transactionDone(seed);
    const dates = [
      '20240229',
      '29/02/2024',
      '2024-02-29T23:45:00+05:00',
    ];
    dates.forEach((date, index) => {
      seed.objectStore('customers').add({
        serialNo: index + 1,
        name: `Customer ${index + 1}`,
        mobileNumber: '',
        date,
        createdAt: Date.UTC(2024, 1, 29),
      });
    });
    await complete;

    const { migrateLegacyData } = await import('@/db/localMigration');
    await migrateLegacyData('user-a', true);

    expect(mock.tables.get('customers')?.map((row) => row.date)).toEqual([
      '2024-02-29',
      '2024-02-29',
      '2024-02-29',
    ]);
    const request = db.transaction('customers', 'readonly').objectStore('customers').getAll();
    const migrated = await new Promise<TestRow[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as TestRow[]);
      request.onerror = () => reject(request.error);
    });
    expect(migrated.map((row) => row.date)).toEqual([
      '2024-02-29',
      '2024-02-29',
      '2024-02-29',
    ]);
    await clearLocalDatabase(db);
  });

  it('lets the user supply a required date for a missing-date record without changing other fields', async () => {
    const mock = createSupabaseMock();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    await clearLocalDatabase(db);

    const seed = db.transaction('customers', 'readwrite');
    const complete = transactionDone(seed);
    seed.objectStore('customers').put({
      id: 34,
      serialNo: 7,
      name: 'Customer 34',
      mobileNumber: '03000000000',
      createdAt: Date.UTC(2024, 0, 2),
    });
    await complete;

    const { migrateLegacyData, repairMigrationRecordDate } = await import('@/db/localMigration');
    await expect(migrateLegacyData('user-a', true)).rejects.toMatchObject({
      name: 'MigrationDateValidationError',
      issues: [{
        store: 'customers',
        localId: 34,
        value: '<missing>',
        name: 'Customer 34',
        serialNo: 7,
      }],
    });
    await expect(repairMigrationRecordDate('user-a', 'customers', 34, ''))
      .rejects.toThrow(/Enter a valid date/);

    await repairMigrationRecordDate('user-a', 'customers', 34, '2024-02-12');
    const getCustomer = db.transaction('customers', 'readonly')
      .objectStore('customers').get(34);
    const repaired = await new Promise<TestRow>((resolve, reject) => {
      getCustomer.onsuccess = () => resolve(getCustomer.result as TestRow);
      getCustomer.onerror = () => reject(getCustomer.error);
    });
    expect(repaired).toMatchObject({
      id: 34,
      serialNo: 7,
      name: 'Customer 34',
      mobileNumber: '03000000000',
      date: '2024-02-12',
      createdAt: Date.UTC(2024, 0, 2),
    });

    await expect(repairMigrationRecordDate('user-a', 'customers', 34, '2024-03-12'))
      .rejects.toThrow(/changed\. Review it again/);
    await migrateLegacyData('user-a', true);
    expect(mock.tables.get('customers')?.[0].date).toBe('2024-02-12');
    expect(mock.tables.get('customers')?.[0].name).toBe('Customer 34');
    await clearLocalDatabase(db);
  });

  it('skips rows already migrated successfully when retrying after a later store fails', async () => {
    const mock = createSupabaseMock();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    await clearLocalDatabase(db);

    const seed = db.transaction(['entries', 'customers', 'expenses'], 'readwrite');
    const complete = transactionDone(seed);
    seed.objectStore('entries').add({
      serialNo: 1,
      name: 'Entry',
      mobileNumber: '',
      total: 10,
      advance: 0,
      remaining: 10,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    seed.objectStore('customers').add({
      serialNo: 1,
      name: 'Customer',
      mobileNumber: '',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    seed.objectStore('expenses').add({
      serialNo: 1,
      name: 'Expense',
      description: '',
      amount: 10,
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    await complete;

    const { migrateLegacyData } = await import('@/db/localMigration');
    await expect(migrateLegacyData('user-a', true)).rejects.toThrow(/Temporary test network failure/);
    await migrateLegacyData('user-a', true);

    const callsByStore = Object.fromEntries(
      ['entries', 'customers', 'expenses'].map((store) => [
        store,
        mock.recordMigrationCalls.filter((call) => call.store === store).length,
      ]),
    );
    expect(callsByStore).toEqual({ entries: 1, customers: 1, expenses: 2 });
    expect(mock.tables.get('journal_entries')).toHaveLength(1);
    expect(mock.tables.get('customers')).toHaveLength(1);
    expect(mock.tables.get('expenses')).toHaveLength(1);
    await clearLocalDatabase(db);
  });

  it('rejects a record restored to A after advancing from version 1 to 3', async () => {
      const storage = new Map<string, string>([
        ['lastBackup', '1700000000000'],
        ['backupFirstVisitSeen', '1699000000000'],
      ]);
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      });
      const mock = createSupabaseMock();
      vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
      const { initDB } = await import('@/db/indexedDB');
      const db = await initDB();
      await clearLocalDatabase(db);
      const seed = db.transaction('entries', 'readwrite');
      const complete = transactionDone(seed);
      seed.objectStore('entries').add({
        serialNo: 1,
        name: 'A',
        mobileNumber: '',
        total: 10,
        advance: 0,
        remaining: 10,
        remainingPlus: 0,
        note: '',
        paymentMethod: 'cash',
        date: '2024-01-02',
        createdAt: Date.UTC(2024, 0, 2),
      });
      await complete;

      mock.restoreAdvancedVersionRecord();
      mock.raceBeforeFinalVerification();
      const { migrateLegacyData } = await import('@/db/localMigration');
      await expect(migrateLegacyData('user-a', true))
        .rejects.toThrow(/Atomic migration verification failed/);

      const retained = db.transaction('entries', 'readonly').objectStore('entries').getAll();
      const rows = await new Promise<TestRow[]>((resolve, reject) => {
        retained.onsuccess = () => resolve(retained.result as TestRow[]);
        retained.onerror = () => reject(retained.error);
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('A');
      expect(rows[0].ownerUserId).toBeUndefined();
      await clearLocalDatabase(db);
  });

  it('rejects browser changes during finalization and preserves a retryable outbox', async () => {
      const storage = new Map<string, string>([
        ['lastBackup', '1700000000000'],
        ['backupFirstVisitSeen', '1699000000000'],
      ]);
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      });
      const mock = createSupabaseMock();
      vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
      const { initDB } = await import('@/db/indexedDB');
      const db = await initDB();
      await clearLocalDatabase(db);
      const seed = db.transaction('entries', 'readwrite');
      const complete = transactionDone(seed);
      seed.objectStore('entries').add({
        serialNo: 1,
        name: 'Finalization race',
        mobileNumber: '',
        total: 10,
        advance: 0,
        remaining: 10,
        remainingPlus: 0,
        note: '',
        paymentMethod: 'cash',
        date: '2024-01-02',
        createdAt: Date.UTC(2024, 0, 2),
      });
      await complete;

      const { migrateLegacyData } = await import('@/db/localMigration');
      await expect(migrateLegacyData(
        'user-a',
        true,
        undefined,
        {},
        undefined,
        async () => {
          storage.set('lastBackup', '1900000000000');
        },
      )).rejects.toThrow(/lastBackup.*changed during migration/);

      expect(storage.get('lastBackup')).toBe('1900000000000');
      const stateRequest = db.transaction(['entries', 'syncOutbox', 'settings'], 'readonly');
      const [entries, outbox, states] = await Promise.all([
        new Promise<TestRow[]>((resolve, reject) => {
          const request = stateRequest.objectStore('entries').getAll();
          request.onsuccess = () => resolve(request.result as TestRow[]);
          request.onerror = () => reject(request.error);
        }),
        new Promise<TestRow[]>((resolve, reject) => {
          const request = stateRequest.objectStore('syncOutbox').getAll();
          request.onsuccess = () => resolve(request.result as TestRow[]);
          request.onerror = () => reject(request.error);
        }),
        new Promise<TestRow[]>((resolve, reject) => {
          const request = stateRequest.objectStore('settings').getAll();
          request.onsuccess = () => resolve(request.result as TestRow[]);
          request.onerror = () => reject(request.error);
        }),
      ]);
      expect(entries).toHaveLength(1);
      expect(outbox).toHaveLength(1);
      expect(outbox[0].operation).toBe('upsert');
      expect(states.find((row) => row.key === '@sync:migration:user-a')?.value)
        .toMatchObject({ status: 'failed' });
      await clearLocalDatabase(db);
  });

  it('preserves a browser setting changed while migration is uploading', async () => {
    const storage = new Map<string, string>([
      ['lastBackup', '1700000000000'],
      ['backupFirstVisitSeen', '1699000000000'],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const mock = createSupabaseMock();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    await clearLocalDatabase(db);
    const seed = db.transaction('entries', 'readwrite');
    const complete = transactionDone(seed);
    seed.objectStore('entries').add({
      serialNo: 1,
      name: 'Browser race',
      mobileNumber: '',
      total: 10,
      advance: 0,
      remaining: 10,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    await complete;

    mock.setBeforeRecordMigration(async () => {
      storage.set('lastBackup', '1800000000000');
    });
    const { migrateLegacyData } = await import('@/db/localMigration');
    await expect(migrateLegacyData('user-a', true))
      .rejects.toThrow(/lastBackup.*changed during migration/);
    expect(storage.get('lastBackup')).toBe('1800000000000');
    await clearLocalDatabase(db);
  });

  it('aborts stable-ID preparation when another tab edits a record and queues an outbox mutation', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    storage.set('lastBackup', '1700000000000');
    storage.set('backupFirstVisitSeen', '1699000000000');

    const mock = createSupabaseMock();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);
    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    await clearLocalDatabase(db);

    const seed = db.transaction('entries', 'readwrite');
    const seedComplete = transactionDone(seed);
    let localId = 0;
    const seedRequest = seed.objectStore('entries').add({
      serialNo: 1,
      name: 'Original record',
      mobileNumber: '',
      total: 10,
      advance: 0,
      remaining: 10,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    seedRequest.onsuccess = () => { localId = Number(seedRequest.result); };
    await seedComplete;

    const { migrateLegacyData } = await import('@/db/localMigration');
    await expect(migrateLegacyData('user-a', true, undefined, {}, async () => {
      const transaction = db.transaction(['entries', 'syncOutbox'], 'readwrite');
      const complete = transactionDone(transaction);
      const get = transaction.objectStore('entries').get(localId);
      get.onsuccess = () => {
        const current = get.result as TestRow;
        transaction.objectStore('entries').put({
          ...current,
          name: 'Concurrent preparation edit',
        });
        transaction.objectStore('syncOutbox').put({
          key: `user-a:entries:${localId}`,
          mutationId: 'preparation-mutation',
          userId: 'user-a',
          store: 'entries',
          localId,
          operation: 'upsert',
          payload: { ...current, name: 'Concurrent preparation edit' },
          createdAt: Date.now(),
          attempts: 0,
        });
      };
      await complete;
    })).rejects.toThrow(/Local data changed during migration preparation/);

    const check = db.transaction(['entries', 'syncOutbox'], 'readonly');
    const [records, outbox] = await Promise.all([
      new Promise<TestRow[]>((resolve, reject) => {
        const request = check.objectStore('entries').getAll();
        request.onsuccess = () => resolve(request.result as TestRow[]);
        request.onerror = () => reject(request.error);
      }),
      new Promise<TestRow[]>((resolve, reject) => {
        const request = check.objectStore('syncOutbox').getAll();
        request.onsuccess = () => resolve(request.result as TestRow[]);
        request.onerror = () => reject(request.error);
      }),
    ]);
    expect(records[0].name).toBe('Concurrent preparation edit');
    expect(records[0].sourceLocalId).toBeUndefined();
    expect(records[0].cloudId).toBeUndefined();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].mutationId).toBe('preparation-mutation');

    await migrateLegacyData('user-a', true);
    const retried = db.transaction('entries', 'readonly').objectStore('entries').getAll();
    const retriedRows = await new Promise<TestRow[]>((resolve, reject) => {
      retried.onsuccess = () => resolve(retried.result as TestRow[]);
      retried.onerror = () => reject(retried.error);
    });
    expect(retriedRows[0].name).toBe('Concurrent preparation edit');
    expect(retriedRows[0].sourceLocalId).toBe(localId);
    vi.unstubAllGlobals();
    await clearLocalDatabase(db);
  });

  it('aborts finalization when another tab edits a record and enqueues it during upload', async () => {
    const mock = createSupabaseMock();
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);

    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    await clearLocalDatabase(db);
    const seed = db.transaction('entries', 'readwrite');
    const seedComplete = transactionDone(seed);
    let localId = 0;
    const addRequest = seed.objectStore('entries').add({
      serialNo: 1,
      name: 'Before migration',
      mobileNumber: '',
      total: 10,
      advance: 0,
      remaining: 10,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    addRequest.onsuccess = () => { localId = Number(addRequest.result); };
    await seedComplete;

    mock.setBeforeRecordMigration(async () => {
      const request = indexedDB.open('RoznamchaDB', 6);
      const otherTabDb = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = otherTabDb.transaction(['entries', 'syncOutbox'], 'readwrite');
      const complete = transactionDone(transaction);
      const entries = transaction.objectStore('entries');
      const get = entries.get(localId);
      get.onsuccess = () => {
        const updated = { ...(get.result as TestRow), name: 'Edited in another tab' };
        entries.put(updated);
        transaction.objectStore('syncOutbox').put({
          key: `user-a:entries:${localId}`,
          mutationId: 'concurrent-mutation',
          userId: 'user-a',
          store: 'entries',
          localId,
          operation: 'upsert',
          payload: updated,
          createdAt: Date.now(),
          attempts: 0,
        });
      };
      await complete;
      otherTabDb.close();
    });

    const { migrateLegacyData } = await import('@/db/localMigration');
    await expect(migrateLegacyData('user-a', true))
      .rejects.toThrow(/Local data changed during migration/);

    const check = db.transaction(['entries', 'syncOutbox'], 'readonly');
    const [entryRows, queuedRows] = await Promise.all([
      new Promise<TestRow[]>((resolve, reject) => {
        const get = check.objectStore('entries').getAll();
        get.onsuccess = () => resolve(get.result as TestRow[]);
        get.onerror = () => reject(get.error);
      }),
      new Promise<TestRow[]>((resolve, reject) => {
        const get = check.objectStore('syncOutbox').getAll();
        get.onsuccess = () => resolve(get.result as TestRow[]);
        get.onerror = () => reject(get.error);
      }),
    ]);
    expect(entryRows[0].name).toBe('Edited in another tab');
    expect(queuedRows).toHaveLength(1);
    expect(queuedRows[0].mutationId).toBe('concurrent-mutation');
    await clearLocalDatabase(db);
  });

  it('accepts a content-identical natural-key record even when its cloud UUID differs', async () => {
    const mock = createSupabaseMock();
    mock.useDifferentNaturalKeyId('00000000-0000-4000-8000-000000000077');
    vi.mocked(getSupabaseClient).mockReturnValue(mock.client);

    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    await clearLocalDatabase(db);
    const seed = db.transaction('entries', 'readwrite');
    const complete = transactionDone(seed);
    seed.objectStore('entries').add({
      serialNo: 1,
      name: 'Matching natural key',
      mobileNumber: '',
      total: 10,
      advance: 0,
      remaining: 10,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2024-01-02',
      createdAt: Date.UTC(2024, 0, 2),
    });
    await complete;

    const { migrateLegacyData } = await import('@/db/localMigration');
    await migrateLegacyData('user-a', true);
    expect(mock.tables.get('journal_entries')?.[0].id)
      .toBe('00000000-0000-4000-8000-000000000077');
    await clearLocalDatabase(db);
  });

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
    transaction.objectStore('settings').put({ key: 'businessName', value: 'Local business' });
    transaction.objectStore('settings').put({
      key: 'displayPreferences',
      value: { theme: 'dark', columns: ['name', 'total'] },
    });
    transaction.objectStore('settings').put({
      key: 'invoiceCounter',
      date: '20240102',
      sequence: 8,
    });
    await complete;
    const seededEntriesRequest = db.transaction('entries', 'readonly')
      .objectStore('entries').getAll();
    const seededEntryIds = await new Promise<number[]>((resolve, reject) => {
      seededEntriesRequest.onsuccess = () => resolve(
        (seededEntriesRequest.result as TestRow[]).map((row) => Number(row.id)),
      );
      seededEntriesRequest.onerror = () => reject(seededEntriesRequest.error);
    });
    const firstEntryId = seededEntryIds[0];

    const { getMigrationPreview, getLocalMigrationState, getSyncInstallationId, migrateLegacyData } =
      await import('@/db/localMigration');
    const preview = await getMigrationPreview('user-a');
    expect(preview.counts.entries).toBe(2);
    expect(preview.deletedCounts.entries).toBe(1);
    expect(preview.counts.settings).toBe(6);

    await expect(migrateLegacyData('user-a', false)).rejects.toThrow(/Confirm that the local data belongs/);
    const installationId = await getSyncInstallationId();
    mock.tables.set('journal_entries', [{
      id: '00000000-0000-4000-8000-000000000099',
      user_id: 'user-a',
      installation_id: installationId,
      local_id: firstEntryId,
      serial_no: 1,
      name: 'Conflicting cloud value',
    }]);
    await expect(migrateLegacyData('user-a', true))
      .rejects.toThrow(new RegExp(`Migration conflict in entries local record ${firstEntryId}`));
    expect(mock.tables.get('customers')).toBeUndefined();
    mock.tables.delete('journal_entries');

    mock.tables.set('user_settings', [
      {
        user_id: 'user-a',
        key: 'companyName',
        value: 'Cloud company',
        source_installation_id: '00000000-0000-0000-0000-000000000000',
        sync_version: 1,
        updated_at: new Date().toISOString(),
      },
      {
        user_id: 'user-a',
        key: 'businessName',
        value: 'Cloud business',
        source_installation_id: '00000000-0000-0000-0000-000000000000',
        sync_version: 1,
        updated_at: new Date().toISOString(),
      },
      {
        user_id: 'user-a',
        key: 'displayPreferences',
        value: { theme: 'light', columns: ['name'] },
        source_installation_id: '00000000-0000-4000-8000-000000000012',
        sync_version: 1,
        updated_at: new Date().toISOString(),
      },
    ]);

    await expect(migrateLegacyData('user-a', true)).rejects.toThrow(/Temporary test network failure/);
    const afterFailure = db.transaction('entries', 'readonly').objectStore('entries').getAll();
    const retainedAfterFailure = await new Promise<TestRow[]>((resolve, reject) => {
      afterFailure.onsuccess = () => resolve(afterFailure.result as TestRow[]);
      afterFailure.onerror = () => reject(afterFailure.error);
    });
    expect(retainedAfterFailure).toHaveLength(2);
    expect(retainedAfterFailure.every((row) => row.ownerUserId === undefined)).toBe(true);

    mock.raceNextRecord();
    await expect(migrateLegacyData('user-a', false)).rejects.toThrow(/Migration conflict in expenses local record/);
    expect(mock.tables.get('expenses')?.[0].name).toBe('Concurrent cloud edit');
    mock.tables.delete('expenses');

    await expect(migrateLegacyData('user-a', false)).rejects.toMatchObject({
      name: 'MigrationSettingConflictError',
    });
    expect(mock.tables.get('user_settings')?.find((row) => row.key === 'companyName')?.value)
      .toBe('Cloud company');

    const resolutions = {
      companyName: {
        choice: 'cloud' as const,
        cloudVersion: 1,
        cloudValue: 'Cloud company',
      },
      businessName: {
        choice: 'local' as const,
        cloudVersion: 1,
        cloudValue: 'Cloud business',
      },
      displayPreferences: {
        choice: 'local' as const,
        cloudVersion: 1,
        cloudValue: { theme: 'light', columns: ['name'] },
      },
    };
    mock.raceInvoiceAllocation(20);
    mock.raceBeforeFinalVerification();
    await expect(migrateLegacyData('user-a', false, undefined, resolutions))
      .rejects.toThrow(/Atomic migration verification failed/);
    expect(mock.tables.get('migration_runs')?.[0].status).toBe('failed');
    const racedEntry = mock.tables.get('journal_entries')?.find((row) => row.local_id === firstEntryId);
    if (racedEntry) racedEntry.name = 'Ledger row';

    await migrateLegacyData('user-a', false, undefined, resolutions);

    await migrateLegacyData('user-a', false, undefined, resolutions);
    await migrateLegacyData('user-a', false, undefined, resolutions);

    expect(mock.tables.get('journal_entries')).toHaveLength(2);
    expect(mock.tables.get('customers')).toHaveLength(1);
    expect(mock.tables.get('expenses')).toHaveLength(1);
    expect(mock.tables.get('payments')).toHaveLength(1);
    expect(mock.tables.get('user_settings')).toHaveLength(7);
    expect(mock.tables.get('user_settings')?.find((row) =>
      row.key === 'companyName'
      && row.source_installation_id === '00000000-0000-0000-0000-000000000000',
    )?.value).toBe('Cloud company');
    expect(mock.tables.get('user_settings')?.find((row) =>
      row.key === 'businessName'
      && row.source_installation_id === '00000000-0000-0000-0000-000000000000',
    )?.value).toBe('Local business');
    expect(mock.tables.get('user_settings')?.find((row) =>
      row.key === 'displayPreferences'
      && row.source_installation_id === '00000000-0000-0000-0000-000000000000',
    )?.value).toEqual({ theme: 'dark', columns: ['name', 'total'] });
    expect(mock.tables.get('invoice_counters')).toHaveLength(1);
    expect(mock.tables.get('invoice_counters')?.[0].sequence).toBe(20);
    expect((await getLocalMigrationState('user-a'))?.status).toBe('verified');

    const finalRowsRequest = db.transaction('entries', 'readonly').objectStore('entries').getAll();
    const finalRows = await new Promise<TestRow[]>((resolve, reject) => {
      finalRowsRequest.onsuccess = () => resolve(finalRowsRequest.result as TestRow[]);
      finalRowsRequest.onerror = () => reject(finalRowsRequest.error);
    });
    expect(finalRows).toHaveLength(2);
    expect(finalRows.find((row) => row.isDeleted === true)?.ownerUserId).toBe('user-a');
    expect(finalRows.every((row) => {
      const cloud = mock.tables.get('journal_entries')?.find((remote) => remote.local_id === row.sourceLocalId);
      return row.cloudVersion === cloud?.sync_version;
    })).toBe(true);
  });
});
