export interface JournalEntry {
  id?: number;
  serialNo: number;
  name: string;
  mobileNumber: string;
  
  total: number;
  advance: number;
  remaining: number;
  remainingPlus: number;
  
  note: string;
  date: string;
  createdAt: number;
  
   // NEW FIELDS
  isBackup?: boolean;
  backupId?: string; // identifies which backup it came from

  isDeleted?: boolean;
  deletedAt?: string;
}

export interface CustomerEntry {
  id?: number;
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
