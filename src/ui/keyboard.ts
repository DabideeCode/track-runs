import { useEffect } from 'react'
import { playSound } from '@/audio/log'
import { useGame } from '@/game/store'
import { trainRuntime } from '@/game/trainRuntime'

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** A modal or an open dropdown owns the keyboard. */
const overlayOpen = () =>
  document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"]') !== null

const driveKey = (event: KeyboardEvent) => {
  if (event.code === 'KeyW' || event.key.toLowerCase() === 'w') return 'forward'
  if (event.code === 'KeyS' || event.key.toLowerCase() === 's') return 'reverse'
  return null
}

const onKeyDown = (event: KeyboardEvent) => {
  if (isTyping(event.target) || overlayOpen()) return
  const game = useGame.getState()
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey

  if (command) {
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) game.redo()
      else game.undo()
    } else if (key === 'y') {
      event.preventDefault()
      game.redo()
    }
    return
  }
  if (event.altKey) return

  if (game.mode === 'play') {
    const drive = driveKey(event)
    if (drive) {
      event.preventDefault()
      trainRuntime.setKey(drive, true)
    }
    return
  }

  if (key === 'escape') {
    game.escape()
  } else if (event.repeat) {
    return
  } else if (key === 'r') {
    event.preventDefault()
    game.rotateSelection()
  } else if (key === 'f') {
    event.preventDefault()
    game.flipDirection()
    playSound('ui')
  } else if (key === 'delete' || key === 'backspace') {
    event.preventDefault()
    game.deleteSelection()
  }
}

const onKeyUp = (event: KeyboardEvent) => {
  const drive = driveKey(event)
  if (drive) trainRuntime.setKey(drive, false)
}

export const useKeyboard = () => {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
}
