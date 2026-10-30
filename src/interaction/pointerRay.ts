import { Box3, Plane, Ray, Raycaster, Vector2, Vector3, type Camera } from 'three';
import { catalogItem } from '@/domain/catalog';
import { tileToWorld, worldToTile } from '@/domain/grid';
import type { Piece } from '@/domain/types';

interface Viewport {
  camera: Camera;
  canvas: HTMLCanvasElement;
}

let viewport: Viewport | null = null;

const raycaster = new Raycaster();
const ndc = new Vector2();
const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const groundPoint = new Vector3();
const box = new Box3();
const hit = new Vector3();

export function registerViewport(next: Viewport | null) {
  viewport = next;
}

export function isCanvas(target: EventTarget | null) {
  return viewport !== null && target === viewport.canvas;
}

function rayAt(clientX: number, clientY: number): Ray | null {
  if (!viewport) return null;
  const rect = viewport.canvas.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, viewport.camera);
  return raycaster.ray;
}

export function groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
  const ray = rayAt(clientX, clientY);
  if (!ray?.intersectPlane(groundPlane, groundPoint)) return null;
  return { x: groundPoint.x, z: groundPoint.z };
}

export function projectToScreen(x: number, y: number, z: number) {
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.canvas.getBoundingClientRect();
  const point = new Vector3(x, y, z).project(viewport.camera);
  return {
    x: rect.left + ((point.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - point.y) / 2) * rect.height,
  };
}

export function tileAt(clientX: number, clientY: number) {
  const point = groundAt(clientX, clientY);
  return point ? worldToTile(point.x, point.z) : null;
}

// Uses simple boxes so a tall piece can be picked where the user sees it, not only at its base.
export function pieceAt(clientX: number, clientY: number, pieces: readonly Piece[]): Piece | null {
  const ray = rayAt(clientX, clientY);
  if (!ray) return null;
  let nearest: Piece | null = null;
  let nearestDistance = Infinity;
  for (const piece of pieces) {
    const { footprint, pickHeight } = catalogItem(piece.type);
    const min = tileToWorld(piece.gridX, piece.gridZ);
    box.min.set(min.x - 0.5, 0, min.z - 0.5);
    box.max.set(min.x - 0.5 + footprint, pickHeight, min.z - 0.5 + footprint);
    if (!ray.intersectBox(box, hit)) continue;
    const distance = hit.distanceToSquared(ray.origin);
    if (distance < nearestDistance) {
      nearest = piece;
      nearestDistance = distance;
    }
  }
  return nearest;
}
