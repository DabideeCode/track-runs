/**
 * Canvas configuration for the playfield (task 14.14, D-35, D-57).
 *
 * Requirements: 32.2, 32.3, 33.1, 33.2, 33.3
 */
import { describe, expect, it } from 'vitest';
import { PCFShadowMap, PCFSoftShadowMap } from 'three';
import { CAMERA_FOV, DEFAULT_POSITION } from '@/runtime/cameraPose';
import { canvasConfig, shadowConfigFor } from '@/scene/sceneCanvasConfig';

describe('canvasConfig', () => {
  it('caps the pixel ratio at 1.5, or 1 in Low quality', () => {
    expect(canvasConfig(2, false).dpr).toBe(1.5);
    expect(canvasConfig(1.25, false).dpr).toBe(1.25);
    expect(canvasConfig(2, true).dpr).toBe(1);
    expect(canvasConfig(0.75, true).dpr).toBe(0.75);
  });

  it('uses PCF shadows when on, none in Low quality, and never PCFSoftShadowMap', () => {
    expect(shadowConfigFor(false)).toEqual({ enabled: true, type: PCFShadowMap });
    expect(shadowConfigFor(true)).toEqual({ enabled: false, type: PCFShadowMap });
    for (const low of [false, true]) expect(shadowConfigFor(low).type).not.toBe(PCFSoftShadowMap);
  });

  it('returns stable objects so R3F does not reconfigure on every render', () => {
    const a = canvasConfig(2, false);
    const b = canvasConfig(1, false);
    expect(a.shadows).toBe(b.shadows);
    expect(a.gl).toBe(b.gl);
    expect(a.camera).toBe(b.camera);
  });

  it('keeps antialias on in both qualities and the same WebGL options (D-35)', () => {
    expect(canvasConfig(1, false).gl).toEqual({ antialias: true, powerPreference: 'high-performance' });
    expect(canvasConfig(1, true).gl).toBe(canvasConfig(1, false).gl);
  });

  it('creates a 40° camera at the default pose', () => {
    const { camera } = canvasConfig(1, false);
    expect(camera.fov).toBe(CAMERA_FOV);
    expect(camera.fov).toBe(40);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(30 + 16);
    expect(camera.position).toEqual([DEFAULT_POSITION.x, DEFAULT_POSITION.y, DEFAULT_POSITION.z]);
  });
});
