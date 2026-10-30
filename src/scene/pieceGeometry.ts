import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PieceType } from '@/domain/types';
import { COLORS, type MaterialFamily } from './materials';

type Vec3 = [number, number, number];

export interface ModelPart {
  family: MaterialFamily;
  geometry: BufferGeometry;
}

const BED_WIDTH = 0.62;
const BED_HEIGHT = 0.1;
const GROOVE_OFFSET = 0.14;
const GROOVE_WIDTH = 0.055;

class ModelBuilder {
  private readonly parts = new Map<MaterialFamily, BufferGeometry[]>();

  add(family: MaterialFamily, geometry: BufferGeometry, color: string, position: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0]) {
    const prepared = geometry.index ? geometry.toNonIndexed() : geometry;
    const matrix = new Matrix4().compose(
      new Vector3(...position),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(1, 1, 1),
    );
    prepared.applyMatrix4(matrix);

    for (const name of Object.keys(prepared.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) prepared.deleteAttribute(name);
    }
    const { r, g, b } = new Color(color);
    const count = prepared.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) colors.set([r, g, b], i * 3);
    prepared.setAttribute('color', new BufferAttribute(colors, 3));

    this.parts.set(family, [...(this.parts.get(family) ?? []), prepared]);
    return this;
  }

  box(family: MaterialFamily, size: Vec3, color: string, position: Vec3, radius = 0.02, rotation?: Vec3) {
    return this.add(family, new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), color, position, rotation);
  }

  cylinder(family: MaterialFamily, top: number, bottom: number, height: number, color: string, position: Vec3, rotation?: Vec3, segments = 14) {
    return this.add(family, new CylinderGeometry(top, bottom, height, segments), color, position, rotation);
  }

  build(): ModelPart[] {
    return [...this.parts].map(([family, geometries]) => ({
      family,
      geometry: mergeGeometries(geometries)!,
    }));
  }
}

function straightBed(builder: ModelBuilder) {
  builder.box('wood', [BED_WIDTH, BED_HEIGHT, 1], COLORS.honey, [0, BED_HEIGHT / 2, 0], 0.018);
  for (const side of [-1, 1]) {
    builder.box('paint', [GROOVE_WIDTH, 0.008, 0.98], COLORS.groove, [side * GROOVE_OFFSET, BED_HEIGHT, 0], 0.002);
  }
}

// A flat ring sector around the tile's south-east corner, in tile-local coordinates.
function arcSlab(innerRadius: number, outerRadius: number, height: number, bevel: number) {
  const shape = new Shape();
  shape.absarc(0.5, 0.5, outerRadius, Math.PI, Math.PI * 1.5, false);
  shape.absarc(0.5, 0.5, innerRadius, Math.PI * 1.5, Math.PI, true);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 14,
  });
  return geometry.rotateX(Math.PI / 2).translate(0, height - bevel, 0);
}

function curvedBed(builder: ModelBuilder) {
  builder.add('wood', arcSlab(0.5 - BED_WIDTH / 2 + 0.012, 0.5 + BED_WIDTH / 2 - 0.012, BED_HEIGHT, 0.012), COLORS.honey);
  for (const side of [-1, 1]) {
    const radius = 0.5 + side * GROOVE_OFFSET;
    builder.add(
      'paint',
      arcSlab(radius - GROOVE_WIDTH / 2, radius + GROOVE_WIDTH / 2, 0.008, 0),
      COLORS.groove,
      [0, BED_HEIGHT - 0.004, 0],
    );
  }
}

function tunnelShell() {
  const outer = 0.46;
  const inner = 0.34;
  const shoulder = 0.3;
  const shape = new Shape();
  shape.moveTo(-outer, 0);
  shape.lineTo(-outer, shoulder);
  shape.absarc(0, shoulder, outer, Math.PI, 0, true);
  shape.lineTo(outer, 0);
  shape.lineTo(inner, 0);
  shape.lineTo(inner, shoulder);
  shape.absarc(0, shoulder, inner, 0, Math.PI, false);
  shape.lineTo(-inner, 0);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.94,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 12,
  });
  return geometry.translate(0, 0, -0.47);
}

