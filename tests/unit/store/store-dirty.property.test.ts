/**
 * Property 19 (task 10.10): selection and dirty-state invariants.
 *
 * A real store (`createHarness`) is driven by `fc.commands` over the store's
 * actions: build requests (valid and invalid), drag and drop, delete selected,
 * undo and redo, selection, tool and hover changes, setting changes,
 * start-facing flips, camera reset, audio and low quality settings, mode and
 * drive-mode switches, train frames, manual saves (with storage failures and
 * thumbnail failures switched on and off), the autosave timer (clock
 * advances), and menu navigation (new, open, back, the unsaved-changes and
 * delete dialogs, rename).
 *
 * After every command the checker verifies, from the state before and after
 * and from what the command observably did (never from store internals):
 * - `selectedPieceId` is null or the id of a piece in `pieces`;
 * - `isDirty` went false → true only on an accepted build action, an undo or
 *   redo that changed `pieces`, a change to a different setting, or a
 *   start-facing flip;
 * - `isDirty` went true → false only on a successful save (detected from
 *   storage: the stored SaveFile changed and holds an entry with the editor's
 *   name, setting, start facing and pieces) or on opening or creating a
 *   diorama. Discard in the unsaved-changes dialog closes the diorama and
 *   leaves an empty editor on the main menu; that reset is accepted as part of
 *   closing (decision D-50 in design.md).
 * It also checks the required direction of each rule: a change to `pieces`,
 * setting or start facing leaves `isDirty` true (Requirements 13.9, 35.4), and
 * a successful save, open or create leaves it false (Requirement 35.7).
 */
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuildRequest } from '@/domain/placement';
import type { PieceType, Tile } from '@/domain/types';
import { SAVE_KEY } from '@/persistence/saveRepository';
import type { BuildResult } from '@/store/types';
import { arbRequest, PIECE_TYPES } from '../arbitraries';
import { createHarness, disposeHarnesses, type Harness, type ThumbnailMode } from './harness';

afterEach(() => disposeHarnesses());

/** Piece ids the harness hands out (`p1`, `p2`, ...), plus one unknown id. */
const ID_POOL = Array.from({ length: 60 }, (_, i) => `p${i + 1}`);
/** Diorama ids the harness hands out on first saves (`d1`, ...), plus one unknown id. */
const DIORAMA_IDS = ['d1', 'd2', 'd3', 'd4', 'nope'];
const MAX_COMMANDS = 60;

type Model = Record<string, never>;
type Real = Harness;

interface Before {
  isDirty: boolean;
  pieces: string;
  setting: string;
  startFacing: number;
  dioramaName: string;
  dialog: string | null;
  raw: string | null;
}

/** What a command is allowed or required to do to `isDirty`. */
interface Verdict {
  /** The action is one that may turn `isDirty` from false to true. */
  mayDirty: boolean;
  /** The action changed what `isDirty` tracks, so `isDirty` must be true afterwards. */
  mustDirty: boolean;
  /** The action is one that may turn `isDirty` from true to false. */
  mayClean: boolean;
  /** The action saved, opened or created a diorama, so `isDirty` must be false afterwards. */
  mustClean: boolean;
}

const NONE: Verdict = { mayDirty: false, mustDirty: false, mayClean: false, mustClean: false };

function snap(h: Real): Before {
  const s = h.store.getState();
  return {
    isDirty: s.isDirty,
    pieces: JSON.stringify(s.pieces),
    setting: s.setting,
    startFacing: s.startFacing,
    dioramaName: s.dioramaName,
    dialog: s.dialog === null ? null : s.dialog.kind,
    raw: h.storage.getItem(SAVE_KEY),
  };
}

const piecesChanged = (h: Real, b: Before) => JSON.stringify(h.store.getState().pieces) !== b.pieces;

/** Verdict for a build action: accepted may dirty; accepted and changing `pieces` must dirty. */
function buildVerdict(h: Real, b: Before, result: BuildResult | null): Verdict {
  const ok = result !== null && result.ok;
  return { ...NONE, mayDirty: ok, mustDirty: ok && piecesChanged(h, b) };
}

/**
 * True when the stored SaveFile changed and now holds an entry with the
 * editor's name, setting, start facing and pieces from before the command,
 * that is, the editor's diorama was saved successfully during the command.
 */
function savedEditor(h: Real, b: Before): boolean {
  const raw = h.storage.getItem(SAVE_KEY);
  if (raw === null || raw === b.raw) return false;
  const file = JSON.parse(raw) as { dioramas: Array<Record<string, unknown>> };
  return file.dioramas.some(
    (d) =>
      d.name === b.dioramaName &&
      d.setting === b.setting &&
      d.startFacing === b.startFacing &&
      JSON.stringify(d.pieces) === b.pieces,
  );
}

