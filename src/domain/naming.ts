/**
 * Diorama naming rules (Requirements 4.2, 4.3, 5.2, 5.3).
 *
 * Pure functions with no imports. Name length is measured in UTF-16 code
 * units (`string.length`), matching the `maxLength` attribute on inputs (D-14).
 */

/** Base name for a new diorama. */
export const UNTITLED_BASE = 'Untitled diorama';

/** Minimum name length after trimming. */
export const NAME_MIN_LENGTH = 1;

/** Maximum name length after trimming. */
export const NAME_MAX_LENGTH = 40;

/** Validation message shown when a rename is rejected (Requirement 5.3). */
export const NAME_VALIDATION_MESSAGE = 'Names must be 1 to 40 characters.';

/**
 * Returns "Untitled diorama" when no saved diorama has that exact name.
 * Otherwise returns "Untitled diorama N" for the smallest integer N ≥ 2 that
 * no saved diorama uses. Comparison is exact and case-sensitive.
 */
export function nextUntitledName(savedNames: readonly string[]): string {
  const taken = new Set(savedNames);
  if (!taken.has(UNTITLED_BASE)) return UNTITLED_BASE;
  // At most savedNames.length candidates can be taken, so this terminates.
  for (let n = 2; ; n++) {
    const candidate = `${UNTITLED_BASE} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Trims leading and trailing whitespace and accepts the result when it is
 * 1 to 40 UTF-16 code units long.
 */
export function validateName(input: string): { ok: true; name: string } | { ok: false } {
  if (typeof input !== 'string') return { ok: false };
  const name = input.trim();
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) return { ok: false };
  return { ok: true, name };
}
