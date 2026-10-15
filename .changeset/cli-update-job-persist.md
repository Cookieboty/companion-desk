---
---

fix(chat): CLI install and update progress, logs and results are kept by the main process per endpoint, so leaving the settings page or switching endpoints no longer loses them; repeated clicks reuse the running task. fix(electron): CLI probing runs asynchronously so the main process is never blocked. fix(chat): a Codex session spread over several rollout files is listed once, which removes the duplicate React key warning.
