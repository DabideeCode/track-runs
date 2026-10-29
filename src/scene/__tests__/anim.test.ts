import { describe, expect, it } from 'vitest'
import { DROP_MS, SPRING_OMEGA, dropOffset, easeOutCubic, fadeOut, shakeOffset, springStep } from '../anim'

describe('springStep', () => {
  it('settles from 0 to 1 within 250 ms without overshoot', () => {
    let x = 0
    let v = 0
    let max = 0
    for (let t = 0; t < 0.25; t += 1 / 60) {
      ;[x, v] = springStep(x, v, 1, 1 / 60, SPRING_OMEGA)
      max = Math.max(max, x)
    }
    expect(Math.abs(1 - x)).toBeLessThan(0.01)
    expect(max).toBeLessThanOrEqual(1.001)
  })

  it('is stable for large frame gaps', () => {
    const [x] = springStep(0, 0, 1, 2, SPRING_OMEGA)
    expect(x).toBeCloseTo(1, 5)
  })
})

describe('dropOffset', () => {
  it('lowers from the 0.3-tile lift to rest with a small bounce, all under 300 ms', () => {
    expect(dropOffset(0)).toBeCloseTo(0.3)
    expect(dropOffset(0.3)).toBe(0)
    expect(DROP_MS).toBeLessThan(300)
    let bounce = 0
    for (let t = 0.121; t < 0.3; t += 0.005) bounce = Math.max(bounce, dropOffset(t))
    expect(bounce).toBeGreaterThan(0)
    expect(bounce).toBeLessThanOrEqual(0.04)
  })
})

describe('shakeOffset', () => {
  it('shakes for about 200 ms then rests', () => {
    expect(Math.abs(shakeOffset(0.05))).toBeGreaterThan(0)
    expect(shakeOffset(0.2)).toBeCloseTo(0)
    expect(shakeOffset(0.5)).toBe(0)
  })
})

describe('easing', () => {
  it('eases out', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('fades a deleted piece out over 200 ms', () => {
    expect(fadeOut(0)).toEqual({ scale: 1, lift: 0, opacity: 1 })
    expect(fadeOut(0.2).opacity).toBe(0)
    expect(fadeOut(0.2).scale).toBeLessThan(0.5)
  })
})
