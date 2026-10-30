/**
 * Store state and action types (design "Store state", section 3).
 *
 * `AppState = GameState & Extras & Actions`. `GameState` is the Section 9
 * shape from requirement.md; `Extras` holds the UI and session fields from the
 * design. The full state shape is defined here, including fields that later
 * tasks act on (menu and save in 10.2, drag in 10.3, modes and audio in 10.4).
 * Each task adds its actions as a new interface joined into `Actions`.
 */
import type { History } from '@/domain/history';
import type {
  AudioSettings,
  Diorama,
  GameState,
  PieceType,
  Reason,
  Rotation,
  Tile,
} from '@/domain/types';

export type Screen = 'menu' | 'playfield';

export interface DragState {
  source: 'palette' | 'board';
  type: PieceType;
  /** The dragged piece's id for board drags; null for palette drags. */
  pieceId: string | null;
  /** Placement when a board drag began; null for palette drags. */
  origin: { gridX: number; gridZ: number; rotation: Rotation } | null;
  /** Current ghost or dragged-piece rotation. */
  rotation: Rotation;
  /** Snapped target tile under the pointer, or null off the grid. */
  tile: Tile | null;
  /** True when dropping on `tile` would be accepted (`checkFootprint(...) === null`). */
  valid: boolean;
}

export type Dialog = null | { kind: 'deleteDiorama'; id: string } | { kind: 'unsaved' };

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  text: string;
  tone: ToastTone;
}

export interface Extras {
  screen: Screen;
  /** Menu list, newest first. */
  savedList: Diorama[];
  history: History;
  drag: DragState | null;
  /** Build mode only. */
  hoverTile: Tile | null;
  hoverPieceId: string | null;
  dialog: Dialog;
  renamingId: string | null;
  renameError: string | null;
  /** Oldest first; at most `MAX_TOASTS`. */
  toasts: Toast[];
  audio: AudioSettings;
  lowQuality: boolean;
  /** Epoch ms of the next autosave, or null when none is pending. */
  autosaveDueAt: number | null;
  /** `createdAt` of the open diorama, kept across saves. */
  createdAt: string | null;
  /** Thumbnail of the open diorama, replaced on each save. */
  thumbnail: string | null;
}

/** Result of a build action; matches the test hook's `{ ok, id?, reason? }`. */
export type BuildResult = { ok: true; id?: string } | { ok: false; reason: Reason };

export interface PlaceOptions {
  /** Absent means 0°. Validated: anything other than 0, 90, 180 or 270 gives `not_found`. */
  rotation?: unknown;
  /** Apply the auto-adjust rule. Defaults to `rotation === undefined`. */
  autoAdjust?: boolean;
}

/** Build, history and selection actions (task 10.1). */
export interface BuildActions {
  placePiece(type: unknown, gridX: unknown, gridZ: unknown, opts?: PlaceOptions): BuildResult;
  /** `rotation` is the rotation shown at release for UI drags; absent keeps the piece's rotation. */
  movePiece(id: unknown, gridX: unknown, gridZ: unknown, rotation?: unknown): BuildResult;
  rotatePiece(id: unknown): BuildResult;
  removePiece(id: unknown): BuildResult;
  /**
   * Removes the selected piece. Returns null and does nothing (no sound) when
   * nothing is selected, a drag is active or the app is in Play mode.
   */
  deleteSelected(): BuildResult | null;
  /** Ignored in Play mode and for ids that match no piece. Never changes `isDirty`. */
  selectPiece(id: string | null): void;
  /** Ignored in Play mode, for unknown types, and for `station` while a station exists. */
  selectTool(type: PieceType | null): void;
  /** Returns true when a change was applied. Plays no sound. */
  undo(): boolean;
  redo(): boolean;
}

/** Toast actions (task 10.1). */
export interface ToastActions {
  /** Shows a toast for 3 s; returns its id. Drops the oldest beyond 3. */
  pushToast(text: string, tone?: ToastTone): string;
  dismissToast(id: string): void;
}

/** What started a save: the Save button, the autosave timer, or Save in the unsaved-changes dialog. */
export type SaveTrigger = 'manual' | 'autosave' | 'dialog';

/** Menu, navigation, dialog and save actions (task 10.2). All synchronous. */
export interface MenuActions {
  /** Re-reads the saved dioramas into `savedList`, newest first. */
  refreshList(): void;
  /** Opens the playfield with an empty, unsaved diorama (Requirement 35.6). Writes nothing. */
  newDiorama(): void;
  /**
   * Opens a saved diorama in Build mode. Returns false (with an error toast)
   * when the id has no valid stored entry.
   */
  openDiorama(id: string): boolean;
  /** Shows `rename-input` for this entry; clears any earlier validation message. */
  startRename(id: string): void;
  /** Closes `rename-input` without writing (Escape, Requirement 5.7). */
  cancelRename(): void;
  /**
   * Confirms a rename. An invalid name sets `renameError` and writes nothing;
   * a failed write shows a toast and keeps the old name. Returns true when the
   * new name was stored.
   */
  renameDiorama(id: string, name: string): boolean;
  /** Opens the delete confirmation dialog for this entry. */
  requestDeleteDiorama(id: string): void;
  /** `confirm-ok`: Delete in the delete dialog, Save in the unsaved-changes dialog. */
  confirmDialog(): void;
  /** Cancel or Escape: closes the open dialog and changes nothing else. */
  cancelDialog(): void;
  /** `confirm-discard`: leaves to the menu without writing. */
  discardAndLeave(): void;
  /** `back-to-menu`: opens the unsaved-changes dialog when dirty, otherwise leaves. */
  backToMenu(): void;
  /** Saves the open diorama. Returns true on success. Ignored (false) when no diorama is open. */
  save(trigger?: SaveTrigger): boolean;
}

