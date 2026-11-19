export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type SyncFields = {
  id: string;
  user_id: string;
  installation_id: string;
  local_id: number;
  sync_version: number;
  updated_at: string;
};

type DeletableFields = {
  is_deleted: boolean;
  deleted_at: string | null;
};

type JournalRow = SyncFields & DeletableFields & {
  serial_no: number;
  name: string;
  mobile_number: string;
  total: number;
  advance: number;
  remaining: number;
  remaining_plus: number;
  note: string;
  payment_method: 'cash' | 'online';
  date: string;
  created_at: string;
  debt_id: string | null;
  is_backup: boolean;
  backup_id: string | null;
};

type CustomerRow = SyncFields & DeletableFields & {
  serial_no: number;
  name: string;
  mobile_number: string;
  date: string;
  created_at: string;
};

type AmountRow = SyncFields & DeletableFields & {
  serial_no: number;
  name: string;
  description: string;
  amount: number;
  date: string;
  created_at: string;
};

type NewRecord<Row extends SyncFields> =
  Omit<Row, 'sync_version' | 'updated_at'> & {
    sync_version?: number;
    updated_at?: string;
  };

export type Database = {
  public: {
    Tables: {
      journal_entries: Table<JournalRow, NewRecord<JournalRow>>;
      customers: Table<CustomerRow, NewRecord<CustomerRow>>;
      expenses: Table<AmountRow, NewRecord<AmountRow>>;
      payments: Table<AmountRow, NewRecord<AmountRow>>;
      user_settings: Table<{
        user_id: string;
        key: string;
        value: Json;
        source_installation_id: string;
        sync_version: number;
        updated_at: string;
      }, {
        user_id: string;
        key: string;
        value: Json;
        source_installation_id: string;
        sync_version?: number;
        updated_at?: string;
      }>;
      invoice_counters: Table<{
        user_id: string;
        invoice_date: string;
        sequence: number;
        updated_at: string;
      }, {
        user_id: string;
        invoice_date: string;
        sequence: number;
        updated_at?: string;
      }>;
      migration_runs: Table<{
        user_id: string;
        installation_id: string;
        source_db_version: number;
        status: 'pending' | 'running' | 'failed' | 'verified';
        store_counts: Json;
        last_error: string | null;
        started_at: string;
        updated_at: string;
        completed_at: string | null;
      }, {
        user_id: string;
        installation_id: string;
        source_db_version: number;
        status: 'pending' | 'running' | 'failed' | 'verified';
        store_counts?: Json;
        last_error?: string | null;
        started_at?: string;
        updated_at?: string;
        completed_at?: string | null;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      next_invoice_sequence: {
        Args: { p_date: string };
        Returns: number;
      };
      migrate_invoice_counter: {
        Args: { p_invoice_date: string; p_sequence: number };
        Returns: number;
      };
      sync_user_record: {
        Args: { p_store: string; p_payload: Json; p_expected_version: number | null };
        Returns: Array<{ applied: boolean; row_id: string | null; sync_version: number | null }>;
      };
      delete_user_record: {
        Args: { p_store: string; p_id: string; p_expected_version: number | null };
        Returns: Array<{ applied: boolean; sync_version: number | null }>;
      };
      sync_user_setting: {
        Args: {
          p_key: string;
          p_value: Json;
          p_installation_id: string;
          p_expected_version: number | null;
        };
        Returns: Array<{ applied: boolean; sync_version: number | null; updated_at: string | null }>;
      };
      migrate_user_setting: {
        Args: {
          p_key: string;
          p_value: Json;
          p_resolution?: 'local' | 'cloud' | null;
          p_expected_version?: number | null;
          p_expected_cloud_value?: Json | null;
        };
        Returns: Array<{
          applied: boolean;
          value: Json | null;
          sync_version: number | null;
          updated_at: string | null;
          conflict: boolean;
        }>;
      };
      migrate_user_record: {
        Args: { p_store: string; p_payload: Json };
        Returns: Array<{ applied: boolean; row_id: string | null; sync_version: number | null }>;
      };
      verify_user_migration: {
        Args: {
          p_installation_id: string;
          p_source_db_version: number;
          p_store_counts: Json;
          p_records: Json;
          p_settings: Json;
          p_invoice_counter: Json;
        };
        Returns: Array<{ verified: boolean; record_versions: Json }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
