// Feature: track-diorama-builder, Property 27: Save and reopen round trip
/**
 * **Validates: Requirements 4.4, 7.5, 17.7, 22.4, 22.5**
 *
 * Property 27: *For any* diorama built through store actions (random name,
 * setting, start facing and pieces), saving it, creating a new store on the
 * same storage (a simulated reload) and opening the diorama by id yields the
 * same name, setting and start facing and a deep-equal `pieces` array, with
 * `isDirty` false and `dioramaId` equal to the saved id.
 *
 * How a case is built:
 * - Start: a new diorama, or a saved diorama opened from storage (random name,
 *   setting, start facing and a reachable board).
 * - Name: optionally renamed to a random valid name (saving first when the
 *   diorama has never been saved). The expected name is the trimmed name.
 * - Pieces: a reachable board (`arbBoardWithHistory`) replayed through the
 *   store's build actions; on an opened diorama some steps may be rejected,
 *   which only varies the board further.
 * - Setting and start facing set through `setSetting` and `flipStartFacing`.
 * - Save: a manual save (in Build mode, or in Play mode after the train has
 *   run), the unsaved-changes dialog's Save, or an autosave (31 s in Build
 *   mode, optionally after a visit to Play mode).
 * - Thumbnail capture succeeds, returns null or throws; the reopened diorama
 *   has the fake thumbnail only when the capture succeeded.
 *
 * The reload is a second harness on the first harness's storage
 * (`sharedStorage`), starting on the main menu.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Diorama, Piece } from '@/domain/types';
import type { AppStore } from '@/store/createAppStore';
import { FAKE_THUMBNAIL, createHarness, disposeHarnesses, type ThumbnailMode } from './harness';
import { arbBoardWithHistory, type AppliedStep } from '../arbitraries';
import { arbDiorama, arbName } from '../persistence/arbitraries';

afterEach(() => disposeHarnesses());

/** Replays placement-engine requests through the store's build actions; rejections are allowed. */
function replay(store: AppStore, steps: readonly AppliedStep[]): void {
  for (const { request } of steps) {
    const s = store.getState();
    switch (request.kind) {
      case 'place':
        s.placePiece(request.type, request.gridX, request.gridZ, {
          rotation: request.rotation as never,
          autoAdjust: request.autoAdjust,
        });
        break;
      case 'move':
        s.movePiece(request.id, request.gridX, request.gridZ, request.rotation);
        break;
      case 'rotate':
        s.rotatePiece(request.id);
        break;
      case 'remove':
        s.removePiece(request.id);
        break;
    }
  }
}

type SaveVia = 'manual' | 'dialog' | 'autosave';

const arbThumbMode = fc.constantFrom<ThumbnailMode>('ok', 'null', 'throw');

/** An opened start: a saved diorama whose pieces are a reachable board (ids p1, p2, ...). */
const arbSeed = fc
  .tuple(arbDiorama, arbBoardWithHistory({ maxSteps: 20 }))
  .map(([d, board]) => ({ diorama: { ...d, pieces: board.pieces } as Diorama, nextIdStart: board.nextIdStart }));

const arbCase = fc.record({
  seed: fc.option(arbSeed, { nil: null }),
  board: arbBoardWithHistory({ maxSteps: 30 }),
  rename: fc.option(arbName, { nil: null }),
  setting: fc.constantFrom<Diorama['setting']>('bedroom', 'kitchen'),
  startFacing: fc.constantFrom<0 | 180>(0, 180),
  saveVia: fc.constantFrom<SaveVia>('manual', 'dialog', 'autosave'),
  play: fc.boolean(),
  drive: fc.constantFrom<'auto' | 'manual'>('auto', 'manual'),
  frames: fc.nat({ max: 120 }),
  thumbFirst: arbThumbMode,
  thumbFinal: arbThumbMode,
});

