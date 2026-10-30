/**
 * Key-value storage port used by the persistence layer (design section 2).
 *
 * `browserStorage()` wraps `window.localStorage`. `memoryStorage()` keeps the
 * data in a Map and is used by tests and as the session fallback when
 * localStorage cannot be accessed at all (decision D-30).
 *
 * This module touches `window` only inside `browserStorage()`, so it is safe
 * to import in Node.
 */

export interface KeyValueStorage {
  /** Returns the stored string, or null when the key is missing or cannot be read. Never throws. */
  getItem(key: string): string | null;
  /** Stores the value. May throw (for example `QuotaExceededError`); on a throw the old value stays. */
  setItem(key: string, value: string): void;
  /** Every stored key. Never throws. */
  keys(): string[];
}

/** Storage returned by `browserStorage()`. `persistent` is false when the memory fallback is in use. */
export interface BrowserStorage extends KeyValueStorage {
  readonly persistent: boolean;
}

export type FailWrites = boolean | ((key: string) => boolean);

export interface MemoryStorageOptions {
  /** When true, or when the function returns true for a key, `setItem` throws `QuotaExceededError`. */
  failWrites?: FailWrites;
}

export interface MemoryStorage extends KeyValueStorage {
  /** Switches write failures on or off at runtime. */
  setFailWrites(failWrites: FailWrites): void;
}

export type WarnFn = (message: string, data?: unknown) => void;

const defaultWarn: WarnFn = (message, data) => {
  if (data === undefined) console.warn(message);
  else console.warn(message, data);
};

/** A DOMException named `QuotaExceededError`, matching what browsers throw when storage is full. */
export function quotaExceededError(key: string): Error {
  const message = `Failed to write "${key}": storage quota exceeded`;
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'QuotaExceededError');
  }
  const error = new Error(message);
  error.name = 'QuotaExceededError';
  return error;
}

export function memoryStorage(
  init?: Record<string, string>,
  opts?: MemoryStorageOptions,
): MemoryStorage {
  const data = new Map<string, string>(init ? Object.entries(init) : []);
  let failWrites: FailWrites = opts?.failWrites ?? false;

  const shouldFail = (key: string): boolean =>
    typeof failWrites === 'function' ? failWrites(key) : failWrites;

  return {
    getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem(key, value) {
      if (shouldFail(key)) throw quotaExceededError(key);
      data.set(key, String(value));
    },
    keys() {
      return [...data.keys()];
    },
    setFailWrites(next) {
      failWrites = next;
    },
  };
}

const FALLBACK_WARNING =
  'localStorage is not available. Dioramas and settings are kept in memory for this session only and will not persist.';
const READ_WARNING = 'Reading from localStorage failed; treating the value as missing.';

/** Returns the page's localStorage, or null when it is missing or its access throws. */
function probeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const ls = window.localStorage;
    if (ls === null || ls === undefined) return null;
    // Some privacy modes expose the object but throw on first use.
    ls.getItem('wooden-diorama:probe');
    return ls;
  } catch {
    return null;
  }
}

/**
 * Wraps `window.localStorage`. If it cannot be accessed, falls back to an
 * in-memory storage for the session and logs exactly one warning (D-30).
 * Reads never throw: a failed read returns null (or no keys) and warns once.
 * Writes pass through and may throw, so callers can report a failed save.
 */
export function browserStorage(opts?: { warn?: WarnFn }): BrowserStorage {
  const warn = opts?.warn ?? defaultWarn;
  const ls = probeLocalStorage();

  if (ls === null) {
    warn(FALLBACK_WARNING);
    const mem = memoryStorage();
    return {
      persistent: false,
      getItem: (key) => mem.getItem(key),
      setItem: (key, value) => mem.setItem(key, value),
      keys: () => mem.keys(),
    };
  }

  let readWarned = false;
  const warnRead = (error: unknown): void => {
    if (readWarned) return;
    readWarned = true;
    warn(READ_WARNING, error);
  };

  return {
    persistent: true,
    getItem(key) {
      try {
        return ls.getItem(key);
      } catch (error) {
        warnRead(error);
        return null;
      }
    },
    setItem(key, value) {
      ls.setItem(key, value);
    },
    keys() {
      try {
        const out: string[] = [];
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k !== null) out.push(k);
        }
        return out;
      } catch (error) {
        warnRead(error);
        return [];
      }
    },
  };
}
