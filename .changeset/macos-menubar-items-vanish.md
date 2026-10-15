---
---

fix(electron): on macOS the Dynamic Island no longer transforms the process type when it shows over full-screen spaces, which made the menu-bar items and Dock icon disappear in dev mode; the tray is also kept alive, never gets an empty icon, and is recreated when lost.
