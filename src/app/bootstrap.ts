/**
 * Builds the app's services once and wires them together (design section
 * "Layering", rule 4; DD-2).
 *
 * `createAppServices` creates the storage, the two repositories, the audio
 * manager, the train runtime, the scene bridge and the store, in that order,
 * and connects them. Everything that touches the page (storage, the window for
 * the audio unlock and the blur listener) is injectable, so a unit test can
 * build the same graph with memory storage and fake audio.
 *
 * `installTestHookIfAllowed` loads `window.__DIORAMA__` only when
 * `shouldInstallTestHook` says so, through a dynamic `import()`. A production
 * build without `?test=1` therefore never downloads the hook module
 * (Requirements 38.1 to 38.3).
 */
import { nanoid } from 'nanoid';
import { createAudioManager, type AudioManager } from '@/audio/AudioManager';
import { createSaveRepository, type SaveRepository } from '@/persistence/saveRepository';
import { createSettingsRepository, type SettingsRepository } from '@/persistence/settingsRepository';
import { browserStorage, type KeyValueStorage, type WarnFn } from '@/persistence/storage';
import { SceneBridge } from '@/runtime/SceneBridge';
import { TrainRuntime, type BlurTarget } from '@/runtime/TrainRuntime';
import { createAppStore, type AppStore } from '@/store/createAppStore';
import type { Timers } from '@/store/ports';
import { shouldInstallTestHook, type EnvLike, type LocationLike } from '@/testHook/shouldInstall';

/** Toast shown once when localStorage cannot be used at all (D-30). */
export const TOAST_STORAGE_UNAVAILABLE = 'Saving is unavailable in this browser. Your dioramas will not be kept after you close the page.';

/** The page objects the services attach listeners to. `window` in the browser. */
export type ServiceWindow = EventTarget & BlurTarget;

export interface AppServicesDeps {
  /** Defaults to `browserStorage()` (localStorage, or memory with a warning). */
  storage?: KeyValueStorage & { readonly persistent?: boolean };
  /** Defaults to `createAudioManager()` with Howler. */
  audio?: AudioManager;
  /** Target for the audio unlock and the blur listener; defaults to `window`, none in Node. */
  window?: ServiceWindow | null;
  /** Clock in epoch milliseconds; defaults to `Date.now`. */
  now?: () => number;
  /** Piece id generator; defaults to `nanoid`. */
  newId?: () => string;
  /** Diorama id generator for the save repository; defaults to `nanoid`. */
  newDioramaId?: () => string;
  timers?: Timers;
  warn?: WarnFn;
}

export interface AppServices {
  storage: KeyValueStorage;
  saves: SaveRepository;
  settings: SettingsRepository;
  audio: AudioManager;
  trainRuntime: TrainRuntime;
  sceneBridge: SceneBridge;
  store: AppStore;
  /** Removes listeners and stops the store's timers. Used by tests and hot reload. */
  dispose(): void;
}

const defaultWarn: WarnFn = (message, data) => {
  if (data === undefined) console.warn(message);
  else console.warn(message, data);
};

function defaultWindow(): ServiceWindow | null {
  return typeof window !== 'undefined' ? window : null;
}

/** Builds and connects every service. Synchronous; touches no audio hardware before a user gesture. */
export function createAppServices(deps: AppServicesDeps = {}): AppServices {
  const warn = deps.warn ?? defaultWarn;
  const now = deps.now ?? (() => Date.now());
  const win = deps.window === undefined ? defaultWindow() : deps.window;

  const storage = deps.storage ?? browserStorage({ warn });
  const saves = createSaveRepository({
    storage,
    now: () => new Date(now()),
    newId: deps.newDioramaId,
    warn,
  });
  const settings = createSettingsRepository({ storage, warn });

  // The manager starts with defaults; the stored settings are applied below,
  // once the store has read them, so an invalid stored value warns only once.
  const audio = deps.audio ?? createAudioManager({ warn });
  const trainRuntime = new TrainRuntime(audio);
  const sceneBridge = new SceneBridge();

  const store = createAppStore({
    audio,
    train: trainRuntime,
    scene: sceneBridge,
    saves,
    settings,
    now,
    newId: deps.newId ?? (() => nanoid()),
    timers: deps.timers,
    warn,
  });

  // Stored audio settings (Requirement 27.8). Low quality is read by the store
  // itself (`lowQuality` in its initial state) and the canvas reads it from
  // there, so the stored quality applies on the first render (Requirement 33.4).
  audio.apply(store.getState().audio);

  trainRuntime.connect(() => store.getState());

  const disposers: Array<() => void> = [];
  if (win) {
    // One-time unlock on the first pointer or key event (Requirement 27.4);
    // the audio context is only resumed inside that gesture.
    disposers.push(audio.install(win));
    disposers.push(trainRuntime.bindBlur(win));
  }

  // The menu is the first screen (Requirement 3.1); fill its list now.
  store.getState().refreshList();

  if (storage.persistent === false) {
    store.getState().pushToast(TOAST_STORAGE_UNAVAILABLE, 'error');
  }

  return {
    storage,
    saves,
    settings,
    audio,
    trainRuntime,
    sceneBridge,
    store,
    dispose() {
      for (const fn of disposers.splice(0)) fn();
      store.getState().dispose();
    },
  };
}

// Type queries only: the hook module is never imported statically (Requirement 38.3).
type TestHookModule = Pick<typeof import('@/testHook/installTestHook'), 'installTestHook'>;
type InstallTestHookOptions = Parameters<TestHookModule['installTestHook']>[0];

export interface InstallTestHookIfAllowedOptions {
  /** Defaults to `window.location`. */
  location?: LocationLike | null;
  /** Defaults to `import.meta.env`. */
  env?: EnvLike | null;
  /** Loads the hook module; defaults to a dynamic `import()`, so the module is a separate chunk. */
  load?: () => Promise<TestHookModule>;
  /** Where the globals go; defaults to `window`. */
  target?: InstallTestHookOptions['target'];
}

/**
 * Installs `window.__DIORAMA__` (and `__DIORAMA_DEBUG__`) when the app runs in
 * development mode or with `?test=1`; otherwise does nothing and never loads
 * the hook module. The condition is evaluated once, here. Resolves to true
 * when the hook was installed. Await it before the first render so the hook
 * exists when the main menu first appears (Requirement 38.4).
 */
export async function installTestHookIfAllowed(
  services: Pick<AppServices, 'store' | 'audio' | 'trainRuntime' | 'sceneBridge'>,
  options: InstallTestHookIfAllowedOptions = {},
): Promise<boolean> {
  const location = options.location !== undefined ? options.location : typeof window !== 'undefined' ? window.location : null;
  const env = options.env !== undefined ? options.env : import.meta.env;
  if (!shouldInstallTestHook(location, env)) return false;
  const load = options.load ?? (() => import('@/testHook/installTestHook'));
  const mod = await load();
  mod.installTestHook({
    store: services.store,
    audio: services.audio,
    train: services.trainRuntime,
    scene: services.sceneBridge,
    target: options.target,
  });
  return true;
}
