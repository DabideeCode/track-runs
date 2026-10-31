import { PlusIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { AudioControls } from '@/features/overlay/AudioControls';
import { newDiorama } from '@/store/commands';
import { useGameStore } from '@/store/gameStore';
import { DioramaRow } from './DioramaRow';

export function MainMenu() {
  const dioramas = useGameStore((state) => state.savedDioramas);

  return (
    <main data-testid="main-menu" className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-8 px-6 py-14">
      <header className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-6xl font-bold tracking-tight text-terracotta-deep">Track</h1>
          <p className="mt-2 text-lg text-ink-soft">Build a little wooden railway, then play on it.</p>
        </div>
        <Button data-testid="new-diorama" variant="primary" size="md" onClick={newDiorama}>
          <PlusIcon />
          New diorama
        </Button>
      </header>

      {dioramas.length > 0 ? (
        <ul data-testid="diorama-list" aria-label="Saved dioramas" className="flex flex-col gap-3">
          {dioramas.map((diorama) => (
            <DioramaRow key={diorama.id} diorama={diorama} />
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl bg-parchment px-6 py-12 text-center shadow-soft">
          <p className="text-xl font-semibold text-ink">No dioramas yet</p>
          <p className="mt-1 text-ink-soft">Press New diorama to lay your first track.</p>
        </div>
      )}

      <AudioControls className="mt-auto self-start" />
    </main>
  );
}
