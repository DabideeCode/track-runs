import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, description, onClose, children }: DialogProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/45" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper p-6 shadow-soft">
          <DialogPrimitive.Title className="text-xl font-bold text-ink">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-ink-soft">
            {description}
          </DialogPrimitive.Description>
          <div className="mt-6 flex justify-end gap-2">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
