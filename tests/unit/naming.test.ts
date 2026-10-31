import { describe, expect, it } from 'vitest';
import { nextDefaultName, normaliseName } from '@/domain/naming';

describe('normaliseName', () => {
  it('trims and accepts 1 to 40 characters', () => {
    expect(normaliseName('  Loop line  ')).toBe('Loop line');
    expect(normaliseName('x')).toBe('x');
    expect(normaliseName('x'.repeat(40))).toBe('x'.repeat(40));
  });

  it('refuses blank and over-long names', () => {
    expect(normaliseName('')).toBeNull();
    expect(normaliseName('   ')).toBeNull();
    expect(normaliseName('x'.repeat(41))).toBeNull();
  });

  it('measures length after trimming', () => {
    expect(normaliseName(`  ${'x'.repeat(40)}  `)).toBe('x'.repeat(40));
  });
});

describe('nextDefaultName', () => {
  it('starts with the plain name', () => {
    expect(nextDefaultName([])).toBe('Untitled diorama');
    expect(nextDefaultName(['Something else'])).toBe('Untitled diorama');
  });

  it('numbers from 2 upward', () => {
    expect(nextDefaultName(['Untitled diorama'])).toBe('Untitled diorama 2');
    expect(nextDefaultName(['Untitled diorama', 'Untitled diorama 2'])).toBe('Untitled diorama 3');
  });

  it('uses the lowest free number', () => {
    expect(nextDefaultName(['Untitled diorama', 'Untitled diorama 3'])).toBe('Untitled diorama 2');
    expect(nextDefaultName(['Untitled diorama 2'])).toBe('Untitled diorama');
  });
});
