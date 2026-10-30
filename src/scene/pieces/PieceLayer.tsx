/**
 * Instanced drawing of every static (non-active) piece (task 14.11; design.md
 * DD-5, sections 7.4 and 8; Requirements 14.1, 28.17, 28.19, 31.4, 31.7,
 * 31.9, 31.10, 32.5).
 *
 * - drei `<Merged>` turns each shared part mesh (`buildPartMeshes`) into one
 *   instanced mesh. Two nested `<Merged>` sets separate parts that cast
 *   shadows from parts that only receive them. Every piece is an
 *   `animated.group` holding one instance per part, so instances inherit the
 *   group's transform and each piece animates on its own.
 * - Rest pose: footprint centre and `rotation.y = −rotation × π / 180`
 *   (`pieceRestTransform`). Every tween ends exactly there.
 * - Hover lift: +0.05 tiles over 120 ms, ease-out, while the pointer is over
 *   the piece in Build mode and no drag is active (Requirement 31.9).
 * - Drop: a piece that newly appears in `pieces` (palette drop, tool click,
 *   hook place, undo of a delete) falls from the lifted height with the
 *   80 + 160 ms fall and bounce of `dropHeight` (Requirement 31.4). Pieces
 *   present when the layer mounts, or when a diorama opens, do not animate.
 * - A static piece that moves (hook move, undo or redo of a move) slides to
 *   the new tile over the drop duration with the bounce only, and a static
 *   piece that rotates by one clockwise step turns over 150 ms
 *   (`rotationTargetFor`). Other rotation changes (undo of a rotate) jump,
 *   which Requirement 31.11 allows.
 * - Active pieces (selected or board-dragged) are left out; `ActivePiece`
 *   (task 14.12) draws them, using the same `isActivePiece` rule.
 *
 * Springs run on react-spring's frame loop and write to the Three.js objects
 * directly, so no React state changes per frame.
 */
