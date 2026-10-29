import { useRef } from 'react'
import { playSound } from '@/audio/soundBus'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CATALOGUE, DECORATION_TYPES, TRACK_TYPES } from '@/game/catalogue'
import type { PieceType } from '@/game/types'
import { beginPaletteDrag } from '@/scene/interaction'
import { useGameStore } from '@/store/gameStore'
import { PieceIcon } from './PaletteIcons'

const STATION_LIMIT_TIP = 'One station per diorama. Move or delete the one you have to place it elsewhere.'

function PaletteItem({ type }: { type: PieceType }) {
  const selected = useGameStore((s) => s.selectedTool === type)
  const disabled = useGameStore((s) => type === 'station' && s.pieces.some((p) => p.type === 'station'))
  const wasSelected = useRef(false)

  const button = (
    <button
      type="button"
      data-testid={`palette-${type}`}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      aria-label={CATALOGUE[type].label}
      className={[
        'focus-ring group flex h-[74px] w-full touch-none flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[0.72rem] leading-tight font-semibold transition-[background,box-shadow,transform] select-none',
        disabled
          ? 'cursor-not-allowed opacity-45'
          : selected
            ? 'bg-primary/12 text-foreground shadow-[inset_0_0_0_2px_var(--primary)]'
            : 'text-foreground/85 hover:bg-accent/70 active:scale-[0.97]',
      ].join(' ')}
      onPointerDown={(e) => {
        if (e.button !== 0 || disabled) return
        e.preventDefault()
        wasSelected.current = selected
        beginPaletteDrag(type, e)
      }}
      onClick={(e) => {
        if (disabled) {
          playSound('invalid')
          return
        }
        playSound('ui')
        const s = useGameStore.getState()
        // Mouse: the press already selected it, so a click on an already-selected tool puts it down.
        // Keyboard (detail 0): toggle directly.
        if (e.detail === 0) s.selectTool(selected ? null : type)
        else if (wasSelected.current) s.selectTool(null)
        wasSelected.current = false
      }}
    >
      <PieceIcon type={type} className="size-9 shrink-0 transition-transform group-hover:-translate-y-0.5" />
      <span className="text-center">{CATALOGUE[type].label}</span>
    </button>
  )

  if (!disabled) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-56">
        {STATION_LIMIT_TIP}
      </TooltipContent>
    </Tooltip>
  )
}

function Group({ title, types }: { title: string; types: PieceType[] }) {
  return (
    <section aria-label={title}>
      <h2 className="px-1.5 pb-1 font-heading text-[0.95rem] font-extrabold text-bark">{title}</h2>
      <div className="grid grid-cols-3 gap-0.5">
        {types.map((t) => (
          <PaletteItem key={t} type={t} />
        ))}
      </div>
    </section>
  )
}

/** Tracks and Decorations, 12 items (FR-4). Hidden in Play mode. */
export function Palette() {
  return (
    <nav
      aria-label="Pieces"
      className="tray pointer-events-auto absolute top-20 left-4 flex max-h-[calc(100%-11rem)] w-[244px] flex-col gap-2 overflow-y-auto p-2"
    >
      <Group title="Tracks" types={TRACK_TYPES} />
      <Group title="Decorations" types={DECORATION_TYPES} />
    </nav>
  )
}
