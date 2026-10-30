import { useGameStore } from '@/store/gameStore';
import { releaseDriveKeys, setDriveKey } from '@/store/trainRuntime';

const store = () => useGameStore.getState();

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  return target instanceof HTMLInputElement && target.type !== 'range';
}

function handleBuildKey(event: KeyboardEvent, key: string) {
  const { rotateActive, selectedPieceId, removePiece, escape, flipDirection, undo, redo } = store();
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  switch (key) {
    case 'r':
      if (!event.repeat) rotateActive();
      break;
    case 'f':
      if (!event.repeat) flipDirection();
      break;
    case 'escape':
      escape();
      break;
    case 'delete':
    case 'backspace':
      event.preventDefault();
      if (selectedPieceId && !event.repeat) removePiece(selectedPieceId);
      break;
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (isTyping(event.target) || store().dialog) return;
  const key = event.key.toLowerCase();
  if (store().mode === 'build') {
    handleBuildKey(event, key);
  } else if (key === 'w') {
    setDriveKey('forward', true);
  } else if (key === 's') {
    setDriveKey('reverse', true);
  }
}

function onKeyUp(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (key === 'w') setDriveKey('forward', false);
  if (key === 's') setDriveKey('reverse', false);
}

export function installKeyboard() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseDriveKeys);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseDriveKeys);
  };
}
