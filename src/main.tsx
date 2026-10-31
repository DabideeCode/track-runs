import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startAudioEngine } from '@/audio/engine'
import { installTestHook } from '@/game/testHook'
import { App } from './App'
import './index.css'

installTestHook()
startAudioEngine()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
