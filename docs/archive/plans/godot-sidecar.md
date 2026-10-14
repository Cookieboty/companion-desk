# Godot sidecar — abandoned

**Date:** 2026-10-11  
**Decision:** Keep **Electron + `@pixiv/three-vrm`** as the production mascot renderer.

A minimal Godot 4 + godot-vrm spike was prototyped on `feat/ai-harness-p0`, then **removed**. Reasons:

- Embedding (transparent window, click-through, spawn lifecycle) was unfinished and would dominate effort.
- Motion clips are already three-oriented; parity would need a second animation pipeline.
- Software-GL FPS was inconclusive; shipping a per-OS Godot sidecar adds installer size without clear win.
- Prefer polishing three-vrm (blends, spring bones, look-at, frame pacing) instead.

The spike directories (`engines/godot-stage`, `engines/three-bench`) and vendored addons are gone from the tree. Do not reintroduce without a new explicit decision.
