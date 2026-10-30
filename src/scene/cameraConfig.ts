/**
 * Pure configuration for the drei `<CameraControls>` (camera-controls) used by
 * `CameraRig` (task 14.8). Design DD-6 and section 9.4; Requirements 9.1 to 9.7.
 *
 * Kept free of React so it can be unit tested in Node.
 */
import { Box3, Vector3 } from 'three';
import {
  CAMERA_SMOOTH_TIME,
  MAX_DISTANCE,
  MAX_POLAR_DEG,
  MIN_DISTANCE,
  MIN_POLAR_DEG,
  TARGET_BOUNDS,
} from '@/runtime/cameraPose';

const DEG = Math.PI / 180;

/**
 * The camera-controls `ACTION` values this app uses. They mirror
 * `CameraControls.ACTION` from camera-controls 3 (a unit test checks they match),
 * so this module does not import the library directly.
 */
export const CAMERA_ACTION = {
  NONE: 0,
  ROTATE: 1,
  TRUCK: 2,
  DOLLY: 16,
} as const;

export type CameraAction = (typeof CAMERA_ACTION)[keyof typeof CAMERA_ACTION];

export interface CameraControlsConfig {
  mouseButtons: {
    left: CameraAction;
    middle: CameraAction;
    right: CameraAction;
    wheel: CameraAction;
  };
  touches: {
    one: typeof CAMERA_ACTION.NONE;
    two: typeof CAMERA_ACTION.NONE;
    three: typeof CAMERA_ACTION.NONE;
  };
  /** Radians from vertical (Requirement 9.5). */
  minPolarAngle: number;
  maxPolarAngle: number;
  /** World units from the target (Requirement 9.6). */
  minDistance: number;
  maxDistance: number;
  dollyToCursor: false;
  smoothTime: number;
  /** The boundary limits the target only, not the camera (Requirement 9.7). */
  boundaryEnclosesCamera: false;
  /** 0 holds the target hard at the boundary instead of letting it overshoot. */
  boundaryFriction: number;
  boundary: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

/**
 * Left button off (reserved for pieces, Requirement 9.4), right = orbit (9.1),
 * middle = pan (9.2), wheel = zoom (9.3), touch disabled; polar 20° to 80°,
 * distance 4 to 30 and the target held inside the grid.
 */
export function cameraControlsConfig(): CameraControlsConfig {
  return {
    mouseButtons: {
      left: CAMERA_ACTION.NONE,
      middle: CAMERA_ACTION.TRUCK,
      right: CAMERA_ACTION.ROTATE,
      wheel: CAMERA_ACTION.DOLLY,
    },
    touches: { one: CAMERA_ACTION.NONE, two: CAMERA_ACTION.NONE, three: CAMERA_ACTION.NONE },
    minPolarAngle: MIN_POLAR_DEG * DEG,
    maxPolarAngle: MAX_POLAR_DEG * DEG,
    minDistance: MIN_DISTANCE,
    maxDistance: MAX_DISTANCE,
    dollyToCursor: false,
    smoothTime: CAMERA_SMOOTH_TIME,
    boundaryEnclosesCamera: false,
    boundaryFriction: 0,
    boundary: {
      min: { ...TARGET_BOUNDS.min },
      max: { ...TARGET_BOUNDS.max },
    },
  };
}

/** The camera-controls members that `applyCameraControlsConfig` sets. */
export interface ConfigurableCameraControls {
  mouseButtons: { left: number; middle: number; right: number; wheel: number };
  touches: { one: number; two: number; three: number };
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  dollyToCursor: boolean;
  smoothTime: number;
  boundaryEnclosesCamera: boolean;
  boundaryFriction: number;
  setBoundary(box3?: Box3): void;
}

/** Writes `config` onto a camera-controls instance, including the target boundary box. */
export function applyCameraControlsConfig(
  controls: ConfigurableCameraControls,
  config: CameraControlsConfig = cameraControlsConfig(),
): void {
  controls.mouseButtons.left = config.mouseButtons.left;
  controls.mouseButtons.middle = config.mouseButtons.middle;
  controls.mouseButtons.right = config.mouseButtons.right;
  controls.mouseButtons.wheel = config.mouseButtons.wheel;
  controls.touches.one = config.touches.one;
  controls.touches.two = config.touches.two;
  controls.touches.three = config.touches.three;
  controls.minPolarAngle = config.minPolarAngle;
  controls.maxPolarAngle = config.maxPolarAngle;
  controls.minDistance = config.minDistance;
  controls.maxDistance = config.maxDistance;
  controls.dollyToCursor = config.dollyToCursor;
  controls.smoothTime = config.smoothTime;
  controls.boundaryEnclosesCamera = config.boundaryEnclosesCamera;
  controls.boundaryFriction = config.boundaryFriction;
  const { min, max } = config.boundary;
  controls.setBoundary(new Box3(new Vector3(min.x, min.y, min.z), new Vector3(max.x, max.y, max.z)));
}