function verify(h: Real, b: Before, v: Verdict, label: string): void {
  const s = h.store.getState();
  if (s.selectedPieceId !== null) {
    expect(
      s.pieces.some((p) => p.id === s.selectedPieceId),
      `${label}: selectedPieceId ${s.selectedPieceId} is not in pieces`,
    ).toBe(true);
  }
  if (!b.isDirty && s.isDirty) expect(v.mayDirty, `${label}: isDirty changed false → true`).toBe(true);
  if (b.isDirty && !s.isDirty) expect(v.mayClean, `${label}: isDirty changed true → false`).toBe(true);
  if (v.mustDirty) expect(s.isDirty, `${label}: isDirty should be true`).toBe(true);
  if (v.mustClean) expect(s.isDirty, `${label}: isDirty should be false`).toBe(false);
}

class Act implements fc.Command<Model, Real> {
  readonly label: string;
  readonly act: (h: Real, b: Before) => Verdict;
  constructor(label: string, act: (h: Real, b: Before) => Verdict) {
    this.label = label;
    this.act = act;
  }
  check = () => true;
  run(_m: Model, h: Real): void {
    const b = snap(h);
    const v = this.act(h, b);
    verify(h, b, v, this.label);
  }
  toString = () => this.label;
}

const cmd = (label: string, act: (h: Real, b: Before) => Verdict) => new Act(label, act);
const quiet = (label: string, act: (h: Real) => unknown) =>
  cmd(label, (h) => {
    act(h);
    return NONE;
  });

// ---------------------------------------------------------------------------
// Command arbitraries
// ---------------------------------------------------------------------------

const arbPieceId = fc.constantFrom(...ID_POOL.slice(0, 30), 'nope');
const arbType = fc.constantFrom<PieceType>(...PIECE_TYPES);
const arbTile: fc.Arbitrary<Tile | null> = fc.option(
  fc.record({ gridX: fc.integer({ min: -1, max: 16 }), gridZ: fc.integer({ min: -1, max: 16 }) }),
  { nil: null, freq: 5 },
);
const arbName = fc.oneof(
  fc.string({ minLength: 1, maxLength: 12 }),
  fc.constantFrom('', '   ', 'x'.repeat(41), '  Loop  '),
);

function buildCmd(req: BuildRequest): Act {
  return cmd(`build(${JSON.stringify(req)})`, (h, b) => {
    const s = h.store.getState();
    let result: BuildResult;
    if (req.kind === 'place') {
      result = s.placePiece(req.type, req.gridX, req.gridZ, { rotation: req.rotation, autoAdjust: req.autoAdjust });
    } else if (req.kind === 'move') result = s.movePiece(req.id, req.gridX, req.gridZ, req.rotation);
    else if (req.kind === 'rotate') result = s.rotatePiece(req.id);
    else result = s.removePiece(req.id);
    return buildVerdict(h, b, result);
  });
}

const historyCmd = (dir: 'undo' | 'redo') =>
  cmd(dir, (h, b) => {
    h.store.getState()[dir]();
    const changed = piecesChanged(h, b);
    return { ...NONE, mayDirty: changed, mustDirty: changed };
  });

const arbDragCommands: Array<fc.Arbitrary<Act>> = [
  fc
    .tuple(arbType, arbTile)
    .map(([type, tile]) => quiet(`beginDrag(palette ${type}, ${JSON.stringify(tile)})`, (h) =>
      h.store.getState().beginDrag({ source: 'palette', type, tile }),
    )),
  fc
    .tuple(arbPieceId, arbTile)
    .map(([pieceId, tile]) => quiet(`beginDrag(board ${pieceId}, ${JSON.stringify(tile)})`, (h) =>
      h.store.getState().beginDrag({ source: 'board', pieceId, tile }),
    )),
  arbTile.map((tile) => quiet(`setDragTile(${JSON.stringify(tile)})`, (h) => h.store.getState().setDragTile(tile))),
  fc.constant(quiet('rotateDrag', (h) => h.store.getState().rotateDrag())),
  fc.constant(cmd('drop', (h, b) => buildVerdict(h, b, h.store.getState().drop()))),
  fc.constant(quiet('cancelDrag', (h) => h.store.getState().cancelDrag())),
  fc.constant(cmd('deleteSelected', (h, b) => buildVerdict(h, b, h.store.getState().deleteSelected()))),
];

