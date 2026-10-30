import { play } from '@/audio/audioEngine';
import type { Setting } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';
import { Button } from './components/button';
import { cn } from './components/cn';
import { BackIcon, DeleteIcon, FlipIcon, LowQualityIcon, ResetViewIcon, SaveIcon } from './icons';

interface SliderToggleProps {
  testId: string;
  label: string;
  options: [string, string];
  second: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

// A wooden slider that always shows both states, with the block sitting on the active one.
function SliderToggle({ testId, label, options, second, disabled, onToggle }: SliderToggleProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={`${label}: ${second ? options[1] : options[0]}`}
      aria-pressed={second}
      disabled={disabled}
      className="relative grid h-10 grid-cols-2 rounded-xl bg-honey p-1 text-sm font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => {
        play('ui');
        onToggle();
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-paper shadow-[0_2px_0_var(--color-honey-deep)] transition-transform duration-150 ease-out',
          second && 'translate-x-full',
        )}
      />
      {options.map((option) => (
        <span key={option} className="relative px-3 leading-8">
          {option}
        </span>
      ))}
    </button>
  );
}

export function TopBar() {
  const mode = useGameStore((state) => state.mode);
  const driveMode = useGameStore((state) => state.driveMode);
  const setting = useGameStore((state) => state.setting);
  const dioramaName = useGameStore((state) => state.dioramaName);
  const hasSelection = useGameStore((state) => state.selectedPieceId !== null);
  const lowQuality = useGameStore((state) => state.lowQuality);
  const store = useGameStore.getState;
  const building = mode === 'build';

  return (
    <header className="pointer-events-auto flex items-center gap-1.5 rounded-2xl bg-paper/95 p-2 text-ink shadow-soft">
      <Button
        variant="quiet"
        size="icon"
        data-testid="back-to-menu"
        aria-label="Back to menu"
        title="Back to menu"
        onClick={() => store().requestBack()}
      >
        <BackIcon />
      </Button>
      <p className="max-w-36 truncate px-1 font-bold" title={dioramaName}>
        {dioramaName}
      </p>
      <SliderToggle
        testId="mode-toggle"
        label="Mode"
        options={['Build', 'Play']}
        second={!building}
        onToggle={() => store().setMode(building ? 'play' : 'build')}
      />
      <SliderToggle
        testId="drive-toggle"
        label="Driving"
        options={['Auto', 'Manual']}
        second={driveMode === 'manual'}
        disabled={building}
        onToggle={() => store().setDriveMode(driveMode === 'auto' ? 'manual' : 'auto')}
      />
      <select
        data-testid="setting-select"
        aria-label="Setting"
        className="h-10 rounded-xl bg-cream px-2 text-sm font-semibold text-ink"
        value={setting}
        onChange={(event) => {
          play('ui');
          store().setSetting(event.target.value as Setting);
        }}
      >
        <option value="bedroom">Bedroom floor</option>
        <option value="kitchen">Kitchen table</option>
      </select>
      <Button
        variant="quiet"
        size="icon"
        data-testid="flip-direction"
        aria-label="Flip direction"
        title="Flip direction (F)"
        disabled={!building}
        onClick={() => store().flipDirection()}
      >
        <FlipIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        data-testid="delete-piece"
        aria-label="Delete selected piece"
        title="Delete selected piece (Delete)"
        disabled={!building || !hasSelection}
        onClick={() => {
          const { selectedPieceId, removePiece } = store();
          if (selectedPieceId) removePiece(selectedPieceId);
        }}
      >
        <DeleteIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        data-testid="reset-view"
        aria-label="Reset view"
        title="Reset view"
        onClick={() => store().requestCameraReset()}
      >
        <ResetViewIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        aria-label="Low quality"
        title="Low quality"
        aria-pressed={lowQuality}
        className={lowQuality ? 'bg-cream-deep' : undefined}
        onClick={() => store().setLowQuality(!lowQuality)}
      >
        <LowQualityIcon />
      </Button>
      <Button variant="primary" data-testid="save-button" onClick={() => store().saveDiorama()}>
        <SaveIcon />
        Save
      </Button>
    </header>
  );
}
