/**
 * Three.js helpers for the instanced piece layers (task 14.11; design.md DD-5,
 * section 7.4; Requirements 14.6, 30.10, 32.5, 33.1).
 *
 * Everything here runs in Node (no WebGL, no React), so matrices, sizes and
 * picking are unit-tested directly. The React components in this folder only
 * wire these helpers to the store and to `useFrame`.
 *
 * - Part meshes: every placed piece of a type draws through the same shared
 *   geometries and materials. Parts are grouped by (geometry, material,
 *   castShadow), so the rail shared by straight, tunnel and station track is
 *   one instanced mesh across all three types (D-39), and adding a piece never
 *   creates a geometry or material (Requirement 32.5).
 * - Pick proxies: one invisible box per piece, covering its footprint (inset
 *   slightly so neighbours never overlap) and its model height.
 * - Blob shadows: a soft radial-gradient plane under each piece and vehicle,
 *   sized from the model's bounds, drawn with one instanced mesh.
 * - Open-end pegs: one shared rounded peg geometry and material.
 */
import {
  Box3,
  BoxGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type InstancedMesh,
  type Raycaster,
} from 'three';
import { CATALOGUE, itemOf } from '@/domain/catalogue';
import type { VehiclePose } from '@/domain/train';
import type { Piece, PieceType } from '@/domain/types';
import { TOKENS } from '@/theme/palette';
import {
  cylinderProfile,
  finishGeometry,
  lathe,
  materialKey,
  partMatrix,
  partsFor,
  type PiecePart,
} from '@/scene/models/geometry';
import type { MaterialLibrary } from '@/scene/models/materials';
import { VEHICLE_LENGTH, vehicleYaw } from '@/scene/models/trainGeometry';
import { OPEN_END_PEG, pieceRestTransform } from './pieceLayout';

const UP = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Part meshes for drei <Merged>
// ---------------------------------------------------------------------------

/** Instanced-mesh key of a part: one key per (geometry, material, shadow casting). */
export function partMeshKey(part: PiecePart): string {
  return `${part.geometry.uuid}|${materialKey(part.materialSpec)}|${part.castShadow ? 'cast' : 'nocast'}`;
}

/** One part of a type, with the key of the instanced mesh that draws it. */
export interface TypePart {
  key: string;
  part: PiecePart;
}

export interface PartMeshSet {
  /** Meshes whose instances cast shadows, keyed by `partMeshKey`. */
  casters: Record<string, Mesh>;
  /** Meshes whose instances only receive shadows. */
  receivers: Record<string, Mesh>;
  /** The parts of each type and the mesh key each one uses. */
  byType: Readonly<Record<PieceType, readonly TypePart[]>>;
}

/**
 * Template meshes for `<Merged>`: one per unique part key across all 12 types,
 * using the shared geometries from `partsFor` and materials from `lib`.
 */
export function buildPartMeshes(lib: MaterialLibrary): PartMeshSet {
  const casters: Record<string, Mesh> = {};
  const receivers: Record<string, Mesh> = {};
  const byType = {} as Record<PieceType, TypePart[]>;
  for (const item of CATALOGUE) {
    const list: TypePart[] = [];
    for (const part of partsFor(item.type)) {
      const key = partMeshKey(part);
      const target = part.castShadow ? casters : receivers;
      if (!target[key]) {
        const mesh = new Mesh(part.geometry, part.material(lib));
        mesh.name = `${item.type}:${part.name}`;
        target[key] = mesh;
      }
      list.push({ key, part });
    }
    byType[item.type] = list;
  }
  return { casters, receivers, byType };
}

// ---------------------------------------------------------------------------
// Model bounds
// ---------------------------------------------------------------------------

const boundsCache = new Map<PieceType, Box3>();

/** Bounding box of a type's model at rotation 0, in piece-local space (cached). */
export function pieceLocalBounds(type: PieceType): Box3 {
  let box = boundsCache.get(type);
  if (!box) {
    box = new Box3();
    for (const part of partsFor(type)) {
      const g = part.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      box.union(g.boundingBox!.clone().applyMatrix4(partMatrix(part)));
    }
    boundsCache.set(type, box);
  }
  return box;
}

/** Clears cached bounds (after `disposePieceGeometries`). */
export function clearPieceBoundsCache(): void {
  boundsCache.clear();
}

// ---------------------------------------------------------------------------
// Pick proxies
// ---------------------------------------------------------------------------

/** Fraction of the footprint a pick proxy covers, so proxies of neighbours never touch. */
export const PICK_PROXY_INSET = 0.98;
/** Lowest pick proxy height, so flat pieces are easy to hit from low camera angles. */
export const PICK_PROXY_MIN_HEIGHT = 0.12;

