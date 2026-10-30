import { expect, test as base, type Page } from '@playwright/test';
import type { DioramaTestHook } from '../../src/testing/testHook';

type HookFunction = keyof DioramaTestHook;

export class App {
  readonly problems: string[] = [];

  constructor(readonly page: Page) {
    page.on('console', (message) => {
      if (message.type() === 'error') this.problems.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => this.problems.push(`uncaught: ${error.message}`));
  }

  async open(path = '/?test=1') {
    await this.page.goto(path);
    await expect(this.page.getByTestId('main-menu')).toBeVisible();
  }

  async openPlayfield() {
    await this.page.getByTestId('new-diorama').click();
    await expect(this.page.getByTestId('playfield')).toBeVisible();
    await expect(this.page.locator('canvas')).toBeVisible();
    await this.page.waitForFunction(() => {
      const project = (window as unknown as { __TRACK_PROJECT__: (x: number, y: number, z: number) => { x: number } }).__TRACK_PROJECT__;
      return project(0, 0, 0).x > 0;
    });
  }

  hook<F extends HookFunction>(name: F, ...args: Parameters<DioramaTestHook[F]>): Promise<ReturnType<DioramaTestHook[F]>> {
    return this.page.evaluate(
      ([fn, fnArgs]) => {
        const target = window.__DIORAMA__ as unknown as Record<string, (...values: unknown[]) => unknown>;
        return target[fn as string]!(...(fnArgs as unknown[]));
      },
      [name, args] as const,
    ) as Promise<ReturnType<DioramaTestHook[F]>>;
  }

  state() {
    return this.hook('getState');
  }

  sounds() {
    return this.hook('getSoundLog');
  }

  // Screen position of a tile's centre, projected through the live camera.
  async tilePoint(gridX: number, gridZ: number, height = 0) {
    return this.page.evaluate(
      ([x, z, y]) => {
        const project = (window as unknown as { __TRACK_PROJECT__: (x: number, y: number, z: number) => { x: number; y: number } }).__TRACK_PROJECT__;
        return project(x! - 7.5, y!, z! - 7.5);
      },
      [gridX, gridZ, height],
    );
  }

  async dragFromPalette(type: string, gridX: number, gridZ: number) {
    const item = this.page.getByTestId(`palette-${type}`);
    const box = (await item.boundingBox())!;
    const target = await this.tilePoint(gridX, gridZ);
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width + 30, box.y + box.height / 2, { steps: 3 });
    await this.page.mouse.move(target.x, target.y, { steps: 6 });
    await this.page.mouse.up();
  }

  async clickTile(gridX: number, gridZ: number) {
    const point = await this.tilePoint(gridX, gridZ);
    await this.page.mouse.click(point.x, point.y);
  }
}

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    const app = new App(page);
    await use(app);
    expect(app.problems).toEqual([]);
  },
});

export { expect };
