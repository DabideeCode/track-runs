import { describe, expect, it, vi } from 'vitest';
import {
  CORRUPT_BACKUP_PREFIX,
  SAVE_KEY,
  createSaveRepository,
  type DioramaDraft,
} from '@/persistence/saveRepository';
import { memoryStorage, type MemoryStorage } from '@/persistence/storage';
import type { Diorama } from '@/domain/types';

const T0 = '2026-10-29T10:00:00.000Z';
const T1 = '2026-10-29T11:00:00.000Z';
const T2 = '2026-10-29T12:00:00.000Z';

function diorama(id: string, updatedAt: string, extra: Partial<Diorama> = {}): Diorama {
  return {
    id,
    name: `Diorama ${id}`,
    setting: 'bedroom',
    startFacing: 0,
    pieces: [],
    createdAt: T0,
    updatedAt,
    ...extra,
  };
}

function fileWith(dioramas: unknown[]): string {
  return JSON.stringify({ version: 1, dioramas });
}

function setup(init: Record<string, string> = {}, startAt = T1) {
  const storage: MemoryStorage = memoryStorage(init);
  let time = new Date(startAt);
  let n = 0;
  const warn = vi.fn();
  const repo = createSaveRepository({
    storage,
    now: () => time,
    newId: () => `id-${++n}`,
    warn,
  });
  return {
    storage,
    repo,
    warn,
    setTime: (iso: string) => {
      time = new Date(iso);
    },
    stored: () => JSON.parse(storage.getItem(SAVE_KEY) as string) as { version: number; dioramas: unknown[] },
  };
}

const draft = (over: Partial<DioramaDraft> = {}): DioramaDraft => ({
  id: null,
  name: 'Untitled diorama',
  setting: 'kitchen',
  startFacing: 180,
  pieces: [{ id: 'p1', type: 'station', gridX: 3, gridZ: 4, rotation: 90 }],
  thumbnail: 'data:image/jpeg;base64,AAAA',
  ...over,
});

