import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Color, type AmbientLight, type DirectionalLight } from 'three';
import type { Setting } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';

const MOODS: Record<Setting, { sun: string; sunPower: number; fill: string; fillPower: number; sky: string }> = {
  bedroom: { sun: '#e6eef5', sunPower: 2.1, fill: '#d5dde6', fillPower: 1.25, sky: '#b9c6cc' },
  kitchen: { sun: '#ffecd2', sunPower: 2.3, fill: '#f6e8d6', fillPower: 1.6, sky: '#e4cfae' },
};

const EASE_RATE = 8;
const sun = new Color();
const fill = new Color();
const sky = new Color();

export function Lighting() {
  const sunRef = useRef<DirectionalLight>(null);
  const fillRef = useRef<AmbientLight>(null);
  const setting = useGameStore((state) => state.setting);
  const lowQuality = useGameStore((state) => state.lowQuality);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    scene.background = new Color(MOODS[useGameStore.getState().setting].sky);
  }, [scene]);

  useFrame((_, delta) => {
    const mood = MOODS[setting];
    const blend = 1 - Math.exp(-EASE_RATE * delta);
    if (sunRef.current) {
      sunRef.current.color.lerp(sun.set(mood.sun), blend);
      sunRef.current.intensity += (mood.sunPower - sunRef.current.intensity) * blend;
    }
    if (fillRef.current) {
      fillRef.current.color.lerp(fill.set(mood.fill), blend);
      fillRef.current.intensity += (mood.fillPower - fillRef.current.intensity) * blend;
    }
    if (scene.background instanceof Color) scene.background.lerp(sky.set(mood.sky), blend);
  });

  const initial = MOODS[setting];
  return (
    <>
      <ambientLight ref={fillRef} color={initial.fill} intensity={initial.fillPower} />
      <directionalLight
        ref={sunRef}
        color={initial.sun}
        intensity={initial.sunPower}
        position={[7, 16, 9]}
        castShadow={!lowQuality}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
        shadow-normalBias={0.025}
        shadow-radius={3}
      />
    </>
  );
}