function housePrism() {
  const shape = new Shape();
  shape.moveTo(-0.38, 0);
  shape.lineTo(0, 0.38);
  shape.lineTo(0.38, 0);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.66,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
  });
  return geometry.translate(0, 0, -0.33);
}

function wheelSet(builder: ModelBuilder, x: number, z: number, y: number, radius: number, width: number) {
  for (const side of [-1, 1]) {
    builder.cylinder('plastic', radius, radius, width, COLORS.tyre, [side * x, y, z], [0, 0, Math.PI / 2], 16);
  }
}

function letterBars(builder: ModelBuilder, bars: Array<[number, number, number, number]>, centre: Vec3, color: string) {
  for (const [x, y, width, height] of bars) {
    builder.box('paint', [width, height, 0.012], color, [centre[0] + x, centre[1] + y, centre[2]], 0.003);
  }
}

const BUILDERS: Record<PieceType, (builder: ModelBuilder) => void> = {
  straight: straightBed,

  curve: curvedBed,

  tunnel(builder) {
    straightBed(builder);
    builder.add('paint', tunnelShell(), COLORS.dusty);
  },

  station(builder) {
    straightBed(builder);
    builder
      .box('wood', [0.17, 0.17, 0.96], COLORS.birch, [0.405, 0.085, 0], 0.02)
      .box('paint', [0.05, 0.5, 0.05], COLORS.walnut, [0.42, 0.42, 0.34], 0.012)
      .box('paint', [0.05, 0.5, 0.05], COLORS.walnut, [0.42, 0.42, -0.34], 0.012)
      .box('paint', [0.94, 0.05, 0.96], COLORS.terracotta, [0.02, 0.69, 0], 0.02)
      .box('paint', [0.86, 0.05, 0.88], COLORS.cream, [0.02, 0.645, 0], 0.012);
  },

  buffer(builder) {
    straightBed(builder);
    builder
      .box('wood', [0.5, 0.26, 0.22], COLORS.walnut, [0, 0.23, -0.37], 0.03)
      .box('paint', [0.56, 0.1, 0.05], COLORS.terracotta, [0, 0.28, -0.25], 0.02);
  },

  house(builder) {
    builder
      .box('paint', [0.62, 0.62, 0.62], COLORS.cream, [0, 0.31, 0], 0.03)
      .add('paint', housePrism(), COLORS.terracotta, [0, 0.62, 0])
      .box('paint', [0.14, 0.26, 0.02], COLORS.dustyDeep, [0, 0.13, 0.31], 0.006)
      .box('paint', [0.14, 0.14, 0.02], COLORS.dusty, [-0.17, 0.4, 0.31], 0.006)
      .box('paint', [0.14, 0.14, 0.02], COLORS.dusty, [0.17, 0.4, 0.31], 0.006);
  },

  pineTree(builder) {
    builder
      .cylinder('wood', 0.07, 0.09, 0.3, COLORS.walnut, [0, 0.15, 0])
      .add('paint', new ConeGeometry(0.4, 0.5, 18), COLORS.sageDeep, [0, 0.5, 0])
      .add('paint', new ConeGeometry(0.32, 0.45, 18), COLORS.sage, [0, 0.76, 0])
      .add('paint', new ConeGeometry(0.22, 0.38, 18), COLORS.sageDeep, [0, 1.01, 0]);
  },

  roundTree(builder) {
    builder
      .cylinder('wood', 0.05, 0.065, 0.56, COLORS.walnut, [0, 0.28, 0])
      .add('paint', new SphereGeometry(0.31, 20, 14), COLORS.sage, [0, 0.69, 0]);
  },

  hill(builder) {
    const mound = new SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.97, 0.6, 0.97);
    const knoll = new SphereGeometry(0.42, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1);
    builder
      .add('paint', mound, COLORS.sage)
      .add('paint', knoll, COLORS.sageDeep, [0.38, 0.3, -0.3]);
  },

  car(builder) {
    builder
      .box('paint', [0.3, 0.1, 0.5], COLORS.terracotta, [0, 0.12, 0], 0.03)
      .box('paint', [0.25, 0.09, 0.24], COLORS.cream, [0, 0.21, -0.02], 0.03);
    wheelSet(builder, 0.15, 0.15, 0.06, 0.06, 0.04);
    wheelSet(builder, 0.15, -0.15, 0.06, 0.06, 0.04);
  },

  cassette(builder) {
    builder
      .box('plastic', [0.68, 0.08, 0.43], COLORS.charcoal, [0, 0.04, 0], 0.012)
      .box('paint', [0.58, 0.006, 0.26], COLORS.cream, [0, 0.082, -0.045], 0.002)
      .box('paint', [0.3, 0.006, 0.09], COLORS.tyre, [0, 0.083, -0.03], 0.002)
      .box('plastic', [0.4, 0.012, 0.09], COLORS.charcoal, [0, 0.082, 0.16], 0.004);
    for (const side of [-1, 1]) {
      builder.cylinder('plastic', 0.035, 0.035, 0.012, COLORS.cream, [side * 0.1, 0.09, -0.03]);
    }
  },

  blocks(builder) {
    const size = 0.28;
    const half = size / 2;
    builder
      .box('wood', [size, size, size], COLORS.terracotta, [-0.15, half, 0.03], 0.025, [0, 0.14, 0])
      .box('wood', [size, size, size], COLORS.dusty, [0.16, half, 0.05], 0.025, [0, -0.2, 0])
      .box('wood', [size, size, size], COLORS.mustard, [0, size + half, 0.03], 0.025, [0, 0.3, 0]);
    letterBars(builder, [[0, 0.075, 0.15, 0.03], [0, -0.01, 0.03, 0.14]], [-0.11, half, 0.175], COLORS.cream);
    letterBars(builder, [[-0.05, 0, 0.03, 0.15], [0.02, -0.06, 0.13, 0.03]], [0.13, half, 0.195], COLORS.cream);
    letterBars(
      builder,
      [[-0.06, 0, 0.03, 0.15], [0.06, 0, 0.03, 0.15], [0, 0, 0.11, 0.03]],
      [0.04, size + half, 0.17],
      COLORS.cream,
    );
  },
};

