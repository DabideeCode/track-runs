import { animated, useSpring } from '@react-spring/three';
import { useEffect, useRef, type ComponentType } from 'react';
import { catalogItem } from '@/domain/catalog';
import { tileToWorld } from '@/domain/grid';
import type { Piece } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';
import { ContactShadow } from './ContactShadows';

export const LIFT_HEIGHT = 0.3;
const HOVER_HEIGHT = 0.05;
const ROTATE_MS = 150;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function pieceCentre(piece: Pick<Piece, 'type' | 'gridX' | 'gridZ'>) {
  const { x, z } = tileToWorld(piece.gridX, piece.gridZ);
  const shift = (catalogItem(piece.type).footprint - 1) / 2;
  return { x: x + shift, z: z + shift };
}

interface PieceNodeProps {
  piece: Piece;
  parts: ComponentType[];
  animateEntrance: boolean;
}

export function PieceNode({ piece, parts, animateEntrance }: PieceNodeProps) {
  const hidden = useGameStore(
    (state) => state.drag?.pieceId === piece.id || state.rejected?.pieceId === piece.id,
  );
  const hovered = useGameStore((state) => state.hoverPieceId === piece.id && state.mode === 'build' && !state.selectedTool);

  const centre = pieceCentre(piece);
  const previousRotation = useRef(piece.rotation);
  const angle = useRef(-piece.rotation * (Math.PI / 180));
  const wasHidden = useRef(hidden);

  const [springs, api] = useSpring(() => ({
    x: centre.x,
    z: centre.z,
    rotation: angle.current,
    lift: animateEntrance ? LIFT_HEIGHT : 0,
  }));

  useEffect(() => {
    if (animateEntrance) {
      // Reaches the ground in about 80 ms so the place sound lands on contact, then settles.
      void api.start({ lift: 0, config: { tension: 900, friction: 24 } });
    }
    // Runs once for the entrance only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const returning = wasHidden.current && !hidden;
    wasHidden.current = hidden;
    void api.start({
      x: centre.x,
      z: centre.z,
      immediate: returning,
      config: { tension: 320, friction: 30 },
    });
    if (returning) {
      api.set({ lift: LIFT_HEIGHT });
      void api.start({ lift: 0, config: { tension: 900, friction: 24 } });
    }
  }, [api, centre.x, centre.z, hidden]);

  useEffect(() => {
    const turn = (piece.rotation - previousRotation.current + 360) % 360;
    previousRotation.current = piece.rotation;
    if (turn === 0) return;
    angle.current -= turn * (Math.PI / 180);
    void api.start({
      rotation: angle.current,
      config: { duration: ROTATE_MS * Math.max(1, turn / 90), easing: easeOutCubic },
    });
  }, [api, piece.rotation]);

  useEffect(() => {
    if (!hidden) {
      void api.start({ lift: hovered ? HOVER_HEIGHT : 0, config: { tension: 500, friction: 30 } });
    }
  }, [api, hidden, hovered]);

  return (
    <animated.group position-x={springs.x} position-z={springs.z} scale={hidden ? 0 : 1}>
      <ContactShadow type={piece.type} />
      <animated.group position-y={springs.lift} rotation-y={springs.rotation}>
        {parts.map((Part, index) => (
          <Part key={index} />
        ))}
      </animated.group>
    </animated.group>
  );
}
