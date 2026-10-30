/**
 * Shared scene materials and procedural textures (Requirements 29.1, 29.2,
 * 29.3, 29.5, 30.1, 30.3, 32.5, 34.8; design.md DD-4 and section 7.2).
 *
 * - Every base colour comes from a `material` token in `src/theme/palette.ts`;
 *   tint arguments are token names, never free hex strings.
 * - Textures are seeded, generated once in JS (`proceduralTextures.ts`) and
 *   wrapped in `DataTexture`, so they need no canvas and run in Node tests.
 *   They are greyscale and multiply the token colour, adding grain, rings,
 *   seams and fibres in darker tones of the same colour (Requirement 29.5).
 * - All materials are `MeshStandardMaterial` with metalness 0 and no
 *   environment map, so nothing is mirrored (Requirement 29.1). Wood and paint
 *   use roughness of at least 0.6, plastic 0.42 (Requirements 29.2, 29.3).
 * - Materials and textures are cached by key, so every piece of a type shares
 *   the same objects (Requirement 32.5). `dispose()` frees them all.
 * - Low quality halves every texture edge and uses anisotropy 1. No normal or
 *   bump maps are used at either quality level. Every texture is at most
 *   1024 × 1024 (Requirement 34.7).
 *
 * Textures use `RepeatWrapping` (letters use clamping); geometry UVs decide
 * how often a texture repeats on a surface.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
  type Wrapping,
} from 'three';
import { TOKENS, type ColourName } from '@/theme/palette';
import {
  letterData,
  proceduralTextureData,
  type BlockLetter,
  type ProceduralTextureKind,
  type TextureData,
} from './proceduralTextures';

export type { BlockLetter, ProceduralTextureKind } from './proceduralTextures';

/** Palette tokens meant for scene materials. */
export type MaterialColourName = {
  [K in ColourName]: (typeof TOKENS)[K]['use'] extends 'material' ? K : never;
}[ColourName];

/** Largest texture edge allowed (Requirement 34.7). */
export const MAX_TEXTURE_SIZE = 1024;

/** Texture edge length in pixels per kind and quality level. */
export const TEXTURE_SIZES: Readonly<
  Record<ProceduralTextureKind | 'letter', { readonly high: number; readonly low: number }>
> = {
  woodGrain: { high: 512, low: 256 },
  floorboards: { high: 1024, low: 512 },
  felt: { high: 512, low: 256 },
  tabletop: { high: 512, low: 256 },
  letter: { high: 128, low: 64 },
};

/** Roughness per material family. Metalness is always 0. */
export const ROUGHNESS = {
  wood: 0.72,
  paint: 0.65,
  plastic: 0.42,
  felt: 0.95,
  floorboards: 0.78,
  tabletop: 0.7,
  ghost: 0.7,
} as const;

export const METALNESS = 0;

/** Opacity of the palette ghost and dragged-piece tint (design.md 7.4). */
export const GHOST_OPACITY = 0.55;

const ANISOTROPY = { high: 4, low: 1 } as const;

export interface MaterialLibraryOptions {
  readonly lowQuality: boolean;
}

function assertMaterialToken(name: string): asserts name is MaterialColourName {
  const token = (TOKENS as Record<string, { use: string } | undefined>)[name];
  if (!token || token.use !== 'material') {
    throw new Error(`"${name}" is not a material colour token in theme/palette.ts`);
  }
}

/**
 * Owns one set of cached textures and materials for one quality level.
 * Use `getMaterialLibrary(lowQuality)` for the shared app-wide instances.
 */
export class MaterialLibrary {
  readonly lowQuality: boolean;
  private readonly textures = new Map<string, DataTexture>();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly fades = new Map<string, MeshStandardMaterial>();

  constructor(options: MaterialLibraryOptions) {
    this.lowQuality = options.lowQuality;
  }

  private get quality(): 'high' | 'low' {
    return this.lowQuality ? 'low' : 'high';
  }

  /** Edge length used for a texture kind at this library's quality level. */
  textureSize(kind: ProceduralTextureKind | 'letter'): number {
    return TEXTURE_SIZES[kind][this.quality];
  }

  private makeTexture(name: string, source: TextureData, wrap: Wrapping): DataTexture {
    const texture = new DataTexture(
      source.data,
      source.size,
      source.size,
      RGBAFormat,
      UnsignedByteType,
    );
    texture.name = name;
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = wrap;
    texture.wrapT = wrap;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = ANISOTROPY[this.quality];
    texture.needsUpdate = true;
    return texture;
  }

