/**
 * Grid lines and tile highlight helpers (task 14.10; Requirements 8.1 to 8.7).
 */
import { describe, expect, it } from 'vitest';
import {
  GRID_FADE_LIMIT,
  GRID_LINE_COUNT,
  GRID_LINE_OPACITY,
  TILE_HIGHLIGHT_SIZE,
  gridLineOpacityTarget,
  gridLineVertices,
  stepGridOpacity,
  tileHighlightPosition,
} from '@/scene/gridDisplay';
import type { SpringState } from '@/scene/animation/spring';

type Segment = { x1: number; z1: number; x2: number; z2: number; y: number };

function segments(v: Float32Array): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < v.length; i += 6) {
    out.push({ x1: v[i], y: v[i + 1], z1: v[i + 2], x2: v[i + 3], z2: v[i + 5] });
  }
  return out;
}

/** Runs the opacity spring at 60 fps; returns the opacity after each frame. */
function runFade(start: SpringState, mode: 'build' | 'play', frames: number): number[] {
  let s = start;
  const out: number[] = [];
  for (let f = 0; f < frames; f++) {
    const next = stepGridOpacity(s, mode, 1 / 60);
    s = { pos: next.pos, vel: next.vel };
    out.push(s.pos);
  }
  return out;
}

describe('gridLineVertices', () => {
  const segs = segments(gridLineVertices(0.003));

  it('has 34 segments, two vertices each, at the requested height', () => {
    expect(GRID_LINE_COUNT).toBe(34);
    expect(gridLineVertices().length).toBe(34 * 6);
    expect(segs).toHaveLength(34);
    for (const s of segs) expect(s.y).toBeCloseTo(0.003, 6);
  });

  it('draws a full-length line on every tile edge, including the border', () => {
    const vertical = segs.filter((s) => s.x1 === s.x2);
    const horizontal = segs.filter((s) => s.z1 === s.z2);
    expect(vertical).toHaveLength(17);
    expect(horizontal).toHaveLength(17);
    const edges = Array.from({ length: 17 }, (_, k) => k - 8);
    expect(vertical.map((s) => s.x1).sort((a, b) => a - b)).toEqual(edges);
    expect(horizontal.map((s) => s.z1).sort((a, b) => a - b)).toEqual(edges);
    for (const s of vertical) expect([s.z1, s.z2]).toEqual([-8, 8]);
    for (const s of horizontal) expect([s.x1, s.x2]).toEqual([-8, 8]);
  });
});

describe('grid line opacity', () => {
  it('targets 0.3 in Build mode and 0.05 in Play mode', () => {
    expect(gridLineOpacityTarget('build')).toBe(GRID_LINE_OPACITY.build);
    expect(gridLineOpacityTarget('play')).toBe(GRID_LINE_OPACITY.play);
    expect(GRID_LINE_OPACITY.build).toBeGreaterThan(0);
    expect(GRID_LINE_OPACITY.build).toBeLessThanOrEqual(0.35);
    expect(GRID_LINE_OPACITY.play).toBeLessThanOrEqual(0.1);
  });

  it('fades to Play opacity: at most 0.1 by 300 ms and exactly 0.05 by 250 ms', () => {
    const frames = runFade({ pos: 0.3, vel: 0 }, 'play', 30);
    const at = (seconds: number) => frames[Math.round(seconds * 60) - 1];
    expect(at(0.3)).toBeLessThanOrEqual(0.1);
    expect(at(GRID_FADE_LIMIT)).toBe(0.05);
    // No overshoot below the target and monotonic decrease.
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i]).toBeGreaterThanOrEqual(0.05);
      if (i > 0) expect(frames[i]).toBeLessThanOrEqual(frames[i - 1]);
    }
  });

  it('fades back to Build opacity within 250 ms without exceeding 0.35', () => {
    const frames = runFade({ pos: 0.05, vel: 0 }, 'build', 30);
    expect(frames[Math.round(GRID_FADE_LIMIT * 60) - 1]).toBe(0.3);
    for (const o of frames) {
      expect(o).toBeGreaterThan(0);
      expect(o).toBeLessThanOrEqual(0.3);
    }
  });

  it('handles a long frame and stays put once settled', () => {
    const big = stepGridOpacity({ pos: 0.3, vel: 0 }, 'play', 1);
    expect(big).toMatchObject({ pos: 0.05, vel: 0, settled: true });
    const still = stepGridOpacity({ pos: 0.05, vel: 0 }, 'play', 1 / 60);
    expect(still).toMatchObject({ pos: 0.05, vel: 0, settled: true });
  });
});

describe('tileHighlightPosition', () => {
  it('returns the hovered tile centre in Build mode', () => {
    expect(tileHighlightPosition({ gridX: 0, gridZ: 0 }, 'build')).toEqual({ x: -7.5, z: -7.5 });
    expect(tileHighlightPosition({ gridX: 15, gridZ: 3 }, 'build')).toEqual({ x: 7.5, z: -4.5 });
  });

  it('keeps the quad inside the tile', () => {
    expect(TILE_HIGHLIGHT_SIZE).toBeGreaterThan(0);
    expect(TILE_HIGHLIGHT_SIZE).toBeLessThanOrEqual(1);
  });

  it('shows nothing with no hovered tile, off the grid or in Play mode', () => {
    expect(tileHighlightPosition(null, 'build')).toBeNull();
    expect(tileHighlightPosition({ gridX: 16, gridZ: 0 }, 'build')).toBeNull();
    expect(tileHighlightPosition({ gridX: -1, gridZ: 4 }, 'build')).toBeNull();
    expect(tileHighlightPosition({ gridX: 2.5, gridZ: 4 }, 'build')).toBeNull();
    expect(tileHighlightPosition({ gridX: 3, gridZ: 4 }, 'play')).toBeNull();
  });
});
