import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useGameStore, type ExitingPiece } from '@/store/gameStore';
import { familyMaterials } from './materials';
import { pieceParts } from './pieceGeometry';
import { pieceCentre } from './PieceNode';

const EXIT_SECONDS = 0.2;

function ExitingNode({ entry }: { entry: ExitingPiece }) {
  const group = useRef<Group>(null);
  const elapsed = useRef(0);
  const parts = useMemo(() => {
    const family = familyMaterials();
    return pieceParts(entry.piece.type).map((part) => {
      const material = family[part.family].clone();
      material.transparent = true;
      return { geometry: part.geometry, material };
    });
  }, [entry.piece.type]);
  const { x, z } = pieceCentre(entry.piece);

  useEffect(() => () => parts.forEach((part) => part.material.dispose()), [parts]);

  useFrame((_, delta) => {
    if (!group.current) return;
    elapsed.current += delta;
    const t = Math.min(1, elapsed.current / EXIT_SECONDS);
    const eased = t * t;
    group.current.position.y = eased * 0.35;
    group.current.scale.setScalar(1 - eased * 0.6);
    for (const part of parts) part.material.opacity = 1 - eased;
    if (t === 1) useGameStore.getState().clearExiting(entry.key);
  });

  return (
    <group ref={group} position={[x, 0, z]} rotation-y={-entry.piece.rotation * (Math.PI / 180)}>
      {parts.map((part, index) => (
        <mesh key={index} geometry={part.geometry} material={part.material} />
      ))}
    </group>
  );
}

export function ExitEffects() {
  const exiting = useGameStore((state) => state.exiting);
  return exiting.map((entry) => <ExitingNode key={entry.key} entry={entry} />);
}
