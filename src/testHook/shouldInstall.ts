/**
 * When the `window.__DIORAMA__` test hook is installed (Section 10.2 of
 * requirement.md; Requirements 38.1 to 38.3).
 *
 * This module is deliberately tiny and separate from `installTestHook.ts`, so
 * the bootstrap can import it statically and load the hook module itself only
 * through a dynamic `import()`. A production build without `?test=1` therefore
 * never downloads or runs the hook code.
 */

/** The part of `window.location` the check reads. */
export interface LocationLike {
  search: string;
}

/** The part of `import.meta.env` the check reads. */
export interface EnvLike {
  DEV?: boolean;
}

/**
 * True in development mode, or when the query string has the parameter
 * `test` equal to `1` (for example `?test=1` or `?foo=bar&test=1`).
 * Pure: reads only its arguments and never throws.
 */
export function shouldInstallTestHook(location: LocationLike | null | undefined, env: EnvLike | null | undefined): boolean {
  if (env?.DEV === true) return true;
  const search = typeof location?.search === 'string' ? location.search : '';
  return new URLSearchParams(search).getAll('test').includes('1');
}
