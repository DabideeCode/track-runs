import { Music2, Volume2, VolumeX, Wand2 } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { useGameStore } from '@/store/gameStore'
import { UiButton } from './UiButton'

/** Mute toggle plus separate music and effects volumes; persisted (AC-12.7). */
export function AudioControls() {
  const audio = useGameStore((s) => s.audio)
  const setAudio = useGameStore((s) => s.setAudio)
  return (
    <div className="flex items-center gap-3">
      <UiButton
        data-testid="mute-toggle"
        variant="ghost"
        size="icon"
        aria-pressed={audio.muted}
        aria-label={audio.muted ? 'Unmute sound' : 'Mute sound'}
        title={audio.muted ? 'Unmute sound' : 'Mute sound'}
        onClick={() => setAudio({ muted: !audio.muted })}
        className="size-9 rounded-full"
      >
        {audio.muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
      </UiButton>
      <div className="flex items-center gap-1.5 text-muted-foreground" title="Music volume">
        <Music2 className="size-4 shrink-0" aria-hidden />
        <Slider
          data-testid="music-volume"
          thumbLabel="Music volume"
          className="w-20"
          min={0}
          max={100}
          step={5}
          value={[audio.music]}
          onValueChange={([v]) => setAudio({ music: v })}
        />
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground" title="Effects volume">
        <Wand2 className="size-4 shrink-0" aria-hidden />
        <Slider
          data-testid="sfx-volume"
          thumbLabel="Effects volume"
          className="w-20"
          min={0}
          max={100}
          step={5}
          value={[audio.sfx]}
          onValueChange={([v]) => setAudio({ sfx: v })}
        />
      </div>
    </div>
  )
}
