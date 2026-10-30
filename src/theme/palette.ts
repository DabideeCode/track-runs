/**
 * Every colour token used by the overlay and the 3D scene (Requirements 7.6,
 * 7.7, 30.2, 30.3).
 *
 * Plain constants only. Components, materials and lights read colours from
 * here, so one unit test can check every token against the palette rule in
 * `src/domain/color.ts`: HSL saturation at most 60% (70% for tokens marked
 * `accent`, which are the ghost tints and the focus ring) and lightness from
 * 8% to 96%.
 *
 * Light colours: design.md section 7.5 suggested `#e6ecff` (bedroom) and
 * `#ffd6a5` (kitchen), but both have 100% HSL saturation, as does the kitchen
 * sky `#fde8cf`. The tokens below keep the same intent (bedroom main light
 * cool and bluish, kitchen main light warm) inside the palette limits; this
 * is recorded as decision D-31 in design.md.
 */

/** Where a colour is used. */
export type ColourUse = 'overlay' | 'material' | 'light';

export interface ColourTokenSpec {
  readonly hex: string;
  readonly use: ColourUse;
  /** Ghost tints and focus rings may reach 70% saturation (Requirement 30.3). */
  readonly accent?: true;
}

/** All colour tokens by name. */
export const TOKENS = {
  // Core palette: cream, honey wood, sage, dusty blue, terracotta, walnut.
  cream: { hex: '#f6efe3', use: 'overlay' },
  parchment: { hex: '#ece0cc', use: 'overlay' },
  honey: { hex: '#d4a465', use: 'material' },
  sage: { hex: '#9caf88', use: 'material' },
  sageDeep: { hex: '#6f8a62', use: 'overlay' },
  dustyBlue: { hex: '#8aa1b8', use: 'material' },
  dustyBlueDeep: { hex: '#5f7a94', use: 'overlay' },
  terracotta: { hex: '#c6735a', use: 'material' },
  terracottaDeep: { hex: '#a65a44', use: 'overlay' },
  walnut: { hex: '#6b4a33', use: 'material' },

  // Overlay text, borders and surfaces.
  ink: { hex: '#3f3329', use: 'overlay' },
  inkMuted: { hex: '#6e5f50', use: 'overlay' },
  border: { hex: '#d8c8b0', use: 'overlay' },
  panel: { hex: '#f4ece0', use: 'overlay' },
  focusRing: { hex: '#5b86b0', use: 'overlay', accent: true },

  // Wood and paint for pieces, the train and props.
  birch: { hex: '#e3c9a0', use: 'material' },
  oak: { hex: '#c08a55', use: 'material' },
  walnutDark: { hex: '#3b2a1f', use: 'material' },
  mustard: { hex: '#d2b46c', use: 'material' },
  felt: { hex: '#8fa77a', use: 'material' },
  plasticDark: { hex: '#4a4440', use: 'material' },
  floorboard: { hex: '#c79a6b', use: 'material' },
  tabletop: { hex: '#e0cfb3', use: 'material' },
  gridLine: { hex: '#f4ece0', use: 'material' },
  tileHighlight: { hex: '#f6efe3', use: 'material' },
  openEndMarker: { hex: '#f6efe3', use: 'material' },
  blobShadow: { hex: '#2e241c', use: 'material' },
  /** Outline around the selected piece (Requirement 12.1, D-49). */
  selectionOutline: { hex: '#5f7a94', use: 'material' },

  // Ghost tints (Requirements 11.5, 11.6).
  ghostValid: { hex: '#7fbf7a', use: 'material', accent: true },
  ghostInvalid: { hex: '#d9776a', use: 'material', accent: true },

  // Lights. The bedroom main light is cooler (bluer) than the kitchen main
  // light (Requirements 7.6, 7.7).
  bedroomLight: { hex: '#e8eef7', use: 'light' },
  bedroomSky: { hex: '#dfe6f0', use: 'light' },
  bedroomGround: { hex: '#c7a27a', use: 'light' },
  kitchenLight: { hex: '#f2e1d2', use: 'light' },
  kitchenSky: { hex: '#f3e6d6', use: 'light' },
  kitchenGround: { hex: '#a8805a', use: 'light' },
  ambientFill: { hex: '#f3ece2', use: 'light' },
} as const satisfies Record<string, ColourTokenSpec>;

export type ColourName = keyof typeof TOKENS;

/** Hex value of every token, by name. */
export const COLOURS = Object.fromEntries(
  Object.entries(TOKENS).map(([name, token]) => [name, token.hex]),
) as { readonly [K in ColourName]: (typeof TOKENS)[K]['hex'] };

export interface ColourToken {
  readonly name: ColourName;
  readonly hex: string;
  readonly use: ColourUse;
  readonly accent: boolean;
}

/** Flat token list for audits; `accent` selects the 70% saturation limit. */
export const COLOUR_TOKENS: readonly ColourToken[] = (
  Object.entries(TOKENS) as Array<[ColourName, ColourTokenSpec]>
).map(([name, token]) => ({
  name,
  hex: token.hex,
  use: token.use,
  accent: token.accent === true,
}));

/** Ghost tints used by the palette ghost and dragged pieces. */
export const GHOST_COLOURS = {
  valid: TOKENS.ghostValid.hex,
  invalid: TOKENS.ghostInvalid.hex,
} as const;

/** Keyboard focus ring colour for every overlay control. */
export const FOCUS_RING_COLOUR = TOKENS.focusRing.hex;

export interface SettingLightColours {
  /** Main (shadow-casting) directional light. */
  readonly main: string;
  /** Hemisphere light sky colour. */
  readonly sky: string;
  /** Hemisphere light ground colour. */
  readonly ground: string;
  /** Ambient fill. */
  readonly ambient: string;
}

/** Light colours per setting. */
export const LIGHT_COLOURS: { readonly bedroom: SettingLightColours; readonly kitchen: SettingLightColours } = {
  bedroom: {
    main: TOKENS.bedroomLight.hex,
    sky: TOKENS.bedroomSky.hex,
    ground: TOKENS.bedroomGround.hex,
    ambient: TOKENS.ambientFill.hex,
  },
  kitchen: {
    main: TOKENS.kitchenLight.hex,
    sky: TOKENS.kitchenSky.hex,
    ground: TOKENS.kitchenGround.hex,
    ambient: TOKENS.ambientFill.hex,
  },
};
