// Feature: track-diorama-builder, Property 26: SaveFile JSON round trip
/**
 * **Validates: Requirements 36.2, 36.8**
 *
 * For any valid SaveFile, `parseSaveFile(JSON.stringify(file))` returns status
 * `ok` with the same version, the same dioramas in the same order and the same
 * field values, and each diorama's pieces in the same order with the same
 * values. A second stringify/parse cycle of the parsed result is stable.
 *
 * The generator builds valid files from the rules (see `arbitraries.ts`), not
 * from the validator under test.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseSaveFile } from '@/domain/saveFormat';
import { arbSaveFile } from './arbitraries';

describe('Property 26: SaveFile JSON round trip', () => {
  it('stringify then parseSaveFile returns the same dioramas, and a second cycle is stable', () => {
    fc.assert(
      fc.property(arbSaveFile(), (file) => {
        const json = JSON.stringify(file);
        const first = parseSaveFile(json);
        expect(first.status).toBe('ok');
        if (first.status !== 'ok') return;

        // Same version is implied by status ok (only version 1 parses).
        expect(first.invalidCount).toBe(0);
        expect(first.entries).toHaveLength(file.dioramas.length);
        expect(first.valid).toStrictEqual(file.dioramas);
        // Order of dioramas and of each diorama's pieces is preserved.
        expect(first.valid.map((d) => d.id)).toStrictEqual(file.dioramas.map((d) => d.id));
        first.valid.forEach((d, i) => {
          expect(d.pieces.map((p) => p.id)).toStrictEqual(file.dioramas[i].pieces.map((p) => p.id));
        });

        // Second cycle: the parsed result round trips to the same value and JSON.
        const json1 = JSON.stringify({ version: 1, dioramas: first.valid });
        const second = parseSaveFile(json1);
        expect(second.status).toBe('ok');
        if (second.status !== 'ok') return;
        expect(second.invalidCount).toBe(0);
        expect(second.valid).toStrictEqual(first.valid);
        expect(JSON.stringify({ version: 1, dioramas: second.valid })).toBe(json1);
      }),
      { numRuns: 100 },
    );
  });
});
