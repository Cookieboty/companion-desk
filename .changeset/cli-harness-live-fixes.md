---
---

fix(electron): fixes found by running the real Claude Code and Codex: the harness closes CLI stdin, so Codex no longer hangs waiting for input; switching backend drops the previous CLI session and Codex resume uses valid arguments; the Codex config patch keeps a single provider table; and the local route reports input token usage at the end of the stream.
