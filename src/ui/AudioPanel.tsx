import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useGame } from '@/game/store'

function VolumeRow({
  label,
  testId,
  value,
  onChange,
}: {
  label: string
  testId: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid grid-cols-[3.25rem_1fr] items-center gap-2 text-xs font-semibold">
      <span>{label}</span>
      <Slider
        data-testid={testId}
        thumbLabel={`${label} volume`}
        min={0}
        max={100}
        step={5}
        value={[Math.round(value * 100)]}
        onValueChange={([next]) => onChange(next / 100)}
      />
    </label>
  )
}

export function AudioPanel() {
  const audio = useGame((state) => state.audio)
  const setAudio = useGame((state) => state.setAudio)

  return (
    <section
      aria-label="Sound"
      className="panel pointer-events-auto absolute right-3 bottom-3 flex w-[232px] items-center gap-2 py-1.5 pr-3 pl-1.5"
    >
      <Button
        data-testid="mute-toggle"
        variant="ghost"
        size="icon"
        aria-label={audio.muted ? 'Unmute sound' : 'Mute sound'}
        aria-pressed={audio.muted}
        onClick={() => setAudio({ muted: !audio.muted })}
      >
        {audio.muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
      </Button>
      <div className="flex-1 space-y-0.5">
        <VolumeRow
          label="Music"
          testId="music-volume"
          value={audio.musicVolume}
          onChange={(musicVolume) => setAudio({ musicVolume })}
        />
        <VolumeRow
          label="Effects"
          testId="sfx-volume"
          value={audio.sfxVolume}
          onChange={(sfxVolume) => setAudio({ sfxVolume })}
        />
      </div>
    </section>
  )
}
