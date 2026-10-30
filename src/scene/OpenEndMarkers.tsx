import { Instance, Instances } from '@react-three/drei';
import { useMemo } from 'react';
import { getOpenEnds } from '@/domain/connections';
import { useGameStore } from '@/store/gameStore';

export function OpenEndMarkers() {
  const pieces = useGameStore((state) => state.pieces);
  const building = useGameStore((state) => state.mode === 'build');
  const ends = useMemo(() => getOpenEnds(pieces), [pieces]);

  if (!building || ends.length === 0) return null;
  return (
    <Instances limit={512} frustumCulled={false}>
      <cylinderGeometry args={[0.065, 0.065, 0.02, 14]} />
      <meshBasicMaterial color="#c0735a" />
      {ends.map((end) => (
        <Instance key={`${end.pieceId}${end.direction}`} position={[end.x, 0.115, end.z]} />
      ))}
    </Instances>
  );
}
