import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, type LineBasicMaterial } from 'three';
import { GRID_SIZE } from '@/domain/grid';
import type { Setting } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';

const HALF = GRID_SIZE / 2;
const BUILD_OPACITY = 0.3;
const LINE_COLORS: Record<Setting, string> = { bedroom: '#4f4436', kitchen: '#fbeed2' };
const FADE_RATE = 9;

function createLines() {
  const points: number[] = [];
  for (let line = -HALF; line <= HALF; line += 1) {
    points.push(line, 0, -HALF, line, 0, HALF, -HALF, 0, line, HALF, 0, line);
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
}

export function GridOverlay() {
  const geometry = useMemo(createLines, []);
  const material = useRef<LineBasicMaterial>(null);
  const setting = useGameStore((state) => state.setting);

  useFrame((_, delta) => {
    if (!material.current) return;
    const target = useGameStore.getState().mode === 'build' ? BUILD_OPACITY : 0;
    material.current.opacity += (target - material.current.opacity) * (1 - Math.exp(-FADE_RATE * delta));
  });

  return (
    <lineSegments geometry={geometry} position-y={0.006} renderOrder={2}>
      <lineBasicMaterial ref={material} color={LINE_COLORS[setting]} transparent opacity={BUILD_OPACITY} depthWrite={false} />
    </lineSegments>
  );
}
