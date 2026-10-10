# Desktop tools (P0 + P1)

Companion Desk lets the model read and summarize your local files, but only inside folders you grant. Every action is checked, logged and, where it changes something, undoable.
This page covers what shipped in P0 (foundations) and P1 (file tools). The full design and the later phases are in [plans/desktop-tools.md](plans/desktop-tools.md).

## For users

**Grant a folder.** Open the chat window and click 📁 next to the provider switcher, or use Tray → 「桌面能力（文件授权 / 操作记录）…」. Then click 「授权文件夹（只读）」 or 「（读写）」.
The OS folder picker opens and the app gets exactly the folder you choose. Nothing is reachable by default.

**Ask.** For example: 「帮我总结 ~/Documents/report.pdf」 or 「在文档里找一下提到 invoice 的文件」. The model calls the tools itself.

**Drop a file on the mascot.** Drag a txt / md / pdf / docx file onto the character. She grants herself read access to that one file for this run only. She shows a short summary in her bubble and posts the full summary in the chat window.

**Confirmations.** When a tool needs your OK, the mascot shows a bubble with 「允许 / 查看详情 / 拒绝」. The details dialog shows the tool, its JSON arguments and a dry-run preview of what would happen.

- **Destructive actions** (moving files to the trash, overwriting) can only be confirmed in the dialog. The confirm button stays disabled for one second after the dialog opens.
- **No answer in 120 s** counts as a deny.

**Undo.** Deletes never delete. Files go to the app trash (`userData/desktop/trash/`, kept for 30 days). 「桌面能力 → 操作记录 → 撤销上一步」 restores the last change, and the model can also call `undo_last`, which always asks first.

**Privacy.**

- 「隐私 → 仅本地模型可读文件」 lets only local providers (`localhost` / `127.*` / `::1`, such as Ollama) see file content.
- Without that switch, the first time file content would go to a given cloud provider you get a one-time notice to accept or decline.
- The audit log stays on this machine. It records tool, arguments, decision and result. Text arguments are stored only as a hash and length, never as content.

**Always denied, even inside a granted folder:**

- `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`, `.docker` and `.password-store`;
- keychains;
- Chrome / Edge / Firefox / Brave profiles and Windows credential stores;
- `id_rsa*`, `*.kdbx`, `.env*`, `*.pem` / `*.key` / `*.p12`, `.netrc`, `.npmrc` and `.git-credentials`;
- the app's own data folder.

## Tools

| Tool                    | Level       | Default confirmation                | Notes                                                                                                                               |
| ----------------------- | ----------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `desktop_permissions`   | read        | none                                | lists granted folders and the local-only flag                                                                                       |
| `desktop_request_scope` | read        | the OS folder picker is the consent | `{ suggestedPath?, mode, reason? }`                                                                                                 |
| `fs_list`               | read        | auto                                | paginated, `{ path, offset, limit≤500 }`                                                                                            |
| `fs_stat`               | read        | auto                                | size, mtime, type, readable                                                                                                         |
| `fs_search`             | read        | auto                                | `name` glob and/or `contains` for text files ≤2 MB; no symlink following; at most depth 8 and 5,000 entries                         |
| `fs_read_text`          | read        | auto                                | txt/md/csv/json/code/pdf/docx; `offset`, `maxChars≤60k`, PDF `pages: "1-3,7"`; output wrapped in `<file_content trust="untrusted">` |
| `fs_summarize`          | read        | auto                                | parses, then map-reduces through the **summary** role provider (12k-char chunks, up to 8)                                           |
| `fs_write_text`         | write       | ask once per run (can remember)     | `create` / `append`; `overwrite` counts as destructive. `dryRun` returns the plan                                                   |
| `fs_trash`              | destructive | dialog, every time                  | moves to the app trash; the granted root itself is refused; `dryRun`                                                                |
| `undo_last`             | write       | asks every time                     | reverts the last journal entry if the files have not changed since                                                                  |

Each read / write tool can be set to 总是允许 / 每次运行首次询问 / 每次都询问 under 「工具权限」. Destructive tools and `undo_last` are fixed.

