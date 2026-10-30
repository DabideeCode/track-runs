import { useEffect, useMemo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { AudioPanel } from './AudioPanel';
import { Button } from './components/button';
import { ConfirmDialog } from './ConfirmDialog';
import { DioramaEntry } from './DioramaEntry';
import { PlusIcon } from './icons';

function Wordmark() {
  return (
    <div>
      <h1 className="text-[clamp(5rem,13vw,10rem)] leading-none font-extrabold tracking-tight text-cream">
        Track
      </h1>
      <svg viewBox="0 0 480 40" className="mt-2 w-full max-w-md" aria-hidden="true">
        <rect x="0" y="12" width="480" height="20" rx="6" fill="var(--color-honey)" />
        <path d="M0 18h480M0 26h480" stroke="var(--color-honey-deep)" strokeWidth="2.5" />
        <g className="motion-safe:animate-[roll_14s_ease-in-out_infinite_alternate]">
          <rect x="6" y="3" width="44" height="17" rx="5" fill="var(--color-terracotta)" />
          <rect x="30" y="-5" width="16" height="12" rx="3" fill="var(--color-cream)" />
          <rect x="54" y="6" width="34" height="14" rx="4" fill="var(--color-dusty)" />
          <rect x="92" y="6" width="34" height="14" rx="4" fill="var(--color-cream)" />
        </g>
      </svg>
    </div>
  );
}

export function MainMenu() {
  const savedDioramas = useGameStore((state) => state.savedDioramas);
  const newDiorama = useGameStore((state) => state.newDiorama);
  const refreshSaved = useGameStore((state) => state.refreshSaved);

  useEffect(refreshSaved, [refreshSaved]);

  const sorted = useMemo(
    () => [...savedDioramas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedDioramas],
  );

  return (
    <main data-testid="main-menu" className="relative h-full overflow-y-auto bg-sage-deep">
      <div className="mx-auto grid min-h-full max-w-6xl items-center gap-12 px-8 py-12 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col items-start gap-8">
          <Wordmark />
          <Button variant="primary" size="lg" data-testid="new-diorama" onClick={newDiorama}>
            <PlusIcon />
            New diorama
          </Button>
        </div>
        <section aria-label="Saved dioramas">
          {sorted.length === 0 && (
            <p className="text-lg text-cream">
              No dioramas yet. Choose New diorama and lay your first track.
            </p>
          )}
          <ul data-testid="diorama-list" className="m-0 flex max-h-[70vh] list-none flex-col gap-3 overflow-y-auto p-1">
            {sorted.map((diorama) => (
              <DioramaEntry key={diorama.id} diorama={diorama} />
            ))}
          </ul>
        </section>
      </div>
      <AudioPanel className="fixed right-4 bottom-4" />
      <ConfirmDialog />
    </main>
  );
}
