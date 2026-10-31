import { Outlines } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { CATALOGUE } from '@/domain/catalogue';
import { footprintCentre } from '@/domain/grid';
import { validatePlace } from '@/domain/rules';
import type { PieceType, Rotation } from '@/domain/types';
import { clearFx } from '@/store/commands';
import { useGameStore, type AppState } from '@/store/gameStore';
import { activeEntries, type ActiveEntry } from './activeList';
import { CONTACT_HEIGHT, CONTACT_SPREAD } from './ContactShadowQuads';
import { getPieceParts } from './geometry';
import { getContactShadowMaterial, getMaterial, ghostInvalid, ghostValid } from './geometry/materials';
import { createMotion, LIFT_HEIGHT, stepMotion, type MotionGoal, type MotionKind } from './pieceMotion';

const OUTLINE_COLOR = '#d6912f';
const toYaw = (rotation: Rotation) => (-rotation * Math.PI) / 180;

interface ResolvedGoal extends MotionGoal {
  fxKey: string | null;
}

function pieceGoal(entry: ActiveEntry, state: AppState): ResolvedGoal | null {
  const fx = entry.fxKey ? state.fx.find((item) => item.key === entry.fxKey) : undefined;
  if (fx) {
    const home = footprintCentre(fx.piece.type, fx.piece.gridX, fx.piece.gridZ);
    const yaw = toYaw(fx.piece.rotation);
    if (fx.kind === 'rejectBoard') {
      const from = fx.from ?? home;
      return { kind: 'rejectBoard', x: from.x, z: from.z, yaw, returnX: home.x, returnZ: home.z, fxKey: fx.key };
    }
    return { kind: fx.kind satisfies MotionKind, x: home.x, z: home.z, yaw, fxKey: fx.key };
  }
  const piece = state.pieces.find((candidate) => candidate.id === entry.pieceId);
  if (!piece) return null;
  const drag = state.drag?.pieceId === piece.id ? state.drag : null;
  const tile = drag?.target ?? { x: piece.gridX, z: piece.gridZ };
  const centre = footprintCentre(piece.type, tile.x, tile.z);
  const yaw = toYaw(drag?.rotation ?? piece.rotation);
  const kind: MotionKind = drag ? 'drag' : state.hoveredPieceId === piece.id ? 'hover' : 'rest';
  return { kind, x: centre.x, z: centre.z, yaw, fxKey: null };
}

function initialPose(entry: ActiveEntry, state: AppState) {
  const fx = entry.fxKey ? state.fx.find((item) => item.key === entry.fxKey) : undefined;
  const piece = fx?.piece ?? state.pieces.find((candidate) => candidate.id === entry.pieceId);
  if (!piece) return createMotion(0, 0, 0);
  const home = footprintCentre(piece.type, piece.gridX, piece.gridZ);
  if (fx?.kind === 'rejectBoard' && fx.from) return createMotion(fx.from.x, LIFT_HEIGHT, fx.from.z, toYaw(fx.from.rotation));
  if (fx?.from) return createMotion(fx.from.x, 0, fx.from.z, toYaw(fx.from.rotation));
  const startsLifted = fx?.kind === 'drop' || fx?.kind === 'rejectNew';
  return createMotion(home.x, startsLifted ? LIFT_HEIGHT : 0, home.z, toYaw(piece.rotation));
}

function PieceMeshes({
  type,
  fades,
  selected,
  meshRef,
}: {
  type: PieceType;
  fades: boolean;
  selected: boolean;
  meshRef?: (index: number, mesh: Mesh | null) => void;
}) {
  const parts = getPieceParts(type);
  const materials = useMemo(
    () =>
      parts.map((part) => {
        const shared = getMaterial(part.material);
        if (!fades) return shared;
        const faded = shared.clone();
        faded.transparent = true;
        return faded;
      }),
    [parts, fades],
  );
  return parts.map((part, index) => (
    <mesh
      key={part.material}
      ref={(mesh) => meshRef?.(index, mesh)}
      geometry={part.geometry}
      material={materials[index]}
      castShadow
      receiveShadow
    >
      {selected && <Outlines thickness={0.018} color={OUTLINE_COLOR} />}
    </mesh>
  ));
}

function ContactQuad({ quadRef, type }: { quadRef: React.Ref<Mesh>; type: PieceType }) {
  const lowQuality = useGameStore((state) => state.lowQuality);
  const material = useMemo(() => getContactShadowMaterial().clone(), []);
  const [width, depth] = CATALOGUE[type].footprint;
  return (
    <mesh ref={quadRef} rotation-x={-Math.PI / 2} material={material} visible={!lowQuality} renderOrder={1}>
      <planeGeometry args={[width * CONTACT_SPREAD, depth * CONTACT_SPREAD]} />
    </mesh>
  );
}

