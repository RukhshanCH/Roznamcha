import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  isSupabaseConfigured: () => true,
}));

type TestRow = Record<string, unknown>;
type TestError = { message: string };
type QueryResult = { data: TestRow[]; error: TestError | null };

interface TestQuery extends PromiseLike<QueryResult> {
  select(columns?: string): TestQuery;
  eq(column: string, value: unknown): TestQuery;
  order(column: string, options?: { ascending?: boolean }): TestQuery;
  limit(count: number): TestQuery;
  range(from: number, to: number): TestQuery;
  maybeSingle(): Promise<{ data: TestRow | null; error: TestError | null }>;
  upsert(values: TestRow, options?: { onConflict?: string }): Promise<{ error: TestError | null }>;
}

const cloudTables = new Map<string, TestRow[]>();
const userId = 'user-a';
const installationId = '00000000-0000-4000-8000-000000000001';
const invoiceSequences = new Map<string, number>();

function createSupabaseMock() {
  function from(table: string): TestQuery {
    const filters = new Map<string, unknown>();
    let range: [number, number] | null = null;
    let orderBy = '';
    let orderAscending = true;
    let limitCount: number | null = null;
    const builder: TestQuery = {
      select() {
        return builder;
      },
      eq(column, value) {
        filters.set(column, value);
        return builder;
      },
      order(column, options) {
        orderBy = column;
        orderAscending = options?.ascending ?? true;
        return builder;
      },
      limit(count) {
        limitCount = count;
        return builder;
      },
      range(from, to) {
        range = [from, to];
        return builder;
      },
      async maybeSingle() {
        const row = (cloudTables.get(table) ?? []).filter((item) =>
          [...filters].every(([key, value]) => item[key] === value),
        ).sort((a, b) => orderAscending
          ? String(a[orderBy] ?? '').localeCompare(String(b[orderBy] ?? ''))
          : String(b[orderBy] ?? '').localeCompare(String(a[orderBy] ?? '')))
          .slice(0, limitCount ?? 1)[0];
        return { data: row ?? null, error: null };
      },
      async upsert(values, options) {
        const rows = cloudTables.get(table) ?? [];
        const keys = options?.onConflict?.split(',') ?? [];
        const index = rows.findIndex((row) => keys.length > 0
          && keys.every((key) => row[key] === values[key]));
        if (index >= 0) rows[index] = { ...rows[index], ...values, sync_version: Number(rows[index].sync_version ?? 0) + 1 };
        else rows.push({ ...values, sync_version: 1, updated_at: new Date().toISOString() });
        cloudTables.set(table, rows);
        return { error: null };
      },
      then(onfulfilled, onrejected) {
        let rows = (cloudTables.get(table) ?? []).filter((row) =>
          [...filters].every(([key, value]) => row[key] === value),
        );
        if (orderBy) rows = [...rows].sort((a, b) => orderAscending
          ? String(a[orderBy]).localeCompare(String(b[orderBy]))
          : String(b[orderBy]).localeCompare(String(a[orderBy])));
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === 'next_invoice_sequence') {
      const date = String(args.p_date);
      const sequence = (invoiceSequences.get(date) ?? 0) + 1;
      invoiceSequences.set(date, sequence);
      return { data: sequence, error: null };
    }

    if (name === 'sync_user_setting') {
      const rows = cloudTables.get('user_settings') ?? [];
      const existing = rows.find((row) => row.user_id === userId
        && row.key === args.p_key
        && row.source_installation_id === args.p_installation_id);
      if (args.p_value === null) {
        // New migration: a null value deletes the row instead of failing
        // on the jsonb NOT NULL constraint.
        if (existing) rows.splice(rows.indexOf(existing), 1);
        cloudTables.set('user_settings', rows);
        return { data: [{ applied: true, sync_version: null, updated_at: new Date().toISOString() }], error: null };
      }
      if (!existing) {
        if (args.p_expected_version !== null) {
          return { data: [{ applied: false, sync_version: null, updated_at: null }], error: null };
        }
        const created = {
          user_id: userId,
          key: args.p_key,
          value: args.p_value,
          source_installation_id: args.p_installation_id,
          sync_version: 1,
          updated_at: new Date().toISOString(),
        };
        rows.push(created);
        cloudTables.set('user_settings', rows);
        return { data: [{ applied: true, sync_version: 1, updated_at: created.updated_at }], error: null };
      }
      if (existing.sync_version !== args.p_expected_version) {
        return {
          data: [{ applied: false, sync_version: existing.sync_version, updated_at: existing.updated_at }],
          error: null,
        };
      }
      existing.value = args.p_value;
      existing.sync_version = Number(existing.sync_version) + 1;
      existing.updated_at = new Date().toISOString();
      return {
        data: [{ applied: true, sync_version: existing.sync_version, updated_at: existing.updated_at }],
        error: null,
      };
    }

    if (name === 'sync_user_record') {
      const store = String(args.p_store);
      const payload = args.p_payload as TestRow;
      const table = store === 'entries' ? 'journal_entries' : store;
      const rows = cloudTables.get(table) ?? [];
      if (payload.user_id !== userId) return { data: null, error: { message: 'RLS denied' } };
      const existing = rows.find((row) => row.id === payload.id && row.user_id === userId);
      const expected = args.p_expected_version as number | null;
      if (!existing && expected === null) {
        const inserted = { ...payload, sync_version: 1, updated_at: new Date().toISOString() };
        rows.push(inserted);
        cloudTables.set(table, rows);
        return { data: [{ applied: true, row_id: inserted.id, sync_version: 1 }], error: null };
      }
      if (!existing) return { data: [{ applied: false, row_id: null, sync_version: null }], error: null };
      if (expected !== existing.sync_version) {
        return { data: [{ applied: false, row_id: existing.id, sync_version: existing.sync_version }], error: null };
      }
      Object.assign(existing, payload, {
        sync_version: Number(existing.sync_version) + 1,
        updated_at: new Date().toISOString(),
      });
      return { data: [{ applied: true, row_id: existing.id, sync_version: existing.sync_version }], error: null };
    }

    if (name === 'delete_user_record') {
      const table = args.p_store === 'entries' ? 'journal_entries' : String(args.p_store);
      const rows = cloudTables.get(table) ?? [];
      const row = rows.find((item) => item.id === args.p_id && item.user_id === userId);
      if (!row) return { data: [{ applied: true, sync_version: null }], error: null };
      if (row.is_deleted === true) return { data: [{ applied: true, sync_version: row.sync_version }], error: null };
      if (row.sync_version !== args.p_expected_version) {
        return { data: [{ applied: false, sync_version: row.sync_version }], error: null };
      }
      row.is_deleted = true;
      row.deleted_at = new Date().toISOString();
      row.sync_version = Number(row.sync_version) + 1;
      return { data: [{ applied: true, sync_version: row.sync_version }], error: null };
    }
    return { data: null, error: { message: `Unknown RPC ${name}` } };
  }

  return { from, rpc };
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

describe('offline-first cloud synchronization', () => {
  beforeEach(async () => {
    cloudTables.clear();
    invoiceSequences.clear();
    vi.stubGlobal('navigator', { onLine: true });
    const supabase = await import('@/lib/supabase');
    vi.mocked(supabase.getSupabaseClient).mockReturnValue(createSupabaseMock() as never);
    const { initDB } = await import('@/db/indexedDB');
    const db = await initDB();
    const stores = [
      'entries',
      'customers',
      'expenses',
      'payments',
      'settings',
      'syncOutbox',
      'syncTombstones',
    ];
    const transaction = db.transaction(stores, 'readwrite');
    const complete = transactionDone(transaction);
    for (const store of stores) transaction.objectStore(store).clear();
    await complete;
    const { setActiveSyncContext } = await import('@/db/syncContext');
    setActiveSyncContext(userId, installationId);
  });

  it('pushes local writes, pulls remote rows, and keeps ownership isolated', async () => {
    const { addEntry, getAllEntries } = await import('@/db/indexedDB');
    const { synchronizeUserData } = await import('@/db/cloudSync');
    await addEntry({
      serialNo: 1,
      name: 'Local row',
      mobileNumber: '',
      total: 25,
      advance: 0,
      remaining: 25,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2025-01-02',
      createdAt: Date.UTC(2025, 0, 2),
      debtId: 'debt-a',
    });

    await synchronizeUserData(userId, installationId);
    expect(cloudTables.get('journal_entries')).toHaveLength(1);

    const { setActiveSyncContext } = await import('@/db/syncContext');
    setActiveSyncContext('user-b', '00000000-0000-4000-8000-000000000002');
    expect(await getAllEntries()).toHaveLength(0);
    await addEntry({
      serialNo: 1,
      name: 'Other account row',
      mobileNumber: '',
      total: 10,
      advance: 0,
      remaining: 10,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2025-01-02',
      createdAt: Date.UTC(2025, 0, 2),
      debtId: 'debt-b',
    });
    expect((await getAllEntries()).map((entry) => entry.name)).toEqual(['Other account row']);
  });

  it('uses Supabase-backed domain facades for online reads, writes, and trash', async () => {
    const repository = await import('@/db/roznamcha');
    const id = await repository.addEntry({
      serialNo: 1,
      name: 'Cloud primary row',
      mobileNumber: '',
      total: 40,
      advance: 0,
      remaining: 40,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2025-02-01',
      createdAt: Date.UTC(2025, 1, 1),
      debtId: 'debt-primary',
    });
    expect(cloudTables.get('journal_entries')).toHaveLength(1);
    expect((await repository.getAllEntries())[0].name).toBe('Cloud primary row');

    await repository.updateEntry({
      ...(await repository.getAllEntries())[0],
      name: 'Cloud updated row',
    });
    expect(cloudTables.get('journal_entries')?.[0].name).toBe('Cloud updated row');

    await repository.deleteEntry(id);
    expect(cloudTables.get('journal_entries')?.[0].is_deleted).toBe(true);
    expect(await repository.getAllEntries()).toHaveLength(0);
    expect(await (await import('@/db/trash')).getTrashEntries()).toHaveLength(1);
  });

  it('syncs soft and permanent deletes without removing cloud tombstones', async () => {
    const { addEntry, deleteEntry, permanentlyDeleteEntry } = await import('@/db/indexedDB');
    const { synchronizeUserData } = await import('@/db/cloudSync');
    const id = await addEntry({
      serialNo: 1,
      name: 'Deleted row',
      mobileNumber: '',
      total: 0,
      advance: 0,
      remaining: 0,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2025-01-02',
      createdAt: Date.UTC(2025, 0, 2),
      debtId: 'debt-delete',
    });
    await synchronizeUserData(userId, installationId);
    await deleteEntry(id);
    await synchronizeUserData(userId, installationId);

    const cloudRow = cloudTables.get('journal_entries')?.[0];
    expect(cloudRow?.is_deleted).toBe(true);
    await permanentlyDeleteEntry(id);
    await synchronizeUserData(userId, installationId);
    expect(cloudTables.get('journal_entries')).toHaveLength(1);
    expect(cloudTables.get('journal_entries')?.[0].is_deleted).toBe(true);
    const db = await (await import('@/db/indexedDB')).initDB();
    const tombstones = await new Promise<TestRow[]>((resolve, reject) => {
      const request = db.transaction('syncTombstones', 'readonly')
        .objectStore('syncTombstones').getAll();
      request.onsuccess = () => resolve(request.result as TestRow[]);
      request.onerror = () => reject(request.error);
    });
    expect(tombstones).toHaveLength(1);
  });

  it('syncs settings without exposing them to a different browser account', async () => {
    const { getSetting, setSetting } = await import('@/db/indexedDB');
    const { synchronizeUserData } = await import('@/db/cloudSync');
    await setSetting('companyName', 'My ledger');
    await synchronizeUserData(userId, installationId);
    expect(cloudTables.get('user_settings')).toHaveLength(1);
    expect(await getSetting('companyName')).toBe('My ledger');

    const { setActiveSyncContext } = await import('@/db/syncContext');
    setActiveSyncContext('user-b', '00000000-0000-4000-8000-000000000002');
    expect(await getSetting('companyName')).toBeUndefined();
  });

  it('writes and reads settings through Supabase', async () => {
    const settings = await import('@/db/core');
    await settings.setSetting('companyName', 'Cloud company');
    expect(cloudTables.get('user_settings')?.[0].value).toBe('Cloud company');
    expect(await settings.getSetting('companyName')).toBe('Cloud company');
  });

  it('removes a setting (null value) without a sync error and clears the cloud row', async () => {
    const settings = await import('@/db/core');
    await settings.setSetting('profilePic', 'data:image/png;base64,AAAA');
    expect(cloudTables.get('user_settings')).toHaveLength(1);
    await settings.setSetting<string | null>('profilePic', null);
    expect(cloudTables.get('user_settings')).toHaveLength(0);
    expect(await settings.getSetting('profilePic')).toBeUndefined();
    // A fresh write after removal inserts cleanly (no stale expected version).
    await settings.setSetting('profilePic', 'data:image/png;base64,BBBB');
    expect(cloudTables.get('user_settings')?.[0].value).toBe('data:image/png;base64,BBBB');
  });

  it('updates a setting pulled from another installation using the shared cloud version', async () => {
    const settings = await import('@/db/core');
    const sync = await import('@/db/cloudSync');
    const canonicalInstallationId = '00000000-0000-0000-0000-000000000000';
    await settings.setSetting('companyName', 'Device A');
    await sync.synchronizeUserData(userId, installationId);

    const { setActiveSyncContext } = await import('@/db/syncContext');
    setActiveSyncContext(userId, '00000000-0000-4000-8000-000000000002');
    expect(await settings.getSetting('companyName')).toBe('Device A');
    await settings.setSetting('companyName', 'Device B');

    const [remote] = cloudTables.get('user_settings') ?? [];
    expect(remote?.source_installation_id).toBe(canonicalInstallationId);
    expect(remote?.value).toBe('Device B');
    expect(remote?.sync_version).toBe(2);
    expect(await sync.getSyncConflicts(userId)).toHaveLength(0);
  });

  it('surfaces concurrent setting edits and supports explicit local resolution', async () => {
    const settings = await import('@/db/core');
    const sync = await import('@/db/cloudSync');
    await settings.setSetting('companyName', 'Initial');
    const remote = cloudTables.get('user_settings')?.[0];
    if (!remote) throw new Error('Expected the cloud setting to be created.');
    remote.value = 'Changed on another device';
    remote.sync_version = 2;

    await expect(settings.setSetting('companyName', 'Changed here'))
      .rejects.toThrow(/conflict needs review/);
    const [conflict] = await sync.getSyncConflicts(userId);
    expect(conflict?.store).toBe('settings');
    await sync.resolveSyncConflict(userId, conflict, 'local');
    await sync.synchronizeUserData(userId, installationId);

    expect(cloudTables.get('user_settings')?.[0].value).toBe('Changed here');
    expect(await sync.getSyncConflicts(userId)).toHaveLength(0);
  });

  it('restores JSON backups into the local outbox without trusting embedded ownership metadata', async () => {
    const { getAllEntries, importBackup, deleteEntry } = await import('@/db/indexedDB');
    const { synchronizeUserData } = await import('@/db/cloudSync');
    const backupText = JSON.stringify({
      version: 1,
      backupId: 'backup-once',
      entries: [{
        ownerUserId: 'user-b',
        cloudId: '00000000-0000-4000-8000-000000000099',
        serialNo: 1,
        name: 'Restored row',
        mobileNumber: '',
        total: 15,
        advance: 0,
        remaining: 15,
        remainingPlus: 0,
        note: '',
        paymentMethod: 'cash',
        date: '2025-01-02',
        createdAt: Date.UTC(2025, 0, 2),
        debtId: 'debt-backup',
      }],
    });
    const result = await importBackup({ text: async () => backupText } as File);
    expect(result.imported).toBe(1);
    const [restored] = await getAllEntries();
    expect(restored.ownerUserId).toBe(userId);
    expect(restored.cloudId).not.toBe('00000000-0000-4000-8000-000000000099');

    await synchronizeUserData(userId, installationId);
    expect(cloudTables.get('journal_entries')?.[0].user_id).toBe(userId);
    await deleteEntry(restored.id!);
    await expect(importBackup({ text: async () => backupText } as File))
      .rejects.toThrow('Backup already imported');
  });

  it('uses the server invoice sequence online and a device-specific suffix offline', async () => {
    const { generateInvoiceNumber } = await import('@/db/indexedDB');
    vi.stubGlobal('navigator', { onLine: true });
    const online = await generateInvoiceNumber();
    expect(online.invoiceNo).toMatch(/^INV-\d{8}-001$/);

    vi.stubGlobal('navigator', { onLine: false });
    const offline = await generateInvoiceNumber();
    expect(offline.invoiceNo).toMatch(/^INV-\d{8}-002-[A-F0-9]{6}$/);
    vi.unstubAllGlobals();
  });

  it('preserves local edits until a version conflict is explicitly resolved', async () => {
    const { addEntry, getAllEntries, updateEntry } = await import('@/db/indexedDB');
    const { getSyncConflicts, resolveSyncConflict, synchronizeUserData } = await import('@/db/cloudSync');
    const id = await addEntry({
      serialNo: 1,
      name: 'Original',
      mobileNumber: '',
      total: 50,
      advance: 0,
      remaining: 50,
      remainingPlus: 0,
      note: '',
      paymentMethod: 'cash',
      date: '2025-01-02',
      createdAt: Date.UTC(2025, 0, 2),
      debtId: 'debt-conflict',
    });
    await synchronizeUserData(userId, installationId);

    const remote = cloudTables.get('journal_entries')?.[0];
    if (!remote) throw new Error('Expected the initial cloud row.');
    remote.name = 'Edited elsewhere';
    remote.sync_version = 2;

    await updateEntry({
      ...(await getAllEntries())[0],
      name: 'Edited on this device',
    });
    await synchronizeUserData(userId, installationId);
    expect((await getAllEntries()).find((entry) => entry.id === id)?.name).toBe('Edited on this device');

    const [conflict] = await getSyncConflicts(userId);
    expect(conflict).toBeDefined();
    await resolveSyncConflict(userId, conflict, 'cloud');
    expect((await getAllEntries()).find((entry) => entry.id === id)?.name).toBe('Edited elsewhere');
    expect(await getSyncConflicts(userId)).toHaveLength(0);
  });
});
