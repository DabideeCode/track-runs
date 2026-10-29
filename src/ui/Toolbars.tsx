import { ArrowLeft, FlipHorizontal2, Gauge, LocateFixed, Redo2, Save, Trash2, Undo2 } from 'lucide-react'
import { playSound } from '@/audio/soundBus'
import type { Setting } from '@/game/types'
import { captureThumbnail } from '@/scene/thumbnail'
import { useGameStore } from '@/store/gameStore'
import { AudioControls } from './AudioControls'
import { UiButton } from './UiButton'

/** A single button rendered as a two-option segmented switch; the active side is filled. */
function Segmented({
  testId,
  options,
  active,
  label,
  onToggle,
}: {
  testId: string
  options: [string, string]
  active: 0 | 1
  label: string
  onToggle(): void
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={() => {
        playSound('ui')
        onToggle()
      }}
      className="focus-ring relative grid h-10 grid-cols-2 rounded-full bg-muted p-1 text-sm font-bold select-none"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-primary shadow-sm transition-transform duration-200 ease-out"
        style={{ transform: active ? 'translateX(100%)' : 'none' }}
      />
      {options.map((o, i) => (
        <span
          key={o}
          className={`relative z-10 flex items-center justify-center px-4 transition-colors ${active === i ? 'text-primary-foreground' : 'text-muted-foreground'}`}
        >
          {o}
        </span>
      ))}
    </button>
  )
}

export function saveWithThumbnail(auto = false) {
  return useGameStore.getState().saveCurrent({ auto, thumbnail: captureThumbnail() })
}

export function TopBar({ onBack }: { onBack(): void }) {
  const mode = useGameStore((s) => s.mode)
  const driveMode = useGameStore((s) => s.driveMode)
  const name = useGameStore((s) => s.dioramaName)
  const dirty = useGameStore((s) => s.isDirty)
  const { setMode, setDriveMode } = useGameStore.getState()

  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3">
      <div className="tray pointer-events-auto flex h-14 min-w-0 items-center gap-2 pr-4 pl-2">
        <UiButton
          data-testid="back-to-menu"
          variant="ghost"
          className="h-10 rounded-full px-3 font-bold"
          onClick={onBack}
          aria-label="Back to menu"
        >
          <ArrowLeft className="size-[18px]" /> Menu
        </UiButton>
        <div className="flex min-w-0 items-center gap-2 border-l border-border/80 pl-3">
          <span className="truncate font-heading text-lg font-semibold" title={name}>
            {name}
          </span>
          {dirty && (
            <span className="size-2 shrink-0 rounded-full bg-terracotta" title="Unsaved changes" aria-label="Unsaved changes" role="img" />
          )}
        </div>
      </div>

      <div className="tray pointer-events-auto flex h-14 items-center gap-2 px-2">
        <Segmented
          testId="mode-toggle"
          options={['Build', 'Play']}
          active={mode === 'build' ? 0 : 1}
          label={mode === 'build' ? 'Switch to Play mode' : 'Switch to Build mode'}
          onToggle={() => setMode(mode === 'build' ? 'play' : 'build')}
        />
        {mode === 'play' && (
          <Segmented
            testId="drive-toggle"
            options={['Auto', 'Manual']}
            active={driveMode === 'auto' ? 0 : 1}
            label={driveMode === 'auto' ? 'Switch to manual driving' : 'Switch to automatic driving'}
            onToggle={() => setDriveMode(driveMode === 'auto' ? 'manual' : 'auto')}
          />
        )}
      </div>

      <div className="tray pointer-events-auto flex h-14 items-center gap-3 pr-3 pl-2">
        <UiButton data-testid="save-button" className="h-10 rounded-full px-4 font-bold" onClick={() => saveWithThumbnail()}>
          <Save className="size-[18px]" /> Save
        </UiButton>
        <AudioControls />
      </div>
    </div>
  )
}

const iconBtn = 'h-10 rounded-full px-3 font-semibold'

