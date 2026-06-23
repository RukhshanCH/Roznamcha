export interface JournalEntry {
  id?: number;
  serialNo: number;
  name: string;
  mobileNumber: string;
  
  total: number;
  advance: number;
  remaining: number;
  
  note: string;
  date: string;
  createdAt: number;
  
   // NEW FIELDS
  isBackup?: boolean;
  backupId?: string; // identifies which backup it came from
}

export interface CustomerEntry {
  id?: number;
  serialNo: number;
  name: string;
  mobileNumber: string;
  date: string;
  createdAt: number;
}

export interface ExpensesEntry {
  id?: number;
  serialNo: number;
  name: string;
  description: string;
  amount: number;
  date: string;
  createdAt: number;
}

export interface PaymentsEntry {
  id?: number;
  serialNo: number;
  name: string;
  description: string;
  amount: number;
  date: string;
  createdAt: number;
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
