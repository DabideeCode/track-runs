import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 cursor-pointer rounded-xl border-0 bg-linen px-3 text-sm font-medium text-ink',
        'transition-colors duration-150 hover:bg-linen/70 disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

export const NativeSelectOption = (props: ComponentProps<'option'>) => <option {...props} />;
