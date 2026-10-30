/**
 * The audio port the store and the train runtime talk to.
 *
 * It is defined here, in the audio layer, and not in `src/store/ports.ts`, so
 * that `AudioManager.ts` does not import from the store and the store does not
 * import the audio implementation. `src/store/ports.ts` (task 10.1) re-exports
 * this type. The module has type-only imports and no runtime code.
 */
import type { AudioSettings, SoundEvent } from '../domain/types';

/** One-shot events. `chug` is a loop and goes through `startChug`. */
export type OneShotEvent = Exclude<SoundEvent, 'chug'>;

export interface AudioPort {
  /**
   * Appends `event` to the sound log, always, then plays it if audio is
   * unlocked and not muted. Never throws.
   */
  play(event: OneShotEvent): void;
  /**
   * Appends `chug` to the sound log once, then starts the looping chug if
   * audio is unlocked. `speed` is the train speed in tiles per second.
   */
  startChug(speed?: number): void;
  /**
   * Updates the running chug from the train speed in tiles per second:
   * the loop rate follows the speed, and the gain is
   * effects volume × speed / 2 (Requirement 26.3).
   */
  setChugLevel(speed: number): void;
  /** Stops the chug loop. Logs nothing. Safe to call when no chug is running. */
  stopChug(): void;
  /** Applies mute and volumes to playing and future sounds at once. */
  apply(settings: AudioSettings): void;
  /** A copy of the sound log, oldest first. */
  getLog(): SoundEvent[];
}
