/**
 * The main menu screen (task 15.2): the "Track" heading, the New diorama
 * button and the saved diorama list, newest first (the store keeps
 * `savedList` sorted). With no readable saves the list is empty and a short
 * message prompts the user to create a diorama; New diorama stays enabled.
 *
 * Every button plays the UI click through `playUi()` before its action
 * (Requirement 25.10). The delete confirmation dialog is rendered by
 * `DeleteDioramaDialog` (task 15.5); this screen only opens it through
 * `requestDeleteDiorama`.
 *
 * Requirements: 3.2, 3.4, 3.5, 3.7, 4.1, 4.4, 5.1, 5.2, 5.3, 5.7, 5.8, 37.1, 37.2, 37.14
 */
import { Plus } from 'lucide-react';
import { useAppStore, useAppStoreApi } from '@/store/useAppStore';
import { Button } from '@/ui/components/ui/button';
import { DioramaCard } from '@/ui/DioramaCard';

export function MainMenu() {
  const store = useAppStoreApi();
  const savedList = useAppStore((s) => s.savedList);
  const renamingId = useAppStore((s) => s.renamingId);
  const renameError = useAppStore((s) => s.renameError);

  const click = (action: () => void) => () => {
    store.getState().playUi();
    action();
  };

  return (
    <main
      data-testid="main-menu"
      className="h-full overflow-y-auto bg-background px-6 py-12 text-foreground"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-5xl font-bold tracking-tight text-walnut">Track</h1>
            <p className="text-base text-muted-foreground">Build a little wooden railway, then send the train around it.</p>
          </div>
          <Button
            data-testid="new-diorama"
            size="lg"
            onClick={click(() => store.getState().newDiorama())}
          >
            <Plus />
            New diorama
          </Button>
        </header>

        <section aria-labelledby="saved-dioramas-heading" className="flex flex-col gap-4">
          <h2 id="saved-dioramas-heading" className="text-xl font-semibold">
            Your dioramas
          </h2>
          {savedList.length === 0 && (
            <div className="panel flex-col items-center gap-2 px-6 py-10 text-center">
              <p className="text-lg font-semibold">No dioramas yet</p>
              <p className="text-sm text-muted-foreground">
                Select New diorama to create your first one. It appears here once you save it.
              </p>
            </div>
          )}
          <ul
            data-testid="diorama-list"
            aria-labelledby="saved-dioramas-heading"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {savedList.map((d) => (
              <DioramaCard
                key={d.id}
                diorama={d}
                renaming={renamingId === d.id}
                renameError={renamingId === d.id ? renameError : null}
                onOpen={click(() => store.getState().openDiorama(d.id))}
                onStartRename={click(() => store.getState().startRename(d.id))}
                onConfirmRename={(name) => {
                  const s = store.getState();
                  if (s.renamingId !== d.id) return false;
                  s.renameDiorama(d.id, name);
                  // A rejected name keeps the input open with the message.
                  return store.getState().renamingId === d.id;
                }}
                onCancelRename={() => store.getState().cancelRename()}
                onDelete={click(() => store.getState().requestDeleteDiorama(d.id))}
              />
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
