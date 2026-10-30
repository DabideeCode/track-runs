// Feature: track-diorama-builder, Property 7: A successful placement adds exactly one piece
/**
 * **Validates: Requirements 11.2, 11.7, 39.3**
 *
 * For any board and any accepted place request, the resulting `pieces` array
 * is the previous array with exactly one new entry appended, whose id differs
 * from every existing id and whose `type`, `gridX`, `gridZ` equal the request.
 *
 * Scope: this tests the domain placement engine (`applyBuild`). The
 * `isDirty = true` part of Property 7 belongs to the store and is covered by
 * the store property tests, which run on top of this engine.
 *
 * Each case applies a short sequence of place requests to a reachable board,
 * continuing from every accepted one, so later requests see boards that
 * already contain the earlier placements. The id generator sometimes returns
 * ids that already exist or the empty string, to check that a new piece still
 * gets a fresh id.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild, type BuildRequest } from '@/domain/placement';
import type { Piece, Rotation } from '@/domain/types';
import { ID_GEN, ROTATIONS, arbBoard, arbRequest, boardTiles } from '../arbitraries';

type PlaceRequest = Extract<BuildRequest, { kind: 'place' }>;

/**
 * An id factory that first returns `candidates` in order (which may clash with
 * existing ids or be empty) and then fresh `q1`, `q2`, ... ids.
 */
function scriptedIds(candidates: readonly string[]): () => string {
  const fallback = ID_GEN('q', 1);
  let i = 0;
  return () => (i < candidates.length ? candidates[i++]! : fallback());
}

const arbCase = arbBoard.chain((pieces) => {
  const ids = pieces.map((p) => p.id);
  const candidate = fc.oneof(
    { arbitrary: ids.length > 0 ? fc.constantFrom(...ids) : fc.constant('p1'), weight: 2 },
    { arbitrary: fc.constant(''), weight: 1 },
    { arbitrary: fc.nat({ max: 50 }).map((n) => `n${n}`), weight: 2 },
  );
  const placeRequest = arbRequest(ids, boardTiles(pieces)).filter(
    (r): r is PlaceRequest => r.kind === 'place',
  );
  return fc.record({
    pieces: fc.constant(pieces),
    requests: fc.array(placeRequest, { minLength: 1, maxLength: 8 }),
    idCandidates: fc.array(candidate, { maxLength: 12 }),
  });
});

const isRotation = (r: unknown): r is Rotation => (ROTATIONS as readonly unknown[]).includes(r);

describe('Property 7: A successful placement adds exactly one piece', () => {
  it('appends one fresh piece with the requested type, anchor and rotation', () => {
    let accepted = 0;

    fc.assert(
      fc.property(arbCase, ({ pieces: start, requests, idCandidates }) => {
        const newId = scriptedIds(idCandidates);
        let pieces: Piece[] = start;

        for (const request of requests) {
          const before = structuredClone(pieces);
          const requestCopy = structuredClone(request);

          const outcome = applyBuild({ pieces, mode: 'build', newId }, request);

          // The input board and request are never mutated.
          expect(pieces).toEqual(before);
          expect(request).toEqual(requestCopy);

          if (!outcome.ok) continue;
          accepted++;

          const after = outcome.pieces;

          // Exactly one more piece; all prior pieces unchanged and in order.
          expect(after).toHaveLength(before.length + 1);
          expect(after.slice(0, before.length)).toEqual(before);

          // The new piece is last and has a fresh id that the outcome reports.
          const added = after[after.length - 1]!;
          expect(typeof added.id).toBe('string');
          expect(added.id).not.toBe('');
          expect(before.some((p) => p.id === added.id)).toBe(false);
          expect(outcome.id).toBe(added.id);
          expect(new Set(after.map((p) => p.id)).size).toBe(after.length);

          // Requested type and anchor; −0 is stored as 0.
          expect(added.type).toBe(request.type);
          expect(Object.is(added.gridX, (request.gridX as number) + 0)).toBe(true);
          expect(Object.is(added.gridZ, (request.gridZ as number) + 0)).toBe(true);

          // Rotation: the requested one (0 when omitted) without auto-adjust;
          // always one of the four valid values.
          expect(isRotation(added.rotation)).toBe(true);
          if (request.autoAdjust !== true) {
            expect(added.rotation).toBe(request.rotation === undefined ? 0 : request.rotation);
          }

          // The piece has exactly the five Piece fields.
          expect(Object.keys(added).sort()).toEqual(['gridX', 'gridZ', 'id', 'rotation', 'type']);

          // History entry and sound.
          expect(outcome.entry).toEqual({ kind: 'place', piece: added, index: after.length - 1 });
          expect(outcome.sound).toBe('place');

          pieces = after;
        }
      }),
      { numRuns: 100 },
    );

    // Sanity check: the generators produce accepted placements often enough
    // for the property to mean something.
    expect(accepted).toBeGreaterThan(50);
  });
});
