// Feature: track-diorama-builder, Property 23: Rename accepts exactly 1 to 40 trimmed characters
/**
 * **Validates: Requirements 5.2, 5.3, 6.6**
 *
 * For any string, `validateName` accepts it exactly when its trimmed length is
 * 1 to 40 and then returns the trimmed string; for any saved diorama, an
 * accepted rename stores the trimmed name and leaves `id`, `createdAt`,
 * `setting`, `startFacing`, `pieces` and `thumbnail` unchanged, while a
 * rejected rename leaves the stored entry byte-for-byte unchanged.
 *
 * Trimming oracle: Requirement 5.2 says "leading and trailing whitespace is
 * trimmed", and Assumption 8 says the name is trimmed before validation. We
 * read "whitespace" as the ECMAScript WhiteSpace and LineTerminator code
 * points (what `String.prototype.trim` strips). The oracle below lists those
 * code points by hand and strips them with index scans, so it does not call
 * `trim` and does not share code with `naming.ts`. Length is counted in UTF-16
 * code units (decision D-14).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validateName } from '@/domain/naming';
import { SAVE_KEY, createSaveRepository } from '@/persistence/saveRepository';
import { memoryStorage } from '@/persistence/storage';
import type { Diorama, SaveFile } from '@/domain/types';
import { arbDioramas } from '../persistence/arbitraries';

/**
 * ECMAScript whitespace: WhiteSpace (TAB, VT, FF, SP, NBSP, ZWNBSP and every
 * Unicode "Zs" code point) plus LineTerminator (LF, CR, LS, PS).
 */
const WHITESPACE_CODES: readonly number[] = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
];
const WHITESPACE = new Set(WHITESPACE_CODES);

/** Strips leading and trailing whitespace code units by scanning indices. */
function oracleTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && WHITESPACE.has(s.charCodeAt(start))) start++;
  while (end > start && WHITESPACE.has(s.charCodeAt(end - 1))) end--;
  return s.slice(start, end);
}

const oracleAccepts = (s: string): boolean => {
  const t = oracleTrim(s);
  return t.length >= 1 && t.length <= 40;
};

/** One whitespace code unit. */
const arbWs: fc.Arbitrary<string> = fc
  .constantFrom(...WHITESPACE_CODES)
  .map((c) => String.fromCharCode(c));

/**
 * One non-whitespace code unit: ASCII, any BMP unit (lone surrogates
 * included) and look-alikes that are not whitespace (ZWSP, MVS, WORD JOINER).
 */
const arbNonWs: fc.Arbitrary<string> = fc
  .oneof(
    fc.integer({ min: 0x21, max: 0x7e }),
    fc.integer({ min: 0, max: 0xffff }),
    fc.constantFrom(0x200b, 0x180e, 0x2060, 0x0085),
  )
  .filter((c) => !WHITESPACE.has(c))
  .map((c) => String.fromCharCode(c));

/** A core of exactly `n` code units that starts and ends with non-whitespace. */
const arbCore = (n: number): fc.Arbitrary<string> => {
  if (n === 0) return fc.constant('');
  if (n === 1) return arbNonWs;
  return fc
    .tuple(
      arbNonWs,
      fc.array(fc.oneof(arbNonWs, arbWs), { minLength: n - 2, maxLength: n - 2 }),
      arbNonWs,
    )
    .map(([first, middle, last]) => first + middle.join('') + last);
};

/** Trimmed length biased to the boundaries 0, 1, 40 and 41. */
const arbCoreLength: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(0, 1, 2, 39, 40, 41) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 60 }) },
);

const arbPadding: fc.Arbitrary<string> = fc
  .array(arbWs, { maxLength: 5 })
  .map((units) => units.join(''));

/** Candidate names typed into `rename-input`. */
const arbRenameInput: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc
      .tuple(arbPadding, arbCoreLength.chain(arbCore), arbPadding)
      .map(([lead, core, trail]) => lead + core + trail) },
  // Whitespace-only, including the empty string.
  { weight: 1, arbitrary: fc.array(arbWs, { maxLength: 8 }).map((u) => u.join('')) },
  // Unstructured strings, including astral characters and lone surrogates.
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 50 }) },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme', maxLength: 25 }) },
);

