/**
 * Keyboard shortcuts for the playfield (design section 9.3; task 13.2).
 *
 * The logic is framework-free: `handleKeyDown` and `handleKeyUp` take a
 * KeyboardEvent-like object and the store, and call store actions only. The
 * same store actions back the overlay buttons and the test hook, so the
 * keyboard cannot drift from them (Requirement 16.7). `createKeyboardHandler`
 * attaches the handlers to a target (normally `window`) and
 * `useKeyboardShortcuts` is the React wrapper the playfield mounts.
 *
 * Key map (Build mode, playfield shown, no dialog open, no text input focused):
 *
 * | Key                          | Action                                                    |
 * | ---------------------------- | --------------------------------------------------------- |
 * | R                            | drag active: `rotateDrag()`; else selected piece: `rotatePiece(id)` |
 * | Delete, Backspace            | `deleteSelected()` (preventDefault)                       |
 * | Escape                       | drag: `cancelDrag()`; else tool: `selectTool(null)`; else selection: `selectPiece(null)` |
 * | F                            | `flipStartFacing()` (auto-repeat ignored)                 |
 * | Ctrl/Cmd + Z                 | `undo()`                                                  |
 * | Ctrl/Cmd + Shift + Z         | `redo()`                                                  |
 *
 * Play mode: W and S are passed to the train runtime (`setKeys`) while
 * Manual driving is active; every build key is ignored. Releasing W or S
 * (keyup) always clears that key, and a window blur clears both.
 *
 * Decisions recorded for this module:
 * - Ctrl/Cmd+Y is not bound; requirement.md names only Ctrl/Cmd+Shift+Z for redo.
 * - Both `ctrlKey` and `metaKey` are accepted on every platform, so Cmd+Z works
 *   on macOS and Ctrl+Z everywhere (design 9.3).
 * - Single-letter shortcuts (R, F, W, S) and Delete/Backspace are ignored when
 *   Ctrl, Meta or Alt is held, so browser shortcuts such as Ctrl+R, Ctrl+F and
 *   Ctrl+W keep their meaning. Shift is allowed (it also covers Caps Lock).
 * - Auto-repeat is ignored for R, F, Delete, Backspace and Escape, so holding R
 *   turns the piece once. Undo and redo repeat while held, like text editors.
 *   W and S accept repeats (setting a held key again changes nothing).
 * - Escape also clears a piece selection when no drag and no tool is active.
 *   Requirement 11.9 only asks for the tool to be cleared; clearing a
 *   selection next never changes `isDirty`.
 * - While a dialog is open (delete or unsaved-changes) every shortcut is
 *   ignored; the Radix dialog handles its own Escape.
 * - W/S keydowns count only in Play mode with Manual driving (Requirement
 *   21.8). Keydown repeats keep arriving while a key is held, so a key held
 *   through an Auto → Manual switch is picked up on its next repeat.
 * - "Text input" means an `input`, `textarea`, `select` or content-editable
 *   target, as in design 9.3.
 */
import { useEffect } from 'react';
import { useAppStoreApi } from '@/store/useAppStore';
import type { AppState } from '@/store/types';
import type { DriveKeys } from '@/runtime/TrainRuntime';

/** The parts of a DOM `KeyboardEvent` the handlers read. */
export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  target?: unknown;
  preventDefault?: () => void;
}

/** The train runtime as seen by the keyboard (implemented by `TrainRuntime`). */
export interface DriveKeyPort {
  setKeys(keys: Partial<DriveKeys>): void;
  clearKeys(): void;
}

/** Anything with `getState()` that returns the app state (the Zustand store). */
export interface StoreLike {
  getState(): AppState;
}

export interface KeyboardContext {
  store: StoreLike;
  train: DriveKeyPort;
}

/** What a key press did; `null` means the key was ignored. Returned for tests and callers. */
export type KeyCommand =
  | 'rotateDrag'
  | 'rotatePiece'
  | 'deleteSelected'
  | 'cancelDrag'
  | 'clearTool'
  | 'clearSelection'
  | 'flipStartFacing'
  | 'undo'
  | 'redo'
  | 'driveForward'
  | 'driveReverse';

