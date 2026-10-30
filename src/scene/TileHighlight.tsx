/**
 * Cream highlight on the tile under the pointer (task 14.10; design.md
 * section 7.4; Requirements 8.4 to 8.7).
 *
 * `hoverTile` is written by the drag controller (`setHover`), which clears it
 * when the pointer is off the grid, over an overlay panel or outside the
 * window, and the store forces it to null in Play mode. This component only
 * draws it: one quad inside the hovered tile's 1 × 1 area, hidden whenever
 * `tileHighlightPosition` returns null. The store only notifies when the
 * hovered tile actually changes, so this re-renders at most once per tile
 * crossing, and the new tile shows on the next frame (Req 8.5: within 100 ms).
 */
import { useEffect, useMemo } from 'react';
import { DoubleSide, MeshBasicMaterial, PlaneGeometry } from 'three';
import { COLOURS } from '@/theme/palette';
import { useAppStore } from '@/store/useAppStore';
import {
  TILE_HIGHLIGHT_OPACITY,
  TILE_HIGHLIGHT_SIZE,
  TILE_HIGHLIGHT_Y,
  tileHighlightPosition,
} from './gridDisplay';

const noRaycast = () => {};

export function TileHighlight() {
  const hoverTile = useAppStore((s) => s.hoverTile);
  const mode = useAppStore((s) => s.mode);

  const { geometry, material } = useMemo(() => {
    const plane = new PlaneGeometry(TILE_HIGHLIGHT_SIZE, TILE_HIGHLIGHT_SIZE);
    // Lie flat on the ground, facing up.
    plane.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: COLOURS.tileHighlight,
      transparent: true,
      opacity: TILE_HIGHLIGHT_OPACITY,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    return { geometry: plane, material: mat };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const position = tileHighlightPosition(hoverTile, mode);
  if (position === null) return null;

  return (
    <mesh
      name="tile-highlight"
      geometry={geometry}
      material={material}
      position={[position.x, TILE_HIGHLIGHT_Y, position.z]}
      renderOrder={2}
      raycast={noRaycast}
    />
  );
}
