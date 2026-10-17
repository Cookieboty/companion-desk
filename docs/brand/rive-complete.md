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

## Detail-fix pass (r2) — red-box checklist

Annotated source: user contact sheet with 6 red boxes. Media: `/workspace/screenshots/nomi-rive-complete/r2-detail-fix/`.

**GenerateImage:** the `cursor` MCP namespace / `GenerateImage` tool was **not available** in this executor
(`MCP server "cursor" is not available here`). No AI-generated pixels were produced. Fixes used official-layer
cut/restore, procedural crease/gusset compositing, cuff overlay, denser elbow mesh, and hand tuck.

| Box | Symptom | What we did | Result |
|---|---|---|---|
| 1 cuff↔hand | gap at hanging wrist | hand tuck under cuff; rest hand under mesh | improved at rest (f000); mid-wave still has a thin seam |
| 2 missing hand | stump when arm out | never drop rest until wave opaque; wave fades in earlier; cuff overlay on wrF | hand present on extended frames |
| 3 elbow pinch | jagged fold | denser elbow mesh (408 verts) + crease overlay from official sleeve | partial; still looks squashed without redrawn bent-sleeve art |
| 4 blurry fingers | soft hand | unsharp on official hand-wave; scale *1.12 | visibly crisper |
| 5 shoulder wedge | hard cut | shoulder-gusset-{l,r}-raised from official flank + orange lining sample | wedge reduced on cheer raised frames |
| 6 sleeve holes | white holes | careful connected-component inpaint from official | small interior holes fixed; body-noarm hard silhouette edge remains |

Provenance: `rive/nomi-complete/parts/DETAIL_LICENSE.json` (`ai_generated: false` for every file).

## r3 — AI pose-state arm art (owner-generated), bone-chain skinning

