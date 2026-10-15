---
---

fix(chat): while one CLI endpoint is being installed or updated, other endpoints' install/update actions are disabled and the main process refuses concurrent runs instead of surfacing a failing error task. fix(chat): CLI version info is refreshed only once after an install/update run finishes, removing a redundant round of npm version checks.
