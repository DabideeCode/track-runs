/**
 * Save repository: reads and writes the SaveFile under `wooden-diorama:v1`
 * (design section 2; Requirements 3.2, 3.4, 5.2, 5.5, 6.6, 22.1, 22.12, 22.13,
 * 24.1 to 24.3, 24.7, 24.8, 35.5, 36.1, 36.3 to 36.5, 36.7).
 *
 * Every method returns a typed result and never throws.
 *
 * Write algorithm (upsert, rename, remove):
 * 1. Read and parse the stored value. Internal reads log nothing; only
 *    `list()` logs warnings, so one menu load logs once per bad entry.
 * 2. Work out the change. `rename` and `remove` of an id that has no valid
 *    entry return `not_found` before anything is written.
 * 3. If the stored value is corrupt, copy it character for character to a new
 *    `wooden-diorama:v1:corrupt-<ISO>` key (suffix `-2`, `-3`, ... when the key
 *    is taken). Existing backup keys are never written. If the backup write
 *    throws, return `backup_failed` and leave the main key untouched.
 * 4. Start from the raw stored `dioramas` array, so invalid entries stay
 *    unchanged and in place. Replace the target entry by index, or append.
 * 5. One `setItem` of `{ version: 1, dioramas }`. If it throws, the old value
 *    remains (storage replaces values atomically) and `write_failed` is returned.
 *
 * Decisions recorded here:
 * - Which entry an id refers to: the first entry that validates with that id
 *   (the same entry `list()` shows). `rename` and `remove` only act on such a
 *   valid entry. `upsert` falls back to the first raw entry whose own `id`
 *   field equals the id, even if that entry is invalid, and replaces it, so
 *   saving never creates a second entry for an id already in the file. Other
 *   entries, including invalid duplicates of the id, are left unchanged.
 * - `createdAt` on upsert: the stored valid entry's value; otherwise the
 *   draft's `createdAt` when it is a valid ISO 8601 string; otherwise now.
 * - `updatedAt` is now in UTC, clamped so it is never earlier than
 *   `createdAt` when the clock has gone backwards.
 * - Thumbnail on upsert: exactly the draft's thumbnail. A draft without one
 *   (capture failed) stores no `thumbnail` field, so an old thumbnail is not
 *   kept (Requirement 6.4). Rename keeps the stored thumbnail (6.6).
 */
import { nanoid } from 'nanoid';
import { validateName } from '@/domain/naming';
import {
  SAVE_FILE_VERSION,
  isIsoDateTime,
  parseSaveFile,
  sortNewestFirst,
  validateDiorama,
} from '@/domain/saveFormat';
import type { Diorama, Piece } from '@/domain/types';
import type { KeyValueStorage, WarnFn } from './storage';

/** localStorage key of the SaveFile. */
export const SAVE_KEY = 'wooden-diorama:v1';

/** Prefix of the backup keys for a corrupt SaveFile; an ISO timestamp follows. */
export const CORRUPT_BACKUP_PREFIX = 'wooden-diorama:v1:corrupt-';

/**
 * The current editor state passed to `upsert`, as the store holds it.
 * `id` is null for a diorama that has never been saved.
 */
export interface DioramaDraft {
  id: string | null;
  name: string;
  setting: Diorama['setting'];
  startFacing: Diorama['startFacing'];
  pieces: readonly Piece[];
  /** Data URL of the captured scene; null or undefined when capture failed. */
  thumbnail?: string | null;
  /** The open diorama's `createdAt`, used only when the stored entry is gone. */
  createdAt?: string | null;
}

export type WriteFailure =
  | 'write_failed' // a storage read or write threw
  | 'backup_failed' // the corrupt-data backup could not be written
  | 'not_found' // rename or remove of an id with no valid entry
  | 'invalid_name' // rename to a name that is not 1 to 40 characters after trimming
  | 'invalid'; // the draft does not form a valid diorama

export type WriteResult = { ok: true; diorama: Diorama } | { ok: false; reason: WriteFailure };

