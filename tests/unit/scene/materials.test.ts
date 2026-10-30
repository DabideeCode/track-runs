/**
 * Unit tests for `src/scene/models/materials.ts` and the procedural texture
 * generators it uses. Runs in Node: DataTexture and MeshStandardMaterial need
 * no WebGL context.
 *
 * Requirements: 29.1, 29.2, 29.3, 29.5, 30.3, 32.5, 34.7
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { MeshStandardMaterial } from 'three';
import { checkPaletteRule } from '@/domain/color';
import { TOKENS } from '@/theme/palette';
import {
  GHOST_OPACITY,
  MAX_TEXTURE_SIZE,
  MaterialLibrary,
  ROUGHNESS,
  TEXTURE_SIZES,
  disposeMaterialLibraries,
  getMaterialLibrary,
  type MaterialColourName,
  type ProceduralTextureKind,
} from '@/scene/models/materials';
import {
  LETTER_INK,
  letterData,
  proceduralTextureData,
  woodGrainData,
} from '@/scene/models/proceduralTextures';

const KINDS: ProceduralTextureKind[] = ['woodGrain', 'floorboards', 'felt', 'tabletop'];
const MATERIAL_TINTS = (Object.keys(TOKENS) as Array<keyof typeof TOKENS>).filter(
  (name): name is MaterialColourName => TOKENS[name].use === 'material',
);
const MATERIAL_HEXES = new Set(MATERIAL_TINTS.map((name) => TOKENS[name].hex.toLowerCase()));

/** Every kind of material the library can make, by family. */
function allMaterials(lib: MaterialLibrary) {
  const wood = MATERIAL_TINTS.map((t) => lib.wood(t));
  const paint = [
    ...MATERIAL_TINTS.map((t) => lib.paint(t)),
    ...(['A', 'B', 'C'] as const).map((l) => lib.letterBlock(l, 'mustard')),
  ];
  const plastic = MATERIAL_TINTS.map((t) => lib.plastic(t));
  const other = [lib.felt(), lib.felt('dustyBlue'), lib.floorboards(), lib.tabletop()];
  const ghosts = [lib.ghost(true), lib.ghost(false)];
  const fades = [lib.fade(lib.wood('honey'))];
  return { wood, paint, plastic, other, ghosts, fades, all: [...wood, ...paint, ...plastic, ...other, ...ghosts, ...fades] };
}

function luminanceStdDev(data: Uint8Array): number {
  let sum = 0;
  let sumSq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i];
    sumSq += data[i] * data[i];
  }
  const mean = sum / n;
  return Math.sqrt(sumSq / n - mean * mean);
}

afterEach(() => disposeMaterialLibraries());

describe('material colours', () => {
  it('uses a material colour token from theme/palette.ts as every base colour', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    for (const material of allMaterials(lib).all) {
      const hex = `#${material.color.getHexString()}`;
      expect(MATERIAL_HEXES, `${material.name} uses ${hex}`).toContain(hex);
      const accent = hex === TOKENS.ghostValid.hex || hex === TOKENS.ghostInvalid.hex;
      expect(checkPaletteRule(hex, { accent }).ok).toBe(true);
    }
    lib.dispose();
  });

  it('rejects names that are not material tokens', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    expect(() => lib.paint('ink' as MaterialColourName)).toThrow();
    expect(() => lib.wood('notAColour' as MaterialColourName)).toThrow();
  });

  it('tints ghosts green and red at the shared ghost opacity', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    expect(`#${lib.ghost(true).color.getHexString()}`).toBe(TOKENS.ghostValid.hex);
    expect(`#${lib.ghost(false).color.getHexString()}`).toBe(TOKENS.ghostInvalid.hex);
    for (const ghost of [lib.ghost(true), lib.ghost(false)]) {
      expect(ghost.transparent).toBe(true);
      expect(ghost.opacity).toBe(GHOST_OPACITY);
    }
  });
});

