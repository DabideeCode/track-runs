import { lazy, Suspense, useEffect } from 'react'
import { playSound } from '@/audio/log'
import { Toast, ToastDescription, ToastProvider, ToastViewport } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useGame } from '@/game/store'
import { MainMenu } from '@/ui/MainMenu'

const Playfield = lazy(() =>
  import('@/ui/Playfield').then((module) => ({ default: module.Playfield })),
)

const TOAST_DURATION = 3200

function Toaster() {
  const toast = useGame((state) => state.toast)
  const clearToast = useGame((state) => state.clearToast)

  return (
    <ToastProvider duration={TOAST_DURATION} label="Notification">
      {toast && (
        <Toast
          key={toast.id}
          data-testid="toast"
          open
          onOpenChange={(open) => {
            if (!open) clearToast()
          }}
        >
          <ToastDescription>{toast.message}</ToastDescription>
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  )
}

const onUiClick = (event: MouseEvent) => {
  if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) {
    playSound('ui')
  }
}

export function App() {
  const screen = useGame((state) => state.screen)

  useEffect(() => {
    document.addEventListener('click', onUiClick, true)
    return () => document.removeEventListener('click', onUiClick, true)
  }, [])

  return (
    <TooltipProvider delayDuration={350}>
      {screen === 'menu' ? (
        <MainMenu />
      ) : (
        <Suspense fallback={<div className="bg-background fixed inset-0" />}>
          <Playfield />
        </Suspense>
      )}
      <Toaster />
    </TooltipProvider>
  )
}
