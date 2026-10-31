import { useGameStore } from '@/store/gameStore';
import { ConfirmDialog } from './ConfirmDialog';
import { RenameDialog } from './RenameDialog';
import { UnsavedDialog } from './UnsavedDialog';

export function Dialogs() {
  const dialog = useGameStore((state) => state.dialog);
  if (!dialog) return null;
  if (dialog.kind === 'delete') return <ConfirmDialog dioramaId={dialog.dioramaId} name={dialog.name} />;
  if (dialog.kind === 'rename') return <RenameDialog dioramaId={dialog.dioramaId} name={dialog.name} />;
  return <UnsavedDialog />;
}
