import { useGameStore } from '@/store/gameStore';
import { Button } from './components/button';
import { Dialog } from './components/dialog';

export function ConfirmDialog() {
  const dialog = useGameStore((state) => state.dialog);
  const closeDialog = useGameStore((state) => state.closeDialog);
  const confirmDelete = useGameStore((state) => state.confirmDelete);
  const open = dialog?.kind === 'delete';

  return (
    <Dialog
      open={open}
      title="Delete this diorama?"
      description={open ? `"${dialog.name}" will be gone for good.` : ''}
      onClose={closeDialog}
    >
      <Button variant="quiet" onClick={closeDialog}>
        Cancel
      </Button>
      <Button variant="primary" data-testid="confirm-ok" onClick={confirmDelete}>
        Delete
      </Button>
    </Dialog>
  );
}