/** A SaveFile with at least one diorama and the index of the one to rename. */
const arbFileAndTarget: fc.Arbitrary<{ file: SaveFile; index: number }> = arbDioramas(5)
  .filter((ds) => ds.length > 0)
  .chain((dioramas) =>
    fc.nat({ max: dioramas.length - 1 }).map((index) => ({
      file: { version: 1 as const, dioramas },
      index,
    })),
  );

const FIXED_NOW = new Date('2030-01-01T00:00:00.000Z');

describe('Property 23: Rename accepts exactly 1 to 40 trimmed characters', () => {
  it('trimming oracle agrees with the boundary examples', () => {
    expect(oracleTrim('\u00a0\u2003 Train \ufeff\n')).toBe('Train');
    expect(oracleTrim('\u200bA\u200b')).toBe('\u200bA\u200b');
    expect(oracleAccepts('x'.repeat(40))).toBe(true);
    expect(oracleAccepts(` ${'x'.repeat(40)} `)).toBe(true);
    expect(oracleAccepts('x'.repeat(41))).toBe(false);
    expect(oracleAccepts('\u3000\t')).toBe(false);
  });

  it('validateName accepts exactly the 1 to 40 character trimmed names and returns the trimmed name', () => {
    fc.assert(
      fc.property(arbRenameInput, (input) => {
        const result = validateName(input);
        if (oracleAccepts(input)) {
          expect(result).toEqual({ ok: true, name: oracleTrim(input) });
        } else {
          expect(result).toEqual({ ok: false });
        }
      }),
      { numRuns: 100 },
    );
  });

  it('repo.rename stores the trimmed name and keeps everything else, or leaves storage byte-identical', () => {
    fc.assert(
      fc.property(arbFileAndTarget, arbRenameInput, ({ file, index }, input) => {
        const raw = JSON.stringify(file);
        const storage = memoryStorage({ [SAVE_KEY]: raw });
        const warnings: unknown[] = [];
        const repo = createSaveRepository({
          storage,
          now: () => FIXED_NOW,
          warn: (m) => warnings.push(m),
        });
        const original = file.dioramas[index];
        const result = repo.rename(original.id, input);

        if (!oracleAccepts(input)) {
          expect(result).toEqual({ ok: false, reason: 'invalid_name' });
          expect(storage.getItem(SAVE_KEY)).toBe(raw);
          expect(storage.keys()).toEqual([SAVE_KEY]);
          return;
        }

        const trimmed = oracleTrim(input);
        expect(result.ok).toBe(true);
        expect(storage.keys()).toEqual([SAVE_KEY]);
        const stored = JSON.parse(storage.getItem(SAVE_KEY) as string) as SaveFile;
        expect(stored.version).toBe(1);
        expect(stored.dioramas).toHaveLength(file.dioramas.length);

        const renamed: Diorama = stored.dioramas[index];
        expect(renamed.name).toBe(trimmed);
        expect(renamed.id).toBe(original.id);
        expect(renamed.createdAt).toBe(original.createdAt);
        expect(renamed.setting).toBe(original.setting);
        expect(renamed.startFacing).toBe(original.startFacing);
        expect(renamed.pieces).toEqual(original.pieces);
        // Requirement 6.6: the thumbnail is kept, and stays absent when there was none.
        expect(Object.prototype.hasOwnProperty.call(renamed, 'thumbnail')).toBe(
          Object.prototype.hasOwnProperty.call(original, 'thumbnail'),
        );
        expect(renamed.thumbnail).toBe(original.thumbnail);
        if (result.ok) expect(result.diorama).toEqual(renamed);

        // Every other entry is unchanged and in place.
        stored.dioramas.forEach((d, j) => {
          if (j !== index) expect(d).toEqual(file.dioramas[j]);
        });
        expect(warnings).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
