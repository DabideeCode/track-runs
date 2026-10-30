/**
 * Pointer gestures for building (design section 9.2; task 13.1).
 *
 * One small state machine turns left-button pointer events from the palette
 * and the 3D canvas into store actions. The store does the work: the
 * controller only decides *which* action a gesture means, so the UI, the
 * keyboard and the test hook share one implementation (Requirement 16.7).
 *
 * ```text
 * idle ──paletteDown──▶ palettePress ──move > 4 px──▶ paletteDrag ──up──▶ drop()
 *                         └──up──▶ selectTool(type), ui
 * idle ──down on canvas, tool selected──▶ toolPress ──up on a tile──▶ placePiece(tool, tile)
 * idle ──down on a piece, no tool──▶ piecePress ──other tile and > 4 px──▶ boardDrag ──up──▶ drop()
 *                                     └──up──▶ selectPiece(id)
 * idle ──down on empty ground, no tool──▶ selectPiece(null)
 * any drag ──pointercancel / window blur──▶ cancelDrag()
 * any drag ──store.drag cleared elsewhere (Escape, Play mode)──▶ the release does nothing
 * ```
 *
 * The controller is framework-free. `attach()` adds `pointerdown`,
 * `pointermove`, `pointerup`, `pointercancel`, `pointerout` and `blur`
 * listeners to the target (normally `window`, so moves and releases are seen
 * anywhere on the page) and subscribes to the store. The palette calls
 * `paletteDown(type, event)` from its own `onPointerDown`; React handles that
 * before the event bubbles to `window`, so the window listener then sees an
 * active gesture and ignores the event. The `pointer*` and `blur` methods are
 * public so tests and Property 20 can drive the machine without a DOM.
 *
 * Tiles come from `SceneBridge.rayFromClient` (DD-7). Pieces under the pointer
 * come from an injected `pickPiece` callback, which the scene's pick proxies
 * provide (task 14.11) through `setPickPiece`.
 *
 * Decisions recorded for this module:
 * - Only the left button (button 0) starts a gesture. Right and middle
 *   presses are left to the camera controls (Requirement 9.4). If the left
 *   button is released while another button stays held, the browser reports a
 *   `pointermove` whose `buttons` lacks bit 1 instead of a `pointerup`; that
 *   move ends the gesture too.
 * - A press turns into a drag after the pointer moves more than 4 px
 *   (D-26). A placed piece additionally needs the pointer to reach a different
 *   tile than the one under the press (Requirement 12.1), so a small jitter
 *   across a tile edge is still a click.
 * - The tile at the release is the target (Requirement 2.4). A release over an
 *   overlay panel counts as off the grid: `isOverScene(event)` decides whether
 *   the pointer is over the 3D canvas. The playfield passes
 *   `(e) => e.target === canvas`; the overlay root has `pointer-events: none`,
 *   so the canvas is the target everywhere except over a panel.
 * - Pointer capture is not used. Mouse moves and releases outside the canvas
 *   already reach the `window` listeners, and capture would retarget events to
 *   the canvas and hide the panels from `isOverScene`. No `preventDefault` is
 *   called; text selection is prevented with CSS (`select-none`) in the overlay.
 * - A click with a tool selected places the tool at rotation 0 with
 *   auto-adjust, the same as a hook `placePiece` without a rotation
 *   (Requirement 15.1, Property 20). A click off the grid with a tool selected
 *   does nothing (D-27). The tool stays selected (Requirement 11.3).
 * - A press on empty ground with no tool clears the selection on press
 *   (design 9.2, D-27). A press on a piece selects it on release, unless it
 *   became a drag; a board drag selects the piece when it starts.
 * - A palette click plays `ui` through the injected `playUi`, but only when
 *   the tool was actually selected (a disabled station item plays nothing).
 *   The palette button's own `onClick` should then handle only keyboard
 *   activation (`event.detail === 0`), so a mouse click is not counted twice.
 * - Escape is handled by the keyboard hook (task 13.2), which calls
 *   `cancelDrag()`. The controller notices through its store subscription that
 *   the drag ended and ignores the rest of the gesture. The same happens when
 *   Play mode starts or the playfield closes mid-gesture.
 * - `pointercancel` for the active pointer and a window `blur` cancel any drag
 *   (the board piece stays where it was, the ghost disappears) and clear the
 *   hover, with no sound, like Escape.
 * - Hover (`hoverTile`, `hoverPieceId`) is updated on every move in Build mode:
 *   the tile under the pointer, and the piece under it while no drag is
 *   active (Requirement 31.9). Leaving the canvas or the window clears it
 *   (Requirement 8.6); Play mode keeps it null (8.7, enforced by `setHover`).
 */
