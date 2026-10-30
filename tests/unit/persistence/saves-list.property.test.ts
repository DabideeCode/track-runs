// Feature: track-diorama-builder, Property 24: The menu lists the valid entries newest first
/**
 * **Validates: Requirements 3.2, 3.4, 3.5, 24.1**
 *
 * For any save file whose `dioramas` array mixes valid entries and entries that
 * break one validation rule, `list()` returns exactly the valid entries,
 * ordered by `updatedAt` descending, and logs exactly one warning per invalid
 * entry and no errors.
 *
 * The file also holds valid entries that repeat the id of another valid entry.
 * The first of them in stored order is listed and every later one is skipped
 * with a warning, so each id appears once in the menu (Requirement 3.2).
 *
 * Generators build valid and invalid entries from the rules (`arbitraries.ts`),
 * and the oracle below decides what is listed from how each entry was built,
 * without calling the validators under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { SAVE_KEY, createSaveRepository } from '@/persistence/saveRepository';
import { memoryStorage } from '@/persistence/storage';
import type { Diorama } from '@/domain/types';
import { arbDiorama, arbDioramas, arbInvalidEntry } from './arbitraries';

type Tagged = { kind: 'valid'; diorama: Diorama } | { kind: 'invalid'; raw: unknown };

/** Shuffles a fixed list into a random order (every element kept). */
function shuffled<T>(items: T[]): fc.Arbitrary<T[]> {
  return fc.shuffledSubarray(items, { minLength: items.length, maxLength: items.length });
}

/**
 * Valid dioramas with unique ids, valid dioramas that reuse one of those ids,
 * and invalid entries, shuffled together.
 */
const arbMixedEntries: fc.Arbitrary<Tagged[]> = fc
  .tuple(
    arbDioramas(6),
    fc.array(fc.tuple(fc.nat(), arbDiorama), { maxLength: 3 }),
    fc.array(arbInvalidEntry, { maxLength: 6 }),
  )
  .chain(([valid, dupSeeds, invalid]) => {
    const dups: Diorama[] =
      valid.length === 0 ? [] : dupSeeds.map(([i, d]) => ({ ...d, id: valid[i % valid.length].id }));
    const tagged: Tagged[] = [
      ...valid.map((diorama): Tagged => ({ kind: 'valid', diorama })),
      ...dups.map((diorama): Tagged => ({ kind: 'valid', diorama })),
      ...invalid.map((raw): Tagged => ({ kind: 'invalid', raw })),
    ];
    return shuffled(tagged);
  });

/** Newest first by `updatedAt` (all generated as `toISOString` UTC strings), then id in code-unit order. */
function newestFirst(a: Diorama, b: Diorama): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** What the menu should show, and the stored indices that should be skipped. */
function oracle(entries: readonly Tagged[]): { listed: Diorama[]; skipped: number[] } {
  const seen = new Set<string>();
  const kept: Diorama[] = [];
  const skipped: number[] = [];
  entries.forEach((entry, index) => {
    if (entry.kind === 'valid' && !seen.has(entry.diorama.id)) {
      seen.add(entry.diorama.id);
      kept.push(entry.diorama);
    } else {
      skipped.push(index);
    }
  });
  return { listed: [...kept].sort(newestFirst), skipped };
}

/** Stores the entries, calls `list()` once and returns the result and the warnings. */
function listStored(dioramas: readonly unknown[]): { listed: Diorama[]; warnings: unknown[][] } {
  const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ version: 1, dioramas }) });
  const warnings: unknown[][] = [];
  const repo = createSaveRepository({ storage, warn: (...args: unknown[]) => void warnings.push(args) });
  return { listed: repo.list(), warnings };
}

/** The `index` carried by a skip warning, when present. */
function warnedIndex(args: unknown[]): unknown {
  const data = args[1];
  return typeof data === 'object' && data !== null ? (data as { index?: unknown }).index : undefined;
}

describe('Property 24: The menu lists the valid entries newest first', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error');
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('lists exactly the valid entries newest first and warns once per skipped entry', () => {
    fc.assert(
      fc.property(arbMixedEntries, (entries) => {
        const stored = entries.map((e) => (e.kind === 'valid' ? e.diorama : e.raw));
        const expected = oracle(entries);
        const { listed, warnings } = listStored(stored);

        expect(listed).toStrictEqual(expected.listed);
        expect(warnings).toHaveLength(expected.skipped.length);
        expect(warnings.map(warnedIndex)).toStrictEqual(expected.skipped);
        expect(errorSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('shows the empty state for an empty or all-invalid dioramas array', () => {
    fc.assert(
      fc.property(fc.array(arbInvalidEntry, { maxLength: 8 }), (invalid) => {
        const { listed, warnings } = listStored(invalid);

        expect(listed).toStrictEqual([]);
        expect(warnings).toHaveLength(invalid.length);
        expect(errorSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
