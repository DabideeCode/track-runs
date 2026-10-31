import { TrainFront } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CATALOG, DECORATION_TYPES, TRACK_TYPES } from '@/game/catalog'
import { useGame } from '@/game/store'
import type { PieceType } from '@/game/types'
import { cn } from '@/lib/utils'
import { consumePaletteClick, pressPaletteItem } from './boardInput'

const STATION_TAKEN = 'This diorama already has its station. Only one is allowed.'

function PaletteItem({ type, stationTaken }: { type: PieceType; stationTaken: boolean }) {
  const selected = useGame(
    (state) =>
      state.selectedTool === type ||
      (state.drag?.source === 'palette' && state.drag.type === type),
  )
  const play = useGame((state) => state.mode === 'play')
  const preview = useGame((state) => state.previews[type])
  const selectTool = useGame((state) => state.selectTool)
  const blocked = type === 'station' && stationTaken

  const button = (
    <button
      type="button"
      data-testid={`palette-${type}`}
      aria-pressed={selected}
      disabled={blocked || play}
      onPointerDown={(event) => {
        if (event.button === 0) pressPaletteItem(type, event.clientX, event.clientY)
      }}
      onClick={() => {
        if (!consumePaletteClick()) selectTool(selected ? null : type)
      }}
      className={cn(
        'focus-ring flex w-full touch-none flex-col items-center gap-0.5 rounded-md px-1 pt-1 pb-1.5 text-center select-none',
        'transition-[background-color,box-shadow,transform] duration-150',
        'hover:bg-accent/70 active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100',
        selected && 'bg-honey/30 hover:bg-honey/30 ring-honey ring-2',
        blocked && 'pointer-events-none',
      )}
    >
      {preview ? (
        <img src={preview} alt="" draggable={false} className="size-13 object-contain" />
      ) : (
        <span className="text-muted-foreground flex size-13 items-center justify-center">
          <TrainFront aria-hidden className="size-6 opacity-50" />
        </span>
      )}
      <span className="text-[11.5px] leading-tight font-semibold">{CATALOG[type].label}</span>
    </button>
  )

  if (!blocked) return <li>{button}</li>
  return (
    <li>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          {/* A disabled button fires no hover events, so the wrapper carries the tooltip. */}
          <span className="focus-ring block rounded-md" tabIndex={0} title={STATION_TAKEN}>
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{STATION_TAKEN}</TooltipContent>
      </Tooltip>
    </li>
  )
}

function Group({
  title,
  types,
  stationTaken,
}: {
  title: string
  types: PieceType[]
  stationTaken: boolean
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-muted-foreground mb-1 px-1 text-[11px] font-bold tracking-wider uppercase">
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-0.5">
        {types.map((type) => (
          <PaletteItem key={type} type={type} stationTaken={stationTaken} />
        ))}
      </ul>
    </section>
  )
}

export function Palette() {
  const play = useGame((state) => state.mode === 'play')
  const stationTaken = useGame((state) => state.pieces.some((piece) => piece.type === 'station'))

  return (
    <nav
      aria-label="Palette"
      aria-hidden={play}
      className={cn(
        'panel pointer-events-auto absolute top-[72px] bottom-3 left-3 w-[188px] max-h-[640px] space-y-2 overflow-y-auto p-2 transition-[transform,opacity,visibility] duration-250',
        play && 'invisible -translate-x-6 opacity-0',
      )}
    >
      <Group title="Tracks" types={TRACK_TYPES} stationTaken={stationTaken} />
      <Group title="Decorations" types={DECORATION_TYPES} stationTaken={stationTaken} />
    </nav>
  )
}
