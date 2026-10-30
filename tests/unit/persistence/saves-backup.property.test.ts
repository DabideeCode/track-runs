// Feature: track-diorama-builder, Property 31: Corrupt data is backed up before it is replaced
/**
 * **Validates: Requirements 24.3**
 *
 * For any string under `wooden-diorama:v1` that does not parse as a SaveFile,
 * and any set of existing backup keys, the first successful write first stores
 * the exact original string under a new
 * `wooden-diorama:v1:corrupt-<ISO timestamp>` key and leaves every existing
 * backup key unchanged.
 *
 * Checked here:
 * - Successful save: the new backup key holds the raw value character for
 *   character, is the first free name in `base`, `base-2`, `base-3`, ... for the
 *   clock time, is written before the main key, no other key changes, and the
 *   main key then holds a SaveFile with exactly the saved diorama. A second
 *   save writes no further backup and leaves the backup untouched.
 * - Backup write fails: the save returns `backup_failed`, storage is unchanged
 *   byte for byte, and once writes work again the next save backs up the
 *   original raw value.
 * - Rename and remove on a corrupt file write nothing.
 *
 * Whether a raw value is a SaveFile is decided by the rule in Requirement 24.2,
 * written out below, not by the parser under test.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CORRUPT_BACKUP_PREFIX, SAVE_KEY, createSaveRepository } from '@/persistence/saveRepository';
import type { DioramaDraft } from '@/persistence/saveRepository';
import { memoryStorage } from '@/persistence/storage';
import type { KeyValueStorage, MemoryStorage } from '@/persistence/storage';
import type { Diorama } from '@/domain/types';
import { arbDiorama, arbName, arbPieces, arbSaveFile, arbThumbnail } from './arbitraries';

/** Largest instant whose ISO string still has a 4-digit year. */
const MAX_ISO_MS = 253_402_300_799_999;

const FRESH_ID = 'fresh-id';

/** Requirement 24.2: valid JSON, an object, `version` equal to 1 and `dioramas` an array. */
function isSaveFileShape(raw: string): boolean {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return false;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.dioramas);
}

const arbWrongVersion = fc.constantFrom<unknown>(0, 2, '1', null, true, 1.5, -1, [1], { v: 1 });
const arbNotArray = fc.constantFrom<unknown>({}, null, 'dioramas', 3, true, { 0: 'x' });

/** Strings under `wooden-diorama:v1` that are not a SaveFile. */
const arbCorruptRaw: fc.Arbitrary<string> = fc
  .oneof(
    // Empty, whitespace and JSON scalars, arrays and empty objects.
    fc.constantFrom('', ' ', '\n', 'null', '0', '42', '-1e9', 'true', 'false', '"text"', '[]', '{}', 'undefined', 'NaN'),
    // Text that is mostly not JSON, including lone surrogates.
    fc.string({ maxLength: 40 }),
    fc.string({ unit: 'binary', maxLength: 40 }),
    // Any JSON value (scalars, arrays, objects of the wrong shape).
    fc.jsonValue({ maxDepth: 3 }).map((v) => JSON.stringify(v)),
    fc.array(fc.jsonValue({ maxDepth: 2 }), { maxLength: 3 }).map((v) => JSON.stringify(v)),
    // Wrong or missing version.
    fc
      .tuple(arbWrongVersion, fc.array(arbDiorama, { maxLength: 2 }))
      .map(([version, dioramas]) => JSON.stringify({ version, dioramas })),
    fc.array(arbDiorama, { maxLength: 2 }).map((dioramas) => JSON.stringify({ dioramas })),
    // `dioramas` not an array, or missing.
    arbNotArray.map((dioramas) => JSON.stringify({ version: 1, dioramas })),
    fc.constant(JSON.stringify({ version: 1 })),
    // A valid SaveFile wrapped in an array, truncated, or followed by garbage.
    arbSaveFile(2).map((f) => JSON.stringify([f])),
    fc
      .tuple(arbSaveFile(2), fc.nat())
      .map(([f, n]) => {
        const s = JSON.stringify(f);
        return s.slice(0, n % s.length);
      }),
    fc.tuple(arbSaveFile(2), fc.string({ minLength: 1, maxLength: 4 })).map(([f, tail]) => JSON.stringify(f) + tail),
  )
  .filter((raw) => !isSaveFileShape(raw));

