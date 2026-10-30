/**
 * Playfield action bar (task 15.4): Delete selected piece, Undo and Redo.
 *
 * - `delete-piece` is disabled while no piece is selected, during a drag and
 *   in Play mode (Requirement 12.8); activating it removes the selected piece
 *   through `deleteSelected()`, which plays `delete` (Requirement 12.7).
 * - Undo and Redo are disabled in Play mode, during a drag and when their
 *   history stack is empty, matching when the store would ignore them.
 *
 * Every control plays `ui` when activated (Requirement 25.10).
 *
 * Requirements: 12.7, 12.8, 13.1, 25.10, 37.10, 40.6
 */
import { Redo2, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStoreApi, useAppStoreShallow } from '@/store/useAppStore';
import { Button } from '@/ui/components/ui/button';
import { useUiClick, WithTooltip } from '@/ui/overlayControls';

export function ActionBar(props: { className?: string }) {
  const store = useAppStoreApi();
  const ui = useUiClick();
  const { canDelete, canUndo, canRedo } = useAppStoreShallow((s) => {
    const editable = s.screen === 'playfield' && s.mode === 'build' && s.drag === null;
    return {
      canDelete: editable && s.selectedPieceId !== null,
      canUndo: editable && s.history.past.length > 0,
      canRedo: editable && s.history.future.length > 0,
    };
  });

  return (
    <section
      aria-label="Edit actions"
      className={cn('panel fixed bottom-3 left-1/2 -translate-x-1/2 items-center', props.className)}
    >
      <Button
        data-testid="delete-piece"
        aria-label="Delete selected piece"
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={!canDelete}
        onClick={ui(() => {
          store.getState().deleteSelected();
        })}
      >
        <Trash2 />
        Delete
      </Button>
      <WithTooltip hint="Undo (Ctrl+Z)">
        <Button
          aria-label="Undo"
          variant="ghost"
          size="icon"
          disabled={!canUndo}
          onClick={ui(() => {
            store.getState().undo();
          })}
        >
          <Undo2 />
        </Button>
      </WithTooltip>
      <WithTooltip hint="Redo (Ctrl+Shift+Z)">
        <Button
          aria-label="Redo"
          variant="ghost"
          size="icon"
          disabled={!canRedo}
          onClick={ui(() => {
            store.getState().redo();
          })}
        >
          <Redo2 />
        </Button>
      </WithTooltip>
    </section>
  );
}
