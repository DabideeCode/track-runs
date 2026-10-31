import { Vector2, Vector3, type Camera } from 'three';
import type { Ray } from './pointerMath';

interface BoardView {
  camera: Camera;
  canvas: HTMLCanvasElement;
}

let view: BoardView | null = null;
let resetCameraHandler: (() => void) | null = null;

const ndc = new Vector2();
const near = new Vector3();
const far = new Vector3();

export function setBoardView(next: BoardView | null): void {
  view = next;
}

export function setResetCameraHandler(handler: (() => void) | null): void {
  resetCameraHandler = handler;
}

export function resetCamera(): void {
  resetCameraHandler?.();
}

export function boardCanvas(): HTMLCanvasElement | null {
  return view?.canvas ?? null;
}

/** True only when the canvas itself is under the pointer, so the overlay counts as off the grid. */
export function isOverCanvas(clientX: number, clientY: number): boolean {
  return !!view && document.elementFromPoint(clientX, clientY) === view.canvas;
}

export function pointerRay(clientX: number, clientY: number): Ray | null {
  if (!view) return null;
  const rect = view.canvas.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  near.set(ndc.x, ndc.y, -1).unproject(view.camera);
  far.set(ndc.x, ndc.y, 1).unproject(view.camera);
  far.sub(near).normalize();
  return {
    origin: { x: near.x, y: near.y, z: near.z },
    direction: { x: far.x, y: far.y, z: far.z },
  };
}
