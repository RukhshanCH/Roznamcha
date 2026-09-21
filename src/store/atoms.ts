import { atom } from 'jotai';
import type { CustomerEntry, ExpensesEntry, JournalEntry, PaymentsEntry } from '@/types';
import type { Plan, Subscription } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export const sidebarCollapsedAtom = atom(false);

export const entriesAtom = atom<JournalEntry[]>([]);
export const customerAtom = atom<CustomerEntry[]>([]);
export const expensesAtom = atom<ExpensesEntry[]>([]);
export const paymentsAtom = atom<PaymentsEntry[]>([]);

const today = new Date();
today.setMinutes(today.getMinutes() - today.getTimezoneOffset());

const todayStr = today.toISOString().split('T')[0];
export const selectedDateAtom = atom<string>(todayStr);

export const activeMenuAtom = atom('/roznamcha');

export const isModalOpenAtom = atom(false);
export const isModalOpenAtomCs = atom(false);
export const isModalOpenAtomEx = atom(false);
export const isModalOpenAtomPy = atom(false);

export const editingEntryAtom = atom<JournalEntry | null>(null);
export const editingEntryAtomCs = atom<CustomerEntry | null>(null);
export const editingEntryAtomEx = atom<ExpensesEntry | null>(null);
export const editingEntryAtomPy = atom<PaymentsEntry | null>(null);

export const searchAtom = atom("");

export const showAllAtom = atom(false);

export const remainingPlusAtom = atom(false);

export const showModalAtom = atom(false);

export const alertAtom = atom(false);
export const alertTypeAtom = atom('');
export const alertMessageAtom = atom('');

// ── Auth & Billing ──────────────────────────────────────────────────────────
// Null = not yet loaded; User object when authenticated
export const userAtom = atom<User | null>(null);

// Current plan — defaults to 'free' until subscription is fetched
export const planAtom = atom<Plan>('free');

// Full subscription details (for the billing page)
export const subscriptionAtom = atom<Subscription | null>(null);

// Whether auth + subscription data has finished loading
export const authLoadingAtom = atom(true);