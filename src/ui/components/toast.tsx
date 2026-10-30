import { Toast as ToastPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({ className, ...props }: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn('fixed bottom-4 left-1/2 z-50 m-0 -translate-x-1/2 list-none p-0 outline-none', className)}
      {...props}
    />
  );
}

export function Toast({ className, ...props }: ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      className={cn('rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-paper shadow-soft', className)}
      {...props}
    />
  );
}

export const ToastTitle = ToastPrimitive.Title;
