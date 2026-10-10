# Desktop tools: letting the LLM operate the computer (design)

> Status: **P0 (foundations), P1 (read & summarize) and P2 (notes, reminders, clipboard) are implemented**. See [../DESKTOP_TOOLS.md](../DESKTOP_TOOLS.md). P3+ are still design only.
> P1 differences from this design: PDFs are parsed with `unpdf` (pdf.js) and docx with `fflate` instead of mammoth; minimal `fs_write_text` / `fs_trash` / `undo_last` landed early to exercise consent, journal and trash; there is no feature flag yet.
> Owner: Companion Desk. Last updated: 2026-10-10.

## 1. Goals and non-goals

**Goals.** The mascot should be able to do useful local work when asked, and every action must stay visible, reversible and permission-scoped:

- Summarize local documents: txt, md, pdf, docx, plus code and csv as text.
- Calendar and schedule:
  - a local calendar;
  - optional Google Calendar, Outlook (Microsoft Graph) and CalDAV connectors.
- Reminders, with proactive mascot nudges.
- Notes as a local markdown notebook.
- File search and organization: find, preview, move, rename, create folders, and "trash" instead of delete.
- Clipboard read and write.
- Launching apps and opening files or URLs with the default handler.
- Small utilities: open-in-folder, screenshot-to-note (reuses `ScreenPlugin`), system info.

**Non-goals for the first phases:**

- Arbitrary shell or script execution.
- Keyboard and mouse automation of other apps (no RPA / computer-use).
- Network file shares.
- Email sending.
- Anything that runs with elevated privileges.

## 2. Where it lives (architecture)

```
renderer (mascot / chat)          main process                                    external
──────────────────────────        ───────────────────────────────────────         ─────────
chat UI / mascot bubble  ◀─ai:*─▶ AIRuntime (AI SDK ToolLoopAgent)
confirm dialog           ◀───────  └─ ToolRegistry  ◀── DesktopToolsPlugin  ──▶ fs / shell.openPath / clipboard
drag file onto mascot  ──────────▶     ▲   (built-in tools)  │                   CalendarProvider (local|Google|Graph|CalDAV)
                                       │                     ├─ PermissionBroker  (scopes, consent, confirm)
                                       │                     ├─ AuditLog          (append-only JSONL)
                                       │                     ├─ UndoJournal       (trash + inverse ops)
                                       │                     └─ Scheduler         (reminders → mascot)
                                       └─ McpBridgePlugin ◀── also exposed as built-in MCP server "companion-desktop"
```

- **Main process only.** Tools are registered by a new `DesktopToolsPlugin`, in a new `bundle-ig-desktop` package or in `bundle-ig-electron-caps`. They use the existing `ToolRegistry` and `ToolDefinition` types (zod input, `dangerous` flag). The renderer never touches the filesystem. It only:
  - receives confirmation requests;
  - shows results;
  - sends dropped file paths, which the main process validates.
- Everything goes through the **PermissionBroker** (§4). Tools never call `fs` directly. They call a `ScopedFs` facade that resolves real paths and checks them against the allowlist.
- **No shell by default.** App launch uses `shell.openPath` / `shell.openExternal`, or a per-OS launcher limited to registered app names (§3.8). There is no `exec` tool at all. A future "advanced: run command" tool would be a separate opt-in plugin that is off by default, and it is out of scope here.
- Parsing runs in a **utility process** (`utilityProcess.fork`) with a timeout and memory cap, so a malicious PDF or DOCX cannot hang or crash the main process. The parsers are `pdfjs-dist` (Apache-2.0) and `mammoth` (BSD-2) or `docx` XML parsing. Both licences pass the existing licence check.

## 3. Tool catalog

Conventions:

- Every tool returns `{ ok: true, data } | { ok: false, error: { code, message } }`.
- Paths are absolute or `~`-relative and are re-resolved and checked by `ScopedFs`.
- Every mutating tool accepts `dryRun?: boolean`. A dry run returns the plan, makes no changes, and needs no confirmation.
- `danger` is one of:
  - `read`: auto-allowed once the scope is granted;
  - `write`: confirmed on first use per session, or always, depending on settings;
  - `destructive`: always confirmed, cannot be auto-approved.

