/**
 * Procedural texture data for the scene materials (Requirements 29.5, 34.7,
 * 34.8, design.md section 7.2).
 *
 * Pure functions with no Three.js or DOM imports, so they run unchanged in
 * Node tests. Every generator is seeded and deterministic: the same kind, size
 * and seed always produce the same bytes. Output is square RGBA8 greyscale
 * data (R = G = B, A = 255) that `materials.ts` wraps in a `DataTexture` and
 * uses as a `map`. Because the map multiplies the material colour, the base
 * colour of every material stays a palette token and the texture only adds
 * darker tones of that colour (grain streaks, rings, board seams, felt fibres).
 *
 * Row 0 of the data is v = 0, the bottom of a face in Three.js UV space
 * (DataTexture does not flip rows).
 */

/** Small, fast, seeded PRNG (mulberry32). Returns values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D value noise sampled in lattice units, in [0, 1]. */
export type Noise2D = (x: number, y: number) => number;

/**
 * Value noise on a `periodX` × `periodY` lattice that wraps, so sampling
 * x in [0, periodX) and y in [0, periodY) gives a seamlessly tiling pattern.
 */
export function createPeriodicNoise(seed: number, periodX: number, periodY: number): Noise2D {
  const px = Math.max(1, Math.floor(periodX));
  const py = Math.max(1, Math.floor(periodY));
  const rand = mulberry32(seed);
  const lattice = new Float32Array(px * py);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const at = (ix: number, iy: number) =>
    lattice[(((iy % py) + py) % py) * px + (((ix % px) + px) % px)];
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx;
    const bottom = c + (d - c) * sx;
    return top + (bottom - top) * sy;
  };
}

/**
 * Tiling fractal noise over u, v in [0, 1): octave k uses a lattice of
 * (baseX × 2^k) × (baseY × 2^k) cells. Result in [0, 1].
 */
export function createPeriodicFbm(
  seed: number,
  baseX: number,
  baseY: number,
  octaves: number,
): (u: number, v: number) => number {
  const layers: Array<{ noise: Noise2D; fx: number; fy: number; amp: number }> = [];
  let amp = 1;
  let total = 0;
  for (let k = 0; k < octaves; k++) {
    const fx = baseX * 2 ** k;
    const fy = baseY * 2 ** k;
    layers.push({ noise: createPeriodicNoise(seed + 977 * (k + 1), fx, fy), fx, fy, amp });
    total += amp;
    amp *= 0.5;
  }
  return (u, v) => {
    let sum = 0;
    for (const layer of layers) sum += layer.noise(u * layer.fx, v * layer.fy) * layer.amp;
    return sum / total;
  };
}

/** Square greyscale RGBA8 texture data. */
export interface TextureData {
  readonly size: number;
  /** `size × size × 4` bytes, rows from v = 0 upward. */
  readonly data: Uint8Array;
}

export type ProceduralTextureKind = 'woodGrain' | 'floorboards' | 'felt' | 'tabletop';
export type BlockLetter = 'A' | 'B' | 'C';

/** Fixed seeds, so textures are identical on every load. */
export const TEXTURE_SEEDS: Readonly<Record<ProceduralTextureKind, number>> = {
  woodGrain: 0x5eed_0001,
  floorboards: 0x5eed_0002,
  felt: 0x5eed_0003,
  tabletop: 0x5eed_0004,
};

function fill(size: number, lum: (u: number, v: number, i: number, j: number) => number): TextureData {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    const v = j / size;
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const l = Math.min(1, Math.max(0, lum(u, v, i, j)));
      const byte = Math.round(l * 255);
      const o = (j * size + i) * 4;
      data[o] = byte;
      data[o + 1] = byte;
      data[o + 2] = byte;
      data[o + 3] = 255;
    }
  }
  return { size, data };
}

/**
 * Builds a wood-grain luminance function over u, v in [0, 1). Grain runs along
 * v; `rings` growth rings cross u, warped by low-frequency noise, plus long
 * thin fibre streaks. `contrast` scales how dark the rings and streaks get.
 */
