// Feature: track-diorama-builder, Property 14: Build sounds match the outcome
/**
 * **Validates: Requirements 14.7, 15.8, 18.7, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 39.16**
 *
 * For any store state and any build request, the events appended to the sound
 * log are: `invalid` alone when rejected; otherwise the action's event
 * (`place`, `move`, `rotate` or `delete`) followed by exactly one `snap` if and
 * only if the action created at least one connection that did not exist
 * before (never `snap` after `delete`), with no `rotate` for an automatic
 * rotation and no `pickup` from hook calls.
 *
 * The store is real (harness from task 10.5). Each case builds a reachable
 * board through store actions, optionally selects a piece and enters Play
 * mode, clears the sound log, then sends 1 to 6 requests, each through one of
 * two paths:
 * - the real test hook (`createTestHook`): no prefix sounds;
 * - the UI paths: palette drag (`beginDrag` → R presses → `setDragTile` →
 *   `drop`), board drag of a piece, keyboard R and Delete on the selected
 *   piece (`handleKeyDown`). A drag that starts plays `pickup` and each R
 *   during the drag plays `rotate` (user-triggered, not automatic); a gesture
 *   the UI ignores (drag refused, nothing selected) plays nothing.
 *
 * Requests come from `arbRequest` (valid and invalid fields) and, when the
 * board has open ends, from places, moves and rotations aimed at the tile
 * across an open end, so accepted actions that create connections are common.
 *
 * "Created a connection" is decided by an independent brute-force oracle of
 * the connection rule (Requirement 14.2), not by the domain's `newConnections`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { openEnds } from '@/domain/connections';
import { dirDelta } from '@/domain/connectors';
import type { BuildRequest } from '@/domain/placement';
import type { Piece, PieceType, Rotation, SoundEvent } from '@/domain/types';
import { handleKeyDown } from '@/input/useKeyboardShortcuts';
import { createTestHook } from '@/testHook/installTestHook';
import { arbBoardWithHistory, arbRequest, boardTiles } from '../arbitraries';
import { createHarness, disposeHarnesses, type Harness } from './harness';

afterEach(() => disposeHarnesses());

// ---------------------------------------------------------------------------
// Independent connection oracle (Requirements 14.2, 28.4)
// ---------------------------------------------------------------------------

const N: [number, number] = [0, -1];
const E: [number, number] = [1, 0];
const S: [number, number] = [0, 1];
const CONNECTORS0: Record<string, Array<[number, number]>> = {
  straight: [N, S],
  tunnel: [N, S],
  station: [N, S],
  curve: [S, E],
  buffer: [S],
};

/** Turns an offset clockwise (seen from above) by `r` degrees: N → E → S → W. */
function turn([dx, dz]: [number, number], r: number): [number, number] {
  let v: [number, number] = [dx, dz];
  for (let k = 0; k < r / 90; k++) v = [-v[1], v[0]];
  return [v[0] + 0, v[1] + 0];
}

/** Every connected pair as a sorted "a|b" key, by checking all piece pairs. */
function oracleConnections(pieces: readonly Piece[]): Set<string> {
  const out = new Set<string>();
  for (const a of pieces) {
    for (const b of pieces) {
      if (a.id >= b.id) continue;
      const dx = b.gridX - a.gridX;
      const dz = b.gridZ - a.gridZ;
      const faces = (p: Piece, tx: number, tz: number) =>
        (CONNECTORS0[p.type] ?? []).some((d) => {
          const [cx, cz] = turn(d, p.rotation);
          return cx === tx && cz === tz;
        });
      if (faces(a, dx, dz) && faces(b, -dx, -dz)) out.add(`${a.id}|${b.id}`);
    }
  }
  return out;
}