  /** Cached procedural texture of the given kind. */
  texture(kind: ProceduralTextureKind): DataTexture {
    const key = `texture:${kind}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = this.makeTexture(key, proceduralTextureData(kind, this.textureSize(kind)), RepeatWrapping);
      this.textures.set(key, texture);
    }
    return texture;
  }

  /** Cached letter face texture for the lettered blocks. */
  letterTexture(letter: BlockLetter): DataTexture {
    const key = `texture:letter:${letter}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = this.makeTexture(key, letterData(letter, this.textureSize('letter')), ClampToEdgeWrapping);
      this.textures.set(key, texture);
    }
    return texture;
  }

  private material(
    key: string,
    tint: MaterialColourName,
    roughness: number,
    map: DataTexture | null,
  ): MeshStandardMaterial {
    let material = this.materials.get(key);
    if (!material) {
      assertMaterialToken(tint);
      material = new MeshStandardMaterial({
        color: TOKENS[tint].hex,
        roughness,
        metalness: METALNESS,
        map,
        envMap: null,
      });
      material.name = key;
      this.materials.set(key, material);
    }
    return material;
  }

  /** Bare or varnished wood with visible grain (Requirements 29.1, 29.5). */
  wood(tint: MaterialColourName): MeshStandardMaterial {
    return this.material(`wood:${tint}`, tint, ROUGHNESS.wood, this.texture('woodGrain'));
  }

  /** Matte painted surface (Requirement 29.2). */
  paint(tint: MaterialColourName): MeshStandardMaterial {
    return this.material(`paint:${tint}`, tint, ROUGHNESS.paint, null);
  }

  /** Soft plastic with a slight sheen, e.g. wheels (Requirement 29.3). */
  plastic(tint: MaterialColourName): MeshStandardMaterial {
    return this.material(`plastic:${tint}`, tint, ROUGHNESS.plastic, null);
  }

  /** Felt, e.g. the bedroom rug in `dustyBlue`. */
  felt(tint: MaterialColourName = 'felt'): MeshStandardMaterial {
    return this.material(`felt:${tint}`, tint, ROUGHNESS.felt, this.texture('felt'));
  }

  /** Bedroom floorboards. */
  floorboards(): MeshStandardMaterial {
    return this.material('floorboards:floorboard', 'floorboard', ROUGHNESS.floorboards, this.texture('floorboards'));
  }

  /** Kitchen tabletop. */
  tabletop(): MeshStandardMaterial {
    return this.material('tabletop:tabletop', 'tabletop', ROUGHNESS.tabletop, this.texture('tabletop'));
  }

  /** Painted letter block face: the letter is a darker tone of `tint`. */
  letterBlock(letter: BlockLetter, tint: MaterialColourName): MeshStandardMaterial {
    return this.material(`letter:${letter}:${tint}`, tint, ROUGHNESS.paint, this.letterTexture(letter));
  }

  /** Translucent ghost tint: green when the drop is valid, red otherwise (Requirements 11.5, 11.6). */
  ghost(valid: boolean): MeshStandardMaterial {
    const key = valid ? 'ghost:valid' : 'ghost:invalid';
    let material = this.materials.get(key);
    if (!material) {
      material = this.material(key, valid ? 'ghostValid' : 'ghostInvalid', ROUGHNESS.ghost, null);
      material.transparent = true;
      material.opacity = GHOST_OPACITY;
      material.depthWrite = false;
    }
    return material;
  }

  /**
   * Transparent copy of `base` for the delete fade (design.md section 8).
   * Shares the base's textures; cached per base material, starting at opacity 1.
   */
  fade(base: MeshStandardMaterial): MeshStandardMaterial {
    let material = this.fades.get(base.uuid);
    if (!material) {
      material = base.clone();
      material.name = `fade:${base.name}`;
      material.transparent = true;
      material.opacity = 1;
      material.depthWrite = false;
      this.fades.set(base.uuid, material);
    }
    return material;
  }

  /** Number of cached objects, for tests and debugging. */
  stats(): { materials: number; textures: number } {
    return { materials: this.materials.size + this.fades.size, textures: this.textures.size };
  }

  /** Disposes every cached material and texture and empties the caches. */
  dispose(): void {
    for (const material of this.fades.values()) material.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.fades.clear();
    this.materials.clear();
    this.textures.clear();
  }
}

const shared: { high: MaterialLibrary | null; low: MaterialLibrary | null } = { high: null, low: null };

/** The app-wide library for a quality level, created on first use. */
export function getMaterialLibrary(lowQuality: boolean): MaterialLibrary {
  const slot = lowQuality ? 'low' : 'high';
  return (shared[slot] ??= new MaterialLibrary({ lowQuality }));
}

/**
 * Disposes the app-wide libraries. Pass a quality level to dispose only that
 * one (for example the level just switched away from); omit it to dispose both.
 */
export function disposeMaterialLibraries(lowQuality?: boolean): void {
  const slots: Array<'high' | 'low'> =
    lowQuality === undefined ? ['high', 'low'] : [lowQuality ? 'low' : 'high'];
  for (const slot of slots) {
    shared[slot]?.dispose();
    shared[slot] = null;
  }
}
