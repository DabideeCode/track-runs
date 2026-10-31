import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { MAX_NAME_LENGTH, normaliseName } from '@/domain/naming';
import { closeDialog, renameDiorama } from '@/store/commands';

export function RenameDialog({ dioramaId, name }: { dioramaId: string; name: string }) {
  const [value, setValue] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (normaliseName(value) === null) {
      setProblem(`Names need 1 to ${MAX_NAME_LENGTH} characters.`);
    } else if (!renameDiorama(dioramaId, value)) {
      setProblem('Could not save the new name.');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogTitle>Rename diorama</DialogTitle>
        <DialogDescription>Choose a name of 1 to {MAX_NAME_LENGTH} characters.</DialogDescription>
        <form onSubmit={submit} className="mt-4">
          <input
            data-testid="rename-input"
            aria-label="Diorama name"
            aria-invalid={problem !== null}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setProblem(null);
            }}
            className="h-11 w-full rounded-xl bg-linen/70 px-3 text-base text-ink"
          />
          {problem && (
            <p role="alert" className="mt-2 text-sm font-medium text-terracotta-deep">
              {problem}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={closeDialog}>Cancel</Button>
            <Button data-testid="confirm-ok" variant="primary" type="submit">
              Rename
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
