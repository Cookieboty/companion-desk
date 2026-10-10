import { useAgent } from '@ig-live/ai-sdk-client/react';

export function AgentPanel() {
  const { lastStep, pendingConfirms, confirm } = useAgent();

  return (
    <section className="card">
      <h2>useAgent · 步骤流 + 危险工具确认</h2>
      <div>
        最近 step：
        {lastStep ? (
          <pre>{JSON.stringify(lastStep, null, 2)}</pre>
        ) : (
          <em style={{ opacity: 0.5 }}> 无</em>
        )}
      </div>
      <div>
        待确认工具：{pendingConfirms.length === 0 && <em style={{ opacity: 0.5 }}>无</em>}
        {pendingConfirms.map((c) => (
          <div key={c.reqId} className="confirm-item">
            <span className="badge">{c.toolName}</span>
            <code style={{ flex: 1 }}>{c.argumentsJson}</code>
            <button onClick={() => confirm(c.reqId, true)}>允许</button>
            <button className="secondary" onClick={() => confirm(c.reqId, false)}>
              拒绝
            </button>
          </div>
        ))}
      </div>
      <button
        className="secondary"
        onClick={() =>
          (globalThis as unknown as { __demoEmitConfirm?: () => void }).__demoEmitConfirm?.()
        }
      >
        触发一次 tool:confirm-required（demo）
      </button>
    </section>
  );
}