const arbSelectionCommands: Array<fc.Arbitrary<Act>> = [
  fc
    .option(arbPieceId, { nil: null })
    .map((id) => quiet(`selectPiece(${id})`, (h) => h.store.getState().selectPiece(id))),
  fc
    .option(arbType, { nil: null })
    .map((type) => quiet(`selectTool(${type})`, (h) => h.store.getState().selectTool(type))),
  fc
    .tuple(arbTile, fc.option(arbPieceId, { nil: null }))
    .map(([tile, id]) => quiet(`setHover(${JSON.stringify(tile)}, ${id})`, (h) => h.store.getState().setHover(tile, id))),
  fc.constant(quiet('camera resetView', (h) => h.deps.scene.resetView())),
];

const arbModeCommands: Array<fc.Arbitrary<Act>> = [
  fc
    .constantFrom<unknown>('bedroom', 'kitchen', 'attic')
    .map((setting) =>
      cmd(`setSetting(${String(setting)})`, (h, b) => {
        h.store.getState().setSetting(setting);
        const changed = h.store.getState().setting !== b.setting;
        return { ...NONE, mayDirty: changed, mustDirty: changed };
      }),
    ),
  fc.constant(
    cmd('flipStartFacing', (h, b) => {
      h.store.getState().flipStartFacing();
      const changed = h.store.getState().startFacing !== b.startFacing;
      return { ...NONE, mayDirty: changed, mustDirty: changed };
    }),
  ),
  fc
    .constantFrom<unknown>('build', 'play', 'play', 'fly')
    .map((mode) => quiet(`setMode(${String(mode)})`, (h) => h.store.getState().setMode(mode))),
  fc
    .constantFrom<unknown>('auto', 'manual', 'turbo')
    .map((mode) => quiet(`setDriveMode(${String(mode)})`, (h) => h.store.getState().setDriveMode(mode))),
  fc.constant(quiet('toggleDriveMode', (h) => h.store.getState().toggleDriveMode())),
  fc.integer({ min: 1, max: 30 }).map((frames) =>
    quiet(`train ${frames} frames`, (h) => {
      if (h.store.getState().mode !== 'play') return;
      for (let i = 0; i < frames; i++) h.tick(1 / 60);
    }),
  ),
];

const arbSettingsCommands: Array<fc.Arbitrary<Act>> = [
  fc.boolean().map((m) => quiet(`setMuted(${m})`, (h) => h.store.getState().setMuted(m))),
  fc.double().map((v) => quiet(`setMusicVolume(${v})`, (h) => h.store.getState().setMusicVolume(v))),
  fc.double().map((v) => quiet(`setSfxVolume(${v})`, (h) => h.store.getState().setSfxVolume(v))),
  fc.boolean().map((q) => quiet(`setLowQuality(${q})`, (h) => h.store.getState().setLowQuality(q))),
];

const arbSaveCommands: Array<fc.Arbitrary<Act>> = [
  fc.constant(
    cmd('save(manual)', (h) => {
      const ok = h.store.getState().save('manual');
      return { ...NONE, mayClean: ok, mustClean: ok };
    }),
  ),
  // The autosave timer (and toast expiry) runs while the clock moves.
  fc.integer({ min: 0, max: 40_000 }).map((ms) =>
    cmd(`advance(${ms} ms)`, (h, b) => {
      h.clock.advance(ms);
      return { ...NONE, mayClean: savedEditor(h, b) };
    }),
  ),
  fc.boolean().map((fail) => quiet(`failWrites(${fail})`, (h) => h.storage.setFailWrites(fail))),
  fc
    .constantFrom<ThumbnailMode>('ok', 'null', 'throw')
    .map((mode) => quiet(`thumbnail(${mode})`, (h) => h.scene.setThumbnailMode(mode))),
];

const arbMenuCommands: Array<fc.Arbitrary<Act>> = [
  fc.constant(
    cmd('newDiorama', (h) => {
      h.store.getState().newDiorama();
      return { ...NONE, mayClean: true, mustClean: true };
    }),
  ),
  fc.constantFrom(...DIORAMA_IDS).map((id) =>
    cmd(`openDiorama(${id})`, (h) => {
      const ok = h.store.getState().openDiorama(id);
      return { ...NONE, mayClean: ok, mustClean: ok };
    }),
  ),
  fc.constant(quiet('backToMenu', (h) => h.store.getState().backToMenu())),
  fc.constant(
    cmd('confirmDialog', (h, b) => {
      h.store.getState().confirmDialog();
      // Save in the unsaved-changes dialog; Delete in the delete dialog never saves the editor.
      return { ...NONE, mayClean: b.dialog === 'unsaved' && savedEditor(h, b) };
    }),
  ),
  fc.constant(quiet('cancelDialog', (h) => h.store.getState().cancelDialog())),
  fc.constant(
    cmd('discardAndLeave', (h, b) => {
      h.store.getState().discardAndLeave();
      const s = h.store.getState();
      // Closing the diorama (D-50): only from the unsaved-changes dialog, ending on the menu with an empty editor.
      const closed = b.dialog === 'unsaved' && s.screen === 'menu' && s.pieces.length === 0 && s.dioramaId === null;
      return { ...NONE, mayClean: closed };
    }),
  ),
  fc.constantFrom(...DIORAMA_IDS).map((id) =>
    quiet(`requestDeleteDiorama(${id})`, (h) => h.store.getState().requestDeleteDiorama(id)),
  ),
  fc.constantFrom(...DIORAMA_IDS).map((id) => quiet(`startRename(${id})`, (h) => h.store.getState().startRename(id))),
  fc
    .tuple(fc.constantFrom(...DIORAMA_IDS), arbName)
    .map(([id, name]) =>
      quiet(`renameDiorama(${id}, ${JSON.stringify(name)})`, (h) => h.store.getState().renameDiorama(id, name)),
    ),
  fc.constant(quiet('cancelRename', (h) => h.store.getState().cancelRename())),
  fc.constant(quiet('refreshList', (h) => h.store.getState().refreshList())),
];

