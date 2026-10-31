import { useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { CATALOGUE } from '@/domain/catalogue';
import { footprintCentre, GRID_SIZE } from '@/domain/grid';
import { useGameStore } from '@/store/gameStore';
import { activeIdsKey } from './activeList';
import { getContactShadowMaterial } from './geometry/materials';

export const CONTACT_HEIGHT = 0.012;
export const CONTACT_SPREAD = 1.3;

const CAPACITY = GRID_SIZE * GRID_SIZE;
const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const position = new Vector3();
const scale = new Vector3();
const matrix = new Matrix4();

/** A soft quad under every resting piece, in one draw call. See research R7. */
export function ContactShadowQuads() {
  const mesh = useRef<InstancedMesh>(null);
  const pieces = useGameStore((state) => state.pieces);
  const activeKey = useGameStore(activeIdsKey);
  const lowQuality = useGameStore((state) => state.lowQuality);
  const resting = useMemo(() => {
    const active = new Set(activeKey.split(' '));
    return pieces.filter((piece) => !active.has(piece.id));
  }, [pieces, activeKey]);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    resting.forEach((piece, index) => {
      const [width, depth] = CATALOGUE[piece.type].footprint;
      const centre = footprintCentre(piece.type, piece.gridX, piece.gridZ);
      position.set(centre.x, CONTACT_HEIGHT, centre.z);
      scale.set(width * CONTACT_SPREAD, depth * CONTACT_SPREAD, 1);
      mesh.current!.setMatrixAt(index, matrix.compose(position, flat, scale));
    });
    mesh.current.count = resting.length;
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [resting]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, getContactShadowMaterial(), CAPACITY]}
      frustumCulled={false}
      visible={!lowQuality}
      renderOrder={1}
    >
      <planeGeometry />
    </instancedMesh>
  );
}
