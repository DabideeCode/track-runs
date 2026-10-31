import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { cn } from '@/lib/utils'

const ToastProvider = ToastPrimitive.Provider

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        'fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 list-none flex-col items-center outline-none',
        className,
      )}
      {...props}
    />
  )
}

function Toast({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        'data-[state=open]:animate-toast-in data-[state=closed]:animate-toast-out bg-foreground text-background rounded-full px-5 py-2.5 text-sm font-semibold shadow-panel',
        className,
      )}
      {...props}
    />
  )
}

const ToastDescription = ToastPrimitive.Description

export { Toast, ToastDescription, ToastProvider, ToastViewport }
