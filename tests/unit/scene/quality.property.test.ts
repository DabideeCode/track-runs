// Feature: track-diorama-builder, Property 45: Render pixel ratio is capped
/**
 * **Validates: Requirements 32.3, 33.2**
 *
 * For any device pixel ratio d > 0, the canvas pixel ratio is min(d, 1.5) with
 * Low quality off and min(d, 1) with Low quality on.
 *
 * What is checked:
 *
 * - Oracle. `dprFor(d, lowQuality)` equals an oracle written from the
 *   requirements with literal caps (1.5 from Requirement 32.3, 1.0 from
 *   Requirement 33.2), not from the constants in `quality.ts`.
 * - Bounds. The result is never above the cap for the flag, never above d when
 *   d is positive and finite, and always positive and finite.
 * - Input range. d covers every double, including fractional, very large and
 *   tiny values, 0, −0, negatives, NaN and ±Infinity, plus common display
 *   ratios. Requirement 32.3 only defines d > 0. For anything else (NaN, 0, a
 *   negative, −Infinity) the oracle uses 1, the CSS reference pixel ratio,
 *   which matches the documented behaviour of `dprFor`. +Infinity counts as
 *   d > 0, so it gives the cap.
 * - Quality profile. For each flag, `qualityProfile` matches the requirements:
 *   Low quality turns off the shadow map and the contact shadows (33.1) and
 *   caps the pixel ratio at 1.0 or less (33.2); normal quality keeps both and
 *   caps at 1.5 (32.3, 33.3); the shadow map is at most 2048 × 2048 and one
 *   light casts shadows (32.4); antialias is the same in both (D-35).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DPR_CAP,
  LOW_QUALITY_DPR_CAP,
  SHADOW_CASTING_LIGHTS,
  SHADOW_MAP_SIZE,
  dprFor,
  qualityProfile,
} from '@/scene/quality';

/** Requirement 32.3: never above 1.5 with Low quality off. */
const REQ_NORMAL_CAP = 1.5;
/** Requirement 33.2: 1.0 or less with Low quality on. */
const REQ_LOW_CAP = 1.0;
/** Requirement 32.4: shadow map width and height at most 2048. */
const REQ_MAX_SHADOW_MAP = 2048;

function oracleDpr(d: number, lowQuality: boolean): number {
  const cap = lowQuality ? REQ_LOW_CAP : REQ_NORMAL_CAP;
  // Defined input (Req 32.3): d > 0, which includes +Infinity.
  if (d > 0) return Math.min(d, cap);
  // Undefined input (NaN, 0, −0, negatives, −Infinity): treat as ratio 1.
  return Math.min(1, cap);
}

/** Device pixel ratios across the whole double range plus realistic values. */
const arbDevicePixelRatio: fc.Arbitrary<number> = fc.oneof(
  fc.double(),
  fc.double({ min: 0, max: 4, noNaN: true }),
  fc.double({ min: 1e-12, max: 1e-3, noNaN: true }),
  fc.double({ min: 1e3, max: Number.MAX_VALUE, noNaN: true }),
  fc.constantFrom(
    0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 4,
    Number.MIN_VALUE, Number.MAX_VALUE, Number.EPSILON,
    1 - Number.EPSILON, 1 + Number.EPSILON, 1.5 - Number.EPSILON, 1.5 + 2 * Number.EPSILON,
    0, -0, -1, -1.5, -Number.MAX_VALUE,
    Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
  ),
);

describe('Property 45: Render pixel ratio is capped', () => {
  it('dprFor matches the requirement oracle and stays within its bounds', () => {
    fc.assert(
      fc.property(arbDevicePixelRatio, fc.boolean(), (d, lowQuality) => {
        const result = dprFor(d, lowQuality);
        const cap = lowQuality ? REQ_LOW_CAP : REQ_NORMAL_CAP;

        expect(Object.is(result, oracleDpr(d, lowQuality))).toBe(true);
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThanOrEqual(cap);
        if (d > 0 && Number.isFinite(d)) {
          expect(result).toBeLessThanOrEqual(d);
        }
        // Low quality never renders sharper than normal quality.
        expect(dprFor(d, true)).toBeLessThanOrEqual(dprFor(d, false));
        // The pixel ratio cap agrees with the quality profile in use.
        expect(result).toBeLessThanOrEqual(qualityProfile(lowQuality).dprCap);
      }),
      { numRuns: 100 },
    );
  });

  it('the quality profile matches the requirements for each flag', () => {
    fc.assert(
      fc.property(fc.boolean(), (lowQuality) => {
        const p = qualityProfile(lowQuality);

        // Req 32.4: one shadow-casting light, map at most 2048 × 2048.
        expect(SHADOW_CASTING_LIGHTS).toBe(1);
        expect(Number.isInteger(p.shadowMapSize)).toBe(true);
        expect(p.shadowMapSize).toBeGreaterThan(0);
        expect(p.shadowMapSize).toBeLessThanOrEqual(REQ_MAX_SHADOW_MAP);
        expect(SHADOW_MAP_SIZE).toBeLessThanOrEqual(REQ_MAX_SHADOW_MAP);

        // D-35: antialias stays on in both profiles.
        expect(p.antialias).toBe(true);
        expect(p.antialias).toBe(qualityProfile(!lowQuality).antialias);

        if (lowQuality) {
          // Req 33.1: no shadow map and no contact shadows.
          expect(p.shadows).toBe(false);
          expect(p.shadowType).toBe(false);
          expect(p.contactShadows).toBe(false);
          // Req 33.2: pixel ratio 1.0 or less.
          expect(p.dprCap).toBeLessThanOrEqual(REQ_LOW_CAP);
          expect(p.dprCap).toBe(LOW_QUALITY_DPR_CAP);
        } else {
          // Req 33.3: switching the toggle off restores shadows and the 1.5 cap.
          expect(p.shadows).toBe(true);
          expect(p.shadowType).toBe('pcf');
          expect(p.contactShadows).toBe(true);
          // Req 32.3: cap of 1.5.
          expect(p.dprCap).toBe(REQ_NORMAL_CAP);
          expect(p.dprCap).toBe(DPR_CAP);
        }

        // The profile is a frozen shared object, so callers cannot change it.
        expect(Object.isFrozen(p)).toBe(true);
        expect(qualityProfile(lowQuality)).toBe(p);
      }),
      { numRuns: 100 },
    );
  });
});
