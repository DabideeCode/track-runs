// @vitest-environment jsdom
/**
 * DeleteDioramaDialog, UnsavedChangesDialog and Toasts (task 15.5), rendered
 * against a real store built by the store harness (memory storage, recording
 * audio, manual clock).
 *
 * Requirements: 5.4, 5.6, 22.2, 22.6, 22.9, 37.5, 37.6, 37.12
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Diorama } from '@/domain/types';
import { SAVE_KEY } from '@/persistence/saveRepository';
import { MAX_TOASTS, TOAST_MS, TOAST_SAVED, TOAST_SAVE_FAILED } from '@/store/createAppStore';
import { AppStoreProvider } from '@/store/useAppStore';
import { DeleteDioramaDialog } from '@/ui/DeleteDioramaDialog';
import { Toasts } from '@/ui/Toasts';
import { UnsavedChangesDialog } from '@/ui/UnsavedChangesDialog';
import { createHarness, disposeHarnesses, type Harness, type HarnessOptions } from '../../unit/store/harness';

// jsdom has no Pointer Capture API; Radix Toast's swipe handling calls it on pointerup.
beforeAll(() => {
  const proto = Element.prototype as Partial<Element>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
});

afterEach(() => {
  cleanup();
  disposeHarnesses();
});

const LOOP: Diorama = {
  id: 'loop',
  name: 'Loop',
  setting: 'bedroom',
  startFacing: 0,
  pieces: [],
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
};
const OTHER: Diorama = { ...LOOP, id: 'other', name: 'Other', updatedAt: '2026-02-01T09:00:00.000Z' };

function renderOverlay(opts: HarnessOptions = {}): Harness {
  const h = createHarness(opts);
  h.store.getState().refreshList();
  render(
    <AppStoreProvider store={h.store}>
      <DeleteDioramaDialog />
      <UnsavedChangesDialog />
      <Toasts />
    </AppStoreProvider>,
  );
  return h;
}

/** Runs a store call inside `act` so React flushes the update. */
const run = (fn: () => void) => act(fn);

describe('DeleteDioramaDialog', () => {
  async function openDelete(h: Harness, id = 'loop') {
    run(() => h.store.getState().requestDeleteDiorama(id));
    return screen.findByRole('alertdialog');
  }

  it('is closed until a delete is requested', () => {
    renderOverlay({ saved: [LOOP] });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByTestId('confirm-ok')).toBeNull();
  });

  it('shows Delete (confirm-ok) and Cancel and keeps the diorama until confirmed', async () => {
    const h = renderOverlay({ saved: [LOOP] });
    const dialog = await openDelete(h);
    expect(dialog).toHaveAccessibleName('Delete “Loop”?');
    expect(within(dialog).getByTestId('confirm-ok')).toHaveTextContent(/^Delete$/);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getAllByTestId('confirm-ok')).toHaveLength(1);
    expect(screen.queryByTestId('confirm-discard')).toBeNull();
    expect(h.stored().map((d) => d.id)).toEqual(['loop']);
  });

  it('Delete removes only that diorama and closes the dialog', async () => {
    const h = renderOverlay({ saved: [LOOP, OTHER] });
    await openDelete(h);
    await userEvent.click(screen.getByTestId('confirm-ok'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.store.getState().dialog).toBeNull();
    expect(h.stored().map((d) => d.id)).toEqual(['other']);
    expect(h.store.getState().savedList.map((d) => d.id)).toEqual(['other']);
    expect(h.audio.getLog()).toEqual(['ui']);
  });

  it('Cancel closes the dialog and writes nothing', async () => {
    const h = renderOverlay({ saved: [LOOP] });
    const before = h.storage.getItem(SAVE_KEY);
    await openDelete(h);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.store.getState().dialog).toBeNull();
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    expect(h.audio.getLog()).toEqual(['ui']);
  });

  it('Escape cancels without a sound or a write', async () => {
    const h = renderOverlay({ saved: [LOOP] });
    const before = h.storage.getItem(SAVE_KEY);
    await openDelete(h);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.store.getState().dialog).toBeNull();
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    expect(h.audio.getLog()).toEqual([]);
  });
});

