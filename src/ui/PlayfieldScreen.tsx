import { useEffect, useState } from 'react'
import { playSound } from '@/audio/soundBus'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Scene } from '@/scene/Scene'
import { rotateDrag } from '@/scene/interaction'
import { useGameStore } from '@/store/gameStore'
import { isRedo, isUndo, shouldHandleShortcut } from '@/store/keyboard'
import { Palette } from './Palette'
import { BottomBar, Hint, TopBar, saveWithThumbnail } from './Toolbars'

const AUTOSAVE_MS = 30_000

/** Keyboard shortcuts for the playfield (AC-5.6, AC-6.3, AC-6.4, AC-6.5, AC-9.3). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleShortcut(e)) return
      const s = useGameStore.getState()
      const build = s.mode === 'build'
      if (isUndo(e) || isRedo(e)) {
        e.preventDefault()
        if (isRedo(e)) s.redo()
        else s.undo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'Escape':
          if (s.selectedTool) s.selectTool(null)
          else s.selectPiece(null)
          break
        case 'r':
        case 'R':
          if (!build || rotateDrag()) break
          if (s.selectedPieceId) s.rotatePiece(s.selectedPieceId)
          break
        case 'Delete':
        case 'Backspace':
          if (build && s.selectedPieceId) {
            e.preventDefault()
            s.removePiece(s.selectedPieceId)
          }
          break
        case 'f':
        case 'F':
          if (build) {
            playSound('ui')
            s.flipStartFacing()
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Autosave unsaved changes every 30 s while building (AC-11.5). */
function useAutosave() {
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = useGameStore.getState()
      if (s.screen === 'playfield' && s.mode === 'build' && s.isDirty && !s.drag) saveWithThumbnail(true)
    }, AUTOSAVE_MS)
    return () => window.clearInterval(t)
  }, [])
}

function UnsavedDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const goToMenu = useGameStore((s) => s.goToMenu)
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="tray border-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">Save before leaving?</AlertDialogTitle>
          <AlertDialogDescription>You have changes that aren’t saved yet.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-between">
          <AlertDialogCancel onClick={() => playSound('ui')}>Cancel</AlertDialogCancel>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogAction
              data-testid="confirm-discard"
              variant="outline"
              onClick={() => {
                playSound('ui')
                goToMenu()
              }}
            >
              Discard changes
            </AlertDialogAction>
            <AlertDialogAction
              data-testid="confirm-ok"
              onClick={() => {
                playSound('ui')
                if (saveWithThumbnail()) goToMenu()
              }}
            >
              Save and leave
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The playfield: full-viewport canvas with HTML overlays (§3 architecture 1 and 4). */
export function PlayfieldScreen() {
  const mode = useGameStore((s) => s.mode)
  const [confirmLeave, setConfirmLeave] = useState(false)
  useShortcuts()
  useAutosave()

  const onBack = () => {
    if (useGameStore.getState().isDirty) setConfirmLeave(true)
    else useGameStore.getState().goToMenu()
  }

  return (
    <div data-testid="playfield" data-mode={mode} className="relative h-full w-full overflow-hidden select-none">
      <Scene />
      <TopBar onBack={onBack} />
      {mode === 'build' && <Palette />}
      <Hint />
      <BottomBar />
      <UnsavedDialog open={confirmLeave} onClose={() => setConfirmLeave(false)} />
    </div>
  )
}
