import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Quaternion, Vector3, type Group } from 'three';
import { buildRoute, routeSample } from '@/domain/route';
import { FIRST_CARRIAGE_OFFSET, SECOND_CARRIAGE_OFFSET } from '@/domain/trainSim';
import { useGameStore } from '@/store/gameStore';
import { advanceTrain, runningTrain } from '@/train/runtime';
import type { PieceParts } from './geometry/parts';
import { getMaterial } from './geometry/materials';
import { buildCarriage, buildLocomotive } from './geometry/train';

const AXLE_REACH = 0.3;
const PARK_RATE = 10;
const OFFSETS = [0, FIRST_CARRIAGE_OFFSET, SECOND_CARRIAGE_OFFSET] as const;
const UP = new Vector3(0, 1, 0);
const targetPosition = new Vector3();
const targetRotation = new Quaternion();

function Vehicle({ parts, groupRef }: { parts: PieceParts; groupRef: (group: Group | null) => void }) {
  return (
    <group ref={groupRef} visible={false}>
      {parts.map((part, index) => (
        <mesh key={index} geometry={part.geometry} material={getMaterial(part.material)} castShadow receiveShadow />
      ))}
    </group>
  );
}

export function Train() {
  const groups = useRef<Array<Group | null>>([]);
  const placed = useRef(false);
  const pieces = useGameStore((state) => state.pieces);
  const startFacing = useGameStore((state) => state.startFacing);
  const parkedRoute = useMemo(() => buildRoute(pieces, startFacing), [pieces, startFacing]);
  const locomotive = useMemo(buildLocomotive, []);
  const carriage = useMemo(buildCarriage, []);

  useFrame((_, delta) => {
    const { mode, driveMode } = useGameStore.getState();
    if (mode === 'play') advanceTrain(delta, driveMode);
    const running = runningTrain();
    const route = running?.route ?? parkedRoute;
    const s = running?.s ?? route?.stationS ?? 0;

    groups.current.forEach((group, index) => {
      if (!group) return;
      group.visible = route !== null;
      if (!route) {
        placed.current = false;
        return;
      }
      const centre = s + OFFSETS[index]!;
      const front = routeSample(route, centre + AXLE_REACH);
      const rear = routeSample(route, centre - AXLE_REACH);
      targetPosition.set((front.x + rear.x) / 2, 0, (front.z + rear.z) / 2);
      targetRotation.setFromAxisAngle(UP, Math.atan2(rear.x - front.x, rear.z - front.z));
      if (running || !placed.current) {
        group.position.copy(targetPosition);
        group.quaternion.copy(targetRotation);
      } else {
        // Parking eases back to the station rather than teleporting.
        const blend = 1 - Math.exp(-PARK_RATE * delta);
        group.position.lerp(targetPosition, blend);
        group.quaternion.slerp(targetRotation, blend);
      }
    });
    if (route) placed.current = true;
  });

  return (
    <>
      {[locomotive, carriage, carriage].map((parts, index) => (
        <Vehicle
          key={index}
          parts={parts}
          groupRef={(group) => {
            groups.current[index] = group;
          }}
        />
      ))}
    </>
  );
}
