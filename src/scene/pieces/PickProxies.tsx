/**
 * Invisible hit boxes for picking placed pieces (task 14.11; design.md
 * sections 7.4 and 9.2; Requirement 31.9).
 *
 * One instanced mesh holds a unit box per piece, scaled to the piece's
 * footprint and model height (`pickProxyMatrix`). Its material has
 * `visible: false`, so the boxes are never drawn but can still be raycast.
 * The proxies stay at each piece's rest pose (the 0.05 hover lift does not
 * matter for picking) and include active pieces, so a selected piece can be
 * pressed and dragged.
 *
 * The component registers a picker with the drag controller through
 * `setPickPiece`. The controller calls it with client coordinates; the picker
 * turns them into normalised device coordinates on the canvas and returns the
 * nearest piece id. Hover comes back through the store (`hoverPieceId`, set by
 * the controller), and this component sets the canvas cursor from it: a
 * pointer over a piece in Build mode with no drag, the default otherwise.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, type InstancedMesh } from 'three';
import type { PickPiece } from '@/input/DragController';
import { clientToNdc } from '@/runtime/SceneBridge';
import { useAppStore } from '@/store/useAppStore';
import { pickAtNdc, pickProxyResources, writePickProxies } from './instancing';
import { MAX_PIECES, cursorFor } from './pieceLayout';

/** The part of the drag controller the proxies use (`DragController` satisfies it). */
export interface PickTarget {
  setPickPiece(pick: PickPiece | null): void;
}

export interface PickProxiesProps {
  /** Receives the picker on mount and null on unmount. */
  controller: PickTarget | null;
}

export function PickProxies({ controller }: PickProxiesProps) {
  const pieces = useAppStore((s) => s.pieces);
  const cursor = useAppStore(cursorFor);
  const gl = useThree((s) => s.gl);
  const getThree = useThree((s) => s.get);
  const meshRef = useRef<InstancedMesh>(null);
  const idsRef = useRef<string[]>([]);
  const { geometry, material } = pickProxyResources();

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    writePickProxies(mesh, pieces);
    idsRef.current = pieces.map((p) => p.id);
  }, [pieces]);

  useEffect(() => {
    if (!controller) return;
    const raycaster = new Raycaster();
    const pick: PickPiece = (clientX, clientY) => {
      const mesh = meshRef.current;
      if (!mesh) return null;
      const ndc = clientToNdc(clientX, clientY, gl.domElement.getBoundingClientRect());
      if (!ndc) return null;
      return pickAtNdc(raycaster, getThree().camera, ndc, mesh, idsRef.current);
    };
    controller.setPickPiece(pick);
    return () => controller.setPickPiece(null);
  }, [controller, gl, getThree]);

  useEffect(() => {
    gl.domElement.style.cursor = cursor;
  }, [gl, cursor]);
  useEffect(
    () => () => {
      gl.domElement.style.cursor = '';
    },
    [gl],
  );

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_PIECES]}
      name="pickProxies"
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