function ActivePiece({ entry }: { entry: ActiveEntry }) {
  const group = useRef<Group>(null);
  const quad = useRef<Mesh>(null);
  const meshes = useRef<Array<Mesh | null>>([]);
  const motion = useRef(createMotion(0, 0, 0));
  const started = useRef(false);
  const selected = useGameStore((state) => state.selectedPieceId === entry.pieceId && !entry.fades);

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    if (!started.current) {
      motion.current = initialPose(entry, state);
      started.current = true;
    }
    const goal = pieceGoal(entry, state);
    if (!goal || !group.current) return;
    const pose = motion.current;
    const finished = stepMotion(pose, goal, Math.min(delta, 0.25));

    group.current.position.set(pose.x + pose.shake, pose.y, pose.z);
    group.current.rotation.set(pose.tiltX, pose.yaw, pose.tiltZ);
    group.current.scale.setScalar(Math.max(pose.scale, 0.001));
    if (entry.fades) {
      for (const mesh of meshes.current) {
        if (mesh) (mesh.material as MeshStandardMaterial).opacity = pose.opacity;
      }
    }
    if (quad.current) {
      const spread = 1 + pose.y * 1.4;
      quad.current.position.set(pose.x, CONTACT_HEIGHT, pose.z);
      quad.current.scale.set(spread, spread, 1);
      (quad.current.material as Material & { opacity: number }).opacity = Math.max(0, (1 - pose.y * 1.6) * pose.opacity);
    }
    if (finished && goal.fxKey) clearFx(goal.fxKey);
  });

  return (
    <>
      <group ref={group}>
        <PieceMeshes
          type={entry.type}
          fades={entry.fades}
          selected={selected}
          meshRef={(index, mesh) => {
            meshes.current[index] = mesh;
          }}
        />
      </group>
      <ContactQuad quadRef={quad} type={entry.type} />
    </>
  );
}

/** The translucent preview of a piece that has not been placed yet. */
function Ghost({ type }: { type: PieceType }) {
  const group = useRef<Group>(null);
  const quad = useRef<Mesh>(null);
  const motion = useRef<ReturnType<typeof createMotion> | null>(null);
  const parts = getPieceParts(type);

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    const tile = state.drag ? state.drag.target : state.hoverTile;
    const rotation = state.drag ? state.drag.rotation : state.ghostRotation;
    if (!group.current) return;
    group.current.visible = tile !== null;
    if (quad.current) quad.current.visible = tile !== null && !state.lowQuality;
    if (!tile) {
      motion.current = null;
      return;
    }
    const centre = footprintCentre(type, tile.x, tile.z);
    motion.current ??= createMotion(centre.x, 0, centre.z, toYaw(rotation));
    const pose = motion.current;
    const goal: MotionGoal = { kind: state.drag ? 'drag' : 'rest', x: centre.x, z: centre.z, yaw: toYaw(rotation) };
    stepMotion(pose, goal, Math.min(delta, 0.25));
    group.current.position.set(pose.x, pose.y, pose.z);
    group.current.rotation.set(pose.tiltX, pose.yaw, pose.tiltZ);

    const valid = state.drag
      ? state.drag.valid
      : isToolTileValid(state, type, tile.x, tile.z);
    const material = valid ? ghostValid : ghostInvalid;
    group.current.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh) mesh.material = material;
    });
    if (quad.current) {
      const spread = 1 + pose.y * 1.4;
      quad.current.position.set(pose.x, CONTACT_HEIGHT, pose.z);
      quad.current.scale.set(spread, spread, 1);
      (quad.current.material as MeshBasicMaterial).opacity = 1 - pose.y * 1.6;
    }
  });

  return (
    <>
      <group ref={group} visible={false}>
        {parts.map((part) => (
          <mesh key={part.material} geometry={part.geometry} material={ghostValid} />
        ))}
      </group>
      <ContactQuad quadRef={quad} type={type} />
    </>
  );
}

function isToolTileValid(state: AppState, type: PieceType, x: number, z: number): boolean {
  return validatePlace(state.pieces, state.mode, type, x, z) === null;
}

export function ActivePieces() {
  const entriesKey = useGameStore((state) => JSON.stringify(activeEntries(state)));
  const entries = useMemo(() => JSON.parse(entriesKey) as ActiveEntry[], [entriesKey]);
  const ghostType = useGameStore((state) =>
    state.drag ? (state.drag.source === 'palette' ? state.drag.pieceType : null) : state.selectedTool,
  );

  return (
    <>
      {entries.map((entry) => (
        <ActivePiece key={entry.key} entry={entry} />
      ))}
      {ghostType && <Ghost key={ghostType} type={ghostType} />}
    </>
  );
}