describe('matte finish', () => {
  it('keeps wood and paint at roughness >= 0.6, plastic in [0.3, 0.6], metalness 0 and no envMap', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    const { wood, paint, plastic, all } = allMaterials(lib);
    for (const m of [...wood, ...paint]) expect(m.roughness).toBeGreaterThanOrEqual(0.6);
    for (const m of plastic) {
      expect(m.roughness).toBeGreaterThanOrEqual(0.3);
      expect(m.roughness).toBeLessThanOrEqual(0.6);
    }
    for (const m of all) {
      expect(m.roughness).toBeGreaterThanOrEqual(0.3);
      expect(m.metalness).toBeLessThanOrEqual(0.1);
      expect(m.envMap).toBeNull();
    }
    expect(ROUGHNESS.plastic).toBeLessThan(ROUGHNESS.paint);
  });

  it('gives wood a grain map and leaves paint and plastic flat', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    expect(lib.wood('oak').map).toBe(lib.texture('woodGrain'));
    expect(lib.paint('sage').map).toBeNull();
    expect(lib.plastic('plasticDark').map).toBeNull();
  });
});

describe('caching', () => {
  it('returns the same material and texture instances on repeated calls', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    expect(lib.wood('birch')).toBe(lib.wood('birch'));
    expect(lib.paint('terracotta')).toBe(lib.paint('terracotta'));
    expect(lib.plastic('plasticDark')).toBe(lib.plastic('plasticDark'));
    expect(lib.felt()).toBe(lib.felt('felt'));
    expect(lib.ghost(true)).toBe(lib.ghost(true));
    expect(lib.letterBlock('A', 'mustard')).toBe(lib.letterBlock('A', 'mustard'));
    expect(lib.fade(lib.wood('oak'))).toBe(lib.fade(lib.wood('oak')));
    expect(lib.wood('birch')).not.toBe(lib.wood('oak'));
    expect(lib.wood('oak')).not.toBe(lib.paint('oak'));
    // All wood tints share one grain texture.
    expect(lib.wood('birch').map).toBe(lib.wood('oak').map);
  });

  it('creates nothing new when the same materials are requested again', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    allMaterials(lib);
    const before = lib.stats();
    allMaterials(lib);
    expect(lib.stats()).toEqual(before);
  });

  it('shares one library per quality level', () => {
    expect(getMaterialLibrary(false)).toBe(getMaterialLibrary(false));
    expect(getMaterialLibrary(true)).toBe(getMaterialLibrary(true));
    expect(getMaterialLibrary(true)).not.toBe(getMaterialLibrary(false));
    expect(getMaterialLibrary(true).lowQuality).toBe(true);
  });

  it('fade copies keep the base colour and textures but are transparent', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    const base = lib.wood('honey');
    const fade = lib.fade(base);
    expect(fade).not.toBe(base);
    expect(fade.color.equals(base.color)).toBe(true);
    expect(fade.map).toBe(base.map);
    expect(fade.transparent).toBe(true);
    expect(base.transparent).toBe(false);
  });
});

