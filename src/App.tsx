import { useGameStore } from '@/store/gameStore';
import { MainMenu } from '@/ui/MainMenu';
import { Playfield } from '@/ui/Playfield';
import { Toaster } from '@/ui/Toaster';

export function App() {
  const screen = useGameStore((state) => state.screen);
  return (
    <>
      {screen === 'menu' ? <MainMenu /> : <Playfield />}
      <Toaster />
    </>
  );
}