describe('Property 27: Save and reopen round trip', () => {
  it('reopening a saved diorama after a reload restores name, setting, facing and pieces', () => {
    const seen = { opened: 0, renamed: 0, playSaves: 0, autosaves: 0, dialogSaves: 0, thumbs: 0, noThumbs: 0, withPieces: 0 };
    fc.assert(
      fc.property(arbCase, (c) => {
        const h1 = createHarness({
          ...(c.seed
            ? { saved: [c.seed.diorama], start: { open: c.seed.diorama.id }, idStart: c.seed.nextIdStart }
            : { start: 'playfield' as const }),
          thumbnail: c.thumbFirst,
        });
        const h2Box: { h?: ReturnType<typeof createHarness> } = {};
        try {
          const store = h1.store;
          if (c.seed) seen.opened++;

          // Name: rename through the menu action (the diorama must be saved first).
          if (c.rename !== null) {
            if (store.getState().dioramaId === null) expect(store.getState().save('manual')).toBe(true);
            const id = store.getState().dioramaId!;
            expect(store.getState().renameDiorama(id, c.rename)).toBe(true);
            expect(store.getState().dioramaName).toBe(c.rename.trim());
            seen.renamed++;
          }

          // Pieces, setting and start facing through store actions.
          replay(store, c.board.steps);
          store.getState().setSetting(c.setting);
          if (store.getState().startFacing !== c.startFacing) store.getState().flipStartFacing();
          // The dialog and the autosave only save a dirty diorama; two flips dirty it without changing it.
          if (c.saveVia !== 'manual' && !store.getState().isDirty) {
            store.getState().flipStartFacing();
            store.getState().flipStartFacing();
          }

          let s = store.getState();
          expect(s.setting).toBe(c.setting);
          expect(s.startFacing).toBe(c.startFacing);
          const expected = {
            name: s.dioramaName,
            setting: s.setting,
            startFacing: s.startFacing,
            pieces: structuredClone(s.pieces) as Piece[],
          };
          if (c.rename !== null) expect(expected.name).toBe(c.rename.trim());
          if (expected.pieces.length > 0) seen.withPieces++;

          // Optionally run the train in Play mode first.
          let inPlay = false;
          if (c.play && store.getState().setMode('play').ok) {
            inPlay = true;
            store.getState().setDriveMode(c.drive);
            for (let i = 0; i < c.frames; i++) h1.tick(1 / 60);
          }

          h1.scene.setThumbnailMode(c.thumbFinal);
          const issuedBefore = h1.dioramaIds.issued().length;
          const idBefore = store.getState().dioramaId;

          if (c.saveVia === 'manual') {
            // A manual save is allowed in Play mode as well.
            if (inPlay) seen.playSaves++;
            expect(store.getState().save('manual')).toBe(true);
          } else {
            if (inPlay) expect(store.getState().setMode('build').ok).toBe(true);
            if (c.saveVia === 'dialog') {
              store.getState().backToMenu();
              expect(store.getState().dialog).toEqual({ kind: 'unsaved' });
              store.getState().confirmDialog();
              expect(store.getState().screen).toBe('menu');
              seen.dialogSaves++;
            } else {
              h1.clock.advance(31_000);
              seen.autosaves++;
            }
          }

          // The id the save used: the existing one, or the one the repository just issued.
          const issued = h1.dioramaIds.issued();
          const savedId = idBefore ?? issued[issued.length - 1]!;
          expect(issued.length).toBe(idBefore === null ? issuedBefore + 1 : issuedBefore);
          if (c.saveVia !== 'dialog') {
            s = store.getState();
            expect(s.isDirty).toBe(false);
            expect(s.dioramaId).toBe(savedId);
          }
          // Board and settings are untouched by Play mode and by saving.
          if (c.saveVia !== 'dialog') expect(store.getState().pieces).toEqual(expected.pieces);

          // Simulated reload: a fresh store on the same storage.
          h1.dispose();
          const h2 = createHarness({ sharedStorage: h1.storage });
          h2Box.h = h2;
          h2.store.getState().refreshList();
          expect(h2.store.getState().savedList.some((d) => d.id === savedId)).toBe(true);
          expect(h2.store.getState().openDiorama(savedId)).toBe(true);

          const r = h2.store.getState();
          expect(r.screen).toBe('playfield');
          expect(r.dioramaId).toBe(savedId);
          expect(r.isDirty).toBe(false);
          expect(r.dioramaName).toBe(expected.name);
          expect(r.setting).toBe(expected.setting);
          expect(r.startFacing).toBe(expected.startFacing);
          expect(r.pieces).toEqual(expected.pieces);
          // Thumbnails are saved only when the capture succeeded.
          const captured = c.thumbFinal === 'ok';
          expect(r.thumbnail).toBe(captured ? FAKE_THUMBNAIL : null);
          if (captured) seen.thumbs++;
          else seen.noThumbs++;
        } finally {
          h1.dispose();
          h2Box.h?.dispose();
        }
      }),
      { numRuns: 100 },
    );
    // The generators reach every variation the property is meant to cover.
    expect(seen.opened).toBeGreaterThan(0);
    expect(seen.renamed).toBeGreaterThan(0);
    expect(seen.playSaves).toBeGreaterThan(0);
    expect(seen.autosaves).toBeGreaterThan(0);
    expect(seen.dialogSaves).toBeGreaterThan(0);
    expect(seen.thumbs).toBeGreaterThan(0);
    expect(seen.noThumbs).toBeGreaterThan(0);
    expect(seen.withPieces).toBeGreaterThan(10);
  });
});
