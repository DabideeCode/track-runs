/**
 * One saved diorama in the main menu list (task 15.2).
 *
 * Shows the thumbnail (or a placeholder when there is none or it cannot be
 * displayed), the full name, the last-edited date in the user's locale, and
 * the open, rename and delete icon buttons. While `renaming` is true the name
 * is replaced by `rename-input`, focused and prefilled with the current name:
 * Enter or moving focus away confirms, Escape cancels.
 *
 * The card is presentational: `MainMenu` passes the store actions in.
 *
 * Requirements: 3.2, 3.3, 5.1, 5.2, 5.3, 5.7, 6.2, 6.3, 6.5, 37.2, 37.3, 37.4, 40.6
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FolderOpen, Pencil, Trash2 } from 'lucide-react';
import type { Diorama } from '@/domain/types';
import { cn, focusRing } from '@/lib/utils';
import { Button } from '@/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';

/** Locale date and time, for example "29 Oct 2026, 10:15" (Requirement 3.3). */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** `updatedAt` in the user's locale date and time format. */
export function formatUpdatedAt(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : dateFormat.format(ms);
}

export interface DioramaCardProps {
  diorama: Diorama;
  /** True while this entry shows `rename-input`. */
  renaming: boolean;
  /** Validation message for the rename in progress, or null. */
  renameError: string | null;
  onOpen(): void;
  onStartRename(): void;
  /**
   * Confirms the typed name (Enter or blur). Returns true when the input stays
   * open because the name was rejected, so a later Enter or blur can confirm
   * again; false when the rename is over (stored, or a failed write).
   */
  onConfirmRename(name: string): boolean;
  /** Closes the input without saving (Escape). */
  onCancelRename(): void;
  onDelete(): void;
}

export function DioramaCard(props: DioramaCardProps) {
  const { diorama, renaming } = props;
  return (
    <li
      data-testid="diorama-item"
      data-diorama-id={diorama.id}
      className="panel flex-col gap-3"
    >
      <Thumbnail src={diorama.thumbnail} name={diorama.name} />
      <div className="flex min-h-14 flex-col gap-1">
        {renaming ? (
          <RenameField
            initial={diorama.name}
            error={props.renameError}
            onConfirm={props.onConfirmRename}
            onCancel={props.onCancelRename}
          />
        ) : (
          <h3 className="text-base leading-snug font-semibold break-words">{diorama.name}</h3>
        )}
        <p className="text-sm text-muted-foreground">
          Last edited <time dateTime={diorama.updatedAt}>{formatUpdatedAt(diorama.updatedAt)}</time>
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        <IconButton
          testId="diorama-rename"
          label={`Rename ${diorama.name}`}
          hint="Rename"
          variant="ghost"
          disabled={renaming}
          onClick={props.onStartRename}
        >
          <Pencil />
        </IconButton>
        <IconButton
          testId="diorama-delete"
          label={`Delete ${diorama.name}`}
          hint="Delete"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={props.onDelete}
        >
          <Trash2 />
        </IconButton>
        <IconButton
          testId="diorama-open"
          label={`Open ${diorama.name}`}
          hint="Open"
          variant="default"
          onClick={props.onOpen}
        >
          <FolderOpen />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton(props: {
  testId: string;
  label: string;
  hint: string;
  variant: 'default' | 'ghost';
  className?: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid={props.testId}
          aria-label={props.label}
          variant={props.variant}
          size="icon"
          className={props.className}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The thumbnail area. A missing thumbnail, or one the browser cannot decode
 * (`onError`), shows the placeholder in the same 4:3 area (Requirements 6.2,
 * 6.3, 6.5).
 */
function Thumbnail({ src, name }: { src: string | undefined; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = typeof src === 'string' && src.length > 0 && src !== failedSrc;
  return (
    <div
      data-thumbnail={showImage ? 'image' : 'placeholder'}
      className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border bg-parchment"
    >
      {showImage ? (
        <img
          src={src}
          alt={`Preview of ${name}`}
          className="size-full object-contain"
          draggable={false}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <PlaceholderImage />
      )}
    </div>
  );
}

/** A small drawing of a track loop on a rug, used when there is no thumbnail. */
function PlaceholderImage() {
  return (
    <svg
      data-testid="thumbnail-placeholder"
      viewBox="0 0 160 120"
      className="h-3/5 w-auto text-ink-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="34" y="28" width="92" height="64" rx="32" />
      <rect x="50" y="44" width="60" height="32" rx="16" opacity={0.5} />
      <path d="M64 28v-8M80 28v-8M96 28v-8M64 100v-8M80 100v-8M96 100v-8" opacity={0.6} />
    </svg>
  );
}

/**
 * `rename-input`: focused and fully selected on mount. Enter or blur confirms
 * the typed name; Escape cancels. Once a confirm closes the rename, or Escape
 * cancels it, later events are ignored, so the blur that can follow when the
 * input unmounts never confirms a second time (and never confirms after
 * Escape). A rejected name keeps the input open with the message, and the
 * next Enter or blur confirms again.
 */
function RenameField(props: {
  initial: string;
  error: string | null;
  onConfirm(name: string): boolean;
  onCancel(): void;
}) {
  const [value, setValue] = useState(props.initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const errorId = useId();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  function confirm() {
    if (settled.current || !inputRef.current?.isConnected) return;
    settled.current = true;
    const keepOpen = props.onConfirm(value);
    if (keepOpen) settled.current = false;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      settled.current = true;
      props.onCancel();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        data-testid="rename-input"
        type="text"
        aria-label="Diorama name"
        aria-invalid={props.error !== null}
        aria-describedby={props.error !== null ? errorId : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={confirm}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-background px-3 text-base font-semibold',
          focusRing,
          props.error !== null && 'border-destructive',
        )}
      />
      {props.error !== null && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {props.error}
        </p>
      )}
    </div>
  );
}
