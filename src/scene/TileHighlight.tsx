import { tileToWorld } from '@/domain/grid';
import { useGameStore } from '@/store/gameStore';

export function TileHighlight() {
  const tile = useGameStore((state) => (state.mode === 'build' && !state.drag ? state.hoverTile : null));
  if (!tile) return null;
  const { x, z } = tileToWorld(tile.x, tile.z);
  return (
    <mesh position={[x, 0.009, z]} rotation-x={-Math.PI / 2} renderOrder={3}>
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial color="#fbf6ec" transparent opacity={0.32} depthWrite={false} />
    </mesh>
  );
}