/** A draft as the store would pass it: never saved, or with an id that has no stored entry. */
const arbDraft: fc.Arbitrary<DioramaDraft> = fc.record({
  id: fc.option(fc.string({ minLength: 1, maxLength: 21 }), { nil: null }),
  name: arbName,
  setting: fc.constantFrom<Diorama['setting']>('bedroom', 'kitchen'),
  startFacing: fc.constantFrom<Diorama['startFacing']>(0, 180),
  pieces: arbPieces,
  thumbnail: fc.option(arbThumbnail, { nil: undefined }),
});

/** Keys that are not the main key and not backups for the fixed time (filtered in the property). */
const arbUnrelated: fc.Arbitrary<Array<[string, string]>> = fc.uniqueArray(
  fc.tuple(
    fc.oneof(
      fc.constantFrom('wooden-diorama:audio', 'wooden-diorama:settings', 'other-app', ''),
      fc.integer({ min: 0, max: MAX_ISO_MS }).map((ms) => `${CORRUPT_BACKUP_PREFIX}${new Date(ms).toISOString()}`),
      fc.string({ maxLength: 30 }),
    ),
    fc.string({ maxLength: 30 }),
  ),
  { maxLength: 6, selector: ([k]) => k },
);

interface Scenario {
  raw: string;
  ms: number;
  /** taken[0] is `base`; taken[i] for i ≥ 1 is `base-(i + 1)`. */
  taken: boolean[];
  takenValues: string[];
  unrelated: Array<[string, string]>;
}

const arbScenario: fc.Arbitrary<Scenario> = fc.record({
  raw: arbCorruptRaw,
  ms: fc.integer({ min: 0, max: MAX_ISO_MS }),
  taken: fc.array(fc.boolean(), { maxLength: 6 }),
  takenValues: fc.array(fc.string({ maxLength: 20 }), { minLength: 6, maxLength: 6 }),
  unrelated: arbUnrelated,
});

/** `base` for index 0, `base-(i + 1)` otherwise. */
const candidate = (base: string, i: number): string => (i === 0 ? base : `${base}-${i + 1}`);

interface Setup {
  mem: MemoryStorage;
  storage: KeyValueStorage;
  writes: string[];
  base: string;
  expectedKey: string;
  initial: Record<string, string>;
}

/** Builds the storage for a scenario and works out the expected backup key. */
function setup(s: Scenario): Setup {
  const base = `${CORRUPT_BACKUP_PREFIX}${new Date(s.ms).toISOString()}`;
  const initial: Record<string, string> = {};
  for (const [k, v] of s.unrelated) {
    if (k === SAVE_KEY || k.startsWith(base)) continue;
    initial[k] = v;
  }
  s.taken.forEach((isTaken, i) => {
    if (isTaken) initial[candidate(base, i)] = s.takenValues[i];
  });
  initial[SAVE_KEY] = s.raw;

  let free = 0;
  while (Object.prototype.hasOwnProperty.call(initial, candidate(base, free))) free++;

  const mem = memoryStorage(initial);
  const writes: string[] = [];
  const storage: KeyValueStorage = {
    getItem: (k) => mem.getItem(k),
    setItem: (k, v) => {
      mem.setItem(k, v);
      writes.push(k);
    },
    keys: () => mem.keys(),
  };
  return { mem, storage, writes, base, expectedKey: candidate(base, free), initial };
}

function snapshot(storage: KeyValueStorage): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of storage.keys()) out[k] = storage.getItem(k);
  return out;
}

function repoFor(storage: KeyValueStorage, ms: number) {
  return createSaveRepository({ storage, now: () => new Date(ms), newId: () => FRESH_ID, warn: () => {} });
}

