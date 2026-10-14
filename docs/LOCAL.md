# 本地中心（批次 7）

Open it with the 🏠 button or **Ctrl/⌘+Shift+J**. **Alt+1…5** switches tabs. Every feature here works offline, and the data stays in `userData/local/`.

## Local models (llama.cpp)

- The model list is in `packages/electron/src/local/llmCatalog.ts`. Every entry has a permissive licence that was checked on its official model card: the Qwen3 0.6B/1.7B/4B and Qwen2.5 1.5B models are Apache-2.0, SmolLM2 1.7B is Apache-2.0, and Phi-4 mini is MIT. Models with Llama or Gemma custom licences are not included, and neither is Qwen2.5-3B, whose licence is "other".
- The app reads `os.totalmem()` and recommends the largest model in the Qwen family that fits in memory. It also marks each card as 内存充足, 内存偏紧 or 内存不足.
- Downloads reuse the batch 1 `downloadVerified` path: the licence is confirmed before download, progress is shown, the download can be cancelled, and the SHA-256 is verified. The first model download also fetches the llama.cpp `b11565` CPU build for the current platform (MIT; tar.gz on macOS/Linux, zip on Windows).
- 「启动」 runs `llama-server -m <gguf> --host 127.0.0.1 --port <free> -c <ctx> --jinja --no-webui`. Once `/health` answers, the server is registered as the OpenAI-compatible provider **「llama.cpp（本机）」**, upserted at `http://127.0.0.1:<port>/v1`.
  - 「设为聊天模型」 makes it the active provider.
  - 「停止」 ends the process.
  - 「删除」 removes the GGUF file.
  - 「启动应用时自动运行」 restarts the last model on app launch.
- **离线模式** turns on the existing "local only" consent mode. Cloud providers and outbound tools are refused, and if the local model is running it becomes the chat model.
- **Ollama tab** (optional): if Ollama is installed, you can list, pull (with streaming progress) and delete models through `http://127.0.0.1:11434`. The app tells you to pull only models whose licence allows your use.

## Calendar

- Calendar sources:
  - a local calendar;
  - `.ics` file import;
  - ICS subscription links;
  - CalDAV (`REPORT calendar-query`). The password is encrypted with `safeStorage` and never exported.
- Subscriptions are read-only and sync every 30 minutes.
- `RRULE` (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL/COUNT/UNTIL/BYDAY) and `EXDATE` are expanded.
- The assistant tool `calendar_list` is read-only. The morning briefing context includes today's schedule.
- 「导出 .ics」 exports all events.

### 系统日历（设置 → 日历）

| 平台    | 方式                                                                          | 读                                              | 写（先弹确认框） | 限制                                                                                                                           |
| ------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| macOS   | `osascript -l JavaScript` 脚本化「日历」App                                   | ✅ 所有已登录账户（iCloud / Google / Exchange） | ✅               | 首次触发「自动化」授权；`whose` 查询不展开重复日程；只读 -1 ~ +30 天；日历多时较慢。原生 EventKit helper 需签名二进制，暂未做  |
| Windows | 经典版 Outlook COM（PowerShell）                                              | ✅ 默认日历                                     | ✅               | 新版 Outlook / 无 Outlook 时不可用；WinRT `AppointmentStore` 需要 MSIX 包身份，不打包的 Electron 用不了 → 用 ICS 订阅 / CalDAV |
| Linux   | Evolution / GNOME 本地日历 `~/.local/share/evolution/calendar/*/calendar.ics` | ✅ 本地日历                                     | ❌               | GNOME 在线账户（Google 等）的缓存是私有 SQLite，请用 CalDAV                                                                    |

读到的日程和 ICS / CalDAV 一样进入每日简报与 AI 的 `calendar_list` 工具。macOS 构建在
`electron-builder.yml` 里加了 `NSAppleEventsUsageDescription` / `NSCalendarsUsageDescription` 与
`com.apple.security.automation.apple-events` 授权（`assets/entitlements.mac.plist`）。

## Clipboard history

- Off by default. Once on, the clipboard is polled every second. Text and images (optional) are kept locally, 50 items by default; pinned items are kept when you clear the history.
- Content that looks like a private key, an `sk-…`/`ghp_…` token, an AWS key or a JWT is skipped automatically.
- 「复制」 puts an item back on the clipboard. 「发到聊天」 attaches an image to the chat (vision models). 「放进输入框」 inserts text.

## Data export

Chosen categories are bundled into one `.zip`:

- chat history, collected from the renderer's `ai-chat:*` storage;
- memory;
- reminders and scheduled tasks;
- calendar;
- clipboard;
- skill packs;
- screen memory (text index);
- settings and notes.

The export never includes `ai-providers.json` (API keys), CalDAV passwords or encrypted MCP env/header values (shown as `<已移除>`). Downloaded models and the knowledge-base index are also left out.
