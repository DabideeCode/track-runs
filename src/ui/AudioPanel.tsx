import { useState } from 'react';
import { getAudioSettings, updateAudioSettings } from '@/audio/audioEngine';
import { cn } from './components/cn';
import { Button } from './components/button';
import { MuteIcon, VolumeIcon } from './icons';

export function AudioPanel({ className }: { className?: string }) {
  const [settings, setSettings] = useState(getAudioSettings);

  const update = (next: Partial<typeof settings>) => {
    updateAudioSettings(next);
    setSettings(getAudioSettings());
  };

  return (
    <section
      aria-label="Sound"
      className={cn('flex w-52 items-center gap-2 rounded-2xl bg-paper/95 p-2 text-ink shadow-soft', className)}
    >
      <Button
        variant="quiet"
        size="icon"
        data-testid="mute-toggle"
        aria-label="Mute sound"
        aria-pressed={settings.muted}
        onClick={() => update({ muted: !settings.muted })}
      >
        {settings.muted ? <MuteIcon /> : <VolumeIcon />}
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-ink-soft">
        <label className="flex items-center justify-between gap-2">
          Music
          <input
            type="range"
            className="range-input w-24"
            min={0}
            max={100}
            data-testid="music-volume"
            value={Math.round(settings.musicVolume * 100)}
            onChange={(event) => update({ musicVolume: Number(event.target.value) / 100 })}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          Effects
          <input
            type="range"
            className="range-input w-24"
            min={0}
            max={100}
            data-testid="sfx-volume"
            value={Math.round(settings.sfxVolume * 100)}
            onChange={(event) => update({ sfxVolume: Number(event.target.value) / 100 })}
          />
        </label>
      </div>
    </section>
  );
}
