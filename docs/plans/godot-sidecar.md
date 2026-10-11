# Godot sidecar spike (Companion Desk)

**Date:** 2026-10-11 (Asia/Shanghai)  
**Branch:** `feat/ai-harness-p0`  
**Status:** spike complete — three-vrm retained; Godot not wired into Electron yet.

## Goal

Evaluate whether a **Godot 4 + godot-vrm (V-Sekai)** sidecar can replace or coexist with the current Electron/`@pixiv/three-vrm` mascot renderer for VRM0/1, spring bones, look-at, and a small control bridge (AIRI-inspired).

## What landed

| Path | Role |
|------|------|
| `engines/godot-stage/` | Godot 4.7 project: load VRM, idle/wave, look-at, FPS bench, TCP bridge |
| `engines/godot-stage/addons/vrm` + `Godot-MToon-Shader` | Vendored [V-Sekai/godot-vrm](https://github.com/V-Sekai/godot-vrm) (MIT) |
| `engines/three-bench/` | Same-resolution three-vrm FPS harness (Playwright + SwiftShader) for comparison |
| `docs/plans/godot-sidecar.md` | This note |
| `/workspace/screenshots/godot-spike/` | Idle/wave shots + contact sheet |

Electron still uses **three-vrm**; nothing in the app spawn path was deleted or switched.

## Setup (dev machine)

```bash
# Install Godot 4.3+ (spike used 4.7.2 stable linux.x86_64)
# https://godotengine.org/download

cd engines/godot-stage
./scripts/fetch-models.sh   # Shibu VRM0 + Shapell VRM1 (+ Darkness Shibu)
godot --path . --import
godot --path . -- --model=res://assets/models/shibu-vrm0.vrm
```

Sample `.vrm` binaries are **gitignored**; fetch from the monorepo renderer assets + `companion-desk-models`.

## Bridge stub

**Transport:** TCP JSON-lines on `127.0.0.1:8765` (override with `--port=N`).

Godot’s `WebSocketMultiplayerPeer` speaks Godot multiplayer framing, **not** raw JSON WebSocket text frames. For the spike we used TCP so Electron/`nc`/Python can talk without a multiplayer client. Same command set can later sit behind a real WS proxy.

```jsonl
{"cmd":"load","path":"res://assets/models/shapell-vrm1.vrm"}
{"cmd":"play","name":"wave"}
{"cmd":"lookAt","x":0.4,"y":1.5,"z":1.0}
{"cmd":"status"}
{"cmd":"ping"}
```

Helper: `engines/godot-stage/scripts/bridge-client.mjs`.

## VRM support (this spike)

| Model | Spec | Result |
|-------|------|--------|
| Sendagaya Shibu (`shibu-vrm0.vrm`) | VRM 0.x | ✅ Import + runtime load; skeleton/head/neck bound; spring bones via godot-vrm secondary |
| Darkness Shibu | VRM 0.x | ✅ Import (optional asset) |
| Shapell (`shapell-vrm1.vrm`) | VRM 1.0 | ✅ Import + runtime load |

Spring bones: provided by godot-vrm `vrm_secondary` on import (no extra setup).  
Look-at: procedural head/neck pose toward `LookTarget` (godot-vrm also emits lookAt animation tracks; BlendSpace2D not wired yet).  
Idle/wave: procedural sway + upper-arm wave (full AnimationLibrary / VRM animation not implemented — known gap).

## FPS comparison (software GL on the spike box)

Environment (both engines, same box, 2026-10-11):

- Display: **Xvfb** 1280×720
- Godot: Mesa **llvmpipe** OpenGL 4.5, vsync off, 8s measure after 1s warmup
- three-vrm: Chromium headless + **SwiftShader**/ANGLE, same resolution/warmup/duration
- **Not** a GPU desktop benchmark — absolute FPS is low; use **ratios**, not absolute numbers

| Label | Engine | Model | FPS avg | Frame ms avg | p95 ms |
|-------|--------|-------|---------|--------------|--------|
| godot-shibu-vrm0 | Godot 4.7.2 | Shibu VRM0 (~17MB) | **9.2** | 109.0 | 118.7 |
| three-shibu | three-vrm | same | **13.1** | 76.3 | 167.0 |
| godot-shapell-vrm1 | Godot 4.7.2 | Shapell VRM1 (~11MB) | **29.9** | 33.5 | 38.8 |
| three-shapell | three-vrm | same | **20.1** | 49.8 | 57.6 |

Raw JSON: `engines/godot-stage/bench/results/`.

### Reading the numbers

- On this **CPU rasterizer**, Godot was **slower** on the heavier VRM0 Shibu and **faster** on Shapell VRM1.
- Backends differ (llvmpipe vs SwiftShader); treat as a **smoke comparison**, not ship criteria.
- Next: re-run on Windows/macOS with real GPUs before any renderer decision.

## Blockers / follow-ups

1. **Electron spawn + window embedding** — not started (spike runs Godot alone). Need transparent borderless window, click-through, or texture share.
2. **True WebSocket** — TCP stub only; WS needs a framing bridge or non-multiplayer WS server.
3. **Shared motion clips** — Companion Desk motions are custom JSON for three; Godot needs AnimationPlayer / retargeted clips or keep procedural gestures.
4. **Look-at BlendSpace2D** — godot-vrm creates tracks; spike uses bone poses instead.
5. **CI** — Godot **not** required in CI; `engines/` is outside pnpm workspace. Optional job later.
6. **Binary size / shipping** — exporting a Godot sidecar per OS increases installer size significantly vs three-vrm in-renderer.
7. **Licensing** — godot-vrm MIT (vendored); keep `THIRD_PARTY_NOTICES` updated; sample VRMs remain CC0/upstream licenses via model catalog.

## Recommendation

**Keep three-vrm as production renderer for now.** The Godot path is viable for VRM0+VRM1 and spring bones, and the control surface is small enough to grow into a sidecar — but embedding, motion parity, and real-GPU FPS still need a second spike before replacing the Electron canvas.

## Screenshots

See `/workspace/screenshots/godot-spike/` (idle Shibu/Shapell, wave, three-vrm counterparts, contact sheet).
