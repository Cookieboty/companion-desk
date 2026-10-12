# Local ports

All ports Companion Desk opens in development live in [`/dev-ports.json`](../dev-ports.json)
(read by `scripts/ports.mjs`, the Vite configs, `scripts/dev.mjs`, `doctor`, `dev-smoke`).
They are in the uncommon 6xxx/7xxx range to avoid clashes with common local services, and Vite
uses `strictPort`, so a conflict fails loudly instead of silently hopping to another port.

| Purpose                                                                                              | Port | Env override       |
| ---------------------------------------------------------------------------------------------------- | ---- | ------------------ |
| Mascot renderer Vite (`packages/renderer`, also `tts-config.html`)                                   | 6127 | `CD_RENDERER_PORT` |
| Chat window Vite (`packages/ai-chat`)                                                                | 6128 | `CD_CHAT_PORT`     |
| `examples/ai-sdk-client-demo` Vite                                                                   | 6129 | `CD_DEMO_PORT`     |
| MCP config default (`config/default.json` `mcp.port`; MCP itself runs over stdio, no listener today) | 7213 | —                  |
| Node inspector for `mcp:debug` scripts                                                               | 7229 | —                  |

Everything binds to `127.0.0.1`. E2E mock servers use ephemeral ports (`listen(0)`).
Provider URLs such as Ollama `11434` or LM Studio `1234` are third-party service defaults and are not ours.

Windows: find a conflicting process with `netstat -ano | findstr :6127`, or start with
`set CD_RENDERER_PORT=6137&& pnpm dev`.
