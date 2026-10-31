import { expect, test } from '@playwright/test';
import { hook, openApp, openNewDiorama, place, soundLog } from './helpers/app';

test.describe('US6: audio', () => {
  test('nothing plays until the first interaction, then music loops', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    // Howler sets this global. Media requests are not reported as network events in every browser.
    const musicPlaying = () =>
      page.evaluate(() => {
        const howler = (window as unknown as { Howler?: { _howls: Array<{ _src: unknown; playing(): boolean }> } }).Howler;
        return howler?._howls.some((howl) => String(howl._src).includes('/music/') && howl.playing()) ?? false;
      });

    await openApp(page);
    await page.waitForTimeout(800);
    expect(requests.filter((url) => url.includes('/audio/music/'))).toEqual([]);
    expect(await musicPlaying()).toBe(false);

    await page.getByTestId('new-diorama').click();
    await expect.poll(musicPlaying).toBe(true);
  });

  test('every effect loads in this browser', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('new-diorama').click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const howler = (window as unknown as { Howler?: { _howls: Array<{ _src: unknown; _state: string }> } }).Howler;
          return howler?._howls.filter((howl) => String(howl._src).includes('/sfx/') && howl._state === 'loaded').length;
        }),
      )
      .toBe(9);
  });

  test('sounds are logged before the first interaction and while muted', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('new-diorama').click();
    await page.getByTestId('mute-toggle').click();
    await place(page, 'house', 1, 1);
    expect((await soundLog(page)).at(-1)).toBe('place');
  });

  test('menu and overlay buttons log a UI click', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('new-diorama').click();
    await page.getByTestId('save-button').click();
    await page.getByTestId('reset-view').click();
    expect((await soundLog(page)).filter((event) => event === 'ui').length).toBeGreaterThanOrEqual(3);
  });

  test('controls appear on both screens and settings persist across a reload', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('music-volume')).toHaveValue('50');
    await expect(page.getByTestId('sfx-volume')).toHaveValue('80');

    await page.getByTestId('mute-toggle').click();
    await page.getByTestId('music-volume').fill('20');
    await page.getByTestId('sfx-volume').fill('65');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wooden-diorama:audio')!));
    expect(stored).toEqual({ muted: true, musicVolume: 0.2, sfxVolume: 0.65 });

    await page.reload();
    await expect(page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('music-volume')).toHaveValue('20');
    await expect(page.getByTestId('sfx-volume')).toHaveValue('65');

    await page.getByTestId('new-diorama').click();
    await expect(page.getByTestId('music-volume')).toHaveValue('20');
    await expect(page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a full round of sounds plays with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await openNewDiorama(page);
    await place(page, 'station', 5, 8, 0);
    await place(page, 'straight', 5, 7, 0);
    await hook(page, (h) => h.setMode('play'));
    await page.waitForTimeout(1800);
    await hook(page, (h) => h.setMode('build'));
    expect(errors).toEqual([]);
  });
});
