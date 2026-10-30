/**
 * Render quality settings for normal and Low quality (Requirements 30.9, 30.10,
 * 32.3, 32.4, 33.1, 33.2, 33.3). Pure functions, no React, Three.js or DOM
 * imports, so they are testable in Node.
 */

/** Device pixel ratio cap with Low quality off (Req 32.3, Section 7.3). */
export const DPR_CAP = 1.5;
/** Device pixel ratio cap with Low quality on (Req 33.2: 1.0 or less). */
export const LOW_QUALITY_DPR_CAP = 1;
/** Shadow map width and height (Req 32.4: at most 2048 × 2048). */
export const SHADOW_MAP_SIZE = 2048;
/** Number of shadow-casting lights (Req 30.9, 32.4: exactly one main light). */
export const SHADOW_CASTING_LIGHTS = 1;
/** Frame rate target for 100 pieces at 1920 × 1080 (Req 32.1). */
export const TARGET_FPS = 30;

export interface QualityProfile {
  /** Highest render pixel ratio. */
  dprCap: number;
  /** Renderer shadow maps on; the main light casts shadows (Req 30.9, 33.1). */
  shadows: boolean;
  /**
   * Shadow map type: PCF (`PCFShadowMap`) or off. Three.js r186 removed
   * PCFSoftShadowMap, so soft edges come from PCF with the main light's
   * `shadow.radius` (D-46). `sceneCanvasConfig.ts` turns this into the R3F
   * `shadows` prop (D-57).
   */
  shadowType: 'pcf' | false;
  /** Shadow map size of the main light, used only when `shadows` is true. */
  shadowMapSize: number;
  /** Blob contact shadows under pieces and the train (Req 30.10, 33.1). */
  contactShadows: boolean;
  /**
   * WebGL antialias. Kept on in both profiles: the context attribute is fixed
   * when the canvas is created, and changing it would recreate the canvas and
   * lose the camera pose, which Requirement 33.3 forbids. Decision D-35.
   */
  antialias: boolean;
}

const NORMAL: QualityProfile = Object.freeze({
  dprCap: DPR_CAP,
  shadows: true,
  shadowType: 'pcf',
  shadowMapSize: SHADOW_MAP_SIZE,
  contactShadows: true,
  antialias: true,
});

const LOW: QualityProfile = Object.freeze({
  dprCap: LOW_QUALITY_DPR_CAP,
  shadows: false,
  shadowType: false,
  shadowMapSize: SHADOW_MAP_SIZE,
  contactShadows: false,
  antialias: true,
});

/** The quality profile for the Low quality toggle state. */
export function qualityProfile(lowQuality: boolean): QualityProfile {
  return lowQuality ? LOW : NORMAL;
}

/**
 * Render pixel ratio: min(devicePixelRatio, 1.5), or min(devicePixelRatio, 1)
 * with Low quality on. A NaN, zero or negative device pixel ratio counts as 1.
 */
export function dprFor(devicePixelRatio: number, lowQuality: boolean): number {
  const cap = qualityProfile(lowQuality).dprCap;
  const d = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(d, cap);
}
