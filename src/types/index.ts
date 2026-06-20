export interface JournalEntry {
  id?: number;
  serialNo: number;
  name: string;
  mobileNumber: string;
  cashAmount: number;
  payment: number;
  receipt: number;
  balance: number;
  remainingAmount: number;
  previousBalance: number;
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
