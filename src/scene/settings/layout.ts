/**
 * Plain data for the two settings: ground surfaces, prop placement and the
 * lighting mood (task 14.9; design.md section 7.5; Requirements 7.3, 7.6,
 * 7.7, 7.8, 30.9, 32.4, 33.1).
 *
 * No React or Three.js imports, so the numbers can be checked in Node
 * without WebGL. `settingGeometry.ts` builds the meshes from these values,
 * and the setting components only render what it returns.
 *
 * World coordinates: one unit is one tile, the 16 × 16 grid covers
 * x, z ∈ [−8, 8], +y is up and piece bases sit at y = 0.
 *
 * Props: each prop is described by a local box (`halfX`, `halfZ`, `height`)
 * at yaw 0, turned by `yaw` about +y (Three.js `rotation.y`) and placed at
 * `x`, `z` on the setting's ground at `baseY`. Every part of a prop's mesh
 * stays inside that box, so the box's world bounds are the prop's bounds.
 * Every prop lies entirely between 0.3 and 4 units outside the grid edge
 * (Requirement 7.8), and none is raycast, so props never take a tile or
 * change whether a piece can be placed.
 */
import { LIGHT_COLOURS } from '@/theme/palette';
import { SHADOW_MAP_SIZE } from '@/scene/quality';

export type SettingId = 'bedroom' | 'kitchen';

/** Half the grid edge: the grid covers −8 to 8 on x and z. */
export const GRID_HALF = 8;
/** Smallest gap between any prop and the grid edge (units). */
export const PROP_MIN_GAP = 0.3;
/** Largest distance of any part of a prop beyond the grid edge (Requirement 7.8). */
export const PROP_MAX_REACH = 4;

// ---------------------------------------------------------------------------
// Ground surfaces
// ---------------------------------------------------------------------------

export interface SurfaceSpec {
  /** Edge lengths on x and z. Centred on the grid. */
  readonly width: number;
  readonly depth: number;
  /** Thickness of a slab; 0 for a flat plane. */
  readonly thickness: number;
  /** Height of the top face. */
  readonly topY: number;
  /** Texture repeats across `width` and `depth`. */
  readonly repeatU: number;
  readonly repeatV: number;
}

/** Bedroom: rug thickness. The rug's top is the piece base (y = 0). */
export const RUG_THICKNESS = 0.04;

/**
 * Bedroom floorboards: 40 × 40 under the whole grid. The procedural texture
 * has 8 planks per repeat, so 4 repeats give planks 1.25 units wide.
 */
export const BEDROOM_FLOOR: SurfaceSpec = {
  width: 40,
  depth: 40,
  thickness: 0,
  topY: -RUG_THICKNESS,
  repeatU: 4,
  repeatV: 4,
};

/** Bedroom rug: dusty-blue felt, 19 × 19, under the grid with a 1.5-unit border. */
export const BEDROOM_RUG: SurfaceSpec = {
  width: 19,
  depth: 19,
  thickness: RUG_THICKNESS,
  topY: 0,
  repeatU: 5,
  repeatV: 5,
};

/** Kitchen tabletop: 30 × 24 slab, top face at the piece base. */
export const KITCHEN_TABLE: SurfaceSpec = {
  width: 30,
  depth: 24,
  thickness: 0.6,
  topY: 0,
  repeatU: 3,
  repeatV: 2.4,
};

