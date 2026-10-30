/**
 * Root component (task 15.6; design section 10.1, Error Handling, D-58;
 * Requirements 3.1, 3.6, 3.8, 37.7, 37.13, 37.15, 40.4).
 *
 * - Shows `MainMenu` or `Playfield` from the store's `screen`.
 * - The dialogs and toasts are rendered on both screens, outside the screen
 *   boundaries, so a crashed screen can still show the unsaved-changes dialog
 *   and its toasts. Both dialogs are driven only by the store's `dialog`.
 * - Each screen sits in its own error boundary keyed by the screen, so a
 *   change of screen always starts it fresh. The fallback's "Back to menu":
 *   on the playfield calls `backToMenu()`, which opens the unsaved-changes
 *   dialog when the diorama is dirty, so a crash never discards work without
 *   asking; on the menu it reloads the saved list and renders the menu again.
 * - The document title stays "Track" (set in `index.html`; nothing changes it).
 * - The playfield is code-split (task 17.2, D-59): it is rendered through
 *   `playfieldLoader.component()` inside its error boundary and a Suspense
 *   fallback, and its chunk is prefetched once the menu has rendered and the
 *   browser is idle. A chunk that fails to load is caught by the playfield
 *   boundary, whose "Back to menu" works as for any playfield crash and whose
 *   "Try again" starts a new import.
 */
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useAppStore, useAppStoreApi } from '@/store/useAppStore';
import { DeleteDioramaDialog } from '@/ui/DeleteDioramaDialog';
import { ErrorBoundary, RecoveryNotice } from '@/ui/ErrorBoundary';
import { MainMenu } from '@/ui/MainMenu';
import { playfieldLoader as defaultPlayfieldLoader, whenIdle, type PlayfieldLoader } from '@/ui/playfieldLoader';
import { Toasts } from '@/ui/Toasts';
import { UnsavedChangesDialog } from '@/ui/UnsavedChangesDialog';

export const MENU_ERROR_DETAIL = 'The main menu could not be shown.';
export const PLAYFIELD_ERROR_DETAIL = 'The playfield could not be shown. Your diorama is still here.';

function ScreenFallback({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center bg-background p-4 text-foreground">{children}</div>;
}

export const PLAYFIELD_LOADING_LABEL = 'Loading the playfield…';

/**
 * Shown while the playfield chunk loads: the playfield's own full-viewport
 * background with a small centred panel, so nothing shifts when it appears.
 */
export function PlayfieldLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background" aria-busy="true">
      <p role="status" className="panel text-sm text-muted-foreground motion-safe:animate-fade-in">
        {PLAYFIELD_LOADING_LABEL}
      </p>
    </div>
  );
}

/**
 * Rendered inside the playfield boundary, so a boundary reset mounts it again
 * and asks the loader again. The component type is pinned for the life of the
 * mount: a re-render must not swap the lazy wrapper for the loaded component.
 */
function PlayfieldScreen({ loader }: { loader: PlayfieldLoader }) {
  const [Playfield] = useState(() => loader.component());
  return (
    <Suspense fallback={<PlayfieldLoading />}>
      <Playfield />
    </Suspense>
  );
}

export interface AppProps {
  /** Loads the playfield chunk; tests inject a controllable one. */
  playfieldLoader?: PlayfieldLoader;
}

export function App({ playfieldLoader = defaultPlayfieldLoader }: AppProps = {}) {
  const store = useAppStoreApi();
  const screen = useAppStore((s) => s.screen);
  const onMenu = screen === 'menu';
  // Prefetch the playfield chunk once the menu is on screen and the browser
  // is idle (Requirement 32.6). Loading it twice is harmless: the loader
  // shares one import.
  useEffect(() => {
    if (!onMenu) return;
    return whenIdle(() => playfieldLoader.prefetch());
  }, [onMenu, playfieldLoader]);
  // A failed dialog or toast layer tries again on the next dialog or toast.
  const dialogKind = useAppStore((s) => s.dialog?.kind ?? null);
  const lastToastId = useAppStore((s) => s.toasts[s.toasts.length - 1]?.id ?? null);

  const backToMenu = () => {
    store.getState().playUi();
    store.getState().backToMenu();
  };

  return (
    <>
      {screen === 'menu' ? (
        <ErrorBoundary
          key="menu"
          name="main menu"
          fallback={(reset) => (
            <ScreenFallback>
              <RecoveryNotice
                detail={MENU_ERROR_DETAIL}
                onBackToMenu={() => {
                  store.getState().playUi();
                  store.getState().refreshList();
                  reset();
                }}
              />
            </ScreenFallback>
          )}
        >
          <MainMenu />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary
          key="playfield"
          name="playfield"
          fallback={(reset) => (
            <ScreenFallback>
              <RecoveryNotice
                detail={PLAYFIELD_ERROR_DETAIL}
                onTryAgain={() => {
                  store.getState().playUi();
                  reset();
                }}
                onBackToMenu={backToMenu}
              />
            </ScreenFallback>
          )}
        >
          <PlayfieldScreen loader={playfieldLoader} />
        </ErrorBoundary>
      )}
      <ErrorBoundary name="dialogs" resetKey={dialogKind} fallback={() => null}>
        <DeleteDioramaDialog />
        <UnsavedChangesDialog />
      </ErrorBoundary>
      <ErrorBoundary name="notifications" resetKey={lastToastId} fallback={() => null}>
        <Toasts />
      </ErrorBoundary>
    </>
  );
}

export default App;
