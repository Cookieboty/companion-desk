---
---

feat(chat): the sidebar header is now one row (collapse, Nomi logo, search icon, new-chat icon) and the all/by-endpoint switch is a compact control next to the conversation heading. New fuzzy conversation search (Cmd/Ctrl+F): matches title, first message, workspace and endpoint name, tolerant of skipped letters and friendly to Chinese, highlights matches, works in both views, and covers Nomi chats, CLI tabs and Claude/Codex/dsh disk history through a chunked index built by the main process. In normal mode the sidebar shows Nomi conversations only; the saved view is restored when you go back to dev mode.
