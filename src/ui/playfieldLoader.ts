/**
 * Code-split loading of the playfield (task 17.2; design section 12, D-59;
 * Requirement 32.6).
 *
 * The playfield pulls in Three.js, React Three Fiber, drei and react-spring,
 * which together are most of the app's JavaScript. Keeping them out of the
 * first chunk lets the main menu become interactive sooner. The chunk is then
 * prefetched while the menu is idle, so opening a diorama normally finds it
 * already loaded.
 *
 * `createPlayfieldLoader(load)` wraps a module loader:
 * - `load()` shares one in-flight or finished import; after a failure the next
 *   call starts a new import, so a retry can succeed.
 * - `prefetch()` starts the import and reports a failure with `console.warn`
 *   (never an unhandled rejection or `console.error`).
 * - `component()` returns the playfield component itself once the module has
 *   loaded (for example after the prefetch), so it renders with no Suspense
 *   step. Before that it returns a `React.lazy` component for the module; the
 *   same one until a load through it fails, then a new one, because
 *   `React.lazy` keeps a rejected import forever. Callers pin the result per
 *   mount (`useState`), so a later re-render never swaps the lazy wrapper for
 *   the loaded component, which would remount the playfield. Call it inside
 *   the error boundary's subtree, so "Try again" after a failed chunk load
 *   mounts again and retries the import.
 * - The finished promise is also marked `status: 'fulfilled'` (the thenable
 *   fields React reads).
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface PlayfieldModule {
  default: ComponentType;
}

export interface PlayfieldLoader {
  load(): Promise<PlayfieldModule>;
  prefetch(): void;
  component(): ComponentType | LazyExoticComponent<ComponentType>;
}

type TrackedPromise<T> = Promise<T> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: T; reason?: unknown };

export function createPlayfieldLoader(
  importModule: () => Promise<PlayfieldModule>,
  warn: (message: string, error: unknown) => void = (message, error) => console.warn(message, error),
): PlayfieldLoader {
  let pending: TrackedPromise<PlayfieldModule> | null = null;
  let current: LazyExoticComponent<ComponentType> | null = null;
  let currentFailed = false;

  function load(): Promise<PlayfieldModule> {
    if (pending) return pending;
    let promise: TrackedPromise<PlayfieldModule>;
    try {
      promise = importModule() as TrackedPromise<PlayfieldModule>;
    } catch (error) {
      promise = Promise.reject(error) as TrackedPromise<PlayfieldModule>;
    }
    promise.status = 'pending';
    promise.then(
      (mod) => {
        promise.status = 'fulfilled';
        promise.value = mod;
      },
      (reason: unknown) => {
        promise.status = 'rejected';
        promise.reason = reason;
        // Forget the failure so the next load starts a new import.
        if (pending === promise) pending = null;
      },
    );
    pending = promise;
    return promise;
  }

  return {
    load,
    prefetch() {
      load().catch((error: unknown) => warn('The playfield could not be prefetched. It will load when opened.', error));
    },
    component() {
      if (pending?.status === 'fulfilled' && pending.value) return pending.value.default;
      if (!current || currentFailed) {
        currentFailed = false;
        const made = lazy(() =>
          load().catch((error: unknown) => {
            if (current === made) currentFailed = true;
            throw error;
          }),
        );
        current = made;
      }
      return current;
    },
  };
}

/**
 * Runs `task` when the browser is idle (`requestIdleCallback`), or after a
 * short timeout where that is missing (Safari). Returns a cancel function.
 */
export function whenIdle(
  task: () => void,
  win: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  } = globalThis,
): () => void {
  if (typeof win.requestIdleCallback === 'function') {
    const handle = win.requestIdleCallback(task, { timeout: 2000 });
    return () => win.cancelIdleCallback?.(handle);
  }
  const handle = win.setTimeout(task, 200);
  return () => win.clearTimeout(handle);
}

/** The app's playfield loader: the dynamic import is the only reference to the playfield module. */
export const playfieldLoader: PlayfieldLoader = createPlayfieldLoader(() => import('@/ui/Playfield'));
