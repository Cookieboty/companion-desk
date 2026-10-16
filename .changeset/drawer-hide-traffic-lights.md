---
---

fix(chat): opening a drawer or dialog (e.g. "Add provider") no longer lets the macOS traffic lights show through the overlay and get mistaken for a drawer close button, which closed the whole settings window. The drawer overlay is now more opaque and blurred and covers the title bar, and macOS hides the native window buttons while a drawer or dialog is open and restores them on close. Windows and Linux are unaffected. The X button, Esc and clicking the overlay still close the drawer.
