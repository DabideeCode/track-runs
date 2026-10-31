import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { loadDioramas, validateName } from '@/game/persistence'
import { useGame } from '@/game/store'
import type { Diorama } from '@/game/types'
import { AudioPanel } from './AudioPanel'

const editedLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

function RenameField({ diorama, onDone }: { diorama: Diorama; onDone: () => void }) {
  const renameSaved = useGame((state) => state.renameSaved)
  const [value, setValue] = useState(diorama.name)
  const [error, setError] = useState<string | null>(null)
  const finished = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.select()
  }, [])

  const finish = (commit: boolean) => {
    if (finished.current) return
    finished.current = true
    if (commit && value.trim() !== diorama.name) renameSaved(diorama.id, value)
    onDone()
  }

  const confirm = () => {
    const problem = validateName(value)
    if (problem) {
      setError(problem)
      input.current?.focus()
    } else {
      finish(true)
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <input
          ref={input}
          data-testid="rename-input"
          aria-label={`New name for ${diorama.name}`}
          aria-invalid={error !== null}
          value={value}
          autoFocus
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') confirm()
            if (event.key === 'Escape') finish(false)
          }}
          onBlur={(event) => {
            const check = event.relatedTarget as HTMLElement | null
            if (check?.dataset.testid === 'confirm-ok') return
            finish(validateName(value) === null)
          }}
          className="focus-ring bg-card h-9 w-full min-w-0 rounded-sm border px-2.5 text-sm font-semibold"
        />
        <Button data-testid="confirm-ok" size="icon" className="size-9" aria-label="Save name" onClick={confirm}>
          <Check aria-hidden />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive mt-1 text-xs font-semibold">
          {error}
        </p>
      )}
    </div>
  )
}

function DioramaItem({
  diorama,
  onDelete,
}: {
  diorama: Diorama
  onDelete: (diorama: Diorama) => void
}) {
  const openDiorama = useGame((state) => state.openDiorama)
  const [renaming, setRenaming] = useState(false)

  return (
    <li
      data-testid="diorama-item"
      data-diorama-id={diorama.id}
      className="bg-card/90 flex items-center gap-3 rounded-lg border p-2.5 shadow-sm"
    >
      {diorama.thumbnail ? (
        <img
          src={diorama.thumbnail}
          alt=""
          className="bg-muted h-[60px] w-[106px] shrink-0 rounded-sm object-cover"
        />
      ) : (
        <span aria-hidden className="bg-accent h-[60px] w-[106px] shrink-0 rounded-sm" />
      )}
      {renaming ? (
        <RenameField diorama={diorama} onDone={() => setRenaming(false)} />
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold" title={diorama.name}>
              {diorama.name}
            </h3>
            <p className="text-muted-foreground text-xs">Edited {editedLabel(diorama.updatedAt)}</p>
          </div>
          <Button data-testid="diorama-open" size="sm" onClick={() => openDiorama(diorama.id)}>
            Open
          </Button>
          <Button
            data-testid="diorama-rename"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={`Rename ${diorama.name}`}
            onClick={() => setRenaming(true)}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            data-testid="diorama-delete"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={`Delete ${diorama.name}`}
            onClick={() => onDelete(diorama)}
          >
            <Trash2 aria-hidden />
          </Button>
        </>
      )}
    </li>
  )
}

