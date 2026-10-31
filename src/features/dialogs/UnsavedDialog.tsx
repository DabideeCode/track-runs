import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { closeDialog, discardAndLeave, saveAndLeave } from '@/store/commands';

export function UnsavedDialog() {
  return (
    <AlertDialog open onOpenChange={(open) => !open && closeDialog()}>
      <AlertDialogContent>
        <AlertDialogTitle>Save before leaving?</AlertDialogTitle>
        <AlertDialogDescription>This diorama has changes that are not saved.</AlertDialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <AlertDialogCancel asChild>
            <Button>Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button data-testid="confirm-discard" variant="danger" onClick={discardAndLeave}>
              Discard
            </Button>
          </AlertDialogAction>
          <AlertDialogAction asChild>
            <Button data-testid="confirm-ok" variant="primary" onClick={saveAndLeave}>
              Save
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
