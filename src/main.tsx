import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { createAppServices, installTestHookIfAllowed } from '@/app/bootstrap';
import { SceneBridgeContext, TrainRuntimeContext } from '@/scene/context';
import { AppStoreProvider } from '@/store/useAppStore';
import { shouldShowPerfOverlay } from '@/ui/perfOverlayLogic';
import '@/index.css';

// Development-only FPS overlay with `?perf=1` (task 17.2, D-60). The
// condition is evaluated once. `import.meta.env.DEV` is the literal `false` in
// a production build, so the branch and its dynamic import are removed and the
// overlay module is not part of the build.
const PerfOverlay =
  import.meta.env.DEV && shouldShowPerfOverlay(import.meta.env, window.location.search)
    ? lazy(() => import('@/ui/PerfOverlay'))
    : null;

async function main(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element #root not found');
  }

  const services = createAppServices();

  // The hook must exist before the menu first renders (Requirement 38.4).
  // A failure to load it must not stop the app.
  try {
    await installTestHookIfAllowed(services);
  } catch (error) {
    console.warn('The test hook could not be installed.', error);
  }

  // React 19 reports errors caught by an error boundary with `console.error`
  // by default. The app's boundaries show a fallback and recover, so these
  // are expected problems and are reported with `console.warn` (D-58,
  // Requirement 40.4). Uncaught errors keep React's default reporting.
  const root = createRoot(rootElement, {
    onCaughtError: (error, info) => {
      console.warn('A part of the page failed and was replaced by a fallback.', error, info.componentStack);
    },
  });
  root.render(
    <StrictMode>
      <AppStoreProvider store={services.store}>
        <SceneBridgeContext.Provider value={services.sceneBridge}>
          <TrainRuntimeContext.Provider value={services.trainRuntime}>
            <App />
            {PerfOverlay && (
              <Suspense fallback={null}>
                <PerfOverlay />
              </Suspense>
            )}
          </TrainRuntimeContext.Provider>
        </SceneBridgeContext.Provider>
      </AppStoreProvider>
    </StrictMode>,
  );
}

void main();
