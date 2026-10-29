// Pure animation curves for the tactile feel in §7.2 (D30). Times are in seconds.

/** Critically damped spring stiffness: settles a unit step in under 250 ms with no overshoot. */
export const SPRING_OMEGA = 28
export const LIFT = 0.3
export const HOVER_LIFT = 0.05
export const MAX_TILT = (8 * Math.PI) / 180
export const ROTATE_S = 0.15
export const DELETE_S = 0.2
export const SHAKE_S = 0.2
const FALL_S = 0.12
const BOUNCE_S = 0.16
export const DROP_MS = (FALL_S + BOUNCE_S) * 1000

/** Exact critically damped spring step; returns [position, velocity]. */
export function springStep(x: number, v: number, target: number, dt: number, omega = SPRING_OMEGA): [number, number] {
  const d = x - target
  const e = Math.exp(-omega * dt)
  const k = (v + omega * d) * dt
  return [target + (d + k) * e, (v - omega * k) * e]
}

export const easeOutCubic = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3)

/** Height above the tile after a valid drop: fall from the lift, then a small settle bounce. */
export function dropOffset(t: number): number {
  if (t <= 0) return LIFT
  if (t < FALL_S) {
    const p = t / FALL_S
    return LIFT * (1 - p * p)
  }
  if (t < FALL_S + BOUNCE_S) return 0.03 * Math.sin((Math.PI * (t - FALL_S)) / BOUNCE_S)
  return 0
}

/** Sideways offset of an invalid drop: a quick decaying shake. */
export function shakeOffset(t: number): number {
  if (t <= 0 || t >= SHAKE_S) return 0
  const p = t / SHAKE_S
  return 0.08 * Math.sin(p * Math.PI * 6) * (1 - p)
}

/** Shrink, lift away and fade over DELETE_S. */
export function fadeOut(t: number): { scale: number; lift: number; opacity: number } {
  const p = Math.min(1, Math.max(0, t / DELETE_S))
  const e = easeOutCubic(p)
  return { scale: 1 - 0.6 * e, lift: 0.25 * e, opacity: 1 - p }
}