import { isPieceType } from '@/domain/catalogue';
import type { PieceType, Tile } from '@/domain/types';
import type { AppState } from '@/store/types';

/** Movement in CSS pixels after which a press becomes a drag (D-26). */
export const DRAG_THRESHOLD_PX = 4;

/** True when a pointer offset is beyond the click/drag threshold. */
export function exceedsDragThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return dx * dx + dy * dy > threshold * threshold;
}

/** The parts of a DOM `PointerEvent` the controller reads. */
export interface PointerLike {
  clientX: number;
  clientY: number;
  /** Defaults to 1 (the mouse). */
  pointerId?: number;
  /** Button that changed: 0 left, 1 middle, 2 right. Defaults to 0. */
  button?: number;
  /** Bit mask of held buttons; bit 1 is the left button. Unknown means "still held". */
  buttons?: number;
  target?: unknown;
  /** For `pointerout`: null when the pointer left the window. */
  relatedTarget?: unknown;
}

/** The store as seen by the controller (the Zustand store satisfies it). */
export interface DragStoreLike {
  getState(): AppState;
  subscribe(listener: (state: AppState, prev: AppState) => void): () => void;
}

/** The scene bridge as seen by the controller (`SceneBridge` satisfies it). */
export interface TileRay {
  rayFromClient(clientX: number, clientY: number): Tile | null;
}

/** Returns the id of the placed piece under a client point, or null. */
export type PickPiece = (clientX: number, clientY: number) => string | null;

/** Minimal event target (normally `window`), so tests can pass a fake. */
export interface PointerTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface DragControllerOptions {
  store: DragStoreLike;
  bridge: TileRay;
  /** Defaults to `window` when it exists. */
  target?: PointerTarget;
  /** Piece under the pointer. Defaults to "none"; the scene can set one later with `setPickPiece`. */
  pickPiece?: PickPiece | null;
  /** Whether the event is over the 3D canvas (not over an overlay panel). Defaults to always true. */
  isOverScene?: (event: PointerLike) => boolean;
  /** Plays the `ui` click for a palette click. */
  playUi?: () => void;
}

/** The controller's gesture phase. */
export type DragPhase =
  | { kind: 'idle' }
  | { kind: 'palettePress'; pointerId: number; type: PieceType; startX: number; startY: number }
  | { kind: 'paletteDrag'; pointerId: number }
  | { kind: 'toolPress'; pointerId: number }
  | { kind: 'piecePress'; pointerId: number; pieceId: string; startX: number; startY: number; startTile: Tile | null }
  | { kind: 'boardDrag'; pointerId: number }
  /** A gesture whose remaining events are ignored (drag cancelled elsewhere, or a drag that could not start). */
  | { kind: 'ignored'; pointerId: number };

const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerout'] as const;

function sameTile(a: Tile | null, b: Tile | null): boolean {
  if (a === null || b === null) return a === b;
  return a.gridX === b.gridX && a.gridZ === b.gridZ;
}

function pointerIdOf(e: PointerLike): number {
  return e.pointerId ?? 1;
}

/** True while the store accepts build gestures: playfield, Build mode, no dialog. */
function canBuild(s: AppState): boolean {
  return s.screen === 'playfield' && s.mode === 'build' && s.dialog === null;
}

export class DragController {
  private readonly store: DragStoreLike;
  private readonly bridge: TileRay;
  private readonly target: PointerTarget | null;
  private readonly isOverScene: (event: PointerLike) => boolean;
  private readonly playUi: () => void;
  private pick: PickPiece | null;
  private state: DragPhase = { kind: 'idle' };
  private detachFn: (() => void) | null = null;

  constructor(options: DragControllerOptions) {
    this.store = options.store;
    this.bridge = options.bridge;
    this.target =
      options.target ?? (typeof window === 'undefined' ? null : (window as unknown as PointerTarget));
    this.pick = options.pickPiece ?? null;
    this.isOverScene = options.isOverScene ?? (() => true);
    this.playUi = options.playUi ?? (() => {});
  }