/** Size of a type's pick box: footprint (inset) × model height. */
export function pickProxySize(type: PieceType): { width: number; depth: number; height: number } {
  const edge = itemOf(type).size * PICK_PROXY_INSET;
  const height = Math.max(PICK_PROXY_MIN_HEIGHT, pieceLocalBounds(type).max.y);
  return { width: edge, depth: edge, height };
}

const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

/** Writes the world matrix of a piece's pick proxy (a unit box) into `out`. */
export function pickProxyMatrix(piece: Piece, out: Matrix4 = new Matrix4()): Matrix4 {
  const rest = pieceRestTransform(piece);
  const size = pickProxySize(piece.type);
  _p.set(rest.x, size.height / 2, rest.z);
  _q.setFromAxisAngle(UP, rest.yaw);
  _s.set(size.width, size.height, size.depth);
  return out.compose(_p, _q, _s);
}

/** Writes proxy matrices for `pieces` into `mesh` and refreshes its bounds for raycasting. */
export function writePickProxies(mesh: InstancedMesh, pieces: readonly Piece[]): void {
  const m = new Matrix4();
  const count = Math.min(pieces.length, mesh.instanceMatrix.count);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, pickProxyMatrix(pieces[i]!, m));
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

/** Id of the nearest proxy the ray hits, or null. `ids[i]` is the piece of instance i. */
export function pickFromRay(raycaster: Raycaster, mesh: InstancedMesh, ids: readonly string[]): string | null {
  if (mesh.count === 0) return null;
  const hits = raycaster.intersectObject(mesh, false);
  for (const hit of hits) {
    const id = hit.instanceId === undefined ? undefined : ids[hit.instanceId];
    if (id !== undefined) return id;
  }
  return null;
}

/** Casts a ray through normalised device coordinates and returns the nearest piece id. */
export function pickAtNdc(
  raycaster: Raycaster,
  camera: Camera,
  ndc: { x: number; y: number },
  mesh: InstancedMesh,
  ids: readonly string[],
): string | null {
  camera.updateMatrixWorld();
  raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
  return pickFromRay(raycaster, mesh, ids);
}

let proxyResources: { geometry: BoxGeometry; material: MeshBasicMaterial } | null = null;

/** Shared unit box and never-rendered material for pick proxies. */
export function pickProxyResources(): { geometry: BoxGeometry; material: MeshBasicMaterial } {
  if (!proxyResources) {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial({ visible: false });
    material.name = 'pickProxy';
    proxyResources = { geometry, material };
  }
  return proxyResources;
}

// ---------------------------------------------------------------------------
// Blob shadows
// ---------------------------------------------------------------------------

/** Blob shadow look and size (design.md section 7.4). */
export const BLOB = {
  /** Opacity of the darkest point of a resting blob. */
  opacity: 0.32,
  /** Height above the ground, so blobs never z-fight with the floor. */
  y: 0.004,
  /** Scale applied to the model's ground extent. */
  spread: 1.2,
  /** Extra width and depth in tiles, so thin pieces still get a soft edge. */
  margin: 0.12,
  /** Vehicle blob width in tiles (the train is about 0.34 wide). */
  vehicleWidth: 0.5,
  /** Gradient texture edge length. */
  textureSize: 64,
} as const;

/** Blob ellipse of a type in piece-local space: centre offset and full width (x) and depth (z). */
export interface BlobFootprint {
  cx: number;
  cz: number;
  width: number;
  depth: number;
}

/** The blob under a type, from its model bounds (cached through `pieceLocalBounds`). */
export function blobFootprint(type: PieceType): BlobFootprint {
  const b = pieceLocalBounds(type);
  return {
    cx: (b.min.x + b.max.x) / 2,
    cz: (b.min.z + b.max.z) / 2,
    width: (b.max.x - b.min.x) * BLOB.spread + BLOB.margin,
    depth: (b.max.z - b.min.z) * BLOB.spread + BLOB.margin,
  };
}

/** World matrix of a piece's blob (a unit plane on the ground), rotated with the piece. */
export function pieceBlobMatrix(piece: Piece, out: Matrix4 = new Matrix4()): Matrix4 {
  const rest = pieceRestTransform(piece);
  const f = blobFootprint(piece.type);
  const cos = Math.cos(rest.yaw);
  const sin = Math.sin(rest.yaw);
  // Rotation about +Y by yaw maps local (x, z) to (x cos + z sin, −x sin + z cos).
  _p.set(rest.x + f.cx * cos + f.cz * sin, BLOB.y, rest.z - f.cx * sin + f.cz * cos);
  _q.setFromAxisAngle(UP, rest.yaw);
  _s.set(f.width, 1, f.depth);
  return out.compose(_p, _q, _s);
}

