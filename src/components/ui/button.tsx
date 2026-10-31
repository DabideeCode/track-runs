import { Slot } from '@radix-ui/react-slot';
import type { ComponentProps } from 'react';
import { emitSound } from '@/audio/soundLog';
import { cn } from '@/lib/utils';

const variants = {
  primary: 'bg-terracotta-deep text-parchment hover:bg-terracotta-deep/90 shadow-press',
  secondary: 'bg-linen text-ink hover:bg-linen/70',
  ghost: 'bg-transparent text-ink hover:bg-linen/70',
  danger: 'bg-transparent text-terracotta-deep hover:bg-terracotta/15',
} as const;

const sizes = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-base',
  icon: 'size-9',
} as const;

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
}

export const buttonClasses = (variant: keyof typeof variants, size: keyof typeof sizes): string =>
  cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl font-medium whitespace-nowrap',
    'transition-[background-color,transform,opacity] duration-150 active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-45',
    variants[variant],
    sizes[size],
  );

export function Button({
  variant = 'secondary',
  size = 'sm',
  asChild = false,
  className,
  onClick,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      type={asChild ? undefined : 'button'}
      className={cn(buttonClasses(variant, size), className)}
      onClick={(event) => {
        emitSound('ui');
        onClick?.(event as never);
      }}
      {...props}
    />
  );
}
