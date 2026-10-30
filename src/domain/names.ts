const DEFAULT_NAME = 'Untitled diorama';
const MAX_NAME_LENGTH = 40;

export function nextDefaultName(existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(DEFAULT_NAME)) return DEFAULT_NAME;
  let suffix = 2;
  while (taken.has(`${DEFAULT_NAME} ${suffix}`)) suffix += 1;
  return `${DEFAULT_NAME} ${suffix}`;
}

export function validateName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, message: 'Name cannot be blank.' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, message: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }
  return { ok: true, name };
}
