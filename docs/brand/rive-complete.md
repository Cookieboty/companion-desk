# Rive "complete parts" prototype (arm gestures)

Branch `feat/mascot-rive-complete-parts` (from `feat/mascot-rive-eval`). Everything here is **experimental and not
wired into the app**: the app CSP blocks wasm, so the Rive runtime only runs in the standalone page below.
The canvas rig on `feat/mascot-2d-layers` was only read, never modified.

## What was built

* `rive/nomi-complete/` – Rive project (RML source, `scene.rml` is generated). Build: `python3 scripts/rive-complete/build-complete.py && rive rive/nomi-complete --once`
  (the `.riv` is git-ignored like every `build/`).
* Per arm: a **raster mesh** (312 vertices, `Image` + `Mesh` + `Skin` + 3 `Tendon`s) weighted to three bones
  (shoulder / elbow / wrist; smooth weights over ~110 px at the elbow). The arm texture is a *completed straight sleeve*
  (hidden armpit/flank side filled, elbow tube, official cuff + strap + lining) drawn **behind** `body-noarm`.
* Hands: official hand layers (rest / wave / fist), cropped above their own plain cuff and parented to the wrist bone.
  Raised hands are drawn in a front layer (above head/hair) so a hand crossing the face is not hidden by the hair.
