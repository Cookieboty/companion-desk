# Nomi 2D polish (layered rig + shared parts manifest + Rive comparison)

## Layers

- `hair-tail-l.png` / `hair-tail-r.png`: HD hair tails cut from the official head art and drawn **behind** the head (replace the old `hair-side-*` layers whose tips shattered).
- `body.png` / `body-noarm.png` / `head.png`: neck column cleaned, no pads or tabs beside the neck.
- `parts.json`: every layer with placement, pivots/joints (`SPINE_BELT`, `SPINE_CHEST`, arm and tail roots) and sha256. Both the canvas rig and the Rive builder read it.
  `node scripts/brand/build-nomi-parts-manifest.mjs [--check]`; guarded by `tests/mascot/partsManifest.test.ts`.
- Brand art (face, clip, N logo, badge, jacket, band, choker) is pixel-cut from the official art and never redrawn. `update-brand-lock.mjs --check` stays green.

## Canvas rig additions

- Waist bend (`spine` param): strip-chain warp between belt and chest, active only when `|spine|` exceeds a threshold, so idle cost is unchanged. Per-frame rigidity checks in `brandLock.test.ts` still apply (including the hair-tail strips).
- `tailL` / `tailR` params with a two-stage spring chain, plus head lag.
- 13 new actions with anticipation, overshoot and follow-through (see `docs/features/mascot.md`).

## Rive comparison (not adopted)

Same layers, real bones and meshes (torso 704 verts, arms 630, 3-bone tail meshes).

```
node scripts/brand/build-nomi-parts-manifest.mjs
python3 scripts/rive-eval/build-nomi-rive.py     # writes rive/nomi-layered (git-ignored)
rive rive/nomi-layered --once                    # verify, Rive CLI 1.6.0 (needs libegl1 libgles2)
python3 scripts/rive-eval/compare.py OUT_DIR     # canvas-over-Rive frame strips
python3 scripts/rive-eval/gif.py OUT_DIR         # animated side-by-side GIFs
```

Findings: wave and happy_bounce are about equal. Cross-body arm poses (hair, chin, collar) need per-action gain tuning in Rive and land less accurately than the canvas rig, which has foreshortening and front/back arm ordering. The Rive scene has no brows, blush or FX, and secondary motion is baked from the same spring numbers because Rive has no physics.

## Arm chain (two bones, IK poses)

Side naming: the rig's `r` arm is the **screen-right** arm = the character's **left** arm; `l` is screen-left = the character's **right** arm. `parts.json` `arms.<side>.character` says so, and the frame strips / GIFs carry `R (char's right)` and `L (char's left)` labels.

- `rig/armKin.ts` is the pure kinematics (no canvas). One sleeve spine bends at the shoulder (stump stays seated on the torso) and at the elbow (bend length grows with flexion, so a folded elbow gets a round cloth fold instead of a crease), with a hand frame at the end. Joints `a` (shoulder), `e` (elbow, ±175°), `w` (wrist, ±45°) and `z` (reach toward the camera: shortens the upper arm more than the forearm). Positive `a / e / w` means outward / up for both arms, so a mirrored pose has the same numbers.
- `meshArm.ts` draws the master sleeve through that chain; `armReach.ts` solves the same chain backwards (grid + Newton, with joint hints), so a hand target is exactly where the hand piece is drawn. `armTargets.ts` names 30 hand targets on landmarks of the drawn character (chin, cheek, temple, hair, mouth, heart, ...); `scripts/mascot/gen-arm-poses.mjs` solves them (screen-right arm, then the mirrored target for the other with `near`) into `armPoses.generated.ts`, so the runtime has no solver cost. `tests/mascot/armReach.test.ts` re-solves them and fails when the table is stale or a hand misses its landmark.
- Hand pieces: one palm-normalised scale (`HAND_BASE * k`) and one cuff width for every shape (`manifest.json rig.hands`: `side`, `k`, `cx`, `cy`; `scripts/brand/build-nomi-hand-fit.mjs`). `side` is the native chirality of the art (L / R / S symmetric). A piece is mirrored iff it depicts the other hand than the arm it sits on (`handFlips`), and the test suite checks the rule, the canvas x scale sign and the table against the manifest and `parts.json`.
- Upper arm / forearm pieces: `layers/arms/arm-{r,l}-{upper,fore}.png` are straight pixel cuts of the official sleeve layers at the elbow (`scripts/brand/build-nomi-arm-pieces.py`, `--check` for freshness); upper + forearm composite back to the master exactly. The canvas rig keeps meshing the master sleeve (one continuous cloth surface, no seam to tear); the pieces and the elbow joint are in `parts.json` for the Rive builder.
- Actions (`rig/actions.ts` `arm()`): each joint has its own key list, staggered (elbow folds first, wrist trails), a small anticipation dip (the shoulder swings in across the body while the elbow folds so the forearm never sweeps out of the canvas), overshoot, and a staggered return. Hand mix `rMix / lMix` and reach `rZ / lZ` are keyed continuous params, so nothing swaps at a threshold. `ActionManager` crossfades arm params by weight (no held pose at fade-out).

## Known flaws

- The unposed sleeve (mesh at rest) differs from the master art by about one pixel along the outline, so the first and last frame of an arm action show a one-frame edge shift (mean frame difference about 1.5 against 6-9 before).
- Folded poses (`e` beyond about 150°) show a big round cloth loop at the elbow; low hand-at-hip poses are not reachable because the upper arm is long.
- `pray` crosses the sleeves low over the belly (elbows hang), and `clap` shows a grey smudge at the waist where the forearms cross during the return.
- Chirality of `fist`, `thumbsup`, `point` and `rest` was decided by eye from the art (right-hand views); a wrong call is a one-word change in `HAND_FIT` plus `build-nomi-hand-fit.mjs`.
- Per-side front/back ordering is a single `armFront` flag (both arms before / after the head); one-armed face poses put the idle arm in front as well.
- Brows and lids are vector strokes and eye states; no new face art was cut.
- Shoulders of the body art are still ragged.
- The Rive scene was not rebuilt for the new arm chain.
