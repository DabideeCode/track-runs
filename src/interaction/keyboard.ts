import { useEffect } from 'react';
import {
  cancelDrag,
  flipStartFacing,
  redo,
  removeSelected,
  rotateActive,
  selectPiece,
  selectTool,
  undo,
} from '@/store/commands';
import { useGameStore } from '@/store/gameStore';
import { releaseHeld, setHeld } from '@/train/runtime';

const DRIVE_KEYS: Record<string, 'forward' | 'reverse'> = { w: 'forward', s: 'reverse' };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target instanceof HTMLInputElement && target.type !== 'range';
}

function escape(): void {
  const state = useGameStore.getState();
  if (state.drag) cancelDrag();
  else if (state.selectedTool) selectTool(null);
  else selectPiece(null);
}

function handleBuildKey(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (key === 'escape') escape();
  else if (key === 'r' && !event.repeat) rotateActive();
  else if (key === 'f' && !event.repeat) flipStartFacing();
  else if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    removeSelected();
  }
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useGameStore.getState();
      if (state.dialog || isTyping(event.target)) return;
      if (state.mode === 'build') {
        handleBuildKey(event);
        return;
      }
      const direction = DRIVE_KEYS[event.key.toLowerCase()];
      if (direction && !event.ctrlKey && !event.metaKey && !event.altKey) setHeld(direction, true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const direction = DRIVE_KEYS[event.key.toLowerCase()];
      if (direction) setHeld(direction, false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseHeld);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseHeld);
    };
  }, []);
}
