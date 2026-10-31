import { useGameStore } from '@/store/gameStore';

export function Toast() {
  const toast = useGameStore((state) => state.toast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center" role="status" aria-live="polite">
      {toast && (
        <div
          key={toast.id}
          data-testid="toast"
          className="rounded-xl bg-ink/90 px-4 py-2 text-sm font-medium text-parchment shadow-soft"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
