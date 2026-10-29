import { afterEach, describe, expect, it } from 'vitest'
import { isRedo, isUndo, shouldHandleShortcut } from '../keyboard'

const keyOn = (target: EventTarget, init: KeyboardEventInit) => {
  let seen: KeyboardEvent | null = null
  target.addEventListener('keydown', (e) => (seen = e as KeyboardEvent), { once: true })
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
  return seen!
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('shouldHandleShortcut', () => {
  it('handles keys pressed on the page', () => {
    expect(shouldHandleShortcut(keyOn(document.body, { key: 'Backspace' }))).toBe(true)
  })

  it('ignores keys typed into text fields', () => {
    const input = document.createElement('input')
    document.body.append(input)
    expect(shouldHandleShortcut(keyOn(input, { key: 'Backspace' }))).toBe(false)
    const area = document.createElement('textarea')
    document.body.append(area)
    expect(shouldHandleShortcut(keyOn(area, { key: 'r' }))).toBe(false)
  })

  it('ignores keys while a dialog is open', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'alertdialog')
    document.body.append(dialog)
    expect(shouldHandleShortcut(keyOn(document.body, { key: 'Delete' }))).toBe(false)
  })
})

describe('undo and redo chords', () => {
  it('recognises Ctrl+Z and Cmd+Z as undo, with Shift as redo', () => {
    expect(isUndo(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))).toBe(true)
    expect(isUndo(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))).toBe(true)
    expect(isUndo(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isRedo(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isRedo(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }))).toBe(true)
    expect(isUndo(new KeyboardEvent('keydown', { key: 'z' }))).toBe(false)
  })
})
