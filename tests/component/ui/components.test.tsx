// @vitest-environment jsdom
/**
 * shadcn/ui components and palette icons.
 *
 * jsdom does not apply Tailwind, so these tests check the classes each
 * control carries: the 2 px keyboard focus ring with a 2 px offset on every
 * interactive control, rounded corners of at least 6 px, 8 px gaps between
 * grouped controls and panel padding of at least 12 px. The icon tests check
 * one icon per catalogue item in the lucide-react stroke style.
 *
 * Requirements: 1.3, 10.2, 30.4, 30.5, 30.6, 30.7, 40.5
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { CATALOGUE } from '@/domain/catalogue';
import { Button } from '@/ui/components/ui/button';
import { Toggle } from '@/ui/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { Slider } from '@/ui/components/ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/ui/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { Toast, ToastClose, ToastProvider, ToastTitle, ToastViewport } from '@/ui/components/ui/toast';
import { PALETTE_ICONS, PaletteIcon } from '@/ui/icons';

beforeAll(() => {
  // Radix Slider and Tooltip measure elements with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

/** Radius utilities that resolve to at least 6 px under the theme in index.css. */
const ROUNDED = /\brounded-(xs|sm|md|lg|xl|2xl|3xl|4xl|full)\b/;

function expectFocusRing(el: Element) {
  const cls = el.getAttribute('class') ?? '';
  expect(cls).toContain('focus-visible:ring-2');
  expect(cls).toContain('focus-visible:ring-offset-2');
  expect(cls).toContain('focus-visible:ring-ring');
  expect(cls).toContain('focus-visible:ring-offset-background');
}

function expectRounded(el: Element) {
  expect(el.getAttribute('class') ?? '').toMatch(ROUNDED);
}

describe('controls', () => {
  it('Button has the focus ring, rounded corners and defaults to type="button"', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expectFocusRing(button);
    expectRounded(button);
    expect(button).toHaveAttribute('type', 'button');
  });

  it('Toggle exposes aria-pressed and has the focus ring', async () => {
    render(<Toggle aria-label="Mute">Mute</Toggle>);
    const toggle = screen.getByRole('button', { name: 'Mute' });
    expectFocusRing(toggle);
    expectRounded(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('ToggleGroup separates its rounded items by 8 px', () => {
    render(
      <ToggleGroup type="single" defaultValue="bedroom" data-testid="group" variant="outline">
        <ToggleGroupItem value="bedroom">Bedroom floor</ToggleGroupItem>
        <ToggleGroupItem value="kitchen">Kitchen table</ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByTestId('group').getAttribute('class')).toContain('gap-2');
    const items = within(screen.getByTestId('group')).getAllByRole('radio');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expectFocusRing(item);
      expectRounded(item);
    }
    expect(items[0]).toHaveAttribute('data-state', 'on');
  });

  it('Slider labels its thumb and gives it the focus ring', () => {
    render(<Slider data-testid="music-volume" thumbLabel="Music volume" min={0} max={1} step={0.01} defaultValue={[0.5]} />);
    expect(screen.getByTestId('music-volume')).toBeInTheDocument();
    const thumb = screen.getByRole('slider', { name: 'Music volume' });
    expectFocusRing(thumb);
    expectRounded(thumb);
  });
});

describe('overlays', () => {
  it('AlertDialog content is rounded, padded by at least 12 px and its buttons have the focus ring', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete diorama?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          <AlertDialogFooter data-testid="footer">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-ok">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Delete diorama?' });
    const cls = dialog.getAttribute('class') ?? '';
    expect(cls).toMatch(/\bp-6\b/);
    expect(cls).toContain('shadow-panel');
    expectRounded(dialog);
    expect(screen.getByTestId('footer').getAttribute('class')).toContain('gap-2');
    for (const name of ['Cancel', 'Delete']) {
      const button = screen.getByRole('button', { name });
      expectFocusRing(button);
      expectRounded(button);
    }
  });

  it('Tooltip content is rounded and padded by at least 12 px horizontally', () => {
    render(
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button aria-disabled="true">Station</Button>
        </TooltipTrigger>
        <TooltipContent>Only one station per diorama</TooltipContent>
      </Tooltip>,
    );
    const content = document.querySelector('[data-slot="tooltip-content"]');
    expect(content).not.toBeNull();
    expect(content).toHaveTextContent('Only one station per diorama');
    expectRounded(content!);
    expect(content!.getAttribute('class')).toMatch(/\bpx-3\b/);
  });

  it('Toast renders the given tone with rounded, shadowed styling and a focusable close button', () => {
    render(
      <ToastProvider>
        <Toast open tone="error" data-testid="toast">
          <ToastTitle>Save failed. Your changes are still here.</ToastTitle>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const toast = screen.getByTestId('toast');
    expect(toast).toHaveAttribute('data-tone', 'error');
    const cls = toast.getAttribute('class') ?? '';
    expect(cls).toContain('border-l-destructive');
    expect(cls).toContain('shadow-panel');
    expect(cls).toMatch(/\bp-3\b/);
    expectRounded(toast);
    const close = within(toast).getByRole('button', { name: 'Dismiss' });
    expectFocusRing(close);
  });
});

describe('palette icons', () => {
  it('has exactly one icon per catalogue item', () => {
    expect(Object.keys(PALETTE_ICONS).sort()).toEqual(CATALOGUE.map((i) => i.type).sort());
  });

  it.each(CATALOGUE.map((i) => i.type))('%s icon uses the lucide-react stroke style', (type) => {
    const { container: ours } = render(<PaletteIcon type={type} />);
    const { container: lucide } = render(<House />);
    const svg = ours.querySelector('svg')!;
    const reference = lucide.querySelector('svg')!;
    for (const attr of ['viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'width', 'height']) {
      expect(svg.getAttribute(attr), attr).toBe(reference.getAttribute(attr));
    }
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelectorAll('path, circle, rect').length).toBeGreaterThan(0);
  });

  it('gives each item a distinct drawing', () => {
    const drawings = CATALOGUE.map((i) => {
      const { container } = render(<PaletteIcon type={i.type} />);
      return container.querySelector('svg')!.innerHTML;
    });
    expect(new Set(drawings).size).toBe(CATALOGUE.length);
  });
});