Why: `GenerateImage` was unavailable in r2, so the six red-box flaws were only partly fixed with official cut/restore. The owner then generated
three arm/hand/sleeve images (green #00FF00 bg, 1280×720; `rive/nomi-complete/gen-src/`): `gen-arm-hang` (relaxed sleeve + cuff + hand),
`gen-arm-wave-bent` (bent elbow, crisp open hand), `gen-arm-cheer-up` (arm straight up, crisp hand). Rig `r` = screen-right = the character's
LEFT arm (never swapped); the screen-left arm is the cv2 mirror of the art, joints mirrored.

Pipeline (`python3 scripts/rive-complete/{key_gen,make_ai_parts,build-complete,write_license}.py`, then `rive rive/nomi-complete --verify|--once`, `brand-check.py`):
1. `key_gen.py` — chroma-key (green dominance alpha, despill by clamping g to max(r,b), speck removal), native resolution, **no resampling**.
2. `make_ai_parts.py` — crop to arm/hand/cuff (torso pocket / hood / collar bits of the wave-bent and cheer-up images are cut away, feathered 5 px; leak check = 0 px),
   colour-match to the official arm texture (warm white (250,236,229), orange (240,142,72) from the AI's saturated (228,88,8), warm-black cuff, skin),
   mirror for the left arm, write joint estimates (shoulder S / elbow E / cuff-centre wrist W) to `parts/ai/ai_arms.json`.
3. `build-complete.py` (r2 builder kept as `build-complete-r2.py`) — three art states per arm, each a **skinned mesh bound at its own pose** (grid 30 art-px, ~175–675 vertices):
   `hang` (rest; also replaces the official wrist/cuff/hand and the sleeve with the holes), `bent` (wave, right arm), `up` (cheer, both arms).
   Bones: three independent RootBones per arm (shoulder / elbow / wrist; nested bones sheared the sleeve in r1 because Rive has no skew), keyed from a per-frame 2-link IK
   that hits the canvas rig's own hand anchor. `bone.scaleX` = current link length in px and every state's Tendon bind matrix carries its bind length as a scale, so one bone set drives
   all three meshes. Weights: elbow = smoothstep across the elbow bisector plane (±55 px art), wrist bone owns cuff + hand (rigid, so fingers/buckle never squash), so the
   elbow bend folds the drawn fabric instead of squashing it. Raise amount w (from the canvas hand height) morphs link lengths/reach from the hang art's to the state art's;
   hard switch hang→raised art at w≥0.56 (a cross-fade double-exposed two different hands for 3 frames). Elbow branch: elbow low/out, lifting as the forearm comes up.
   Front copy of the hand+cuff (alpha-masked) is drawn above the head group while raised. A static shoulder cap (top of the hang sleeve, faded lower edge) stays under the jacket
   when the arm is raised. `cheer` uses `up` art with the arms leaning 0.55 rad outward (V), reach fixed to the art's own length (the canvas hands sit beside the head with bent elbows; the straight-arm art cannot reproduce that).
4. `write_license.py` — `parts/DETAIL_LICENSE.json` (`ai_generated: true` for the 3 sources, 3 keyed, 6 state textures, 3 hand-front copies, 2 caps = 17 files) and `rive/nomi-complete/LICENSE`.
5. `brand-check.py` — official layers sha256 (35/35), scene embeds only official layers + `parts/ai/*` (hairclip N logo, badge, jacket body/flanks, head, bangs, crown, hairband, earring, hair tails, strap = official files),
   every AI file listed with `ai_generated:true` + matching sha256, torso-crop leak, colour medians vs official (max channel delta: white ≤6, orange ≤11, skin ≤11). **PASS**.

Style drift handled: the AI cuff is a wide black cuff with a grey buckle and no white under-cuff/orange lining (official: black strap + square buckle + white cuff + orange lining) — kept (the user chose this art; the old official-style cuff overlay is gone),
the AI hang sleeve is narrower than the official draft one (re-scaled ×1.185 to ~172 px width = official), and the AI cheer/bent images contained torso pocket / hood lining which are cropped.

Per red box (media: `docs/brand/rive-complete/r3/`; BEFORE = d1b9b7c, AFTER = r3):
| box | before | after |
|---|---|---|
| 1 cuff↔hand seam | gap / stump | AI hang cuff + hand drawn as one piece, no seam |
| 2 extended arm hand | missing hand / stump | hand present in every frame (hang hand while lowered, bent/up hand when raised) |
| 3 raised elbow | pinched, jagged fold | folded-fabric bent elbow from the AI art, skinned elbow weights |
| 4 raised hand | blurry fingers | crisp AI hand at native res (≤0.68 scale), front copy above hair |
| 5 shoulder/armpit | hard cut, dark wedge | wedge gone; static AI shoulder cap + arm base under the jacket. **Still**: the official `body-noarm` layer's own flat shoulder cut edge is visible in raised poses |
| 6 lower sleeve | white holes | AI sleeve, no holes |

fps (headless Chromium software GL, rive wasm `canvas-lite` 2.44.2): 4× CPU throttle wave 60 / cheer 60 / both 59.9–60 fps, 3.2–3.4 ms main-thread per frame (r2: 2.6); 6× both 60 fps 4.3 ms; 1× 60 fps 0.95 ms.
Canvas rig numbers from earlier turns (4×: 54 / 49 fps) unchanged. `docs/brand/rive-complete/r3/perf-r3.jsonl`.

Honest remaining flaws: (a) rest pose no longer matches the draft arm exactly (AI sleeve is a different drawing, arm ~100 px shorter than the draft rig; official strap/lining details on the sleeve are not reproduced);
(b) one-frame pop when the hang art switches to the raised art; the upper-arm strap piece of the bent art can show as a dark blob mid-swing; (c) cheer arms are straight-up V instead of the canvas's elbows-out hands-at-head pose, and mostly hidden behind the hair in the lower half;
(d) wave elbow-lift path starts with the elbow tucked toward the body (canvas hand path), the folded hang sleeve there is the weakest frame range (f10–f30); (e) body-noarm flat shoulder edge (box 5);
(f) joint positions are hand-estimated from the images, not auto-detected; (g) bone scale is baked (not live-drivable), see r1 notes.