  /** The current gesture phase. Phases are replaced, never mutated. */
  get phase(): DragPhase {
    return this.state;
  }

  /** Replaces the piece picker (the scene registers its pick proxies here). */
  setPickPiece(pick: PickPiece | null): void {
    this.pick = pick;
  }

  /**
   * Adds the pointer and blur listeners and the store subscription. Calling it
   * again while attached does nothing. Returns `detach`.
   */
  attach(): () => void {
    if (this.detachFn !== null) return this.detachFn;
    const target = this.target;
    const handlers: Record<(typeof POINTER_EVENTS)[number], (e: Event) => void> = {
      pointerdown: (e) => this.pointerDown(e as unknown as PointerLike),
      pointermove: (e) => this.pointerMove(e as unknown as PointerLike),
      pointerup: (e) => this.pointerUp(e as unknown as PointerLike),
      pointercancel: (e) => this.pointerCancel(e as unknown as PointerLike),
      pointerout: (e) => this.pointerOut(e as unknown as PointerLike),
    };
    const onBlur = () => this.blur();
    if (target !== null) {
      for (const type of POINTER_EVENTS) target.addEventListener(type, handlers[type]);
      target.addEventListener('blur', onBlur);
    }
    const unsubscribe = this.store.subscribe((s) => this.onStoreChange(s));
    this.detachFn = () => {
      if (target !== null) {
        for (const type of POINTER_EVENTS) target.removeEventListener(type, handlers[type]);
        target.removeEventListener('blur', onBlur);
      }
      unsubscribe();
      this.detachFn = null;
      this.abort();
    };
    return this.detachFn;
  }

  /** Removes the listeners and cancels any gesture. */
  detach(): void {
    this.detachFn?.();
  }

  // -------------------------------------------------------------------------
  // Entry points
  // -------------------------------------------------------------------------

  /**
   * Left-button press on a palette item. Returns true when the controller
   * took the gesture; false in Play mode, off the playfield, with a dialog
   * open, for another button, an unknown type, the station while one exists,
   * or while another gesture is active.
   */
  paletteDown(type: unknown, e: PointerLike): boolean {
    if (this.state.kind !== 'idle' || (e.button ?? 0) !== 0) return false;
    const s = this.store.getState();
    if (!canBuild(s) || !isPieceType(type)) return false;
    if (type === 'station' && s.pieces.some((p) => p.type === 'station')) return false;
    this.state = {
      kind: 'palettePress',
      pointerId: pointerIdOf(e),
      type,
      startX: e.clientX,
      startY: e.clientY,
    };
    return true;
  }

  /** `pointerdown` anywhere; only left presses over the 3D canvas start a gesture. */
  pointerDown(e: PointerLike): void {
    if (this.state.kind !== 'idle' || (e.button ?? 0) !== 0 || !this.isOverScene(e)) return;
    const s = this.store.getState();
    if (!canBuild(s)) return;
    const pointerId = pointerIdOf(e);
    const tile = this.tileAt(e);

    if (s.selectedTool !== null) {
      this.state = { kind: 'toolPress', pointerId };
    } else {
      const pieceId = this.pieceAt(e);
      if (pieceId !== null) {
        this.state = { kind: 'piecePress', pointerId, pieceId, startX: e.clientX, startY: e.clientY, startTile: tile };
      } else {
        s.selectPiece(null);
      }
    }
    this.updateHover(e);
  }

  /** `pointermove`: starts drags, moves the drag target and updates hover. */
  pointerMove(e: PointerLike): void {
    const phase = this.state;
    if (phase.kind !== 'idle' && pointerIdOf(e) === phase.pointerId) {
      // Left button released while another button is still held (chorded buttons).
      if (e.buttons !== undefined && (e.buttons & 1) === 0) {
        this.release(e);
        return;
      }
      const s = this.store.getState();
      switch (phase.kind) {
        case 'palettePress':
          if (exceedsDragThreshold(e.clientX - phase.startX, e.clientY - phase.startY)) {
            const ok = s.beginDrag({ source: 'palette', type: phase.type, tile: this.tileAt(e) });
            this.state = ok ? { kind: 'paletteDrag', pointerId: phase.pointerId } : { kind: 'ignored', pointerId: phase.pointerId };
          }
          break;
        case 'piecePress': {
          const tile = this.tileAt(e);
          if (
            !sameTile(tile, phase.startTile) &&
            exceedsDragThreshold(e.clientX - phase.startX, e.clientY - phase.startY)
          ) {
            const ok = s.beginDrag({ source: 'board', pieceId: phase.pieceId, tile });
            this.state = ok ? { kind: 'boardDrag', pointerId: phase.pointerId } : { kind: 'ignored', pointerId: phase.pointerId };
          }
          break;
        }
        case 'paletteDrag':
        case 'boardDrag':
          s.setDragTile(this.tileAt(e));
          break;
        default:
          break;
      }
    }
    this.updateHover(e);
  }