/** The diorama an upsert of `draft` at time `ms` must store over a corrupt file. */
function expectedDiorama(draft: DioramaDraft, ms: number): Diorama {
  const iso = new Date(ms).toISOString();
  const d: Diorama = {
    id: draft.id ?? FRESH_ID,
    name: draft.name,
    setting: draft.setting,
    startFacing: draft.startFacing,
    pieces: [...draft.pieces],
    createdAt: iso,
    updatedAt: iso,
  };
  if (typeof draft.thumbnail === 'string') d.thumbnail = draft.thumbnail;
  return d;
}

describe('Property 31: Corrupt data is backed up before it is replaced', () => {
  it('backs up the raw value to the first free key before writing the new SaveFile', () => {
    fc.assert(
      fc.property(arbScenario, arbDraft, (s, draft) => {
        const { storage, writes, expectedKey, initial } = setup(s);
        const repo = repoFor(storage, s.ms);

        const result = repo.upsert(draft);
        expect(result.ok).toBe(true);

        // The backup is new, exact, and written before the main key.
        expect(Object.prototype.hasOwnProperty.call(initial, expectedKey)).toBe(false);
        expect(storage.getItem(expectedKey)).toBe(s.raw);
        expect(writes).toStrictEqual([expectedKey, SAVE_KEY]);

        // Only the backup key was added; every other pre-existing key is unchanged.
        const after = snapshot(storage);
        expect(Object.keys(after).sort()).toStrictEqual([...Object.keys(initial), expectedKey].sort());
        for (const [k, v] of Object.entries(initial)) {
          if (k !== SAVE_KEY) expect(after[k]).toBe(v);
        }

        // The main key holds a SaveFile with exactly the saved diorama.
        const stored = JSON.parse(storage.getItem(SAVE_KEY) as string) as unknown;
        const expected = expectedDiorama(draft, s.ms);
        expect(stored).toStrictEqual({ version: 1, dioramas: [expected] });
        if (result.ok) expect(result.diorama).toStrictEqual(expected);

        // The file is no longer corrupt: a second save adds no backup and never touches the first.
        const before2 = snapshot(storage);
        writes.length = 0;
        const second = repo.upsert({ ...draft, id: expected.id, name: 'Second save' });
        expect(second.ok).toBe(true);
        expect(writes).toStrictEqual([SAVE_KEY]);
        const after2 = snapshot(storage);
        expect(Object.keys(after2).sort()).toStrictEqual(Object.keys(before2).sort());
        expect(after2[expectedKey]).toBe(s.raw);
      }),
      { numRuns: 100 },
    );
  });

  it('aborts with backup_failed and changes nothing when the backup cannot be written', () => {
    fc.assert(
      fc.property(arbScenario, arbDraft, (s, draft) => {
        const { mem, storage, writes, expectedKey } = setup(s);
        mem.setFailWrites((key) => key.startsWith(CORRUPT_BACKUP_PREFIX));
        const repo = repoFor(storage, s.ms);
        const before = snapshot(storage);

        expect(repo.upsert(draft)).toStrictEqual({ ok: false, reason: 'backup_failed' });
        expect(writes).toStrictEqual([]);
        expect(snapshot(storage)).toStrictEqual(before);

        // Once writes work again, the first successful save backs up the original raw value.
        mem.setFailWrites(false);
        expect(repo.upsert(draft).ok).toBe(true);
        expect(writes).toStrictEqual([expectedKey, SAVE_KEY]);
        expect(storage.getItem(expectedKey)).toBe(s.raw);
      }),
      { numRuns: 100 },
    );
  });

  it('writes nothing for rename or remove on a corrupt file', () => {
    fc.assert(
      fc.property(arbScenario, fc.string({ maxLength: 21 }), arbName, (s, id, name) => {
        const { storage, writes } = setup(s);
        const repo = repoFor(storage, s.ms);
        const before = snapshot(storage);

        expect(repo.rename(id, name)).toStrictEqual({ ok: false, reason: 'not_found' });
        expect(repo.remove(id)).toStrictEqual({ ok: false, reason: 'not_found' });
        expect(writes).toStrictEqual([]);
        expect(snapshot(storage)).toStrictEqual(before);
      }),
      { numRuns: 100 },
    );
  });
});
