import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-[background-color,color,transform,opacity] duration-150 select-none active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100 [&_svg]:size-4.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-foreground hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent/70',
        destructive: 'bg-destructive text-primary-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-12 rounded-lg px-6 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
