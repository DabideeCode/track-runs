import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import { Color, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import type { GameState } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';
import { BedroomFloor } from './BedroomFloor';
import { KitchenTable } from './KitchenTable';

const FADE_SECONDS = 0.7;
const BACKGROUNDS: Record<GameState['setting'], Color> = {
  bedroom: new Color('#e9dfcd'),
  kitchen: new Color('#d9c9ad'),
};

function setOpacity(group: Group, opacity: number): void {
  group.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) (mesh.material as MeshStandardMaterial).opacity = opacity;
  });
}

/** Fades a setting in or out, so a switch completes within the 1 second AC-2.2 allows. */
function FadingSetting({ setting, children }: { setting: GameState['setting']; children: ReactNode }) {
  const group = useRef<Group>(null);
  const fade = useRef(useGameStore.getState().setting === setting ? 1 : 0);

  useFrame((_, delta) => {
    if (!group.current) return;
    const target = useGameStore.getState().setting === setting ? 1 : 0;
    const step = delta / FADE_SECONDS;
    const next = fade.current < target ? Math.min(target, fade.current + step) : Math.max(target, fade.current - step);
    if (next !== fade.current) {
      fade.current = next;
      setOpacity(group.current, next);
    }
    group.current.visible = next > 0;
  });

  useEffect(() => {
    if (group.current) {
      setOpacity(group.current, fade.current);
      group.current.visible = fade.current > 0;
    }
  }, []);

  return <group ref={group}>{children}</group>;
}

export function SettingScene() {
  const scene = useThree((state) => state.scene);
  const background = useRef(BACKGROUNDS[useGameStore.getState().setting].clone());

  useEffect(() => {
    scene.background = background.current;
  }, [scene]);

  useFrame((_, delta) => {
    const target = BACKGROUNDS[useGameStore.getState().setting];
    background.current.lerp(target, 1 - Math.exp(-6 * delta));
  });

  return (
    <>
      <FadingSetting setting="bedroom">
        <BedroomFloor />
      </FadingSetting>
      <FadingSetting setting="kitchen">
        <KitchenTable />
      </FadingSetting>
    </>
  );
}
