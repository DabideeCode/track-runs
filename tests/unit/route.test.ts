import { describe, expect, it } from 'vitest';
import { buildRoute, poseAt, segmentAt } from '@/domain/route';
import type { Piece, PieceType, Rotation } from '@/domain/types';

function piece(id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece {
  return { id, type, gridX, gridZ, rotation };
}

const line = [
  piece('s', 'station', 8, 8),
  piece('a', 'straight', 8, 7),
  piece('b', 'buffer', 8, 6, 0),
];

const loop = [
  piece('s', 'station', 4, 5),
  piece('t', 'straight', 6, 5),
  piece('nw', 'curve', 4, 4, 0),
  piece('ne', 'curve', 6, 4, 90),
  piece('n', 'straight', 5, 4, 90),
  piece('sw', 'curve', 4, 6, 270),
  piece('se', 'curve', 6, 6, 180),
  piece('so', 'straight', 5, 6, 90),
];

describe('buildRoute', () => {
  it('returns null with no station', () => {
    expect(buildRoute([piece('a', 'straight', 1, 1)], 0)).toBeNull();
  });

  it('handles a lone station', () => {
    const route = buildRoute([piece('s', 'station', 8, 8)], 0)!;
    expect(route.closed).toBe(false);
    expect(route.sMin).toBe(-0.5);
    expect(route.sMax).toBe(0.5);
  });

  it('runs toward the north connector for facing 0', () => {
    const route = buildRoute(line, 0)!;
    expect(route.closed).toBe(false);
    expect(route.sMax).toBeCloseTo(0.5 + 1 + 0.75);
    expect(route.sMin).toBe(-0.5);
    const pose = poseAt(route, 0);
    expect(pose.x).toBeCloseTo(0.5);
    expect(pose.z).toBeCloseTo(0.5);
    expect(pose.tangentZ).toBeCloseTo(-1);
    expect(segmentAt(route, 1).pieceId).toBe('a');
    expect(segmentAt(route, 2).pieceId).toBe('b');
  });

  it('runs the other way for facing 180', () => {
    const route = buildRoute(line, 180)!;
    expect(route.sMax).toBeCloseTo(0.5);
    expect(route.sMin).toBeCloseTo(-2.25);
    expect(poseAt(route, 0).tangentZ).toBeCloseTo(1);
    expect(segmentAt(route, -1).pieceId).toBe('a');
    expect(poseAt(route, -1).tangentZ).toBeCloseTo(1);
  });

  it.each([
    [0, 0, -1],
    [90, 1, 0],
    [180, 0, 1],
    [270, -1, 0],
  ] as const)('follows station rotation %i', (rotation, x, z) => {
    const route = buildRoute([piece('s', 'station', 8, 8, rotation)], 0)!;
    const pose = poseAt(route, 0);
    expect(pose.tangentX).toBeCloseTo(x);
    expect(pose.tangentZ).toBeCloseTo(z);
    const flipped = poseAt(buildRoute([piece('s', 'station', 8, 8, rotation)], 180)!, 0);
    expect(flipped.tangentX).toBeCloseTo(-x);
    expect(flipped.tangentZ).toBeCloseTo(-z);
  });

  it('closes a loop and sums curve lengths', () => {
    const route = buildRoute(loop, 0)!;
    expect(route.closed).toBe(true);
    expect(route.segments).toHaveLength(8);
    expect(route.total).toBeCloseTo(4 + Math.PI);
  });

  it('wraps around a closed loop', () => {
    const route = buildRoute(loop, 0)!;
    const pose = poseAt(route, route.total);
    expect(pose.x).toBeCloseTo(poseAt(route, 0).x);
    expect(pose.z).toBeCloseTo(poseAt(route, 0).z);
  });

  it('stays continuous and unit speed along the loop', () => {
    const route = buildRoute(loop, 0)!;
    const step = 0.01;
    let previous = poseAt(route, 0);
    for (let s = step; s < route.total; s += step) {
      const pose = poseAt(route, s);
      expect(Math.hypot(pose.x - previous.x, pose.z - previous.z)).toBeLessThan(step * 1.2);
      expect(Math.hypot(pose.tangentX, pose.tangentZ)).toBeCloseTo(1);
      previous = pose;
    }
  });

  it('continues straight past an open end', () => {
    const route = buildRoute([piece('s', 'station', 8, 8)], 0)!;
    const pose = poseAt(route, -1.5);
    expect(pose.x).toBeCloseTo(0.5);
    expect(pose.z).toBeCloseTo(2);
  });
});