const cache = new Map<PieceType, ModelPart[]>();

export function pieceParts(type: PieceType): ModelPart[] {
  let parts = cache.get(type);
  if (!parts) {
    const builder = new ModelBuilder();
    BUILDERS[type](builder);
    parts = builder.build();
    cache.set(type, parts);
  }
  return parts;
}

export function locomotiveParts(): ModelPart[] {
  const builder = new ModelBuilder();
  builder
    .box('paint', [0.36, 0.08, 0.86], COLORS.walnut, [0, 0.16, 0], 0.02)
    .box('paint', [0.34, 0.26, 0.28], COLORS.terracotta, [0, 0.33, 0.24], 0.03)
    .box('paint', [0.38, 0.05, 0.34], COLORS.cream, [0, 0.48, 0.24], 0.02)
    .cylinder('wood', 0.135, 0.135, 0.52, COLORS.dusty, [0, 0.3, -0.16], [Math.PI / 2, 0, 0], 18)
    .cylinder('paint', 0.05, 0.065, 0.1, COLORS.charcoal, [0, 0.47, -0.3])
    .add('paint', new SphereGeometry(0.06, 12, 8), COLORS.mustard, [0, 0.45, -0.1]);
  wheelSet(builder, 0.19, 0.28, 0.08, 0.075, 0.04);
  wheelSet(builder, 0.19, 0, 0.08, 0.075, 0.04);
  wheelSet(builder, 0.19, -0.28, 0.08, 0.075, 0.04);
  return builder.build();
}

export function carriageParts(color: string): ModelPart[] {
  const builder = new ModelBuilder();
  builder
    .box('paint', [0.36, 0.08, 0.76], COLORS.walnut, [0, 0.16, 0], 0.02)
    .box('paint', [0.34, 0.2, 0.72], color, [0, 0.3, 0], 0.03)
    .box('paint', [0.38, 0.04, 0.78], COLORS.cream, [0, 0.42, 0], 0.016);
  for (const z of [-0.2, 0, 0.2]) {
    builder.box('paint', [0.35, 0.08, 0.12], COLORS.dustyDeep, [0, 0.32, z], 0.01);
  }
  wheelSet(builder, 0.19, 0.24, 0.08, 0.075, 0.04);
  wheelSet(builder, 0.19, -0.24, 0.08, 0.075, 0.04);
  return builder.build();
}