import { memo, useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import { Merged, type InstanceProps } from '@react-three/drei';
import { animated, to, useSpring } from '@react-spring/three';
import type { Piece } from '@/domain/types';
import { getMaterialLibrary } from '@/scene/models/materials';
import {
  DROP_DURATION,
  DROP_FALL_DURATION,
  HOVER_DURATION,
  HOVER_LIFT,
  ROTATE_DURATION,
  degToRad,
  dropHeight,
  easeOutCubic,
  rotationTargetFor,
} from '@/scene/animation/tactile';
import { useAppStoreShallow } from '@/store/useAppStore';
import { buildPartMeshes, type TypePart } from './instancing';
import { MAX_PIECES, isHoverLifted, newlyAddedIds, pieceRestTransform, staticPieces } from './pieceLayout';

type InstanceMap = Record<string, FC<InstanceProps>>;
type Vec3 = [number, number, number];

const linear = (t: number): number => t;
const ms = (seconds: number): number => seconds * 1000;

/** True when both maps hold the same components under the same keys. */
function sameInstances(a: InstanceMap, b: InstanceMap): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

interface StaticPieceProps {
  piece: Piece;
  parts: readonly TypePart[];
  instances: InstanceMap;
  hovered: boolean;
  appear: boolean;
  onAppeared: (id: string) => void;
}

const StaticPiece = memo(function StaticPiece({ piece, parts, instances, hovered, appear, onAppeared }: StaticPieceProps) {
  const rest = pieceRestTransform(piece);
  const yawTarget = useRef(rest.yawDeg);
  const anchor = useRef({ x: rest.x, z: rest.z });
  const [spring, api] = useSpring(
    () => ({ x: rest.x, z: rest.z, yaw: rest.yawDeg, hover: 0, drop: appear ? 0 : DROP_DURATION }),
    [],
  );

  // Drop on first appearance.
  useEffect(() => {
    if (!appear) return;
    onAppeared(piece.id);
    void api.start({
      from: { drop: 0 },
      to: { drop: DROP_DURATION },
      config: { duration: ms(DROP_DURATION), easing: linear },
    });
    // Mount only: `appear` is read once.
  }, []);

  // Slide and bounce when a static piece moves to another tile.
  useEffect(() => {
    const prev = anchor.current;
    if (prev.x === rest.x && prev.z === rest.z) return;
    anchor.current = { x: rest.x, z: rest.z };
    void api.start({ x: rest.x, z: rest.z, config: { duration: ms(DROP_DURATION), easing: easeOutCubic } });
    void api.start({
      from: { drop: DROP_FALL_DURATION },
      to: { drop: DROP_DURATION },
      config: { duration: ms(DROP_DURATION - DROP_FALL_DURATION), easing: linear },
    });
  }, [api, rest.x, rest.z]);

  // Clockwise 90° turn, or a jump for any other rotation change.
  useEffect(() => {
    const { target, animate } = rotationTargetFor(yawTarget.current, piece.rotation);
    if (target === yawTarget.current) return;
    yawTarget.current = target;
    if (animate) void api.start({ yaw: target, config: { duration: ms(ROTATE_DURATION), easing: easeOutCubic } });
    else void api.start({ yaw: target, immediate: true });
  }, [api, piece.rotation]);

  // Hover lift.
  useEffect(() => {
    void api.start({ hover: hovered ? HOVER_LIFT : 0, config: { duration: ms(HOVER_DURATION), easing: easeOutCubic } });
  }, [api, hovered]);

  const y = useMemo(() => to([spring.drop, spring.hover], (t: number, h: number) => dropHeight(t) + h), [spring]);
  const yaw = useMemo(() => spring.yaw.to(degToRad), [spring]);

  return (
    <animated.group position-x={spring.x} position-y={y} position-z={spring.z} rotation-y={yaw} name={`piece:${piece.id}`}>
      {parts.map(({ key, part }) => {
        const Instance = instances[key];
        return Instance ? (
          <Instance
            key={part.name}
            position={[...part.position] as Vec3}
            rotation={[...part.rotation] as Vec3}
            scale={[...part.scale] as Vec3}
          />
        ) : null;
      })}
    </animated.group>
  );
});

export function PieceLayer() {
  const { pieces, selectedPieceId, drag, mode, hoverPieceId, lowQuality, historySize } = useAppStoreShallow((s) => ({
    pieces: s.pieces,
    selectedPieceId: s.selectedPieceId,
    drag: s.drag,
    mode: s.mode,
    hoverPieceId: s.hoverPieceId,
    lowQuality: s.lowQuality,
    historySize: s.history.past.length + s.history.future.length,
  }));

  const meshes = useMemo(() => buildPartMeshes(getMaterialLibrary(lowQuality)), [lowQuality]);
  const shown = useMemo(() => staticPieces(pieces, { selectedPieceId, drag }), [pieces, selectedPieceId, drag]);

  // Pieces new since the previous `pieces` array play the drop once. A change
  // with an empty history (opening or creating a diorama) never animates.
  const previousIds = useRef<Set<string> | null>(null);
  const appeared = useRef(new Set<string>());
  // `historySize` is read together with `pieces`; recomputing only when
  // `pieces` changes keeps the set stable across hover and selection renders.
  const added = useMemo(
    () => (historySize === 0 ? new Set<string>() : newlyAddedIds(previousIds.current, pieces)),
    [pieces],
  );
  useEffect(() => {
    const ids = new Set(pieces.map((p) => p.id));
    previousIds.current = ids;
    for (const id of appeared.current) if (!ids.has(id)) appeared.current.delete(id);
  }, [pieces]);
  const onAppeared = useCallback((id: string) => {
    appeared.current.add(id);
  }, []);

  const hover = { mode, drag, hoverPieceId };

  // Merged builds a new map object on every render, but the instance
  // components inside it are stable. Reusing the previous map keeps the
  // memoised pieces from re-rendering.
  const instancesRef = useRef<InstanceMap>({});
  const stableInstances = (next: InstanceMap): InstanceMap => {
    if (!sameInstances(instancesRef.current, next)) instancesRef.current = next;
    return instancesRef.current;
  };

  return (
    <Merged meshes={meshes.casters} limit={MAX_PIECES} castShadow={!lowQuality} receiveShadow frustumCulled={false}>
      {(casters: InstanceMap) => (
        <Merged meshes={meshes.receivers} limit={MAX_PIECES} receiveShadow frustumCulled={false}>
          {(receivers: InstanceMap) => {
            const instances = stableInstances({ ...casters, ...receivers });
            return shown.map((piece) => (
              <StaticPiece
                key={piece.id}
                piece={piece}
                parts={meshes.byType[piece.type]}
                instances={instances}
                hovered={isHoverLifted(piece.id, hover)}
                appear={added.has(piece.id) && !appeared.current.has(piece.id)}
                onAppeared={onAppeared}
              />
            ));
          }}
        </Merged>
      )}
    </Merged>
  );
}
