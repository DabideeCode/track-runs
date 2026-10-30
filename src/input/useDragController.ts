/**
 * React wrapper for the drag controller (task 13.1).
 *
 * The playfield (task 15.6) creates one `DragController` and mounts its
 * window listeners with this hook while the playfield is shown. The palette
 * (task 15.3) receives the same instance and calls `paletteDown` from its
 * items' `onPointerDown`.
 */
import { useEffect } from 'react';
import type { DragController } from './DragController';

/** Attaches `controller` while the calling component is mounted. */
export function useDragController(controller: DragController | null): void {
  useEffect(() => {
    if (controller === null) return;
    return controller.attach();
  }, [controller]);
}
