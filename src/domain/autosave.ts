/**
 * Autosave timing rules (Requirements 23.1, 23.4, 23.5; design section 1.11).
 *
 * Pure functions with no clock access: every event carries the current time
 * (epoch milliseconds) and the store keeps the returned `autosaveDueAt`.
 *
 * Requirement 23.1: an autosave is due 30 seconds after the latest of
 *   - the moment `isDirty` last changed from false to true,
 *   - the previous autosave attempt,
 *   - the most recent return to Build mode from Play mode.
 * Each of these events happens "now", so it is always the latest trigger and
 * the new due time is simply `now + AUTOSAVE_MS`.
 */

import type { GameState } from './types';

/** Delay between a trigger and the autosave it schedules. */
export const AUTOSAVE_MS = 30_000;

/** Events that change when the next autosave is due. */
export type AutosaveEvent =
  /** `isDirty` changed from false to true. */
  | { kind: 'dirtied'; now: number }
  /** An autosave attempt finished; `stillDirty` is true when it failed. */
  | { kind: 'attempted'; now: number; stillDirty: boolean }
  /** The app returned to Build mode from Play mode. */
  | { kind: 'returnedToBuild'; now: number; dirty: boolean }
  /** The diorama became clean (successful save, open or new diorama). */
  | { kind: 'cleaned' };

/**
 * Returns the next autosave due time (epoch ms), or null when none is pending.
 *
 * - `dirtied`: schedule `now + 30 s` (Requirement 23.1, first trigger).
 * - `attempted`: after a failed attempt (still dirty), retry at `now + 30 s`
 *   (Requirement 23.4); after a successful one, nothing is pending.
 * - `returnedToBuild`: restart the timer at `now + 30 s` when dirty
 *   (Requirement 23.1, third trigger); nothing is pending when clean.
 * - `cleaned`: nothing is pending.
 *
 * `prev` is accepted for the store's convenience; no rule needs it, because
 * every trigger happens at `now` and so supersedes any earlier one.
 */
export function nextAutosaveDue(_prev: number | null, event: AutosaveEvent): number | null {
  switch (event.kind) {
    case 'dirtied':
      return event.now + AUTOSAVE_MS;
    case 'attempted':
      return event.stillDirty ? event.now + AUTOSAVE_MS : null;
    case 'returnedToBuild':
      return event.dirty ? event.now + AUTOSAVE_MS : null;
    case 'cleaned':
      return null;
  }
}

/**
 * True when an autosave should be written now: in Build mode, while dirty,
 * with a due time that has been reached. Never due in Play mode or while the
 * diorama is clean (Requirement 23.5).
 */
export function isAutosaveDue(
  dueAt: number | null,
  now: number,
  mode: GameState['mode'],
  dirty: boolean,
): boolean {
  if (mode !== 'build' || !dirty || dueAt === null) return false;
  return now >= dueAt;
}