The tool result format is `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. The error codes are:

- `outside_scope`, `denied`, `symlink_escape`, `read_only`, `invalid_path`, `not_found`;
- `unsupported`, `too_large`, `timeout`, `crashed`, `parse_failed`, `empty`;
- `user_denied`, `timeout_denied`, `local_only`;
- `exists`, `conflict`, `nothing_to_undo`.

**Tainted turn.** Once a turn has read file content (`fs_read_text` / `fs_summarize`), any write in that same turn asks again. This holds even if the tool is set to 总是允许 or was remembered. It stops a document from talking the model into editing files unnoticed. A turn is one AI SDK request, tracked by its `AbortSignal`.

## Architecture

```
chat window ──ai:chat:agentStream──▶ ChatFacade.agentStream ──▶ AiSdkLlmProvider.withTools(ToolRegistry.list())
                                                                     │ streamText(tools, stopWhen: 5 steps)
DesktopToolsPlugin (electron/src/desktop/plugin.ts) ── registers ──▶ ToolRegistry
   └─ createDesktopTools (tools.ts)
        ├─ PermissionBroker  scopes · per-tool policy · confirm requests (120 s) · tainted turns · local-only / cloud notice
        │     └─ guardPath (pathGuard.ts)  syntax/UNC/device → realpath → scope containment → denylist → mode
        ├─ parseFile (parse/runParse.ts) → utilityProcess worker.js (--max-old-space-size=256, 20 s kill, 50 MB cap)
        │     └─ extract.ts  text decode · unpdf (pdf.js) · fflate + word/document.xml
        ├─ AppTrash · UndoJournal (journal.jsonl) · AuditLog (audit/desktop-YYYY-MM.jsonl, 6 months)
        └─ summarize → client.chat.sendMessage({ role: 'summary' })
DesktopService (IPC)
   ai:desktop:*            settings panel (state, grant via OS picker, revoke, policy, local-only, audit, journal, undo)
   desktop:confirm-request → mascot window bubble/dialog;  desktop:confirm-answer ← only accepted from the mascot window
   desktop:drop-file       ← mascot window; path comes from webUtils.getPathForFile(File), not from page script strings
```

Everything lives under `userData/desktop/` (`settings.json`, `audit/`, `journal.jsonl`, `trash/`). 「隐私 → 清除全部」 resets scopes, policies, cloud notices and the log.

## Tests

- **Unit** (`packages/electron/tests/unit/desktop/`):
  - path guard: syntax, UNC / device, `..`, case-insensitive platforms, symlink escape, denylist, read-only, single-file scope;
  - consent matrix;
  - broker: timeout auto-deny, remember, tainted turn, abort, no-UI deny, persistence, local-only / cloud notice;
  - undo journal, app trash, audit log redaction;
  - the tools end to end with real files, plus docx / pdf fixtures.
- **E2E** (`e2e-headed/tests/E10.desktop-tools.headed.spec.ts`) runs a mock OpenAI-compatible server that issues tool calls. It covers:
  - granting a folder from the panel (the OS picker is stubbed);
  - summarizing md and pdf through the real utility-process parser;
  - an `id_rsa` path and a `../Secret` path being rejected;
  - `fs_trash`: the bubble has no allow button, the dialog's confirm is disabled for 1 s, then trashing works and undo restores the file;
  - dropping a file on the mascot gives a summary in the bubble and in the chat;
  - audit log rows.
    Run with `DESKTOP_TOOLS_SHOTS=<dir>` to save screenshots.

## Known limits (P0/P1)

- Scanned PDFs (images only) return `empty`. There is no OCR.
- `.doc`, `.pages`, `.odt`, `.rtf` and spreadsheets are not parsed yet.
- The parser runs in an Electron `utilityProcess` with a heap cap and a timeout. It is not an OS-level sandbox (no seccomp / AppContainer), but it only gets a path that already passed the guard.
- `fs_mkdir` / `move` / `copy`, organize plans, notes, reminders, clipboard, app launch and calendar belong to P2 and later.
