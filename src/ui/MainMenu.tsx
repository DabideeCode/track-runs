import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { deleteDiorama, listDioramas, renameDiorama } from '@/game/persistence'
import type { Diorama } from '@/game/types'
import { useGameStore } from '@/store/gameStore'
import { AudioControls } from './AudioControls'
import { DeleteDialog, RenameDialog } from './MenuDialogs'
import { UiButton } from './UiButton'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Hero illustration: a strip of wooden track with a little train that rolls in once. */
function HeroTrack() {
  return (
    <svg viewBox="0 0 1100 96" className="h-auto w-full" aria-hidden="true">
      <rect x="0" y="62" width="1100" height="22" rx="7" fill="#e8d2a8" stroke="#b08a5e" strokeWidth="1.5" />
      <line x1="6" y1="69" x2="1094" y2="69" stroke="#a07a52" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="6" y1="77" x2="1094" y2="77" stroke="#a07a52" strokeWidth="2.5" strokeLinecap="round" />
      {[220, 440, 660, 880].map((x) => (
        <line key={x} x1={x} y1="62" x2={x} y2="84" stroke="#c9a676" strokeWidth="1.5" />
      ))}
      <g className="animate-train-arrive">
        <g transform="translate(420 0)">
        {/* Carriages */}
        {[
          { x: 250, body: '#6f8a62' },
          { x: 330, body: '#7f9bb8' },
        ].map((c) => (
          <g key={c.x}>
            <rect x={c.x} y="40" width="72" height="5" rx="2" fill="#9a6c48" />
            <rect x={c.x + 3} y="18" width="66" height="24" rx="5" fill={c.body} stroke="#5a4636" strokeWidth="1.5" />
            <rect x={c.x + 10} y="24" width="52" height="7" rx="2" fill="#f3e8d2" />
            <rect x={c.x} y="12" width="72" height="7" rx="3" fill="#d9a35b" stroke="#5a4636" strokeWidth="1.5" />
            <circle cx={c.x + 16} cy="54" r="7" fill="#4a4340" />
            <circle cx={c.x + 56} cy="54" r="7" fill="#4a4340" />
          </g>
        ))}
        {/* Locomotive */}
        <rect x="408" y="40" width="96" height="5" rx="2" fill="#9a6c48" />
        <rect x="408" y="8" width="34" height="34" rx="5" fill="#c4704f" stroke="#5a4636" strokeWidth="1.5" />
        <rect x="404" y="4" width="42" height="7" rx="3" fill="#d9a35b" stroke="#5a4636" strokeWidth="1.5" />
        <rect x="414" y="16" width="20" height="10" rx="2" fill="#f3e8d2" />
        <rect x="440" y="20" width="58" height="22" rx="10" fill="#c4704f" stroke="#5a4636" strokeWidth="1.5" />
        <rect x="476" y="6" width="11" height="16" rx="3" fill="#9a6c48" stroke="#5a4636" strokeWidth="1.5" />
        <circle cx="424" cy="54" r="8" fill="#4a4340" />
        <circle cx="452" cy="54" r="8" fill="#4a4340" />
        <circle cx="480" cy="54" r="8" fill="#4a4340" />
        </g>
      </g>
    </svg>
  )
}

