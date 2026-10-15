# Changelog

All notable changes to Nomi. Generated from [changesets](.changeset/) by
`pnpm changelog` — do not edit the Unreleased section by hand; add a changeset instead.

## Unreleased

### Features

- **a11y:** dialogs trap focus, Esc closes only the top-most dialog and focus returns to the opener; reduced motion calms the VRM rig and the island.
- **brand:** every user-visible 看板娘 / Live2D / Companion Desk string is now Nomi.
- **chat:** conversation rows now show rename, delete and more icons on hover, keyboard focus, the selected row and touch devices. Rename edits inline, deleting a Nomi chat asks for a second confirmation, deleting on a CLI tab closes the tab (still confirming when it is running), and "more" opens the same menu as right click. Read-only disk history sessions only offer "Open in a tab". The title fades out under the icons and the time gives way, so the list does not jump.
- **chat:** normal/dev chat mode, per-endpoint conversation isolation, dual sidebar list (全部/按端), and same/cross-endpoint fork (CLI tabs seed compact transcripts; not resume).
- **chat:** one provider page per endpoint, CLI history in the sidebar, unified new/conversation menus, endpoint icons and workspace picker UI strings. (`@nomi-ai/ui` patch)
- **chat:** settings "Providers and models" is now "Coding assistants" with Nomi, Claude Code, Codex, dsh and a monitor tab. The three CLI endpoints use the same third-party provider cards, presets and editor as Nomi and default to the CLI's own login. Each CLI page has a version card to detect, install and update (exact command, confirm dialog, Node checks, no silent sudo); dsh can now be installed and updated too. The coding monitor moved out of the schedule page. Endpoint icons use the Nomi, OpenAI and DeepSeek marks (lobe-icons, MIT).
- **chat:** the sidebar header is now one row (collapse, Nomi logo, search icon, new-chat icon) and the all/by-endpoint switch is a compact control next to the conversation heading. New fuzzy conversation search (Cmd/Ctrl+F): matches title, first message, workspace and endpoint name, tolerant of skipped letters and friendly to Chinese, highlights matches, works in both views, and covers Nomi chats, CLI tabs and Claude/Codex/dsh disk history through a chunked index built by the main process. In normal mode the sidebar shows Nomi conversations only; the saved view is restored when you go back to dev mode.
- **cli-providers:** separate Claude/Codex provider stores, upstream API formats, and local routing UI strings. (`@nomi-ai/ui` patch, `@nomi-ai/ai-runtime` patch)
- **electron:** dsh becomes the third coding agent takeover endpoint: version check and npm update, headless JSON sessions forwarded and resumed, and a separate dsh provider store that writes a managed block into `cordis.patch.yml` (the API key is only injected at launch). Docs add the Ollama context length note and the multi-tab concurrent backend design.
- **electron:** the local CLI route now converts streaming (SSE) responses between Anthropic Messages, OpenAI Chat Completions, OpenAI Responses and Gemini, including text deltas, tool calls, stop reasons, usage and mid-stream errors.
- **i18n:** label tables and provider names translated; English UI e2e; `check:i18n` now also fails on dead keys.
- **mascot:** Nomi's 2D mascot now has 41 named Live2D-style actions (wave, nod, think, heart, blow a kiss, thumbs up, sorry, yawn, goodnight and more) on a brand-locked rig. The official hairclips, orange bow, hair bars, earring, choker charm, jacket, chest logo and ID tag are only ever moved, never redrawn: a test hashes every master layer and checks that all brand layers stay opaque, unsheared and uniformly scaled in every frame of every action. Hands are cut from AI art and attached at the elbow with a mesh-warped arm. The action manager has priorities, queueing, holds, cooldowns and crossfades, with idle micro-actions on top; task results, thinking, tools, long answers and file drops pick fitting actions, reduced motion is respected, and the toolbar menu, tray and AI tool list every action with Chinese labels.
- **shortcuts:** new chat, focus input, settings and a Cmd/Ctrl+K command palette; every shortcut is listed in Settings with rebinding and conflict hints.
- **ui:** unified empty / error / loading states with retry, including failed model and voice downloads.
- chat tabs run coding agents concurrently (Claude Code / Codex / dsh, default limit 3, queueing beyond it), each with its own session and working directory; tabs show status dots, unread badges and running/queued load, support add/close/rename and keyboard shortcuts, and persist across restarts. The coding agent monitor aggregates dsh sessions (detected via the held session lock) and Nomi tabs with endpoint filters; the mascot and the Dynamic Island react per endpoint. dsh tool results are paired with their tool names, and the app warns when dsh needs Node 24 or newer.

