import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowLeftRight,
  Feather,
  Hammer,
  LocateFixed,
  Play,
  Redo2,
  RotateCw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react'
import { playSound } from '@/audio/log'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGame } from '@/game/store'
import type { Setting } from '@/game/types'
import { cn } from '@/lib/utils'
import { resetCamera } from '@/scene/CameraRig'
import { AudioPanel } from './AudioPanel'
import { useBoardInput } from './boardInput'
import { useKeyboard } from './keyboard'
import { Palette } from './Palette'

const Scene = lazy(() => import('@/scene/Scene'))

const AUTOSAVE_INTERVAL = 30_000

const SETTINGS: { value: Setting; label: string }[] = [
  { value: 'bedroom', label: 'Bedroom floor' },
  { value: 'kitchen', label: 'Kitchen table' },
]

function IconButton({
  label,
  shortcut,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-1.5 opacity-70">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

function TopLeft({ onBack }: { onBack: () => void }) {
  const name = useGame((state) => state.dioramaName)
  const dirty = useGame((state) => state.isDirty)
  const save = useGame((state) => state.save)

  return (
    <header className="panel pointer-events-auto absolute top-3 left-3 flex h-[52px] max-w-[min(26rem,34vw)] items-center gap-1 pr-1.5 pl-1.5">
      <IconButton data-testid="back-to-menu" label="Back to menu" onClick={onBack}>
        <ArrowLeft aria-hidden />
      </IconButton>
      <h1 className="min-w-0 flex-1 truncate px-1 text-sm font-bold" title={name}>
        {name}
      </h1>
      {dirty && (
        <span className="bg-honey size-2 shrink-0 rounded-full" role="img" aria-label="Unsaved changes" />
      )}
      <Button data-testid="save-button" variant="secondary" size="sm" onClick={() => save()}>
        <Save aria-hidden />
        Save
      </Button>
    </header>
  )
}

function ModeControls() {
  const mode = useGame((state) => state.mode)
  const driveMode = useGame((state) => state.driveMode)
  const toggleMode = useGame((state) => state.toggleMode)
  const toggleDriveMode = useGame((state) => state.toggleDriveMode)
  const playing = mode === 'play'

  return (
    <div className="panel pointer-events-auto absolute top-3 left-1/2 flex h-[52px] -translate-x-1/2 items-center gap-1.5 px-1.5">
      <Button
        data-testid="mode-toggle"
        className="w-28"
        aria-label={playing ? 'Back to Build mode' : 'Start Play mode'}
        onClick={toggleMode}
      >
        {playing ? <Hammer aria-hidden /> : <Play aria-hidden />}
        {playing ? 'Build' : 'Play'}
      </Button>
      <Button
        data-testid="drive-toggle"
        variant="secondary"
        className="w-[104px]"
        disabled={!playing}
        aria-label={`Driving: ${driveMode === 'auto' ? 'Auto' : 'Manual'}. Switch style`}
        onClick={toggleDriveMode}
      >
        {driveMode === 'auto' ? 'Auto' : 'Manual'}
      </Button>
    </div>
  )
}

function TopRight() {
  const setting = useGame((state) => state.setting)
  const setSetting = useGame((state) => state.setSetting)
  const lowQuality = useGame((state) => state.lowQuality)
  const setLowQuality = useGame((state) => state.setLowQuality)

  return (
    <div className="panel pointer-events-auto absolute top-3 right-3 flex h-[52px] items-center gap-0.5 px-1.5">
      <Select
        value={setting}
        onValueChange={(value) => {
          setSetting(value as Setting)
          playSound('ui')
        }}
      >
        <SelectTrigger data-testid="setting-select" aria-label="Setting" className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SETTINGS.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <IconButton data-testid="reset-view" label="Reset view" onClick={resetCamera}>
        <LocateFixed aria-hidden />
      </IconButton>
      <IconButton
        data-testid="low-quality"
        label={lowQuality ? 'Low quality is on' : 'Low quality'}
        aria-pressed={lowQuality}
        className={cn(lowQuality && 'bg-honey/30 hover:bg-honey/30')}
        onClick={() => setLowQuality(!lowQuality)}
      >
        <Feather aria-hidden />
      </IconButton>
    </div>
  )
}

function BuildToolbar() {
  const play = useGame((state) => state.mode === 'play')
  const hasSelection = useGame((state) => state.selectedPieceId !== null)
  const canUndo = useGame((state) => state.past.length > 0)
  const canRedo = useGame((state) => state.future.length > 0)
  const hasStation = useGame((state) => state.pieces.some((piece) => piece.type === 'station'))
  const facing = useGame((state) => state.startFacing)
  const undo = useGame((state) => state.undo)
  const redo = useGame((state) => state.redo)
  const rotateSelection = useGame((state) => state.rotateSelection)
  const deleteSelection = useGame((state) => state.deleteSelection)
  const flipDirection = useGame((state) => state.flipDirection)

  return (
    <div
      role="toolbar"
      aria-label="Edit tools"
      aria-hidden={play}
      className={cn(
        'panel pointer-events-auto absolute bottom-3 left-1/2 flex h-[52px] -translate-x-1/2 items-center gap-0.5 px-1.5 transition-[transform,opacity,visibility] duration-250',
        play && 'invisible translate-y-4 opacity-0',
      )}
    >
      <IconButton label="Undo" shortcut="Ctrl+Z" disabled={play || !canUndo} onClick={undo}>
        <Undo2 aria-hidden />
      </IconButton>
      <IconButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={play || !canRedo} onClick={redo}>
        <Redo2 aria-hidden />
      </IconButton>
      <span className="bg-border mx-1 h-6 w-px" />
      <IconButton
        label="Rotate"
        shortcut="R"
        disabled={play || !hasSelection}
        onClick={rotateSelection}
      >
        <RotateCw aria-hidden />
      </IconButton>
      <IconButton
        data-testid="delete-piece"
        label="Delete selected piece"
        shortcut="Del"
        disabled={play || !hasSelection}
        onClick={deleteSelection}
      >
        <Trash2 aria-hidden />
      </IconButton>
      <span className="bg-border mx-1 h-6 w-px" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-testid="flip-direction"
            variant="ghost"
            size="sm"
            className="h-10"
            disabled={play}
            aria-label={`Flip start direction. Currently facing ${facing}`}
            onClick={flipDirection}
          >
            <ArrowLeftRight aria-hidden />
            Flip direction
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {hasStation ? 'Which way the train departs' : 'Applies once a station is placed'}
          <span className="ml-1.5 opacity-70">F</span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function PlayHint() {
  const manual = useGame((state) => state.mode === 'play' && state.driveMode === 'manual')
  if (!manual) return null
  return (
    <p className="panel animate-fade-in absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 text-sm font-semibold">
      Hold <kbd className="font-bold">W</kbd> to go forward, <kbd className="font-bold">S</kbd> to reverse
    </p>
  )
}

function UnsavedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const save = useGame((state) => state.save)
  const goToMenu = useGame((state) => state.goToMenu)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogTitle>Save before leaving?</DialogTitle>
        <DialogDescription>This diorama has changes that have not been saved.</DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button data-testid="confirm-discard" variant="secondary" onClick={goToMenu}>
            Discard
          </Button>
          <Button
            data-testid="confirm-ok"
            onClick={() => {
              if (save()) goToMenu()
              else onClose()
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Playfield() {
  const mode = useGame((state) => state.mode)
  const goToMenu = useGame((state) => state.goToMenu)
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  leavingRef.current = leaving

  useBoardInput()
  useKeyboard()

  useEffect(() => {
    const id = window.setInterval(() => {
      const state = useGame.getState()
      // While the save, discard or cancel dialog is open, that choice is the user's to make.
      if (leavingRef.current) return
      if (state.mode === 'build' && state.isDirty && !state.drag) state.save({ auto: true })
    }, AUTOSAVE_INTERVAL)
    return () => window.clearInterval(id)
  }, [])

  const requestBack = () => {
    if (useGame.getState().isDirty) setLeaving(true)
    else goToMenu()
  }

  return (
    <main data-testid="playfield" data-mode={mode} className="fixed inset-0 overflow-hidden">
      <Suspense
        fallback={
          <div className="text-muted-foreground flex h-full items-center justify-center font-semibold">
            Setting out the pieces…
          </div>
        }
      >
        <Scene />
      </Suspense>
      <div className="pointer-events-none absolute inset-0">
        <TopLeft onBack={requestBack} />
        <ModeControls />
        <TopRight />
        <Palette />
        <BuildToolbar />
        <PlayHint />
        <AudioPanel />
      </div>
      <UnsavedDialog open={leaving} onClose={() => setLeaving(false)} />
    </main>
  )
}
