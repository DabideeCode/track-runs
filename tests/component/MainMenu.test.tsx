// @vitest-environment jsdom
/**
 * The main menu screen as a whole (task 15.7): `MainMenu` rendered together
 * with `DeleteDioramaDialog` and `Toasts` inside `AppStoreProvider`, against a
 * real store from the store harness (memory storage, recording audio, manual
 * clock). Each test drives a complete user flow with user-event and checks
 * both the screen and what is stored under `wooden-diorama:v1`.
 *
 * The narrower component checks live in `tests/component/ui/main-menu.test.tsx`
 * (task 15.2) and `tests/component/ui/dialogs-toasts.test.tsx` (task 15.5).
 *
 * Requirements: 3.5, 3.7, 5.1, 5.3, 5.4, 5.6, 5.7, 6.5, 37.14
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NAME_VALIDATION_MESSAGE } from '@/domain/naming';
import type { Diorama } from '@/domain/types';
import { SAVE_KEY } from '@/persistence/saveRepository';
import type { MemoryStorage } from '@/persistence/storage';
import { TOAST_DELETE_FAILED, TOAST_RENAME_FAILED } from '@/store/createAppStore';
import { AppStoreProvider } from '@/store/useAppStore';
import { DeleteDioramaDialog } from '@/ui/DeleteDioramaDialog';
import { MainMenu } from '@/ui/MainMenu';
import { Toasts } from '@/ui/Toasts';
import { createHarness, disposeHarnesses, type Harness, type HarnessOptions } from '../unit/store/harness';

// jsdom lacks ResizeObserver (Radix popper content, for example an opening
// tooltip) and the Pointer Capture API (Radix Toast swipe handling).
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const proto = Element.prototype as Partial<Element>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
});

afterEach(() => {
  cleanup();
  disposeHarnesses();
});

// Every updatedAt is before the harness clock start (2026-10-29T10:00Z), so a
// rename, which stamps updatedAt with the current time, moves its entry first.
const make = (id: string, name: string, updatedAt: string, over: Partial<Diorama> = {}): Diorama => ({
  id,
  name,
  setting: 'bedroom',
  startFacing: 0,
  pieces: [],
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt,
  ...over,
});

const SPRING = make('spring', 'Spring loop', '2026-05-02T07:45:00.000Z');
const SUMMER = make('summer', 'Summer line', '2026-07-20T18:05:00.000Z', {
  setting: 'kitchen',
  thumbnail: 'data:image/jpeg;base64,AAAA',
  pieces: [{ id: 's1', type: 'station', gridX: 3, gridZ: 5, rotation: 90 }],
});
const AUTUMN = make('autumn', 'Autumn yard', '2026-09-15T12:30:00.000Z');

/** Renders the menu screen the way the app shows it: menu, delete dialog and toasts. */
function renderMenuScreen(opts: HarnessOptions = {}): Harness {
  const h = createHarness(opts);
  h.store.getState().refreshList();
  render(
    <AppStoreProvider store={h.store}>
      <MainMenu />
      <DeleteDioramaDialog />
      <Toasts />
    </AppStoreProvider>,
  );
  return h;
}

/** Unmounts everything and renders the menu again on the same storage (a page reload). */
function reload(storage: MemoryStorage): Harness {
  cleanup();
  disposeHarnesses();
  return renderMenuScreen({ sharedStorage: storage });
}

const items = () => screen.queryAllByTestId('diorama-item');
const listedIds = () => items().map((el) => el.getAttribute('data-diorama-id'));
const item = (id: string) => {
  const el = items().find((e) => e.getAttribute('data-diorama-id') === id);
  if (!el) throw new Error(`No diorama-item for ${id}`);
  return el;
};
const storedNames = (h: Harness) => Object.fromEntries(h.stored().map((d) => [d.id, d.name]));
const localeDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(iso));

describe('main menu screen', () => {
  it('shows the "Track" heading and the readable dioramas newest first with locale dates', () => {
    const unreadable = { id: 'broken', name: '', setting: 'bedroom' };
    const h = renderMenuScreen({
      storage: { [SAVE_KEY]: JSON.stringify({ version: 1, dioramas: [SPRING, unreadable, AUTUMN, SUMMER] }) },
    });

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Track');

    // Newest updatedAt first; the unreadable entry is skipped with one warning.
    expect(listedIds()).toEqual(['autumn', 'summer', 'spring']);
    expect(h.warnings).toHaveLength(1);
    for (const d of [AUTUMN, SUMMER, SPRING]) {
      const entry = item(d.id);
      expect(within(entry).getByRole('heading', { level: 3 })).toHaveTextContent(d.name);
      const time = entry.querySelector('time')!;
      expect(time).toHaveAttribute('datetime', d.updatedAt);
      expect(time.textContent).toBe(localeDate(d.updatedAt));
    }
    expect(screen.queryByText('No dioramas yet')).toBeNull();
  });

  it.each([
    ['the key is absent', {}],
    ['the dioramas array is empty', { [SAVE_KEY]: JSON.stringify({ version: 1, dioramas: [] }) }],
    ['every entry is unreadable', { [SAVE_KEY]: JSON.stringify({ version: 1, dioramas: [{ id: 7 }, null] }) }],
    ['the stored value is corrupt', { [SAVE_KEY]: '{not json' }],
  ])('shows the empty state when %s', async (_label, storage) => {
    const h = renderMenuScreen({ storage });
    expect(items()).toHaveLength(0);
    expect(screen.getByTestId('diorama-list')).toBeEmptyDOMElement();
    expect(screen.getByText('No dioramas yet')).toBeVisible();
    expect(screen.getByText(/New diorama to create your first one/)).toBeInTheDocument();
    const create = screen.getByTestId('new-diorama');
    expect(create).toBeEnabled();
    await userEvent.click(create);
    expect(h.store.getState().screen).toBe('playfield');
  });
});

