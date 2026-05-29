import { atom } from 'jotai';
import type { JournalEntry } from '@/types';

export const sidebarCollapsedAtom = atom(false);

export const entriesAtom = atom<JournalEntry[]>([]);

const todayStr = new Date().toISOString().split('T')[0];
export const selectedDateAtom = atom<string>(todayStr);

export const activeMenuAtom = atom('/roznamcha');

export const isModalOpenAtom = atom(false);
export const editingEntryAtom = atom<JournalEntry | null>(null);
