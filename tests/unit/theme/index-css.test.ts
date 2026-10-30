/**
 * Audit of the overlay theme in `src/index.css`.
 *
 * Every hex colour in the stylesheet must be a palette token from
 * `src/theme/palette.ts` and pass the palette rule; named palette variables
 * must match their token; Tailwind's default colours are removed; every radius
 * step is at least 6 px; one font stack is used; the shared panel utility pads
 * by at least 12 px, spaces children by at least 8 px and is translucent with
 * a soft shadow.
 *
 * Requirements: 30.2, 30.3, 30.4, 30.5, 30.6, 30.7
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkPaletteRule } from '@/domain/color';
import { COLOUR_TOKENS, FOCUS_RING_COLOUR, TOKENS, type ColourName } from '@/theme/palette';

const CSS = readFileSync(fileURLToPath(new URL('../../../src/index.css', import.meta.url)), 'utf8');
/** Stylesheet without comments, so commented examples never count. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('index.css colours', () => {
  const hexes = [...CODE.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());

  it('contains colours to check', () => {
    expect(hexes.length).toBeGreaterThan(10);
  });

  it('uses only hex values defined in palette.ts', () => {
    const known = new Set(COLOUR_TOKENS.map((t) => t.hex.toLowerCase()));
    expect(hexes.filter((h) => !known.has(h))).toEqual([]);
  });

  it('keeps every hex value within the palette rule', () => {
    for (const hex of hexes) {
      const accent = hex === FOCUS_RING_COLOUR.toLowerCase();
      expect(checkPaletteRule(hex, { accent }).violations, hex).toEqual([]);
    }
  });

  it('gives each named palette variable the value of its token', () => {
    const byName = new Map(
      (Object.keys(TOKENS) as ColourName[]).map((name) => [`--color-${kebab(name)}`, TOKENS[name].hex]),
    );
    const named = [...CODE.matchAll(/(--color-[a-z-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)];
    expect(named.length).toBeGreaterThan(0);
    for (const [, variable, hex] of named) {
      expect(byName.get(variable), variable).toBe(hex.toLowerCase());
    }
  });

  it('removes the default Tailwind colour palette and uses no black or white keywords', () => {
    expect(CODE).toContain('--color-*: initial');
    expect(CODE).not.toMatch(/\b(black|white)\b/);
    expect(CODE).not.toMatch(/\brgba?\(/);
  });
});

describe('index.css shape and type', () => {
  it('sets every radius step to at least 6 px', () => {
    const radii = [...CODE.matchAll(/--radius-[a-z0-9]+:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(radii.length).toBe(8);
    expect(Math.min(...radii)).toBeGreaterThanOrEqual(6);
    const base = /--radius:\s*(\d*\.?\d+)rem/.exec(CODE);
    expect(Number(base?.[1]) * 16).toBeGreaterThanOrEqual(6);
  });

  it('uses the rounded system font stack for all text', () => {
    const stack = /--font-sans:\s*([^;]+);/.exec(CODE)?.[1].trim();
    expect(stack).toBe('ui-rounded, "SF Pro Rounded", "Segoe UI Variable Text", system-ui, sans-serif');
    expect(CODE).toContain('--font-*: initial');
    expect(/--font-mono:\s*([^;]+);/.exec(CODE)?.[1].trim()).toBe(stack);
  });

  it('defines a panel utility with 12 px padding, 8 px gaps, translucency and a soft shadow', () => {
    const panel = /@utility panel\s*\{([^}]*)\}/.exec(CODE)?.[1] ?? '';
    // Tailwind's spacing unit is 0.25rem (4 px).
    expect(panel).toMatch(/padding:\s*calc\(var\(--spacing\) \* 3\)/);
    expect(panel).toMatch(/gap:\s*calc\(var\(--spacing\) \* 2\)/);
    expect(panel).toMatch(/border-radius:\s*var\(--radius-lg\)/);
    const opacity = /color-mix\(in srgb, var\(--panel\) (\d+)%, transparent\)/.exec(panel);
    expect(Number(opacity?.[1])).toBeLessThanOrEqual(95);
    expect(panel).toContain('box-shadow: var(--shadow-panel)');
    const shadow = /--shadow-panel:\s*\S+\s+\S+\s+(\d+)px/.exec(CODE);
    expect(Number(shadow?.[1])).toBeGreaterThanOrEqual(8);
  });
});