describe('list and get', () => {
  it('returns [] and logs nothing when the key is missing', () => {
    const { repo, warn } = setup();
    expect(repo.list()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('lists valid entries newest first and warns once per skipped entry', () => {
    const errorSpy = vi.spyOn(console, 'error');
    const { repo, warn } = setup({
      [SAVE_KEY]: fileWith([
        diorama('a', T0),
        { id: 'bad', name: '' },
        diorama('b', T2),
        42,
        diorama('a', T2), // duplicate id of a valid entry
        diorama('c', T1),
      ]),
    });
    expect(repo.list().map((d) => d.id)).toEqual(['b', 'c', 'a']);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs exactly one warning for a corrupt file', () => {
    for (const raw of ['', 'not json', '{"version":2,"dioramas":[]}', '[]']) {
      const { repo, warn } = setup({ [SAVE_KEY]: raw });
      expect(repo.list()).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
    }
  });

  it('get returns the valid entry with that id and logs nothing', () => {
    const { repo, warn } = setup({ [SAVE_KEY]: fileWith([{ id: 'x' }, diorama('a', T0)]) });
    expect(repo.get('a')?.name).toBe('Diorama a');
    expect(repo.get('x')).toBeNull();
    expect(repo.get('nope')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('upsert', () => {
  it('first save assigns a new id and equal UTC createdAt and updatedAt', () => {
    const { repo, stored } = setup({}, T1);
    const result = repo.upsert(draft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diorama).toEqual({
      id: 'id-1',
      name: 'Untitled diorama',
      setting: 'kitchen',
      startFacing: 180,
      pieces: [{ id: 'p1', type: 'station', gridX: 3, gridZ: 4, rotation: 90 }],
      createdAt: T1,
      updatedAt: T1,
      thumbnail: 'data:image/jpeg;base64,AAAA',
    });
    expect(stored()).toEqual({ version: 1, dioramas: [result.diorama] });
  });

  it('skips generated ids that are already used', () => {
    const { repo } = setup({ [SAVE_KEY]: fileWith([diorama('id-1', T0)]) });
    const result = repo.upsert(draft());
    expect(result.ok && result.diorama.id).toBe('id-2');
  });

  it('a later save replaces the entry in place, keeps id and createdAt and sets updatedAt', () => {
    const { repo, stored, setTime } = setup({
      [SAVE_KEY]: fileWith([diorama('a', T0), diorama('b', T0), { junk: true }]),
    });
    setTime(T2);
    const result = repo.upsert(draft({ id: 'a', name: 'Renamed', createdAt: T1 }));
    expect(result.ok).toBe(true);
    const { dioramas } = stored();
    expect(dioramas).toHaveLength(3);
    expect(dioramas[0]).toMatchObject({ id: 'a', name: 'Renamed', createdAt: T0, updatedAt: T2 });
    expect(dioramas[1]).toEqual(diorama('b', T0));
    expect(dioramas[2]).toEqual({ junk: true });
  });

  it('saves without a thumbnail field when none is given', () => {
    const { repo, stored } = setup({
      [SAVE_KEY]: fileWith([diorama('a', T0, { thumbnail: 'data:old' })]),
    });
    expect(repo.upsert(draft({ id: 'a', thumbnail: null })).ok).toBe(true);
    expect(stored().dioramas[0]).not.toHaveProperty('thumbnail');
  });

  it('clamps updatedAt to createdAt when the clock went backwards', () => {
    const { repo } = setup({ [SAVE_KEY]: fileWith([diorama('a', T1, { createdAt: T1 })]) }, T0);
    const result = repo.upsert(draft({ id: 'a' }));
    expect(result.ok && result.diorama.updatedAt).toBe(T1);
  });

  it('replaces an invalid stored entry with the same id instead of adding a second one', () => {
    const { repo, stored } = setup({ [SAVE_KEY]: fileWith([{ id: 'a', name: '' }, diorama('b', T0)]) });
    const result = repo.upsert(draft({ id: 'a', createdAt: T0 }));
    expect(result.ok).toBe(true);
    const { dioramas } = stored();
    expect(dioramas).toHaveLength(2);
    expect(dioramas[0]).toMatchObject({ id: 'a', createdAt: T0, updatedAt: T1 });
  });

  it('rejects an invalid draft without writing', () => {
    const { repo, storage } = setup();
    expect(repo.upsert(draft({ name: '   ' }))).toEqual({ ok: false, reason: 'invalid' });
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('rename', () => {
  it('stores the trimmed name and keeps id, createdAt and thumbnail', () => {
    const before = diorama('a', T0, { thumbnail: 'data:thumb' });
    const { repo, stored, setTime } = setup({ [SAVE_KEY]: fileWith([before, diorama('b', T0)]) });
    setTime(T2);
    const result = repo.rename('a', '  My railway  ');
    expect(result.ok).toBe(true);
    const { dioramas } = stored();
    expect(dioramas[0]).toEqual({ ...before, name: 'My railway', updatedAt: T2 });
    expect(dioramas[1]).toEqual(diorama('b', T0));
  });

  it('rejects names that are empty or over 40 characters after trimming', () => {
    const raw = fileWith([diorama('a', T0)]);
    const { repo, storage } = setup({ [SAVE_KEY]: raw });
    expect(repo.rename('a', '   ')).toEqual({ ok: false, reason: 'invalid_name' });
    expect(repo.rename('a', 'x'.repeat(41))).toEqual({ ok: false, reason: 'invalid_name' });
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
  });

  it('returns not_found for an unknown id', () => {
    const { repo } = setup({ [SAVE_KEY]: fileWith([diorama('a', T0)]) });
    expect(repo.rename('zzz', 'Name')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('remove', () => {
  it('removes only that entry and leaves the others unchanged', () => {
    const { repo, stored } = setup({
      [SAVE_KEY]: fileWith([diorama('a', T0), { broken: 1 }, diorama('b', T1)]),
    });
    const result = repo.remove('a');
    expect(result.ok && result.diorama.id).toBe('a');
    expect(stored().dioramas).toEqual([{ broken: 1 }, diorama('b', T1)]);
    expect(repo.remove('a')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('corrupt data backup', () => {
  it('copies the raw value to a new backup key before writing, adding -2, -3 when taken', () => {
    const raw = '{oops';
    const key = `${CORRUPT_BACKUP_PREFIX}${T1}`;
    const { repo, storage, stored } = setup({
      [SAVE_KEY]: raw,
      [key]: 'older backup',
      [`${key}-2`]: 'older backup 2',
    });
    expect(repo.upsert(draft()).ok).toBe(true);
    expect(storage.getItem(key)).toBe('older backup');
    expect(storage.getItem(`${key}-2`)).toBe('older backup 2');
    expect(storage.getItem(`${key}-3`)).toBe(raw);
    expect(stored().dioramas).toHaveLength(1);
  });

  it('uses the plain timestamp key when it is free', () => {
    const { repo, storage } = setup({ [SAVE_KEY]: '' });
    expect(repo.upsert(draft()).ok).toBe(true);
    expect(storage.getItem(`${CORRUPT_BACKUP_PREFIX}${T1}`)).toBe('');
  });

  it('aborts with backup_failed and leaves the main key untouched when the backup write throws', () => {
    const raw = 'not json';
    const { repo, storage } = setup({ [SAVE_KEY]: raw });
    storage.setFailWrites((k) => k.startsWith(CORRUPT_BACKUP_PREFIX));
    expect(repo.upsert(draft())).toEqual({ ok: false, reason: 'backup_failed' });
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    expect(storage.keys()).toEqual([SAVE_KEY]);
  });

  it('does not write anything for rename or remove on a corrupt file', () => {
    const { repo, storage } = setup({ [SAVE_KEY]: 'garbage' });
    expect(repo.rename('a', 'x')).toEqual({ ok: false, reason: 'not_found' });
    expect(repo.remove('a')).toEqual({ ok: false, reason: 'not_found' });
    expect(storage.keys()).toEqual([SAVE_KEY]);
  });
});

describe('write failures', () => {
  it('leaves the stored value unchanged for upsert, rename and remove', () => {
    const raw = fileWith([diorama('a', T0)]);
    const { repo, storage } = setup({ [SAVE_KEY]: raw });
    storage.setFailWrites(true);
    expect(repo.upsert(draft())).toEqual({ ok: false, reason: 'write_failed' });
    expect(repo.upsert(draft({ id: 'a' }))).toEqual({ ok: false, reason: 'write_failed' });
    expect(repo.rename('a', 'New')).toEqual({ ok: false, reason: 'write_failed' });
    expect(repo.remove('a')).toEqual({ ok: false, reason: 'write_failed' });
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
  });
});
