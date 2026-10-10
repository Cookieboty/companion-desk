# @ig-live/ai-sdk-client-demo

> P7-5 · 最小 demo：验证 `@ig-live/ai-sdk-client` 的 5 个 React Hook（`useChat / useAgent / useAIEvents / useTTSLipSync / useUserProfile`）+ AIProvider + preload 模板。

## 目录

```
examples/ai-sdk-client-demo/
├─ electron/           # 可选：最小 Electron 主进程 + preload（走 mkAiPreload 的等价实现）
├─ src/
│  ├─ panels/          # 5 个 hook 各一个 panel
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ mockBridge.ts    # 纯浏览器模式下模拟主进程 IPC
│  └─ styles.css
├─ index.html
├─ vite.config.ts
└─ tsconfig.json
```

## 快速开始

### 纯浏览器模式（推荐做 hooks 联调）

```bash
pnpm --filter @ig-live/ai-sdk-client-demo dev:renderer
# open http://127.0.0.1:5178
```

Demo 会自动执行 [`installMockBridge`](src/mockBridge.ts)，把 `window.aiIPC` 换成一份内存 IPC 桥，模拟主进程通道，无需 Electron 也能跑：

- `ai:chat:stream` → 每 60ms 推送 `deltaText` chunk，附带一次 `agent:step` 事件
- `ai:tts:stream` → 每 80ms 推送带 `rms` 的 chunk + `tts:chunk` 事件
- `ai:userProfile:*` → 内存版 profile；`set` 后广播 `userProfile:changed`
- 页面上有 "触发一次 tool:confirm-required（demo）" 按钮，验证 `useAgent` 队列

### Electron 模式（可选，验证 preload 白名单）

```bash
# 1) 构建 renderer 静态资源
pnpm --filter @ig-live/ai-sdk-client-demo build

# 2) 启动 Electron；配合真实主进程 AIRuntime 时把 aiIPC 换成 mkAiPreload
electron examples/ai-sdk-client-demo
```

或者 dev 模式：

```bash
# terminal 1
pnpm --filter @ig-live/ai-sdk-client-demo dev:renderer

# terminal 2
VITE_DEV_URL=http://127.0.0.1:5178 electron examples/ai-sdk-client-demo
```

> ⚠️ demo 的 [preload.cjs](electron/preload.cjs) 只是最小演示；真实项目应当直接 `require('@ig-live/ai-sdk-client/preload').mkAiPreload({...})`，参见 [docs/preload-usage.md](../../docs/preload-usage.md)。

## 覆盖矩阵

| Hook             | 面板                                        | 断言点                                                       |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `useChat`        | [ChatPanel](src/panels/ChatPanel.tsx)       | 输入后能看到 assistant 逐 chunk 累积文本；`abort` 停止       |
| `useAgent`       | [AgentPanel](src/panels/AgentPanel.tsx)     | 手动触发 confirm 后 `pendingConfirms` +1；点击"允许"回退 IPC |
| `useAIEvents`    | [EventsPanel](src/panels/EventsPanel.tsx)   | agent:step / tts:end / userProfile:changed 实时打印          |
| `useTTSLipSync`  | [LipSyncPanel](src/panels/LipSyncPanel.tsx) | 触发 `tts.stream` 后 rms 条随时间波动，`tts:end` 归零        |
| `useUserProfile` | [ProfilePanel](src/panels/ProfilePanel.tsx) | `set` 立刻回显；`userProfile:changed` 事件推送               |

## 参考

- 计划文档：[P7-ai-sdk-client.md §P7-5](../../docs/plans/P7-ai-sdk-client.md#L78-L82)
- preload 使用文档：[docs/preload-usage.md](../../docs/preload-usage.md)
- 通道白名单：[packages/ai-sdk-client/src/channels.ts](../../packages/ai-sdk-client/src/channels.ts)
