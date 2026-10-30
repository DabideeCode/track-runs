import { useGameStore } from '@/store/gameStore';
import { Toast, ToastProvider, ToastTitle, ToastViewport } from './components/toast';

const TOAST_MS = 3000;

export function Toaster() {
  const toast = useGameStore((state) => state.toast);
  const clearToast = useGameStore((state) => state.clearToast);

  return (
    <ToastProvider duration={TOAST_MS} swipeDirection="down">
      {toast && (
        <Toast
          key={toast.id}
          data-testid="toast"
          onOpenChange={(open) => {
            if (!open) clearToast(toast.id);
          }}
        >
          <ToastTitle>{toast.message}</ToastTitle>
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}
