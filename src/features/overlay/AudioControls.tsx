import { EffectsIcon, MusicIcon, SpeakerOffIcon, SpeakerOnIcon } from '@/components/icons';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { updateAudio } from '@/store/commands';
import { useGameStore } from '@/store/gameStore';

function VolumeSlider({
  testId,
  label,
  value,
  icon,
  onChange,
}: {
  testId: string;
  label: string;
  value: number;
  icon: React.ReactNode;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <label className="flex items-center gap-1.5 text-ink-soft" title={label}>
      {icon}
      <input
        data-testid={testId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label={label}
        className="track-range w-20 cursor-pointer"
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
    </label>
  );
}

export function AudioControls({ className }: { className?: string }) {
  const { muted, musicVolume, sfxVolume } = useGameStore((state) => state.audio);
  return (
    <div
      data-overlay-panel
      role="group"
      aria-label="Audio"
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded-2xl bg-parchment/90 p-2 pr-3 shadow-soft',
        className,
      )}
    >
      <Toggle
        data-testid="mute-toggle"
        pressed={muted}
        aria-label="Mute"
        className="w-9 px-0"
        onPressedChange={(pressed) => updateAudio({ muted: pressed })}
      >
        {muted ? <SpeakerOffIcon /> : <SpeakerOnIcon />}
      </Toggle>
      <VolumeSlider
        testId="music-volume"
        label="Music volume"
        value={musicVolume}
        icon={<MusicIcon />}
        onChange={(value) => updateAudio({ musicVolume: value })}
      />
      <VolumeSlider
        testId="sfx-volume"
        label="Effects volume"
        value={sfxVolume}
        icon={<EffectsIcon />}
        onChange={(value) => updateAudio({ sfxVolume: value })}
      />
    </div>
  );
}
