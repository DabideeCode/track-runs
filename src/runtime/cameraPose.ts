/**
 * Camera constants shared by `SceneBridge` (Reset view) and `CameraRig`
 * (task 14.8). Design DD-6 and section 9.4; Requirements 9.1 to 9.9.
 *
 * Pure numbers and maths only, so the values can be unit tested in Node.
 */

const DEG = Math.PI / 180;

/** Vertical field of view of the perspective camera, in degrees. */
export const CAMERA_FOV = 40;

/** Polar angle limits from vertical, in degrees (Requirement 9.5). */
export const MIN_POLAR_DEG = 20;
export const MAX_POLAR_DEG = 80;

/** Distance limits from the target, in world units (Requirement 9.6). */
export const MIN_DISTANCE = 4;
export const MAX_DISTANCE = 30;

/** The camera target stays inside the grid area at ground height (Requirement 9.7). */
export const TARGET_BOUNDS = {
  min: { x: -8, y: 0, z: -8 },
  max: { x: 8, y: 0, z: 8 },
} as const;

/** camera-controls `smoothTime`; an animated `setLookAt` settles in about 0.5 s. */
export const CAMERA_SMOOTH_TIME = 0.12;

/** Default pose (Requirement 9.8): target at the origin, distance 18, polar 50°. */
export const DEFAULT_TARGET = { x: 0, y: 0, z: 0 } as const;
export const DEFAULT_DISTANCE = 18;
export const DEFAULT_POLAR_DEG = 50;
/**
 * Azimuth measured from +z toward +x. 45° puts the camera to the south-east of
 * the target, with equal positive x and z offsets.
 */
export const DEFAULT_AZIMUTH_DEG = 45;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Camera position on a sphere around `target` (y up, polar from +y, azimuth from +z toward +x). */
export function orbitPosition(target: Vec3, distance: number, polarDeg: number, azimuthDeg: number): Vec3 {
  const polar = polarDeg * DEG;
  const azimuth = azimuthDeg * DEG;
  const horizontal = distance * Math.sin(polar);
  return {
    x: target.x + horizontal * Math.sin(azimuth),
    y: target.y + distance * Math.cos(polar),
    z: target.z + horizontal * Math.cos(azimuth),
  };
}

/** The default camera position, about (9.75, 11.57, 9.75). */
export const DEFAULT_POSITION: Vec3 = orbitPosition(
  DEFAULT_TARGET,
  DEFAULT_DISTANCE,
  DEFAULT_POLAR_DEG,
  DEFAULT_AZIMUTH_DEG,
);
