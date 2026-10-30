import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserStorage, memoryStorage } from '@/persistence/storage';

/** Minimal Storage implementation backed by a Map, standing in for window.localStorage. */
class FakeLocalStorage implements Storage {
  private data = new Map<string, string>();
  failReads = false;
  failWrites = false;
  get length(): number {
    if (this.failReads) throw new Error('SecurityError');
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    if (this.failReads) throw new Error('SecurityError');
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(key, value);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('memoryStorage', () => {
  it('reads initial values, writes and lists keys', () => {
    const s = memoryStorage({ a: '1' });
    expect(s.getItem('a')).toBe('1');
    expect(s.getItem('missing')).toBeNull();
    s.setItem('b', '2');
    s.setItem('a', 'x');
    expect(s.getItem('a')).toBe('x');
    expect(s.keys()).toEqual(['a', 'b']);
  });

  it('does not share state with the init object', () => {
    const init = { a: '1' };
    const s = memoryStorage(init);
    s.setItem('a', '2');
    expect(init.a).toBe('1');
  });

  it('throws QuotaExceededError and keeps the old value when writes fail', () => {
    const s = memoryStorage({ a: '1' }, { failWrites: true });
    let caught: unknown;
    try {
      s.setItem('a', '2');
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).name).toBe('QuotaExceededError');
    expect(s.getItem('a')).toBe('1');
    expect(s.keys()).toEqual(['a']);
  });

  it('supports a per-key predicate and runtime toggling', () => {
    const s = memoryStorage({}, { failWrites: (key) => key.startsWith('bad') });
    s.setItem('good', '1');
    expect(() => s.setItem('bad:1', 'x')).toThrow();
    expect(s.getItem('bad:1')).toBeNull();

    s.setFailWrites(true);
    expect(() => s.setItem('good', '2')).toThrow();
    expect(s.getItem('good')).toBe('1');

    s.setFailWrites(false);
    s.setItem('bad:1', 'x');
    expect(s.getItem('bad:1')).toBe('x');
  });
});

describe('browserStorage', () => {
  it('wraps window.localStorage when it is accessible', () => {
    const ls = new FakeLocalStorage();
    ls.setItem('existing', 'v');
    vi.stubGlobal('window', { localStorage: ls });
    const warn = vi.fn();
    const s = browserStorage({ warn });
    expect(s.persistent).toBe(true);
    expect(s.getItem('existing')).toBe('v');
    s.setItem('k', '1');
    expect(ls.getItem('k')).toBe('1');
    expect(s.keys().sort()).toEqual(['existing', 'k']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('lets write failures propagate so callers can report them', () => {
    const ls = new FakeLocalStorage();
    ls.setItem('k', 'old');
    ls.failWrites = true;
    vi.stubGlobal('window', { localStorage: ls });
    const s = browserStorage({ warn: vi.fn() });
    expect(() => s.setItem('k', 'new')).toThrow();
    expect(s.getItem('k')).toBe('old');
  });

  it('returns null and warns once when reads throw after the probe', () => {
    const ls = new FakeLocalStorage();
    vi.stubGlobal('window', { localStorage: ls });
    const warn = vi.fn();
    const s = browserStorage({ warn });
    ls.failReads = true;
    expect(s.getItem('a')).toBeNull();
    expect(s.getItem('b')).toBeNull();
    expect(s.keys()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to memory with one warning when the localStorage getter throws', () => {
    const win = {};
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    vi.stubGlobal('window', win);
    const warn = vi.fn();
    const errorSpy = vi.spyOn(console, 'error');
    const s = browserStorage({ warn });
    expect(s.persistent).toBe(false);
    s.setItem('k', '1');
    expect(s.getItem('k')).toBe('1');
    expect(s.keys()).toEqual(['k']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('falls back to memory when localStorage is missing or window is undefined', () => {
    vi.stubGlobal('window', {});
    const warn = vi.fn();
    expect(browserStorage({ warn }).persistent).toBe(false);
    vi.stubGlobal('window', undefined);
    expect(browserStorage({ warn }).persistent).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('uses console.warn (not console.error) by default for the fallback', () => {
    vi.stubGlobal('window', {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error');
    browserStorage();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
