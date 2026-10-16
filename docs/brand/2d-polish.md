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

## Known flaws

- Hand cannot reach chin or cheek with the current arm mesh and art; needs a new forearm/hand cut.
- Brows and lids are vector strokes and eye states; no new face art was cut.
- Shoulders of the body art are still ragged.
