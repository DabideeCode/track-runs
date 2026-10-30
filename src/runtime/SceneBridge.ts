/**
 * Bridge between the store and input layer and the live 3D scene
 * (design sections 3, 9.1 and 9.4; DD-6, DD-7).
 *
 * The R3F scene registers its renderer, camera, scene and the drei
 * CameraControls instance. Until they are registered, `captureThumbnail`
 * returns null, `resetView` does nothing, and `rayFromClient` and
 * `tileToScreen` return null.
 *
 * The maths for pointer-to-tile mapping and thumbnail sizing are exported as
 * pure functions so they can be tested in Node without WebGL.
 *
 * Three.js is imported for types only (D-59). The bridge is created by the
 * bootstrap, which the main menu loads, so a value import of `three` here
 * would pull the whole library into the menu chunk. The ray and projection
 * maths below read the camera's own matrices (`matrixWorld`,
 * `projectionMatrixInverse`, ...) and reproduce `Raycaster.setFromCamera`,
 * `Vector3.unproject` and `Vector3.project` exactly.
 */
import type { Camera, Object3D } from 'three';
import { inGrid, tileCentre, worldToTile } from '@/domain/grid';
import type { Tile } from '@/domain/types';
import type { ScenePort } from '@/store/ports';
import { DEFAULT_POSITION, DEFAULT_TARGET } from './cameraPose';

/** Largest thumbnail size (Requirement 6.1). */
export const THUMBNAIL_MAX_WIDTH = 320;
export const THUMBNAIL_MAX_HEIGHT = 240;
/** JPEG quality of thumbnails (design: Data Models, about 10 to 20 KB). */
export const THUMBNAIL_QUALITY = 0.7;

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The parts of the WebGL canvas the bridge uses. `HTMLCanvasElement` satisfies it. */
export interface CanvasLike {
  width: number;
  height: number;
  getBoundingClientRect(): RectLike;
}

/** The parts of `THREE.WebGLRenderer` the bridge uses. */
export interface RendererLike {
  domElement: CanvasLike;
  render(scene: Object3D, camera: Camera): void;
}

/** The parts of camera-controls the bridge uses. */
export interface CameraControlsLike {
  setLookAt(
    positionX: number,
    positionY: number,
    positionZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    enableTransition?: boolean,
  ): unknown;
}

/** The 2D canvas used to downscale and encode the thumbnail. */
export interface ThumbnailCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): { drawImage(source: unknown, dx: number, dy: number, dw: number, dh: number): void } | null;
  toDataURL(type: string, quality?: number): string;
}

export interface SceneParts {
  gl: RendererLike;
  camera: Camera;
  scene: Object3D;
  controls: CameraControlsLike;
}

export interface SceneBridgeOptions {
  /** Creates the 2D canvas for thumbnails. Defaults to `document.createElement('canvas')`. */
  createCanvas?: () => ThumbnailCanvas;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Normalised device coordinates (−1 to 1, y up) of a client point inside `rect`.
 * Null when the point is outside the rectangle or the rectangle is empty.
 */
export function clientToNdc(clientX: number, clientY: number, rect: RectLike): { x: number; y: number } | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const u = (clientX - rect.left) / rect.width;
  const v = (clientY - rect.top) / rect.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { x: u * 2 - 1, y: 1 - v * 2 };
}

/** Client coordinates of a point given in normalised device coordinates. */
export function ndcToClient(ndcX: number, ndcY: number, rect: RectLike): { x: number; y: number } {
  return {
    x: rect.left + ((ndcX + 1) / 2) * rect.width,
    y: rect.top + ((1 - ndcY) / 2) * rect.height,
  };
}

/**
 * Intersection of a ray with the ground plane y = 0.
 * Null when the ray is parallel to the plane or points away from it.
 */
export function intersectGround(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
): { x: number; z: number } | null {
  if (Math.abs(direction.y) < 1e-12) return null;
  const t = -origin.y / direction.y;
  if (!(t >= 0) || !Number.isFinite(t)) return null;
  return { x: origin.x + t * direction.x, z: origin.z + t * direction.z };
}

/** Tile hit by a ray on the ground plane, or null off the grid or with no hit (DD-7). */
export function tileFromRay(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
): Tile | null {
  const hit = intersectGround(origin, direction);
  return hit ? worldToTile(hit.x, hit.z) : null;
}

/**
 * Largest size that fits inside maxWidth × maxHeight with the source aspect
 * ratio, never larger than the source. Null for an empty source.
 */
export function thumbnailSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = THUMBNAIL_MAX_WIDTH,
  maxHeight = THUMBNAIL_MAX_HEIGHT,
): { width: number; height: number } | null {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) {
    return null;
  }
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: Math.min(maxWidth, Math.max(1, Math.round(sourceWidth * scale))),
    height: Math.min(maxHeight, Math.max(1, Math.round(sourceHeight * scale))),
  };
}

// ---------------------------------------------------------------------------
// Camera maths without Three.js values (D-59)
// ---------------------------------------------------------------------------

type Vec3 = { x: number; y: number; z: number };

/** The parts of a Three.js camera the ray maths read. `THREE.Camera` satisfies it. */
export interface CameraMatrices {
  matrixWorld: { elements: ArrayLike<number> };
  matrixWorldInverse: { elements: ArrayLike<number> };
  projectionMatrix: { elements: ArrayLike<number> };
  projectionMatrixInverse: { elements: ArrayLike<number> };
  isOrthographicCamera?: boolean;
  near?: number;
  far?: number;
}

