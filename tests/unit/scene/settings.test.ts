/**
 * Setting layout, prop meshes and lighting data (task 14.9; Requirements 7.3,
 * 7.6, 7.7, 7.8, 30.9, 32.4).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { Box3, Color, Mesh, Raycaster, Vector3 } from 'three';
import {
  BEDROOM_FLOOR,
  BEDROOM_RUG,
  GRID_HALF,
  KITCHEN_TABLE,
  LIGHTING_MOODS,
  LIGHT_TRANSITION_MS,
  MAIN_LIGHT,
  SETTING_PROPS,
  gridGap,
  gridReach,
  isWithinPropBand,
  lightTransitionProgress,
  propBounds,
} from '@/scene/settings/layout';
import { disposeSettingGeometries, noRaycast, settingParts } from '@/scene/settings/settingGeometry';

const SETTINGS = ['bedroom', 'kitchen'] as const;

afterAll(() => disposeSettingGeometries());

describe('setting props', () => {
  it.each(SETTINGS)('%s has at least 2 props, each 0.3 to 4 units outside the grid', (setting) => {
    const props = SETTING_PROPS[setting];
    expect(props.length).toBeGreaterThanOrEqual(2);
    for (const p of props) {
      const b = propBounds(p);
      expect(gridGap(b), p.id).toBeGreaterThanOrEqual(0.3);
      expect(gridReach(b), p.id).toBeLessThanOrEqual(4);
      expect(isWithinPropBand(b)).toBe(true);
    }
  });

  it('gridGap is negative for a box overlapping the grid', () => {
    expect(gridGap({ minX: 7, maxX: 9, minZ: 0, maxZ: 1 })).toBeLessThan(0);
  });

  it.each(SETTINGS)('%s prop meshes stay inside their layout bounds', (setting) => {
    const props = new Map(SETTING_PROPS[setting].map((p) => [p.id, p]));
    const seen = new Set<string>();
    for (const part of settingParts(setting)) {
      if (part.propId === null) continue;
      const p = props.get(part.propId)!;
      seen.add(p.id);
      const box = new Box3().setFromBufferAttribute(part.geometry.getAttribute('position') as never);
      const b = propBounds(p);
      const eps = 1e-6;
      expect(box.min.x, part.name).toBeGreaterThanOrEqual(b.minX - eps);
      expect(box.max.x, part.name).toBeLessThanOrEqual(b.maxX + eps);
      expect(box.min.z, part.name).toBeGreaterThanOrEqual(b.minZ - eps);
      expect(box.max.z, part.name).toBeLessThanOrEqual(b.maxZ + eps);
      expect(box.min.y, part.name).toBeGreaterThanOrEqual(p.baseY - eps);
      expect(box.max.y, part.name).toBeLessThanOrEqual(p.baseY + p.height + eps);
    }
    expect(seen.size).toBe(props.size);
  });

  it('setting meshes ignore raycasts', () => {
    const part = settingParts('kitchen')[0]!;
    const mesh = new Mesh(part.geometry);
    mesh.raycast = noRaycast;
    const ray = new Raycaster(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
    expect(ray.intersectObject(mesh)).toEqual([]);
  });
});

describe('ground surfaces', () => {
  it('extend under the whole grid with the top at or just below the piece base', () => {
    for (const s of [BEDROOM_FLOOR, BEDROOM_RUG, KITCHEN_TABLE]) {
      expect(s.width / 2).toBeGreaterThan(GRID_HALF);
      expect(s.depth / 2).toBeGreaterThan(GRID_HALF);
      expect(s.topY).toBeLessThanOrEqual(0);
    }
    expect([BEDROOM_FLOOR.width, BEDROOM_FLOOR.depth]).toEqual([40, 40]);
    expect([KITCHEN_TABLE.width, KITCHEN_TABLE.depth]).toEqual([30, 24]);
  });
});

describe('lighting', () => {
  it('bedroom main light is bluer (cooler) than the kitchen main light', () => {
    const blueRatio = (hex: string) => {
      const c = new Color(hex);
      return c.b / c.r;
    };
    expect(blueRatio(LIGHTING_MOODS.bedroom.main)).toBeGreaterThan(blueRatio(LIGHTING_MOODS.kitchen.main));
  });

  it('the transition runs 0 to 1 over 400 ms, well under 1 s', () => {
    expect(LIGHT_TRANSITION_MS).toBeLessThan(1000);
    expect(lightTransitionProgress(0)).toBe(0);
    expect(lightTransitionProgress(LIGHT_TRANSITION_MS)).toBe(1);
    let prev = 0;
    for (let ms = 0; ms <= LIGHT_TRANSITION_MS; ms += 10) {
      const u = lightTransitionProgress(ms);
      expect(u).toBeGreaterThanOrEqual(prev);
      prev = u;
    }
  });

  it('one shadow map of at most 2048 × 2048 covering ±12 units', () => {
    expect(MAIN_LIGHT.shadowMapSize).toBeLessThanOrEqual(2048);
    expect(MAIN_LIGHT.shadowBounds).toBe(12);
    expect(MAIN_LIGHT.shadowRadius).toBeGreaterThan(1);
  });
});