The schemas below are JSON Schema (draft 2020-12). In code they are zod schemas converted with `zod-to-json-schema` for MCP.

### 3.1 Files: read and summarize

| Tool | Danger | Notes |
| --- | --- | --- |
| `fs_list` | read | Lists a directory inside the scope. Paginated. |
| `fs_search` | read | Name glob + optional content search (text files ≤ 2 MB). Uses an index if one is enabled. |
| `fs_read_text` | read | Extracts text from txt, md, csv, json, code, pdf or docx. Chunked. Never returns more than `maxChars`. |
| `fs_summarize` | read | Convenience wrapper: extract, then map-reduce summary with the "summary" role provider. |
| `fs_stat` | read | Size, mtime, type, MIME type. |

```json
{
  "name": "fs_read_text",
  "input": {
    "type": "object",
    "required": ["path"],
    "properties": {
      "path": { "type": "string", "description": "File path inside an allowed folder" },
      "offset": { "type": "integer", "minimum": 0, "default": 0, "description": "Character offset into extracted text" },
      "maxChars": { "type": "integer", "minimum": 256, "maximum": 60000, "default": 12000 },
      "pages": { "type": "string", "pattern": "^[0-9,\\- ]+$", "description": "PDF page ranges, e.g. '1-3,7'" }
    },
    "additionalProperties": false
  },
  "output": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }, "mime": { "type": "string" },
      "text": { "type": "string" }, "offset": { "type": "integer" },
      "totalChars": { "type": "integer" }, "truncated": { "type": "boolean" },
      "meta": { "type": "object", "properties": { "pages": { "type": "integer" }, "title": { "type": "string" } } }
    }
  }
}
```

```json
{
  "name": "fs_summarize",
  "input": {
    "type": "object",
    "required": ["path"],
    "properties": {
      "path": { "type": "string" },
      "style": { "enum": ["tldr", "bullets", "detailed", "action-items"], "default": "bullets" },
      "language": { "type": "string", "default": "auto" },
      "maxWords": { "type": "integer", "minimum": 30, "maximum": 1500, "default": 250 }
    },
    "additionalProperties": false
  }
}
```

```json
{
  "name": "fs_search",
  "input": {
    "type": "object",
    "properties": {
      "root": { "type": "string", "description": "Defaults to all allowed folders" },
      "name": { "type": "string", "description": "Glob, e.g. '*.pdf' or '*report*'" },
      "contains": { "type": "string", "maxLength": 200 },
      "modifiedAfter": { "type": "string", "format": "date-time" },
      "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 }
    },
    "additionalProperties": false
  }
}
```

### 3.2 Files: organize

| Tool | Danger | Notes |
| --- | --- | --- |
| `fs_mkdir` | write | Creates a folder. |
| `fs_move` | write | Move or rename. Never overwrites; uses `onConflict: "rename"` or fails. Undo is the inverse move. |
| `fs_copy` | write | Undo trashes the copy. |
| `fs_write_text` | write | Creates a new file or appends. Overwriting an existing file is **destructive**: the old version goes to trash first. |
| `fs_trash` | destructive | `shell.trashItem`, which goes to the OS recycle bin. There is **no hard-delete tool.** |
| `fs_organize_plan` | read | Proposes a batch of move/mkdir operations (for example "sort Downloads by type"). Only returns a plan. |
| `fs_apply_plan` | write / destructive | Executes a plan id returned by `fs_organize_plan` after one batch confirmation. Atomic journal; undo reverses the whole batch. |

```json
{
  "name": "fs_move",
  "input": {
    "type": "object",
    "required": ["from", "to"],
    "properties": {
      "from": { "type": "string" },
      "to": { "type": "string", "description": "Target path (file) or existing folder" },
      "onConflict": { "enum": ["fail", "rename"], "default": "fail" },
      "dryRun": { "type": "boolean", "default": false }
    },
    "additionalProperties": false
  }
}
```

