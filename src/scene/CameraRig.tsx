import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { Box3, Vector3 } from 'three';
import {
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_POLAR_DEG,
  CAMERA_MIN_DISTANCE,
  CAMERA_MIN_POLAR_DEG,
  defaultCameraPosition,
} from '@/domain/camera';
import { GRID_SIZE } from '@/domain/grid';
import { setResetCameraHandler } from '@/interaction/boardView';

const { ACTION } = CameraControlsImpl;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const half = GRID_SIZE / 2;

export function CameraRig() {
  const controls = useRef<CameraControlsImpl>(null);

  useEffect(() => {
    const instance = controls.current;
    if (!instance) return;
    // The target stays on the ground, inside the grid.
    instance.setBoundary(new Box3(new Vector3(-half, 0, -half), new Vector3(half, 0, half)));
    void instance.setLookAt(...defaultCameraPosition(), 0, 0, 0, false);
    instance.saveState();
    setResetCameraHandler(() => void instance.reset(true));
    return () => setResetCameraHandler(null);
  }, []);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minPolarAngle={toRadians(CAMERA_MIN_POLAR_DEG)}
      maxPolarAngle={toRadians(CAMERA_MAX_POLAR_DEG)}
      minDistance={CAMERA_MIN_DISTANCE}
      maxDistance={CAMERA_MAX_DISTANCE}
      mouseButtons={{ left: ACTION.NONE, middle: ACTION.TRUCK, right: ACTION.ROTATE, wheel: ACTION.DOLLY }}
    />
  );
}
