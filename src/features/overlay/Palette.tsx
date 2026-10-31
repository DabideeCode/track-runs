import type { PointerEvent } from 'react';
import { emitSound } from '@/audio/soundLog';
import { PIECE_ICONS } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CATALOGUE, DECORATION_TYPES, TRACK_TYPES } from '@/domain/catalogue';
import type { PieceType } from '@/domain/types';
import { consumePaletteClick, pressPalette } from '@/interaction/useBoardInteraction';
import { cn } from '@/lib/utils';
import { selectTool } from '@/store/commands';
import { useGameStore } from '@/store/gameStore';

const STATION_HINT = 'This diorama already has a station. Only one is allowed.';

function PaletteButton({ type, disabled }: { type: PieceType; disabled: boolean }) {
  const selected = useGameStore((state) => state.selectedTool === type);
  const Icon = PIECE_ICONS[type];
  return (
    <button
      type="button"
      data-testid={`palette-${type}`}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex h-[3.6rem] w-full cursor-grab touch-none flex-col items-center justify-center gap-0.5 rounded-xl px-1',
        'text-[0.7rem] leading-tight font-medium transition-[background-color,transform,opacity] duration-150',
        'active:cursor-grabbing active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        selected ? 'bg-honey-deep text-parchment shadow-press' : 'bg-linen/70 text-ink hover:bg-linen',
      )}
      onPointerDown={(event: PointerEvent) => {
        if (event.button === 0) pressPalette(type, event.clientX, event.clientY);
      }}
      onClick={() => {
        if (consumePaletteClick()) return;
        emitSound('ui');
        selectTool(type);
      }}
    >
      <Icon />
      <span className="truncate">{CATALOGUE[type].name}</span>
    </button>
  );
}

function StationItem({ disabled }: { disabled: boolean }) {
  const hasStation = useGameStore((state) => state.pieces.some((piece) => piece.type === 'station'));
  const button = <PaletteButton type="station" disabled={disabled || hasStation} />;
  if (!hasStation) return button;
  return (
    <Tooltip>
      {/* A disabled button fires no pointer events, so the tooltip sits on a focusable wrapper. */}
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={STATION_HINT} className="block rounded-xl">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{STATION_HINT}</TooltipContent>
    </Tooltip>
  );
}

function Group({ title, types, disabled }: { title: string; types: readonly PieceType[]; disabled: boolean }) {
  return (
    <div role="group" aria-label={title}>
      <h2 className="mb-1 px-0.5 text-xs font-semibold text-ink-soft">{title}</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {types.map((type) =>
          type === 'station' ? (
            <StationItem key={type} disabled={disabled} />
          ) : (
            <PaletteButton key={type} type={type} disabled={disabled} />
          ),
        )}
      </div>
    </div>
  );
}

export function Palette() {
  const disabled = useGameStore((state) => state.mode === 'play');
  return (
    <aside
      data-overlay-panel
      aria-label="Palette"
      className="pointer-events-auto absolute top-3 left-3 flex w-[11.5rem] flex-col gap-2 rounded-2xl bg-parchment/90 p-2.5 shadow-soft"
    >
      <Group title="Tracks" types={TRACK_TYPES} disabled={disabled} />
      <Group title="Decorations" types={DECORATION_TYPES} disabled={disabled} />
    </aside>
  );
}
