import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MeshStandardMaterial, type Group, type Mesh } from 'three';
import { validatePlacement } from '@/domain/rules';
import type { PieceType, Rotation } from '@/domain/types';
import { groundAt } from '@/interaction/pointerRay';
import { useGameStore } from '@/store/gameStore';
import { blobMaterial } from './materials';
import { blobSize } from './ContactShadows';
import { pieceParts } from './pieceGeometry';
import { LIFT_HEIGHT, pieceCentre } from './PieceNode';

const VALID_TINT = '#7fb878';
const INVALID_TINT = '#cf6a58';
const FOLLOW_RATE = 22;
const LIFT_RATE = 26;
const TILT_LIMIT = (8 * Math.PI) / 180;
const SHAKE_SECONDS = 0.2;
const SHAKE_DISTANCE = 0.09;
const ROTATE_RATE = 24;

const pointer = { x: 0, y: 0 };

function trackPointer(event: PointerEvent) {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
}

function useGhostMaterial() {
  return useMemo(
    () => new MeshStandardMaterial({ color: VALID_TINT, transparent: true, opacity: 0.72, roughness: 0.7 }),
    [],
  );
}

interface GhostTarget {
  type: PieceType;
  rotation: Rotation;
  x: number;
  z: number;
  height: number;
  valid: boolean;
  shadowed: boolean;
}

function currentTarget(): GhostTarget | null {
  const { drag, rejected, selectedTool, hoverTile, toolRotation, pieces, mode } = useGameStore.getState();
  if (drag) {
    const point = groundAt(pointer.x, pointer.y);
    const centre = drag.tile
      ? pieceCentre({ type: drag.type, gridX: drag.tile.x, gridZ: drag.tile.z })
      : point ?? { x: 0, z: 0 };
    return { type: drag.type, rotation: drag.rotation, ...centre, height: LIFT_HEIGHT, valid: drag.valid, shadowed: true };
  }
  if (rejected) {
    const tile = rejected.tile ?? rejected.origin;
    const centre = tile
      ? pieceCentre({ type: rejected.type, gridX: tile.x, gridZ: tile.z })
      : groundAt(pointer.x, pointer.y) ?? { x: 0, z: 0 };
    return { type: rejected.type, rotation: rejected.rotation, ...centre, height: LIFT_HEIGHT, valid: false, shadowed: true };
  }
  if (selectedTool && hoverTile && mode === 'build') {
    const valid = validatePlacement(pieces, {
      mode,
      type: selectedTool,
      gridX: hoverTile.x,
      gridZ: hoverTile.z,
    }) === null;
    const centre = pieceCentre({ type: selectedTool, gridX: hoverTile.x, gridZ: hoverTile.z });
    return { type: selectedTool, rotation: toolRotation, ...centre, height: 0.05, valid, shadowed: false };
  }
  return null;
}

export function DragGhost() {
  const material = useGhostMaterial();
  const group = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const [type, setType] = useState<PieceType | null>(null);
  const shown = useRef(false);
  const shakeLeft = useRef(0);
  const shakeKey = useRef<number | null>(null);
  const yaw = useRef(0);
  const lastRotation = useRef<Rotation>(0);

  useEffect(() => {
    window.addEventListener('pointermove', trackPointer);
    return () => window.removeEventListener('pointermove', trackPointer);
  }, []);

  const parts = useMemo(() => (type ? pieceParts(type) : []), [type]);

  useFrame((_, delta) => {
    const node = group.current;
    const pitch = tilt.current;
    if (!node || !pitch) return;

    const target = currentTarget();
    if (target?.type !== type) setType(target?.type ?? null);
    node.visible = target !== null;
    if (!target) {
      shown.current = false;
      return;
    }

    const { rejected, clearRejected } = useGameStore.getState();
    if (rejected && shakeKey.current !== rejected.key) {
      shakeKey.current = rejected.key;
      shakeLeft.current = SHAKE_SECONDS;
    }

    if (!shown.current) {
      shown.current = true;
      node.position.set(target.x, 0, target.z);
      lastRotation.current = target.rotation;
      yaw.current = -target.rotation * (Math.PI / 180);
      node.rotation.y = yaw.current;
    }

    const turn = (target.rotation - lastRotation.current + 360) % 360;
    if (turn !== 0) {
      lastRotation.current = target.rotation;
      yaw.current -= turn * (Math.PI / 180);
    }
    node.rotation.y += (yaw.current - node.rotation.y) * (1 - Math.exp(-ROTATE_RATE * delta));

    const follow = 1 - Math.exp(-FOLLOW_RATE * delta);
    const moveX = (target.x - node.position.x) * follow;
    const moveZ = (target.z - node.position.z) * follow;
    node.position.x += moveX;
    node.position.z += moveZ;
    node.position.y += (target.height - node.position.y) * (1 - Math.exp(-LIFT_RATE * delta));

    const speedScale = 0.5 / Math.max(delta, 1 / 240) / 60;
    const clampTilt = (value: number) => Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, value));
    const cos = Math.cos(node.rotation.y);
    const sin = Math.sin(node.rotation.y);
    const localX = moveX * cos - moveZ * sin;
    const localZ = moveX * sin + moveZ * cos;
    pitch.rotation.x += (clampTilt(localZ * speedScale) - pitch.rotation.x) * follow;
    pitch.rotation.z += (clampTilt(-localX * speedScale) - pitch.rotation.z) * follow;

    if (shakeLeft.current > 0) {
      shakeLeft.current -= delta;
      const swing = Math.sin((1 - shakeLeft.current / SHAKE_SECONDS) * Math.PI * 5);
      node.position.x += swing * SHAKE_DISTANCE * 0.4;
      if (shakeLeft.current <= 0 && rejected) clearRejected(rejected.key);
    }

    material.color.set(target.valid ? VALID_TINT : INVALID_TINT);
    if (shadow.current) {
      shadow.current.visible = target.shadowed;
      shadow.current.position.y = 0.014 - node.position.y;
      shadow.current.scale.setScalar(blobSize(target.type) * (1 + node.position.y * 1.1));
    }
  });

  return (
    <group ref={group} visible={false}>
      <group ref={tilt}>
        {parts.map((part) => (
          <mesh key={part.family} geometry={part.geometry} material={material} />
        ))}
      </group>
      <mesh ref={shadow} material={blobMaterial()} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}
