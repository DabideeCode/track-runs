import { CylinderGeometry, type BufferGeometry } from 'three';
import { box, cylinder, merge, sphere, type PieceParts } from './parts';

/** Vehicles are modelled facing north (-Z), with wheels sitting in the plank's grooves. */
const WHEEL_RADIUS = 0.075;
const WHEEL_TRACK = 0.13;
const DECK = 0.15;

function wheel(x: number, z: number): BufferGeometry {
  const geometry = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.05, 16);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(x, 0.06 + WHEEL_RADIUS, z);
  return geometry;
}

const wheelPairs = (...positions: number[]) =>
  positions.flatMap((z) => [wheel(-WHEEL_TRACK, z), wheel(WHEEL_TRACK, z)]);

function boiler(): BufferGeometry {
  const geometry = new CylinderGeometry(0.135, 0.135, 0.5, 18);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, DECK + 0.17, -0.16);
  return geometry;
}

export function buildLocomotive(): PieceParts {
  return [
    { material: 'woodDark', geometry: box(0.32, 0.08, 0.86, [0, DECK, 0], 0.025) },
    { material: 'paintTerracotta', geometry: merge(boiler(), box(0.34, 0.26, 0.3, [0, DECK + 0.18, 0.26], 0.03)) },
    { material: 'paintCream', geometry: box(0.38, 0.05, 0.36, [0, DECK + 0.34, 0.26], 0.02) },
    {
      material: 'paintDusty',
      geometry: merge(cylinder(0.05, 0.04, 0.13, [0, DECK + 0.36, -0.3]), sphere(0.05, [0, DECK + 0.33, -0.05], 12)),
    },
    { material: 'plastic', geometry: merge(...wheelPairs(-0.27, 0, 0.27)) },
  ];
}

export function buildCarriage(): PieceParts {
  return [
    { material: 'woodDark', geometry: box(0.32, 0.08, 0.76, [0, DECK, 0], 0.025) },
    { material: 'paintDusty', geometry: box(0.34, 0.24, 0.68, [0, DECK + 0.16, 0], 0.03) },
    { material: 'paintCream', geometry: box(0.38, 0.05, 0.74, [0, DECK + 0.3, 0], 0.02) },
    { material: 'plastic', geometry: merge(...wheelPairs(-0.24, 0.24)) },
  ];
}
