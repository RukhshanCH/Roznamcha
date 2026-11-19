export interface JournalEntry {
  id?: number;
  ownerUserId?: string;
  cloudId?: string;
  cloudVersion?: number;
  syncStatus?: 'pending' | 'synced' | 'conflict';
  sourceInstallationId?: string;
  sourceLocalId?: number;
  serialNo: number;
  name: string;
  mobileNumber: string;
  
  total: number;
  advance: number;
  remaining: number;
  remainingPlus: number;
  
  note: string;
  paymentMethod: 'cash' | 'online';
  date: string;
  createdAt: number;
  
  debtId: string; 
  
   // NEW FIELDS
  isBackup?: boolean;
  backupId?: string; // identifies which backup it came from

  isDeleted?: boolean;
  deletedAt?: string;
}

export interface CustomerEntry {
  id?: number;
  ownerUserId?: string;
  cloudId?: string;
  cloudVersion?: number;
  syncStatus?: 'pending' | 'synced' | 'conflict';
  sourceInstallationId?: string;
  sourceLocalId?: number;
  serialNo: number;
  name: string;
  mobileNumber: string;
  date: string;
  createdAt: number;

  isDeleted?: boolean;
  deletedAt?: string;
}

export interface ExpensesEntry {
  id?: number;
  ownerUserId?: string;
  cloudId?: string;
  cloudVersion?: number;
  syncStatus?: 'pending' | 'synced' | 'conflict';
  sourceInstallationId?: string;
  sourceLocalId?: number;
  serialNo: number;
  name: string;
  description: string;
  amount: number;
  date: string;
  createdAt: number;

  isDeleted?: boolean;
  deletedAt?: string;
}

export interface PaymentsEntry {
  id?: number;
  ownerUserId?: string;
  cloudId?: string;
  cloudVersion?: number;
  syncStatus?: 'pending' | 'synced' | 'conflict';
  sourceInstallationId?: string;
  sourceLocalId?: number;
  serialNo: number;
  name: string;
  description: string;
  amount: number;
  date: string;
  createdAt: number;

  isDeleted?: boolean;
  deletedAt?: string;
}

export interface TrashItem {
  id: number;
  serialNo: number;
  store: "journal" | "customers" | "expenses" | "payments";
  type: "Journal" | "Customer" | "Expense" | "Payment";
  name: string;
  mobileNumber?: string;
  description?: string;
  amount?: number;
  date: string;
  deletedAt?: string;
  original: JournalEntry | CustomerEntry | ExpensesEntry | PaymentsEntry;
}

export interface MenuItem {
  icon: string;
  label: string;
  path: string;
}

export interface SummaryCardData {
  label: string;
  value: string;
  icon: string;
  variant: 'blue' | 'green' | 'gold' | 'white';
}

export type LocalDataStore = 'entries' | 'customers' | 'expenses' | 'payments';

export interface SyncOutboxRecord {
  key: string;
  mutationId: string;
  userId: string;
  store: LocalDataStore | 'settings';
  localId?: number;
  settingKey?: string;
  operation: 'upsert' | 'delete';
  cloudId?: string;
  cloudVersion?: number;
  payload?: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface SyncTombstoneRecord {
  key: string;
  userId: string;
  store: LocalDataStore;
  cloudId: string;
  installationId: string;
  sourceLocalId: number;
  deletedAt: number;
}
