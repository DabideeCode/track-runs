import { lazy, Suspense, useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dialogs } from '@/features/dialogs/Dialogs';
import { MainMenu } from '@/features/menu/MainMenu';
import { Toast } from '@/features/overlay/Toast';
import { useGameStore } from '@/store/gameStore';

const loadPlayfield = () => import('@/features/overlay/PlayfieldScreen');
const PlayfieldScreen = lazy(loadPlayfield);

export default function App() {
  const screen = useGameStore((state) => state.screen);

  // The menu has no 3D code. Fetch the playfield as soon as the menu has painted.
  useEffect(() => {
    const id = requestAnimationFrame(() => void loadPlayfield());
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      {screen === 'menu' ? (
        <MainMenu />
      ) : (
        <Suspense fallback={null}>
          <PlayfieldScreen />
        </Suspense>
      )}
      <Toast />
      <Dialogs />
    </TooltipProvider>
  );
}