describe('rename flow', () => {
  async function startRename(id: string) {
    await userEvent.click(within(item(id)).getByTestId('diorama-rename'));
    return within(item(id)).getByTestId('rename-input') as HTMLInputElement;
  }

  it('opens a focused, prefilled and selected input on that entry only', async () => {
    renderMenuScreen({ saved: [SPRING, AUTUMN] });
    const input = await startRename('spring');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Spring loop');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Spring loop'.length]);
    expect(screen.getAllByTestId('rename-input')).toHaveLength(1);
    expect(within(item('autumn')).queryByTestId('rename-input')).toBeNull();
    expect(within(item('spring')).getByTestId('diorama-rename')).toBeDisabled();
  });

  it('Enter stores the trimmed name, moves the entry first and survives a reload', async () => {
    const h = renderMenuScreen({ saved: [SPRING, SUMMER, AUTUMN] });
    expect(listedIds()).toEqual(['autumn', 'summer', 'spring']);
    // Typing replaces the selected text.
    await startRename('spring');
    await userEvent.keyboard('  Winter loop  {Enter}');

    expect(screen.queryByTestId('rename-input')).toBeNull();
    expect(within(item('spring')).getByRole('heading', { level: 3 })).toHaveTextContent(/^Winter loop$/);
    expect(listedIds()).toEqual(['spring', 'autumn', 'summer']);
    expect(item('spring').querySelector('time')!.textContent).toBe(localeDate(new Date(h.clock.now).toISOString()));
    expect(storedNames(h)).toEqual({ spring: 'Winter loop', summer: 'Summer line', autumn: 'Autumn yard' });

    reload(h.storage);
    expect(listedIds()).toEqual(['spring', 'autumn', 'summer']);
    expect(item('spring')).toHaveTextContent('Winter loop');
  });

  it('moving focus out of the input confirms the rename once', async () => {
    const h = renderMenuScreen({ saved: [SUMMER] });
    await startRename('summer');
    await userEvent.keyboard('Tabletop run');
    await userEvent.tab();
    expect(screen.queryByTestId('rename-input')).toBeNull();
    expect(item('summer')).toHaveTextContent('Tabletop run');
    expect(storedNames(h)).toEqual({ summer: 'Tabletop run' });
    // The thumbnail is kept and still displayed.
    expect(h.stored()[0].thumbnail).toBe(SUMMER.thumbnail);
    expect(within(item('summer')).getByRole('img', { name: 'Preview of Tabletop run' })).toBeInTheDocument();
  });

  it('Escape closes the input and keeps the previous name on screen and in storage', async () => {
    const h = renderMenuScreen({ saved: [SPRING, AUTUMN] });
    const before = h.storage.getItem(SAVE_KEY);
    await startRename('spring');
    await userEvent.keyboard('Something else{Escape}');
    expect(screen.queryByTestId('rename-input')).toBeNull();
    expect(item('spring')).toHaveTextContent('Spring loop');
    expect(listedIds()).toEqual(['autumn', 'spring']);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    // Focus leaving after Escape does not write either.
    await userEvent.tab();
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
  });

  it('a rejected name shows the message, keeps the old name, and can then be corrected', async () => {
    const h = renderMenuScreen({ saved: [SPRING] });
    const before = h.storage.getItem(SAVE_KEY);
    const input = await startRename('spring');
    await userEvent.keyboard('x'.repeat(41));
    await userEvent.keyboard('{Enter}');

    const alert = within(item('spring')).getByRole('alert');
    expect(alert).toHaveTextContent(NAME_VALIDATION_MESSAGE);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(NAME_VALIDATION_MESSAGE);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);

    // A whitespace-only name blurred away is rejected too, and the input stays.
    await userEvent.clear(input);
    await userEvent.type(input, '   ');
    await userEvent.tab();
    expect(within(item('spring')).getByTestId('rename-input')).toBe(input);
    expect(within(item('spring')).getByRole('alert')).toHaveTextContent(NAME_VALIDATION_MESSAGE);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);

    await userEvent.clear(input);
    await userEvent.type(input, 'Fixed loop{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(item('spring')).toHaveTextContent('Fixed loop');
    expect(storedNames(h)).toEqual({ spring: 'Fixed loop' });
  });

  it('a failed write keeps the old name on screen and shows a toast', async () => {
    const h = renderMenuScreen({ saved: [SPRING] });
    const before = h.storage.getItem(SAVE_KEY);
    await startRename('spring');
    h.storage.setFailWrites(true);
    await userEvent.keyboard('Lost name{Enter}');
    expect(screen.queryByTestId('rename-input')).toBeNull();
    expect(item('spring')).toHaveTextContent('Spring loop');
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    expect(screen.getByTestId('toast')).toHaveTextContent(TOAST_RENAME_FAILED);
  });
});

