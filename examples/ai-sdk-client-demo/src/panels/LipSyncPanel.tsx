import { useAIClient, useTTSLipSync } from '@ig-live/ai-sdk-client/react';
import { useState } from 'react';

export function LipSyncPanel() {
  const client = useAIClient();
  const [reqId, setReqId] = useState<string | undefined>(undefined);
  const rms = useTTSLipSync({ reqId });

  return (
    <section className="card">
      <h2>useTTSLipSync · rms 输出</h2>
      <div className="rms-meter">
        <span style={{ width: `${Math.round(rms * 100)}%` }} />
      </div>
      <code>rms = {rms.toFixed(3)}</code>
      <div className="input-row">
        <button
          onClick={() => {
            const id = `req_${Date.now().toString(36)}`;
            setReqId(id);
            void (client.tts as { stream: (o: unknown) => AsyncIterable<unknown> }).stream({
              reqId: id,
              text: '示例音频串流',
            });
          }}
        >
          触发 tts.stream
        </button>
        <button className="secondary" onClick={() => (client.tts as { stop: () => void }).stop()}>
          stop
        </button>
      </div>
    </section>
  );
}
