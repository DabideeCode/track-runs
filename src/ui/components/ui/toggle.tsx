import type { ComponentProps } from 'react';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn, focusRing } from '@/lib/utils';

const toggleVariants = cva(
  [
    'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors',
    focusRing,
    'hover:bg-muted hover:text-foreground',
    'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-background/80 shadow-xs',
      },
      size: {
        default: 'h-9 min-w-9 px-3',
        sm: 'h-8 min-w-8 px-2.5',
        lg: 'h-10 min-w-10 px-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
