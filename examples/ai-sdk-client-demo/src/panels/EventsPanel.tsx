import { useAIEvents } from '@ig-live/ai-sdk-client/react';
import { useState } from 'react';

export function EventsPanel() {
  const [items, setItems] = useState<string[]>([]);

  useAIEvents('agent:step', (p) =>
    setItems((prev) => [`agent:step ${JSON.stringify(p)}`, ...prev].slice(0, 20)),
  );
  useAIEvents('userProfile:changed', (p) =>
    setItems((prev) => [`userProfile:changed ${JSON.stringify(p)}`, ...prev].slice(0, 20)),
  );
  useAIEvents('tts:end', (p) =>
    setItems((prev) => [`tts:end ${JSON.stringify(p)}`, ...prev].slice(0, 20)),
  );

  return (
    <section className="card">
      <h2>useAIEvents · 事件流</h2>
      <div className="messages">
        {items.length === 0 && <em style={{ opacity: 0.5 }}>暂无事件</em>}
        {items.map((e, i) => (
          <div key={i} className="m assistant">
            {e}
          </div>
        ))}
      </div>
    </section>
  );
}
