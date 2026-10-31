import { useKeyboardShortcuts } from '@/interaction/keyboard';
import { useBoardInteraction } from '@/interaction/useBoardInteraction';
import PlayfieldCanvas from '@/scene/PlayfieldCanvas';
import { useAutosave } from '@/store/autosave';
import { useGameStore } from '@/store/gameStore';
import { AudioControls } from './AudioControls';
import { Palette } from './Palette';
import { FileBar, PlayBar, ViewBar } from './Toolbar';

export default function PlayfieldScreen() {
  const mode = useGameStore((state) => state.mode);
  const dragValid = useGameStore((state) => state.drag?.valid);
  useBoardInteraction();
  useKeyboardShortcuts();
  useAutosave();

  return (
    <div data-testid="playfield" data-mode={mode} data-drag-valid={dragValid} className="fixed inset-0 overflow-hidden">
      <PlayfieldCanvas />
      <div className="pointer-events-none absolute inset-0">
        <Palette />
        <PlayBar />
        <FileBar />
        <ViewBar />
        <AudioControls className="absolute bottom-3 left-3" />
      </div>
    </div>
  );
}