describe('UnsavedChangesDialog', () => {
  /** A dirty, never-saved playfield with the dialog open. */
  async function openUnsaved(opts: HarnessOptions = {}) {
    const h = renderOverlay({ start: 'playfield', ...opts });
    run(() => {
      h.store.getState().placePiece('station', 4, 4, { autoAdjust: false });
      h.store.getState().backToMenu();
    });
    h.audio.clearLog();
    const dialog = await screen.findByRole('alertdialog');
    return { h, dialog };
  }

  it('offers Save (confirm-ok), Discard (confirm-discard) and Cancel', async () => {
    const { dialog } = await openUnsaved();
    expect(dialog).toHaveAccessibleName('Save changes before leaving?');
    expect(within(dialog).getByTestId('confirm-ok')).toHaveTextContent(/^Save$/);
    expect(within(dialog).getByTestId('confirm-discard')).toHaveTextContent(/^Discard$/);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getAllByTestId('confirm-ok')).toHaveLength(1);
    expect(screen.getAllByTestId('confirm-discard')).toHaveLength(1);
  });

  it('Save stores the diorama, shows the Saved toast and goes to the menu', async () => {
    const { h } = await openUnsaved();
    await userEvent.click(screen.getByTestId('confirm-ok'));
    const s = h.store.getState();
    expect(s.screen).toBe('menu');
    expect(s.dialog).toBeNull();
    expect(h.stored()).toHaveLength(1);
    expect(s.savedList.map((d) => d.id)).toEqual([h.stored()[0].id]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('toast')).toHaveTextContent(TOAST_SAVED);
    expect(h.audio.getLog()).toEqual(['ui']);
  });

  it('a failed Save keeps the playfield dirty and shows the failure toast', async () => {
    const { h } = await openUnsaved();
    h.storage.setFailWrites(true);
    await userEvent.click(screen.getByTestId('confirm-ok'));
    const s = h.store.getState();
    expect(s.screen).toBe('playfield');
    expect(s.isDirty).toBe(true);
    expect(s.pieces).toHaveLength(1);
    expect(h.storage.getItem(SAVE_KEY)).toBeNull();
    expect(screen.getByTestId('toast')).toHaveTextContent(TOAST_SAVE_FAILED);
  });

  it('Discard leaves to the menu without writing', async () => {
    const { h } = await openUnsaved();
    await userEvent.click(screen.getByTestId('confirm-discard'));
    expect(h.store.getState().screen).toBe('menu');
    expect(h.storage.getItem(SAVE_KEY)).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.audio.getLog()).toEqual(['ui']);
  });

  it.each([
    ['Cancel', async () => userEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', async () => userEvent.keyboard('{Escape}')],
  ])('%s keeps the playfield open with every change and isDirty true', async (_label, act_) => {
    const { h } = await openUnsaved();
    const before = h.store.getState();
    await act_();
    const s = h.store.getState();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(s.dialog).toBeNull();
    expect(s.screen).toBe('playfield');
    expect(s.isDirty).toBe(true);
    expect(s.pieces).toBe(before.pieces);
    expect(s.setting).toBe(before.setting);
    expect(s.startFacing).toBe(before.startFacing);
    expect(h.storage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('Toasts', () => {
  it('renders one toast element with role status per message, newest at the bottom', async () => {
    const h = renderOverlay();
    run(() => {
      h.store.getState().pushToast('First', 'info');
      h.store.getState().pushToast('Second', 'success');
    });
    const toasts = await screen.findAllByTestId('toast');
    expect(toasts.map((t) => t.textContent)).toEqual([
      expect.stringContaining('First'),
      expect.stringContaining('Second'),
    ]);
    for (const t of toasts) expect(t).toHaveAttribute('role', 'status');
    expect(toasts[1]).toHaveAttribute('data-tone', 'success');
    // Newest is last in document order, which the column layout puts at the bottom.
    expect(toasts[0].compareDocumentPosition(toasts[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it(`shows at most ${MAX_TOASTS} toasts, dropping the oldest`, async () => {
    const h = renderOverlay();
    run(() => {
      for (const text of ['One', 'Two', 'Three', 'Four', 'Five']) h.store.getState().pushToast(text);
    });
    const toasts = await screen.findAllByTestId('toast');
    expect(toasts).toHaveLength(MAX_TOASTS);
    expect(toasts.map((t) => t.querySelector('[data-slot="toast-title"]')?.textContent)).toEqual([
      'Three',
      'Four',
      'Five',
    ]);
  });

  it('disappears when the store dismisses it after the toast time', async () => {
    const h = renderOverlay();
    run(() => void h.store.getState().pushToast('Saved'));
    expect(await screen.findAllByTestId('toast')).toHaveLength(1);
    run(() => h.clock.advance(TOAST_MS));
    expect(screen.queryAllByTestId('toast')).toHaveLength(0);
  });

  it('the close button dismisses that toast only', async () => {
    const h = renderOverlay();
    run(() => {
      h.store.getState().pushToast('Keep me');
      h.store.getState().pushToast('Close me');
    });
    const toasts = await screen.findAllByTestId('toast');
    await userEvent.click(within(toasts[1]).getByRole('button', { name: 'Dismiss' }));
    expect(h.store.getState().toasts.map((t) => t.text)).toEqual(['Keep me']);
    const left = screen.getAllByTestId('toast');
    expect(left).toHaveLength(1);
    expect(left[0]).toHaveTextContent('Keep me');
  });
});
