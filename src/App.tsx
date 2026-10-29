import { useEffect } from 'react'
import { Scene } from '@/scene/Scene'
import { useGameStore } from '@/store/gameStore'

export default function App() {
  useEffect(() => useGameStore.getState().newDiorama(), [])
  return (
    <div data-testid="playfield" className="relative h-full w-full">
      <Scene />
    </div>
  )
}
