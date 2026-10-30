/**
 * Colour helpers and the palette rule (Requirements 30.2, 30.3).
 *
 * Pure functions with no imports. Saturation and lightness are HSL values in
 * percent (0 to 100); hue is in degrees (0 to 360, exclusive of 360).
 */

/** An sRGB colour with 8-bit channels (0 to 255). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** An HSL colour: hue in degrees [0, 360), saturation and lightness in percent [0, 100]. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/**
 * Limits from Requirement 30.3: saturation at most 60% (70% for accents, which
 * are the green and red ghost tints and keyboard focus rings) and lightness
 * from 8% to 96% inclusive. This rules out pure black, pure white and neon.
 */
export const PALETTE_LIMITS = {
  maxSaturation: 60,
  maxAccentSaturation: 70,
  minLightness: 8,
  maxLightness: 96,
} as const;

/** Why a colour fails the palette rule. */
export type PaletteViolation = 'invalid_hex' | 'saturation' | 'too_dark' | 'too_light';

export interface PaletteCheck {
  ok: boolean;
  /** The parsed colour, or null when the input is not a valid hex colour. */
  hsl: Hsl | null;
  /** Every broken limit; empty when `ok` is true. */
  violations: PaletteViolation[];
}

/** Tolerance for floating-point comparisons against the percentage limits. */
const EPSILON = 1e-9;

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parses `#rgb` or `#rrggbb` (the leading `#` is optional, case-insensitive).
 * Returns null for anything else, including colours with an alpha channel.
 */
export function parseHex(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((d) => d + d)
      .join('');
  }
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** Converts 8-bit sRGB to HSL using the standard hexcone formulas. */
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  let s = 0;
  let h = 0;
  if (delta > 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** Converts a hex colour to HSL, or returns null when the hex string is invalid. */
export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

/**
 * Checks a solid colour against the palette rule. Pass `{ accent: true }` for
 * the ghost tints and focus rings, which may reach 70% saturation.
 */
export function checkPaletteRule(hex: string, opts: { accent?: boolean } = {}): PaletteCheck {
  const hsl = hexToHsl(hex);
  if (!hsl) return { ok: false, hsl: null, violations: ['invalid_hex'] };

  const maxSaturation = opts.accent
    ? PALETTE_LIMITS.maxAccentSaturation
    : PALETTE_LIMITS.maxSaturation;
  const violations: PaletteViolation[] = [];
  if (hsl.s > maxSaturation + EPSILON) violations.push('saturation');
  if (hsl.l < PALETTE_LIMITS.minLightness - EPSILON) violations.push('too_dark');
  if (hsl.l > PALETTE_LIMITS.maxLightness + EPSILON) violations.push('too_light');
  return { ok: violations.length === 0, hsl, violations };
}