```json
{
  "name": "fs_organize_plan",
  "input": {
    "type": "object",
    "required": ["root", "rule"],
    "properties": {
      "root": { "type": "string" },
      "rule": { "enum": ["by-type", "by-month", "by-extension", "custom"] },
      "instructions": { "type": "string", "maxLength": 500, "description": "Natural-language rule when rule=custom" },
      "maxOps": { "type": "integer", "maximum": 500, "default": 200 }
    }
  },
  "output": {
    "type": "object",
    "properties": {
      "planId": { "type": "string" },
      "ops": { "type": "array", "items": { "type": "object", "properties": {
        "op": { "enum": ["mkdir", "move"] }, "from": { "type": "string" }, "to": { "type": "string" } } } },
      "expiresAt": { "type": "string", "format": "date-time" }
    }
  }
}
```

### 3.3 Calendar

Calendar access goes through a `CalendarProvider` interface with these backends:

- `local`: an ICS file in `userData/calendar/`, the default;
- `google`: OAuth with a loopback redirect;
- `outlook`: Microsoft Graph via MSAL Node, public client;
- `caldav`: `tsdav` (MIT). The account password is stored with `safeStorage`, the same as provider keys.

| Tool | Danger |
| --- | --- |
| `calendar_list_calendars` | read |
| `calendar_list_events` | read |
| `calendar_create_event` | write |
| `calendar_update_event` | write |
| `calendar_delete_event` | destructive (soft-delete for local; remote is confirmed, then deleted; undo re-creates it from the snapshot) |
| `calendar_find_free_time` | read |

```json
{
  "name": "calendar_create_event",
  "input": {
    "type": "object",
    "required": ["title", "start"],
    "properties": {
      "calendarId": { "type": "string", "default": "local:default" },
      "title": { "type": "string", "maxLength": 300 },
      "start": { "type": "string", "format": "date-time" },
      "end": { "type": "string", "format": "date-time" },
      "allDay": { "type": "boolean", "default": false },
      "timezone": { "type": "string", "description": "IANA, defaults to system" },
      "location": { "type": "string" },
      "notes": { "type": "string", "maxLength": 4000 },
      "remindMinutesBefore": { "type": "array", "items": { "type": "integer", "minimum": 0, "maximum": 40320 } },
      "rrule": { "type": "string", "description": "RFC 5545 RRULE, e.g. FREQ=WEEKLY;BYDAY=MO" },
      "dryRun": { "type": "boolean", "default": false }
    },
    "additionalProperties": false
  }
}
```

```json
{
  "name": "calendar_list_events",
  "input": {
    "type": "object",
    "required": ["from", "to"],
    "properties": {
      "from": { "type": "string", "format": "date-time" },
      "to": { "type": "string", "format": "date-time" },
      "calendarIds": { "type": "array", "items": { "type": "string" } },
      "query": { "type": "string" }
    }
  }
}
```

### 3.4 Reminders

Reminders are local only. They are stored in `userData/reminders.json`, and the scheduler runs in the main process. When the app is closed they are not lost: on the next launch the mascot announces "missed while you were away". An optional OS notification can be shown through `Notification`.

```json
{
  "name": "reminder_create",
  "input": {
    "type": "object",
    "required": ["text"],
    "properties": {
      "text": { "type": "string", "maxLength": 500 },
      "at": { "type": "string", "format": "date-time" },
      "in": { "type": "string", "pattern": "^P(T?\\d+[HMSD])+$", "description": "ISO-8601 duration, e.g. PT25M" },
      "repeat": { "type": "string", "description": "RRULE" },
      "channel": { "enum": ["mascot", "notification", "both"], "default": "both" }
    },
    "oneOf": [{ "required": ["at"] }, { "required": ["in"] }]
  }
}
```

The other reminder tools are `reminder_list` (read), `reminder_update` (write), `reminder_cancel` (write, undoable) and `reminder_snooze` (write).

### 3.5 Notes

Notes are a local markdown notebook in `userData/notes/` by default. The user can point it at a folder of their own, for example an Obsidian vault, which then becomes an allowed scope.