describe('delete flow', () => {
  async function openDeleteDialog(id: string) {
    await userEvent.click(within(item(id)).getByTestId('diorama-delete'));
    return screen.findByRole('alertdialog');
  }

  it('the card button opens the dialog and nothing is removed until Delete', async () => {
    const h = renderMenuScreen({ saved: [SPRING, AUTUMN] });
    const before = h.storage.getItem(SAVE_KEY);
    const dialog = await openDeleteDialog('autumn');
    expect(dialog).toHaveAccessibleName('Delete “Autumn yard”?');
    expect(within(dialog).getByTestId('confirm-ok')).toHaveTextContent(/^Delete$/);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getAllByTestId('confirm-ok')).toHaveLength(1);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    expect(listedIds()).toEqual(['autumn', 'spring']);
  });

  it.each([
    ['Cancel', () => userEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
  ])('%s closes the dialog and keeps the diorama', async (_label, dismiss) => {
    const h = renderMenuScreen({ saved: [SPRING, AUTUMN] });
    const before = h.storage.getItem(SAVE_KEY);
    await openDeleteDialog('autumn');
    await dismiss();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByTestId('confirm-ok')).toBeNull();
    expect(listedIds()).toEqual(['autumn', 'spring']);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    // The menu is usable again: the same entry can still be opened.
    await userEvent.click(within(item('autumn')).getByTestId('diorama-open'));
    expect(h.store.getState().dioramaId).toBe('autumn');
  });

  it('Delete removes only that entry from the list and storage, also after a reload', async () => {
    const h = renderMenuScreen({ saved: [SPRING, SUMMER, AUTUMN] });
    const keep = h.stored().filter((d) => d.id !== 'summer');
    await openDeleteDialog('summer');
    await userEvent.click(screen.getByTestId('confirm-ok'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(listedIds()).toEqual(['autumn', 'spring']);
    expect(h.stored()).toEqual(keep);

    reload(h.storage);
    expect(listedIds()).toEqual(['autumn', 'spring']);
  });

  it('deleting the last diorama shows the empty state', async () => {
    renderMenuScreen({ saved: [SPRING] });
    await openDeleteDialog('spring');
    await userEvent.click(screen.getByTestId('confirm-ok'));
    expect(items()).toHaveLength(0);
    expect(screen.getByText('No dioramas yet')).toBeInTheDocument();
    expect(screen.getByTestId('new-diorama')).toBeEnabled();
  });

  it('a failed write keeps the entry listed and shows a toast', async () => {
    const h = renderMenuScreen({ saved: [SPRING, AUTUMN] });
    const before = h.storage.getItem(SAVE_KEY);
    await openDeleteDialog('spring');
    h.storage.setFailWrites(true);
    await userEvent.click(screen.getByTestId('confirm-ok'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(listedIds()).toEqual(['autumn', 'spring']);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    expect(screen.getByTestId('toast')).toHaveTextContent(TOAST_DELETE_FAILED);
  });
});

describe('thumbnails', () => {
  it('a thumbnail that cannot be displayed falls back to the placeholder and the entry still opens', async () => {
    const broken = make('broken-thumb', 'Broken picture', '2026-08-01T09:00:00.000Z', {
      thumbnail: 'data:image/jpeg;base64,not-an-image',
    });
    const h = renderMenuScreen({ saved: [broken, SUMMER] });

    const area = () => item('broken-thumb').querySelector('[data-thumbnail]')!;
    expect(area()).toHaveAttribute('data-thumbnail', 'image');
    fireEvent.error(within(item('broken-thumb')).getByRole('img', { name: 'Preview of Broken picture' }));
    expect(area()).toHaveAttribute('data-thumbnail', 'placeholder');
    expect(within(item('broken-thumb')).getByTestId('thumbnail-placeholder')).toBeInTheDocument();
    // The other entry's thumbnail is unaffected.
    expect(item('summer').querySelector('[data-thumbnail]')).toHaveAttribute('data-thumbnail', 'image');

    expect(listedIds()).toEqual(['broken-thumb', 'summer']);
    await userEvent.click(within(item('broken-thumb')).getByTestId('diorama-open'));
    const s = h.store.getState();
    expect(s.screen).toBe('playfield');
    expect(s.dioramaId).toBe('broken-thumb');
    expect(s.dioramaName).toBe('Broken picture');
  });
});
