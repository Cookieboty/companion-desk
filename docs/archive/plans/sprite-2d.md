# 2D sprite display mode (spike)

**Date:** 2026-10-11  
**Branch:** `feat/ai-harness-p0`  
**Status:** spike landed — expression-swapped sprites (soft VN-style + cute pixel pet); VRM remains default.

## Goal

Offer an open-licensed **2D** mascot path without Live2D Cubism: swap PNG expression plates (and optional mouth/blink overlays). Prefer cute anime-adjacent art, including **pixel-art pets**.

## Runtime decision

| Option | License | Usable in Electron now? | Notes |
|--------|---------|-------------------------|-------|
| **Expression-swapped PNG sprites** (this spike) | Per-asset (we ship CC0 originals) | **Yes** | Canvas2D, tiny code, lip-sync/blink/look via overlays + idle bob |
| Inochi2D / Inox2D (WASM) | BSD-2 | **No (prod)** | Prior spike: prototype, broken faces/params on reference models; see `docs/plans/mascot-open-source.md` |
| Live2D Cubism | Proprietary | **No** | Removed for licensing |

## Proposed external asset list (not vendored yet)

Candidates to evaluate for a later pack (verify license file on download; prefer CC0 / CC-BY 4.0 clearly marked for commercial desktop use):

### Soft / VN-style
| Asset | License (claimed) | Why |
|-------|------------------|-----|
| [Arch-chan](https://github.com/Inochi2D) sample `.inp` | CC0 | Best Inochi2D reference; blocked on runtime maturity |
| OpenGameArt “anime” portrait search (filter CC0/CC-BY) | varies | Spot-check each pack; many are CC-BY with attribution |
| itch.io “CC0 visual novel sprites” / “character portrait pack” | varies | Buy/download only when LICENSE.txt is explicit |

### Pixel-art (cute / anime-adjacent pets & chibi)
| Asset | License (claimed) | Why |
|-------|------------------|-----|
| Pixel Frog — Pixel Adventure / similar itch free packs | often **free for commercial** (check each) | Platformer animals; remap to expression frames |
| OpenGameArt — “cat pixel”, “chibi”, “pet” + CC0 filter | CC0 / CC-BY | Good for idle/walk strips; convert strips → expression sheet |
| Liberated Pixel Cup (LPC) base | **CC-BY-SA** | Strong corpus but ShareAlike — only if we accept SA on derivatives |
| “Owlet Monster” / Forest asset (itch, often CC0) | verify | Cute monster pet vibe |

**Policy:** do not vendor third-party zips until LICENSE + commercial desktop redistribution is confirmed in-tree (`THIRD_PARTY_NOTICES` + model CREDITS).

## What landed in-repo (all CC0)

| Id | Style | Path | Source |
|----|-------|------|--------|
| `pastel-girl` | Soft pastel girl | `…/sprite/pastel-girl/` | pzUH / OpenGameArt CC0 |
| `michona` | Anime girl frames | `…/sprite/michona/` | Hordana / OpenGameArt CC0 |

**Removed:** `pixel-neko`, `soft-face`, `sakura-chan`, `kenney-panda` (not pretty enough).

All appear in `model-list.json`. Backend: `sprite.ts` / `SpriteCanvas.tsx`.

## How to try

1. Run the app → Model picker → Pastel Girl / Michona.

AI mood / TTS still drive `setExpression` / `setMouthOpen` / `lookAt` through `mascotRegistry`.

## Follow-ups

- Import a vetted OGA pixel pack as optional download (not required for CI).
- Per-pixel click-through for sprites (alpha hit) parity with VRM.
- Optional short GIF/APNG idle loops for pixel pets.
