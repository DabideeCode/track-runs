/**
 * The train in the 3D scene: a locomotive and two carriages (task 14.13;
 * design.md section 7.6, DD-3, D-40; Requirements 17.2, 17.9, 19.1, 19.3 to
 * 19.7, 19.10).
 *
 * - The vehicles are built from `trainGeometry.ts` parts with the shared
 *   materials of the current quality level.
 * - Every frame, `useFrame` advances the train with `trainRuntime.tick(dt)`
 *   in Play mode and writes `trainRuntime.poses()` straight into the group
 *   transforms. No React state changes per frame.
 * - Poses are only re-read when `trainRuntime.getVersion()` changes: every
 *   tick in Play mode, and in Build mode only when the parked train is
 *   re-derived (station moved, rotated, undo, redo, start facing flipped),
 *   so the parked train follows the station (Requirement 17.2).
 * - Without a station `poses()` is null and the root group is hidden
 *   (Requirement 17.9). The hiding is done in `useFrame`, not with React state.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { VehicleKind } from '@/domain/train';
import { getMaterialLibrary } from '@/scene/models/materials';
import { VEHICLES, trainPartsFor } from '@/scene/models/trainGeometry';
import { useAppStore, useAppStoreApi } from '@/store/useAppStore';
import { useTrainRuntime } from '@/scene/context';
import { applyTrainPoses, frameDelta } from './trainPose';

type VehicleRefs = Record<VehicleKind, Group | null>;

export function TrainView() {
  const runtime = useTrainRuntime();
  const store = useAppStoreApi();
  const lowQuality = useAppStore((s) => s.lowQuality);
  const library = getMaterialLibrary(lowQuality);

  const rootRef = useRef<Group>(null);
  const vehicleRefs = useRef<VehicleRefs>({ locomotive: null, carriage1: null, carriage2: null });
  const lastVersion = useRef<number | null>(null);

  useFrame((_, delta) => {
    if (store.getState().mode === 'play') runtime.tick(frameDelta(delta));
    const root = rootRef.current;
    if (!root) return;
    const version = runtime.getVersion();
    if (version === lastVersion.current) return;
    lastVersion.current = version;
    applyTrainPoses(root, vehicleRefs.current, runtime.poses());
  });

  return (
    // Hidden until the first frame writes the poses. `dispose={null}` keeps
    // R3F from disposing the shared, cached geometries and materials.
    <group ref={rootRef} name="train" visible={false} dispose={null}>
      {VEHICLES.map((kind) => (
        <group
          key={kind}
          name={kind}
          ref={(g) => {
            vehicleRefs.current[kind] = g;
          }}
        >
          {trainPartsFor(kind).map((part) => (
            <mesh
              key={part.name}
              name={part.name}
              geometry={part.geometry}
              material={part.material(library)}
              position={[part.position[0], part.position[1], part.position[2]]}
              rotation={[part.rotation[0], part.rotation[1], part.rotation[2]]}
              scale={[part.scale[0], part.scale[1], part.scale[2]]}
              castShadow={part.castShadow}
              receiveShadow={part.receiveShadow}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
