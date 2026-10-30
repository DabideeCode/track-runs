import { MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { createBlobTexture, createGrainTexture } from './woodTexture';

export type MaterialFamily = 'wood' | 'paint' | 'plastic';

export const COLORS = {
  honey: '#d3a66e',
  honeyDeep: '#a87a48',
  birch: '#ead2a8',
  walnut: '#8c6240',
  groove: '#7d5a3b',
  cream: '#efe3cd',
  sage: '#8fa98a',
  sageDeep: '#6c8a6a',
  dusty: '#7f9db4',
  dustyDeep: '#5f7f96',
  terracotta: '#c0735a',
  mustard: '#d4ad5a',
  charcoal: '#4d443b',
  tyre: '#3f3832',
};

let family: Record<MaterialFamily, MeshStandardMaterial> | null = null;

// Shared by every piece, so repeated items reuse one material each.
export function familyMaterials() {
  if (!family) {
    family = {
      wood: new MeshStandardMaterial({
        map: createGrainTexture(),
        vertexColors: true,
        roughness: 0.72,
        metalness: 0,
      }),
      paint: new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }),
      plastic: new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 }),
    };
  }
  return family;
}

let blob: MeshBasicMaterial | null = null;

export function blobMaterial() {
  blob ??= new MeshBasicMaterial({
    map: createBlobTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return blob;
}
