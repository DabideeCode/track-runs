import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
/** Joins class names and resolves conflicting Tailwind utilities (shadcn/ui helper). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
/**
 * Keyboard focus ring shared by every overlay control: 2 px in the focus ring
 * colour, offset 2 px from the control over the page background, shown only
 * for keyboard focus (Requirement 40.5).
 */
export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
