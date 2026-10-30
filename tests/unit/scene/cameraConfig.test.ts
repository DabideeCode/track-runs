// @vitest-environment jsdom
/**
 * Camera controls configuration (task 14.8; design DD-6, section 9.4;
 * Requirements 9.1 to 9.7, 9.9).
 *
 * The last block applies the config to a real camera-controls instance to check
 * that the library clamps polar angle, distance and target. The constructor
 * uses `DOMRect`, so this file runs in jsdom; no canvas or WebGL is needed.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import CameraControlsLib from 'camera-controls';
import { CAMERA_ACTION, applyCameraControlsConfig, cameraControlsConfig } from '@/scene/cameraConfig';
import { DEFAULT_POSITION, DEFAULT_TARGET } from '@/runtime/cameraPose';

const DEG = Math.PI / 180;

describe('cameraControlsConfig', () => {
  const config = cameraControlsConfig();

  it('mirrors the camera-controls ACTION values', () => {
    expect(CAMERA_ACTION.NONE).toBe(CameraControlsLib.ACTION.NONE);
    expect(CAMERA_ACTION.ROTATE).toBe(CameraControlsLib.ACTION.ROTATE);
    expect(CAMERA_ACTION.TRUCK).toBe(CameraControlsLib.ACTION.TRUCK);
    expect(CAMERA_ACTION.DOLLY).toBe(CameraControlsLib.ACTION.DOLLY);
  });

  it('maps left to none, right to rotate, middle to truck and wheel to dolly', () => {
    expect(config.mouseButtons).toEqual({
      left: CameraControlsLib.ACTION.NONE,
      right: CameraControlsLib.ACTION.ROTATE,
      middle: CameraControlsLib.ACTION.TRUCK,
      wheel: CameraControlsLib.ACTION.DOLLY,
    });
  });

  it('disables touch gestures', () => {
    expect(config.touches).toEqual({ one: 0, two: 0, three: 0 });
  });

  it('limits polar angle to 20° to 80° in radians and distance to 4 to 30', () => {
    expect(config.minPolarAngle).toBeCloseTo(20 * DEG, 12);
    expect(config.maxPolarAngle).toBeCloseTo(80 * DEG, 12);
    expect(config.minDistance).toBe(4);
    expect(config.maxDistance).toBe(30);
    expect(config.dollyToCursor).toBe(false);
  });

  it('bounds the target to the grid at ground height', () => {
    expect(config.boundary).toEqual({ min: { x: -8, y: 0, z: -8 }, max: { x: 8, y: 0, z: 8 } });
    expect(config.boundaryEnclosesCamera).toBe(false);
    expect(config.boundaryFriction).toBe(0);
  });

  it('returns a fresh object each call', () => {
    const a = cameraControlsConfig();
    a.boundary.min.x = 99;
    expect(cameraControlsConfig().boundary.min.x).toBe(-8);
  });
});

describe('applyCameraControlsConfig on camera-controls', () => {
  CameraControlsLib.install({ THREE });

  function makeControls() {
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 120);
    const controls = new CameraControlsLib(camera);
    applyCameraControlsConfig(controls);
    return controls;
  }

  it('sets the button mapping, limits and boundary box', () => {
    const controls = makeControls();
    expect(controls.mouseButtons.left).toBe(CameraControlsLib.ACTION.NONE);
    expect(controls.mouseButtons.right).toBe(CameraControlsLib.ACTION.ROTATE);
    expect(controls.mouseButtons.middle).toBe(CameraControlsLib.ACTION.TRUCK);
    expect(controls.mouseButtons.wheel).toBe(CameraControlsLib.ACTION.DOLLY);
    expect(controls.minPolarAngle).toBeCloseTo(20 * DEG, 12);
    expect(controls.maxPolarAngle).toBeCloseTo(80 * DEG, 12);
    expect(controls.minDistance).toBe(4);
    expect(controls.maxDistance).toBe(30);
    expect(controls.boundaryEnclosesCamera).toBe(false);
  });

  it('jumps to the default pose without a transition', () => {
    const controls = makeControls();
    const p = DEFAULT_POSITION;
    const t = DEFAULT_TARGET;
    void controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
    controls.update(0);
    expect(controls.distance).toBeCloseTo(18, 6);
    expect(controls.polarAngle).toBeCloseTo(50 * DEG, 6);
    expect(controls.azimuthAngle).toBeCloseTo(45 * DEG, 6);
    const target = controls.getTarget(new THREE.Vector3());
    expect(target.length()).toBeCloseTo(0, 6);
  });

  it('clamps polar angle, distance and target at the bounds', () => {
    const controls = makeControls();
    void controls.rotatePolarTo(5 * DEG, false);
    controls.update(0);
    expect(controls.polarAngle).toBeCloseTo(20 * DEG, 6);
    void controls.rotatePolarTo(89 * DEG, false);
    controls.update(0);
    expect(controls.polarAngle).toBeCloseTo(80 * DEG, 6);

    void controls.dollyTo(1, false);
    controls.update(0);
    expect(controls.distance).toBeCloseTo(4, 6);
    void controls.dollyTo(100, false);
    controls.update(0);
    expect(controls.distance).toBeCloseTo(30, 6);

    void controls.moveTo(20, 3, -20, false);
    controls.update(0);
    const target = controls.getTarget(new THREE.Vector3());
    expect(target.x).toBeCloseTo(8, 6);
    expect(target.y).toBeCloseTo(0, 6);
    expect(target.z).toBeCloseTo(-8, 6);
  });
});