export interface SaveRepository {
  /** Valid dioramas newest first; one warning per skipped entry, or one for a corrupt file. */
  list(): Diorama[];
  /** The valid diorama with this id, or null. Logs nothing. */
  get(id: string): Diorama | null;
  /** Saves the draft: a new entry when it has no stored entry, otherwise a replacement in place. */
  upsert(draft: DioramaDraft): WriteResult;
  /** Stores the trimmed name; keeps `id`, `createdAt` and `thumbnail`. */
  rename(id: string, name: string): WriteResult;
  /** Removes the diorama; the result carries the removed entry. */
  remove(id: string): WriteResult;
}

export interface SaveRepositoryDeps {
  storage: KeyValueStorage;
  /** Clock; defaults to `new Date()`. */
  now?: () => Date;
  /** Diorama id generator; defaults to `nanoid`. */
  newId?: () => string;
  /** Warning sink; defaults to `console.warn`. */
  warn?: WarnFn;
}

const defaultWarn: WarnFn = (message, data) => {
  if (data === undefined) console.warn(message);
  else console.warn(message, data);
};

/** Upper bound on id generation attempts; reached only by a broken generator. */
const MAX_ID_ATTEMPTS = 1000;

type Read =
  | { ok: true; status: 'missing' }
  | { ok: true; status: 'corrupt'; raw: string }
  | { ok: true; status: 'ok'; entries: unknown[] }
  | { ok: false };

/** Own string `id` of a raw entry, or undefined. */
function rawId(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(entry, 'id')) return undefined;
  const id = (entry as Record<string, unknown>).id;
  return typeof id === 'string' ? id : undefined;
}

/** Index of the first entry that validates with this id, or −1. */
function validIndexOf(entries: readonly unknown[], id: string): number {
  for (let i = 0; i < entries.length; i++) {
    if (validateDiorama(entries[i])?.id === id) return i;
  }
  return -1;
}

