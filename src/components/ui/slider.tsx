import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /** Accessible name, set on the thumb, which is the focusable control. */
  thumbLabel: string
}

function Slider({ className, thumbLabel, onFocus, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      tabIndex={-1}
      // Focusing the root (for example by test id) hands focus to the thumb.
      onFocus={(event) => {
        onFocus?.(event)
        if (event.target === event.currentTarget) {
          event.currentTarget.querySelector<HTMLElement>('[role="slider"]')?.focus()
        }
      }}
      className={cn('relative flex h-5 w-full touch-none items-center select-none', className)}
      {...props}
    >
      <SliderPrimitive.Track className="bg-input relative h-1.5 w-full grow overflow-hidden rounded-full">
        <SliderPrimitive.Range className="bg-honey absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={thumbLabel}
        className="focus-ring bg-card border-honey block size-4 rounded-full border-2 shadow-sm"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
