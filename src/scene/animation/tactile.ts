/**
 * Timing constants and pure animation curves for the tactile interactions in
 * Section 7.2 of requirement.md (Requirement 31) and design.md section 8.
 *
 * Units: heights and offsets in tiles, times in seconds, angles in degrees
 * unless the name ends in `Rad`. No React, Three.js or DOM imports.
 */
import { springFromFrequency, type SpringParams } from './spring';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Grab: lift height of the dragged piece or ghost base (Req 31.1: 0.3 tiles). */
export const LIFT_HEIGHT = 0.3;
/** Grab: lift duration, ease-out cubic (Req 31.1: within 150 ms). */
export const LIFT_DURATION = 0.12;
/** Grab: blob shadow scale while lifted (Req 31.1: larger shadow). */
export const GRAB_SHADOW_SCALE = 1.4;
/** Grab: blob shadow opacity factor while lifted (Req 31.1: softer shadow). */
export const GRAB_SHADOW_OPACITY = 0.6;

/**
 * Drag follow spring (Req 31.2: settle within 250 ms, no jitter).
 * Critically damped (ζ = 1, no overshoot) with ω = 64 rad/s, i.e. stiffness
 * 4096 and damping 128 at mass 1. From a 16-tile offset moving at 20 tiles/s
 * it snaps to the tile centre after at most 14 frames at 60 fps (233 ms).
 * Decision D-34 in design.md.
 */
export const DRAG_SPRING: SpringParams = springFromFrequency(64, 1);
/** Drag follow must settle within this time after the target tile changes (Req 31.2). */
export const DRAG_SETTLE_LIMIT = 0.25;

/** Drag tilt: degrees of tilt per tile/s of horizontal speed (design section 8). */
export const TILT_DEG_PER_SPEED = 0.9;
/** Drag tilt: maximum tilt (Req 31.3: never above 8°). */
export const MAX_TILT_DEG = 8;
/** Drag tilt: time constant for easing the tilt toward its target (and back to 0°). */
export const TILT_EASE_TAU = 0.05;

/** Valid drop: fall from the lifted height to the tile, ease-in. */
export const DROP_FALL_DURATION = 0.08;
/** Valid drop: bounce up and back down after contact. */
export const DROP_BOUNCE_DURATION = 0.16;
/** Valid drop: bounce peak height. */
export const DROP_BOUNCE_HEIGHT = 0.04;
/** Valid drop: total settle time (Req 31.4: under 300 ms). */
export const DROP_DURATION = DROP_FALL_DURATION + DROP_BOUNCE_DURATION;

/** Invalid drop: shake duration (Req 31.5, 31.6: 150 to 250 ms). */
export const SHAKE_DURATION = 0.2;
/** Invalid drop: shake amplitude (tiles). */
export const SHAKE_AMPLITUDE = 0.06;
/** Invalid drop: shake frequency (Hz). */
export const SHAKE_FREQUENCY = 5;
/** Invalid drop: eased return to the origin tile, or ghost fade-out, after the shake. */
export const RETURN_DURATION = 0.18;

/** Rotate: 90° clockwise turn, ease-out cubic (Req 31.7: 112 to 188 ms). */
export const ROTATE_DURATION = 0.15;
/** Rotate: angle turned per R press (degrees, clockwise from above). */
export const ROTATE_STEP_DEG = 90;

/** Delete: shrink, rise and fade duration (Req 31.8: 150 to 250 ms). */
export const DELETE_DURATION = 0.2;
/** Delete: final scale. */
export const DELETE_END_SCALE = 0.6;
/** Delete: final rise (tiles). */
export const DELETE_RISE = 0.2;

/** Hover: lift of the hovered piece (Req 31.9: 0.05 tiles). */
export const HOVER_LIFT = 0.05;
/** Hover: lift and lower duration, ease-out cubic. */
export const HOVER_DURATION = 0.12;

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

const clamp01 = (u: number): number => (u <= 0 || Number.isNaN(u) ? 0 : u >= 1 ? 1 : u);

export const easeOutCubic = (u: number): number => {
  const c = clamp01(u);
  return 1 - (1 - c) ** 3;
};
export const easeInQuad = (u: number): number => {
  const c = clamp01(u);
  return c * c;
};
export const easeInOutCubic = (u: number): number => {
  const c = clamp01(u);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};

/** Interpolate from `from` to `to` over `duration` seconds at time t with an easing curve. */
export function tween(
  from: number,
  to: number,
  t: number,
  duration: number,
  ease: (u: number) => number = easeOutCubic,
): number {
  if (!(duration > 0)) return to;
  return from + (to - from) * ease(t / duration);
}

// ---------------------------------------------------------------------------
// Curves (t = seconds since the animation started)
// ---------------------------------------------------------------------------

/** Grab: base height above the ground at time t (0 → LIFT_HEIGHT, ease-out). */
export function liftHeight(t: number, from = 0): number {
  return tween(from, LIFT_HEIGHT, t, LIFT_DURATION, easeOutCubic);
}