/** Height of the ground that props stand on in each setting. */
export const PROP_BASE_Y: Readonly<Record<SettingId, number>> = {
  bedroom: BEDROOM_FLOOR.topY,
  kitchen: KITCHEN_TABLE.topY,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type BedroomPropId = 'bedLeg' | 'toyCrate' | 'slipper' | 'bookStack';
export type KitchenPropId = 'fruitBowl' | 'mug' | 'saltShaker' | 'napkin';
export type PropId = BedroomPropId | KitchenPropId;

export interface PropPlacement {
  readonly id: PropId;
  readonly setting: SettingId;
  /** Centre of the local box on the ground. */
  readonly x: number;
  readonly z: number;
  /** Rotation about +y in radians (Three.js `rotation.y`). */
  readonly yaw: number;
  /** Local half extents at yaw 0. */
  readonly halfX: number;
  readonly halfZ: number;
  /** Height above the ground. */
  readonly height: number;
  /** Ground height the prop stands on. */
  readonly baseY: number;
}

export interface Bounds2D {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function prop(p: Omit<PropPlacement, 'baseY'>): PropPlacement {
  return Object.freeze({ ...p, baseY: PROP_BASE_Y[p.setting] });
}

/** Bedroom floor props: a bed leg, a toy crate, a slipper and a stack of books. */
export const BEDROOM_PROPS: readonly PropPlacement[] = Object.freeze([
  prop({ id: 'bedLeg', setting: 'bedroom', x: -9.8, z: -9.6, yaw: 0, halfX: 0.45, halfZ: 0.45, height: 2.7 }),
  prop({ id: 'toyCrate', setting: 'bedroom', x: 10.6, z: -4.5, yaw: 0.18, halfX: 1.1, halfZ: 0.8, height: 1.5 }),
  prop({ id: 'slipper', setting: 'bedroom', x: -4.2, z: 10.4, yaw: -0.35, halfX: 1.4, halfZ: 0.55, height: 0.5 }),
  prop({ id: 'bookStack', setting: 'bedroom', x: 5.2, z: 10.2, yaw: 0.25, halfX: 0.85, halfZ: 0.65, height: 0.54 }),
]);

/** Kitchen table props: a fruit bowl, a mug, a salt shaker and a folded napkin. */
export const KITCHEN_PROPS: readonly PropPlacement[] = Object.freeze([
  prop({ id: 'fruitBowl', setting: 'kitchen', x: 10.4, z: -9.9, yaw: 0, halfX: 1.3, halfZ: 1.3, height: 1.25 }),
  prop({ id: 'mug', setting: 'kitchen', x: -10.2, z: 3.6, yaw: 2.6, halfX: 0.85, halfZ: 0.55, height: 1.2 }),
  prop({ id: 'saltShaker', setting: 'kitchen', x: -9.3, z: 6.3, yaw: 0, halfX: 0.3, halfZ: 0.3, height: 0.95 }),
  prop({ id: 'napkin', setting: 'kitchen', x: -3.6, z: -10.1, yaw: 0.4, halfX: 1.0, halfZ: 1.0, height: 0.12 }),
]);

export const SETTING_PROPS: Readonly<Record<SettingId, readonly PropPlacement[]>> = {
  bedroom: BEDROOM_PROPS,
  kitchen: KITCHEN_PROPS,
};

/** World x/z bounds of a prop's local box after its yaw. */
export function propBounds(p: PropPlacement): Bounds2D {
  const c = Math.abs(Math.cos(p.yaw));
  const s = Math.abs(Math.sin(p.yaw));
  const ex = p.halfX * c + p.halfZ * s;
  const ez = p.halfX * s + p.halfZ * c;
  return { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez };
}

/**
 * Gap between bounds and the grid square. Positive when the bounds lie
 * entirely outside x, z ∈ [−8, 8]; zero or negative when they touch or overlap it.
 */
export function gridGap(b: Bounds2D): number {
  return Math.max(b.minX - GRID_HALF, -GRID_HALF - b.maxX, b.minZ - GRID_HALF, -GRID_HALF - b.maxZ);
}

/** How far the furthest point of the bounds lies beyond the grid edge. */
export function gridReach(b: Bounds2D): number {
  return Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minZ), Math.abs(b.maxZ)) - GRID_HALF;
}

/** True when the bounds lie 0.3 to 4 units outside the grid edge. */
export function isWithinPropBand(b: Bounds2D): boolean {
  return gridGap(b) >= PROP_MIN_GAP && gridReach(b) <= PROP_MAX_REACH;
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

export interface LightingMood {
  /** Main directional light colour and intensity. */
  readonly main: string;
  readonly mainIntensity: number;
  /** Hemisphere fill. */
  readonly sky: string;
  readonly ground: string;
  readonly hemisphereIntensity: number;
  /** Weak ambient fill. */
  readonly ambient: string;
  readonly ambientIntensity: number;
}

/**
 * Light colours come from `theme/palette.ts` (decision D-31): the bedroom main
 * light is cool daylight, bluer than the warm kitchen main light (Requirements
 * 7.6, 7.7).
 */
export const LIGHTING_MOODS: Readonly<Record<SettingId, LightingMood>> = {
  bedroom: {
    main: LIGHT_COLOURS.bedroom.main,
    mainIntensity: 2.3,
    sky: LIGHT_COLOURS.bedroom.sky,
    ground: LIGHT_COLOURS.bedroom.ground,
    hemisphereIntensity: 0.9,
    ambient: LIGHT_COLOURS.bedroom.ambient,
    ambientIntensity: 0.25,
  },
  kitchen: {
    main: LIGHT_COLOURS.kitchen.main,
    mainIntensity: 2.1,
    sky: LIGHT_COLOURS.kitchen.sky,
    ground: LIGHT_COLOURS.kitchen.ground,
    hemisphereIntensity: 1.0,
    ambient: LIGHT_COLOURS.kitchen.ambient,
    ambientIntensity: 0.25,
  },
};

/** Duration of the light colour and intensity change on a setting switch (Requirement 7.3: within 1 s). */
export const LIGHT_TRANSITION_MS = 400;

/** Eased progress (0 to 1) of the light transition after `elapsedMs`. */
export function lightTransitionProgress(elapsedMs: number): number {
  if (!(elapsedMs > 0)) return 0;
  const u = elapsedMs / LIGHT_TRANSITION_MS;
  if (u >= 1) return 1;
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/**
 * The single shadow-casting light (Requirements 30.9, 32.4). It shines from
 * high up on the north-west, toward the grid centre. The orthographic shadow
 * camera covers ±12 units, which holds the grid and every prop.
 */
export const MAIN_LIGHT = {
  position: [-6, 16, 10] as const,
  target: [0, 0, 0] as const,
  shadowMapSize: SHADOW_MAP_SIZE,
  shadowBounds: 12,
  shadowNear: 0.5,
  shadowFar: 45,
  shadowBias: -0.0004,
  shadowNormalBias: 0.02,
  /**
   * Blur radius in shadow-map texels. Three.js r186 removed PCFSoftShadowMap;
   * PCFShadowMap samples a disk of this radius, which gives the soft edges
   * Requirement 30.9 asks for (decision D-46).
   */
  shadowRadius: 4,
} as const;
