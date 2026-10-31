import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, type AmbientLight, type DirectionalLight } from 'three';
import type { GameState } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';

const SHADOW_MAP_SIZE = 1024;
const SHADOW_EXTENT = 15;
const CHANGE_RATE = 5;

const MOODS: Record<GameState['setting'], { sun: Color; fill: Color; sunPower: number; fillPower: number }> = {
  bedroom: { sun: new Color('#eef3fb'), fill: new Color('#eef0f0'), sunPower: 2.3, fillPower: 1.25 },
  kitchen: { sun: new Color('#ffe2bb'), fill: new Color('#ffeeda'), sunPower: 2.45, fillPower: 1.2 },
};

/** One shadow-casting light plus ambient fill, as Section 7.3 allows. */
export function Lighting() {
  const lowQuality = useGameStore((state) => state.lowQuality);
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<AmbientLight>(null);

  useFrame((_, delta) => {
    if (!sun.current || !fill.current) return;
    const mood = MOODS[useGameStore.getState().setting];
    const blend = 1 - Math.exp(-CHANGE_RATE * delta);
    sun.current.color.lerp(mood.sun, blend);
    fill.current.color.lerp(mood.fill, blend);
    sun.current.intensity += (mood.sunPower - sun.current.intensity) * blend;
    fill.current.intensity += (mood.fillPower - fill.current.intensity) * blend;
  });

  return (
    <>
      <ambientLight ref={fill} intensity={1.25} />
      <directionalLight
        ref={sun}
        castShadow={!lowQuality}
        position={[7, 16, 9]}
        intensity={2.3}
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={42}
        shadow-radius={4}
        shadow-bias={-0.0006}
      />
    </>
  );
}
