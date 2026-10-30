// Feature: track-diorama-builder, Property 8: A successful move changes only that piece's anchor
/**
 * **Validates: Requirements 12.2, 15.7, 39.4**
 *
 * For any board and any accepted move request from the test hook, the
 * resulting `pieces` array has the same length and order, the moved piece
 * keeps its id, type and rotation and has the requested anchor, every other
 * piece is unchanged, and a move to the piece's current anchor leaves `pieces`
 * identical and records no history entry.
 *
 * UI drags may also pass the rotation shown at release (Requirement 12.2), so
 * requests here carry a rotation some of the time. Without one (the hook path)
 * the rotation must be kept; with one it must be used as given. Either way it
 * is never auto-adjusted (Requirement 15.7). A move onto the same tile with a
 * different rotation is a recorded `move` entry (documented decision in
 * `placement.ts`); only same tile plus same rotation gives `entry: null`.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild, type BuildRequest } from '@/domain/placement';
import type { Piece, Rotation } from '@/domain/types';
import { ROTATIONS, arbBoard } from '../arbitraries';

type MoveRequest = Extract<BuildRequest, { kind: 'move' }>;

interface MoveCase {
  pieces: Piece[];
  request: MoveRequest;
  mover: Piece;
}

/**
 * A non-empty reachable board and a move of one of its pieces. Targets are the
 * piece's own anchor, a neighbouring tile (so a hill can slide onto its own
 * tiles) or any in-grid tile; the rotation is absent, the current one or any
 * valid value.
 */
const arbMoveCase: fc.Arbitrary<MoveCase> = arbBoard
  .filter((pieces) => pieces.length > 0)
  .chain((pieces) =>
    fc
      .record({
        pick: fc.nat({ max: pieces.length - 1 }),
        target: fc.oneof(
          { arbitrary: fc.constant({ kind: 'same' as const }), weight: 2 },
          {
            arbitrary: fc.record({
              kind: fc.constant('near' as const),
              dx: fc.integer({ min: -1, max: 1 }),
              dz: fc.integer({ min: -1, max: 1 }),
            }),
            weight: 3,
          },
          {
            arbitrary: fc.record({
              kind: fc.constant('any' as const),
              x: fc.integer({ min: 0, max: 15 }),
              z: fc.integer({ min: 0, max: 15 }),
            }),
            weight: 3,
          },
        ),
        rotation: fc.oneof(
          { arbitrary: fc.constant<'absent' | 'same'>('absent'), weight: 3 },
          { arbitrary: fc.constant<'absent' | 'same'>('same'), weight: 1 },
          { arbitrary: fc.constantFrom(...ROTATIONS), weight: 2 },
        ),
      })
      .map(({ pick, target, rotation }) => {
        const mover = pieces[pick]!;
        const gridX =
          target.kind === 'same' ? mover.gridX : target.kind === 'near' ? mover.gridX + target.dx : target.x;
        const gridZ =
          target.kind === 'same' ? mover.gridZ : target.kind === 'near' ? mover.gridZ + target.dz : target.z;
        const request: MoveRequest = { kind: 'move', id: mover.id, gridX, gridZ };
        if (rotation === 'same') request.rotation = mover.rotation;
        else if (rotation !== 'absent') request.rotation = rotation;
        return { pieces, request, mover };
      }),
  );

const snapshot = (pieces: readonly Piece[]) => JSON.parse(JSON.stringify(pieces)) as Piece[];

describe('Property 8: A successful move changes only that piece\'s anchor', () => {
  it('changes only the moved piece and records the right entry', () => {
    fc.assert(
      fc.property(arbMoveCase, ({ pieces, request, mover }) => {
        const before = snapshot(pieces);
        const outcome = applyBuild(
          {
            pieces,
            mode: 'build',
            newId: () => {
              throw new Error('move must not allocate an id');
            },
          },
          request,
        );

        // The input board is never mutated, accepted or not.
        expect(pieces).toEqual(before);

        const toX = request.gridX as number;
        const toZ = request.gridZ as number;
        const expectedRotation: Rotation =
          request.rotation === undefined ? mover.rotation : (request.rotation as Rotation);
        const unchanged = toX === mover.gridX && toZ === mover.gridZ && expectedRotation === mover.rotation;

        // A move onto the piece's current anchor always succeeds (Requirement 39.4).
        if (toX === mover.gridX && toZ === mover.gridZ) expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        expect(outcome.sound).toBe('move');
        expect(outcome.id).toBeUndefined();

        // Same length, same ids in the same order.
        expect(outcome.pieces).toHaveLength(before.length);
        expect(outcome.pieces.map((p) => p.id)).toEqual(before.map((p) => p.id));

        // Every other piece is unchanged; the mover has the requested anchor,
        // keeps its id and type, and its rotation is the request's or its own.
        outcome.pieces.forEach((p, i) => {
          if (p.id !== mover.id) {
            expect(p).toEqual(before[i]);
          } else {
            expect(p).toEqual({ id: mover.id, type: mover.type, gridX: toX, gridZ: toZ, rotation: expectedRotation });
          }
        });

        if (unchanged) {
          expect(outcome.pieces).toEqual(before);
          expect(outcome.entry).toBeNull();
          expect(outcome.snap).toBe(false);
        } else {
          expect(outcome.entry).toEqual({
            kind: 'move',
            id: mover.id,
            from: { gridX: mover.gridX, gridZ: mover.gridZ, rotation: mover.rotation },
            to: { gridX: toX, gridZ: toZ, rotation: expectedRotation },
          });
        }
      }),
      { numRuns: 100 },
    );
  });
});