/** `Vector3.applyMatrix4`: column-major 4 × 4 matrix with perspective divide. */
export function applyMatrix4(v: Vec3, e: ArrayLike<number>): Vec3 {
  const w = 1 / (e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15]);
  return {
    x: (e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]) * w,
    y: (e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]) * w,
    z: (e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]) * w,
  };
}

function normalise(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: 0 };
}

/** `Vector3.unproject(camera)`: NDC to world space. */
export function unproject(ndc: Vec3, camera: CameraMatrices): Vec3 {
  return applyMatrix4(applyMatrix4(ndc, camera.projectionMatrixInverse.elements), camera.matrixWorld.elements);
}

/** `Vector3.project(camera)`: world space to NDC. */
export function project(world: Vec3, camera: CameraMatrices): Vec3 {
  return applyMatrix4(applyMatrix4(world, camera.matrixWorldInverse.elements), camera.projectionMatrix.elements);
}

/** `Raycaster.setFromCamera`: the pick ray through an NDC point, for perspective and orthographic cameras. */
export function rayFromCamera(ndcX: number, ndcY: number, camera: CameraMatrices): { origin: Vec3; direction: Vec3 } {
  const m = camera.matrixWorld.elements;
  if (camera.isOrthographicCamera) {
    const near = camera.near ?? 0.1;
    const far = camera.far ?? 2000;
    const origin = unproject({ x: ndcX, y: ndcY, z: (near + far) / (near - far) }, camera);
    // (0, 0, −1) transformed as a direction by the world matrix.
    const direction = normalise({ x: -m[8], y: -m[9], z: -m[10] });
    return { origin, direction };
  }
  const origin = { x: m[12], y: m[13], z: m[14] };
  const p = unproject({ x: ndcX, y: ndcY, z: 0.5 }, camera);
  return { origin, direction: normalise({ x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z }) };
}

function defaultCreateCanvas(): ThumbnailCanvas {
  return document.createElement('canvas') as unknown as ThumbnailCanvas;
}

// ---------------------------------------------------------------------------
// SceneBridge
// ---------------------------------------------------------------------------

export class SceneBridge implements ScenePort {
  private parts: Partial<SceneParts> = {};
  private readonly createCanvas: () => ThumbnailCanvas;

  constructor(options: SceneBridgeOptions = {}) {
    this.createCanvas = options.createCanvas ?? defaultCreateCanvas;
  }

  /**
   * Registers some or all scene parts. Returns a function that unregisters
   * exactly those parts, unless they have been replaced since.
   */
  register(parts: Partial<SceneParts>): () => void {
    this.parts = { ...this.parts, ...parts };
    return () => {
      const next = { ...this.parts };
      for (const key of Object.keys(parts) as (keyof SceneParts)[]) {
        if (next[key] === parts[key]) delete next[key];
      }
      this.parts = next;
    };
  }

  /** True when the renderer, camera and scene are registered. */
  isReady(): boolean {
    return Boolean(this.parts.gl && this.parts.camera && this.parts.scene);
  }

  /**
   * JPEG data URL of the scene as currently seen by the camera, at most
   * 320 × 240. Renders one frame and copies the WebGL canvas in the same task,
   * so `preserveDrawingBuffer` is not needed. The overlay is HTML, so it is not
   * part of the capture (Requirement 6.1). Null when nothing is registered or
   * the capture fails (Requirement 6.4).
   */
  captureThumbnail(): string | null {
    const { gl, camera, scene } = this.parts;
    if (!gl || !camera || !scene) return null;
    try {
      const source = gl.domElement;
      const size = thumbnailSize(source.width, source.height);
      if (!size) return null;
      gl.render(scene, camera);
      const canvas = this.createCanvas();
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0, size.width, size.height);
      const url = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
      return typeof url === 'string' && url.startsWith('data:image/') ? url : null;
    } catch {
      return null;
    }
  }

  /** Animates the camera back to the default pose (Requirement 9.8). */
  resetView(): void {
    this.applyDefaultPose(true);
  }

  /** Places the camera at the default pose; `animate` false jumps there (Requirement 9.9). */
  applyDefaultPose(animate: boolean): void {
    const controls = this.parts.controls;
    if (!controls) return;
    const p = DEFAULT_POSITION;
    const t = DEFAULT_TARGET;
    void controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, animate);
  }

  /**
   * Tile under a client point: a ray from the camera through the point,
   * intersected with y = 0, then `worldToTile` (DD-7). Null outside the canvas,
   * off the grid, for a ray parallel to the ground, or when nothing is registered.
   */
  rayFromClient(clientX: number, clientY: number): Tile | null {
    const { gl, camera } = this.parts;
    if (!gl || !camera) return null;
    const ndc = clientToNdc(clientX, clientY, gl.domElement.getBoundingClientRect());
    if (!ndc) return null;
    camera.updateMatrixWorld();
    const ray = rayFromCamera(ndc.x, ndc.y, camera);
    return tileFromRay(ray.origin, ray.direction);
  }

  /**
   * Client coordinates of a tile centre on the ground, for the test-only
   * `window.__DIORAMA_DEBUG__.tileToScreen`. Null for a tile off the grid, a
   * tile centre outside the current view, or when nothing is registered.
   */
  tileToScreen(gridX: number, gridZ: number): { x: number; y: number } | null {
    const { gl, camera } = this.parts;
    if (!gl || !camera) return null;
    if (!inGrid({ gridX, gridZ })) return null;
    const c = tileCentre(gridX, gridZ);
    camera.updateMatrixWorld();
    const ndc = project({ x: c.x, y: 0, z: c.z }, camera);
    const inView = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
    return inView ? ndcToClient(ndc.x, ndc.y, gl.domElement.getBoundingClientRect()) : null;
  }
}
