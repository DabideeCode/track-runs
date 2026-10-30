// @vitest-environment jsdom
/**
 * MainMenu and DioramaCard (task 15.2), rendered against a real store built
 * by the store harness (memory storage, recording audio).
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.7, 4.1, 4.4, 5.1, 5.2, 5.3, 5.7, 5.8,
 * 6.2, 6.3, 6.5, 25.10, 37.1, 37.2, 37.3, 37.4, 37.14, 40.6
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NAME_VALIDATION_MESSAGE } from '@/domain/naming';
import type { Diorama } from '@/domain/types';
import { AppStoreProvider } from '@/store/useAppStore';
import { MainMenu } from '@/ui/MainMenu';
import { createHarness, disposeHarnesses, type HarnessOptions } from '../../unit/store/harness';

afterEach(() => {
  cleanup();
  disposeHarnesses();
});

const diorama = (over: Partial<Diorama> & Pick<Diorama, 'id' | 'name' | 'updatedAt'>): Diorama => ({
  setting: 'bedroom',
  startFacing: 0,
  pieces: [],
  createdAt: '2026-01-01T09:00:00.000Z',
  ...over,
});

const OLD = diorama({ id: 'old', name: 'Old loop', updatedAt: '2026-03-01T08:30:00.000Z' });
const NEW = diorama({
  id: 'new',
  name: 'Kitchen run',
  updatedAt: '2026-10-29T10:15:00.000Z',
  setting: 'kitchen',
  thumbnail: 'data:image/jpeg;base64,AAAA',
  pieces: [{ id: 's1', type: 'station', gridX: 4, gridZ: 4, rotation: 90 }],
});

function renderMenu(opts: HarnessOptions = {}) {
  const h = createHarness(opts);
  h.store.getState().refreshList();
  render(
    <AppStoreProvider store={h.store}>
      <MainMenu />
    </AppStoreProvider>,
  );
  return h;
}

const items = () => screen.queryAllByTestId('diorama-item');
const itemById = (id: string) => items().find((el) => el.getAttribute('data-diorama-id') === id)!;

describe('MainMenu', () => {
  it('shows the "Track" heading, New diorama and the list newest first with ids', () => {
    renderMenu({ saved: [OLD, NEW] });
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Track$/);
    expect(screen.getByTestId('new-diorama')).toBeEnabled();
    const list = screen.getByTestId('diorama-list');
    const entries = within(list).getAllByTestId('diorama-item');
    expect(entries.map((el) => el.getAttribute('data-diorama-id'))).toEqual(['new', 'old']);
    expect(entries[0]).toHaveTextContent('Kitchen run');
    for (const entry of entries) {
      for (const id of ['diorama-open', 'diorama-rename', 'diorama-delete']) {
        const controls = within(entry).getAllByTestId(id);
        expect(controls).toHaveLength(1);
        expect(controls[0].getAttribute('aria-label')).toMatch(/\S/);
      }
    }
  });

  it('formats updatedAt in the locale date and time format', () => {
    renderMenu({ saved: [NEW] });
    const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      Date.parse(NEW.updatedAt),
    );
    const time = itemById('new').querySelector('time')!;
    expect(time).toHaveTextContent(expected);
    expect(time).toHaveAttribute('datetime', NEW.updatedAt);
  });

  it('shows the thumbnail, the placeholder without one, and falls back when the image fails', () => {
    renderMenu({ saved: [OLD, NEW] });
    expect(itemById('old').querySelector('[data-thumbnail]')).toHaveAttribute('data-thumbnail', 'placeholder');
    const img = within(itemById('new')).getByRole('img', { name: 'Preview of Kitchen run' });
    expect(img).toHaveAttribute('src', NEW.thumbnail);
    fireEvent.error(img);
    const area = itemById('new').querySelector('[data-thumbnail]')!;
    expect(area).toHaveAttribute('data-thumbnail', 'placeholder');
    expect(within(itemById('new')).queryByRole('img')).toBeNull();
    // The entry stays listed and openable.
    expect(within(itemById('new')).getByTestId('diorama-open')).toBeEnabled();
  });

  it('shows the empty state with zero items and New diorama enabled', () => {
    renderMenu();
    expect(items()).toHaveLength(0);
    expect(screen.getByTestId('diorama-list')).toBeInTheDocument();
    expect(screen.getByText('No dioramas yet')).toBeInTheDocument();
    expect(screen.getByTestId('new-diorama')).toBeEnabled();
  });

  it('New diorama and Open play the UI click and open the playfield', async () => {
    const h = renderMenu({ saved: [NEW] });
    await userEvent.click(within(itemById('new')).getByTestId('diorama-open'));
    const s = h.store.getState();
    expect(s.screen).toBe('playfield');
    expect(s.dioramaId).toBe('new');
    expect(s.pieces).toEqual(NEW.pieces);
    expect(h.audio.getLog()).toEqual(['ui']);
  });

  it('New diorama creates an empty bedroom diorama', async () => {
    const h = renderMenu({ saved: [NEW] });
    await userEvent.click(screen.getByTestId('new-diorama'));
    const s = h.store.getState();
    expect(s.screen).toBe('playfield');
    expect(s.pieces).toEqual([]);
    expect(s.setting).toBe('bedroom');
    expect(h.audio.getLog()).toEqual(['ui']);
  });

  it('Delete asks the store to open the confirmation dialog', async () => {
    const h = renderMenu({ saved: [NEW] });
    await userEvent.click(within(itemById('new')).getByTestId('diorama-delete'));
    expect(h.store.getState().dialog).toEqual({ kind: 'deleteDiorama', id: 'new' });
    expect(h.stored()).toHaveLength(1);
  });
});

describe('rename', () => {
  async function startRename(id: string) {
    await userEvent.click(within(itemById(id)).getByTestId('diorama-rename'));
    return screen.getByTestId('rename-input') as HTMLInputElement;
  }

  it('shows a focused input prefilled with the current name', async () => {
    renderMenu({ saved: [NEW] });
    const input = await startRename('new');
    expect(input).toHaveValue('Kitchen run');
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleName('Diorama name');
  });

  it('Enter stores the trimmed name and keeps the thumbnail', async () => {
    const h = renderMenu({ saved: [NEW, OLD] });
    const input = await startRename('new');
    await userEvent.clear(input);
    await userEvent.type(input, '  Old loop  {Enter}');
    expect(screen.queryByTestId('rename-input')).toBeNull();
    expect(itemById('new')).toHaveTextContent('Old loop');
    const stored = h.stored().find((d) => d.id === 'new')!;
    expect(stored.name).toBe('Old loop');
    expect(stored.thumbnail).toBe(NEW.thumbnail);
  });

  it('moving focus away confirms', async () => {
    const h = renderMenu({ saved: [NEW] });
    const input = await startRename('new');
    await userEvent.clear(input);
    await userEvent.type(input, 'Blurred');
    await userEvent.click(screen.getByRole('heading', { level: 1 }));
    expect(screen.queryByTestId('rename-input')).toBeNull();
    expect(h.stored()[0].name).toBe('Blurred');
  });

  it('Escape cancels without writing', async () => {
    const h = renderMenu({ saved: [NEW] });
    const before = h.storage.getItem('wooden-diorama:v1');
    const input = await startRename('new');
    await userEvent.clear(input);
    await userEvent.type(input, 'Changed{Escape}');
    expect(screen.queryByTestId('rename-input')).toBeNull();
    expect(itemById('new')).toHaveTextContent('Kitchen run');
    expect(h.storage.getItem('wooden-diorama:v1')).toBe(before);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['41 characters', 'x'.repeat(41)],
  ])('rejects a %s name with the 1 to 40 characters message', async (_label, name) => {
    const h = renderMenu({ saved: [NEW] });
    const before = h.storage.getItem('wooden-diorama:v1');
    const input = await startRename('new');
    await userEvent.clear(input);
    if (name.length > 0) await userEvent.type(input, name);
    await userEvent.keyboard('{Enter}');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(NAME_VALIDATION_MESSAGE);
    expect(alert.textContent).toMatch(/1 to 40 characters/);
    expect(screen.getByTestId('rename-input')).toHaveAttribute('aria-invalid', 'true');
    expect(h.storage.getItem('wooden-diorama:v1')).toBe(before);
    // Escape still closes the input and keeps the previous name.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('rename-input')).toBeNull();
    expect(itemById('new')).toHaveTextContent('Kitchen run');
  });

  it('a corrected name confirms after a rejection', async () => {
    const h = renderMenu({ saved: [NEW] });
    const input = await startRename('new');
    await userEvent.clear(input);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.type(input, 'Fixed{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(h.stored()[0].name).toBe('Fixed');
  });
});
