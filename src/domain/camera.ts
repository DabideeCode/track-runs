export const CAMERA_FOV = 40;
export const CAMERA_MIN_POLAR_DEG = 20;
export const CAMERA_MAX_POLAR_DEG = 80;
export const CAMERA_MIN_DISTANCE = 4;
export const CAMERA_MAX_DISTANCE = 30;
export const DEFAULT_POLAR_DEG = 50;
export const DEFAULT_DISTANCE = 23;

export function defaultCameraPosition(): [number, number, number] {
  const polar = (DEFAULT_POLAR_DEG * Math.PI) / 180;
  return [0, DEFAULT_DISTANCE * Math.cos(polar), DEFAULT_DISTANCE * Math.sin(polar)];
}
