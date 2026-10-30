/**
 * Toast list (task 15.5). Renders the store's toast slice, the only source of
 * toasts: one Radix Toast per message, oldest first, so the newest is at the
 * bottom, and never more than `MAX_TOASTS` (D-29).
 *
 * The store owns timing (`TOAST_MS`), so each Radix toast gets
 * `duration={Infinity}` and never closes on its own. Closing it (the close
 * button, a swipe or Escape on a focused toast) calls `dismissToast`. The
 * Radix root is an `<li role="status">` that carries `data-testid="toast"`;
 * Radix's separate screen-reader announcer copy has no test id, so there is
 * exactly one `toast` element per message (D-56).
 *
 * Requirements: 22.2, 22.11, 37.12
 */
import { useAppStoreApi, useAppStoreShallow } from '@/store/useAppStore';
import { MAX_TOASTS } from '@/store/createAppStore';
import { Toast, ToastClose, ToastProvider, ToastTitle, ToastViewport } from '@/ui/components/ui/toast';

export function Toasts() {
  const store = useAppStoreApi();
  const toasts = useAppStoreShallow((s) => s.toasts.slice(-MAX_TOASTS));

  return (
    <ToastProvider duration={Infinity} swipeDirection="right">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          data-testid="toast"
          role="status"
          tone={t.tone}
          open
          duration={Infinity}
          onOpenChange={(open) => {
            if (!open) store.getState().dismissToast(t.id);
          }}
        >
          <ToastTitle className="font-medium">{t.text}</ToastTitle>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
