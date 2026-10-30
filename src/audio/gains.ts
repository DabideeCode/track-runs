/**
 * Pure gain rules for music, effects and the chug loop
 * (Requirements 26.3, 27.10, 27.11).
 *
 * - Muted: every gain is 0. The stored volumes are not changed, so unmuting
 *   gives back exactly the gains from before muting.
 * - Music gain = music volume. Effects gain = effects volume.
 * - Chug gain = effects volume × speed / 2 tiles per second, so the chug is at
 *   the effects volume at the 2 tiles/s manual top speed and at 0.75 × the
 *   effects volume at the 1.5 tiles/s auto speed.
 *
 * Inputs are clamped: volumes to 0..1 and speed to 0..2. Non-finite numbers
 * count as 0.
 */
import type { AudioSettings } from '../domain/types';

/** Train speed (tiles per second) at which the chug reaches the effects volume. */
export const CHUG_FULL_SPEED = 2;

export interface Gains {
  music: number;
  effects: number;
  chug: number;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

export function computeGains(settings: AudioSettings, speed: number): Gains {
  if (settings.muted) return { music: 0, effects: 0, chug: 0 };
  const music = clamp(settings.musicVolume, 0, 1);
  const effects = clamp(settings.sfxVolume, 0, 1);
  const chug = (effects * clamp(speed, 0, CHUG_FULL_SPEED)) / CHUG_FULL_SPEED;
  return { music, effects, chug };
}