/** World matrix of a vehicle's blob, centred under the vehicle and turned along its tangent. */
export function vehicleBlobMatrix(pose: VehiclePose, out: Matrix4 = new Matrix4()): Matrix4 {
  _p.set(pose.x, BLOB.y, pose.z);
  _q.setFromAxisAngle(UP, vehicleYaw(pose.tangent));
  _s.set(BLOB.vehicleWidth, 1, VEHICLE_LENGTH[pose.vehicle] * BLOB.spread);
  return out.compose(_p, _q, _s);
}

/** A matrix that hides an instance (zero scale). */
export const HIDDEN_MATRIX: Readonly<Matrix4> = new Matrix4().makeScale(0, 0, 0);

/** Instances 0 to 2 of the blob mesh belong to the locomotive and the 2 carriages. */
export const TRAIN_BLOB_SLOTS = 3;

/** Writes the vehicle blobs into slots 0 to 2; missing poses (no station) are hidden. */
export function writeTrainBlobs(mesh: InstancedMesh, poses: readonly VehiclePose[] | null): void {
  const m = new Matrix4();
  for (let i = 0; i < TRAIN_BLOB_SLOTS; i++) {
    const pose = poses?.[i];
    mesh.setMatrixAt(i, pose ? vehicleBlobMatrix(pose, m) : (HIDDEN_MATRIX as Matrix4));
  }
  mesh.count = Math.max(mesh.count, TRAIN_BLOB_SLOTS);
  mesh.instanceMatrix.needsUpdate = true;
}

/** Writes one blob per piece after the train slots and sets the instance count. */
export function writePieceBlobs(mesh: InstancedMesh, pieces: readonly Piece[]): void {
  const m = new Matrix4();
  const count = Math.min(pieces.length, mesh.instanceMatrix.count - TRAIN_BLOB_SLOTS);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(TRAIN_BLOB_SLOTS + i, pieceBlobMatrix(pieces[i]!, m));
  mesh.count = TRAIN_BLOB_SLOTS + count;
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Soft radial gradient: white RGB, alpha 1 at the centre falling smoothly to 0
 * at the edge of the inscribed circle (and 0 outside it).
 */
export function radialGradientData(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const v = ((j + 0.5) / size) * 2 - 1;
      const r = Math.min(1, Math.hypot(u, v));
      const s = 1 - r;
      const alpha = s * s * (3 - 2 * s); // smoothstep(0, 1, 1 − r)
      const o = (j * size + i) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = Math.round(alpha * 255);
    }
  }
  return data;
}

export interface BlobResources {
  geometry: PlaneGeometry;
  material: MeshBasicMaterial;
  texture: DataTexture;
}

let blobResources: BlobResources | null = null;

/**
 * Shared blob plane (horizontal, 1 × 1) and material. The colour is the
 * `blobShadow` palette token; the gradient texture supplies the soft edge.
 * `ActivePiece` (task 14.12) reuses them for lifted pieces with its own opacity.
 */
export function blobShadowResources(): BlobResources {
  if (!blobResources) {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const size = BLOB.textureSize;
    const texture = new DataTexture(radialGradientData(size), size, size, RGBAFormat, UnsignedByteType);
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const material = new MeshBasicMaterial({
      color: TOKENS.blobShadow.hex,
      map: texture,
      transparent: true,
      opacity: BLOB.opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    material.name = 'blobShadow';
    blobResources = { geometry, material, texture };
  }
  return blobResources;
}

// ---------------------------------------------------------------------------
// Open-end pegs
// ---------------------------------------------------------------------------

let pegResources: { geometry: BufferGeometry; material: MeshStandardMaterial } | null = null;

/** Shared open-end peg: a rounded cream cylinder 0.18 wide (Requirement 14.6). */
export function openEndPegResources(): { geometry: BufferGeometry; material: MeshStandardMaterial } {
  if (!pegResources) {
    const r = OPEN_END_PEG.width / 2;
    const geometry = finishGeometry(lathe(cylinderProfile(r, 0, OPEN_END_PEG.height, 0, 0.03), 14));
    const material = new MeshStandardMaterial({
      color: TOKENS.openEndMarker.hex,
      roughness: 0.7,
      metalness: 0,
      envMap: null,
    });
    material.name = 'openEndMarker';
    pegResources = { geometry, material };
  }
  return pegResources;
}

/** World matrix of a peg at an edge midpoint. */
export function pegMatrix(x: number, z: number, out: Matrix4 = new Matrix4()): Matrix4 {
  return out.makeTranslation(x, 0, z);
}