function DeleteDialog({ target, onClose }: { target: Diorama | null; onClose: () => void }) {
  const removeSaved = useGame((state) => state.removeSaved)
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Delete this diorama?</DialogTitle>
        <DialogDescription>
          “{target?.name}” will be gone for good. This cannot be undone.
        </DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Keep it</Button>
          </DialogClose>
          <Button
            data-testid="confirm-ok"
            variant="destructive"
            onClick={() => {
              if (target) removeSaved(target.id)
              onClose()
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A little wooden train running along the bottom of the menu. */
function TrainIllustration() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 520 120"
      className="h-auto w-full max-w-[520px]"
      fill="none"
    >
      <rect x="0" y="100" width="520" height="14" rx="4" fill="#c9974f" />
      <rect x="0" y="104" width="520" height="3" fill="#a9774a" opacity="0.5" />
      <g>
        <rect x="24" y="52" width="104" height="36" rx="6" fill="#7d9aa9" />
        <rect x="18" y="44" width="116" height="9" rx="4" fill="#c47e5e" />
        <rect x="38" y="60" width="22" height="16" rx="3" fill="#f3ead9" />
        <rect x="66" y="60" width="22" height="16" rx="3" fill="#f3ead9" />
        <rect x="94" y="60" width="22" height="16" rx="3" fill="#f3ead9" />
        <rect x="20" y="86" width="112" height="7" rx="3" fill="#a9774a" />
        <circle cx="46" cy="94" r="8" fill="#4b4640" />
        <circle cx="106" cy="94" r="8" fill="#4b4640" />
      </g>
      <rect x="134" y="86" width="16" height="4" fill="#a9774a" />
      <g>
        <rect x="156" y="52" width="104" height="36" rx="6" fill="#8e9f80" />
        <rect x="150" y="44" width="116" height="9" rx="4" fill="#d9b25f" />
        <rect x="170" y="60" width="22" height="16" rx="3" fill="#f3ead9" />
        <rect x="198" y="60" width="22" height="16" rx="3" fill="#f3ead9" />
        <rect x="226" y="60" width="22" height="16" rx="3" fill="#f3ead9" />
        <rect x="152" y="86" width="112" height="7" rx="3" fill="#a9774a" />
        <circle cx="178" cy="94" r="8" fill="#4b4640" />
        <circle cx="238" cy="94" r="8" fill="#4b4640" />
      </g>
      <rect x="266" y="86" width="16" height="4" fill="#a9774a" />
      <g>
        <rect x="284" y="36" width="58" height="52" rx="6" fill="#e9cf9f" />
        <rect x="278" y="28" width="70" height="9" rx="4" fill="#5f7f91" />
        <rect x="296" y="46" width="30" height="20" rx="3" fill="#5f7f91" />
        <rect x="340" y="54" width="86" height="34" rx="16" fill="#c47e5e" />
        <rect x="364" y="52" width="8" height="38" fill="#d9b25f" />
        <rect x="396" y="52" width="8" height="38" fill="#d9b25f" />
        <path d="M402 54 L400 26 Q408 18 416 26 L414 54 Z" fill="#a9774a" />
        <rect x="282" y="86" width="150" height="7" rx="3" fill="#a9774a" />
        <circle cx="306" cy="94" r="8" fill="#4b4640" />
        <circle cx="358" cy="94" r="8" fill="#4b4640" />
        <circle cx="408" cy="94" r="8" fill="#4b4640" />
      </g>
    </svg>
  )
}

export function MainMenu() {
  const revision = useGame((state) => state.menuRevision)
  const newDiorama = useGame((state) => state.newDiorama)
  const [deleting, setDeleting] = useState<Diorama | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dioramas = useMemo(() => loadDioramas(), [revision])

  useEffect(() => {
    // Fetch the playfield in the background so New diorama opens at once.
    void import('@/ui/Playfield')
    void import('@/scene/Scene')
  }, [])

  return (
    <main
      data-testid="main-menu"
      className="relative flex min-h-full flex-col bg-cover bg-center"
      style={{
        backgroundImage:
          "linear-gradient(rgb(243 234 217 / 0.9), rgb(243 234 217 / 0.82)), url('/assets/textures/floorboards.jpg')",
      }}
    >
      <div className="mx-auto grid w-full max-w-[1120px] flex-1 grid-cols-1 items-center gap-x-16 gap-y-8 px-8 py-10 lg:grid-cols-[1fr_1fr]">
        <section>
          <h1 className="text-primary text-8xl font-extrabold tracking-tight">Track</h1>
          <p className="mt-3 max-w-sm text-lg leading-snug font-medium">
            Lay out a little wooden railway, then watch your train run around it.
          </p>
          <Button
            data-testid="new-diorama"
            size="lg"
            className="mt-7"
            onClick={newDiorama}
          >
            <Plus aria-hidden />
            New diorama
          </Button>
          <div className="mt-10">
            <TrainIllustration />
          </div>
        </section>

        <section aria-label="Saved dioramas" className="min-w-0">
          <h2 className="text-muted-foreground mb-3 text-sm font-bold tracking-wider uppercase">
            Your dioramas
          </h2>
          <div data-testid="diorama-list">
            {dioramas.length === 0 ? (
              <div className="bg-card/80 rounded-lg border border-dashed p-8 text-center">
                <p className="font-bold">No dioramas yet</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Create your first one to start laying track.
                </p>
              </div>
            ) : (
              <ul className="max-h-[62vh] space-y-2.5 overflow-y-auto p-0.5">
                {dioramas.map((diorama) => (
                  <DioramaItem key={diorama.id} diorama={diorama} onDelete={setDeleting} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <footer className="text-muted-foreground flex items-end justify-between gap-6 px-8 pb-4 text-xs">
        <p>
          Music: “Life of Riley” by Kevin MacLeod (incompetech.com), CC BY 4.0. Full list in
          CREDITS.md.
        </p>
      </footer>
      <div className="pointer-events-none fixed inset-0">
        <AudioPanel />
      </div>
      <DeleteDialog target={deleting} onClose={() => setDeleting(null)} />
    </main>
  )
}
