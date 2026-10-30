import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { Box3, MathUtils, Vector3 } from 'three';
import { GRID_SIZE } from '@/domain/grid';
import { refreshPointerTargets } from '@/interaction/dragController';
import { useGameStore } from '@/store/gameStore';

const { ACTION } = CameraControlsImpl;
const HALF = GRID_SIZE / 2;
const MOUSE_BUTTONS = {
  left: ACTION.NONE,
  middle: ACTION.TRUCK,
  right: ACTION.ROTATE,
  wheel: ACTION.DOLLY,
};
const TARGET_BOUNDS = new Box3(new Vector3(-HALF, 0, -HALF), new Vector3(HALF, 0, HALF));

export const DEFAULT_CAMERA: [number, number, number] = [0, 16, 19];

export function CameraRig() {
  const controls = useRef<CameraControlsImpl>(null);
  const resetToken = useGameStore((state) => state.cameraResetToken);

  useEffect(() => {
    controls.current?.setBoundary(TARGET_BOUNDS);
  }, []);

  useEffect(() => {
    if (resetToken > 0) void controls.current?.setLookAt(...DEFAULT_CAMERA, 0, 0, 0, true);
  }, [resetToken]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      mouseButtons={MOUSE_BUTTONS}
      minPolarAngle={MathUtils.degToRad(20)}
      maxPolarAngle={MathUtils.degToRad(80)}
      minDistance={4}
      maxDistance={30}
      smoothTime={0.15}
      draggingSmoothTime={0.08}
      onChange={refreshPointerTargets}
    />
  );
}
