/**
 * Playfield view and sound panel (task 15.4): Reset view, Low quality, Mute
 * and the music and effects volume sliders.
 *
 * - `reset-view` asks the scene bridge to animate the camera back to the
 *   default pose (Requirement 9.8). The store never resets the camera, and the
 *   camera pose is not part of the diorama, so nothing becomes dirty.
 * - Low quality is a Radix Toggle; the store persists it under
 *   `wooden-diorama:settings` and the canvas applies it live (Requirement 33.3).
 * - `mute-toggle` is an icon-only Radix Toggle named "Mute", pressed while
 *   muted. Muting keeps the stored volumes (Requirement 27.10).
 * - `music-volume` and `sfx-volume` are Radix sliders from 0 to 1 in steps of
 *   0.01 (Requirement 27.6); the test ids sit on the slider roots and the
 *   thumbs are named "Music volume" and "Effects volume".
 *
 * Buttons and toggles play `ui` when activated; a slider plays `ui` once when
 * a change is committed (pointer release or key press), not on every value
 * step of a drag (D-55).
 *
 * Requirements: 9.8, 25.10, 27.6, 33.3, 37.10, 37.11, 40.6
 */
import { Gauge, LocateFixed, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSceneBridge } from '@/scene/context';
import { useAppStoreApi, useAppStoreShallow } from '@/store/useAppStore';
import { Button } from '@/ui/components/ui/button';
import { Slider } from '@/ui/components/ui/slider';
import { Toggle } from '@/ui/components/ui/toggle';
import { useUiClick, WithTooltip } from '@/ui/overlayControls';

/** Slider range and step (Requirement 27.6). */
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 1;
export const VOLUME_STEP = 0.01;

export function ViewPanel(props: { className?: string }) {
  const store = useAppStoreApi();
  const bridge = useSceneBridge();
  const ui = useUiClick();
  const { muted, musicVolume, sfxVolume, lowQuality } = useAppStoreShallow((s) => ({
    muted: s.audio.muted,
    musicVolume: s.audio.musicVolume,
    sfxVolume: s.audio.sfxVolume,
    lowQuality: s.lowQuality,
  }));
  const playUi = () => store.getState().playUi();

  return (
    <section
      aria-label="View and sound"
      className={cn('panel fixed right-3 bottom-3 w-75 flex-col', props.className)}
    >
      <div className="flex items-center gap-2">
        <WithTooltip hint="Move the camera back to the starting view">
          <Button
            data-testid="reset-view"
            variant="outline"
            size="sm"
            onClick={ui(() => bridge.resetView())}
          >
            <LocateFixed />
            Reset view
          </Button>
        </WithTooltip>
        <Toggle
          variant="outline"
          size="sm"
          pressed={lowQuality}
          onPressedChange={ui((pressed: boolean) => store.getState().setLowQuality(pressed))}
        >
          <Gauge />
          Low quality
        </Toggle>
      </div>

      <div className="flex items-center gap-2">
        <Toggle
          data-testid="mute-toggle"
          aria-label="Mute"
          variant="outline"
          size="sm"
          pressed={muted}
          onPressedChange={ui((pressed: boolean) => store.getState().setMuted(pressed))}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </Toggle>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <VolumeRow
            testId="music-volume"
            label="Music"
            thumbLabel="Music volume"
            value={musicVolume}
            onChange={(v) => store.getState().setMusicVolume(v)}
            onCommit={playUi}
          />
          <VolumeRow
            testId="sfx-volume"
            label="Effects"
            thumbLabel="Effects volume"
            value={sfxVolume}
            onChange={(v) => store.getState().setSfxVolume(v)}
            onCommit={playUi}
          />
        </div>
      </div>
    </section>
  );
}

function VolumeRow(props: {
  testId: string;
  label: string;
  thumbLabel: string;
  value: number;
  onChange(value: number): void;
  onCommit(): void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="w-14 shrink-0 text-sm text-muted-foreground">
        {props.label}
      </span>
      <Slider
        data-testid={props.testId}
        thumbLabel={props.thumbLabel}
        min={VOLUME_MIN}
        max={VOLUME_MAX}
        step={VOLUME_STEP}
        value={[props.value]}
        onValueChange={(values) => {
          const v = values[0];
          if (typeof v === 'number') props.onChange(v);
        }}
        onValueCommit={props.onCommit}
      />
    </div>
  );
}
