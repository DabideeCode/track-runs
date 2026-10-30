/**
 * The single Zustand store (design section 3, DD-2; Requirements 2.2, 35).
 *
 * `createAppStore(deps)` builds a vanilla store (`zustand/vanilla`), so it runs
 * in Node tests as well as in the browser. React binds to it through
 * `useAppStore.ts`; the test hook calls the same actions on the same instance.
 *
 * Every action is synchronous: `getState()` straight after an action sees its
 * result (Requirements 14.9, 39.2).
 *
 * Layout: the initial state, then one section ("slice") per group of actions.
 * Each slice is a function of a shared `SliceContext`. Later tasks add their
 * slices (menu and save, drag, modes and audio) the same way and spread them
 * into the store in `createAppStore`.
 *
 * Side-effect rules for build actions (design section 3):
 * - Success that changes `pieces`: set `pieces`, record the history entry, set
 *   `isDirty`, schedule the autosave when the diorama becomes dirty, clear a
 *   stale `selectedPieceId` / `hoverPieceId`, then play the action sound and,
 *   if a connection was created, `snap`.
 * - Success that changes nothing (a move onto the same tile with the same
 *   rotation, `entry === null`): play `move` only. No history, no dirty flag.
 * - Rejection: play `invalid` only. Nothing else changes (Requirement 16.11).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { isPieceType } from '@/domain/catalogue';
import { isAutosaveDue, nextAutosaveDue } from '@/domain/autosave';
import { emptyHistory, record, redo as redoHistory, undo as undoHistory } from '@/domain/history';
import { NAME_VALIDATION_MESSAGE, nextUntitledName, validateName } from '@/domain/naming';
import { nextRotation } from '@/domain/connectors';
import { inGrid } from '@/domain/grid';
import { applyBuild, checkFootprint, type BuildRequest } from '@/domain/placement';
import type { Piece, Tile } from '@/domain/types';
import { globalTimers, type AppDeps, type TimerHandle, type Timers } from './ports';
import type {
  AppData,
  AppState,
  BuildActions,
  BuildResult,
  DragActions,
  DragState,
  HoverActions,
  LifecycleActions,
  MenuActions,
  ModeActions,
  ModeResult,
  SaveTrigger,
  SettingsActions,
  ToastActions,
  UiActions,
} from './types';

export type AppStore = StoreApi<AppState>;

/** How long a toast stays visible (D-29). */
export const TOAST_MS = 3_000;
/** At most this many toasts are shown at once; the oldest is dropped (D-29). */
export const MAX_TOASTS = 3;
/** How often the autosave rule is checked; autosave fires 30 to 31 s after its trigger (design 1.11). */
export const AUTOSAVE_CHECK_MS = 1_000;

/** Toast texts (Requirements 5.9, 22.2, 22.11, 23.2, 23.4, 24.8). */
export const TOAST_SAVED = 'Saved';
export const TOAST_SAVE_FAILED = 'Save failed. Your changes are still here.';
export const TOAST_RENAME_FAILED = 'Rename failed. The change was not saved.';
export const TOAST_DELETE_FAILED = 'Delete failed. The change was not saved.';
export const TOAST_OPEN_FAILED = 'That diorama could not be opened.';
/** Shown when Play mode is requested without a station (Requirements 18.2, 39.9). */
export const TOAST_NO_STATION = 'Place a station to start';

