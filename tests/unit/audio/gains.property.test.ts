// Feature: track-diorama-builder, Property 34: Gains follow mute and volume
/**
 * **Validates: Requirements 26.3, 27.10**
 *
 * For any mute flag, music volume, effects volume in [0, 1] and train speed in
 * [0, 2], the music gain is 0 when muted and the music volume otherwise, the
 * effects gain is 0 when muted and the effects volume otherwise, and the chug
 * gain is the effects gain × speed / 2; unmuting restores exactly the gains
 * before muting.
 *
 * Oracle, written from the requirements and not from `gains.ts`:
 * - Requirement 27.10: muted → no music and no effects (all gains 0); unmuted →
 *   the volumes set before muting.
 * - Requirement 26.3: chug volume = effects volume × speed / 2 tiles per second.
 *
 * Extra checks on the same inputs: the chug gain never decreases as the speed
 * rises and never exceeds the effects gain, and every gain lies in [0, 1].
 * A final case covers the clamping that `gains.ts` documents for out-of-range
 * and non-finite inputs: the gains must still lie in [0, 1].
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CHUG_FULL_SPEED, computeGains, type Gains } from '@/audio/gains';
import type { AudioSettings } from '@/domain/types';

const RUNS = { numRuns: 100 };
const EPS = 1e-12;

const arbVolume = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
const arbSpeed = fc.double({ min: 0, max: 2, noNaN: true, noDefaultInfinity: true });
const arbSettings: fc.Arbitrary<AudioSettings> = fc.record({
  muted: fc.boolean(),
  musicVolume: arbVolume,
  sfxVolume: arbVolume,
});

function oracle(s: AudioSettings, speed: number): Gains {
  if (s.muted) return { music: 0, effects: 0, chug: 0 };
  return { music: s.musicVolume, effects: s.sfxVolume, chug: (s.sfxVolume * speed) / 2 };
}

function expectGainsClose(actual: Gains, expected: Gains): void {
  expect(Math.abs(actual.music - expected.music)).toBeLessThanOrEqual(EPS);
  expect(Math.abs(actual.effects - expected.effects)).toBeLessThanOrEqual(EPS);
  expect(Math.abs(actual.chug - expected.chug)).toBeLessThanOrEqual(EPS);
}

function expectInUnitRange(g: Gains): void {
  for (const v of [g.music, g.effects, g.chug]) {
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  }
}

describe('Property 34: Gains follow mute and volume', () => {
  it('the chug reaches the effects volume at 2 tiles per second', () => {
    expect(CHUG_FULL_SPEED).toBe(2);
  });

  it('gains match the mute and volume oracle', () => {
    fc.assert(
      fc.property(arbSettings, arbSpeed, (settings, speed) => {
        const g = computeGains(settings, speed);
        expectGainsClose(g, oracle(settings, speed));
        expectInUnitRange(g);
        expect(g.chug).toBeLessThanOrEqual(g.effects + EPS);
      }),
      RUNS,
    );
  });

  it('muting silences everything and unmuting restores the gains from before', () => {
    fc.assert(
      fc.property(arbVolume, arbVolume, arbSpeed, (musicVolume, sfxVolume, speed) => {
        const before: AudioSettings = { muted: false, musicVolume, sfxVolume };
        const gainsBefore = computeGains(before, speed);

        const muted: AudioSettings = { ...before, muted: true };
        expect(computeGains(muted, speed)).toEqual({ music: 0, effects: 0, chug: 0 });
        // Muting does not touch the stored volumes.
        expect(muted.musicVolume).toBe(musicVolume);
        expect(muted.sfxVolume).toBe(sfxVolume);

        const unmuted: AudioSettings = { ...muted, muted: false };
        expect(computeGains(unmuted, speed)).toEqual(gainsBefore);
      }),
      RUNS,
    );
  });

  it('the chug gain never decreases as the speed rises', () => {
    fc.assert(
      fc.property(arbSettings, arbSpeed, arbSpeed, (settings, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(computeGains(settings, lo).chug).toBeLessThanOrEqual(
          computeGains(settings, hi).chug,
        );
      }),
      RUNS,
    );
  });

  it('out-of-range and non-finite inputs still give gains in [0, 1]', () => {
    const arbAnyNumber = fc.oneof(
      fc.double(),
      fc.constantFrom(Number.NaN, Infinity, -Infinity, -1, 1.5, 3, 1e9, -1e9),
    );
    fc.assert(
      fc.property(fc.boolean(), arbAnyNumber, arbAnyNumber, arbAnyNumber, (muted, mv, sv, speed) => {
        const g = computeGains({ muted, musicVolume: mv, sfxVolume: sv }, speed);
        expectInUnitRange(g);
        expect(g.chug).toBeLessThanOrEqual(g.effects);
        if (muted) expect(g).toEqual({ music: 0, effects: 0, chug: 0 });
      }),
      RUNS,
    );
  });
});
