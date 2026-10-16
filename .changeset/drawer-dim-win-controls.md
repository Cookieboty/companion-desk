---
---

fix(chat): on Windows and Linux the native minimize / maximize / close buttons also show through the overlay while a drawer or dialog (e.g. "Add provider") is open and could be mistaken for a drawer close button. They are now dimmed while a drawer or dialog is open, and clicking close (or Alt+F4) closes the topmost drawer or dialog instead of the whole settings window. Quitting the app, installing an update, system shutdown or a crashed renderer are never blocked. macOS behaviour is unchanged (traffic lights hidden).
