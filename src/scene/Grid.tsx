import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, type LineBasicMaterial } from 'three';
import { GRID_SIZE, tileToWorld } from '@/domain/grid';
import { useGameStore } from '@/store/gameStore';

const GRID_HEIGHT = 0.006;
const HIGHLIGHT_HEIGHT = 0.009;
const GRID_OPACITY = 0.32;
const FADE_RATE = 8;

function gridLines(): BufferGeometry {
  const half = GRID_SIZE / 2;
  const positions: number[] = [];
  for (let line = 0; line <= GRID_SIZE; line++) {
    const offset = line - half;
    positions.push(offset, GRID_HEIGHT, -half, offset, GRID_HEIGHT, half);
    positions.push(-half, GRID_HEIGHT, offset, half, GRID_HEIGHT, offset);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

function TileHighlight() {
  const hover = useGameStore((state) => state.hoverTile);
  const target = useGameStore((state) => state.drag?.target ?? null);
  const dragValid = useGameStore((state) => state.drag?.valid ?? null);
  const tile = target ?? hover;
  if (!tile) return null;
  const world = tileToWorld(tile);
  const color = dragValid === null ? '#d9b777' : dragValid ? '#8db97c' : '#d0694c';
  return (
    <mesh position={[world.x, HIGHLIGHT_HEIGHT, world.z]} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial color={color} transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}

export function Grid() {
  const geometry = useMemo(gridLines, []);
  const material = useRef<LineBasicMaterial>(null);

  useFrame((_, delta) => {
    if (!material.current) return;
    const target = useGameStore.getState().mode === 'build' ? GRID_OPACITY : 0;
    const blend = 1 - Math.exp(-FADE_RATE * delta);
    material.current.opacity += (target - material.current.opacity) * blend;
    material.current.visible = material.current.opacity > 0.005;
  });

  return (
    <>
      <lineSegments geometry={geometry} renderOrder={1}>
        <lineBasicMaterial ref={material} color="#5d4a3a" transparent opacity={GRID_OPACITY} depthWrite={false} />
      </lineSegments>
      <TileHighlight />
    </>
  );
}
