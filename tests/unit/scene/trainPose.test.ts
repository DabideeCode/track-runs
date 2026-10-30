/**
 * Unit tests for `src/scene/train/trainPose.ts`, the pose writers used by
 * `TrainView` (task 14.13). Runs in Node with real Three.js objects.
 *
 * Requirements: 17.2, 17.9, 19.3, 19.4, 19.10
 */
import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { MAX_FRAME_DT, type VehicleKind, type VehiclePose } from '@/domain/train';
import type { Piece } from '@/domain/types';
import { TrainRuntime } from '@/runtime/TrainRuntime';
import type { AudioPort } from '@/audio/types';
import { applyTrainPoses, applyVehiclePose, frameDelta, vehicleTransform } from '@/scene/train/trainPose';

function pose(vehicle: VehicleKind, x: number, z: number, tx: number, tz: number, onTrack = true): VehiclePose {
  return { vehicle, x, z, tangent: { x: tx, z: tz }, onTrack, pieceId: onTrack ? 'p' : null };
}

function groups(): Record<VehicleKind, Group> {
  return { locomotive: new Group(), carriage1: new Group(), carriage2: new Group() };
}

/** World direction of a group's local +z (the vehicle front, D-40). */
function front(g: Group): Vector3 {
  g.updateMatrixWorld(true);
  return new Vector3(0, 0, 1).transformDirection(g.matrixWorld);
}

const silentAudio = {
  play() {},
  startChug() {},
  setChugLevel() {},
  stopChug() {},
  apply() {},
  getLog: () => [],
} as unknown as AudioPort;

describe('vehicleTransform', () => {
  it('puts the vehicle centre on the ground plane at the pose position', () => {
    const t = vehicleTransform(pose('locomotive', 1.25, -3.5, 0, 1));
    expect(t).toMatchObject({ x: 1.25, y: 0, z: -3.5 });
  });

  it.each([
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
    [Math.SQRT1_2, -Math.SQRT1_2],
  ])('turns the model front onto the tangent (%f, %f)', (tx, tz) => {
    const g = new Group();
    applyVehiclePose(g, pose('carriage1', 0, 0, tx, tz));
    const f = front(g);
    expect(f.x).toBeCloseTo(tx, 9);
    expect(f.y).toBeCloseTo(0, 9);
    expect(f.z).toBeCloseTo(tz, 9);
  });
});

describe('applyTrainPoses', () => {
  it('hides the root and leaves the vehicles alone when poses are null', () => {
    const root = new Group();
    const v = groups();
    v.locomotive.position.set(5, 0, 5);
    expect(applyTrainPoses(root, v, null)).toBe(false);
    expect(root.visible).toBe(false);
    expect(v.locomotive.position.toArray()).toEqual([5, 0, 5]);
  });

  it('shows the root and writes each pose to the vehicle of the same kind', () => {
    const root = new Group();
    root.visible = false;
    const v = groups();
    const poses = [
      pose('carriage2', 0, 2, 0, -1, false), // on the extension past a dead end, still drawn
      pose('locomotive', 0, 0.15, 0, -1),
      pose('carriage1', 0, 1.1, 0, -1),
    ];
    expect(applyTrainPoses(root, v, poses)).toBe(true);
    expect(root.visible).toBe(true);
    expect(v.locomotive.position.toArray()).toEqual([0, 0, 0.15]);
    expect(v.carriage1.position.toArray()).toEqual([0, 0, 1.1]);
    expect(v.carriage2.position.toArray()).toEqual([0, 0, 2]);
    expect(v.carriage2.visible).toBe(true);
    expect(v.locomotive.rotation.y).toBeCloseTo(Math.PI, 12);
  });

  it('hides a vehicle that has no pose and skips missing groups', () => {
    const root = new Group();
    const v = { ...groups(), carriage1: null };
    applyTrainPoses(root, v, [pose('locomotive', 0, 0, 0, 1)]);
    expect(v.locomotive.visible).toBe(true);
    expect(v.carriage2.visible).toBe(false);
  });
});

describe('frameDelta', () => {
  it('passes normal frame times through', () => {
    expect(frameDelta(1 / 60)).toBe(1 / 60);
  });

  it('clamps long frames to MAX_FRAME_DT', () => {
    expect(frameDelta(2.5)).toBe(MAX_FRAME_DT);
  });

  it.each([0, -0.016, Number.NaN, Number.POSITIVE_INFINITY])('treats %f as no time', (dt) => {
    expect(frameDelta(dt)).toBe(0);
  });
});

describe('with a real TrainRuntime', () => {
  const station: Piece = { id: 's', type: 'station', gridX: 4, gridZ: 6, rotation: 0 };

  it('hides the train without a station and shows it parked on the station', () => {
    const runtime = new TrainRuntime(silentAudio);
    const root = new Group();
    const v = groups();

    runtime.syncParked([], 0);
    applyTrainPoses(root, v, runtime.poses());
    expect(root.visible).toBe(false);

    runtime.syncParked([station], 0);
    applyTrainPoses(root, v, runtime.poses());
    expect(root.visible).toBe(true);
    // Station tile centre is (4 − 7.5, 6 − 7.5); facing 0 points the
    // locomotive toward connector 0, the north end (−z).
    expect(v.locomotive.position.x).toBeCloseTo(-3.5, 9);
    expect(v.locomotive.position.z).toBeCloseTo(-1.5, 9);
    const f = front(v.locomotive);
    expect(f.z).toBeCloseTo(-1, 9);
    // Carriages trail behind the locomotive (south) at the coupling spacing.
    expect(v.carriage1.position.z - v.locomotive.position.z).toBeCloseTo(0.95, 6);
    expect(v.carriage2.position.z - v.carriage1.position.z).toBeCloseTo(0.9, 6);
  });

  it('follows the station when it moves (Requirement 17.2)', () => {
    const runtime = new TrainRuntime(silentAudio);
    const root = new Group();
    const v = groups();
    runtime.syncParked([station], 0);
    const before = runtime.getVersion();
    applyTrainPoses(root, v, runtime.poses());

    runtime.syncParked([{ ...station, gridX: 10, rotation: 90 }], 0);
    expect(runtime.getVersion()).not.toBe(before);
    applyTrainPoses(root, v, runtime.poses());
    expect(v.locomotive.position.x).toBeCloseTo(2.5, 9);
    expect(v.locomotive.position.z).toBeCloseTo(-1.5, 9);
    // Rotated 90°, connector 0 faces east (+x).
    expect(front(v.locomotive).x).toBeCloseTo(1, 9);
  });
});
