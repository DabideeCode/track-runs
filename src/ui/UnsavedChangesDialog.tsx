/**
 * Unsaved-changes dialog shown by Back to menu while the diorama is dirty
 * (task 15.5).
 *
 * Open while the store's `dialog` is `{ kind: 'unsaved' }`; the store alone
 * decides whether it is open (D-56). "Save" (`confirm-ok`) calls
 * `confirmDialog()`, which saves and leaves to the menu only on success (on
 * failure the store closes the dialog, shows the failure toast and keeps the
 * playfield). "Discard" (`confirm-discard`) calls `discardAndLeave()`, which
 * leaves without writing. "Cancel" and Escape call `cancelDialog()`. Buttons
 * play the UI click first (D-53); Escape plays no sound.
 *
 * Requirements: 22.6, 22.7, 22.8, 22.9, 37.5, 37.6
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

export function UnsavedChangesDialog() {
  const store = useAppStoreApi();
  const open = useAppStore((s) => s.dialog?.kind === 'unsaved');
  const name = useAppStore((s) => s.dioramaName);

  // The store closes the dialog (or leaves the playfield); Radix's own close
  // after a click is prevented so a failed save cannot be mistaken for Cancel.
  const click = (action: () => void) => (event: MouseEvent) => {
    event.preventDefault();
    store.getState().playUi();
    action();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) store.getState().cancelDialog();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save changes before leaving?</AlertDialogTitle>
          <AlertDialogDescription>
            {name ? `“${name}” has changes that are not saved yet.` : 'This diorama has changes that are not saved yet.'}{' '}
            Discard throws them away.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={click(() => store.getState().cancelDialog())}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-discard"
            className={buttonVariants({ variant: 'outline' })}
            onClick={click(() => store.getState().discardAndLeave())}
          >
            Discard
          </AlertDialogAction>
          <AlertDialogAction data-testid="confirm-ok" onClick={click(() => store.getState().confirmDialog())}>
            Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
