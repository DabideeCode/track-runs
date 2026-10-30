/**
 * Camera controller for the playfield (task 14.8; design DD-6 and section 9.4;
 * Requirements 9.1 to 9.11).
 *
 * - drei `<CameraControls>` with left button off (reserved for pieces), right =
 *   orbit, middle = pan, wheel = zoom, touch off; polar 20° to 80°, distance
 *   4 to 30, and the target held inside the grid (`cameraConfig.ts`).
 * - On mount the controls, camera, renderer and scene are registered with the
 *   `SceneBridge`, and the default pose is applied without a transition
 *   (Requirement 9.9). The bridge's `resetView()` animates back to it (9.8).
 * - The browser context menu is suppressed on the canvas (Requirement 9.10).
 * - Nothing here reads or writes the store, so camera moves never change
 *   `isDirty` (Requirement 9.11).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import { PerspectiveCamera } from 'three';
import { CAMERA_FOV } from '@/runtime/cameraPose';
import { applyCameraControlsConfig, cameraControlsConfig } from './cameraConfig';
import { useSceneBridge } from './context';

export function CameraRig() {
  const bridge = useSceneBridge();
  const controlsRef = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  // Layout effect: runs after drei attaches the ref and before the next frame,
  // so the first rendered frame already shows the default pose.
  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    applyCameraControlsConfig(controls, cameraControlsConfig());
    if (camera instanceof PerspectiveCamera && camera.fov !== CAMERA_FOV) {
      camera.fov = CAMERA_FOV;
      camera.updateProjectionMatrix();
    }
    const unregister = bridge.register({ controls, camera, gl, scene });
    bridge.applyDefaultPose(false);
    return unregister;
  }, [bridge, camera, gl, scene]);

  useEffect(() => {
    const el = gl.domElement;
    const preventMenu = (e: Event) => e.preventDefault();
    el.addEventListener('contextmenu', preventMenu);
    return () => el.removeEventListener('contextmenu', preventMenu);
  }, [gl]);

  return <CameraControls ref={controlsRef} makeDefault />;
}
