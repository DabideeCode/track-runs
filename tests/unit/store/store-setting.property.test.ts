// Feature: track-diorama-builder, Property 21: Setting changes touch nothing else
/**
 * **Validates: Requirements 7.4, 7.10**
 *
 * Property 21: *For any* store state and either setting value, `setSetting`
 * leaves `pieces`, `startFacing`, `mode`, `driveMode`, `selectedPieceId` and
 * the train snapshot unchanged, and changes `setting` (and `isDirty`) only
 * when the value differs.
 *
 * Store states: a real store (`createHarness`) on the playfield, built by
 * replaying either a reachable board (`arbBoardWithHistory`, which may lack a
 * station) or a layout with one station (`arbLayoutWith`, often with
 * decorations, or `arbLoop` with a station) through the store's build actions.
 * The state is then varied with 0 to 3 undos, an optional save (so `isDirty`
 * can be false), an optional selection, an optional start-facing flip and an
 * optional hook `setDriveMode` in Build mode.
 *
 * Operations: a random sequence of setting changes (both values, so many are
 * no-ops) mixed with switches to Play and Build mode, frame ticks of the
 * running train, drive-mode toggles and held W / S keys. Every check is made
 * twice:
 *
 * 1. Directly: each `setSetting` call is compared with the state just before it.
 * 2. Against a twin: a second harness receives the same operations except the
 *    setting changes. After every operation the two stores must agree on the
 *    fields above (plus history, the selected tool and the diorama identity)
 *    and the two train snapshots must be equal, so a setting change cannot
 *    disturb the train later either (for example its speed or direction on
 *    the next ticks).
 *
 * Two fixed cases (`COVERAGE_CASES`, passed as fast-check `examples`) run a
 * station loop in Play mode, in auto drive and in manual drive with W held,
 * and change the setting between short runs. They guarantee the coverage of
 * setting changes in Play mode and while the train is moving for every seed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Piece } from '@/domain/types';
import type { AppStore } from '@/store/createAppStore';
import { createHarness, disposeHarnesses, type Harness } from './harness';
import {
  arbBoardWithHistory,
  arbLayoutWith,
  arbLoop,
  type AppliedStep,
} from '../arbitraries';

afterEach(() => disposeHarnesses());

type Setting = 'bedroom' | 'kitchen';

/** Replays accepted placement-engine requests through the store's build actions. */
function replaySteps(store: AppStore, steps: readonly AppliedStep[]): void {
  for (const { request } of steps) {
    const s = store.getState();
    let result;
    switch (request.kind) {
      case 'place':
        result = s.placePiece(request.type, request.gridX, request.gridZ, {
          rotation: request.rotation as never,
          autoAdjust: request.autoAdjust,
        });
        break;
      case 'move':
        result = s.movePiece(request.id, request.gridX, request.gridZ, request.rotation);
        break;
      case 'rotate':
        result = s.rotatePiece(request.id);
        break;
      case 'remove':
        result = s.removePiece(request.id);
        break;
    }
    if (!result.ok) throw new Error(`replay: an accepted request was rejected (${result.reason})`);
  }
}

/** Places a valid layout piece by piece with its stored rotations (auto-adjust off). */
function replayLayout(store: AppStore, pieces: readonly Piece[]): void {
  for (const p of pieces) {
    const r = store.getState().placePiece(p.type, p.gridX, p.gridZ, { rotation: p.rotation, autoAdjust: false });
    if (!r.ok) throw new Error(`replay: a layout piece was rejected (${r.reason})`);
  }
}

type Board = { kind: 'steps'; steps: AppliedStep[] } | { kind: 'layout'; pieces: Piece[] };

const arbBoardSource: fc.Arbitrary<Board> = fc.oneof(
  arbBoardWithHistory({ maxSteps: 30 }).map((b): Board => ({ kind: 'steps', steps: b.steps })),
  arbLayoutWith({ decorations: true, maxSteps: 20 }).map((pieces): Board => ({ kind: 'layout', pieces })),
  arbLoop({ station: 'always', maxStraights: 6 }).map((l): Board => ({ kind: 'layout', pieces: l.pieces })),
);

type Op =
  | { kind: 'setting'; value: Setting }
  | { kind: 'play' }
  | { kind: 'build' }
  | { kind: 'tick'; dt: number; frames: number }
  | { kind: 'toggleDrive' }
  | { kind: 'keys'; w: boolean; s: boolean };