function grainField(seed: number, rings: number, contrast: number) {
  const warp = createPeriodicFbm(seed, 3, 2, 3);
  const fibre = createPeriodicNoise(seed + 31, 96, 4);
  const blotch = createPeriodicFbm(seed + 67, 2, 2, 2);
  return (u: number, v: number) => {
    const ring = u * rings + (warp(u, v) - 0.5) * 2.2;
    const band = (0.5 + 0.5 * Math.cos(2 * Math.PI * ring)) ** 5;
    const streak = fibre(u * 96, v * 4);
    const tone = blotch(u, v) - 0.5;
    return 1 - contrast * (0.24 * band + 0.1 * streak) + 0.05 * tone;
  };
}

/** Wood grain for every wooden part of pieces, the train and props. */
export function woodGrainData(size: number, seed = TEXTURE_SEEDS.woodGrain): TextureData {
  const grain = grainField(seed, 7, 1);
  return fill(size, (u, v) => grain(u, v));
}

/** Light, low-contrast grain for the kitchen tabletop. */
export function tabletopData(size: number, seed = TEXTURE_SEEDS.tabletop): TextureData {
  const grain = grainField(seed, 5, 0.55);
  return fill(size, (u, v) => grain(u, v) + 0.02);
}

/** Fine fibre noise for the felt rug. */
export function feltData(size: number, seed = TEXTURE_SEEDS.felt): TextureData {
  const coarse = createPeriodicFbm(seed, 8, 8, 2);
  const fine = createPeriodicNoise(seed + 13, 128, 128);
  return fill(size, (u, v) => 0.86 + 0.08 * coarse(u, v) + 0.06 * fine(u * 128, v * 128));
}

/** Floorboards: 8 planks across u, each split into 2 staggered boards along v. */
export const FLOORBOARD_PLANKS = 8;

export function floorboardsData(size: number, seed = TEXTURE_SEEDS.floorboards): TextureData {
  const rand = mulberry32(seed);
  const boards = Array.from({ length: FLOORBOARD_PLANKS }, () => ({
    joint: rand(),
    shades: [0.9 + 0.1 * rand(), 0.9 + 0.1 * rand()],
    offsets: [rand(), rand()],
  }));
  const grain = grainField(seed + 101, 3, 0.85);
  const seam = Math.max(1, Math.round(size / 512)) / size;
  return fill(size, (u, v) => {
    const pu = u * FLOORBOARD_PLANKS;
    const plank = Math.min(FLOORBOARD_PLANKS - 1, Math.floor(pu));
    const local = pu - plank;
    const board = boards[plank];
    const along = (v - board.joint + 1) % 1; // 0 at the joint
    const segment = along < 0.5 ? 0 : 1;
    const g = grain((local + board.offsets[segment]) % 1, (v + board.offsets[segment] * 0.5) % 1);
    let lum = g * board.shades[segment];
    const plankEdge = Math.min(local, 1 - local) / FLOORBOARD_PLANKS;
    const jointEdge = Math.min(along % 0.5, 0.5 - (along % 0.5));
    if (plankEdge < seam || jointEdge < seam) lum *= 0.55;
    return lum;
  });
}

/** 5 × 7 bitmap glyphs, top row first. */
const GLYPHS: Readonly<Record<BlockLetter, readonly string[]>> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
};

/** Luminance of the letter strokes; the background is 1. */
export const LETTER_INK = 0.32;

/**
 * A letter block face: a light background with the letter drawn upright in a
 * darker tone of the block colour, centred and filling about 62% of the face.
 */
export function letterData(letter: BlockLetter, size: number): TextureData {
  const glyph = GLYPHS[letter];
  const height = size * 0.62;
  const cell = height / 7;
  const width = cell * 5;
  const left = (size - width) / 2;
  const bottom = (size - height) / 2;
  return fill(size, (_u, _v, i, j) => {
    const x = (i + 0.5 - left) / cell;
    const y = (j + 0.5 - bottom) / cell;
    if (x < 0 || x >= 5 || y < 0 || y >= 7) return 1;
    const row = 6 - Math.floor(y); // row 0 of the glyph is the top of the face
    return glyph[row][Math.floor(x)] === '1' ? LETTER_INK : 1;
  });
}

/** Generates the data for one procedural texture kind. */
export function proceduralTextureData(kind: ProceduralTextureKind, size: number): TextureData {
  switch (kind) {
    case 'woodGrain':
      return woodGrainData(size);
    case 'floorboards':
      return floorboardsData(size);
    case 'felt':
      return feltData(size);
    case 'tabletop':
      return tabletopData(size);
  }
}
