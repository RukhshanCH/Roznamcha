import { atom } from 'jotai';
import type { CustomerEntry, JournalEntry } from '@/types';

export const sidebarCollapsedAtom = atom(false);

export const entriesAtom = atom<JournalEntry[]>([]);
export const customerAtom = atom<CustomerEntry[]>([]);

const todayStr = new Date().toISOString().split('T')[0];
export const selectedDateAtom = atom<string>(todayStr);

export const activeMenuAtom = atom('/roznamcha');

export const isModalOpenAtom = atom(false);
export const isModalOpenAtomCs = atom(false);

export const editingEntryAtom = atom<JournalEntry | null>(null);
export const editingEntryAtomCs = atom<CustomerEntry | null>(null);
