import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { playSound } from '@/audio/soundBus'

/** shadcn Button that plays the subtle UI click (AC-12.4). */
export function UiButton({ onClick, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        playSound('ui')
        onClick?.(e)
      }}
    />
  )
}
