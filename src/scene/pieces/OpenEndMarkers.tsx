/**
 * Open-end markers (task 14.11; design.md section 7.4; Requirements 14.6, 14.9).
 *
 * One instanced mesh of 0.18-wide cream pegs, one at the tile-edge midpoint of
 * every open end from `openEnds(pieces)` (memoised by `selectOpenEnds`), shown
 * in Build mode only. The markers are never raycast, so they do not block
 * placement. Ends of the piece being dragged off its tile are hidden while it
 * is lifted away. Markers update in the same render as `pieces`, so they are
 * current before any drop, rotate or delete animation ends.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, type InstancedMesh } from 'three';
import { selectOpenEnds } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { openEndPegResources, pegMatrix } from './instancing';
import { MAX_OPEN_ENDS, openEndMarkerPositions } from './pieceLayout';

export function OpenEndMarkers() {
  const mode = useAppStore((s) => s.mode);
  const ends = useAppStore(selectOpenEnds);
  const draggedId = useAppStore((s) => s.drag?.pieceId ?? null);
  const positions = useMemo(() => openEndMarkerPositions(ends, draggedId), [ends, draggedId]);
  const meshRef = useRef<InstancedMesh>(null);
  const { geometry, material } = openEndPegResources();

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    const count = Math.min(positions.length, MAX_OPEN_ENDS);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, pegMatrix(positions[i]!.x, positions[i]!.z, m));
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }, [positions]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_OPEN_ENDS]}
      name="openEndMarkers"
      visible={mode === 'build'}
      frustumCulled={false}
      castShadow={false}
      receiveShadow
      raycast={() => null}
    />
  );
}
