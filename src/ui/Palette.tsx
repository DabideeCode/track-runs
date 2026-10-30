import { play } from '@/audio/audioEngine';
import { CATALOG, type CatalogItem } from '@/domain/catalog';
import { didJustDrag, pressPaletteItem } from '@/interaction/dragController';
import { useGameStore } from '@/store/gameStore';
import { cn } from './components/cn';
import { Tooltip } from './components/tooltip';
import { PieceIcon } from './icons';

const STATION_HINT = 'Only one station fits. Move or delete the one on the board first.';

function PaletteItem({ item }: { item: CatalogItem }) {
  const selected = useGameStore((state) => state.selectedTool === item.type);
  const selectTool = useGameStore((state) => state.selectTool);
  const playing = useGameStore((state) => state.mode === 'play');
  const stationPlaced = useGameStore(
    (state) => item.type === 'station' && state.pieces.some((piece) => piece.type === 'station'),
  );
  const blocked = stationPlaced || playing;

  const button = (
    <button
      type="button"
      data-testid={`palette-${item.type}`}
      aria-pressed={selected}
      aria-disabled={blocked}
      className={cn(
        'flex h-[3.75rem] w-full touch-none flex-col items-center justify-center gap-0.5 rounded-xl bg-paper px-1 text-[0.6875rem] leading-tight font-semibold text-ink shadow-[0_3px_0_var(--color-honey-deep)] select-none active:translate-y-0.5 active:shadow-none',
        selected && 'bg-dusty text-paper shadow-[0_3px_0_var(--color-dusty-deep)]',
        blocked && 'cursor-not-allowed opacity-50',
      )}
      onPointerDown={(event) => {
        if (!blocked && event.button === 0) pressPaletteItem(event.nativeEvent, item.type);
      }}
      onClick={() => {
        if (blocked || didJustDrag()) return;
        play('ui');
        selectTool(item.type);
      }}
    >
      <PieceIcon type={item.type} />
      <span className="max-w-full truncate">{item.name}</span>
    </button>
  );

  return item.type === 'station' && stationPlaced ? <Tooltip content={STATION_HINT}>{button}</Tooltip> : button;
}

function PaletteGroup({ title, kind }: { title: string; kind: CatalogItem['kind'] }) {
  const titleId = `palette-${kind}`;
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="mb-1.5 px-1 text-sm font-bold text-ink">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-1.5">
        {CATALOG.filter((item) => item.kind === kind).map((item) => (
          <PaletteItem key={item.type} item={item} />
        ))}
      </div>
    </section>
  );
}

export function Palette() {
  return (
    <nav
      aria-label="Palette"
      className="pointer-events-auto flex w-52 flex-col gap-3 rounded-2xl bg-honey p-2.5 shadow-soft"
    >
      <PaletteGroup title="Tracks" kind="track" />
      <PaletteGroup title="Decorations" kind="decoration" />
    </nav>
  );
}
