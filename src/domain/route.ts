import { connectorsAt, DIRECTION_OFFSET, oppositeDirection, type Direction } from './catalog';
import { connectedNeighbour, trackTiles } from './connections';
import { tileToWorld } from './grid';
import type { Piece, StartFacing } from './types';

export interface Vec2 {
  x: number;
  z: number;
}

export interface RoutePose extends Vec2 {
  tangentX: number;
  tangentZ: number;
}

type PathAt = (t: number) => RoutePose;

export interface RouteSegment {
  pieceId: string;
  start: number;
  length: number;
  at: PathAt;
}

export interface Route {
  segments: RouteSegment[];
  closed: boolean;
  total: number;
  sMin: number;
  sMax: number;
}

const BUFFER_LENGTH = 0.75;
const CURVE_LENGTH = Math.PI / 4;

function edgePoint(centre: Vec2, direction: Direction): Vec2 {
  const offset = DIRECTION_OFFSET[direction];
  return { x: centre.x + offset.x * 0.5, z: centre.z + offset.z * 0.5 };
}

function linePath(from: Vec2, to: Vec2): PathAt {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  return (t) => ({
    x: from.x + dx * t,
    z: from.z + dz * t,
    tangentX: dx / length,
    tangentZ: dz / length,
  });
}

function arcPath(centre: Vec2, entry: Direction, exit: Direction): PathAt {
  const offsetIn = DIRECTION_OFFSET[entry];
  const offsetOut = DIRECTION_OFFSET[exit];
  const corner = {
    x: centre.x + (offsetIn.x + offsetOut.x) * 0.5,
    z: centre.z + (offsetIn.z + offsetOut.z) * 0.5,
  };
  const from = edgePoint(centre, entry);
  const to = edgePoint(centre, exit);
  const startX = from.x - corner.x;
  const startZ = from.z - corner.z;
  const endX = to.x - corner.x;
  const endZ = to.z - corner.z;
  return (t) => {
    const angle = t * (Math.PI / 2);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: corner.x + startX * cos + endX * sin,
      z: corner.z + startZ * cos + endZ * sin,
      tangentX: (-startX * sin + endX * cos) * 2,
      tangentZ: (-startZ * sin + endZ * cos) * 2,
    };
  };
}

function reversed(path: PathAt): PathAt {
  return (t) => {
    const pose = path(1 - t);
    return { ...pose, tangentX: -pose.tangentX, tangentZ: -pose.tangentZ };
  };
}

// A path through a piece entered by `entry`. The buffer has one connector and ends at its stop block.
function piecePath(piece: Piece, entry: Direction): { path: PathAt; length: number; exit: Direction | null } {
  const centre = tileToWorld(piece.gridX, piece.gridZ);
  if (piece.type === 'buffer') {
    const forward = DIRECTION_OFFSET[oppositeDirection(entry)];
    const stop = { x: centre.x + forward.x * 0.25, z: centre.z + forward.z * 0.25 };
    return { path: linePath(edgePoint(centre, entry), stop), length: BUFFER_LENGTH, exit: null };
  }
  const exit = connectorsAt(piece.type, piece.rotation).find((direction) => direction !== entry)!;
  if (piece.type === 'curve') {
    return { path: arcPath(centre, entry, exit), length: CURVE_LENGTH, exit };
  }
  return { path: linePath(edgePoint(centre, entry), edgePoint(centre, exit)), length: 1, exit };
}

function departureConnectors(station: Piece, startFacing: StartFacing) {
  const [north, south] = connectorsAt(station.type, station.rotation) as [Direction, Direction];
  return startFacing === 0 ? { ahead: north, behind: south } : { ahead: south, behind: north };
}

function walk(
  tracks: ReadonlyMap<string, Piece>,
  station: Piece,
  leaving: Direction,
  onPiece: (piece: Piece, entry: Direction) => void,
): boolean {
  let current = station;
  let exit: Direction | null = leaving;
  const seen = new Set([station.id]);
  while (exit) {
    const next = connectedNeighbour(tracks, current, exit);
    if (!next) return false;
    if (next.id === station.id) return true;
    if (seen.has(next.id)) return false;
    seen.add(next.id);
    const entry = oppositeDirection(exit);
    onPiece(next, entry);
    exit = piecePath(next, entry).exit;
    current = next;
  }
  return false;
}

export function buildRoute(pieces: readonly Piece[], startFacing: StartFacing): Route | null {
  const station = pieces.find((piece) => piece.type === 'station');
  if (!station) return null;

  const tracks = trackTiles(pieces);
  const { ahead, behind } = departureConnectors(station, startFacing);
  const stationPath = piecePath(station, behind);
  const segments: RouteSegment[] = [
    { pieceId: station.id, start: -0.5, length: 1, at: stationPath.path },
  ];

  let sMax = 0.5;
  const closed = walk(tracks, station, ahead, (piece, entry) => {
    const { path, length } = piecePath(piece, entry);
    segments.push({ pieceId: piece.id, start: sMax, length, at: path });
    sMax += length;
  });

  let sMin = -0.5;
  if (!closed) {
    walk(tracks, station, behind, (piece, entry) => {
      const { path, length } = piecePath(piece, entry);
      sMin -= length;
      segments.unshift({ pieceId: piece.id, start: sMin, length, at: reversed(path) });
    });
  }

  return { segments, closed, total: sMax - sMin, sMin, sMax };
}

export function wrapDistance(route: Route, s: number): number {
  if (!route.closed) return s;
  const offset = (s - route.sMin) % route.total;
  return route.sMin + (offset < 0 ? offset + route.total : offset);
}

export function segmentAt(route: Route, s: number): RouteSegment {
  const distance = wrapDistance(route, s);
  const { segments } = route;
  for (const segment of segments) {
    if (distance < segment.start + segment.length) return segment;
  }
  return segments[segments.length - 1]!;
}

export function progressOn(segment: RouteSegment, s: number, route: Route): number {
  const t = (wrapDistance(route, s) - segment.start) / segment.length;
  return Math.min(1, Math.max(0, t));
}

// Beyond an open end the pose continues in a straight line (D-09).
export function poseAt(route: Route, s: number): RoutePose {
  const distance = wrapDistance(route, s);
  if (!route.closed && distance < route.sMin) {
    const end = route.segments[0]!.at(0);
    const past = distance - route.sMin;
    return { ...end, x: end.x + end.tangentX * past, z: end.z + end.tangentZ * past };
  }
  if (!route.closed && distance > route.sMax) {
    const end = route.segments[route.segments.length - 1]!.at(1);
    const past = distance - route.sMax;
    return { ...end, x: end.x + end.tangentX * past, z: end.z + end.tangentZ * past };
  }
  const segment = segmentAt(route, distance);
  return segment.at(progressOn(segment, distance, route));
}
