import {
  AutoIcon,
  BackIcon,
  FeatherIcon,
  FlipIcon,
  HammerIcon,
  ManualIcon,
  PlayIcon,
  ResetViewIcon,
  SaveIcon,
  TrashIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Toggle } from '@/components/ui/toggle';
import type { GameState } from '@/domain/types';
import { resetCamera } from '@/interaction/boardView';
import {
  flipStartFacing,
  removeSelected,
  requestBackToMenu,
  saveDiorama,
  setDriveMode,
  setLowQuality,
  setMode,
  setSetting,
} from '@/store/commands';
import { useGameStore } from '@/store/gameStore';

const PANEL = 'pointer-events-auto absolute flex items-center gap-1.5 rounded-2xl bg-parchment/90 p-2 shadow-soft';

export function FileBar() {
  const name = useGameStore((state) => state.dioramaName);
  return (
    <div data-overlay-panel role="toolbar" aria-label="Diorama" className={`${PANEL} top-3 right-3`}>
      <Button data-testid="back-to-menu" variant="ghost" onClick={requestBackToMenu}>
        <BackIcon />
        Menu
      </Button>
      <span className="max-w-40 truncate px-1 text-sm font-semibold text-ink" title={name}>
        {name}
      </span>
      <Button data-testid="save-button" onClick={() => saveDiorama()}>
        <SaveIcon />
        Save
      </Button>
    </div>
  );
}

export function PlayBar() {
  const mode = useGameStore((state) => state.mode);
  const driveMode = useGameStore((state) => state.driveMode);
  const playing = mode === 'play';
  const manual = driveMode === 'manual';

  return (
    <div data-overlay-panel role="toolbar" aria-label="Play controls" className={`${PANEL} top-3 left-1/2 -translate-x-1/2`}>
      <Button
        data-testid="mode-toggle"
        variant="primary"
        aria-pressed={playing}
        className="w-24"
        onClick={() => setMode(playing ? 'build' : 'play')}
      >
        {playing ? <HammerIcon /> : <PlayIcon />}
        {playing ? 'Build' : 'Play'}
      </Button>
      <Toggle
        data-testid="drive-toggle"
        className="w-24"
        pressed={manual}
        disabled={!playing}
        aria-label={manual ? 'Driving: Manual' : 'Driving: Auto'}
        onPressedChange={(pressed) => setDriveMode(pressed ? 'manual' : 'auto')}
      >
        {manual ? <ManualIcon /> : <AutoIcon />}
        {manual ? 'Manual' : 'Auto'}
      </Toggle>
      <Button data-testid="flip-direction" disabled={playing} onClick={flipStartFacing}>
        <FlipIcon />
        Flip direction
      </Button>
    </div>
  );
}

export function ViewBar() {
  const canDelete = useGameStore((state) => state.selectedPieceId !== null && state.mode === 'build');
  const setting = useGameStore((state) => state.setting);
  const lowQuality = useGameStore((state) => state.lowQuality);

  return (
    <div data-overlay-panel role="toolbar" aria-label="View and edit" className={`${PANEL} right-3 bottom-3`}>
      <NativeSelect
        data-testid="setting-select"
        aria-label="Setting"
        value={setting}
        onChange={(event) => {
          setSetting(event.target.value as GameState['setting']);
          // A focused select would swallow keyboard shortcuts.
          event.target.blur();
        }}
      >
        <NativeSelectOption value="bedroom">Bedroom floor</NativeSelectOption>
        <NativeSelectOption value="kitchen">Kitchen table</NativeSelectOption>
      </NativeSelect>
      <Button data-testid="delete-piece" variant="danger" disabled={!canDelete} onClick={removeSelected}>
        <TrashIcon />
        Delete
      </Button>
      <Button data-testid="reset-view" onClick={resetCamera}>
        <ResetViewIcon />
        Reset view
      </Button>
      <Toggle
        data-testid="low-quality-toggle"
        pressed={lowQuality}
        aria-label="Low quality"
        title="Low quality"
        className="w-9 px-0"
        onPressedChange={setLowQuality}
      >
        <FeatherIcon />
      </Toggle>
    </div>
  );
}
