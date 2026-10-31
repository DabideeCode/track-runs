import {
  CanvasTexture,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';

export type MaterialKey =
  | 'wood'
  | 'woodDark'
  | 'paintTerracotta'
  | 'paintSage'
  | 'paintSageDeep'
  | 'paintDusty'
  | 'paintCream'
  | 'paintHoney'
  | 'felt'
  | 'plastic'
  | 'plasticCream'
  | 'blockA'
  | 'blockB'
  | 'blockC';

const WOOD_ROUGHNESS = 0.72;
const PAINT_ROUGHNESS = 0.85;
const PLASTIC_ROUGHNESS = 0.42;

const textures = new Map<string, Texture>();

export function loadTexture(name: string, repeat = 1): Texture {
  const key = `${name}:${repeat}`;
  const cached = textures.get(key);
  if (cached) return cached;
  const texture = new TextureLoader().load(`${import.meta.env.BASE_URL}assets/textures/${name}`);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  textures.set(key, texture);
  return texture;
}

function letterTexture(letter: string, background: string, ink: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = background;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = ink;
  context.lineWidth = 6;
  context.strokeRect(12, 12, 104, 104);
  context.fillStyle = ink;
  context.font = '600 76px ui-rounded, "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(letter, 64, 70);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const wood = (color: string) =>
  new MeshStandardMaterial({ color, map: loadTexture('wood-honey.jpg'), roughness: WOOD_ROUGHNESS, metalness: 0 });
const paint = (color: string) =>
  new MeshStandardMaterial({ color, map: loadTexture('wood-grain-light.jpg'), roughness: PAINT_ROUGHNESS, metalness: 0 });
const plastic = (color: string) => new MeshStandardMaterial({ color, roughness: PLASTIC_ROUGHNESS, metalness: 0 });
const block = (letter: string, background: string, ink: string) =>
  new MeshStandardMaterial({ map: letterTexture(letter, background, ink), roughness: PAINT_ROUGHNESS, metalness: 0 });

const FACTORIES: Record<MaterialKey, () => MeshStandardMaterial> = {
  wood: () => wood('#fff0d8'),
  woodDark: () => wood('#c79a6c'),
  paintTerracotta: () => paint('#cf8467'),
  paintSage: () => paint('#9fb896'),
  paintSageDeep: () => paint('#7f9d83'),
  paintDusty: () => paint('#8aa7bf'),
  paintCream: () => paint('#f3e8d2'),
  paintHoney: () => paint('#deb26a'),
  felt: () =>
    new MeshStandardMaterial({
      color: '#a8bb97',
      map: loadTexture('fabric.jpg', 4),
      roughness: 0.96,
      metalness: 0,
    }),
  plastic: () => plastic('#5b4b3e'),
  plasticCream: () => plastic('#efe2c8'),
  blockA: () => block('A', '#e9b9a1', '#8a4530'),
  blockB: () => block('B', '#c6d6e3', '#3f5c72'),
  blockC: () => block('C', '#cbdcc4', '#476041'),
};

const materials = new Map<MaterialKey, MeshStandardMaterial>();

/** One shared instance of each material, as Section 7.3 asks of repeated meshes. */
export function getMaterial(key: MaterialKey): MeshStandardMaterial {
  let material = materials.get(key);
  if (!material) {
    material = FACTORIES[key]();
    materials.set(key, material);
  }
  return material;
}

const ghost = (color: string) =>
  new MeshStandardMaterial({ color, transparent: true, opacity: 0.6, roughness: 0.8, metalness: 0 });

export const ghostValid = ghost('#7fb26f');
export const ghostInvalid = ghost('#cf6448');

function softShadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 6, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(70,52,38,0.55)');
  gradient.addColorStop(0.55, 'rgba(70,52,38,0.26)');
  gradient.addColorStop(1, 'rgba(70,52,38,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

let contactShadow: MeshBasicMaterial | null = null;

export function getContactShadowMaterial(): MeshBasicMaterial {
  contactShadow ??= new MeshBasicMaterial({
    map: softShadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  return contactShadow;
}
