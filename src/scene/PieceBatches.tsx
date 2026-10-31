import { useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { CATALOGUE } from '@/domain/catalogue';
import { footprintCentre, GRID_SIZE } from '@/domain/grid';
import type { Piece, PieceType } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';
import { activeIdsKey } from './activeList';
import { getPieceParts } from './geometry';
import { getMaterial } from './geometry/materials';

const CAPACITY = GRID_SIZE * GRID_SIZE;
const UP = new Vector3(0, 1, 0);
const position = new Vector3();
const rotation = new Quaternion();
const unitScale = new Vector3(1, 1, 1);
const matrix = new Matrix4();

function TypeBatch({ type, pieces }: { type: PieceType; pieces: Piece[] }) {
  const parts = getPieceParts(type);
  const meshes = useRef<Array<InstancedMesh | null>>([]);

  useLayoutEffect(() => {
    for (const mesh of meshes.current) {
      if (!mesh) continue;
      pieces.forEach((piece, index) => {
        const centre = footprintCentre(piece.type, piece.gridX, piece.gridZ);
        position.set(centre.x, 0, centre.z);
        rotation.setFromAxisAngle(UP, (-piece.rotation * Math.PI) / 180);
        mesh.setMatrixAt(index, matrix.compose(position, rotation, unitScale));
      });
      mesh.count = pieces.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [pieces]);

  return parts.map((part, index) => (
    <instancedMesh
      key={part.material}
      ref={(mesh) => {
        meshes.current[index] = mesh;
      }}
      args={[part.geometry, getMaterial(part.material), CAPACITY]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  ));
}

/** Resting pieces, one instanced mesh per type and material, so 100 pieces stay cheap to draw. */
export function PieceBatches() {
  const pieces = useGameStore((state) => state.pieces);
  const activeKey = useGameStore(activeIdsKey);

  const byType = useMemo(() => {
    const active = new Set(activeKey.split(' '));
    const groups = new Map<PieceType, Piece[]>();
    for (const type of Object.keys(CATALOGUE) as PieceType[]) groups.set(type, []);
    for (const piece of pieces) {
      if (!active.has(piece.id)) groups.get(piece.type)!.push(piece);
    }
    return groups;
  }, [pieces, activeKey]);

  return [...byType].map(([type, group]) => <TypeBatch key={type} type={type} pieces={group} />);
}
