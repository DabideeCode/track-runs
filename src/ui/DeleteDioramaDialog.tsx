/**
 * Delete confirmation dialog for a saved diorama (task 15.5).
 *
 * Open while the store's `dialog` is `{ kind: 'deleteDiorama', id }`; the
 * store is the only source of truth for whether it is open (D-56). "Delete"
 * (`confirm-ok`) calls `confirmDialog()`, which removes the entry from the
 * SaveFile and closes the dialog; "Cancel" and Escape call `cancelDialog()`
 * and change nothing else. Both buttons play the UI click first (D-53);
 * Escape plays no sound.
 *
 * Requirements: 5.4, 5.5, 5.6, 37.5
 */
import type { MouseEvent } from 'react';
import { useAppStore, useAppStoreApi } from '@/store/useAppStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/ui/alert-dialog';
import { buttonVariants } from '@/ui/components/ui/button';

export function DeleteDioramaDialog() {
  const store = useAppStoreApi();
  const id = useAppStore((s) => (s.dialog?.kind === 'deleteDiorama' ? s.dialog.id : null));
  const name = useAppStore((s) => (id === null ? null : (s.savedList.find((d) => d.id === id)?.name ?? null)));

  // Radix would close the dialog itself after a button click; the store
  // decides instead, so the default close is prevented.
  const click = (action: () => void) => (event: MouseEvent) => {
    event.preventDefault();
    store.getState().playUi();
    action();
  };

  return (
    <AlertDialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) store.getState().cancelDialog();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{name === null ? 'Delete this diorama?' : `Delete “${name}”?`}</AlertDialogTitle>
          <AlertDialogDescription>
            It will be removed from this browser for good. You can&rsquo;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={click(() => store.getState().cancelDialog())}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-ok"
            className={buttonVariants({ variant: 'destructive' })}
            onClick={click(() => store.getState().confirmDialog())}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
