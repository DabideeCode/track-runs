import { PencilIcon, TrashIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { Diorama } from '@/domain/types';
import { askDelete, askRename, openDiorama } from '@/store/commands';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function DioramaRow({ diorama }: { diorama: Diorama }) {
  return (
    <li
      data-testid="diorama-item"
      data-diorama-id={diorama.id}
      className="flex items-center gap-2 rounded-2xl bg-parchment p-2 shadow-soft"
    >
      <Button
        data-testid="diorama-open"
        variant="ghost"
        className="h-auto min-w-0 flex-1 justify-start gap-3 p-1.5 text-left"
        onClick={() => openDiorama(diorama.id)}
      >
        {diorama.thumbnail ? (
          <img src={diorama.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
        ) : (
          <span aria-hidden="true" className="h-14 w-24 shrink-0 rounded-lg bg-linen" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-ink">{diorama.name}</span>
          <span className="block text-sm font-normal text-ink-soft">
            Edited {dateFormat.format(new Date(diorama.updatedAt))}
          </span>
        </span>
      </Button>
      <Button
        data-testid="diorama-rename"
        variant="ghost"
        size="icon"
        aria-label={`Rename ${diorama.name}`}
        onClick={() => askRename(diorama.id, diorama.name)}
      >
        <PencilIcon />
      </Button>
      <Button
        data-testid="diorama-delete"
        variant="danger"
        size="icon"
        aria-label={`Delete ${diorama.name}`}
        onClick={() => askDelete(diorama.id, diorama.name)}
      >
        <TrashIcon />
      </Button>
    </li>
  );
}
