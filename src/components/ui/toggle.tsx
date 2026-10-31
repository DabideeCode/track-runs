import * as TogglePrimitive from '@radix-ui/react-toggle';
import type { ComponentProps } from 'react';
import { emitSound } from '@/audio/soundLog';
import { cn } from '@/lib/utils';

export function Toggle({ className, onClick, ...props }: ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      className={cn(
        'inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium whitespace-nowrap',
        'bg-linen text-ink transition-[background-color,transform,opacity] duration-150 hover:bg-linen/70 active:scale-[0.97]',
        'data-[state=on]:bg-sage-deep data-[state=on]:text-parchment',
        'disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      onClick={(event) => {
        emitSound('ui');
        onClick?.(event);
      }}
      {...props}
    />
  );
}
