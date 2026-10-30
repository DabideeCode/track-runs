import { lazy, Suspense, useEffect } from 'react';
import { installPointerControls } from '@/interaction/dragController';
import { installKeyboard } from '@/interaction/keyboard';
import { startAutosave, useGameStore } from '@/store/gameStore';
import { AudioPanel } from './AudioPanel';
import { TooltipProvider } from './components/tooltip';
import { Palette } from './Palette';
import { TopBar } from './TopBar';
import { UnsavedDialog } from './UnsavedDialog';

export const loadScene = () => import('@/scene/PlayfieldCanvas');
const PlayfieldCanvas = lazy(loadScene);

export function Playfield() {
  const mode = useGameStore((state) => state.mode);

  useEffect(() => {
    const removePointer = installPointerControls();
    const removeKeyboard = installKeyboard();
    const stopAutosave = startAutosave();
    return () => {
      removePointer();
      removeKeyboard();
      stopAutosave();
    };
  }, []);

  return (
    <main data-testid="playfield" data-mode={mode} className="relative h-full overflow-hidden bg-cream">
      <Suspense
        fallback={<p className="grid h-full place-items-center text-ink-soft">Setting up the diorama</p>}
      >
        <PlayfieldCanvas />
      </Suspense>
      <TooltipProvider delayDuration={150}>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-start gap-3 p-3">
          <TopBar />
          <Palette />
        </div>
      </TooltipProvider>
      <AudioPanel className="absolute right-3 bottom-3" />
      <UnsavedDialog />
    </main>
  );
}
