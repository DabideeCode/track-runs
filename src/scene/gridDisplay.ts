/**
 * Pure helpers for the grid lines and the tile hover highlight (task 14.10;
 * design.md section 7.4; Requirements 8.1 to 8.7).
 *
 * No React, Three.js or DOM imports, so everything here runs in Node tests.
 * `GridLines.tsx` and `TileHighlight.tsx` only turn these values into meshes.
 */
import { GRID, inGrid, tileCentre } from '@/domain/grid';
import type { Tile } from '@/domain/types';
import { springFromFrequency, springStep, type SpringParams, type SpringState } from './animation/spring';

/** Number of grid lines: GRID + 1 along each axis, including the outer border (Req 8.2). */
export const GRID_LINE_COUNT = 2 * (GRID + 1);

/**
 * Height of the grid lines above the ground plane (y = 0). Just enough to
 * avoid z-fighting with the rug or tabletop; pieces resting on y = 0 still
 * cover the lines.
 */
export const GRID_LINE_Y = 0.003;

/** Grid line opacity per mode (Req 8.2: > 0 and ≤ 0.35 in Build; Req 8.3: ≤ 0.1 in Play). */
export const GRID_LINE_OPACITY = { build: 0.3, play: 0.05 } as const;

/** The fade between the two opacities must settle within this time (design 7.4: 250 ms). */
export const GRID_FADE_LIMIT = 0.25;

/**
 * Critically damped opacity spring (ζ = 1, no overshoot), ω = 48 rad/s. From
 * rest it settles exactly on the target after about 0.19 s for the full
 * 0.25 change, and passes 0.1 on the way to Play after about 60 ms. Settle
 * thresholds are in opacity units. Decision D-41 in design.md.
 */
export const GRID_FADE_SPRING: SpringParams = {
  ...springFromFrequency(48, 1),
  settle: { position: 0.001, speed: 0.01 },
};

/** Target grid line opacity for a mode. */
export function gridLineOpacityTarget(mode: 'build' | 'play'): number {
  return mode === 'play' ? GRID_LINE_OPACITY.play : GRID_LINE_OPACITY.build;
}

/** Advance the grid opacity spring by dt seconds toward the target for `mode`. */
export function stepGridOpacity(
  state: SpringState,
  mode: 'build' | 'play',
  dt: number,
): SpringState & { settled: boolean } {
  return springStep(state, gridLineOpacityTarget(mode), GRID_FADE_SPRING, dt);
}

/**
 * Line segment vertices for every tile edge of the 16 × 16 grid, including
 * the outer border: 17 lines of constant x from z = −8 to z = 8, then 17 lines
 * of constant z from x = −8 to x = 8, all at `y`. Returns
 * GRID_LINE_COUNT × 2 vertices × 3 components, ready for a `LineSegments`
 * position attribute.
 */
export function gridLineVertices(y: number = GRID_LINE_Y): Float32Array {
  const half = GRID / 2;
  const out = new Float32Array(GRID_LINE_COUNT * 6);
  let i = 0;
  const push = (x: number, z: number) => {
    out[i++] = x;
    out[i++] = y;
    out[i++] = z;
  };
  for (let k = 0; k <= GRID; k++) {
    const x = k - half;
    push(x, -half);
    push(x, half);
  }
  for (let k = 0; k <= GRID; k++) {
    const z = k - half;
    push(-half, z);
    push(half, z);
  }
  return out;
}

/** Edge length of the highlight quad: inside the tile's 1 × 1 area (Req 8.4). */
export const TILE_HIGHLIGHT_SIZE = 0.92;

/** Height of the highlight quad, just above the grid lines. */
export const TILE_HIGHLIGHT_Y = 0.004;

/** Opacity of the cream highlight quad. */
export const TILE_HIGHLIGHT_OPACITY = 0.45;

/**
 * Where to draw the tile highlight, or null for none. There is no highlight
 * in Play mode (Req 8.7), with no hovered tile (the pointer is off the grid
 * or has left the canvas, Req 8.6), or for a tile outside the grid.
 */
export function tileHighlightPosition(
  hoverTile: Tile | null,
  mode: 'build' | 'play',
): { x: number; z: number } | null {
  if (mode !== 'build' || hoverTile === null || !inGrid(hoverTile)) return null;
  return tileCentre(hoverTile.gridX, hoverTile.gridZ);
}