export function BottomBar() {
  const mode = useGameStore((s) => s.mode)
  const setting = useGameStore((s) => s.setting)
  const hasSelection = useGameStore((s) => s.selectedPieceId !== null)
  const canUndo = useGameStore((s) => s.history.length > 0)
  const canRedo = useGameStore((s) => s.future.length > 0)
  const lowQuality = useGameStore((s) => s.lowQuality)
  const s = useGameStore.getState()
  const build = mode === 'build'

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
      <div className="tray pointer-events-auto flex h-14 max-w-full items-center gap-1 overflow-x-auto px-2">
        <label className="flex items-center gap-2 pr-1 pl-2 text-sm font-semibold">
          <span className="sr-only sm:not-sr-only">Setting</span>
          <select
            data-testid="setting-select"
            name="setting"
            id="setting-select"
            aria-label="Setting"
            value={setting}
            onChange={(e) => {
              playSound('ui')
              s.setSetting(e.target.value as Setting)
            }}
            className="focus-ring h-10 cursor-pointer appearance-none rounded-full bg-muted bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 8%22><path d=%22M1 1l5 5 5-5%22 stroke=%22%235a4636%22 stroke-width=%221.8%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:10px] bg-[right_14px_center] bg-no-repeat pr-9 pl-4 font-semibold"
          >
            <option value="bedroom">Bedroom floor</option>
            <option value="kitchen">Kitchen table</option>
          </select>
        </label>
        <Divider />
        <UiButton
          data-testid="flip-direction"
          variant="ghost"
          className={iconBtn}
          disabled={!build}
          onClick={() => s.flipStartFacing()}
          title="Flip which way the train sets off (F)"
        >
          <FlipHorizontal2 /> Flip start
        </UiButton>
        <UiButton data-testid="reset-view" variant="ghost" className={iconBtn} onClick={() => s.resetCamera()} title="Reset the camera">
          <LocateFixed /> Reset view
        </UiButton>
        <Divider />
        <UiButton
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          disabled={!build || !canUndo}
          onClick={() => s.undo()}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 />
        </UiButton>
        <UiButton
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          disabled={!build || !canRedo}
          onClick={() => s.redo()}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 />
        </UiButton>
        <UiButton
          data-testid="delete-piece"
          variant="ghost"
          className={`${iconBtn} text-destructive hover:text-destructive`}
          disabled={!build || !hasSelection}
          onClick={() => {
            const id = useGameStore.getState().selectedPieceId
            if (id) s.removePiece(id)
          }}
          title="Delete the selected piece (Delete)"
        >
          <Trash2 /> Delete
        </UiButton>
        <Divider />
        <UiButton
          variant="ghost"
          className={iconBtn}
          aria-pressed={lowQuality}
          onClick={() => s.setLowQuality(!lowQuality)}
          title="Turn off shadows and lower the resolution for slower computers"
        >
          <Gauge /> {lowQuality ? 'Low quality on' : 'Low quality'}
        </UiButton>
      </div>
    </div>
  )
}

const Divider = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />

/** One-line contextual help above the bottom bar. */
export function Hint() {
  const mode = useGameStore((s) => s.mode)
  const driveMode = useGameStore((s) => s.driveMode)
  const tool = useGameStore((s) => s.selectedTool)
  const selected = useGameStore((s) => s.selectedPieceId !== null)
  const hasStation = useGameStore((s) => s.pieces.some((p) => p.type === 'station'))
  let text: string
  if (mode === 'play') {
    text = driveMode === 'manual' ? 'Hold W to drive forward and S to reverse.' : 'The train drives itself. Switch to Manual to drive with W and S.'
  } else if (tool) {
    text = 'Click a tile to place it. R turns it, Esc puts it down.'
  } else if (selected) {
    text = 'Drag to move it. R turns it, Delete removes it.'
  } else if (!hasStation) {
    text = 'Drag a station onto the board to give the train somewhere to start.'
  } else {
    text = 'Drag pieces from the left. Right-drag to look around, scroll to zoom.'
  }
  return (
    <p className="pointer-events-none absolute inset-x-0 bottom-[84px] text-center text-sm font-semibold text-ink/75 [text-shadow:0_1px_0_rgb(251_246_236/0.8)]">
      {text}
    </p>
  )
}