  /** `pointerup`: ends the gesture of the same pointer. */
  pointerUp(e: PointerLike): void {
    const phase = this.state;
    if (phase.kind === 'idle' || pointerIdOf(e) !== phase.pointerId) return;
    this.release(e);
  }

  /** `pointercancel`: the browser took the pointer away; cancel like Escape. */
  pointerCancel(e: PointerLike): void {
    const phase = this.state;
    if (phase.kind !== 'idle' && pointerIdOf(e) !== phase.pointerId) return;
    this.abort();
    this.store.getState().setHover(null, null);
  }

  /** `pointerout` with no related target: the pointer left the window. */
  pointerOut(e: PointerLike): void {
    if (e.relatedTarget !== null && e.relatedTarget !== undefined) return;
    if (this.state.kind === 'idle') this.store.getState().setHover(null, null);
  }

  /** Window `blur`: cancel any gesture and clear the hover. */
  blur(): void {
    this.abort();
    this.store.getState().setHover(null, null);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Ends the active gesture at the release point. */
  private release(e: PointerLike): void {
    const phase = this.state;
    this.state = { kind: 'idle' };
    const s = this.store.getState();

    switch (phase.kind) {
      case 'palettePress':
        if (canBuild(s)) {
          s.selectTool(phase.type);
          if (this.store.getState().selectedTool === phase.type) this.playUi();
        }
        break;
      case 'paletteDrag':
      case 'boardDrag':
        if (s.drag !== null) {
          s.setDragTile(this.tileAt(e));
          this.store.getState().drop();
        }
        break;
      case 'toolPress': {
        const tool = s.selectedTool;
        const tile = this.tileAt(e);
        if (canBuild(s) && tool !== null && tile !== null) {
          s.placePiece(tool, tile.gridX, tile.gridZ, { rotation: 0, autoAdjust: true });
        }
        break;
      }
      case 'piecePress':
        if (canBuild(s)) s.selectPiece(phase.pieceId);
        break;
      default:
        break;
    }
    this.updateHover(e);
  }

  /** Drops the gesture without placing anything; cancels a store drag silently. */
  private abort(): void {
    const kind = this.state.kind;
    this.state = { kind: 'idle' };
    if (kind === 'paletteDrag' || kind === 'boardDrag') this.store.getState().cancelDrag();
  }

  /** Reacts to changes made elsewhere (Escape, Play mode, leaving the playfield). */
  private onStoreChange(s: AppState): void {
    const phase = this.state;
    if (phase.kind === 'idle' || phase.kind === 'ignored') return;
    const dragEnded = (phase.kind === 'paletteDrag' || phase.kind === 'boardDrag') && s.drag === null;
    if (dragEnded || !canBuild(s)) this.state = { kind: 'ignored', pointerId: phase.pointerId };
  }

  private tileAt(e: PointerLike): Tile | null {
    return this.isOverScene(e) ? this.bridge.rayFromClient(e.clientX, e.clientY) : null;
  }

  private pieceAt(e: PointerLike): string | null {
    if (this.pick === null || !this.isOverScene(e)) return null;
    const id = this.pick(e.clientX, e.clientY);
    if (typeof id !== 'string') return null;
    return this.store.getState().pieces.some((p) => p.id === id) ? id : null;
  }

  private updateHover(e: PointerLike): void {
    const s = this.store.getState();
    if (!canBuild(s)) {
      if (s.hoverTile !== null || s.hoverPieceId !== null) s.setHover(null, null);
      return;
    }
    const tile = this.tileAt(e);
    const pieceId = s.drag === null ? this.pieceAt(e) : null;
    s.setHover(tile, pieceId);
  }
}

/** Creates a controller; call `attach()` to start listening. */
export function createDragController(options: DragControllerOptions): DragController {
  return new DragController(options);
}
