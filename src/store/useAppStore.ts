/**
 * React binding for the app store.
 *
 * Decision: the store instance is passed down through a React context, not
 * held in a module-level singleton. The bootstrap (task 11.4) creates one store
 * with `createAppStore(deps)`, hands that same instance to the test hook
 * (`installTestHook`, task 11.3) and to `<AppStoreProvider store={store}>`, so
 * the UI and `window.__DIORAMA__` always share one store. Component tests
 * render with their own store and need no global reset.
 */
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { AppStore } from './createAppStore';
import type { AppState } from './types';

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider(props: { store: AppStore; children?: ReactNode }) {
  return createElement(AppStoreContext.Provider, { value: props.store }, props.children);
}

/** The raw store, for imperative calls (input handlers, effects). */
export function useAppStoreApi(): AppStore {
  const store = useContext(AppStoreContext);
  if (store === null) throw new Error('useAppStore must be used inside <AppStoreProvider>.');
  return store;
}

/** Subscribes to one value; re-renders when it changes by `Object.is`. */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(useAppStoreApi(), selector);
}

/**
 * Subscribes to an object or array built by `selector`; re-renders only when
 * one of its top-level entries changes (shallow comparison).
 */
export function useAppStoreShallow<T>(selector: (state: AppState) => T): T {
  return useStore(useAppStoreApi(), useShallow(selector));
}
