import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initAudio } from './audio/audioEngine';
import { loadAudioSettings } from './persistence/audioSettings';
import { refreshDioramas } from './store/commands';
import { useGameStore } from './store/gameStore';
import { installTestHook } from './testing/testHook';
import './index.css';

installTestHook();
useGameStore.setState({ audio: loadAudioSettings() });
refreshDioramas({ warn: true });
initAudio();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