| Tool | Danger | Notes |
| --- | --- | --- |
| `note_create` | write | Input: `{ title, body, tags[] }` |
| `note_append` | write | |
| `note_search` | read | Full-text search via MiniSearch (MIT), indexed locally. |
| `note_read` | read | |
| `note_list` | read | |
| `note_trash` | destructive | |

### 3.6 Clipboard

The clipboard tools reuse `ClipboardPlugin` from `bundle-ig-electron-caps`.

| Tool | Danger | Notes |
| --- | --- | --- |
| `clipboard_read` | read, but **per-call consent by default** | The clipboard often holds secrets. The "always allow" option is labeled with a warning. Text only; images become an attachment reference. |
| `clipboard_write` | write | Overwriting the clipboard is announced in the bubble ("已复制到剪贴板"). |

### 3.7 Open and launch

| Tool | Danger | Notes |
| --- | --- | --- |
| `open_path` | write | `shell.openPath` on a file or folder inside the scope. Executables are refused: `.exe .bat .cmd .ps1 .sh .app .command .desktop .lnk .scr .msi .jar .vbs`, plus any file with the exec bit outside an allowlist. |
| `open_url` | write | `shell.openExternal`, http(s) and mailto only. The domain is shown in the confirmation. |
| `reveal_in_folder` | read | `shell.showItemInFolder` |
| `app_launch` | write | Launches a **registered** app by id. |
| `app_list` | read | Lists the registered apps. |

The registry of launchable apps is built from:

- Windows: Start Menu `.lnk` targets;
- macOS: `/Applications/*.app`;
- Linux: `.desktop` files.

On the first `app_launch` of each app the user confirms ("Allow the mascot to open Visual Studio Code?"). Launching passes no arguments, except a file path from the scope where the app supports "open with".

```json
{
  "name": "app_launch",
  "input": {
    "type": "object",
    "required": ["appId"],
    "properties": {
      "appId": { "type": "string", "description": "Id from app_list" },
      "openPath": { "type": "string", "description": "Optional file in an allowed folder" }
    },
    "additionalProperties": false
  }
}
```

### 3.8 Meta tools

| Tool | Danger | Notes |
| --- | --- | --- |
| `desktop_permissions` | read | Tells the model which scopes it has, so it can ask the user instead of failing. |
| `desktop_request_scope` | write | Asks the user, through a dialog, to grant a folder. The user picks the folder in the OS dialog; the model can only suggest a path. |
| `undo_last` | write | Reverts the last journaled operation or batch. Always confirmed. |

## 4. Permission model

### 4.1 Scopes (folder allowlist)

- Out of the box, the only granted scopes are app-owned: `userData/notes`, `userData/calendar` and the reminders store. **No user folder is readable until it is granted.**
- A grant happens in one of these ways:
  - Settings → 桌面能力 → 授权文件夹, which opens the OS folder picker;
  - `desktop_request_scope`, which opens the OS picker with a suggested path;
  - dropping a file onto the mascot, which grants **only that file**, read-only, for that session.
