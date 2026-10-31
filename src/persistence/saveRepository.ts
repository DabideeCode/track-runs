import type { Diorama } from '@/domain/types';
import { parseDiorama } from './validators';

export const SAVE_KEY = 'wooden-diorama:v1';
export const CORRUPT_KEY = `${SAVE_KEY}:corrupt`;

interface RawFile {
  /** Every entry as stored, including any that fail validation. */
  entries: unknown[];
  /** The raw text when the file as a whole could not be understood. */
  unreadable: string | null;
}

function readFile(warn: boolean): RawFile {
  let text: string | null;
  try {
    text = localStorage.getItem(SAVE_KEY);
  } catch (error) {
    if (warn) console.warn('Could not read saved dioramas:', error);
    return { entries: [], unreadable: null };
  }
  if (text === null) return { entries: [], unreadable: null };

  try {
    const file: unknown = JSON.parse(text);
    if (
      typeof file === 'object' &&
      file !== null &&
      (file as { version?: unknown }).version === 1 &&
      Array.isArray((file as { dioramas?: unknown }).dioramas)
    ) {
      return { entries: (file as { dioramas: unknown[] }).dioramas, unreadable: null };
    }
  } catch {
    // Handled below, the same as a file with the wrong shape.
  }
  if (warn) console.warn('Saved dioramas could not be read, so the list is empty.');
  return { entries: [], unreadable: text };
}

function writeFile(entries: unknown[]): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: entries }));
    return true;
  } catch (error) {
    console.warn('Could not save dioramas:', error);
    return false;
  }
}

/** Keeps a copy of a file this app cannot read, so a new save never destroys it. */
function preserveUnreadable(text: string): void {
  try {
    if (localStorage.getItem(CORRUPT_KEY) === null) localStorage.setItem(CORRUPT_KEY, text);
  } catch (error) {
    console.warn('Could not keep a copy of unreadable saves:', error);
  }
}

const entryId = (entry: unknown): unknown => (entry as { id?: unknown } | null)?.id;

export function listDioramas({ warn = true } = {}): Diorama[] {
  const dioramas: Diorama[] = [];
  readFile(warn).entries.forEach((entry, position) => {
    const diorama = parseDiorama(entry);
    if (diorama) dioramas.push(diorama);
    else if (warn) console.warn(`Skipped saved diorama at position ${position}: its data is not valid.`);
  });
  return dioramas.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function writeDiorama(diorama: Diorama): boolean {
  const { entries, unreadable } = readFile(false);
  if (unreadable !== null) preserveUnreadable(unreadable);
  const index = entries.findIndex((entry) => entryId(entry) === diorama.id);
  const next = [...entries];
  if (index >= 0) next[index] = diorama;
  else next.push(diorama);
  return writeFile(next);
}

export function removeDiorama(id: string): boolean {
  const { entries } = readFile(false);
  return writeFile(entries.filter((entry) => entryId(entry) !== id));
}