const arbSetting = fc.constantFrom<Setting>('bedroom', 'kitchen');

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { arbitrary: arbSetting.map((value): Op => ({ kind: 'setting', value })), weight: 5 },
  { arbitrary: fc.constant<Op>({ kind: 'play' }), weight: 2 },
  { arbitrary: fc.constant<Op>({ kind: 'build' }), weight: 1 },
  {
    arbitrary: fc
      // Frame times in whole milliseconds (0 to 120, past the 0.1 s clamp);
      // fc.double would mostly produce tiny values that barely move the train.
      .record({ ms: fc.integer({ min: 0, max: 120 }), frames: fc.integer({ min: 1, max: 60 }) })
      .map(({ ms, frames }): Op => ({ kind: 'tick', dt: ms / 1000, frames })),
    weight: 4,
  },
  { arbitrary: fc.constant<Op>({ kind: 'toggleDrive' }), weight: 1 },
  {
    arbitrary: fc.record({ w: fc.boolean(), s: fc.boolean() }).map(({ w, s }): Op => ({ kind: 'keys', w, s })),
    weight: 1,
  },
);

const arbCase = fc.record({
  board: arbBoardSource,
  undos: fc.nat({ max: 3 }),
  save: fc.boolean(),
  selectPick: fc.option(fc.nat(), { nil: null }),
  flip: fc.boolean(),
  buildDrive: fc.option(fc.constantFrom<'auto' | 'manual'>('auto', 'manual'), { nil: null }),
  startPlay: fc.boolean(),
  ops: fc.array(arbOp, { minLength: 1, maxLength: 25 }),
});

type Case = typeof arbCase extends fc.Arbitrary<infer T> ? T : never;

/**
 * A fixed 3 × 3 loop with one station (the `arbLoop` layout for one straight
 * per side, north-west corner at (5, 5)), so the train can always run.
 */
const FIXED_LOOP: Piece[] = [
  { id: 'L1', type: 'curve', gridX: 5, gridZ: 5, rotation: 0 },
  { id: 'L2', type: 'straight', gridX: 6, gridZ: 5, rotation: 90 },
  { id: 'L3', type: 'curve', gridX: 7, gridZ: 5, rotation: 90 },
  { id: 'L4', type: 'station', gridX: 7, gridZ: 6, rotation: 0 },
  { id: 'L5', type: 'curve', gridX: 7, gridZ: 7, rotation: 180 },
  { id: 'L6', type: 'straight', gridX: 6, gridZ: 7, rotation: 90 },
  { id: 'L7', type: 'curve', gridX: 5, gridZ: 7, rotation: 270 },
  { id: 'L8', type: 'straight', gridX: 5, gridZ: 6, rotation: 0 },
];

/** 25 operations (the generator's maximum): a warm-up, then alternating settings and short runs. */
function movingOps(): Op[] {
  const run: Op = { kind: 'tick', dt: 0.016, frames: 5 };
  const ops: Op[] = [{ kind: 'tick', dt: 0.016, frames: 60 }];
  const values: Setting[] = ['kitchen', 'kitchen', 'bedroom', 'kitchen', 'bedroom', 'kitchen', 'bedroom', 'kitchen'];
  for (const value of values) ops.push({ kind: 'setting', value }, run);
  // 1 + 16 + 6 = 23, so a leading key operation still fits in 25.
  for (const value of ['bedroom', 'kitchen', 'bedroom'] as const) ops.push({ kind: 'setting', value }, run);
  return ops;
}

/**
 * Fixed cases that cover setting changes in Play mode while the train is
 * moving for every seed: the loop above in auto drive, and in manual drive
 * with W held. They are values of `arbCase`.
 */
const COVERAGE_CASES: Case[] = [
  {
    board: { kind: 'layout', pieces: FIXED_LOOP },
    undos: 0,
    save: false,
    selectPick: null,
    flip: false,
    buildDrive: null,
    startPlay: true,
    ops: movingOps(),
  },
  {
    board: { kind: 'layout', pieces: FIXED_LOOP },
    undos: 0,
    save: true,
    selectPick: 3,
    flip: true,
    buildDrive: 'manual',
    startPlay: true,
    ops: [{ kind: 'keys', w: true, s: false }, ...movingOps()],
  },
];

/** Applies a non-setting operation to one harness. */
function applyOp(h: Harness, op: Exclude<Op, { kind: 'setting' }>): void {
  const s = h.store.getState();
  switch (op.kind) {
    case 'play':
      s.setMode('play');
      break;
    case 'build':
      s.setMode('build');
      break;
    case 'tick':
      for (let i = 0; i < op.frames; i++) h.tick(op.dt);
      break;
    case 'toggleDrive':
      s.toggleDriveMode();
      break;
    case 'keys':
      h.train.setKeys({ w: op.w, s: op.s });
      break;
  }
}

