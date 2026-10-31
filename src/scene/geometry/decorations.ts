import { CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry, type BufferGeometry } from 'three';
import type { DecorationType } from '@/domain/types';
import { box, cone, cylinder, merge, sphere, type PieceParts } from './parts';

function gabledRoof(): BufferGeometry {
  const halfWidth = 0.38;
  const height = 0.36;
  const shape = new Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(0, height);
  shape.lineTo(-halfWidth, 0);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.68,
    bevelEnabled: true,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    bevelSegments: 2,
  });
  geometry.translate(0, 0.62, -0.34);
  return geometry;
}

function hillMound(): BufferGeometry {
  const geometry = new SphereGeometry(1, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  geometry.scale(0.97, 0.6, 0.97);
  return geometry;
}

function wheel(x: number, z: number): BufferGeometry {
  const geometry = new CylinderGeometry(0.058, 0.058, 0.05, 14);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, 0.058, z);
  return geometry;
}

function spool(x: number): BufferGeometry {
  return cylinder(0.045, 0.045, 0.012, [x, 0.082, 0.02], 16);
}

const BUILDERS: Record<DecorationType, () => PieceParts> = {
  house: () => [
    { material: 'paintCream', geometry: box(0.64, 0.62, 0.62, [0, 0.31, 0], 0.03) },
    { material: 'paintTerracotta', geometry: gabledRoof() },
    {
      material: 'paintDusty',
      geometry: merge(box(0.15, 0.3, 0.03, [0, 0.15, 0.315], 0.012), box(0.14, 0.14, 0.03, [0.18, 0.4, 0.315], 0.012)),
    },
  ],
  pineTree: () => [
    { material: 'woodDark', geometry: cylinder(0.075, 0.09, 0.32, [0, 0.16, 0]) },
    {
      material: 'paintSageDeep',
      geometry: merge(cone(0.4, 0.62, [0, 0.56, 0]), cone(0.29, 0.56, [0, 0.92, 0])),
    },
  ],
  roundTree: () => [
    { material: 'woodDark', geometry: cylinder(0.05, 0.06, 0.55, [0, 0.275, 0]) },
    { material: 'paintSage', geometry: sphere(0.3, [0, 0.7, 0]) },
  ],
  hill: () => [{ material: 'felt', geometry: hillMound() }],
  car: () => [
    {
      material: 'paintDusty',
      geometry: merge(box(0.5, 0.11, 0.26, [0, 0.11, 0], 0.03), box(0.25, 0.1, 0.22, [-0.04, 0.2, 0], 0.03)),
    },
    {
      material: 'plastic',
      geometry: merge(wheel(0.15, 0.13), wheel(0.15, -0.13), wheel(-0.15, 0.13), wheel(-0.15, -0.13)),
    },
  ],
  cassette: () => [
    { material: 'plastic', geometry: box(0.68, 0.08, 0.43, [0, 0.04, 0], 0.012) },
    { material: 'plasticCream', geometry: merge(box(0.54, 0.006, 0.27, [0, 0.081, -0.03], 0.002), spool(-0.15), spool(0.15)) },
  ],
  blocks: () => [
    { material: 'blockA', geometry: box(0.27, 0.27, 0.27, [-0.15, 0.135, 0.06], 0.025) },
    { material: 'blockB', geometry: box(0.27, 0.27, 0.27, [0.15, 0.135, -0.04], 0.025) },
    { material: 'blockC', geometry: box(0.27, 0.27, 0.27, [0, 0.405, 0.01], 0.025) },
  ],
};

export const buildDecoration = (type: DecorationType): PieceParts => BUILDERS[type]();
