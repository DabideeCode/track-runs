/**
 * Configuration of the R3F `<Canvas>` for the playfield (task 14.14; design
 * section 7.1, D-35, D-46, D-57; Requirements 2.1, 2.8, 32.2, 32.3, 33.2, 33.3).
 *
 * Plain values and functions, so they can be tested in Node without WebGL.
 * The returned objects are module constants: R3F compares the `shadows`,
 * `camera` and `gl` props shallowly, and stable objects keep it from
 * reconfiguring the renderer on every render.
 */
import { PCFShadowMap, type ShadowMapType } from 'three';
import { CAMERA_FOV, DEFAULT_POSITION } from '@/runtime/cameraPose';
import { dprFor, qualityProfile } from './quality';

/** Text shown when the 3D view fails or loses its WebGL context (design: Error Handling). */
export const SCENE_FAILURE_MESSAGE = 'The 3D view stopped. Reload to continue.';
export const SCENE_RELOAD_LABEL = 'Reload';

/** The R3F `shadows` prop in object form, assigned onto `gl.shadowMap`. */
export interface ShadowMapConfig {
  enabled: boolean;
  type: ShadowMapType;
}

/**
 * Both states use `PCFShadowMap`. R3F's `shadows` / `shadows="soft"` select
 * `PCFSoftShadowMap`, which three r186 removed (it warns and falls back), and
 * a boolean `false` would also switch the type to it. Keeping one type means
 * toggling Low quality only flips `enabled` (D-57).
 */
const SHADOWS_ON: ShadowMapConfig = { enabled: true, type: PCFShadowMap };
const SHADOWS_OFF: ShadowMapConfig = { enabled: false, type: PCFShadowMap };

export function shadowConfigFor(lowQuality: boolean): ShadowMapConfig {
  return qualityProfile(lowQuality).shadowType === 'pcf' ? SHADOWS_ON : SHADOWS_OFF;
}

/** WebGL context attributes. Antialias stays on in Low quality (D-35). */
const GL_OPTIONS = {
  antialias: qualityProfile(false).antialias,
  powerPreference: 'high-performance' as const,
};

/** Perspective camera; `CameraRig` applies the default pose before the first frame. */
const CAMERA_OPTIONS = {
  fov: CAMERA_FOV,
  near: 0.1,
  far: 120,
  position: [DEFAULT_POSITION.x, DEFAULT_POSITION.y, DEFAULT_POSITION.z] as [number, number, number],
};

export interface CanvasConfig {
  dpr: number;
  shadows: ShadowMapConfig;
  gl: typeof GL_OPTIONS;
  camera: typeof CAMERA_OPTIONS;
}

/** Canvas props for a device pixel ratio and the Low quality flag. */
export function canvasConfig(devicePixelRatio: number, lowQuality: boolean): CanvasConfig {
  return {
    dpr: dprFor(devicePixelRatio, lowQuality),
    shadows: shadowConfigFor(lowQuality),
    gl: GL_OPTIONS,
    camera: CAMERA_OPTIONS,
  };
}

/** Why the 3D view is not shown. */
export type SceneFailure = { kind: 'error'; error: unknown } | { kind: 'contextLost' };
