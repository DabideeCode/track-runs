// Feature: track-diorama-builder, Property 29: Timestamps stay consistent
/**
 * **Validates: Requirements 36.3, 36.4**
 *
 * For any sequence of saves and renames of one diorama under a clock that may
 * move forward or backward, `id` and `createdAt` never change after the first
 * save, `createdAt` equals the first save's time, and `updatedAt` is always a
 * UTC ISO 8601 string not earlier than `createdAt`.
 *
 * The repository runs on `memoryStorage` with a controllable clock and a
 * seeded id generator. Clock moves go forward, stay put, go backward, or jump
 * by up to the whole representable range. After each successful operation:
 * - the first save has `createdAt === updatedAt`, both equal to the clock time
 *   in `toISOString` form (UTC, ending in `Z`);
 * - later saves and renames keep `id` and `createdAt` exactly;
 * - `updatedAt` is in `toISOString` form and, as an instant, not earlier than
 *   `createdAt`;
 * - `updatedAt` equals the clock time whenever the clock is at or after
 *   `createdAt`, and equals `createdAt` (the smallest allowed value) when the
 *   clock has gone back before it;
 * - the stored entry equals the returned diorama.
 *
 * Later saves pass the draft's own `createdAt` as the store would, or null, or
 * an unrelated ISO string; the stored `createdAt` must win in every case.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createSaveRepository, type DioramaDraft } from '@/persistence/saveRepository';
import { memoryStorage } from '@/persistence/storage';
import type { Diorama } from '@/domain/types';
import { arbDiorama, arbDioramas, arbName, arbTimestamps } from './arbitraries';

/** Largest instant whose ISO string still has a 4-digit year (9999-12-31T23:59:59.999Z). */
const MAX_ISO_MS = 253_402_300_799_999;

/** Exactly the shape `Date.prototype.toISOString` produces for years 0000 to 9999. */
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const clampMs = (ms: number): number => Math.min(MAX_ISO_MS, Math.max(0, ms));

type ClockMove =
  | { kind: 'shift'; delta: number } // relative move, forward, zero or backward
  | { kind: 'set'; at: number }; // absolute jump anywhere in range

/** The draft's `createdAt` on a later save: the real one, none, or an unrelated value. */
type DraftCreatedAt = { kind: 'real' } | { kind: 'none' } | { kind: 'other'; value: string };

type Op =
  | { kind: 'clock'; move: ClockMove }
  | { kind: 'save'; content: Diorama; createdAt: DraftCreatedAt }
  | { kind: 'rename'; name: string };

const arbClockMove: fc.Arbitrary<ClockMove> = fc.oneof(
  fc.constant<ClockMove>({ kind: 'shift', delta: 0 }),
  fc.integer({ min: -5_000, max: 5_000 }).map((delta): ClockMove => ({ kind: 'shift', delta })),
  fc.integer({ min: -MAX_ISO_MS, max: MAX_ISO_MS }).map((delta): ClockMove => ({ kind: 'shift', delta })),
  fc.integer({ min: 0, max: MAX_ISO_MS }).map((at): ClockMove => ({ kind: 'set', at })),
);

const arbDraftCreatedAt: fc.Arbitrary<DraftCreatedAt> = fc.oneof(
  fc.constant<DraftCreatedAt>({ kind: 'real' }),
  fc.constant<DraftCreatedAt>({ kind: 'none' }),
  arbTimestamps.map(({ createdAt }): DraftCreatedAt => ({ kind: 'other', value: createdAt })),
);

const arbSaveOp: fc.Arbitrary<Op> = fc
  .tuple(arbDiorama, arbDraftCreatedAt)
  .map(([content, createdAt]): Op => ({ kind: 'save', content, createdAt }));

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 3, arbitrary: arbClockMove.map((move): Op => ({ kind: 'clock', move })) },
  { weight: 2, arbitrary: arbSaveOp },
  { weight: 2, arbitrary: arbName.map((name): Op => ({ kind: 'rename', name })) },
);

/**
 * A scenario: other dioramas already stored, a start time, operations before
 * the first save (clock moves and renames, which find nothing), the first save,
 * then any mix of clock moves, saves and renames.
 */
const arbScenario = fc.record({
  others: arbDioramas(3),
  start: fc.integer({ min: 0, max: MAX_ISO_MS }),
  before: fc.array(
    fc.oneof(
      arbClockMove.map((move): Op => ({ kind: 'clock', move })),
      arbName.map((name): Op => ({ kind: 'rename', name })),
    ),
    { maxLength: 4 },
  ),
  first: arbSaveOp,
  after: fc.array(arbOp, { minLength: 1, maxLength: 30 }),
});

function draftFrom(content: Diorama, id: string | null, createdAt: string | null): DioramaDraft {
  return {
    id,
    name: content.name,
    setting: content.setting,
    startFacing: content.startFacing,
    pieces: content.pieces,
    thumbnail: content.thumbnail ?? null,
    createdAt,
  };
}

describe('Property 29: Timestamps stay consistent', () => {
  it('keeps id and createdAt fixed and updatedAt a UTC ISO string not earlier than createdAt', () => {
    fc.assert(
      fc.property(arbScenario, ({ others, start, before, first, after }) => {
        let clock = start;
        let seq = 0;
        const storage = memoryStorage({
          'wooden-diorama:v1': JSON.stringify({ version: 1, dioramas: others }),
        });
        const repo = createSaveRepository({
          storage,
          now: () => new Date(clock),
          newId: () => `seeded-${++seq}`,
          warn: () => {},
        });

        const moveClock = (move: ClockMove): void => {
          clock = move.kind === 'set' ? move.at : clampMs(clock + move.delta);
        };

        // Before the first save there is nothing to rename.
        for (const op of before) {
          if (op.kind === 'clock') moveClock(op.move);
          else if (op.kind === 'rename') expect(repo.rename('seeded-1', op.name).ok).toBe(false);
        }

        if (first.kind !== 'save') throw new Error('unreachable');
        const firstTime = new Date(clock).toISOString();
        const firstResult = repo.upsert(draftFrom(first.content, null, null));
        expect(firstResult.ok).toBe(true);
        if (!firstResult.ok) return;
        const saved = firstResult.diorama;
        const { id, createdAt } = saved;

        // First save: createdAt and updatedAt are the same UTC ISO string, the save's time.
        expect(createdAt).toMatch(UTC_ISO);
        expect(saved.updatedAt).toBe(createdAt);
        expect(createdAt).toBe(firstTime);
        expect(others.some((d) => d.id === id)).toBe(false);
        expect(repo.get(id)).toStrictEqual(saved);
        const createdMs = Date.parse(createdAt);

        for (const op of after) {
          if (op.kind === 'clock') {
            moveClock(op.move);
            continue;
          }
          const result =
            op.kind === 'save'
              ? repo.upsert(
                  draftFrom(
                    op.content,
                    id,
                    op.createdAt.kind === 'real' ? createdAt : op.createdAt.kind === 'none' ? null : op.createdAt.value,
                  ),
                )
              : repo.rename(id, op.name);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const d = result.diorama;

          expect(d.id).toBe(id);
          expect(d.createdAt).toBe(createdAt);
          expect(d.updatedAt).toMatch(UTC_ISO);
          expect(Date.parse(d.updatedAt)).toBeGreaterThanOrEqual(createdMs);
          if (clock >= createdMs) expect(d.updatedAt).toBe(new Date(clock).toISOString());
          else expect(d.updatedAt).toBe(createdAt);
          expect(repo.get(id)).toStrictEqual(d);
        }
      }),
      { numRuns: 100 },
    );
  });
});
