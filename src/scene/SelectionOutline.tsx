import { Outlines } from '@react-three/drei';
import { useMemo } from 'react';
import { DoubleSide, Path, Shape, ShapeGeometry } from 'three';
import { catalogItem } from '@/domain/catalog';
import type { PieceType } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';
import { pieceParts } from './pieceGeometry';
import { pieceCentre } from './PieceNode';

const OUTLINE_COLOR = '#2f5f7a';
const RING_WIDTH = 0.07;

function roundedSquare<T extends Shape | Path>(path: T, half: number, radius: number) {
  const edge = half - radius;
  path.moveTo(-edge, -half);
  path.lineTo(edge, -half);
  path.absarc(edge, -edge, radius, -Math.PI / 2, 0, false);
  path.lineTo(half, edge);
  path.absarc(edge, edge, radius, 0, Math.PI / 2, false);
  path.lineTo(-edge, half);
  path.absarc(-edge, edge, radius, Math.PI / 2, Math.PI, false);
  path.lineTo(-half, -edge);
  path.absarc(-edge, -edge, radius, Math.PI, Math.PI * 1.5, false);
  return path;
}

// Stays readable on low, flat pieces, where a rim around the model alone barely shows.
function FootprintRing({ type }: { type: PieceType }) {
  const geometry = useMemo(() => {
    const half = catalogItem(type).footprint / 2 + 0.02;
    const shape = roundedSquare(new Shape(), half, 0.1);
    shape.holes.push(roundedSquare(new Path(), half - RING_WIDTH, 0.06));
    return new ShapeGeometry(shape, 6).rotateX(-Math.PI / 2);
  }, [type]);

  return (
    <mesh geometry={geometry} position-y={0.02} renderOrder={4}>
      <meshBasicMaterial color={OUTLINE_COLOR} side={DoubleSide} />
    </mesh>
  );
}

export function SelectionOutline() {
  const piece = useGameStore((state) => {
    if (state.drag || state.mode === 'play') return null;
    return state.pieces.find((candidate) => candidate.id === state.selectedPieceId) ?? null;
  });
  if (!piece) return null;

  const { x, z } = pieceCentre(piece);
  return (
    <group position={[x, 0, z]}>
      <FootprintRing type={piece.type} />
      <group rotation-y={-piece.rotation * (Math.PI / 180)}>
        {pieceParts(piece.type).map((part) => (
          <mesh key={part.family} geometry={part.geometry}>
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
            <Outlines thickness={0.05} color={OUTLINE_COLOR} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
