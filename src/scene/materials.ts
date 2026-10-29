// Procedural materials (D1): wood grain is painted on canvases at runtime, so no texture files ship.
// Wood and paint are matte (roughness ≥ 0.6); plastic has a slight sheen (§6 Materials).
import * as THREE from 'three'

export const PALETTE = {
  cream: '#efe4cc',
  creamLight: '#f6eedc',
  honey: '#d9a35b',
  birch: '#e8d2a8',
  walnut: '#9a6c48',
  sage: '#9fb38f',
  sageDeep: '#6f8a62',
  dusty: '#7f9bb8',
  dustyDeep: '#5d7895',
  terracotta: '#c4704f',
  mustard: '#d8b25a',
  charcoal: '#4a4340',
  slate: '#6f7883',
} as const

/** Small deterministic PRNG so textures look the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function toTexture(c: HTMLCanvasElement, repeat = 1) {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 4
  return tex
}

/** Long-grain wood: wavy darker grain lines along X over a base colour, with soft blotches. */
export function makeWoodTexture(seed: number, base: string, grain: string, size = 512) {
  const c = canvas(size)
  const g = c.getContext('2d')!
  const rand = rng(seed)
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  // Broad tone variation.
  for (let i = 0; i < 18; i++) {
    const grad = g.createRadialGradient(rand() * size, rand() * size, 0, rand() * size, rand() * size, size * 0.5)
    grad.addColorStop(0, `rgba(255,240,215,${0.05 + rand() * 0.06})`)
    grad.addColorStop(1, 'rgba(255,240,215,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  }
  // Grain lines.
  g.strokeStyle = grain
  for (let i = 0; i < 70; i++) {
    const y0 = rand() * size
    const amp = 2 + rand() * 7
    const freq = 0.004 + rand() * 0.01
    const phase = rand() * Math.PI * 2
    g.globalAlpha = 0.08 + rand() * 0.22
    g.lineWidth = 0.6 + rand() * 2.2
    g.beginPath()
    for (let x = -4; x <= size + 4; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.25
      if (x < 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
  // A few small knots.
  for (let i = 0; i < 2; i++) {
    const x = rand() * size
    const y = rand() * size
    for (let r = 10; r > 1; r -= 2.5) {
      g.globalAlpha = 0.12
      g.lineWidth = 1.2
      g.beginPath()
      g.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2)
      g.stroke()
    }
  }
  g.globalAlpha = 1
  return c
}

const cache = new Map<string, THREE.Material>()
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key)
  if (!m) {
    m = make()
    cache.set(key, m)
  }
  return m as T
}

function woodMaterial(key: string, seed: number, base: string, grain: string, roughness = 0.72) {
  return cached(`wood:${key}`, () => {
    const map = toTexture(makeWoodTexture(seed, base, grain), 1)
    return new THREE.MeshStandardMaterial({ map, roughness, metalness: 0 })
  })
}

export const materials = {
  birch: () => woodMaterial('birch', 11, '#e6cfa2', '#a77e50'),
  honey: () => woodMaterial('honey', 23, '#d6a05c', '#8d5b2c'),
  walnut: () => woodMaterial('walnut', 37, '#9a6c48', '#563621', 0.75),
  /** Matte painted wood, grain faintly visible through the paint. */
  paint: (hex: string) =>
    cached(`paint:${hex}`, () => {
      const c = makeWoodTexture(hex.length * 7 + parseInt(hex.slice(1), 16) % 997, '#ffffff', '#c9c0b4', 256)
      const map = toTexture(c, 1)
      return new THREE.MeshStandardMaterial({ color: hex, map, roughness: 0.82, metalness: 0 })
    }),
  plastic: (hex: string) =>
    cached(`plastic:${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.38, metalness: 0 })),
  felt: (hex: string) =>
    cached(`felt:${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 1, metalness: 0 })),
  groove: () =>
    cached('groove', () => new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.9, metalness: 0 })),
  /** Blocks: cream faces with a painted letter. */
  letterBlock: (letter: string, ink: string) =>
    cached(`block:${letter}`, () => {
      const c = canvas(128)
      const g = c.getContext('2d')!
      g.fillStyle = '#efe2c6'
      g.fillRect(0, 0, 128, 128)
      g.strokeStyle = ink
      g.lineWidth = 8
      g.strokeRect(10, 10, 108, 108)
      g.fillStyle = ink
      g.font = '900 80px Nunito, ui-rounded, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(letter, 64, 70)
      return new THREE.MeshStandardMaterial({ map: toTexture(c), roughness: 0.8, metalness: 0 })
    }),
}

/** Floorboards and tabletop textures for the settings. */
export function makePlankTexture(seed: number, base: string, grain: string, planks: number, repeat: number) {
  const size = 1024
  const c = canvas(size)
  const g = c.getContext('2d')!
  const wood = makeWoodTexture(seed, base, grain, 512)
  const rand = rng(seed + 1)
  const h = size / planks
  for (let i = 0; i < planks; i++) {
    const offset = rand() * size
    g.save()
    g.beginPath()
    g.rect(0, i * h, size, h)
    g.clip()
    g.filter = `brightness(${0.9 + rand() * 0.18}) saturate(${0.9 + rand() * 0.2})`
    for (let x = -offset; x < size; x += 512) {
      g.drawImage(wood, x, i * h, 512, h * 1.0)
    }
    g.restore()
    g.fillStyle = 'rgba(70,45,25,0.35)'
    g.fillRect(0, i * h, size, 2)
    // Butt joints at staggered positions.
    const joint = rand() * size
    g.fillRect(joint, i * h, 2, h)
  }
  return toTexture(c, repeat)
}