/** A square cluster of tiles that build requests aim at, so pieces crowd and connect often. */
const arbHotTiles: fc.Arbitrary<Tile[]> = fc
  .record({ ox: fc.nat({ max: 13 }), oz: fc.nat({ max: 13 }), size: fc.integer({ min: 2, max: 4 }) })
  .map(({ ox, oz, size }) => {
    const tiles: Tile[] = [];
    for (let dx = 0; dx < size; dx++) {
      for (let dz = 0; dz < size; dz++) tiles.push({ gridX: ox + dx, gridZ: oz + dz });
    }
    return tiles;
  });

const arbCommands = arbHotTiles.chain((hot) => {
  const build = arbRequest(ID_POOL.slice(0, 30), hot).map(buildCmd);
  const dragTile = fc.constantFrom(...hot);
  return fc.commands<Model, Real>(
    [
      build,
      build,
      build,
      build,
      fc.constant(historyCmd('undo')),
      fc.constant(historyCmd('undo')),
      fc.constant(historyCmd('redo')),
      // Selection and board drags of a piece that exists, picked by index at run time.
      fc.nat().map((k) =>
        quiet(`selectPiece(#${k})`, (h) => {
          const pieces = h.store.getState().pieces;
          if (pieces.length > 0) h.store.getState().selectPiece(pieces[k % pieces.length]!.id);
        }),
      ),
      fc.nat().map((k) =>
        quiet(`selectPiece(#${k})`, (h) => {
          const pieces = h.store.getState().pieces;
          if (pieces.length > 0) h.store.getState().selectPiece(pieces[k % pieces.length]!.id);
        }),
      ),
      fc.tuple(fc.nat(), dragTile).map(([k, tile]) =>
        quiet(`beginDrag(board #${k}, ${JSON.stringify(tile)})`, (h) => {
          const pieces = h.store.getState().pieces;
          if (pieces.length > 0) {
            h.store.getState().beginDrag({ source: 'board', pieceId: pieces[k % pieces.length]!.id, tile });
          }
        }),
      ),
      // Drags aimed at the hot tiles, so drops are often accepted.
      fc
        .tuple(arbType, dragTile)
        .map(([type, tile]) => quiet(`beginDrag(palette ${type}, ${JSON.stringify(tile)})`, (h) =>
          h.store.getState().beginDrag({ source: 'palette', type, tile }),
        )),
      dragTile.map((tile) => quiet(`setDragTile(${JSON.stringify(tile)})`, (h) => h.store.getState().setDragTile(tile))),
      ...arbDragCommands,
      ...arbSelectionCommands,
      ...arbModeCommands,
      ...arbSettingsCommands,
      ...arbSaveCommands,
      ...arbSaveCommands.slice(0, 2),
      ...arbMenuCommands,
    ],
    { maxCommands: MAX_COMMANDS, size: 'max' },
  );
});

describe('store selection and dirty state', () => {
  // Feature: track-diorama-builder, Property 19: Selection and dirty-state invariants
  it('Property 19: selectedPieceId stays valid and isDirty changes only for the allowed actions', () => {
    // **Validates: Requirements 13.9, 35.3, 35.4**
    fc.assert(
      fc.property(arbCommands, fc.boolean(), (cmds, startOnMenu) => {
        const h = createHarness({ start: startOnMenu ? 'menu' : 'playfield' });
        try {
          verify(h, snap(h), NONE, 'initial state');
          fc.modelRun(() => ({ model: {}, real: h }), cmds);
        } finally {
          h.dispose();
        }
      }),
      { numRuns: 100 },
    );
  });
});
