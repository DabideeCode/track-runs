/**
 * Small helpers shared by the playfield overlay panels (task 15.4).
 *
 * - `useUiClick()` wraps an action so that activating a control first plays
 *   the UI click through the store's `playUi()` (Requirement 25.10, D-53) and
 *   then runs the action.
 * - `WithTooltip` adds a short hover and focus hint to a control. The hint is
 *   extra help only: every control keeps its own accessible name
 *   (Requirement 40.6).
 */
import { useCallback, type ReactElement, type ReactNode } from 'react';
import { useAppStoreApi } from '@/store/useAppStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';

/** Returns `wrap(action)`: a handler that plays `ui`, then calls `action` with the handler's arguments. */
export function useUiClick(): <A extends unknown[]>(action: (...args: A) => void) => (...args: A) => void {
  const store = useAppStoreApi();
  return useCallback(
    <A extends unknown[]>(action: (...args: A) => void) =>
      (...args: A) => {
        store.getState().playUi();
        action(...args);
      },
    [store],
  );
}

export function WithTooltip(props: { hint: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{props.children}</TooltipTrigger>
      <TooltipContent side={props.side}>{props.hint}</TooltipContent>
    </Tooltip>
  );
}