/** What a drag starts from: a palette item, or a placed piece on the board. */
export type DragSource =
  | { source: 'palette'; type: PieceType; tile?: Tile | null }
  | { source: 'board'; pieceId: string; tile?: Tile | null };

/**
 * Drag actions (task 10.3). The drag controller (task 13.1) calls them; the
 * scene reads `drag` to draw the ghost or the lifted piece. All synchronous.
 */
export interface DragActions {
  /**
   * Starts a drag and plays `pickup`. Returns false and does nothing (no
   * sound) in Play mode, while a drag is already active, for an unknown type
   * or piece id, and for the station palette item while a station exists.
   * Palette drags set `selectedTool` and start at 0°; board drags select the
   * piece and start at its current placement. `tile` is the initial target.
   */
  beginDrag(src: DragSource): boolean;
  /**
   * Sets the target tile (null off the grid) and recomputes `drag.valid` with
   * `checkFootprint`, treating the dragged piece's own tiles as free.
   */
  setDragTile(tile: Tile | null): void;
  /** Turns the ghost or dragged piece 90° clockwise and plays `rotate`. False with no drag. */
  rotateDrag(): boolean;
  /**
   * Ends the drag at its current tile. Palette: `placePiece` with the drag
   * rotation and auto-adjust. Board: `movePiece` with the drag rotation.
   * Off the grid: plays `invalid` and returns `out_of_bounds`. Returns null
   * when no drag is active. `drag` is null afterwards in every case.
   */
  drop(): BuildResult | null;
  /** Ends the drag without changing pieces or playing a sound (Escape). False with no drag. */
  cancelDrag(): boolean;
}

/**
 * Hover action (task 13.1). The drag controller reports what is under the
 * pointer; the scene draws the tile highlight and the hover lift from it.
 */
export interface HoverActions {
  /**
   * Sets `hoverTile` (null off the grid) and `hoverPieceId` (null over no
   * piece). Off-grid or non-integer tiles and unknown piece ids become null.
   * In Play mode or off the playfield both are forced to null (Requirement
   * 8.7). Writes nothing when both values are unchanged.
   */
  setHover(tile: Tile | null, pieceId: string | null): void;
}

/** Result of `setMode`; matches the test hook's `{ ok, reason? }`. */
export type ModeResult = { ok: true } | { ok: false; reason: Reason };

/**
 * Mode, drive, start-facing and setting actions (task 10.4). All synchronous.
 */
export interface ModeActions {
  /**
   * Switches between Build and Play mode (Requirements 18.2 to 18.6).
   * Play without a station: toast "Place a station to start", `invalid`,
   * `{ ok: false, reason: 'no_station' }`. Play with a station: cancels any
   * drag, clears the selection and hover, sets `driveMode` to `'auto'` and
   * starts the train. Build: stops the train and restarts the autosave timer
   * when dirty. Asking for the current mode returns `{ ok: true }` and does
   * nothing. Never changes `isDirty`. A value other than `'build'` or
   * `'play'` returns `not_found` and changes nothing.
   */
  setMode(mode: unknown): ModeResult;
  /**
   * Sets `driveMode` in any mode (test hook, Requirement 39.11) and passes it
   * to the train. Values other than `'auto'` and `'manual'` are ignored.
   */
  setDriveMode(mode: unknown): void;
  /** The drive toggle: switches auto ↔ manual in Play mode only (Requirement 20.6). True when changed. */
  toggleDriveMode(): boolean;
  /** Toggles `startFacing` 0 ↔ 180 in Build mode on the playfield and sets `isDirty`. True when changed. */
  flipStartFacing(): boolean;
  /** Changes the setting in either mode; sets `isDirty` only when the value differs. True when changed. */
  setSetting(setting: unknown): boolean;
}

/**
 * Audio and quality settings actions (task 10.4). Each updates the in-memory
 * value first, then persists it; a failed write keeps the in-memory value.
 */
export interface SettingsActions {
  setMuted(muted: boolean): void;
  /** Clamped to 0..1; a non-number or NaN is ignored. Mute keeps the stored volumes. */
  setMusicVolume(volume: number): void;
  /** Clamped to 0..1; a non-number or NaN is ignored. */
  setSfxVolume(volume: number): void;
  setLowQuality(lowQuality: boolean): void;
}

/**
 * Overlay feedback (task 15.2, D-53). Store actions play no `ui` sound
 * themselves; an overlay button calls `playUi()` when it is activated
 * (Requirement 25.10), then calls its action.
 */
export interface UiActions {
  /** Plays the UI click and appends `ui` to the sound log. Changes no state. */
  playUi(): void;
}

/** Lifecycle helpers. */
export interface LifecycleActions {
  /** Clears every pending timer owned by the store (toasts and the autosave interval). */
  dispose(): void;
}

export type Actions = BuildActions &
  ToastActions &
  MenuActions &
  DragActions &
  HoverActions &
  ModeActions &
  SettingsActions &
  UiActions &
  LifecycleActions;

export type AppState = GameState & Extras & Actions;

/** The data part of the state (no actions). */
export type AppData = GameState & Extras;
