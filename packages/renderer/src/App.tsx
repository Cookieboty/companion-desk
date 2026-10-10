import React from 'react';

import { MascotHost } from './components/Mascot';
import { MascotProvider, type MascotConfig } from './contexts/MascotContext';

const MASCOT_CONFIG: MascotConfig = {
  tools: [
    'switch-model',
    'ai-chat',
    'info',
    'voice-settings',
    'voice-mode-toggle',
    'tts-config',
    'motion',
    'cursor-mcp',
    'toggle-top',
    'quit',
  ],
  drag: true,
};

const App: React.FC = () => (
  <div className="app" style={{ width: '100%', height: '100vh', position: 'relative' }}>
    <MascotProvider config={MASCOT_CONFIG}>
      <MascotHost />
    </MascotProvider>
  </div>
);

export default App;
