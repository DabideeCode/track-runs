import { TooltipProvider } from '@/components/ui/tooltip'
import { useGameStore } from '@/store/gameStore'
import { MainMenu } from '@/ui/MainMenu'
import { PlayfieldScreen } from '@/ui/PlayfieldScreen'
import { Toast } from '@/ui/Toast'

export default function App() {
  const screen = useGameStore((s) => s.screen)
  return (
    <TooltipProvider delayDuration={250}>
      {screen === 'menu' ? <MainMenu /> : <PlayfieldScreen />}
      <Toast />
    </TooltipProvider>
  )
}
