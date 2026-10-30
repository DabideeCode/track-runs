import { describe, expect, it } from 'vitest';
import { nextDefaultName, validateName } from '@/domain/names';

describe('nextDefaultName', () => {
  it('numbers from 2 when the name is taken', () => {
    expect(nextDefaultName([])).toBe('Untitled diorama');
    expect(nextDefaultName(['Untitled diorama'])).toBe('Untitled diorama 2');
    expect(nextDefaultName(['Untitled diorama', 'Untitled diorama 2'])).toBe('Untitled diorama 3');
  });

  it('fills the lowest free number and matches exactly', () => {
    expect(nextDefaultName(['Untitled diorama', 'Untitled diorama 3'])).toBe('Untitled diorama 2');
    expect(nextDefaultName(['untitled diorama'])).toBe('Untitled diorama');
  });
});

describe('validateName', () => {
  it('trims before checking', () => {
    expect(validateName('  Loop  ')).toEqual({ ok: true, name: 'Loop' });
  });

  it('accepts 1 and 40 characters', () => {
    expect(validateName('a').ok).toBe(true);
    expect(validateName('a'.repeat(40)).ok).toBe(true);
  });

  it('rejects blank and 41 characters', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('    ').ok).toBe(false);
    expect(validateName('a'.repeat(41)).ok).toBe(false);
  });
});
