// Feature: track-diorama-builder, Property 22: Untitled names are the smallest free name
/**
 * **Validates: Requirements 4.2, 4.3**
 *
 * For any set of saved diorama names, `nextUntitledName` returns a name not
 * in the set; it is "Untitled diorama" when that is free, and otherwise
 * "Untitled diorama N" where every "Untitled diorama k" for 2 ≤ k < N is in
 * the set.
 *
 * The comparison is exact and case-sensitive (Requirement 4.2), so look-alike
 * names ("untitled diorama", "Untitled diorama 02", "Untitled diorama 2 ",
 * "Untitled diorama 1", "Untitled diorama 0") never count as taken.
 *
 * Oracle, independent of the Set-based scan in `naming.ts`: the free N is the
 * smallest integer ≥ 2 that does not appear in the sorted list of numbers
 * parsed from names that match the canonical form exactly (no leading zeros,
 * no sign, single space, nothing trailing). A sorted-list gap search does not
 * share code or structure with the implementation.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nextUntitledName } from '@/domain/naming';

const BASE = 'Untitled diorama';
const CANONICAL_NUMBERED = /^Untitled diorama ([1-9][0-9]*)$/;

/** Smallest free name, computed by a gap search over sorted taken numbers. */
function oracle(names: readonly string[]): string {
  if (!names.some((n) => n === BASE)) return BASE;
  const taken = names
    .map((n) => CANONICAL_NUMBERED.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((k) => k >= 2)
    .sort((a, b) => a - b);
  let expected = 2;
  for (const k of taken) {
    if (k === expected) expected++;
    else if (k > expected) break;
  }
  return `${BASE} ${expected}`;
}

/** Canonical numbered names, mostly small N so runs and gaps are common. */
const arbNumbered = fc
  .oneof(
    { weight: 6, arbitrary: fc.integer({ min: 0, max: 12 }) },
    { weight: 1, arbitrary: fc.integer({ min: 13, max: 1000 }) },
  )
  .map((n) => `${BASE} ${n}`);

/** Names that look like untitled names but must not count as taken. */
const arbLookAlike = fc.oneof(
  fc.constantFrom(
    'untitled diorama',
    'Untitled Diorama',
    'UNTITLED DIORAMA',
    `${BASE} `,
    ` ${BASE}`,
    `${BASE}  2`,
    `${BASE}-2`,
    `${BASE}2`,
    `${BASE} +2`,
    `${BASE} 2.0`,
    `${BASE} 2 `,
    `${BASE} \uFF12`, // fullwidth digit two
    'untitled diorama 2',
    'Untitled Diorama 3',
  ),
  fc.integer({ min: 0, max: 12 }).map((n) => `${BASE} 0${n}`),
  fc.integer({ min: 2, max: 12 }).map((n) => `${BASE} ${n} `),
);

const arbName = fc.oneof(
  { weight: 2, arbitrary: fc.constant(BASE) },
  { weight: 5, arbitrary: arbNumbered },
  { weight: 3, arbitrary: arbLookAlike },
  { weight: 2, arbitrary: fc.string({ maxLength: 45 }) },
);

/** A contiguous run 2..k with a few numbers removed, so large N with gaps occur. */
const arbRunWithGaps = fc
  .tuple(
    fc.boolean(),
    fc.integer({ min: 2, max: 60 }),
    fc.array(fc.integer({ min: 2, max: 60 }), { maxLength: 3 }),
  )
  .map(([withBase, k, gaps]) => {
    const names: string[] = withBase ? [BASE] : [];
    for (let n = 2; n <= k; n++) if (!gaps.includes(n)) names.push(`${BASE} ${n}`);
    return names;
  });

const arbSavedNames = fc
  .tuple(
    fc.oneof(arbRunWithGaps, fc.constant<string[]>([])),
    fc.array(arbName, { maxLength: 30 }),
  )
  .chain(([run, extra]) => fc.shuffledSubarray([...run, ...extra], { minLength: run.length + extra.length }));

describe('Property 22: Untitled names are the smallest free name', () => {
  it('returns a free name, the base name when free, otherwise the smallest free "Untitled diorama N"', () => {
    fc.assert(
      fc.property(arbSavedNames, (names) => {
        const before = [...names];
        const result = nextUntitledName(names);

        // Input is not mutated.
        expect(names).toEqual(before);

        // The result is not a saved name.
        expect(names.includes(result)).toBe(false);

        if (!names.includes(BASE)) {
          expect(result).toBe(BASE);
        } else {
          const match = CANONICAL_NUMBERED.exec(result);
          expect(match).not.toBeNull();
          const n = Number(match![1]);
          expect(n).toBeGreaterThanOrEqual(2);
          for (let k = 2; k < n; k++) {
            expect(names.includes(`${BASE} ${k}`)).toBe(true);
          }
        }

        expect(result).toBe(oracle(names));
      }),
      { numRuns: 100 },
    );
  });
});