/** The fields a setting change must not touch, plus the train snapshot. */
function untouched(h: Harness) {
  const s = h.store.getState();
  return {
    pieces: s.pieces,
    startFacing: s.startFacing,
    mode: s.mode,
    driveMode: s.driveMode,
    selectedPieceId: s.selectedPieceId,
    train: h.getTrain(),
  };
}

/** `untouched` plus other editor state that the twin must share. */
function twinView(h: Harness) {
  const s = h.store.getState();
  return {
    ...untouched(h),
    history: s.history,
    selectedTool: s.selectedTool,
    dioramaId: s.dioramaId,
    dioramaName: s.dioramaName,
    screen: s.screen,
  };
}

/** Builds the same starting state in a harness. */
function prepare(h: Harness, c: Case): void {
  const store = h.store;
  if (c.board.kind === 'steps') replaySteps(store, c.board.steps);
  else replayLayout(store, c.board.pieces);
  for (let i = 0; i < c.undos; i++) store.getState().undo();
  if (c.save) store.getState().save('manual');
  const pieces = store.getState().pieces;
  if (c.selectPick !== null && pieces.length > 0) {
    store.getState().selectPiece(pieces[c.selectPick % pieces.length]!.id);
  }
  if (c.flip) store.getState().flipStartFacing();
  if (c.buildDrive !== null) store.getState().setDriveMode(c.buildDrive);
  if (c.startPlay) store.getState().setMode('play');
}

describe('Property 21: Setting changes touch nothing else', () => {
  it('setSetting changes only setting and isDirty, and only when the value differs', () => {
    let changes = 0;
    let noOps = 0;
    let playChanges = 0;
    let movingChanges = 0;
    // fast-check runs the `examples` first, so the first runs are COVERAGE_CASES.
    let runs = 0;
    let examplePlayChanges = 0;
    let exampleMovingChanges = 0;
    fc.assert(
      fc.property(arbCase, (c) => {
        const isExample = runs++ < COVERAGE_CASES.length;
        const a = createHarness({ start: 'playfield' });
        const b = createHarness({ start: 'playfield' });
        try {
          prepare(a, c);
          prepare(b, c);
          expect(twinView(a)).toEqual(twinView(b));

          for (const op of c.ops) {
            if (op.kind === 'setting') {
              const before = a.store.getState();
              const view = untouched(a);
              const viewJson = JSON.stringify(view);
              const piecesRef = before.pieces;
              const differs = before.setting !== op.value;

              const changed = a.store.getState().setSetting(op.value);

              const after = a.store.getState();
              expect(changed).toBe(differs);
              expect(after.pieces).toBe(piecesRef);
              expect(untouched(a)).toEqual(view);
              expect(JSON.stringify(untouched(a))).toBe(viewJson);
              if (differs) {
                changes++;
                if (before.mode === 'play') {
                  playChanges++;
                  if (isExample) examplePlayChanges++;
                }
                if (view.train?.moving) {
                  movingChanges++;
                  if (isExample) exampleMovingChanges++;
                }
                expect(after.setting).toBe(op.value);
                expect(after.isDirty).toBe(true);
              } else {
                noOps++;
                expect(after.setting).toBe(before.setting);
                expect(after.isDirty).toBe(before.isDirty);
              }
            } else {
              applyOp(a, op);
              applyOp(b, op);
            }
            expect(twinView(a)).toEqual(twinView(b));
          }
        } finally {
          a.dispose();
          b.dispose();
        }
      }),
      { numRuns: 100, examples: COVERAGE_CASES.map((c): [Case] => [c]) },
    );
    // The fixed cases alone guarantee changes in Play mode and while the train
    // is moving, whatever the seed; the random runs add to these totals.
    // (The examples are counted within numRuns.)
    expect(runs).toBe(100);
    expect(examplePlayChanges).toBeGreaterThan(10);
    expect(exampleMovingChanges).toBeGreaterThan(5);
    expect(playChanges).toBeGreaterThanOrEqual(examplePlayChanges);
    expect(movingChanges).toBeGreaterThanOrEqual(exampleMovingChanges);
    // About 460 setting operations are generated per run of 100 cases, roughly
    // half real changes and half no-ops, so these bounds hold for any seed in practice.
    expect(changes).toBeGreaterThan(50);
    expect(noOps).toBeGreaterThan(50);
  });
});
