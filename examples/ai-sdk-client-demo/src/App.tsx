import { AIProvider } from '@ig-live/ai-sdk-client/react';

import { AgentPanel } from './panels/AgentPanel';
import { ChatPanel } from './panels/ChatPanel';
import { EventsPanel } from './panels/EventsPanel';
import { LipSyncPanel } from './panels/LipSyncPanel';
import { ProfilePanel } from './panels/ProfilePanel';

export function App() {
  return (
    <AIProvider live2dAvailable>
      <main className="app">
        <ChatPanel />
        <AgentPanel />
        <LipSyncPanel />
        <ProfilePanel />
        <EventsPanel />
      </main>
    </AIProvider>
  );
}
