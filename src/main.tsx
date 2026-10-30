import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAudioUnlock } from './audio/audioEngine';
import './index.css';
import { installTestHook } from './testing/testHook';
import { loadScene } from './ui/Playfield';

installTestHook();
installAudioUnlock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

window.setTimeout(() => void loadScene(), 500);
