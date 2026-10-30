import { useMemo, type ComponentProps } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn, focusRing } from '@/lib/utils';

/**
 * shadcn/ui slider. `thumbLabel` gives each thumb an accessible name; the
 * test id, when needed, goes on the root through the usual props.
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabel,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root> & { thumbLabel?: string }) {
  const values = useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]),
    [value, defaultValue, min],
  );
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-secondary data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {values.map((_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={thumbLabel}
          className={cn(
            'block size-4 shrink-0 cursor-grab rounded-full border-2 border-primary bg-background shadow-sm transition-colors hover:bg-muted',
            focusRing,
            'disabled:pointer-events-none',
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