function createdConnection(before: readonly Piece[], after: readonly Piece[]): boolean {
  const old = oracleConnections(before);
  return [...oracleConnections(after)].some((pair) => !old.has(pair));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

type Channel = 'hook' | 'ui';
interface Action {
  channel: Channel;
  request: BuildRequest;
}

const arbCase = arbBoardWithHistory({ maxSteps: 30 }).chain((board) => {
  const ids = board.pieces.map((p) => p.id);
  const tiles = boardTiles(board.pieces);
  // Requests aimed at the tile across an open end, so new connections (and `snap`) are common.
  const ends = openEnds(board.pieces);
  const options: Array<fc.WeightedArbitrary<BuildRequest>> = [{ arbitrary: arbRequest(ids, tiles), weight: 3 }];
  if (ends.length > 0) {
    const target = fc.constantFrom(...ends).map((end) => {
      const { dx, dz } = dirDelta(end.dir);
      return { gridX: end.tile.gridX + dx, gridZ: end.tile.gridZ + dz };
    });
    const rotation = fc.option(fc.constantFrom<Rotation>(0, 90, 180, 270), { nil: undefined });
    const place = fc
      .record({ type: fc.constantFrom<PieceType>('straight', 'curve', 'tunnel', 'buffer', 'station'), target, rotation })
      .map(({ type, target, rotation }): BuildRequest => {
        const req: BuildRequest = { kind: 'place', type, ...target, autoAdjust: rotation === undefined };
        return rotation === undefined ? req : { ...req, rotation };
      });
    const move = fc
      .record({ id: fc.constantFrom(...ids), target, rotation })
      .map(({ id, target, rotation }): BuildRequest => {
        const req: BuildRequest = { kind: 'move', id, ...target };
        return rotation === undefined ? req : { ...req, rotation };
      });
    const rotate = fc.constantFrom(...ids).map((id): BuildRequest => ({ kind: 'rotate', id }));
    options.push({ arbitrary: place, weight: 3 }, { arbitrary: move, weight: 2 }, { arbitrary: rotate, weight: 1 });
  }
  const action: fc.Arbitrary<Action> = fc.record({
    channel: fc.constantFrom<Channel>('hook', 'ui'),
    request: fc.oneof(...options),
  });
  return fc.record({
    board: fc.constant(board),
    selectPick: fc.option(fc.nat(), { nil: null }),
    // Play mode is entered only when the board has a station; otherwise it stays in Build mode.
    play: fc.oneof({ arbitrary: fc.constant(false), weight: 4 }, { arbitrary: fc.constant(true), weight: 1 }),
    actions: fc.array(action, { minLength: 1, maxLength: 6 }),
  });
});

// ---------------------------------------------------------------------------
// Running one request
// ---------------------------------------------------------------------------

const ACTION_SOUND: Record<BuildRequest['kind'], SoundEvent> = {
  place: 'place',
  move: 'move',
  rotate: 'rotate',
  remove: 'delete',
};

const ALLOWED: ReadonlySet<string> = new Set([
  'pickup', 'place', 'move', 'rotate', 'delete', 'snap', 'invalid', 'ui', 'whistle', 'chug', 'bump',
]);

const isRotation = (r: unknown): r is Rotation => r === 0 || r === 90 || r === 180 || r === 270;

/**
 * What a request did: `ignored` when the UI never issued a build action (no
 * sound expected), otherwise whether it was accepted, plus the sounds that
 * the gesture itself plays before the outcome (`pickup`, R presses).
 */
type Ran = { ignored: true } | { ignored: false; accepted: boolean; prefix: SoundEvent[] };

const noKeys = { setKeys: () => {}, clearKeys: () => {} };

function runHook(hook: ReturnType<typeof createTestHook>, req: BuildRequest): Ran {
  let r: { ok: boolean };
  switch (req.kind) {
    case 'place':
      r = hook.placePiece(req.type as PieceType, req.gridX as number, req.gridZ as number, req.rotation as Rotation);
      break;
    case 'move':
      r = hook.movePiece(req.id as string, req.gridX as number, req.gridZ as number);
      break;
    case 'rotate':
      r = hook.rotatePiece(req.id as string);
      break;
    case 'remove':
      r = hook.removePiece(req.id as string);
      break;
  }
  return { ignored: false, accepted: r.ok, prefix: [] };
}

function runUi(h: Harness, req: BuildRequest): Ran {
  const st = () => h.store.getState();
  switch (req.kind) {
    case 'place':
    case 'move': {
      const started =
        req.kind === 'place'
          ? st().beginDrag({ source: 'palette', type: req.type as PieceType })
          : st().beginDrag({ source: 'board', pieceId: req.id as string });
      if (!started) return { ignored: true };
      // R presses during the drag: enough to reach the requested rotation from the start one.
      const start = st().drag!.rotation;
      const turns = isRotation(req.rotation) ? (((req.rotation - start) / 90) % 4 + 4) % 4 : 0;
      for (let k = 0; k < turns; k++) {
        expect(handleKeyDown({ key: 'r' }, { store: h.store, train: noKeys })).toBe('rotateDrag');
      }
      st().setDragTile({ gridX: req.gridX, gridZ: req.gridZ } as never);
      const r = st().drop();
      expect(r).not.toBeNull();
      return {
        ignored: false,
        accepted: r!.ok,
        prefix: ['pickup', ...Array.from({ length: turns }, () => 'rotate' as const)],
      };
    }
    case 'rotate':
    case 'remove': {
      st().selectPiece(typeof req.id === 'string' ? req.id : null);
      const before = st().pieces;
      const cmd = handleKeyDown({ key: req.kind === 'rotate' ? 'r' : 'Delete' }, { store: h.store, train: noKeys });
      if (cmd === null) return { ignored: true };
      expect(cmd).toBe(req.kind === 'rotate' ? 'rotatePiece' : 'deleteSelected');
      // The keyboard returns no result; a rotate or delete that is accepted always changes `pieces`.
      return { ignored: false, accepted: st().pieces !== before, prefix: [] };
    }
  }
}

/** Replays the accepted board-building requests through the store. */
function buildBoard(h: Harness, steps: ReadonlyArray<{ request: BuildRequest }>): void {
  const st = () => h.store.getState();
  for (const { request: q } of steps) {
    const r =
      q.kind === 'place'
        ? st().placePiece(q.type, q.gridX, q.gridZ, { rotation: q.rotation, autoAdjust: q.autoAdjust })
        : q.kind === 'move'
          ? st().movePiece(q.id, q.gridX, q.gridZ, q.rotation)
          : q.kind === 'rotate'
            ? st().rotatePiece(q.id)
            : st().removePiece(q.id);
    expect(r.ok).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Property 14
// ---------------------------------------------------------------------------

describe('Property 14: Build sounds match the outcome', () => {
  it('logs invalid alone on rejection, otherwise the action sound and one snap exactly when a connection is new', () => {
    fc.assert(
      fc.property(arbCase, ({ board, selectPick, play, actions }) => {
        const h = createHarness({ start: 'playfield' });
        try {
          const hook = createTestHook({ store: h.store, audio: h.audio, train: h.deps.train });
          const st = () => h.store.getState();

          buildBoard(h, board.steps);
          expect(st().pieces).toEqual(board.pieces);
          if (selectPick !== null && board.pieces.length > 0) {
            st().selectPiece(board.pieces[selectPick % board.pieces.length]!.id);
          }
          if (play && board.pieces.some((p) => p.type === 'station')) {
            expect(st().setMode('play').ok).toBe(true);
          }
          h.audio.clearLog();

          for (const { channel, request } of actions) {
            const before = st().pieces;
            const logStart = h.audio.log.length;
            const ran = channel === 'hook' ? runHook(hook, request) : runUi(h, request);
            const after = st().pieces;
            const logged = h.audio.log.slice(logStart);

            for (const e of logged) expect(ALLOWED.has(e)).toBe(true);

            if (ran.ignored) {
              expect(logged).toEqual([]);
              expect(after).toBe(before);
              continue;
            }

            let expected: SoundEvent[];
            if (!ran.accepted) {
              expected = ['invalid'];
            } else {
              const snap = createdConnection(before, after);
              expected = [ACTION_SOUND[request.kind], ...(snap ? (['snap'] as const) : [])];
              if (request.kind === 'remove') expect(snap).toBe(false);
            }
            expect(logged).toEqual([...ran.prefix, ...expected]);

            // Hook calls never log `pickup`, and an accepted placement never adds a `rotate`
            // for an automatic rotation (only R presses during a UI drag do).
            if (channel === 'hook') expect(logged).not.toContain('pickup');
            if (ran.accepted && request.kind === 'place') {
              expect(logged.filter((e) => e === 'rotate')).toHaveLength(ran.prefix.filter((e) => e === 'rotate').length);
            }
          }
        } finally {
          h.dispose();
        }
      }),
      { numRuns: 100 },
    );
  });
});
