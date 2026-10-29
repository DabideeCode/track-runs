import { useState } from 'react'
import { playSound } from '@/audio/soundBus'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NAME_MAX, validateName } from '@/game/persistence'
import { UiButton } from './UiButton'

interface RenameProps {
  open: boolean
  initial: string
  onCancel(): void
  onRename(name: string): void
}

/** Rename a diorama: 1 to 40 characters, not blank (AC-1.4). */
export function RenameDialog({ open, initial, onCancel, onRename }: RenameProps) {
  const [value, setValue] = useState(initial)
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setValue(initial)
  }
  const valid = validateName(value)
  const tooLong = value.trim().length > NAME_MAX
  const error = valid ? null : tooLong ? `Use ${NAME_MAX} characters or fewer.` : 'Give your diorama a name.'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="tray border-0 sm:max-w-md" showCloseButton={false}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) {
              playSound('invalid')
              return
            }
            playSound('ui')
            onRename(valid)
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Rename diorama</DialogTitle>
            <DialogDescription>Names can be up to {NAME_MAX} characters.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Input
              data-testid="rename-input"
              name="diorama-name"
              aria-label="Diorama name"
              aria-invalid={!valid}
              aria-describedby="rename-help"
              value={value}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setValue(e.target.value)}
              className="h-10 bg-background text-base"
            />
            <p id="rename-help" className={`text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
              {error ?? `${value.trim().length} of ${NAME_MAX} characters`}
            </p>
          </div>
          <DialogFooter>
            <UiButton type="button" variant="outline" onClick={onCancel}>
              Cancel
            </UiButton>
            <UiButton data-testid="confirm-ok" type="submit" disabled={!valid}>
              Rename
            </UiButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteProps {
  name: string | null
  onCancel(): void
  onDelete(): void
}

/** Confirm before deleting (AC-1.5). */
export function DeleteDialog({ name, onCancel, onDelete }: DeleteProps) {
  return (
    <AlertDialog open={name !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="tray border-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>The diorama and all its pieces will be removed. This can’t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => playSound('ui')}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-ok"
            variant="destructive"
            onClick={() => {
              playSound('delete')
              onDelete()
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