describe('textures', () => {
  it('stays within 1024 x 1024 and is square at both quality levels', () => {
    for (const lowQuality of [false, true]) {
      const lib = new MaterialLibrary({ lowQuality });
      for (const texture of [...KINDS.map((k) => lib.texture(k)), lib.letterTexture('B')]) {
        const { width, height, data } = texture.image as { width: number; height: number; data: Uint8Array };
        expect(width).toBeLessThanOrEqual(MAX_TEXTURE_SIZE);
        expect(height).toBe(width);
        expect(data.length).toBe(width * height * 4);
      }
      lib.dispose();
    }
  });

  it('uses smaller textures in low quality', () => {
    const high = new MaterialLibrary({ lowQuality: false });
    const low = new MaterialLibrary({ lowQuality: true });
    for (const kind of KINDS) {
      const hi = high.texture(kind).image as { width: number };
      const lo = low.texture(kind).image as { width: number };
      expect(lo.width).toBeLessThan(hi.width);
      expect(hi.width).toBe(TEXTURE_SIZES[kind].high);
    }
    expect((low.letterTexture('A').image as { width: number }).width).toBeLessThan(
      (high.letterTexture('A').image as { width: number }).width,
    );
    expect(low.texture('woodGrain').anisotropy).toBeLessThanOrEqual(high.texture('woodGrain').anisotropy);
    high.dispose();
    low.dispose();
  });

  it('is deterministic: the same kind and size always gives the same bytes', () => {
    for (const kind of KINDS) {
      const a = proceduralTextureData(kind, 64);
      const b = proceduralTextureData(kind, 64);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    }
    const libA = new MaterialLibrary({ lowQuality: true });
    const libB = new MaterialLibrary({ lowQuality: true });
    const imgA = libA.texture('woodGrain').image as { data: Uint8Array };
    const imgB = libB.texture('woodGrain').image as { data: Uint8Array };
    expect(Buffer.from(imgA.data).equals(Buffer.from(imgB.data))).toBe(true);
    // A different seed gives a different pattern.
    expect(Buffer.from(woodGrainData(64, 1).data).equals(Buffer.from(woodGrainData(64, 2).data))).toBe(false);
  });

  it('wood grain is visible: streaks in a darker tone, not a flat colour', () => {
    const { data } = woodGrainData(TEXTURE_SIZES.woodGrain.high);
    expect(luminanceStdDev(data)).toBeGreaterThan(8);
    let min = 255;
    let max = 0;
    let greyOpaque = true;
    for (let i = 0; i < data.length; i += 4) {
      min = Math.min(min, data[i]);
      max = Math.max(max, data[i]);
      greyOpaque &&= data[i] === data[i + 1] && data[i] === data[i + 2] && data[i + 3] === 255;
    }
    expect(greyOpaque).toBe(true);
    expect(max - min).toBeGreaterThan(40);
  });

  it('draws each letter with a distinct pattern of ink on a light background', () => {
    const faces = (['A', 'B', 'C'] as const).map((l) => letterData(l, 64).data);
    const ink = Math.round(LETTER_INK * 255);
    for (const face of faces) {
      expect(face).toContain(ink);
      expect(face[0]).toBe(255); // corner is background
    }
    expect(Buffer.from(faces[0]).equals(Buffer.from(faces[1]))).toBe(false);
    expect(Buffer.from(faces[1]).equals(Buffer.from(faces[2]))).toBe(false);
  });
});

describe('dispose', () => {
  it('disposes every cached material and texture and empties the caches', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    const { all } = allMaterials(lib);
    const textures = [...KINDS.map((k) => lib.texture(k)), lib.letterTexture('A')];
    const disposed = new Set<object>();
    for (const obj of [...all, ...textures]) {
      obj.addEventListener('dispose', () => disposed.add(obj));
    }
    lib.dispose();
    for (const obj of [...all, ...textures]) expect(disposed.has(obj)).toBe(true);
    expect(lib.stats()).toEqual({ materials: 0, textures: 0 });
    // The library stays usable and builds fresh objects afterwards.
    const again: MeshStandardMaterial = lib.wood('honey');
    expect(all).not.toContain(again);
    expect(again.map).not.toBe(textures[0]);
  });

  it('disposeMaterialLibraries releases the shared instances', () => {
    const high = getMaterialLibrary(false);
    const low = getMaterialLibrary(true);
    const material = high.wood('oak');
    let disposed = false;
    material.addEventListener('dispose', () => {
      disposed = true;
    });
    disposeMaterialLibraries(false);
    expect(disposed).toBe(true);
    expect(getMaterialLibrary(false)).not.toBe(high);
    expect(getMaterialLibrary(true)).toBe(low);
  });
});