/** Shared by every slice. */
export interface SliceContext {
  set: StoreApi<AppState>['setState'];
  get: StoreApi<AppState>['getState'];
  deps: AppDeps;
  timers: Timers;
  /** Disposers run by `dispose()`; slices that own timers register here. */
  onDispose: (fn: () => void) => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/**
 * The state before any diorama is open. The menu is the first screen
 * (Requirement 3.1). Audio and quality settings are read from storage once
 * here; applying them to the audio manager is the bootstrap's job (task 11.4).
 * `savedList` starts empty and is filled by `refreshList` (task 10.2).
 */
export function initialData(deps: Pick<AppDeps, 'settings'>): AppData {
  return {
    // GameState (Section 9); the same values as a new diorama (Requirement 35.6).
    pieces: [],
    selectedTool: null,
    selectedPieceId: null,
    mode: 'build',
    driveMode: 'auto',
    setting: 'bedroom',
    startFacing: 0,
    dioramaId: null,
    dioramaName: '',
    isDirty: false,
    // Extras
    screen: 'menu',
    savedList: [],
    history: emptyHistory(),
    drag: null,
    hoverTile: null,
    hoverPieceId: null,
    dialog: null,
    renamingId: null,
    renameError: null,
    toasts: [],
    audio: deps.settings.loadAudio(),
    lowQuality: deps.settings.loadApp().lowQuality,
    autosaveDueAt: null,
    createdAt: null,
    thumbnail: null,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * The `isDirty` and `autosaveDueAt` patch for a change that dirties the
 * diorama (Requirement 35.4). The autosave is scheduled when `isDirty` turns
 * from false to true (Requirement 23.1). If the diorama is already dirty the
 * pending due time is kept; if none is pending (which normal flows do not
 * produce) one is scheduled, so a dirty diorama never goes without autosave.
 */
export function dirtyPatch(
  s: Pick<AppData, 'isDirty' | 'autosaveDueAt'>,
  now: number,
): Pick<AppData, 'isDirty' | 'autosaveDueAt'> {
  if (s.isDirty && s.autosaveDueAt !== null) return { isDirty: true, autosaveDueAt: s.autosaveDueAt };
  return { isDirty: true, autosaveDueAt: nextAutosaveDue(s.autosaveDueAt, { kind: 'dirtied', now }) };
}

/** `selectedPieceId` and `hoverPieceId` with ids that no longer exist cleared (Requirements 13.9, 35.3). */
function pruneIds(
  s: Pick<AppData, 'selectedPieceId' | 'hoverPieceId'>,
  pieces: readonly Piece[],
): Pick<AppData, 'selectedPieceId' | 'hoverPieceId'> {
  const has = (id: string | null) => id !== null && pieces.some((p) => p.id === id);
  return {
    selectedPieceId: has(s.selectedPieceId) ? s.selectedPieceId : null,
    hoverPieceId: has(s.hoverPieceId) ? s.hoverPieceId : null,
  };
}

// ---------------------------------------------------------------------------
// Build, history and selection slice (task 10.1)
// ---------------------------------------------------------------------------

function buildSlice({ set, get, deps }: SliceContext): BuildActions {
  /** Runs one request through the placement engine and applies the side-effect rules. */
  function run(req: BuildRequest): BuildResult {
    const s = get();
    const outcome = applyBuild({ pieces: s.pieces, mode: s.mode, newId: deps.newId }, req);
    if (!outcome.ok) {
      deps.audio.play('invalid');
      return { ok: false, reason: outcome.reason };
    }
    if (outcome.entry !== null) {
      set({
        pieces: outcome.pieces,
        history: record(s.history, outcome.entry),
        ...dirtyPatch(s, deps.now()),
        ...pruneIds(s, outcome.pieces),
      });
    }
    deps.audio.play(outcome.sound);
    if (outcome.snap) deps.audio.play('snap');
    return outcome.id === undefined ? { ok: true } : { ok: true, id: outcome.id };
  }

  /** Applies an undo or redo step; shared guards (Requirement 13.8). */
  function step(direction: 'undo' | 'redo'): boolean {
    const s = get();
    if (s.mode === 'play' || s.drag !== null) return false;
    const next = direction === 'undo' ? undoHistory(s.history, s.pieces) : redoHistory(s.history, s.pieces);
    if (next === null) return false;
    set({
      pieces: next.pieces,
      history: next.history,
      ...dirtyPatch(s, deps.now()),
      ...pruneIds(s, next.pieces),
    });
    return true;
  }

  return {
    placePiece(type, gridX, gridZ, opts = {}) {
      const rotation = opts.rotation;
      const autoAdjust = opts.autoAdjust ?? rotation === undefined;
      return run({ kind: 'place', type, gridX, gridZ, rotation, autoAdjust });
    },

    movePiece(id, gridX, gridZ, rotation) {
      return run({ kind: 'move', id, gridX, gridZ, rotation });
    },

    rotatePiece(id) {
      return run({ kind: 'rotate', id });
    },

    removePiece(id) {
      return run({ kind: 'remove', id });
    },

    deleteSelected() {
      const s = get();
      if (s.mode === 'play' || s.drag !== null || s.selectedPieceId === null) return null;
      return run({ kind: 'remove', id: s.selectedPieceId });
    },

    selectPiece(id) {
      const s = get();
      if (s.mode === 'play') return;
      if (id === null) {
        if (s.selectedPieceId !== null) set({ selectedPieceId: null });
        return;
      }
      if (id !== s.selectedPieceId && s.pieces.some((p) => p.id === id)) set({ selectedPieceId: id });
    },

    selectTool(type) {
      const s = get();
      if (s.mode === 'play') return;
      if (type !== null) {
        if (!isPieceType(type)) return;
        if (type === 'station' && s.pieces.some((p) => p.type === 'station')) return;
      }
      if (type !== s.selectedTool) set({ selectedTool: type });
    },

    undo: () => step('undo'),
    redo: () => step('redo'),
  };
}

// ---------------------------------------------------------------------------
// Toast slice (task 10.1)
// ---------------------------------------------------------------------------

function toastSlice({ set, get, timers, onDispose }: SliceContext): ToastActions {
  const pending = new Map<string, TimerHandle>();
  let counter = 0;

  function clear(id: string): void {
    const handle = pending.get(id);
    if (handle !== undefined) {
      timers.clearTimeout(handle);
      pending.delete(id);
    }
  }

  onDispose(() => {
    for (const id of [...pending.keys()]) clear(id);
  });

  return {
    pushToast(text, tone = 'info') {
      // Toast ids use their own counter, not `deps.newId`, so showing a toast
      // never shifts the piece id sequence.
      counter += 1;
      const id = `toast-${counter}`;
      const all = [...get().toasts, { id, text, tone }];
      const dropped = all.slice(0, Math.max(0, all.length - MAX_TOASTS));
      for (const t of dropped) clear(t.id);
      set({ toasts: all.slice(dropped.length) });
      pending.set(
        id,
        timers.setTimeout(() => {
          pending.delete(id);
          set({ toasts: get().toasts.filter((t) => t.id !== id) });
        }, TOAST_MS),
      );
      return id;
    },

    dismissToast(id) {
      clear(id);
      const toasts = get().toasts;
      if (toasts.some((t) => t.id === id)) set({ toasts: toasts.filter((t) => t.id !== id) });
    },
  };
}

// ---------------------------------------------------------------------------
// Menu, navigation, dialog, save and autosave slice (task 10.2)
// ---------------------------------------------------------------------------

/**
 * The editor fields of an empty, unsaved diorama (Requirement 35.6) plus the
 * transient fields that every open, create and leave resets (Requirement 13.10).
 * `dioramaName` is filled in by the caller.
 */
function freshEditor(): Omit<
  AppData,
  'screen' | 'savedList' | 'toasts' | 'audio' | 'lowQuality' | 'renamingId' | 'renameError'
> {
  return {
    pieces: [],
    selectedTool: null,
    selectedPieceId: null,
    mode: 'build',
    driveMode: 'auto',
    setting: 'bedroom',
    startFacing: 0,
    dioramaId: null,
    dioramaName: '',
    isDirty: false,
    history: emptyHistory(),
    drag: null,
    hoverTile: null,
    hoverPieceId: null,
    dialog: null,
    autosaveDueAt: null,
    createdAt: null,
    thumbnail: null,
  };
}

/**
 * Decisions recorded for this slice:
 * - Store actions play no `ui` sound; the overlay plays it on button
 *   activation (Requirement 25.10, tasks 15.x), so it is logged once per click.
 * - The camera is not touched here. `CameraRig` applies the default pose
 *   without a transition when the playfield mounts (Requirement 9.9, design 9.4).
 * - Leaving the playfield (back to menu, Discard, a successful dialog Save)
 *   stops the train if it is running and resets the editor to an empty
 *   diorama, so the menu never holds a half-open diorama and no autosave can
 *   fire from the menu.
 * - A manual save is allowed in Play mode (no requirement forbids it);
 *   autosave never runs there (Requirement 23.5).
 * - A failed manual save keeps `autosaveDueAt`; only an autosave attempt
 *   reschedules it (Requirement 23.1 lists autosave attempts, not manual saves).
 * - After the unsaved-changes dialog's Save fails, the dialog closes and the
 *   playfield stays open with the failure toast (Requirement 22.11).
 */
function menuSlice({ set, get, deps, timers, onDispose }: SliceContext): MenuActions {
  const warn =
    deps.warn ??
    ((message: string, data?: unknown) => (data === undefined ? console.warn(message) : console.warn(message, data)));

  function refreshList(): void {
    set({ savedList: deps.saves.list() });
  }

  /** Stops a running train before the editor state is replaced. */
  function stopTrainIfPlaying(): void {
    if (get().mode === 'play') deps.train.exitPlay();
  }

  function leavePlayfield(): void {
    stopTrainIfPlaying();
    set({ ...freshEditor(), screen: 'menu', renamingId: null, renameError: null });
    refreshList();
  }

  /** Captures the thumbnail; null when capture throws or returns nothing usable (Requirement 6.4). */
  function captureThumbnail(): string | null {
    try {
      const url = deps.scene.captureThumbnail();
      return typeof url === 'string' && url.length > 0 ? url : null;
    } catch (error) {
      warn('Capturing the diorama thumbnail failed; saving without one.', error);
      return null;
    }
  }

  function save(trigger: SaveTrigger = 'manual'): boolean {
    const s = get();
    if (s.screen !== 'playfield') return false;
    const thumbnail = captureThumbnail();
    const result = deps.saves.upsert({
      id: s.dioramaId,
      name: s.dioramaName,
      setting: s.setting,
      startFacing: s.startFacing,
      pieces: s.pieces,
      thumbnail,
      createdAt: s.createdAt,
    });
    const now = deps.now();

    if (!result.ok) {
      warn(`Saving the diorama failed (${result.reason}).`);
      // isDirty is left as it is (Requirements 22.11, 36.7); an autosave retries in 30 s (23.4).
      if (trigger === 'autosave') {
        set({ autosaveDueAt: nextAutosaveDue(get().autosaveDueAt, { kind: 'attempted', now, stillDirty: true }) });
      }
      if (trigger === 'dialog' && get().dialog?.kind === 'unsaved') set({ dialog: null });
      get().pushToast(TOAST_SAVE_FAILED, 'error');
      return false;
    }

    const d = result.diorama;
    set({
      dioramaId: d.id,
      dioramaName: d.name,
      createdAt: d.createdAt,
      thumbnail: d.thumbnail ?? null,
      isDirty: false,
      autosaveDueAt: nextAutosaveDue(get().autosaveDueAt, { kind: 'cleaned' }),
    });
    get().pushToast(TOAST_SAVED, 'success');
    if (trigger === 'dialog') leavePlayfield();
    return true;
  }

  // One interval for the store's lifetime; the rule itself decides whether a
  // write is due (Build mode, dirty, due time reached).
  const interval = timers.setInterval(() => {
    const s = get();
    if (s.screen !== 'playfield') return;
    if (isAutosaveDue(s.autosaveDueAt, deps.now(), s.mode, s.isDirty)) save('autosave');
  }, AUTOSAVE_CHECK_MS);
  // In Node, do not keep the process alive for this timer alone.
  (interval as { unref?: () => void } | null)?.unref?.();
  onDispose(() => timers.clearInterval(interval));

  return {
    refreshList,

    newDiorama() {
      stopTrainIfPlaying();
      const savedList = deps.saves.list();
      set({
        ...freshEditor(),
        dioramaName: nextUntitledName(savedList.map((d) => d.name)),
        screen: 'playfield',
        savedList,
        renamingId: null,
        renameError: null,
      });
    },

    openDiorama(id) {
      const d = deps.saves.get(id);
      if (d === null) {
        get().pushToast(TOAST_OPEN_FAILED, 'error');
        refreshList();
        return false;
      }
      stopTrainIfPlaying();
      set({
        ...freshEditor(),
        // Copies in saved order (Requirement 4.4).
        pieces: d.pieces.map((p) => ({ ...p })),
        setting: d.setting,
        startFacing: d.startFacing,
        dioramaId: d.id,
        dioramaName: d.name,
        createdAt: d.createdAt,
        thumbnail: d.thumbnail ?? null,
        screen: 'playfield',
        renamingId: null,
        renameError: null,
      });
      return true;
    },

    startRename(id) {
      set({ renamingId: id, renameError: null });
    },

    cancelRename() {
      set({ renamingId: null, renameError: null });
    },

    renameDiorama(id, name) {
      const checked = validateName(name);
      if (!checked.ok) {
        // The input stays open with the message; nothing is written (Requirement 5.3).
        set({ renameError: NAME_VALIDATION_MESSAGE });
        return false;
      }
      const result = deps.saves.rename(id, checked.name);
      set({ renamingId: null, renameError: null });
      if (!result.ok) {
        warn(`Renaming the diorama failed (${result.reason}).`);
        get().pushToast(TOAST_RENAME_FAILED, 'error');
        refreshList();
        return false;
      }
      if (get().dioramaId === id) set({ dioramaName: result.diorama.name });
      refreshList();
      return true;
    },

    requestDeleteDiorama(id) {
      if (get().dialog !== null) return;
      set({ dialog: { kind: 'deleteDiorama', id } });
    },

    confirmDialog() {
      const dialog = get().dialog;
      if (dialog === null) return;
      if (dialog.kind === 'deleteDiorama') {
        const result = deps.saves.remove(dialog.id);
        set({ dialog: null });
        if (!result.ok) {
          warn(`Deleting the diorama failed (${result.reason}).`);
          get().pushToast(TOAST_DELETE_FAILED, 'error');
        }
        refreshList();
        return;
      }
      // Unsaved-changes dialog: Save, then leave only on success (Requirements 22.7, 22.11).
      save('dialog');
    },

    cancelDialog() {
      if (get().dialog !== null) set({ dialog: null });
    },

    discardAndLeave() {
      if (get().dialog?.kind !== 'unsaved') return;
      leavePlayfield();
    },

    backToMenu() {
      const s = get();
      if (s.screen !== 'playfield' || s.dialog !== null) return;
      if (s.isDirty) set({ dialog: { kind: 'unsaved' } });
      else leavePlayfield();
    },

    save,
  };
}

// ---------------------------------------------------------------------------
// Drag slice (task 10.3)
// ---------------------------------------------------------------------------

/** `drag.valid` for a target tile: the same footprint rules a drop applies (Requirements 11.5, 11.6). */
function dragValidity(pieces: readonly Piece[], drag: DragState, tile: Tile | null): boolean {
  if (tile === null) return false;
  const opts = drag.pieceId === null ? { isNew: true } : { movingId: drag.pieceId, isNew: false };
  return checkFootprint(pieces, drag.type, tile.gridX, tile.gridZ, opts) === null;
}

/** Copies an in-grid tile; anything else counts as off the grid. */
function cleanTile(tile: Tile | null | undefined): Tile | null {
  if (tile === null || tile === undefined || typeof tile !== 'object') return null;
  return inGrid(tile) ? { gridX: tile.gridX, gridZ: tile.gridZ } : null;
}

/**
 * Decisions recorded for this slice:
 * - A palette drag starts at 0°, the same start rotation as a hook
 *   `placePiece` without a rotation (Requirement 39.18, Property 20). R during
 *   the drag turns it; auto-adjust still runs on the drop (Requirement 12.5).
 * - A board drag selects the dragged piece, so it keeps its outline and R
 *   still applies to it after the drop. A palette drag leaves the selection.
 * - Every drop and cancel keeps `selectedTool`: a palette drag sets it
 *   (Requirement 10.3) and it stays for repeated placement (11.3). Escape with
 *   no drag clears it (11.9, keyboard task 13.2).
 * - An off-grid drop returns `{ ok: false, reason: 'out_of_bounds' }` and plays
 *   one `invalid`. The pieces stay unchanged; a board piece is "returned"
 *   simply because its stored placement never changed (Requirement 12.3).
 * - A rejected on-grid drop gets its single `invalid` from `placePiece` or
 *   `movePiece`; the drop adds no sound of its own.
 * - `drag.valid` is computed when the tile changes. The drop re-validates
 *   through the placement engine, so the result is correct even if the board
 *   changed during the drag (for example through the test hook).
 * - `cancelDrag` plays no sound; Escape is a deliberate cancel, not a rejected drop.
 */
function dragSlice({ set, get, deps }: SliceContext): DragActions {
  return {
    beginDrag(src) {
      const s = get();
      if (s.mode === 'play' || s.drag !== null) return false;

      let drag: DragState;
      if (src.source === 'palette') {
        if (!isPieceType(src.type)) return false;
        if (src.type === 'station' && s.pieces.some((p) => p.type === 'station')) return false;
        drag = { source: 'palette', type: src.type, pieceId: null, origin: null, rotation: 0, tile: null, valid: false };
      } else {
        const piece = s.pieces.find((p) => p.id === src.pieceId);
        if (piece === undefined) return false;
        drag = {
          source: 'board',
          type: piece.type,
          pieceId: piece.id,
          origin: { gridX: piece.gridX, gridZ: piece.gridZ, rotation: piece.rotation },
          rotation: piece.rotation,
          tile: null,
          valid: false,
        };
      }
      const tile = cleanTile(src.tile);
      drag = { ...drag, tile, valid: dragValidity(s.pieces, drag, tile) };

      set(
        src.source === 'palette'
          ? { drag, selectedTool: drag.type }
          : { drag, selectedPieceId: drag.pieceId },
      );
      deps.audio.play('pickup');
      return true;
    },

    setDragTile(tile) {
      const s = get();
      if (s.drag === null) return;
      const next = cleanTile(tile);
      const valid = dragValidity(s.pieces, s.drag, next);
      const prev = s.drag.tile;
      const same =
        (prev === null && next === null) ||
        (prev !== null && next !== null && prev.gridX === next.gridX && prev.gridZ === next.gridZ);
      if (same && valid === s.drag.valid) return;
      set({ drag: { ...s.drag, tile: next, valid } });
    },

    rotateDrag() {
      const s = get();
      if (s.drag === null) return false;
      // Rotation never changes a footprint, so `valid` is unchanged.
      set({ drag: { ...s.drag, rotation: nextRotation(s.drag.rotation) } });
      deps.audio.play('rotate');
      return true;
    },

    drop() {
      const drag = get().drag;
      if (drag === null) return null;
      set({ drag: null });
      if (drag.tile === null) {
        deps.audio.play('invalid');
        return { ok: false, reason: 'out_of_bounds' };
      }
      const { gridX, gridZ } = drag.tile;
      if (drag.source === 'palette') {
        return get().placePiece(drag.type, gridX, gridZ, { rotation: drag.rotation, autoAdjust: true });
      }
      return get().movePiece(drag.pieceId, gridX, gridZ, drag.rotation);
    },

    cancelDrag() {
      if (get().drag === null) return false;
      set({ drag: null });
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Hover slice (task 13.1)
// ---------------------------------------------------------------------------

/**
 * Hover state is transient UI state: it never changes `isDirty`, plays no
 * sound and is not recorded in history. It is only kept in Build mode on the
 * playfield; `setMode('play')` and leaving the playfield already clear it.
 */
function hoverSlice({ set, get }: SliceContext): HoverActions {
  return {
    setHover(tile, pieceId) {
      const s = get();
      const active = s.mode === 'build' && s.screen === 'playfield';
      const nextTile = active ? cleanTile(tile) : null;
      const nextPiece =
        active && typeof pieceId === 'string' && s.pieces.some((p) => p.id === pieceId) ? pieceId : null;
      const prev = s.hoverTile;
      const sameTile =
        (prev === null && nextTile === null) ||
        (prev !== null && nextTile !== null && prev.gridX === nextTile.gridX && prev.gridZ === nextTile.gridZ);
      if (sameTile && nextPiece === s.hoverPieceId) return;
      set({ hoverTile: nextTile, hoverPieceId: nextPiece });
    },
  };
}

// ---------------------------------------------------------------------------
// Mode, drive, start-facing and setting slice (task 10.4)
// ---------------------------------------------------------------------------

/**
 * Decisions recorded for this slice:
 * - The train runtime's `enterPlay` emits `whistle` and starts the chug, so
 *   `setMode('play')` plays no sound of its own (Requirement 18.3).
 * - Entering Play mode keeps `selectedTool` for the return to Build mode (D-28)
 *   and cancels a drag silently, like Escape.
 * - Returning to Build mode keeps `driveMode`; the drive toggle is disabled in
 *   Build mode and entering Play mode always sets `'auto'` again.
 * - `setDriveMode` (the test hook) sets the field in either mode
 *   (Requirement 39.11); `toggleDriveMode` (the UI toggle) works in Play mode
 *   only (Requirement 20.6).
 * - `flipStartFacing` works without a station: Requirement 17.9 is read as
 *   "removing the station does not reset the facing", so the user may choose
 *   the direction before placing the station. It is ignored in Play mode
 *   (Requirement 17.10) and off the playfield.
 * - `setSetting` and `flipStartFacing` are ignored on the main menu, so the
 *   menu never holds a dirty editor.
 * - A setting change never touches the train (Requirement 7.10); in Play mode
 *   it dirties the diorama, and the autosave waits for the return to Build mode.
 */
function modeSlice({ set, get, deps }: SliceContext): ModeActions {
  const hasStation = () => get().pieces.some((p) => p.type === 'station');

  return {
    setMode(mode): ModeResult {
      if (mode !== 'build' && mode !== 'play') return { ok: false, reason: 'not_found' };
      const s = get();
      if (mode === s.mode) return { ok: true };

      if (mode === 'play') {
        if (!hasStation()) {
          get().pushToast(TOAST_NO_STATION, 'info');
          deps.audio.play('invalid');
          return { ok: false, reason: 'no_station' };
        }
        set({
          mode: 'play',
          driveMode: 'auto',
          drag: null,
          selectedPieceId: null,
          hoverTile: null,
          hoverPieceId: null,
        });
        deps.train.enterPlay(get().pieces, get().startFacing);
        return { ok: true };
      }

      deps.train.exitPlay();
      const now = deps.now();
      set({
        mode: 'build',
        autosaveDueAt: nextAutosaveDue(s.autosaveDueAt, { kind: 'returnedToBuild', now, dirty: s.isDirty }),
      });
      return { ok: true };
    },

    setDriveMode(mode) {
      if (mode !== 'auto' && mode !== 'manual') return;
      if (get().driveMode !== mode) set({ driveMode: mode });
      deps.train.setDriveMode(mode);
    },

    toggleDriveMode() {
      const s = get();
      if (s.mode !== 'play') return false;
      get().setDriveMode(s.driveMode === 'auto' ? 'manual' : 'auto');
      return true;
    },

    flipStartFacing() {
      const s = get();
      if (s.mode !== 'build' || s.screen !== 'playfield') return false;
      set({ startFacing: s.startFacing === 0 ? 180 : 0, ...dirtyPatch(s, deps.now()) });
      return true;
    },

    setSetting(setting) {
      if (setting !== 'bedroom' && setting !== 'kitchen') return false;
      const s = get();
      if (s.screen !== 'playfield' || s.setting === setting) return false;
      set({ setting, ...dirtyPatch(s, deps.now()) });
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Audio and quality settings slice (task 10.4)
// ---------------------------------------------------------------------------

/** Clamps a volume to 0..1 (−0 becomes 0); null for a non-number or NaN. */
function clampVolume(v: unknown): number | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  const c = Math.min(1, Math.max(0, v));
  return c === 0 ? 0 : c;
}

/**
 * The new value is applied in memory (and to the audio manager) before it is
 * written; `SettingsRepository` warns on a failed write and the in-memory value
 * stays for the session (design section 2). Unchanged values write nothing.
 */
function settingsSlice({ set, get, deps }: SliceContext): SettingsActions {
  function updateAudio(patch: Partial<AppData['audio']>): void {
    const prev = get().audio;
    const next = { ...prev, ...patch };
    if (next.muted === prev.muted && next.musicVolume === prev.musicVolume && next.sfxVolume === prev.sfxVolume) {
      return;
    }
    set({ audio: next });
    deps.audio.apply(next);
    deps.settings.saveAudio(next);
  }

  return {
    setMuted(muted) {
      if (typeof muted !== 'boolean') return;
      updateAudio({ muted });
    },
    setMusicVolume(volume) {
      const v = clampVolume(volume);
      if (v !== null) updateAudio({ musicVolume: v });
    },
    setSfxVolume(volume) {
      const v = clampVolume(volume);
      if (v !== null) updateAudio({ sfxVolume: v });
    },
    setLowQuality(lowQuality) {
      if (typeof lowQuality !== 'boolean' || get().lowQuality === lowQuality) return;
      set({ lowQuality });
      deps.settings.saveApp({ lowQuality });
    },
  };
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export function createAppStore(deps: AppDeps): AppStore {
  const timers = deps.timers ?? globalTimers;
  const disposers: Array<() => void> = [];

  return createStore<AppState>()((set, get) => {
    const ctx: SliceContext = { set, get, deps, timers, onDispose: (fn) => disposers.push(fn) };
    const lifecycle: LifecycleActions = {
      dispose() {
        for (const fn of disposers.splice(0)) fn();
      },
    };
    // Overlay button feedback (Requirement 25.10, D-53).
    const ui: UiActions = {
      playUi() {
        deps.audio.play('ui');
      },
    };
    return {
      ...initialData(deps),
      ...buildSlice(ctx),
      ...toastSlice(ctx),
      ...menuSlice(ctx),
      ...dragSlice(ctx),
      ...hoverSlice(ctx),
      ...modeSlice(ctx),
      ...settingsSlice(ctx),
      ...ui,
      ...lifecycle,
    };
  });
}
