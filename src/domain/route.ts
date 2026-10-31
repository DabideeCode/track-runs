import type { Edge } from './catalogue';
import { connectedNeighbour, OPPOSITE, pieceConnectors, rotateEdge } from './connectors';
import { buildOccupancy } from './grid';
import { piecePath, type PathPoint, type PiecePath } from './trackPaths';
import type { GameState, Piece } from './types';

export interface RouteSegment {
  pieceId: string;
  start: number;
  length: number;
  path: PiecePath;
}

export interface Route {
  kind: 'line' | 'loop';
  segments: RouteSegment[];
  length: number;
  stationS: number;
}

export interface RouteSample extends PathPoint {
  pieceId: string;
  progress: number;
}

interface Step {
  piece: Piece;
  from: Edge | null;
  to: Edge | null;
}

/** Walks outward through connectors. Tracks have at most two, so the walk cannot branch. */
function walk(station: Piece, exit: Edge, occupancy: Map<string, Piece>): { steps: Step[]; closed: boolean } {
  const steps: Step[] = [];
  let current = station;
  let edge: Edge | null = exit;
  while (edge) {
    const neighbour = connectedNeighbour(current, edge, occupancy);
    if (!neighbour) break;
    if (neighbour.id === station.id) return { steps, closed: true };
    const from: Edge = OPPOSITE[edge];
    const to: Edge | null = pieceConnectors(neighbour).find((candidate) => candidate !== from) ?? null;
    steps.push({ piece: neighbour, from, to });
    current = neighbour;
    edge = to;
  }
  return { steps, closed: false };
}

function toSegments(steps: Step[]): RouteSegment[] {
  let start = 0;
  return steps.map(({ piece, from, to }) => {
    const path = piecePath(piece, from, to);
    const segment = { pieceId: piece.id, start, length: path.length, path };
    start += path.length;
    return segment;
  });
}

/**
 * The path through the station. +s always points the way the locomotive faces, so forward means
 * increasing s for either start facing.
 */
export function buildRoute(pieces: readonly Piece[], startFacing: GameState['startFacing']): Route | null {
  const station = pieces.find((piece) => piece.type === 'station');
  if (!station) return null;

  const occupancy = buildOccupancy(pieces);
  const ahead = rotateEdge(startFacing === 0 ? 'N' : 'S', station.rotation);
  const behind = OPPOSITE[ahead];
  const stationStep: Step = { piece: station, from: behind, to: ahead };

  const forward = walk(station, ahead, occupancy);
  if (forward.closed) {
    const segments = toSegments([stationStep, ...forward.steps]);
    return { kind: 'loop', segments, length: lengthOf(segments), stationS: 0.5 };
  }

  const backward = walk(station, behind, occupancy).steps
    .reverse()
    .map((step) => ({ piece: step.piece, from: step.to, to: step.from }));
  const segments = toSegments([...backward, stationStep, ...forward.steps]);
  const stationSegment = segments[backward.length]!;
  return { kind: 'line', segments, length: lengthOf(segments), stationS: stationSegment.start + 0.5 };
}

function lengthOf(segments: RouteSegment[]): number {
  const last = segments.at(-1)!;
  return last.start + last.length;
}

export function routeSample(route: Route, s: number): RouteSample {
  const position = route.kind === 'loop' ? ((s % route.length) + route.length) % route.length : s;
  const first = route.segments[0]!;
  const last = route.segments.at(-1)!;

  if (position <= 0) return extend(first, 0, position);
  if (position >= route.length) return extend(last, 1, position - route.length);

  for (const segment of route.segments) {
    if (position <= segment.start + segment.length) {
      const progress = (position - segment.start) / segment.length;
      return { ...segment.path.point(progress), pieceId: segment.pieceId, progress };
    }
  }
  return extend(last, 1, 0);
}

/** Past the end of a line, carriages carry on in a straight line. */
function extend(segment: RouteSegment, progress: 0 | 1, overshoot: number): RouteSample {
  const point = segment.path.point(progress);
  return {
    ...point,
    x: point.x + point.hx * overshoot,
    z: point.z + point.hz * overshoot,
    pieceId: segment.pieceId,
    progress,
  };
}