export function createSaveRepository(deps: SaveRepositoryDeps): SaveRepository {
  const { storage } = deps;
  const clock = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => nanoid());
  const warn = deps.warn ?? defaultWarn;

  /** Current time in ms; falls back to the system clock for an invalid Date. */
  function nowMs(): number {
    const t = clock().getTime();
    return Number.isFinite(t) ? t : Date.now();
  }

  /** UTC ISO string for `ms`, never earlier than `createdAt`. */
  function updatedAtFor(ms: number, createdAt: string): string {
    const createdMs = Date.parse(createdAt);
    if (!(ms <= createdMs)) return new Date(ms).toISOString();
    // A fraction finer than milliseconds would be lost by Date.parse; step 1 ms
    // past it so the result still compares as not earlier.
    const exact = !/\.\d{4,}/.test(createdAt);
    return new Date(exact ? createdMs : createdMs + 1).toISOString();
  }

  function read(): Read {
    let raw: string | null;
    try {
      raw = storage.getItem(SAVE_KEY);
    } catch {
      return { ok: false };
    }
    const parsed = parseSaveFile(raw);
    if (parsed.status === 'ok') return { ok: true, status: 'ok', entries: parsed.entries };
    return parsed.status === 'corrupt' ? { ok: true, status: 'corrupt', raw: parsed.raw } : { ok: true, status: 'missing' };
  }

  /** Writes the corrupt raw value to a fresh backup key. Returns false if that fails. */
  function backup(raw: string, ms: number): boolean {
    try {
      const taken = new Set(storage.keys());
      const base = `${CORRUPT_BACKUP_PREFIX}${new Date(ms).toISOString()}`;
      let key = base;
      for (let n = 2; taken.has(key) || storage.getItem(key) !== null; n++) key = `${base}-${n}`;
      storage.setItem(key, raw);
      return true;
    } catch {
      return false;
    }
  }

  /** Steps 3 to 5 of the write algorithm. */
  function commit(state: Read & { ok: true }, entries: unknown[], ms: number): WriteFailure | null {
    if (state.status === 'corrupt' && !backup(state.raw, ms)) return 'backup_failed';
    try {
      storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_FILE_VERSION, dioramas: entries }));
      return null;
    } catch {
      return 'write_failed';
    }
  }

  const entriesOf = (state: Read & { ok: true }): unknown[] =>
    state.status === 'ok' ? [...state.entries] : [];

  return {
    list() {
      let raw: string | null;
      try {
        raw = storage.getItem(SAVE_KEY);
      } catch (error) {
        warn('Reading saved dioramas failed; showing none.', error);
        return [];
      }
      const parsed = parseSaveFile(raw);
      if (parsed.status === 'missing') return [];
      if (parsed.status === 'corrupt') {
        warn(`The saved data under "${SAVE_KEY}" is not a readable SaveFile and was ignored.`);
        return [];
      }
      // Mirror parseSaveFile: an entry is skipped when it fails validation or
      // repeats the id of an earlier valid entry.
      const seen = new Set<string>();
      parsed.entries.forEach((entry, index) => {
        const d = validateDiorama(entry);
        if (d && !seen.has(d.id)) {
          seen.add(d.id);
          return;
        }
        const reason = d ? 'its id repeats an earlier entry' : 'it failed validation';
        warn(`Skipped saved diorama at index ${index} because ${reason}.`, { index, id: rawId(entry) });
      });
      return sortNewestFirst(parsed.valid);
    },

    get(id) {
      const state = read();
      if (!state.ok || state.status !== 'ok') return null;
      const i = validIndexOf(state.entries, id);
      return i < 0 ? null : validateDiorama(state.entries[i]);
    },

    upsert(draft) {
      if (draft === null || typeof draft !== 'object') return { ok: false, reason: 'invalid' };
      const state = read();
      if (!state.ok) return { ok: false, reason: 'write_failed' };
      const entries = entriesOf(state);
      const ms = nowMs();

      const existing = draft.id !== null && draft.id !== undefined;
      let index = -1;
      let id: string;
      let createdAt: string;
      if (existing) {
        id = draft.id as string;
        index = validIndexOf(entries, id);
        if (index >= 0) {
          createdAt = (validateDiorama(entries[index]) as Diorama).createdAt;
        } else {
          index = entries.findIndex((e) => rawId(e) === id);
          createdAt = isIsoDateTime(draft.createdAt) ? draft.createdAt : new Date(ms).toISOString();
        }
      } else {
        const used = new Set(entries.map(rawId));
        let candidate: string | null = null;
        for (let i = 0; i < MAX_ID_ATTEMPTS && candidate === null; i++) {
          const next = newId();
          if (typeof next === 'string' && next.length > 0 && !used.has(next)) candidate = next;
        }
        if (candidate === null) return { ok: false, reason: 'write_failed' };
        id = candidate;
        createdAt = new Date(ms).toISOString();
      }
      // First save: createdAt and updatedAt are the same string (Requirement 36.3).
      const updatedAt = existing ? updatedAtFor(ms, createdAt) : createdAt;

      const candidate: Record<string, unknown> = {
        id,
        name: draft.name,
        setting: draft.setting,
        startFacing: draft.startFacing,
        pieces: draft.pieces,
        createdAt,
        updatedAt,
      };
      if (typeof draft.thumbnail === 'string') candidate.thumbnail = draft.thumbnail;
      const diorama = validateDiorama(candidate);
      if (!diorama) return { ok: false, reason: 'invalid' };

      if (index >= 0) entries[index] = diorama;
      else entries.push(diorama);
      const failure = commit(state, entries, ms);
      return failure ? { ok: false, reason: failure } : { ok: true, diorama };
    },

    rename(id, name) {
      const checked = validateName(name);
      if (!checked.ok) return { ok: false, reason: 'invalid_name' };
      const state = read();
      if (!state.ok) return { ok: false, reason: 'write_failed' };
      const entries = entriesOf(state);
      const index = validIndexOf(entries, id);
      if (index < 0) return { ok: false, reason: 'not_found' };
      const stored = validateDiorama(entries[index]) as Diorama;
      const ms = nowMs();
      const diorama: Diorama = { ...stored, name: checked.name, updatedAt: updatedAtFor(ms, stored.createdAt) };
      entries[index] = diorama;
      const failure = commit(state, entries, ms);
      return failure ? { ok: false, reason: failure } : { ok: true, diorama };
    },

    remove(id) {
      const state = read();
      if (!state.ok) return { ok: false, reason: 'write_failed' };
      const entries = entriesOf(state);
      const index = validIndexOf(entries, id);
      if (index < 0) return { ok: false, reason: 'not_found' };
      const diorama = validateDiorama(entries[index]) as Diorama;
      entries.splice(index, 1);
      const failure = commit(state, entries, nowMs());
      return failure ? { ok: false, reason: failure } : { ok: true, diorama };
    },
  };
}
