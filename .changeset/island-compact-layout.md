---
---

fix(island): the Dynamic Island no longer has a big empty black area above its content. The window height now follows the content (measured in the page), padding is symmetric and compact (pill: 11px; notch: only the real menu-bar height, with the icon moved into the notch band), the pill keeps a 5px gap under the menu bar and follows the light/dark appearance, and each event state has its own accent. The island window also uses its own session so the app-wide CSP no longer blocks its inline script in non-dev builds.