function DioramaCard({
  d,
  onOpen,
  onRename,
  onDelete,
}: {
  d: Diorama
  onOpen(): void
  onRename(): void
  onDelete(): void
}) {
  return (
    <li data-testid="diorama-item" data-diorama-id={d.id} className="tray flex flex-col overflow-hidden p-2">
      <button
        type="button"
        onClick={onOpen}
        tabIndex={-1}
        aria-hidden="true"
        className="block aspect-[16/9] w-full overflow-hidden rounded-[0.9rem] bg-muted"
      >
        {d.thumbnail ? (
          <img src={d.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(90deg,#ead7b4_0_22px,#e3cda6_22px_24px)]">
            <span className="text-sm text-muted-foreground">{d.pieces.length} pieces</span>
          </div>
        )}
      </button>
      <div className="flex items-end justify-between gap-2 px-2 pt-3 pb-1">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-lg leading-tight font-extrabold" title={d.name}>
            {d.name}
          </h3>
          <p className="text-sm text-muted-foreground">Edited {dateFormat.format(new Date(d.updatedAt))}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-1 pt-2 pb-1">
        <UiButton data-testid="diorama-open" onClick={onOpen} className="h-9 flex-1 rounded-full font-bold" aria-label={`Open ${d.name}`}>
          Open
        </UiButton>
        <UiButton
          data-testid="diorama-rename"
          variant="ghost"
          size="icon"
          className="size-9 rounded-full"
          onClick={onRename}
          aria-label={`Rename ${d.name}`}
          title="Rename"
        >
          <Pencil />
        </UiButton>
        <UiButton
          data-testid="diorama-delete"
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label={`Delete ${d.name}`}
          title="Delete"
        >
          <Trash2 />
        </UiButton>
      </div>
    </li>
  )
}

/** Main menu: saved dioramas, newest first (FR-1). */
export function MainMenu() {
  const [dioramas, setDioramas] = useState(() => listDioramas())
  const refresh = useCallback(() => setDioramas(listDioramas()), [])
  const [renaming, setRenaming] = useState<Diorama | null>(null)
  const [deleting, setDeleting] = useState<Diorama | null>(null)
  const { newDiorama, openDiorama, showToast } = useGameStore.getState()

  return (
    <main data-testid="main-menu" className="relative h-full overflow-y-auto bg-background">
      {/* Floorboards peeking out under the cream page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 opacity-60 [background:repeating-linear-gradient(0deg,#e2c9a0_0_38px,#d6bb8f_38px_40px)] [mask-image:linear-gradient(to_top,black,transparent)]"
      />
      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-6 pt-8 pb-16 sm:px-10">
        <div className="absolute top-6 right-6 sm:right-10">
          <div className="tray px-3 py-1.5">
            <AudioControls />
          </div>
        </div>

        <section className="mt-14 grid gap-5 sm:mt-10">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
            <div>
              <h1 className="font-heading text-[5rem] leading-[0.85] font-black tracking-tight text-ink sm:text-[7.5rem]">Track</h1>
              <p className="mt-4 max-w-lg text-lg text-bark">
                Lay out a little wooden railway on the bedroom floor or the kitchen table, then send the train around it.
              </p>
            </div>
            <UiButton
              data-testid="new-diorama"
              onClick={() => newDiorama()}
              className="h-12 rounded-full px-6 text-base font-bold shadow-[0_6px_16px_-8px_rgb(59_48_41/0.6)]"
            >
              <Plus className="size-5" /> New diorama
            </UiButton>
          </div>
          <HeroTrack />
        </section>

        <section className="mt-8" aria-labelledby="saved-heading">
          <h2 id="saved-heading" className="font-heading text-2xl font-extrabold">
            Your dioramas
          </h2>
          {dioramas.length === 0 && (
            <div className="tray mt-4 max-w-md px-6 py-6">
              <p className="font-semibold">Nothing saved yet.</p>
              <p className="mt-1 text-muted-foreground">
                Start a new diorama, place a station and some track, and press Save to keep it here.
              </p>
            </div>
          )}
          <ul data-testid="diorama-list" className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {dioramas.map((d) => (
                <DioramaCard
                  key={d.id}
                  d={d}
                  onOpen={() => openDiorama(d.id)}
                  onRename={() => setRenaming(d)}
                  onDelete={() => setDeleting(d)}
                />
              ))}
          </ul>
        </section>
      </div>

      <RenameDialog
        open={renaming !== null}
        initial={renaming?.name ?? ''}
        onCancel={() => setRenaming(null)}
        onRename={(name) => {
          if (renaming && renameDiorama(renaming.id, name)) showToast(`Renamed to “${name}”`)
          setRenaming(null)
          refresh()
        }}
      />
      <DeleteDialog
        name={deleting?.name ?? null}
        onCancel={() => setDeleting(null)}
        onDelete={() => {
          if (deleting) deleteDiorama(deleting.id)
          setDeleting(null)
          refresh()
        }}
      />
    </main>
  )
}
