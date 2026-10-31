export const MAX_NAME_LENGTH = 40;
const DEFAULT_NAME = 'Untitled diorama';

/** The trimmed name, or null if it is blank or over the limit. */
export function normaliseName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

/** "Untitled diorama", then the lowest free number from 2 upward, against saved names. */
export function nextDefaultName(savedNames: readonly string[]): string {
  const taken = new Set(savedNames);
  if (!taken.has(DEFAULT_NAME)) return DEFAULT_NAME;
  let number = 2;
  while (taken.has(`${DEFAULT_NAME} ${number}`)) number += 1;
  return `${DEFAULT_NAME} ${number}`;
}
