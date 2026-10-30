import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { buildRoute, poseAt, type Route } from '@/domain/route';
import { CARRIAGE_OFFSETS } from '@/domain/trainSim';
import { useGameStore } from '@/store/gameStore';
import { runningTrain } from '@/store/trainRuntime';
import { COLORS, familyMaterials } from './materials';
import { carriageParts, locomotiveParts, type ModelPart } from './pieceGeometry';

const TRACK_TOP = 0.09;
const PARK_RATE = 13;
const VEHICLE_OFFSETS = [0, ...CARRIAGE_OFFSETS];

function Vehicle({ parts, groupRef }: { parts: ModelPart[]; groupRef: (node: Group | null) => void }) {
  const materials = familyMaterials();
  return (
    <group ref={groupRef} position-y={TRACK_TOP}>
      {parts.map((part) => (
        <mesh key={part.family} geometry={part.geometry} material={materials[part.family]} castShadow />
      ))}
    </group>
  );
}

function shortestTurn(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function placeVehicle(vehicle: Group, route: Route, s: number, blend: number) {
  const pose = poseAt(route, s);
  const yaw = Math.atan2(-pose.tangentX, -pose.tangentZ);
  vehicle.position.x += (pose.x - vehicle.position.x) * blend;
  vehicle.position.z += (pose.z - vehicle.position.z) * blend;
  vehicle.rotation.y += shortestTurn(vehicle.rotation.y, yaw) * blend;
}

export function TrainView() {
  const pieces = useGameStore((state) => state.pieces);
  const startFacing = useGameStore((state) => state.startFacing);
  const parkedRoute = useMemo(() => buildRoute(pieces, startFacing), [pieces, startFacing]);
  const vehicles = useRef<Array<Group | null>>([]);
  const wasVisible = useRef(false);
  const root = useRef<Group>(null);
  const models = useMemo(
    () => [locomotiveParts(), carriageParts(COLORS.sage), carriageParts(COLORS.mustard)],
    [],
  );

  useFrame((_, delta) => {
    const running = runningTrain();
    const route = running?.route ?? parkedRoute;
    if (root.current) root.current.visible = route !== null;
    if (!route) {
      wasVisible.current = false;
      return;
    }
    const s = running?.sim.s ?? 0;
    const blend = running && wasVisible.current ? 1 : wasVisible.current ? 1 - Math.exp(-PARK_RATE * delta) : 1;
    VEHICLE_OFFSETS.forEach((offset, index) => {
      const vehicle = vehicles.current[index];
      if (vehicle) placeVehicle(vehicle, route, s - offset, blend);
    });
    wasVisible.current = true;
  });

  return (
    <group ref={root} visible={false}>
      {models.map((parts, index) => (
        <Vehicle
          key={index}
          parts={parts}
          groupRef={(node) => {
            vehicles.current[index] = node;
          }}
        />
      ))}
    </group>
  );
}
