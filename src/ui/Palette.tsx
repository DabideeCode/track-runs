/**
 * The build palette (task 15.3): the 12 catalogue items in a Tracks group and
 * a Decorations group, two columns each, every item an icon plus its exact
 * catalogue name with `data-testid="palette-<type>"`.
 *
 * The playfield (task 15.6) positions the panel (left, vertically centred).
 *
 * Input (D-54):
 * - Mouse: `onPointerDown` hands the gesture to the playfield's
 *   `DragController` (`paletteDown`). The controller turns the release into a
 *   tool selection with the `ui` click, or a press-and-move into a palette
 *   drag (D-26), so the button's `onClick` ignores pointer clicks
 *   (`event.detail > 0`) and the click is never counted twice.
 * - Keyboard: Enter and Space fire `click` with `detail === 0`; the palette
 *   then selects the tool itself and plays `ui`, the same as the controller.
 * - The selected tool, and only it, is shown pressed (`aria-pressed`, walnut
 *   fill). Colour changes run in 75 ms so the highlight follows
 *   `selectedTool` within 100 ms (Requirement 10.4).
 * - While a station exists the station item is `aria-disabled="true"`, not
 *   `disabled`, so it still receives hover and focus for the tooltip "Only one
 *   station per diorama" (Requirements 10.7, 16.6, 16.13); it ignores presses
 *   and activation.
 * - In Play mode the panel fades out over 200 ms and becomes `invisible` at
 *   the end of the fade, and every item is `disabled` (Requirement 10.6).
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 16.6, 16.13, 28.1, 37.8, 41.2
 */
import { useId, useState, type MouseEvent, type PointerEvent } from 'react';
import { CATALOGUE, type CatalogueItem } from '@/domain/catalogue';
import type { PieceType } from '@/domain/types';
import type { PointerLike } from '@/input/DragController';
import { cn } from '@/lib/utils';
import { selectHasStation } from '@/store/selectors';
import { useAppStore, useAppStoreApi } from '@/store/useAppStore';
import { Button } from '@/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { PaletteIcon } from '@/ui/icons';

/** Tooltip on the station item while a station exists (Requirement 16.13). */
export const STATION_LIMIT_TOOLTIP = 'Only one station per diorama';

/** The part of `DragController` the palette uses. */
export interface PaletteGestures {
  paletteDown(type: unknown, e: PointerLike): boolean;
}

export interface PaletteProps {
  /** The playfield's drag controller; null renders a palette that only reacts to the keyboard. */
  controller: PaletteGestures | null;
  className?: string;
}

const TRACKS = CATALOGUE.filter((item) => item.kind === 'track');
const DECORATIONS = CATALOGUE.filter((item) => item.kind === 'decoration');

export function Palette({ controller, className }: PaletteProps) {
  const store = useAppStoreApi();
  const selectedTool = useAppStore((s) => s.selectedTool);
  const isPlay = useAppStore((s) => s.mode === 'play');
  const hasStation = useAppStore(selectHasStation);
  const tracksId = useId();
  const decorationsId = useId();

  const onPointerDown = (type: PieceType, e: PointerEvent<HTMLButtonElement>) => {
    controller?.paletteDown(type, {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerId: e.pointerId,
      button: e.button,
      buttons: e.buttons,
      target: e.target,
    });
  };

  const onKeyboardActivate = (type: PieceType) => {
    const s = store.getState();
    s.selectTool(type);
    if (store.getState().selectedTool === type) s.playUi();
  };

  const renderGroup = (labelId: string, label: string, items: readonly CatalogueItem[]) => (
    <section aria-labelledby={labelId} className="flex flex-col gap-2">
      <h2 id={labelId} className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      <ul data-palette-grid className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <li key={item.type} className="flex">
            <PaletteItem
              item={item}
              selected={selectedTool === item.type}
              disabled={isPlay}
              stationLocked={item.type === 'station' && hasStation}
              onPointerDown={onPointerDown}
              onKeyboardActivate={onKeyboardActivate}
            />
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <aside
      aria-label="Palette"
      data-state={isPlay ? 'hidden' : 'visible'}
      className={cn(
        // `scroll-p-2`: when Tab focus scrolls an item into view, keep 8 px
        // free at the scroll edge, so the 4 px focus ring (2 px offset plus
        // 2 px ring) is not clipped by the scroll box (Requirement 40.5).
        'panel w-58 max-h-[calc(100vh-2rem)] scroll-p-2 flex-col gap-4 overflow-y-auto select-none',
        'transition-[opacity,visibility] duration-200 ease-out motion-reduce:transition-none',
        isPlay ? 'invisible opacity-0' : 'visible opacity-100',
        className,
      )}
      style={isPlay ? { pointerEvents: 'none' } : undefined}
    >
      {renderGroup(tracksId, 'Tracks', TRACKS)}
      {renderGroup(decorationsId, 'Decorations', DECORATIONS)}
    </aside>
  );
}

interface PaletteItemProps {
  item: CatalogueItem;
  selected: boolean;
  /** Play mode: the native `disabled` state. */
  disabled: boolean;
  /** The station item while a station exists: `aria-disabled` with a tooltip. */
  stationLocked: boolean;
  onPointerDown(type: PieceType, e: PointerEvent<HTMLButtonElement>): void;
  onKeyboardActivate(type: PieceType): void;
}

function PaletteItem({ item, selected, disabled, stationLocked, onPointerDown, onKeyboardActivate }: PaletteItemProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const inactive = disabled || stationLocked;

  const button = (
    <Button
      data-testid={`palette-${item.type}`}
      data-selected={selected ? 'true' : undefined}
      variant="outline"
      disabled={disabled}
      aria-disabled={stationLocked ? 'true' : undefined}
      aria-pressed={selected}
      className={cn(
        'h-auto w-full flex-col gap-1.5 whitespace-normal px-2 py-2.5 text-center text-xs leading-tight duration-75',
        "[&_svg:not([class*='size-'])]:size-6",
        selected &&
          'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
      )}
      onPointerDown={(e) => {
        if (!inactive) onPointerDown(item.type, e);
      }}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        // Pointer clicks are handled by the drag controller on release.
        if (e.detail !== 0 || inactive) return;
        onKeyboardActivate(item.type);
      }}
    >
      <PaletteIcon type={item.type} />
      <span>{item.label}</span>
    </Button>
  );

  if (item.type !== 'station') return button;

  return (
    <Tooltip open={stationLocked && !disabled && tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{STATION_LIMIT_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}
