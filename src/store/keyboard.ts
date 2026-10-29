/** False while the user is typing or a dialog is open (D11). */
export function shouldHandleShortcut(e: KeyboardEvent): boolean {
  const target = e.target
  if (target instanceof HTMLElement) {
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return false
  }
  return !document.querySelector('[role="dialog"], [role="alertdialog"]')
}

const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey

export function isUndo(e: KeyboardEvent): boolean {
  return mod(e) && !e.shiftKey && e.key.toLowerCase() === 'z'
}

export function isRedo(e: KeyboardEvent): boolean {
  return mod(e) && e.shiftKey && e.key.toLowerCase() === 'z'
}