### Fixes

- **chat:** CLI install and update progress, logs and results are kept by the main process per endpoint, so leaving the settings page or switching endpoints no longer loses them; repeated clicks reuse the running task. fix(electron): CLI probing runs asynchronously so the main process is never blocked. fix(chat): a Codex session spread over several rollout files is listed once, which removes the duplicate React key warning.
- **chat:** in normal mode a Nomi conversation can no longer be forked to Claude Code, Codex or dsh. The context menu and the row "more" menu only offer "Fork as new chat"; cross-endpoint fork stays a dev-mode feature.
- **electron:** fixes found by running the real Claude Code and Codex: the harness closes CLI stdin, so Codex no longer hangs waiting for input; switching backend drops the previous CLI session and Codex resume uses valid arguments; the Codex config patch keeps a single provider table; and the local route reports input token usage at the end of the stream.
- **electron:** non-streaming replies through the local CLI route now keep tool calls, stop reasons and usage for every format pair, and Codex free-text tools come back as `custom_tool_call` items (streaming and non-streaming).
- **electron:** on macOS the Dynamic Island no longer transforms the process type when it shows over full-screen spaces, which made the menu-bar items and Dock icon disappear in dev mode; the tray is also kept alive, never gets an empty icon, and is recreated when lost.
- **electron:** the local CLI route now forwards tools, tool choice, prior tool calls and results, images, system prompts and max tokens to non-native upstreams; Gemini upstreams authenticate with `x-goog-api-key` and take the model from the URL; a plain JSON reply to a streaming request is converted into the client's SSE events.
- **island:** the Dynamic Island no longer has a big empty black area above its content. The window height now follows the content (measured in the page), padding is symmetric and compact (pill: 11px; notch: only the real menu-bar height, with the icon moved into the notch band), the pill keeps a 5px gap under the menu bar and follows the light/dark appearance, and each event state has its own accent. The island window also uses its own session so the app-wide CSP no longer blocks its inline script in non-dev builds.
- **security:** CSP is injected as a `<meta>` tag into the chat and TTS-config pages so it also applies to `file://` loads in packaged builds.
- **security:** private-address check covers IPv4-mapped/compatible IPv6, NAT64, decimal/octal/hex IPv4, 100.64.0.0/10 and 0.0.0.0/8; TTS downloads resolve DNS first and pin the checked address (rebinding mitigation).

### Performance

- **ai-chat:** settings and side panels are route-split and prefetched when idle; the chat entry chunk shrinks from 643 KB to 404 KB.

### Refactoring

- **logging:** central logger; debug/info output is silent in production (set NOMI_DEBUG=1 or localStorage nomi.debug=1 to enable).

### Tests

- **e2e:** first-run onboarding (add provider, test connection, first reply, not shown again) is covered end to end.
- **e2e:** the CC0 test VRM is downloaded at test time instead of being committed.

### Build & release

- **release:** macOS signing + notarization and Windows signing are enabled automatically when the documented secrets are present; root CHANGELOG generated from changesets.

### Maintenance

- **BREAKING** remove leftover files, duplicate icons and stale docs; remove dsh and the legacy standalone MCP subsystem (breaking for anyone scripting `dsh`).
- P9 Polish Package B —— CI/打包骨架 + E2E 补齐 + Changesets 骨架

### Other

- Documentation rewritten by feature module (docs/README.md); links in code and settings updated.
- English strings for coding-agent harness backend switcher and CLI update panel. (`@nomi-ai/ui` patch)
