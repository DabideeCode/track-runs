/**
 * Unit tests for the scene bridge (task 11.2).
 *
 * Requirements 2.3, 2.4, 2.7 (pointer to tile), 6.1 and 6.4 (thumbnail),
 * 9.8 (Reset view default pose). Runs in Node: the camera is a real
 * `THREE.PerspectiveCamera`; only the WebGL canvas and the 2D thumbnail
 * canvas are stand-ins, since Node has neither.
 */
import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, type Camera, type Object3D } from 'three';
import { CAMERA_FOV, DEFAULT_DISTANCE, DEFAULT_POSITION } from '@/runtime/cameraPose';
import {
  SceneBridge,
  clientToNdc,
  intersectGround,
  project,
  rayFromCamera,
  thumbnailSize,
  tileFromRay,
  type CameraControlsLike,
  type RectLike,
  type RendererLike,
  type ThumbnailCanvas,
} from '@/runtime/SceneBridge';

const RECT: RectLike = { left: 100, top: 50, width: 800, height: 600 };

function fakeRenderer(log: string[] = [], opts: { width?: number; height?: number; throwOnRender?: boolean } = {}) {
  const gl: RendererLike = {
    domElement: {
      width: opts.width ?? 1600,
      height: opts.height ?? 1200,
      getBoundingClientRect: () => RECT,
    },
    render: (_scene: Object3D, _camera: Camera) => {
      if (opts.throwOnRender) throw new Error('context lost');
      log.push('render');
    },
  };
  return gl;
}

function defaultCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(CAMERA_FOV, RECT.width / RECT.height, 0.1, 120);
  camera.position.set(DEFAULT_POSITION.x, DEFAULT_POSITION.y, DEFAULT_POSITION.z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

function topDownCamera(x: number, z: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(CAMERA_FOV, RECT.width / RECT.height, 0.1, 120);
  camera.up.set(0, 0, -1);
  camera.position.set(x, 10, z);
  camera.lookAt(x, 0, z);
  camera.updateMatrixWorld();
  return camera;
}

const centreX = RECT.left + RECT.width / 2;
const centreY = RECT.top + RECT.height / 2;

describe('default camera pose', () => {
  it('is 18 units from the origin at 50° from vertical, with equal positive x and z', () => {
    const { x, y, z } = DEFAULT_POSITION;
    expect(Math.hypot(x, y, z)).toBeCloseTo(DEFAULT_DISTANCE, 9);
    expect(Math.acos(y / DEFAULT_DISTANCE) * (180 / Math.PI)).toBeCloseTo(50, 9);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeCloseTo(z, 12);
    expect(x).toBeCloseTo(9.75, 2);
    expect(y).toBeCloseTo(11.57, 2);
  });
});

describe('pure ray helpers', () => {
  it('maps client points inside the rectangle to NDC and rejects points outside', () => {
    expect(clientToNdc(RECT.left, RECT.top, RECT)).toEqual({ x: -1, y: 1 });
    expect(clientToNdc(centreX, centreY, RECT)).toEqual({ x: 0, y: 0 });
    expect(clientToNdc(RECT.left + RECT.width, RECT.top + RECT.height, RECT)).toEqual({ x: 1, y: -1 });
    expect(clientToNdc(RECT.left - 1, centreY, RECT)).toBeNull();
    expect(clientToNdc(centreX, RECT.top + RECT.height + 1, RECT)).toBeNull();
    expect(clientToNdc(0, 0, { left: 0, top: 0, width: 0, height: 10 })).toBeNull();
  });

  it('intersects the ground plane, and returns null for parallel or upward rays', () => {
    expect(intersectGround({ x: 1, y: 4, z: 2 }, { x: 1, y: -2, z: 0 })).toEqual({ x: 3, z: 2 });
    expect(intersectGround({ x: 0, y: 4, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(intersectGround({ x: 0, y: 4, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });

  it('maps a ground hit to the tile with the nearest centre, null off the grid', () => {
    const down = { x: 0, y: -1, z: 0 };
    expect(tileFromRay({ x: 0, y: 5, z: 0 }, down)).toEqual({ gridX: 8, gridZ: 8 });
    expect(tileFromRay({ x: -7.9, y: 5, z: 7.9 }, down)).toEqual({ gridX: 0, gridZ: 15 });
    expect(tileFromRay({ x: 8, y: 5, z: 0 }, down)).toBeNull();
    expect(tileFromRay({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });
});

describe('thumbnailSize', () => {
  it('fits inside 320 × 240, keeps the aspect ratio and never upscales', () => {
    expect(thumbnailSize(1920, 1080)).toEqual({ width: 320, height: 180 });
    expect(thumbnailSize(800, 600)).toEqual({ width: 320, height: 240 });
    expect(thumbnailSize(1000, 2000)).toEqual({ width: 120, height: 240 });
    expect(thumbnailSize(100, 50)).toEqual({ width: 100, height: 50 });
    expect(thumbnailSize(3000, 1)).toEqual({ width: 320, height: 1 });
  });

  it('returns null for an empty or invalid source', () => {
    expect(thumbnailSize(0, 600)).toBeNull();
    expect(thumbnailSize(800, Number.NaN)).toBeNull();
  });
});

describe('SceneBridge before registration', () => {
  it('captures nothing, ignores Reset view and maps no tiles', () => {
    const bridge = new SceneBridge();
    expect(bridge.isReady()).toBe(false);
    expect(bridge.captureThumbnail()).toBeNull();
    expect(() => bridge.resetView()).not.toThrow();
    expect(bridge.rayFromClient(centreX, centreY)).toBeNull();
    expect(bridge.tileToScreen(3, 4)).toBeNull();
  });
});

describe('SceneBridge.rayFromClient and tileToScreen', () => {
  it('maps the canvas centre to the tile under the camera target', () => {
    const bridge = new SceneBridge();
    bridge.register({ gl: fakeRenderer(), camera: topDownCamera(2.2, -3.6), scene: new Scene() });
    expect(bridge.rayFromClient(centreX, centreY)).toEqual({ gridX: 10, gridZ: 4 });
    expect(bridge.rayFromClient(RECT.left - 5, centreY)).toBeNull();

    bridge.register({ camera: topDownCamera(-7.9, 7.9) });
    expect(bridge.rayFromClient(centreX, centreY)).toEqual({ gridX: 0, gridZ: 15 });
  });

  it('the default pose looks at the origin, so its centre ray lands there', () => {
    const camera = defaultCamera();
    const hit = intersectGround(camera.position, camera.getWorldDirection(camera.position.clone()));
    expect(hit!.x).toBeCloseTo(0, 9);
    expect(hit!.z).toBeCloseTo(0, 9);
  });

  it('returns null where the ray misses the grid', () => {
    const bridge = new SceneBridge();
    // Looking along the ground from the side: the top of the view is above the horizon.
    const camera = new PerspectiveCamera(CAMERA_FOV, RECT.width / RECT.height, 0.1, 120);
    camera.position.set(0, 1, 30);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    bridge.register({ gl: fakeRenderer(), camera, scene: new Scene() });
    expect(bridge.rayFromClient(centreX, RECT.top + 1)).toBeNull();
  });

  it('tileToScreen and rayFromClient agree on every visible tile', () => {
    const bridge = new SceneBridge();
    bridge.register({ gl: fakeRenderer(), camera: defaultCamera(), scene: new Scene() });
    let visible = 0;
    for (let gridZ = 0; gridZ < 16; gridZ++) {
      for (let gridX = 0; gridX < 16; gridX++) {
        const p = bridge.tileToScreen(gridX, gridZ);
        if (!p) continue; // tile centre outside this 800 × 600 view
        visible++;
        expect(bridge.rayFromClient(p.x, p.y)).toEqual({ gridX, gridZ });
      }
    }
    expect(visible).toBeGreaterThan(200);
    expect(bridge.tileToScreen(8, 8)).not.toBeNull();
    expect(bridge.tileToScreen(16, 0)).toBeNull();
    expect(bridge.tileToScreen(1.5, 0)).toBeNull();
  });
});

describe('SceneBridge.captureThumbnail', () => {
  function recordingCanvas(log: string[], opts: { noContext?: boolean } = {}) {
    const canvas: ThumbnailCanvas & { drawn?: unknown[]; encoded?: unknown[] } = {
      width: 0,
      height: 0,
      getContext: () =>
        opts.noContext
          ? null
          : {
              drawImage: (...args: unknown[]) => {
                log.push('draw');
                canvas.drawn = args;
              },
            },
      toDataURL: (type: string, quality?: number) => {
        canvas.encoded = [type, quality];
        return 'data:image/jpeg;base64,AAAA';
      },
    };
    return canvas;
  }

  it('renders a frame, then draws the WebGL canvas scaled into 320 × 240 and encodes JPEG', () => {
    const log: string[] = [];
    const canvas = recordingCanvas(log);
    const bridge = new SceneBridge({ createCanvas: () => canvas });
    const gl = fakeRenderer(log, { width: 1920, height: 1080 });
    bridge.register({ gl, camera: defaultCamera(), scene: new Scene() });

    expect(bridge.captureThumbnail()).toBe('data:image/jpeg;base64,AAAA');
    expect(log).toEqual(['render', 'draw']);
    expect([canvas.width, canvas.height]).toEqual([320, 180]);
    expect(canvas.drawn).toEqual([gl.domElement, 0, 0, 320, 180]);
    expect(canvas.encoded?.[0]).toBe('image/jpeg');
  });

  it('returns null when rendering throws or no 2D context is available', () => {
    const throwing = new SceneBridge({ createCanvas: () => recordingCanvas([]) });
    throwing.register({ gl: fakeRenderer([], { throwOnRender: true }), camera: defaultCamera(), scene: new Scene() });
    expect(throwing.captureThumbnail()).toBeNull();

    const noContext = new SceneBridge({ createCanvas: () => recordingCanvas([], { noContext: true }) });
    noContext.register({ gl: fakeRenderer(), camera: defaultCamera(), scene: new Scene() });
    expect(noContext.captureThumbnail()).toBeNull();
  });
});

describe('SceneBridge.resetView and registration', () => {
  it('animates the controls to the default pose and stops after unregistering', () => {
    const calls: unknown[][] = [];
    const controls: CameraControlsLike = { setLookAt: (...args: unknown[]) => calls.push(args) };
    const bridge = new SceneBridge();
    const unregister = bridge.register({ controls });

    bridge.resetView();
    const p = DEFAULT_POSITION;
    expect(calls).toEqual([[p.x, p.y, p.z, 0, 0, 0, true]]);

    bridge.applyDefaultPose(false);
    expect(calls[1]?.[6]).toBe(false);

    unregister();
    bridge.resetView();
    expect(calls).toHaveLength(2);
  });

  it('an old unregister does not remove parts registered later', () => {
    const bridge = new SceneBridge();
    const scene = new Scene();
    const unregisterOld = bridge.register({ gl: fakeRenderer(), camera: defaultCamera(), scene });
    bridge.register({ gl: fakeRenderer(), camera: defaultCamera() });
    unregisterOld();
    expect(bridge.isReady()).toBe(false); // the old scene is gone
    bridge.register({ scene });
    expect(bridge.isReady()).toBe(true); // the newer gl and camera survived
  });
});

describe('camera maths without Three.js values (D-59)', () => {
  const cameras = (): Array<[string, Camera]> => {
    const persp = defaultCamera();
    const tilted = new PerspectiveCamera(55, 16 / 9, 0.1, 120);
    tilted.position.set(-6, 4.5, 12);
    tilted.lookAt(2, 0, -1);
    tilted.updateMatrixWorld();
    const ortho = new OrthographicCamera(-10, 10, 7.5, -7.5, 0.1, 100);
    ortho.position.set(8, 12, 8);
    ortho.lookAt(0, 0, 0);
    ortho.updateMatrixWorld();
    return [
      ['default perspective', persp],
      ['tilted perspective', tilted],
      ['orthographic', ortho],
    ];
  };
  const points: Array<[number, number]> = [];
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) points.push([i / 4, j / 4]);

  it('rayFromCamera matches Raycaster.setFromCamera', () => {
    const raycaster = new Raycaster();
    for (const [name, camera] of cameras()) {
      for (const [x, y] of points) {
        raycaster.setFromCamera(new Vector2(x, y), camera);
        const ray = rayFromCamera(x, y, camera);
        for (const k of ['x', 'y', 'z'] as const) {
          expect(ray.origin[k], `${name} origin ${k} at ${x},${y}`).toBeCloseTo(raycaster.ray.origin[k], 9);
          expect(ray.direction[k], `${name} direction ${k} at ${x},${y}`).toBeCloseTo(raycaster.ray.direction[k], 9);
        }
      }
    }
  });

  it('project matches Vector3.project', () => {
    for (const [name, camera] of cameras()) {
      for (const [x, z] of points) {
        const world = { x: x * 8, y: 0, z: z * 8 };
        const expected = new Vector3(world.x, world.y, world.z).project(camera);
        const got = project(world, camera);
        expect(got.x, name).toBeCloseTo(expected.x, 9);
        expect(got.y, name).toBeCloseTo(expected.y, 9);
        expect(got.z, name).toBeCloseTo(expected.z, 9);
      }
    }
  });
});
