import { useChat } from '@ig-live/ai-sdk-client/react';
import { useState } from 'react';

export function ChatPanel() {
  const { messages, streaming, send, abort, reset, error } = useChat();
  const [input, setInput] = useState('');

  return (
    <section className="card">
      <h2>useChat · 消息与流式接收</h2>
      <div className="messages">
        {messages.length === 0 && <em style={{ opacity: 0.5 }}>暂无消息</em>}
        {messages.map((m) => (
          <div key={m.id} className={`m ${m.role}`}>
            <strong>{m.role}: </strong>
            {m.content || (m.role === 'assistant' && streaming ? '…' : '')}
          </div>
        ))}
      </div>
      <form
        className="input-row"
        onSubmit={(e) => {
          e.preventDefault();
          const text = input.trim();
          if (!text) return;
          setInput('');
          void send(text);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="随便输点什么…"
        />
        <button type="submit" disabled={streaming}>
          send
        </button>
        <button type="button" className="secondary" onClick={() => abort()} disabled={!streaming}>
          abort
        </button>
        <button type="button" className="secondary" onClick={reset}>
          reset
        </button>
      </form>
      {error && (
        <pre>
          {error.code}: {error.message}
        </pre>
      )}
    </section>
  );
}