- Each scope is `{ path, mode: 'read' | 'read-write', recursive: true, grantedAt, expiresAt? }`.
- Path checks in `ScopedFs`:
  - `realpath` both the target and the scope;
  - require `path.relative(scope, target)` to not start with `..` and not be absolute;
  - reject symlinks that leave the scope;
  - normalize case on Windows and macOS;
  - reject UNC and device paths (`\\?\`, `\\.\`, `/dev`, `/proc`);
  - reject paths over 4096 characters.
- There is a hard denylist that applies even inside a granted scope:
  - `.ssh`, `.gnupg`, `.aws`, `.config/gcloud`, keychains, browser profiles;
  - `*.kdbx`, `id_*`, `.env*`;
  - the app's own `userData/secrets*`.
- Scopes are managed in Settings, where each one can be revoked. Revoking takes effect immediately and cancels in-flight operations.

### 4.2 Per-tool consent

Each tool has a per-tool policy:

- `ask-every-time`;
- `ask-once-per-session`;
- `always-allow`, which can never be chosen for `destructive` tools.

The defaults by danger level are:

| Danger | Default policy |
| --- | --- |
| `read` | always-allow within scope (the scope grant is the consent) |
| `write` | ask-once-per-session |
| `destructive` | ask-every-time |

`clipboard_read` is ask-every-time.

### 4.3 Confirmation UX

The confirmation is two-stage: the mascot bubble first, then a dialog.

1. When a tool needs confirmation, the AI loop pauses: the tool's `execute` awaits `PermissionBroker.confirm()`.
2. The mascot plays `think`, her expression changes to `surprised` for destructive tools, and the bubble shows a one-line summary such as "要把 23 个文件移到「下载/图片」吗？", with **[允许] [查看详情] [拒绝]** buttons.
3. 查看详情 opens a modal (`@ig-live/ui` `Dialog`) that shows:
   - the tool name and the exact JSON arguments;
   - a dry-run preview: the plan list, or the first lines of the text that would be written;
   - the scope;
   - a "remember for this session" checkbox, which is hidden for destructive tools.
4. Destructive operations need the dialog, not just the bubble button. The confirm button stays disabled for 1 s to prevent accidental double clicks.
5. Timeout:
   - after 120 s with no answer, the result is a denial, returned to the model as `error.code = "user_denied"`;
   - the model is instructed not to retry the same call after a denial.
6. Confirmations can't be triggered or answered by the model. The renderer confirmation channel is separate from `ai:*`, and the main process checks that each answer comes from a real user gesture (`event.sender` is the mascot or chat window, and the answer arrives after a `pointerdown` or `keydown`).

### 4.4 Dry-run, undo and trash

- Every mutating tool supports `dryRun`. The broker can also force a dry run first: when "preview before changes" is on, the confirmation dialog always shows the plan.
- **UndoJournal** is an append-only `userData/desktop-journal.jsonl` with entries like `{ id, ts, tool, args, inverse: [...ops], batchId }`. The inverse operations are:

  | Operation | Inverse |
  | --- | --- |
  | move | move back |
  | create | trash |
  | overwrite | restore from trash snapshot |
  | calendar delete | re-create from snapshot |

  Undo is offered in three places: the bubble right after the action ("撤销" for 30 s), `undo_last`, and Settings → 操作记录. Inverse operations are checked before running; if the file has since changed, the user is asked.
- **Nothing is ever hard-deleted.** `fs_trash` and overwrite use `shell.trashItem`. Where trash is unavailable, for example a Linux system without a freedesktop trash, the file goes to `userData/trash/<date>/` with a manifest and is purged after 30 days.

### 4.5 Audit log

- `userData/audit/desktop-YYYY-MM.jsonl` holds one line per tool call:
  - the timestamp, tool and arguments, with paths kept and text bodies hashed and truncated;
  - the decision (`auto | allowed | denied | timeout`), the result code, duration and bytes read or written;
  - the provider and model that requested the call;
  - the conversation id.
- The log is local only. The user can view it in Settings → 操作记录 (filter, export, clear), and it is rotated after 6 months.
- File contents and clipboard contents are never logged.

### 4.6 Rate limits and guardrails

- `GuardrailsPlugin` token buckets apply per tool:
  - at most 30 file reads per minute;
  - at most 200 operations in one `fs_apply_plan`;
  - at most 5 app launches per minute.
- Maximum bytes the model can read per turn: 200 KB of extracted text. Larger amounts require a summarize pipeline.
- Prompt-injection hygiene. Text extracted from files is wrapped as untrusted, e.g. `<file_content path="...">…</file_content>`, and the system prompt says it is data, not instructions. When a file read happens earlier in the turn, mutating tools always ask, regardless of the "remember" setting. This "tainted turn" rule mitigates documents that try to trigger actions.

## 5. Sandboxing

- All tools run in the main process. File parsing runs in a `utilityProcess` with `serviceName: 'desktop-parse'`, `--max-old-space-size=256`, a 20 s timeout, and no network: only `fs` read of an already-validated path is passed to it.
- No `child_process` in phase 1–3. App launch uses `shell.openPath` on registered app bundles or `.desktop` entries. Arguments are not concatenated into shell strings.
- Renderer windows keep `sandbox: true` and `contextIsolation: true`. The preload exposes only:
  - confirmation answer IPC;
  - drop-file IPC, which sends a path that the main process re-validates using the `File` object's path from `webUtils.getPathForFile`;
  - read-only status.
- Network access is limited to the calendar connectors' own HTTPS endpoints. A CSP-like allowlist lives in the connector code, and there are no generic `fetch` tools.
- Connector OAuth tokens are encrypted with `safeStorage`, the same `SecretCipher` used for provider keys. They are never sent to the renderer and never logged.

## 6. MCP alignment

- The same `ToolDefinition`s are registered in the `ToolRegistry`, so the built-in agent can use them. They are **also** exposed as a built-in MCP server, `companion-desktop`, so external MCP clients can use them; Claude Desktop and Cursor are examples. The transports are:
  - stdio, through `companion-desk --mcp-desktop`, which reuses the existing `--no-window` headless runtime from E3;
  - streamable HTTP on `127.0.0.1` with a random port and a bearer token that is shown once in Settings.
- Tool names, the input JSON Schema (from zod), and `annotations` follow the MCP 2025-06 spec. The annotations are `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` (true only for `open_url` and the calendar connectors).
- External MCP calls go through the **same** PermissionBroker. The confirmation shows "来自 Cursor 的请求", taken from the client info. The MCP server is off by default and is enabled per client.
- Resources: `notes://`, `calendar://today` and `reminders://upcoming` are read-only MCP resources. Prompts: `summarize-file` and `plan-my-day`.
- Conversely, the existing `McpBridgePlugin` keeps working for third-party MCP servers. Their tools are labeled "external" and default to ask-once.

## 7. UX flows with the mascot

1. **Drag a file onto the mascot.** A `drop` event on the mascot window sends the path to the main process. The main process grants a temporary single-file read scope and starts an `fs_summarize` (bullets) turn. While the summary is generated she plays `think` with a "读一下…" bubble. The summary appears in the bubble (or in chat if it is long). Follow-up actions are offered as bubble buttons: 存为笔记 / 加提醒 / 打开.
2. **Proactive reminders.** The Scheduler fires `reminder.due`. If the window is hidden, it is shown, and an OS notification is sent if enabled. Then:
   - she walks or turns toward the screen centre, waves, and the bubble shows the reminder text with [好的] [10 分钟后] [打开相关文件];
   - TTS speaks the line if voice is on;
   - when a reminder is missed because the app was closed, she announces it on the next launch.
3. **Morning briefing.** This is optional and off by default. On the first unlock after 6:00 she shows today's events, free slots and overdue reminders. It uses `calendar_list_events` + `reminder_list`, all read-only.
4. **"整理一下下载文件夹".** The flow is:
   1. `desktop_permissions` shows there is no scope, so `desktop_request_scope(~/Downloads)` opens the OS picker.
   2. `fs_organize_plan` produces the plan, and the bubble asks "要移动 48 个文件吗？" with [查看详情].
   3. The plan dialog opens, the user confirms, and `fs_apply_plan` runs.
   4. The bubble says "整理好了" with [撤销] for 30 s.
5. **Calendar quick add.** "下周一下午三点和小王开会": `calendar_find_free_time` runs as an optional check, then `calendar_create_event` (dryRun) produces a preview card in the bubble, and confirming creates the event.
6. **Clipboard.** "把我复制的这段翻译一下": `clipboard_read` asks for consent, the text is translated, and `clipboard_write` puts the result on the clipboard, which the bubble announces.
7. **Status visibility.** While a tool runs, a small badge near the mascot shows the tool icon and a spinner. Clicking it opens the activity log. Long operations can be cancelled through an `AbortSignal`.

## 8. Data privacy

- **Local-only by default.** Files, notes, reminders, the local calendar, the audit log and the journal all stay in `userData` or user-granted folders. Nothing is synced.
- What leaves the device:
  - text the model needs, sent to the **configured LLM provider**. The panel shows "此 Token 仅保存在本地设备…", and the first time a file's content is sent to a cloud provider a second notice appears: 「文件内容将发送给 <provider> 进行处理」. Users can route the `summary` role to a local provider such as Ollama, and a "仅本地模型可读文件" toggle blocks file tools when the active provider is remote;
  - calendar data, sent to Google, Microsoft or the CalDAV server only when the user has connected that account.
- There is no telemetry. Logs redact paths outside the scope and never include contents.
- Settings → 桌面能力 has 「清除全部」, which removes all desktop data: scopes, the journal, audit logs, notes index, reminders and connector tokens.

## 9. Phased rollout and effort

| Phase | Scope | Effort (1 dev) |
| --- | --- | --- |
| P0 · foundations | `ScopedFs`, PermissionBroker (scopes, consent, confirm IPC), mascot bubble + dialog confirmation, AuditLog, UndoJournal + trash, Settings page (scopes / per-tool policy / log), unit tests for path checks (symlink, `..`, case, UNC) | 6–8 d |
| P1 · read & summarize | `fs_list/search/stat/read_text/summarize`, utility-process parsers (pdfjs, mammoth), drag-file-onto-mascot flow, tainted-turn rule, e2e with fixture files | 5–6 d |
| P2 · notes + reminders + clipboard | notes store + search index, reminders scheduler + proactive mascot flow + missed-on-launch, clipboard tools with consent | 5 d |
| P3 · organize + open/launch | `fs_mkdir/move/copy/write_text/trash`, organize plan/apply + batch undo, `open_path/open_url/reveal`, app registry per OS + `app_launch` | 6–7 d |
| P4 · calendar | local ICS calendar + tools; then connectors: Google (OAuth loopback), Outlook (MSAL), CalDAV (tsdav); free-time finder; morning briefing | 4 d local + 3 d per connector |
| P5 · MCP server | expose registry as `companion-desktop` MCP (stdio + localhost HTTP), annotations, client allowlist, resources/prompts | 3–4 d |

The total is roughly 6–7 weeks for one developer, or 3–4 weeks for two working in parallel: P1/P2 alongside P3/P4 once P0 has landed. Each phase ships behind a feature flag (`desktopTools.<phase>`) and goes through 3-OS CI e2e: Linux under xvfb, Windows and macOS with fixture folders.

## 10. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Prompt injection from document contents triggers actions | Untrusted wrapping; tainted-turn always-ask rule; no destructive auto-approve; plan/apply split; no shell |
| Path traversal / symlink escape | `realpath` + relative check + symlink policy + denylist; fuzz tests |
| Data exfiltration to a cloud LLM | Explicit first-use notice per provider; "local models only" switch; byte caps per turn |
| Destructive mistakes (bulk moves) | Dry-run previews, batch confirmation, journal undo, trash-only |
| Malicious or huge PDF/DOCX | Utility process, timeout, memory cap, page/char limits |
| OAuth complexity, token leakage | Loopback PKCE, `safeStorage` encryption, minimal scopes (`calendar.events` only), per-connector disconnect |
| Confirmation fatigue → users click "allow" blindly | Sensible defaults (read auto within scope), batching, clear bubble summaries, destructive actions need the dialog |
| Cross-OS differences (trash, app registry, Wayland) | Per-OS adapters with fallbacks (`userData/trash`), documented limits, CI on 3 OS |
| Proactive reminders annoy users | Quiet hours, Do-Not-Disturb detection where available, per-reminder channel, global off switch |
| Licensing of parsers/connectors | Only MIT/Apache/BSD deps (pdfjs-dist, mammoth, tsdav, minisearch, @azure/msal-node, googleapis) — enforced by `scripts/check-licenses.mjs` |

## 11. Open questions

- Should file reads in a granted scope require per-file consent when the active provider is remote? The proposed default is no, plus the first-use notice.
- Notes: keep our own markdown store, or default to "pick an existing folder" (Obsidian/Logseq vault)?
- Should the MCP server be allowed to run while the GUI is closed (tray-less headless mode)?
