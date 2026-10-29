import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/gameStore'

const SHOW_MS = 2600

/** Short status message (AC-11.4, AC-10.1), announced politely to screen readers. */
export function Toast() {
  const toast = useGameStore((s) => s.toast)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = window.setTimeout(() => setVisible(false), SHOW_MS)
    return () => window.clearTimeout(t)
  }, [toast])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4" aria-live="polite">
      {toast && visible && (
        <div
          key={toast.n}
          data-testid="toast"
          role="status"
          className="tray animate-toast-in px-5 py-2.5 text-sm font-semibold text-foreground"
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
