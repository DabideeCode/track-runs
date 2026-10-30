import type { ComponentProps, ReactElement } from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';

/*
 * shadcn/ui toast, presentational only. The toast list lives in the app
 * store's toast slice (`pushToast`, `dismissToast`); `Toasts.tsx` renders one
 * <Toast> per store entry. There is no `useToast` hook or second toast state.
 */

const ToastProvider = ToastPrimitives.Provider;

function ToastViewport({ className, ...props }: ComponentProps<typeof ToastPrimitives.Viewport>) {
  return (
    <ToastPrimitives.Viewport
      data-slot="toast-viewport"
      // Newest toast at the bottom (D-29); 8 px between toasts.
      className={cn(
        'fixed top-20 right-4 z-[100] m-0 flex max-h-screen w-full max-w-sm list-none flex-col gap-2 p-0 outline-none',
        className,
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  [
    'group pointer-events-auto relative flex w-full items-center justify-between gap-3 overflow-hidden',
    'rounded-lg border border-border border-l-4 bg-panel/95 p-3 pr-10 text-sm text-panel-foreground shadow-panel',
    'data-[state=open]:animate-toast-in data-[state=closed]:animate-toast-out',
    'data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none',
  ],
  {
    variants: {
      tone: {
        info: 'border-l-info',
        success: 'border-l-success',
        error: 'border-l-destructive',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

function Toast({
  className,
  tone,
  ...props
}: ComponentProps<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>) {
  return (
    <ToastPrimitives.Root
      data-slot="toast"
      data-tone={tone ?? 'info'}
      className={cn(toastVariants({ tone }), className)}
      {...props}
    />
  );
}

function ToastAction({ className, ...props }: ComponentProps<typeof ToastPrimitives.Action>) {
  return (
    <ToastPrimitives.Action
      data-slot="toast-action"
      className={cn(
        'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-background/80 px-3 text-sm font-medium hover:bg-accent',
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

function ToastClose({
  className,
  'aria-label': ariaLabel = 'Dismiss',
  ...props
}: ComponentProps<typeof ToastPrimitives.Close>) {
  return (
    <ToastPrimitives.Close
      data-slot="toast-close"
      aria-label={ariaLabel}
      className={cn(
        'absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
        focusRing,
        className,
      )}
      {...props}
    >
      <X className="size-4" aria-hidden="true" />
    </ToastPrimitives.Close>
  );
}

function ToastTitle({ className, ...props }: ComponentProps<typeof ToastPrimitives.Title>) {
  return <ToastPrimitives.Title data-slot="toast-title" className={cn('font-semibold', className)} {...props} />;
}

function ToastDescription({ className, ...props }: ComponentProps<typeof ToastPrimitives.Description>) {
  return (
    <ToastPrimitives.Description
      data-slot="toast-description"
      className={cn('text-sm opacity-90', className)}
      {...props}
    />
  );
}

type ToastProps = ComponentProps<typeof Toast>;
type ToastActionElement = ReactElement<typeof ToastAction>;

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  toastVariants,
  type ToastActionElement,
  type ToastProps,
};