* Breathing, head sway, hair/ribbon/badge/strap sway as idle loops; `wave` (screen-right arm = the character's LEFT) and `cheer` (both arms) as one-shot animations driven by view-model triggers.
* Left/right: rig `r` = screen-right = the character's LEFT arm. Never swapped (wave uses `r`; verified on the web page).
* Poses are not hand-keyed: `scripts/rive-complete/harness/dump-params.js` samples the canvas rig's own wave/celebrate
  tracks (angles, z, hand anchor position) and `ik_arm()` solves a 2-link IK per frame so the **wrist lands where the canvas
  rig's hand lands at the same timestamp**. Same timing, same gesture, different renderer.

### Why independent root bones (honest engineering note)
A nested bone chain with the foreshortening `scaleX` on the parent shears the rotated child (Rive has no skew), which
visibly tore the sleeve in the first build. The three bones are therefore three `RootBone`s per arm whose positions and
angles are keyed from the FK solution. Consequence: the skeleton is **baked, not live-drivable** (no runtime IK / look-at
without re-solving in JS). A live nested chain is possible only with uniform scale (thin arm when foreshortened).

## Standalone test page + frame rate

```
rive rive/nomi-complete --once
node scripts/rive-complete/web/serve.mjs      # http://localhost:8123/  (wave / cheer buttons, fps HUD)
node scripts/rive-complete/web/perf.mjs <rive|canvas> <wave|cheer|both> <cpuThrottle> [secs]
```

Headless Chromium (software GL / swiftshader, no real GPU), 480x560 canvas, wave+cheer retriggered every 2.8 s,
`Emulation.setCPUThrottlingRate`. fps = `requestAnimationFrame` rate, capped at 60 by the display clock.

| renderer | CPU throttle | fps (wave+cheer) | main-thread ms / frame |
|---|---|---|---|
| Rive canvas-lite 2.44.2 (wasm) | 1x | 60.0 | 0.8 |
| Rive | 4x | 59.9 – 60.1 | 2.6 – 2.7 |
| Rive | 6x | 60.0 | 3.6 |
| canvas rig (polish 00b358b) | 1x | 53.9 | 3.0 |
| canvas rig | 4x | 40.4 (both) / 54.4 wave / 48.6 cheer (separate runs) | 6.8 – 10.4 |
| canvas rig | 6x | 40.4 | 14.1 |

Raw lines: `perf.jsonl`, `perf-per-action-4x.jsonl`. Caveats: software GL, one machine; the canvas-rig numbers vary
±10 fps between runs, the per-frame main-thread cost is the stable comparison (Rive ≈ 3–4x cheaper). Rive also
still needs `wasm-unsafe-eval` in the CSP (maintainer decision, untouched) and ships a 0.77 MB wasm + 0.49 MB js
(MIT) plus the 1.7 MB `.riv`.

## Comparison media

`docs/brand/rive-complete/{wave,cheer}-canvas-vs-rive.png` (contact sheets, 6 timestamps, canvas rig left / Rive right).
Full side-by-side GIFs (≈9 MB each, not committed): `/workspace/screenshots/nomi-rive-complete/gif/`.

## Per-asset generation notes (read this before trusting the word "generated")

**No image-generation model was available to this run.** "Completion" is therefore (a) mined official pixels,
(b) a local LaMa ONNX inpainting experiment that was *rejected*, and (c) procedural tone/reflection fill. No AI-drawn
brand detail exists in any asset.

| asset | source | how completed | brand-critical? / lock |
|---|---|---|---|
| head, hair, bangs, eyes, mouth, clip, ribbon, earring, strap, badge, body-noarm, body-flank-l/r (35 layers) | official layers copied verbatim from polish `00b358b` | none | yes – sha256 checked against `parts.json` (`brand-check.py`) |
| arm sleeve `arm-{l,r}-complete.png` | official arm layer + official draft jpg (x2 mapping) below the rig's fade, resampled to a straight frame | hidden armpit/side + elbow tube filled by reflected soft shading + sampled cloth tone, clipped to body footprint; outline restricted to the eroded footprint | jacket / cuff / strap / lining are official pixels; fill = 17% (l) / 12% (r) of the texture. `final = official OVER fill`, max pixel delta over official pixels = 1/255 (rounding) |
| cuff + strap + buckle + orange lining | official draft jpg (y >= 975, below the rig crop) | none (cut, flattened) | official |
| hands (rest / wave / fist) | official hand layers | cropped above their plain cuff, scaled to the wrist width | official |
| LaMa inpaint (`lama.py --lama`) | Big-LaMa ONNX, local | tested on the armpit/seam | **rejected**: bleaches/whitens the cloth seam; code path kept, off by default |

Other assets reviewed, **not** used as pixel sources: `nomi-ref/drift-test-wave.jpg` / `drift-test-think.jpg`
(style drift: tan skin, crop top, different clip → brand-lock violation), `nomi-ref/fullbody.png` (hand-to-cheek pose,
used only as visual reference for how the sleeve bunches), `user-halfbody-hd.png` / `closeup.png` (face close-ups;
reference for hairclip / N logo geometry only), and the existing 2D polish arm pieces (used where they were the official source).

## Remaining flaws (honest list)

1. **Shoulder cap**: with the arm raised the jacket shoulder/collar edge is a hard, slightly jagged cut with a dark
   wedge where body-noarm ends (visible in cheer 0.7–1.9 s). Needs a real drawn shoulder gusset.
2. **Pale diagonal seam** at the collar at rest (small), from where official layer and draft cut meet.
3. **Arms are longer than the canvas chibi arms** (they follow the draft). Raised poses needed IK targets,
   foreshortening 0.7 (upper) / 0.8 (fore), and clamping the hand's x so it does not cover the face. At rest the hands sit
   below the canvas rig's 1120 px crop (artboard is 1300 px tall).
4. Bottom vignette: body fades out at y≈880 while the sleeve continues to the cuff (also true of the draft) → the sleeve's
   inner edge is a hard vertical cut there.
5. **Face states are not ported** (laughing eyes/mouth, sparkles of `celebrate`); this prototype only covers arms/body/head sway.
6. Bunched foreshortened forearm (z ≈ 0.85) looks plausible but is a squash of the cuff region, not redrawn folds.
7. Wave/cheer are baked animations; no runtime parameter drive (gaze, lip-sync) without re-solving.

## Verdict

* For **arm gestures** this route is clearly better than the current canvas rig on *visual quality of the sleeve and
  elbow* (continuous sleeve, no patches, real elbow bend, no armpit hole except the shoulder cap flaw) and on
  *performance* (≈3–4x less main-thread time, 60 fps at 6x throttle vs 40–54 at 4x). It is **not** a clean win overall:
  the hidden-area completion here is procedural, so large gestures (arms-up) still show the shoulder cap flaw, and the
  runtime is blocked by the CSP.
* Full migration cost (rough): port face/eyes/mouth/expressions/particles (~3–5 d), re-express ~20 actions as baked tracks
  via the same pipeline (~3–4 d), replace the shoulder gusset with a properly drawn/generated + human-reviewed asset
  (needs an image generator + art review, 2–3 d), runtime/state-machine bridge to the existing action manager & lip-sync
  (~3 d), CSP `wasm-unsafe-eval` decision + packaging (~1 d), QA/brand review (~2 d): **≈ 3 person-weeks**.
