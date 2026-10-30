import type { ButtonHTMLAttributes } from 'react';
import { play } from '@/audio/audioEngine';
import { cn } from './cn';

const VARIANTS = {
  primary:
    'bg-terracotta-deep text-paper shadow-[0_3px_0_var(--color-ink-soft)] hover:bg-terracotta active:translate-y-0.5 active:shadow-none',
  wood: 'bg-paper text-ink shadow-[0_2px_0_var(--color-honey-deep)] hover:bg-cream active:translate-y-0.5 active:shadow-none',
  quiet: 'text-ink hover:bg-cream-deep',
};

const SIZES = {
  md: 'h-10 px-4 text-sm',
  icon: 'size-10',
  lg: 'h-12 px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function Button({ variant = 'wood', size = 'md', className, onClick, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      onClick={(event) => {
        play('ui');
        onClick?.(event);
      }}
      {...props}
    />
  );
}
