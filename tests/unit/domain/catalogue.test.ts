/**
 * Unit tests for the item catalogue and connector rotation.
 *
 * Expected values are taken from Section 6 (Item catalogue) of requirement.md,
 * not from the implementation.
 *
 * Requirements: 14.3, 28.1, 28.2, 28.4
 */
import { describe, expect, it } from 'vitest';
import { CATALOGUE, isTrackType, itemOf } from '@/domain/catalogue';
import { connectorsOf, rotateDir } from '@/domain/connectors';
import type { Dir, PieceType, Rotation } from '@/domain/types';

const N: Dir = 0;
const E: Dir = 1;
const S: Dir = 2;
const W: Dir = 3;

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Section 6 table, in table order: type id, Item label, Kind, connectors at 0°. */
const SECTION_6: readonly {
  type: PieceType;
  label: string;
  kind: 'track' | 'decoration';
  connectors0: Dir[];
}[] = [
  { type: 'straight', label: 'Straight track', kind: 'track', connectors0: [N, S] },
  { type: 'curve', label: 'Curved track', kind: 'track', connectors0: [S, E] },
  { type: 'tunnel', label: 'Tunnel', kind: 'track', connectors0: [N, S] },
  { type: 'station', label: 'Station', kind: 'track', connectors0: [N, S] },
  { type: 'buffer', label: 'Buffer stop', kind: 'track', connectors0: [S] },
  { type: 'house', label: 'Toy house', kind: 'decoration', connectors0: [] },
  { type: 'pineTree', label: 'Pine tree', kind: 'decoration', connectors0: [] },
  { type: 'roundTree', label: 'Round tree', kind: 'decoration', connectors0: [] },
  { type: 'hill', label: 'Hill', kind: 'decoration', connectors0: [] },
  { type: 'car', label: 'Toy car', kind: 'decoration', connectors0: [] },
  { type: 'cassette', label: 'Cassette tape', kind: 'decoration', connectors0: [] },
  { type: 'blocks', label: 'Building blocks', kind: 'decoration', connectors0: [] },
];

/** Connector sets are compared order-independently. */
function sorted(dirs: readonly Dir[]): Dir[] {
  return [...dirs].sort((a, b) => a - b);
}

describe('catalogue contents (Requirements 28.1, 28.2)', () => {
  it('has exactly the 12 Section 6 items, in table order', () => {
    expect(CATALOGUE).toHaveLength(12);
    expect(CATALOGUE.map((item) => item.type)).toEqual(SECTION_6.map((row) => row.type));
  });

  it.each(SECTION_6)('$type has label "$label" and kind $kind', ({ type, label, kind }) => {
    const item = itemOf(type);
    expect(item.label).toBe(label);
    expect(item.kind).toBe(kind);
    expect(isTrackType(type)).toBe(kind === 'track');
  });

  it('has 5 tracks and 7 decorations', () => {
    expect(CATALOGUE.filter((item) => item.kind === 'track')).toHaveLength(5);
    expect(CATALOGUE.filter((item) => item.kind === 'decoration')).toHaveLength(7);
  });
});

describe('connectors (Requirements 14.3, 28.4)', () => {
  it.each(SECTION_6)('$type has the Section 6 connectors at 0°', ({ type, connectors0 }) => {
    expect(sorted(itemOf(type).connectors0)).toEqual(sorted(connectors0));
    expect(sorted(connectorsOf({ type, rotation: 0 }))).toEqual(sorted(connectors0));
  });

  it('curve at 90° has connectors W and S', () => {
    expect(sorted(connectorsOf({ type: 'curve', rotation: 90 }))).toEqual(sorted([W, S]));
  });

  it('buffer at 180° has the single connector N', () => {
    expect(connectorsOf({ type: 'buffer', rotation: 180 })).toEqual([N]);
  });

  it.each(ROTATIONS)("buffer's stop block side is never a connector at %i°", (rotation) => {
    // Section 6: the stop block is at the buffer's north side at 0°.
    const stopBlockSide = rotateDir(N, rotation);
    const connectors = connectorsOf({ type: 'buffer', rotation });
    expect(connectors).toHaveLength(1);
    expect(connectors).not.toContain(stopBlockSide);
  });

  it.each(ROTATIONS)('decorations have no connectors at %i°', (rotation) => {
    for (const row of SECTION_6.filter((r) => r.kind === 'decoration')) {
      expect(connectorsOf({ type: row.type, rotation })).toEqual([]);
    }
  });
});
