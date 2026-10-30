/**
 * Property 12 (task 10.7): board invariants hold over any action sequence.
 *
 * A real store (`createHarness`) is driven by `fc.commands` made of build
 * requests from `arbRequest` (place, move, rotate and remove, valid and
 * invalid), undo and redo. After every command the board is checked by an
 * oracle written independently of the domain code.
 */
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuildRequest } from '@/domain/placement';
import type { Piece, Tile } from '@/domain/types';
import { arbRequest, PIECE_TYPES, ROTATIONS } from '../arbitraries';
import { createHarness, disposeHarnesses, type Harness } from './harness';

afterEach(() => disposeHarnesses());

/** Ids the harness hands out (`p1`, `p2`, ...); a run never places more than this many pieces. */
const ID_POOL = Array.from({ length: 60 }, (_, i) => `p${i + 1}`);
const MAX_COMMANDS = 60;

/** Tiles covered by a piece: the 2 × 2 block east and south of the anchor for a hill, else the anchor. */
function coveredTiles(p: Piece): Tile[] {
  if (p.type !== 'hill') return [{ gridX: p.gridX, gridZ: p.gridZ }];
  return [
    { gridX: p.gridX, gridZ: p.gridZ },
    { gridX: p.gridX + 1, gridZ: p.gridZ },
    { gridX: p.gridX, gridZ: p.gridZ + 1 },
    { gridX: p.gridX + 1, gridZ: p.gridZ + 1 },
  ];
}

/** Throws (via `expect`) when any board invariant of Property 12 is broken. */
function checkBoard(pieces: readonly Piece[]): void {
  const ids = new Set<string>();
  const covered = new Map<string, string>();
  let stations = 0;
  for (const p of pieces) {
    expect(typeof p.id, `id type of ${String(p.id)}`).toBe('string');
    expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false);
    ids.add(p.id);
    expect(PIECE_TYPES, `type of ${p.id}`).toContain(p.type);
    expect(ROTATIONS, `rotation of ${p.id}`).toContain(p.rotation);
    expect(Number.isInteger(p.gridX) && Number.isInteger(p.gridZ), `integer anchor of ${p.id}`).toBe(true);
    for (const t of coveredTiles(p)) {
      const inside = t.gridX >= 0 && t.gridX <= 15 && t.gridZ >= 0 && t.gridZ <= 15;
      expect(inside, `${p.id} covers off-grid tile (${t.gridX}, ${t.gridZ})`).toBe(true);
      const key = `${t.gridX},${t.gridZ}`;
      const other = covered.get(key);
      expect(other, `tile ${key} covered by ${other} and ${p.id}`).toBeUndefined();
      covered.set(key, p.id);
    }
    if (p.type === 'station') stations++;
  }
  expect(stations, 'station count').toBeLessThanOrEqual(1);
}

type Model = { requests: number };
type Real = Harness;

class BuildCommand implements fc.Command<Model, Real> {
  readonly req: BuildRequest;
  constructor(req: BuildRequest) {
    this.req = req;
  }
  check = () => true;
  run(m: Model, h: Real): void {
    const s = h.store.getState();
    const r = this.req;
    if (r.kind === 'place') s.placePiece(r.type, r.gridX, r.gridZ, { rotation: r.rotation, autoAdjust: r.autoAdjust });
    else if (r.kind === 'move') s.movePiece(r.id, r.gridX, r.gridZ, r.rotation);
    else if (r.kind === 'rotate') s.rotatePiece(r.id);
    else s.removePiece(r.id);
    m.requests++;
    checkBoard(h.store.getState().pieces);
  }
  toString = () => `build(${JSON.stringify(this.req)})`;
}

class UndoCommand implements fc.Command<Model, Real> {
  check = () => true;
  run(_m: Model, h: Real): void {
    h.store.getState().undo();
    checkBoard(h.store.getState().pieces);
  }
  toString = () => 'undo';
}

class RedoCommand implements fc.Command<Model, Real> {
  check = () => true;
  run(_m: Model, h: Real): void {
    h.store.getState().redo();
    checkBoard(h.store.getState().pieces);
  }
  toString = () => 'redo';
}

/** A square cluster of tiles that requests aim at, so pieces crowd and collide often. */
const arbHotTiles: fc.Arbitrary<Tile[]> = fc
  .record({ ox: fc.nat({ max: 15 }), oz: fc.nat({ max: 15 }), size: fc.integer({ min: 2, max: 6 }) })
  .map(({ ox, oz, size }) => {
    const tiles: Tile[] = [];
    for (let dx = 0; dx < size; dx++) {
      for (let dz = 0; dz < size; dz++) tiles.push({ gridX: Math.min(15, ox + dx), gridZ: Math.min(15, oz + dz) });
    }
    return tiles;
  });

const arbCommands = arbHotTiles.chain((hot) =>
  fc.commands<Model, Real>(
    [
      arbRequest(ID_POOL, hot).map((req) => new BuildCommand(req)),
      arbRequest(ID_POOL, hot).map((req) => new BuildCommand(req)),
      arbRequest(ID_POOL, hot).map((req) => new BuildCommand(req)),
      fc.constant(new UndoCommand()),
      fc.constant(new RedoCommand()),
    ],
    { maxCommands: MAX_COMMANDS, size: 'max' },
  ),
);

describe('store board invariants', () => {
  // Feature: track-diorama-builder, Property 12: Board invariants hold over any action sequence
  it('Property 12: unique ids, in-grid integer footprints, valid rotations, no overlap, at most one station', () => {
    // **Validates: Requirements 14.1, 16.1, 16.8, 16.9, 35.2, 41.4**
    fc.assert(
      fc.property(arbCommands, (cmds) => {
        const h = createHarness({ start: 'playfield' });
        try {
          checkBoard(h.store.getState().pieces);
          fc.modelRun(() => ({ model: { requests: 0 }, real: h }), cmds);
          // The id pool must cover every id handed out, or move/rotate/remove would rarely hit real pieces.
          expect(h.ids.issued().length).toBeLessThanOrEqual(ID_POOL.length);
        } finally {
          h.dispose();
        }
      }),
      { numRuns: 100 },
    );
  });
});
