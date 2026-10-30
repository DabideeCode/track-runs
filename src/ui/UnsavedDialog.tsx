import { useGameStore } from '@/store/gameStore';
import { Button } from './components/button';
import { Dialog } from './components/dialog';

export function UnsavedDialog() {
  const open = useGameStore((state) => state.dialog?.kind === 'unsaved');
  const closeDialog = useGameStore((state) => state.closeDialog);
  const saveAndLeave = useGameStore((state) => state.saveAndLeave);
  const returnToMenu = useGameStore((state) => state.returnToMenu);

  return (
    <Dialog
      open={open}
      title="Save before leaving?"
      description="This diorama has changes that are not saved yet."
      onClose={closeDialog}
    >
      <Button variant="quiet" onClick={closeDialog}>
        Cancel
      </Button>
      <Button data-testid="confirm-discard" onClick={returnToMenu}>
        Discard
      </Button>
      <Button variant="primary" data-testid="confirm-ok" onClick={saveAndLeave}>
        Save
      </Button>
    </Dialog>
  );
}
