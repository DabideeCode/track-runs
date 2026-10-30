/**
 * Playfield top bar (task 15.4): back to menu, the diorama name, Save, the
 * Build/Play toggle, the Auto/Manual toggle, Flip direction and the Setting
 * selector.
 *
 * - `mode-toggle` is a Radix Toggle named "Play", pressed in Play mode, with
 *   `data-value` set to the current mode. Activating it asks the store for the
 *   other mode; a rejected Play request (no station) leaves it unpressed.
 * - `drive-toggle` is a Radix Toggle named "Manual driving", pressed while
 *   `driveMode` is `'manual'`, with `data-value` set to the drive mode. It is
 *   disabled in Build mode (Requirement 20.6).
 * - `flip-direction` is disabled in Play mode (Requirement 17.10) and carries
 *   `data-value` with the current `startFacing`.
 * - `setting-select` is a single-choice Radix ToggleGroup with "Bedroom floor"
 *   and "Kitchen table", carrying `data-value`; it stays enabled in both modes
 *   (Requirement 7.9).
 * - Save works in both modes; Back to menu opens the unsaved-changes dialog
 *   when the diorama is dirty (the store decides).
 *
 * Toggle names stay the same in both states and the state is exposed through
 * `aria-pressed` (D-55). Every control plays `ui` when activated.
 *
 * Requirements: 7.1, 7.9, 17.3, 17.10, 18.1, 20.1, 20.6, 22.1, 25.10, 37.9, 37.10, 40.6, 41.3
 */
import { ArrowLeft, ArrowLeftRight, Gamepad2, Play, Save } from 'lucide-react';
import type { GameState } from '@/domain/types';
import { cn } from '@/lib/utils';
import { useAppStore, useAppStoreApi, useAppStoreShallow } from '@/store/useAppStore';
import { Button } from '@/ui/components/ui/button';
import { Toggle } from '@/ui/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { useUiClick, WithTooltip } from '@/ui/overlayControls';

/** The two settings, in display order (Requirement 41.3). */
export const SETTING_OPTIONS: ReadonlyArray<{ value: GameState['setting']; label: string }> = [
  { value: 'bedroom', label: 'Bedroom floor' },
  { value: 'kitchen', label: 'Kitchen table' },
];

export function TopBar(props: { className?: string }) {
  const store = useAppStoreApi();
  const ui = useUiClick();
  const { mode, driveMode, setting, startFacing } = useAppStoreShallow((s) => ({
    mode: s.mode,
    driveMode: s.driveMode,
    setting: s.setting,
    startFacing: s.startFacing,
  }));
  const name = useAppStore((s) => s.dioramaName);
  const isDirty = useAppStore((s) => s.isDirty);
  const play = mode === 'play';

  return (
    <header
      aria-label="Diorama controls"
      className={cn('panel fixed top-3 left-1/2 -translate-x-1/2 items-center', props.className)}
    >
      <WithTooltip hint="Back to menu" side="bottom">
        <Button
          data-testid="back-to-menu"
          aria-label="Back to menu"
          variant="ghost"
          size="icon"
          onClick={ui(() => store.getState().backToMenu())}
        >
          <ArrowLeft />
        </Button>
      </WithTooltip>

      <div className="flex max-w-52 min-w-0 items-center gap-2 px-1">
        <span className="truncate text-base font-semibold" title={name}>
          {name}
        </span>
        {isDirty && (
          <span className="flex items-center" title="Unsaved changes">
            <span aria-hidden="true" className="size-2 rounded-full bg-honey" />
            <span className="sr-only">Unsaved changes</span>
          </span>
        )}
      </div>

      <Button data-testid="save-button" variant="outline" size="sm" onClick={ui(() => store.getState().save('manual'))}>
        <Save />
        Save
      </Button>

      <Toggle
        data-testid="mode-toggle"
        data-value={mode}
        variant="outline"
        size="sm"
        pressed={play}
        onPressedChange={ui((pressed: boolean) => {
          store.getState().setMode(pressed ? 'play' : 'build');
        })}
      >
        <Play />
        Play
      </Toggle>

      <Toggle
        data-testid="drive-toggle"
        data-value={driveMode}
        variant="outline"
        size="sm"
        disabled={!play}
        pressed={driveMode === 'manual'}
        onPressedChange={ui(() => {
          store.getState().toggleDriveMode();
        })}
      >
        <Gamepad2 />
        Manual driving
      </Toggle>

      <Button
        data-testid="flip-direction"
        data-value={startFacing}
        variant="outline"
        size="sm"
        disabled={play}
        onClick={ui(() => {
          store.getState().flipStartFacing();
        })}
      >
        <ArrowLeftRight />
        Flip direction
      </Button>

      <ToggleGroup
        data-testid="setting-select"
        data-value={setting}
        type="single"
        variant="outline"
        size="sm"
        aria-label="Setting"
        value={setting}
        onValueChange={(value) => {
          // Clicking the active item reports '' (deselect); a setting is always chosen.
          if (value === 'bedroom' || value === 'kitchen') store.getState().setSetting(value);
        }}
      >
        {SETTING_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            onClick={() => store.getState().playUi()}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </header>
  );
}
