import { useEffect } from 'react';
import { saveDiorama } from './commands';
import { useGameStore } from './gameStore';

const AUTOSAVE_MS = 30_000;

export function autosaveTick(): void {
  const { mode, isDirty, drag } = useGameStore.getState();
  if (mode === 'build' && isDirty && !drag) saveDiorama('Autosaved');
}

/** Runs while the playfield is open. Each tick checks Build mode, so Play mode never saves. */
export function useAutosave(): void {
  useEffect(() => {
    const timer = setInterval(autosaveTick, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, []);
}
