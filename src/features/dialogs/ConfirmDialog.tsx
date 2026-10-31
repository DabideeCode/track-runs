import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { closeDialog, deleteDiorama } from '@/store/commands';

export function ConfirmDialog({ dioramaId, name }: { dioramaId: string; name: string }) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && closeDialog()}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete this diorama?</AlertDialogTitle>
        <AlertDialogDescription>"{name}" will be gone for good.</AlertDialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <AlertDialogCancel asChild>
            <Button>Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button data-testid="confirm-ok" variant="primary" onClick={() => deleteDiorama(dioramaId)}>
              Delete
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
