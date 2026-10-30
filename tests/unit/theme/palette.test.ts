/**
 * Unit tests for the colour tokens in `src/theme/palette.ts`.
 *
 * Every token must satisfy the palette rule of Requirement 30.3 (HSL
 * saturation <= 60%, or <= 70% for the ghost tints and focus ring; HSL
 * lightness 8% to 96%). The bedroom main light must be cooler (bluer) than the
 * kitchen main light (Requirements 7.6, 7.7). "Cooler" is measured
 * independently of `src/domain/color.ts`: by the blue-to-red channel ratio and
 * by the correlated colour temperature from McCamy's approximation.
 *
 * Requirements: 7.6, 7.7, 30.3
 */
import { describe, expect, it } from 'vitest';
import { checkPaletteRule, parseHex } from '@/domain/color';
import {
  COLOUR_TOKENS,
  FOCUS_RING_COLOUR,
  GHOST_COLOURS,
  LIGHT_COLOURS,
} from '@/theme/palette';

/** sRGB channel (0 to 255) to linear light (0 to 1), per IEC 61966-2-1. */
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Correlated colour temperature in kelvin of an sRGB colour, using the sRGB
 * (D65) to CIE XYZ matrix and McCamy's cubic approximation (1992).
 */
function mccamyCct(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`invalid hex ${hex}`);
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const sum = X + Y + Z;
  const x = X / sum;
  const y = Y / sum;
  const n = (x - 0.332) / (0.1858 - y);
  return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
}

/** Blue channel divided by red channel. */
function blueToRed(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`invalid hex ${hex}`);
  return rgb.b / rgb.r;
}

describe('palette rule (Requirement 30.3)', () => {
  it('has tokens to check', () => {
    expect(COLOUR_TOKENS.length).toBeGreaterThan(0);
  });

  it.each(COLOUR_TOKENS.map((t) => [t.name, t.hex, t.accent] as const))(
    'token %s (%s, accent=%s) passes the palette rule',
    (_name, hex, accent) => {
      const result = checkPaletteRule(hex, { accent });
      expect(result.violations).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );

  it('uses the ghost tints #7fbf7a and #d9776a', () => {
    expect(GHOST_COLOURS.valid.toLowerCase()).toBe('#7fbf7a');
    expect(GHOST_COLOURS.invalid.toLowerCase()).toBe('#d9776a');
  });

  it('marks only the ghost tints and the focus ring as accents', () => {
    const accentHexes = COLOUR_TOKENS.filter((t) => t.accent)
      .map((t) => t.hex.toLowerCase())
      .sort();
    const expected = [GHOST_COLOURS.valid, GHOST_COLOURS.invalid, FOCUS_RING_COLOUR]
      .map((h) => h.toLowerCase())
      .sort();
    expect(accentHexes).toEqual(expected);
  });

  it('rejects pure black, pure white and neon colours', () => {
    expect(checkPaletteRule('#000000').violations).toContain('too_dark');
    expect(checkPaletteRule('#ffffff').violations).toContain('too_light');
    expect(checkPaletteRule('#39ff14').violations).toContain('saturation');
    // The accent allowance does not admit these either.
    expect(checkPaletteRule('#000000', { accent: true }).ok).toBe(false);
    expect(checkPaletteRule('#ffffff', { accent: true }).ok).toBe(false);
    expect(checkPaletteRule('#39ff14', { accent: true }).ok).toBe(false);
  });

  it('allows 65% saturation only for accents', () => {
    // #d22d2d is about hsl(0, 65%, 50%).
    expect(checkPaletteRule('#d22d2d').ok).toBe(false);
    expect(checkPaletteRule('#d22d2d', { accent: true }).ok).toBe(true);
  });

  it('rejects malformed hex values', () => {
    expect(checkPaletteRule('not-a-colour').violations).toEqual(['invalid_hex']);
  });
});

describe('setting light colours (Requirements 7.6, 7.7)', () => {
  it('computes about 6500 K for D65 white, so the CCT helper is sound', () => {
    expect(Math.abs(mccamyCct('#ffffff') - 6504)).toBeLessThan(50);
  });

  it('gives the bedroom main light a higher blue-to-red ratio than the kitchen', () => {
    expect(blueToRed(LIGHT_COLOURS.bedroom.main)).toBeGreaterThan(
      blueToRed(LIGHT_COLOURS.kitchen.main),
    );
  });

  it('gives the bedroom main light a higher colour temperature than the kitchen', () => {
    const bedroom = mccamyCct(LIGHT_COLOURS.bedroom.main);
    const kitchen = mccamyCct(LIGHT_COLOURS.kitchen.main);
    expect(bedroom).toBeGreaterThan(kitchen);
    // Bedroom is cool (above daylight white); kitchen is warm (below it).
    expect(bedroom).toBeGreaterThan(6500);
    expect(kitchen).toBeLessThan(6500);
  });
});
