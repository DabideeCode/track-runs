import { describe, expect, it } from 'vitest';
import { buildRoute, routeSample } from '@/domain/route';
import { tileToWorld } from '@/domain/grid';
import type { Piece, PieceType, Rotation } from '@/domain/types';

const piece = (id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id,
  type,
  gridX,
  gridZ,
  rotation,
});

// North to south: buffer, straight, station, straight, open end.
const line = [
  piece('buf', 'buffer', 5, 3, 0),
  piece('a', 'straight', 5, 4),
  piece('st', 'station', 5, 5),
  piece('b', 'straight', 5, 6),
];

// Stretched oval: station on the west side, closed with four curves.
const loop = [
  piece('st', 'station', 5, 5),
  piece('nw', 'curve', 5, 4, 0),
  piece('ne', 'curve', 6, 4, 90),
  piece('e', 'straight', 6, 5),
  piece('se', 'curve', 6, 6, 180),
  piece('sw', 'curve', 5, 6, 270),
];

describe('buildRoute', () => {
  it('returns null with no station', () => {
    expect(buildRoute([piece('a', 'straight', 1, 1)], 0)).toBeNull();
  });

  it('builds a lone station as a one-tile line', () => {
    const route = buildRoute([piece('st', 'station', 5, 5)], 0)!;
    expect(route.kind).toBe('line');
    expect(route.length).toBeCloseTo(1);
    expect(route.stationS).toBeCloseTo(0.5);
  });

  it('orders a line with +s toward the facing connector', () => {
    const route = buildRoute(line, 0)!;
    expect(route.kind).toBe('line');
    expect(route.segments.map((segment) => segment.pieceId)).toEqual(['b', 'st', 'a', 'buf']);
    expect(route.length).toBeCloseTo(3.8);
    expect(route.stationS).toBeCloseTo(1.5);
  });

  it('reverses for facing 180', () => {
    const route = buildRoute(line, 180)!;
    expect(route.segments.map((segment) => segment.pieceId)).toEqual(['buf', 'a', 'st', 'b']);
    expect(route.stationS).toBeCloseTo(2.3);
  });

  it('follows the rotated north connector of a rotated station', () => {
    const pieces = [piece('st', 'station', 5, 5, 90), piece('east', 'straight', 6, 5, 90), piece('west', 'straight', 4, 5, 90)];
    expect(buildRoute(pieces, 0)!.segments.map((segment) => segment.pieceId)).toEqual(['west', 'st', 'east']);
  });

  it('detects a loop and keeps its true length', () => {
    const route = buildRoute(loop, 0)!;
    expect(route.kind).toBe('loop');
    expect(route.length).toBeCloseTo(2 + Math.PI);
    expect(route.segments).toHaveLength(6);
  });

  it('ignores tracks not connected to the station', () => {
    const route = buildRoute([...line, piece('far', 'straight', 12, 12)], 0)!;
    expect(route.segments.map((segment) => segment.pieceId)).not.toContain('far');
  });

  it('stops at a neighbour that does not connect', () => {
    const route = buildRoute([piece('st', 'station', 5, 5), piece('side', 'straight', 5, 4, 90)], 0)!;
    expect(route.segments).toHaveLength(1);
  });
});

describe('routeSample', () => {
  const centre = (x: number, z: number) => tileToWorld({ x, z });

  it('places the station centre at stationS, heading north for facing 0', () => {
    const route = buildRoute(line, 0)!;
    const sample = routeSample(route, route.stationS);
    expect(sample.x).toBeCloseTo(centre(5, 5).x);
    expect(sample.z).toBeCloseTo(centre(5, 5).z);
    expect(sample.hz).toBeCloseTo(-1);
    expect(sample.pieceId).toBe('st');
    expect(sample.progress).toBeCloseTo(0.5);
  });

  it('heads south for facing 180', () => {
    const route = buildRoute(line, 180)!;
    expect(routeSample(route, route.stationS).hz).toBeCloseTo(1);
  });

  it('ends a buffer at its stop block', () => {
    const route = buildRoute(line, 0)!;
    const sample = routeSample(route, route.length);
    expect(sample.z).toBeCloseTo(centre(5, 3).z - 0.3);
    expect(sample.pieceId).toBe('buf');
  });

  it('continues straight past the end of a line', () => {
    const route = buildRoute(line, 0)!;
    const sample = routeSample(route, -1);
    expect(sample.z).toBeCloseTo(centre(5, 6).z + 0.5 + 1);
    expect(sample.pieceId).toBe('b');
    expect(sample.progress).toBe(0);
  });

  it('follows the curve centreline at radius 0.5', () => {
    const route = buildRoute(loop, 0)!;
    const corner = { x: centre(5, 4).x + 0.5, z: centre(5, 4).z + 0.5 };
    const nw = route.segments.find((segment) => segment.pieceId === 'nw')!;
    const sample = routeSample(route, nw.start + nw.length / 2);
    expect(Math.hypot(sample.x - corner.x, sample.z - corner.z)).toBeCloseTo(0.5);
  });

  it('wraps around a loop in both directions', () => {
    const route = buildRoute(loop, 0)!;
    const start = routeSample(route, 0.25);
    const wrapped = routeSample(route, 0.25 + route.length);
    const backwards = routeSample(route, 0.25 - route.length);
    expect(wrapped.x).toBeCloseTo(start.x);
    expect(backwards.z).toBeCloseTo(start.z);
  });

  it('joins every segment with no gap', () => {
    const route = buildRoute(loop, 0)!;
    for (let s = 0; s < route.length; s += 0.02) {
      const a = routeSample(route, s);
      const b = routeSample(route, s + 0.02);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.0205);
    }
  });
});
