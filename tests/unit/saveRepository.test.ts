import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Diorama } from '@/domain/types';
import { CORRUPT_KEY, listDioramas, removeDiorama, SAVE_KEY, writeDiorama } from '@/persistence/saveRepository';
import { parseDiorama } from '@/persistence/validators';

class FakeStorage {
  items = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const diorama = (id: string, updatedAt = '2026-10-01T10:00:00.000Z'): Diorama => ({
  id,
  name: `Diorama ${id}`,
  setting: 'bedroom',
  startFacing: 0,
  pieces: [{ id: `${id}-1`, type: 'straight', gridX: 1, gridZ: 2, rotation: 90 }],
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt,
});

let storage: FakeStorage;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

const stored = () => JSON.parse(storage.getItem(SAVE_KEY)!) as { version: number; dioramas: unknown[] };

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal('localStorage', storage);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(error).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reading', () => {
  it('gives an empty list with no warning when the key is missing', () => {
    expect(listDioramas()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{bad'],
    ['not an object', '42'],
    ['null', 'null'],
    ['an unknown version', '{"version":2,"dioramas":[]}'],
    ['dioramas not an array', '{"version":1,"dioramas":{}}'],
  ])('gives an empty list and one warning for %s', (_, raw) => {
    storage.setItem(SAVE_KEY, raw);
    expect(listDioramas()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('gives an empty list and one warning when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(listDioramas()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips one invalid entry, warns naming its position, and keeps the rest', () => {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: [diorama('a'), { nope: true }, diorama('b')] }));
    expect(listDioramas().map((item) => item.id).sort()).toEqual(['a', 'b']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('1');
  });

  it('lists newest first', () => {
    writeDiorama(diorama('old', '2026-01-01T00:00:00.000Z'));
    writeDiorama(diorama('new', '2026-06-01T00:00:00.000Z'));
    expect(listDioramas().map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('can stay silent', () => {
    storage.setItem(SAVE_KEY, '{bad');
    listDioramas({ warn: false });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('writing', () => {
  it('stores the Section 9 shape', () => {
    expect(writeDiorama(diorama('a'))).toBe(true);
    expect(stored()).toEqual({ version: 1, dioramas: [diorama('a')] });
  });

  it('replaces an entry with the same id', () => {
    writeDiorama(diorama('a'));
    writeDiorama({ ...diorama('a'), name: 'Renamed' });
    expect(stored().dioramas).toHaveLength(1);
    expect(listDioramas()[0]?.name).toBe('Renamed');
  });

  it('keeps entries it could not read', () => {
    const bad = { nope: true };
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: [bad, diorama('a')] }));
    writeDiorama(diorama('b'));
    expect(stored().dioramas[0]).toEqual(bad);
    expect(stored().dioramas).toHaveLength(3);
  });

  it('merges with entries saved by another tab', () => {
    writeDiorama(diorama('a'));
    const file = stored();
    file.dioramas.push(diorama('other-tab'));
    storage.setItem(SAVE_KEY, JSON.stringify(file));
    writeDiorama(diorama('b'));
    expect(stored().dioramas).toHaveLength(3);
  });

  it('copies an unreadable file aside before the first new save', () => {
    storage.setItem(SAVE_KEY, '{bad');
    writeDiorama(diorama('a'));
    expect(storage.getItem(CORRUPT_KEY)).toBe('{bad');
    expect(stored().dioramas).toHaveLength(1);
  });

  it('does not overwrite an earlier corrupt copy', () => {
    storage.setItem(CORRUPT_KEY, 'first');
    storage.setItem(SAVE_KEY, '{bad');
    writeDiorama(diorama('a'));
    expect(storage.getItem(CORRUPT_KEY)).toBe('first');
  });

  it('reports failure when storage is full', () => {
    storage.failWrites = true;
    expect(writeDiorama(diorama('a'))).toBe(false);
  });

  it('removes an entry and keeps the rest', () => {
    writeDiorama(diorama('a'));
    writeDiorama(diorama('b'));
    expect(removeDiorama('a')).toBe(true);
    expect(listDioramas().map((item) => item.id)).toEqual(['b']);
  });
});

describe('parseDiorama', () => {
  const valid = diorama('a');
  const piece = valid.pieces[0]!;

  it('accepts a valid entry, with or without a thumbnail', () => {
    expect(parseDiorama(valid)).toEqual(valid);
    expect(parseDiorama({ ...valid, thumbnail: 'data:image/jpeg;base64,AAAA' })).not.toBeNull();
  });

  it.each([
    ['not an object', 'x'],
    ['a missing id', { ...valid, id: undefined }],
    ['a blank name', { ...valid, name: '   ' }],
    ['a long name', { ...valid, name: 'x'.repeat(41) }],
    ['an unknown setting', { ...valid, setting: 'garden' }],
    ['a bad start facing', { ...valid, startFacing: 90 }],
    ['pieces not an array', { ...valid, pieces: {} }],
    ['an unparseable date', { ...valid, updatedAt: 'yesterday' }],
    ['a bad thumbnail', { ...valid, thumbnail: 7 }],
    ['an unknown piece type', { ...valid, pieces: [{ ...piece, type: 'rocket' }] }],
    ['a bad rotation', { ...valid, pieces: [{ ...piece, rotation: 45 }] }],
    ['a piece off the grid', { ...valid, pieces: [{ ...piece, gridX: 16 }] }],
    ['a fractional tile', { ...valid, pieces: [{ ...piece, gridZ: 1.5 }] }],
    ['a hill over the edge', { ...valid, pieces: [{ ...piece, type: 'hill', gridX: 15 }] }],
    ['overlapping pieces', { ...valid, pieces: [piece, { ...piece, id: 'other' }] }],
    ['a decoration on a track', { ...valid, pieces: [piece, { ...piece, id: 'other', type: 'house' }] }],
    ['duplicate piece ids', { ...valid, pieces: [piece, { ...piece, gridX: 5 }] }],
    [
      'two stations',
      {
        ...valid,
        pieces: [
          { ...piece, type: 'station' },
          { ...piece, id: 'other', type: 'station', gridX: 5 },
        ],
      },
    ],
  ])('rejects %s', (_, entry) => {
    expect(parseDiorama(entry)).toBeNull();
  });
});