/** True when the event target is a text-entry element (Assumption 19). */
export function isTextInputTarget(target: unknown): boolean {
  if (target === null || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  if (typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function hasCommandModifier(e: KeyEventLike): boolean {
  return e.ctrlKey === true || e.metaKey === true;
}

function hasAnyModifier(e: KeyEventLike): boolean {
  return hasCommandModifier(e) || e.altKey === true;
}

/** Driving key for an event: 'w', 's' or null. */
function driveKeyOf(e: KeyEventLike): 'w' | 's' | null {
  const k = e.key.toLowerCase();
  return k === 'w' || k === 's' ? k : null;
}

/** Handles one keydown. Calls store or train actions and returns what it did. */
export function handleKeyDown(e: KeyEventLike, ctx: KeyboardContext): KeyCommand | null {
  if (isTextInputTarget(e.target)) return null;
  const s = ctx.store.getState();
  if (s.screen !== 'playfield' || s.dialog !== null) return null;

  if (s.mode === 'play') {
    const drive = driveKeyOf(e);
    if (drive === null || hasAnyModifier(e) || s.driveMode !== 'manual') return null;
    ctx.train.setKeys({ [drive]: true });
    return drive === 'w' ? 'driveForward' : 'driveReverse';
  }

  const key = e.key.toLowerCase();

  // Undo and redo: Ctrl or Cmd, optionally Shift, never Alt.
  if (key === 'z' && hasCommandModifier(e) && e.altKey !== true) {
    e.preventDefault?.();
    if (e.shiftKey === true) {
      s.redo();
      return 'redo';
    }
    s.undo();
    return 'undo';
  }

  if (hasAnyModifier(e) || e.repeat === true) return null;

  switch (key) {
    case 'r':
      if (s.drag !== null) {
        s.rotateDrag();
        return 'rotateDrag';
      }
      if (s.selectedPieceId !== null) {
        s.rotatePiece(s.selectedPieceId);
        return 'rotatePiece';
      }
      return null;

    case 'delete':
    case 'backspace':
      e.preventDefault?.();
      return s.deleteSelected() === null ? null : 'deleteSelected';

    case 'escape':
      if (s.drag !== null) {
        s.cancelDrag();
        return 'cancelDrag';
      }
      if (s.selectedTool !== null) {
        s.selectTool(null);
        return 'clearTool';
      }
      if (s.selectedPieceId !== null) {
        s.selectPiece(null);
        return 'clearSelection';
      }
      return null;

    case 'f':
      return s.flipStartFacing() ? 'flipStartFacing' : null;

    default:
      return null;
  }
}

/**
 * Handles one keyup. Releasing W or S always clears that key, whatever the
 * mode, focus or modifiers, so a key can never stay stuck down.
 */
export function handleKeyUp(e: KeyEventLike, ctx: KeyboardContext): void {
  const drive = driveKeyOf(e);
  if (drive !== null) ctx.train.setKeys({ [drive]: false });
}

/** Minimal event target (normally `window`), so tests can pass a fake. */
export interface KeyboardTarget {
  addEventListener(type: 'keydown' | 'keyup', listener: (e: KeyboardEvent) => void): void;
  addEventListener(type: 'blur', listener: () => void): void;
  removeEventListener(type: 'keydown' | 'keyup', listener: (e: KeyboardEvent) => void): void;
  removeEventListener(type: 'blur', listener: () => void): void;
}

export interface KeyboardHandlerOptions extends KeyboardContext {
  target: KeyboardTarget;
}

/**
 * Attaches keydown, keyup and blur listeners to `target`. The blur listener
 * releases both driving keys. Returns a function that detaches all three and
 * releases the keys.
 */
export function createKeyboardHandler({ store, train, target }: KeyboardHandlerOptions): () => void {
  const ctx: KeyboardContext = { store, train };
  const onKeyDown = (e: KeyboardEvent) => void handleKeyDown(e, ctx);
  const onKeyUp = (e: KeyboardEvent) => handleKeyUp(e, ctx);
  const onBlur = () => train.clearKeys();
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
    train.clearKeys();
  };
}

/**
 * Mounts the keyboard shortcuts on `window` while the calling component (the
 * playfield) is mounted. Uses the store from `<AppStoreProvider>`.
 */
export function useKeyboardShortcuts(train: DriveKeyPort, target?: KeyboardTarget): void {
  const store = useAppStoreApi();
  useEffect(() => {
    const t = target ?? (typeof window === 'undefined' ? null : window);
    if (t === null) return;
    return createKeyboardHandler({ store, train, target: t });
  }, [store, train, target]);
}
