/**
 * Pure helpers that write train poses into scene objects (task 14.13;
 * design.md section 7.6, DD-3, D-40; Requirements 17.2, 17.9, 19.3 to 19.7,
 * 19.10).
 *
 * `TrainView` calls these from `useFrame`. They take structural object types
 * instead of Three.js classes, so they can be tested in Node with plain
 * `Object3D`s or simple objects, and they never touch React state.
 */
import { MAX_FRAME_DT, type VehicleKind, type VehiclePose } from '@/domain/train';
import { VEHICLES, vehicleYaw } from '@/scene/models/trainGeometry';

/** The parts of an `Object3D` the pose writer touches. */
export interface PoseTarget {
  position: { set(x: number, y: number, z: number): unknown };
  rotation: { y: number };
  visible: boolean;
}

/** Something that can be shown or hidden (the train's root group). */
export interface VisibleTarget {
  visible: boolean;
}

/** World transform of one vehicle: centre on the ground plane and yaw about +y. */
export interface VehicleTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * The transform for a pose: position (x, 0, z), because the models rest
 * their wheels on the rail top from a ground-level origin, and
 * `rotation.y = atan2(tangent.x, tangent.z)`, which turns the model's front
 * (+z) onto the pose tangent (D-40).
 */
export function vehicleTransform(pose: VehiclePose): VehicleTransform {
  return { x: pose.x, y: 0, z: pose.z, yaw: vehicleYaw(pose.tangent) };
}

/** Writes one pose into a target and shows it. */
export function applyVehiclePose(target: PoseTarget, pose: VehiclePose): void {
  const t = vehicleTransform(pose);
  target.position.set(t.x, t.y, t.z);
  target.rotation.y = t.yaw;
  // Vehicles on the straight extension past a dead end are drawn like the
  // others (Requirement 19.10), so `onTrack` does not affect visibility.
  target.visible = true;
}

/**
 * Writes all train poses. With `poses` null (no station, Requirement 17.9)
 * the root is hidden and nothing else changes. Otherwise the root is shown,
 * each vehicle gets the pose with its own `vehicle` kind, and a vehicle
 * without a pose is hidden. Returns whether the train is visible.
 */
export function applyTrainPoses(
  root: VisibleTarget,
  vehicles: Readonly<Record<VehicleKind, PoseTarget | null>>,
  poses: readonly VehiclePose[] | null,
): boolean {
  if (!poses) {
    root.visible = false;
    return false;
  }
  root.visible = true;
  for (const kind of VEHICLES) {
    const target = vehicles[kind];
    if (!target) continue;
    const pose = poses.find((p) => p.vehicle === kind);
    if (pose) applyVehiclePose(target, pose);
    else target.visible = false;
  }
  return true;
}

/**
 * The frame time passed to `TrainRuntime.tick`: a non-finite or negative
 * delta counts as 0, and a long frame (tab switch, GC pause) is clamped to
 * `MAX_FRAME_DT` (0.1 s, D-17), so the train cannot jump past a dead end.
 */
export function frameDelta(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, MAX_FRAME_DT);
}
