import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isReadableDiorama,
  readDioramas,
  removeDiorama,
  SAVE_KEY,
  writeDiorama,
  type StorageLike,
} from '@/persistence/saveFile';
import type { Diorama } from '@/domain/types';

function memoryStorage(initial?: string): StorageLike & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

function diorama(overrides: Partial<Diorama> = {}): Diorama {
  return {
    id: 'a',
    name: 'Loop',
    setting: 'bedroom',
    startFacing: 0,
    pieces: [{ id: 'p', type: 'station', gridX: 1, gridZ: 1, rotation: 0 }],
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
    ...overrides,
  };
}

const file = (entries: unknown[]) => JSON.stringify({ version: 1, dioramas: entries });

describe('isReadableDiorama', () => {
  it('accepts a valid entry', () => {
    expect(isReadableDiorama(diorama())).toBe(true);
    expect(isReadableDiorama(diorama({ thumbnail: 'data:image/jpeg;base64,AA' }))).toBe(true);
  });

  it.each([
    ['a blank id', { id: '' }],
    ['a blank name', { name: '  ' }],
    ['a long name', { name: 'a'.repeat(41) }],
    ['an unknown setting', { setting: 'garden' }],
    ['a bad facing', { startFacing: 90 }],
    ['a bad date', { createdAt: 'yesterday' }],
    ['a bad thumbnail', { thumbnail: 5 }],
    ['an unknown piece type', { pieces: [{ id: 'p', type: 'rocket', gridX: 1, gridZ: 1, rotation: 0 }] }],
    ['a piece off the grid', { pieces: [{ id: 'p', type: 'house', gridX: 16, gridZ: 1, rotation: 0 }] }],
    ['a fractional tile', { pieces: [{ id: 'p', type: 'house', gridX: 1.5, gridZ: 1, rotation: 0 }] }],
    ['a bad rotation', { pieces: [{ id: 'p', type: 'house', gridX: 1, gridZ: 1, rotation: 45 }] }],
    [
      'duplicate piece ids',
      {
        pieces: [
          { id: 'p', type: 'house', gridX: 1, gridZ: 1, rotation: 0 },
          { id: 'p', type: 'house', gridX: 2, gridZ: 1, rotation: 0 },
        ],
      },
    ],
    [
      'overlapping pieces',
      {
        pieces: [
          { id: 'p', type: 'house', gridX: 1, gridZ: 1, rotation: 0 },
          { id: 'q', type: 'car', gridX: 1, gridZ: 1, rotation: 0 },
        ],
      },
    ],
    [
      'two stations',
      {
        pieces: [
          { id: 'p', type: 'station', gridX: 1, gridZ: 1, rotation: 0 },
          { id: 'q', type: 'station', gridX: 2, gridZ: 1, rotation: 0 },
        ],
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(isReadableDiorama({ ...diorama(), ...overrides })).toBe(false);
  });
});

describe('readDioramas', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(console.warn).mockClear();
  });

  it('treats a missing file as empty with no warning', () => {
    expect(readDioramas(memoryStorage())).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([['not json'], ['null'], ['[]'], ['{"version":2,"dioramas":[]}'], ['{"version":1}']])(
    'warns and returns nothing for %s',
    (text) => {
      expect(readDioramas(memoryStorage(text))).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    },
  );

  it('skips only the unreadable entry', () => {
    const storage = memoryStorage(file([diorama(), { id: 'bad' }]));
    expect(readDioramas(storage).map((entry) => entry.id)).toEqual(['a']);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('survives a storage that throws', () => {
    const storage: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {},
    };
    expect(readDioramas(storage)).toEqual([]);
  });
});

describe('writeDiorama', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('adds a new entry to an empty file', () => {
    const storage = memoryStorage();
    expect(writeDiorama(diorama(), storage)).toBe(true);
    expect(JSON.parse(storage.value!)).toEqual({ version: 1, dioramas: [diorama()] });
  });

  it('replaces only the matching id', () => {
    const storage = memoryStorage(file([diorama(), diorama({ id: 'b' })]));
    writeDiorama(diorama({ name: 'Renamed' }), storage);
    const saved = JSON.parse(storage.value!).dioramas;
    expect(saved.map((entry: Diorama) => entry.name)).toEqual(['Renamed', 'Loop']);
  });

  it('keeps unreadable entries untouched', () => {
    const storage = memoryStorage(file([{ id: 'bad', junk: true }, diorama()]));
    writeDiorama(diorama({ id: 'b' }), storage);
    expect(JSON.parse(storage.value!).dioramas[0]).toEqual({ id: 'bad', junk: true });
  });

  it('replaces a file that cannot be read', () => {
    const storage = memoryStorage('not json');
    writeDiorama(diorama(), storage);
    expect(readDioramas(storage)).toHaveLength(1);
  });

  it('reports a failed write', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem() {
        throw new Error('full');
      },
    };
    expect(writeDiorama(diorama(), storage)).toBe(false);
  });
});

describe('removeDiorama', () => {
  it('removes by id and keeps the rest', () => {
    const storage = memoryStorage(file([diorama(), { id: 'bad' }]));
    expect(removeDiorama('a', storage)).toBe(true);
    expect(JSON.parse(storage.value!).dioramas).toEqual([{ id: 'bad' }]);
  });

  it('uses the expected storage key', () => {
    expect(SAVE_KEY).toBe('wooden-diorama:v1');
  });
});
