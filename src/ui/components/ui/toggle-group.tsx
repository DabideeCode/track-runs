import { createContext, useContext, type ComponentProps } from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { toggleVariants } from '@/ui/components/ui/toggle';

type ToggleVariantProps = VariantProps<typeof toggleVariants>;

const ToggleGroupContext = createContext<ToggleVariantProps>({ variant: 'default', size: 'default' });

/**
 * Segmented control. Unlike the stock shadcn group, items are separate rounded
 * buttons 8 px apart, so adjacent controls keep the 8 px gap and every control
 * keeps rounded corners (Requirements 30.4, 30.5).
 */
function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root> & ToggleVariantProps) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn('flex w-fit items-center gap-2', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item> & ToggleVariantProps) {
  const context = useContext(ToggleGroupContext);
  const resolvedVariant = context.variant ?? variant;
  const resolvedSize = context.size ?? size;
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      className={cn(toggleVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
