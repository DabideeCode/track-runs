import { useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, type InstancedMesh } from 'three';
import { EDGE_DELTA, getOpenEnds } from '@/domain/connectors';
import { GRID_SIZE, tileToWorld } from '@/domain/grid';
import { useGameStore } from '@/store/gameStore';

const CAPACITY = GRID_SIZE * GRID_SIZE * 2;
const MARKER_HEIGHT = 0.14;
const matrix = new Matrix4();

/** A small dot at each open end, in one draw call. Shown in Build mode only. */
export function OpenEndMarkers() {
  const mesh = useRef<InstancedMesh>(null);
  const pieces = useGameStore((state) => state.pieces);
  const mode = useGameStore((state) => state.mode);
  const ends = useMemo(() => getOpenEnds(pieces), [pieces]);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    ends.forEach((end, index) => {
      const world = tileToWorld({ x: end.gridX, z: end.gridZ });
      const delta = EDGE_DELTA[end.edge];
      matrix.makeTranslation(world.x + delta.x * 0.44, MARKER_HEIGHT, world.z + delta.z * 0.44);
      mesh.current!.setMatrixAt(index, matrix);
    });
    mesh.current.count = ends.length;
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [ends]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CAPACITY]} frustumCulled={false} visible={mode === 'build'}>
      <sphereGeometry args={[0.055, 10, 8]} />
      <meshStandardMaterial color="#c9704f" roughness={0.75} metalness={0} />
    </instancedMesh>
  );
}
