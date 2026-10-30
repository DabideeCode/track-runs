import { useState } from 'react';
import { play } from '@/audio/audioEngine';
import type { Diorama } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';
import { Button } from './components/button';
import { DeleteIcon, RenameIcon } from './icons';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function DioramaEntry({ diorama }: { diorama: Diorama }) {
  const openDiorama = useGameStore((state) => state.openDiorama);
  const renameDiorama = useGameStore((state) => state.renameDiorama);
  const requestDelete = useGameStore((state) => state.requestDelete);
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const confirmRename = () => {
    if (draft === null) return;
    const result = renameDiorama(diorama.id, draft);
    if (result.ok) {
      setDraft(null);
      setMessage(null);
    } else {
      play('invalid');
      setMessage(result.message ?? null);
    }
  };

  const cancelRename = () => {
    setDraft(null);
    setMessage(null);
  };

  return (
    <li
      data-testid="diorama-item"
      data-diorama-id={diorama.id}
      className="flex items-center gap-3 rounded-2xl bg-paper p-3 text-ink shadow-[0_3px_0_var(--color-honey-deep)]"
    >
      {diorama.thumbnail && (
        <img src={diorama.thumbnail} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0 flex-1">
        {draft === null ? (
          <>
            <button
              type="button"
              data-testid="diorama-open"
              aria-label={`Open ${diorama.name}`}
              className="block max-w-full truncate rounded-md text-left text-lg font-bold hover:text-terracotta-deep"
              onClick={() => {
                play('ui');
                openDiorama(diorama.id);
              }}
            >
              {diorama.name}
            </button>
            <p className="text-sm text-ink-soft">Edited {dateFormat.format(new Date(diorama.updatedAt))}</p>
          </>
        ) : (
          <>
            <input
              autoFocus
              data-testid="rename-input"
              aria-label="Diorama name"
              aria-invalid={message !== null}
              className="w-full rounded-lg bg-cream px-3 py-1.5 text-lg font-bold text-ink"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmRename();
                if (event.key === 'Escape') cancelRename();
              }}
              onBlur={() => {
                if (!message) confirmRename();
              }}
            />
            {message && (
              <p role="alert" className="mt-1 text-sm font-medium text-terracotta-deep">
                {message}
              </p>
            )}
          </>
        )}
      </div>
      <Button
        variant="quiet"
        size="icon"
        data-testid="diorama-rename"
        aria-label={`Rename ${diorama.name}`}
        onClick={() => {
          setDraft(diorama.name);
          setMessage(null);
        }}
      >
        <RenameIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        data-testid="diorama-delete"
        aria-label={`Delete ${diorama.name}`}
        onClick={() => requestDelete(diorama.id)}
      >
        <DeleteIcon />
      </Button>
    </li>
  );
}
