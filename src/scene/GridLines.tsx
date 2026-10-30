/**
 * Grid lines on every tile edge of the 16 × 16 grid (task 14.10; design.md
 * section 7.4; Requirements 8.1, 8.2, 8.3).
 *
 * - One `LineSegments` with 34 lines (17 per axis, including the border).
 * - Opacity 0.3 in Build mode; in Play mode it springs to 0.05 within 250 ms.
 * - The mode is read from the store inside `useFrame` and the material's
 *   opacity is mutated directly, so the fade causes no React renders. Once the
 *   spring has settled on the target, frames do no work.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import type { SpringState } from './animation/spring';
import { COLOURS } from '@/theme/palette';
import { useAppStoreApi } from '@/store/useAppStore';
import { gridLineOpacityTarget, gridLineVertices, stepGridOpacity } from './gridDisplay';

const noRaycast = () => {};

export function GridLines() {
  const store = useAppStoreApi();

  const lines = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(gridLineVertices(), 3));
    geometry.computeBoundingSphere();
    const material = new LineBasicMaterial({
      color: COLOURS.gridLine,
      transparent: true,
      opacity: gridLineOpacityTarget(store.getState().mode),
      depthWrite: false,
    });
    const object = new LineSegments(geometry, material);
    object.name = 'grid-lines';
    object.renderOrder = 1;
    object.raycast = noRaycast;
    return object;
  }, [store]);

  const spring = useRef<SpringState>({ pos: lines.material.opacity, vel: 0 });

  useEffect(
    () => () => {
      lines.geometry.dispose();
      lines.material.dispose();
    },
    [lines],
  );

  useFrame((_, delta) => {
    const mode = store.getState().mode;
    const current = spring.current;
    if (current.vel === 0 && current.pos === gridLineOpacityTarget(mode)) return;
    const next = stepGridOpacity(current, mode, delta);
    spring.current = { pos: next.pos, vel: next.vel };
    lines.material.opacity = next.pos;
  });

  return <primitive object={lines} />;
}