/**
 * Valid drop: base height at time t after release. Falls from `from` to 0 over
 * DROP_FALL_DURATION (ease-in, contact at the end), then a sine hump to
 * DROP_BOUNCE_HEIGHT and back to 0 by DROP_DURATION, then rests at exactly 0.
 */
export function dropHeight(t: number, from = LIFT_HEIGHT): number {
  if (!(t > 0)) return from;
  if (t < DROP_FALL_DURATION) return from * (1 - easeInQuad(t / DROP_FALL_DURATION));
  if (t < DROP_DURATION) {
    const u = (t - DROP_FALL_DURATION) / DROP_BOUNCE_DURATION;
    return DROP_BOUNCE_HEIGHT * Math.sin(Math.PI * u);
  }
  return 0;
}

/**
 * Invalid drop: horizontal shake offset at time t,
 * 0.06 × sin(2π × 5 × t) × (1 − t / 0.2) for 0 ≤ t ≤ 0.2, else 0.
 */
export function shakeOffset(t: number): number {
  if (!(t > 0) || t >= SHAKE_DURATION) return 0;
  return (
    SHAKE_AMPLITUDE * Math.sin(2 * Math.PI * SHAKE_FREQUENCY * t) * (1 - t / SHAKE_DURATION)
  );
}

/** Delete: scale, rise and opacity at time t (ease-out); fully transparent at the end. */
export function deleteFrame(t: number): { scale: number; rise: number; opacity: number } {
  const e = easeOutCubic(t / DELETE_DURATION);
  return {
    scale: 1 + (DELETE_END_SCALE - 1) * e,
    rise: DELETE_RISE * e,
    opacity: 1 - e,
  };
}

/** Hover: lift at time t when raising (`hovered`) or lowering, starting from `from`. */
export function hoverLift(t: number, hovered: boolean, from: number): number {
  return tween(from, hovered ? HOVER_LIFT : 0, t, HOVER_DURATION, easeOutCubic);
}

// ---------------------------------------------------------------------------
// Drag tilt
// ---------------------------------------------------------------------------

/** Tilt angle in degrees for a horizontal speed in tiles/s: clamp(0.9 × speed, 0, 8). */
export function tiltAngleDeg(speed: number): number {
  if (!(speed > 0)) return 0;
  return Math.min(MAX_TILT_DEG, TILT_DEG_PER_SPEED * speed);
}

/**
 * Tilt as small-angle Euler rotations (radians) about the world X and Z axes,
 * so the top of the object leans toward the horizontal velocity (vx, vz).
 * The axis is up × v̂ = (vz, 0, −vx) / |v|. The total angle never exceeds 8°.
 */
export function tiltRotation(vx: number, vz: number): { x: number; z: number } {
  const speed = Math.hypot(vx, vz);
  if (!(speed > 0) || !Number.isFinite(speed)) return { x: 0, z: 0 };
  const angle = (tiltAngleDeg(speed) * Math.PI) / 180;
  return { x: (angle * vz) / speed, z: (-angle * vx) / speed };
}

// ---------------------------------------------------------------------------
// Rotation animation targets
// ---------------------------------------------------------------------------

/**
 * Rotation targets are cumulative Three.js `rotation.y` angles in degrees.
 * A stored Rotation r renders as rotation.y = −r (clockwise from above is
 * negative about +Y). Each R press subtracts 90°, so 270 → 0 still turns 90°
 * clockwise (target −270° → −360°) instead of spinning back 270°.
 */
export function nextRotationTarget(prevTargetDeg: number): number {
  return prevTargetDeg - ROTATE_STEP_DEG;
}

/** The rest angle (degrees) for a stored rotation: −rotation. */
export function restAngleFor(rotation: number): number {
  return rotation === 0 ? 0 : -rotation;
}

const mod360 = (a: number): number => ((a % 360) + 360) % 360;

/**
 * Target for a piece whose stored rotation changed to `rotation`, given the
 * previous target. A single clockwise step animates (−90°). Any other change
 * (undo or redo of a rotate, reopening) jumps to the congruent angle nearest
 * the previous target without animation, which Requirement 31.11 allows.
 */
export function rotationTargetFor(
  prevTargetDeg: number,
  rotation: number,
): { target: number; animate: boolean } {
  // How far the target must decrease (clockwise) to reach an angle ≡ −rotation.
  const cw = mod360(prevTargetDeg + rotation);
  if (cw === 0) return { target: prevTargetDeg, animate: false };
  if (cw === ROTATE_STEP_DEG) return { target: prevTargetDeg - ROTATE_STEP_DEG, animate: true };
  return {
    target: cw <= 180 ? prevTargetDeg - cw : prevTargetDeg + (360 - cw),
    animate: false,
  };
}

/** Rotation angle (degrees) during a rotate tween from `fromDeg` to `toDeg` at time t. */
export function rotateAngle(t: number, fromDeg: number, toDeg: number): number {
  return tween(fromDeg, toDeg, t, ROTATE_DURATION, easeOutCubic);
}

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
