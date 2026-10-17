# Nomi·诺米 sheet decomposition (first deliverable, 2026-10-17)

Sources (both in `rive/nomi-sheet/`):
* `nomi-layer-sheet.png` **1024x1536 - PRIMARY**. "分层素材 (透明背景)": 34 cut-out parts, a large front A-pose figure (arms hang slightly away from the body), side and back figures, 10 expression tiles, 6 eye/mouth detail tiles, palette.
* `nomi-character-sheet.png` 1536x1024: hero 3/4 pose (left hand on cheek), side, back, 165 cm silhouette, 9 detail close-ups, 9 expression tiles, other elements, palette.

**Both files are flat RGB (alpha = 255 everywhere).** The "transparent background" is a baked-in light checkerboard, so every part has to be keyed (done, see below).
All pixel numbers are sheet pixels at 1x unless marked. Landmarks were read from gridded zooms (`/workspace/screenshots/nomi-rive-sheet/L-*.png`, `M-head.png`) and are accurate to about +-4 px (+-0.025 H).

## 1. Proportions (head units)

H = crown (hair top) -> chin of the front A-pose figure on the layer sheet = **168 px** (y 123 -> 291).
(Counting from the chin the body is 5.07 H below the head, and the head without hair volume is shorter than 168 px, so people will say "7 heads"; with the hair volume included the figure is **6.07 H** tall.)

| measure (front A-pose, layer sheet) | px | head units (H=168) |
|---|---|---|
| figure, crown -> sole | 1020 (y 123 -> 1143) | **6.07** |
| hair width incl. ribbon | 211 | 1.26 |
| face width (cheek to cheek) | 92 | 0.55 |
| eye line below crown | 111 | 0.66 |
| bare shoulder width (skin, y 330 -> 345) | 159-186 | **0.95-1.11** (use 1.05) |
| jacket width at y 400 / 500 / 640 | 232 / 277 / 284 | 1.38 / 1.65 / 1.69 |
| shoulder line (y 335) -> belt (y 482) | 147 | 0.88 |
| belt -> hem of shorts (y 641) | 159 | 0.95 |
| crown -> hem of shorts (the "waist-up" crop used by the app: crown -> belt is 359 px = 2.14 H) | 518 | 3.08 |
| shoulder joint -> elbow (upper arm) | 149 | **0.89** |
| elbow -> wrist (cuff centre, y 641) (forearm) | 145 | **0.86** |
| shoulder joint -> wrist | 294 | **1.75** |
| wrist -> fingertip (hand) | 57 | **0.34** |
| whole arm incl. hand | 351 | **2.09** |
| fingertips reach down to (crown ->) | 575 | 3.42 (about crotch level) |
| hem of shorts -> sole (legs) | 502 | 2.99 |
| side figure / back figure scale vs front | 0.52 / 0.46 | head only ~89 / 77 px tall |

Compared with the earlier Rive attempts (canvas rig, H = 330 rig px there): shoulder width 1.07 H (matches the sheet's 1.05), but rest arm length shoulder -> cuff **1.42 H vs 1.75 H on the sheet (arms were ~19 % too short)** and hand **0.45 H vs 0.34 H (hands ~30 % too big)**.
The "official draft" arm measured earlier (2.23 H to the cuff) is the other way round, i.e. neither earlier source matches the sheet. The sheet is the reference now.
The hero pose on the character sheet is a 3/4 view (and foreshortened) - do not measure arms on it; use the A-pose figure.

### Parts panel is not drawn at one scale
Part heights relative to the same feature on the front figure: hair parts ~0.5-0.7, bald face ~0.85, torso ~0.67, shorts ~0.72, hands ~1.5 (the hand parts are drawn larger than the hands on the figure: 43x88 vs about 45x57 px).
An automatic masked template-matching registration was tried and **rejected** (it returned high scores at the lower scale bound, i.e. unreliable), so each part must be registered by hand/landmarks when it is placed.

## 2. Resolution (what the sheet can really give)
App display target = the existing desktop-mascot artboard: head ~330 px tall, i.e. **1.96x of the front figure** (168 -> 330).

| source | native px | upscale needed to display |
|---|---|---|
| front figure, whole head (hair+face) | 211 x 168 | 1.96x |
| front figure, eye | ~40 x 26 | 1.96x (lashes are 1 px lines) |
| front figure, mouth (lips) | ~22 x 9 | 1.96x |
| front figure, hand | ~45 x 57 | 1.96x |
| front figure, jacket sleeve (fore) | ~85 x 140 | 1.96x |
| parts panel, hair-back / hair-front | 104 x 116 each | ~3-4x |
| parts panel, face (bald) | 82 x 116 | ~2.3x |
| parts panel, forearm-l / forearm-r | 42 x 101 / 67 x 101 | ~4x |
| parts panel, hand-l / hand-r | 43 x 88 / 43 x 100 | ~2.5x |
| parts panel, torso / shorts | 100 x 143 / 116 x 101 | ~3x |
| expression tiles (layer sheet) | 86 x 86 tile, face ~60 px wide | 3-4x |
| expression tiles (character sheet) | 120 x 138 tile | 2.5-3x |
| eye / mouth detail tiles | ~95 x 74 | 2-3x (these are the only sources with real eye detail) |
| side / back views | head 89 / 77 px | useful only for hidden-area *shape*, not texture |

**Upscaler used: Real-ESRGAN `RealESRGAN_x4plus_anime_6B`** (ONNX, CPU through onnxruntime, tiled 96 px + 10 px pad; model sha256 `2648cab4...b7f7` from deepghs/imgutils-models). Compared with Lanczos4 + unsharp (`crops/compare-face-lanczos4x.png` vs `compare-face-esrgan4x.png`) ESRGAN is clearly crisper on lines, but it (a) turns the background pure white, (b) over-saturates orange, (c) invents fine detail (hair strand ends, the N logo's inner edge). So the 4x crops are good *working art for layout and for AI reference*, not a brand-exact final. Script: `scripts/rive-sheet/upscale.py` (reproducible).
Honest consequence: at the app's display size the **front figure at 1.96x via ESRGAN looks acceptable for hair, jacket, torso and shorts (large shapes) but eyes, mouths, hands and the N logo / badge text will be soft or hallucinated**; the 10 expression tiles are too small to rebuild expressions from. Eyes, mouths, hands and the sleeves/arms need regenerated art (REQUESTS.md).

## 3. Keying the parts panel
`scripts/rive-sheet/parts_cut.py`: background = light unsaturated pixels (checker greys/whites); flood fill from each part's bbox border through a 1 px-closed outline; everything not reached is the part (white sleeves survive because their outline encloses them); soft 1 px edge.
34 parts -> `rive/nomi-sheet/parts/*.png` (native), `parts-4x/*.png` (ESRGAN x4 RGB + cubic-upsampled sharpened alpha). Review sheet: `/workspace/screenshots/nomi-rive-sheet/parts-contact-magenta.png`.
Known key flaws: a thin white fringe on hair edges, leftover white specks around the eyes and brow parts, the eye/brow parts are keyed as lids+lashes only, `hair-back` and `hair-front` were one connected blob and are split at x=660 by hand.
Not cut: expression tiles and detail tiles (kept as rectangular upscaled crops in `rive/nomi-sheet/crops/`), side/back/front figures (crops only).

## 4. Layer inventory for the upper-body rig
Legend: **(a)** cuttable from the sheet at its resolution (front figure at 1.96x or panel part), **(b)** needs AI regeneration for crisp display, **(c)** hidden-area completion needed (side/back views help only for shape).

| rig layer | source on layer sheet | (a) | (b) | (c) | note |
|---|---|---|---|---|---|
| hair.back | `hair-back` (104x116) | x | x | x | hidden behind head/neck; back view for the shape; regenerate head-less (REQUESTS iv) |
| hair.front / bangs | `hair-front`, `bangs` | x | | | cut from the front figure (211x168) |
| hair.side.l / .r | `hair-side-l/r` (59x104, 58x102) | x | x | | parts are side views; front figure shows them foreshortened |
| face.base | `face` (82x116) | x | | x | bald face; neck missing |
| neck | **not on the sheet** | | x | x | regenerate or cut from the front figure (hidden by choker/hair partially) |
| eye.l / eye.r (+iris, highlight, lid) | `eye-l`, `eye-r`, tiles `eye-open/closed/pupil` | | x | | 40x26 px on the figure; tiles are 95x74 px with real detail, regenerate set (REQUESTS vi) |
| brow.l / .r | `brow` (one part, mirror) | x | | | 59x39 |
| mouth set (open, smile, pout + 10 expressions) | `mouth`, tiles | | x | | 22x9 px on the figure; tiles 95x70 |
| hairclip N | `hair-acc-2` (34x66, shows clip + pendant) | x | | | N logo must stay exact: cut, do not regenerate |
| ribbon | `hair-acc-1` (75x68) | x | | | + figure for the bow position |
| orange hair pin | none (figure only) | x | | | tiny |
| choker + star pendant | `choker`, `star-pendant` | x | | | pendant needs a pivot (swing) |
| torso.top (tank + N logo) | `torso` (100x143) | x | | x | underarm / side hidden behind arms |
| jacket.body L / R (front panels with orange lining) | `jacket-l`, `jacket-r` (108x145, 95x141) | x | x | x | parts are 3/4 views incl. sleeve; armholes hidden |
| hood / collar (back) | `jacket-back` (128x138) | x | | x | only the draped part shows from the front |
| sleeve.upper L / R (jacket sleeve over upper arm) | inside `jacket-l/r` and the front figure | | x | x | **no separate upper-arm part exists**; bare arm inside the sleeve never drawn |
| sleeve.fore L / R + cuff + strap | `forearm-l/r` (42x101, 67x101) | x | x | | 3/4 views, low-res; cuff = black strap + buckle, no white under-cuff |
| hand L / R | `hand-l/r` | x | x | | one pose only (relaxed); need wave/open/fist etc. |
| belt + accessories, bag, badge | `belt-acc`, `bag`, `badge` (badge scale is ~1.05 of the figure, sharp) | x | | | badge text "Nomi" is small |
| shorts | `shorts` (116x101) | x | | | |
| orange hanging straps / other accessories | `tie-piece`, `other-acc` | x | | | secondary motion |
| legs (thigh, calf, shoe L/R) | `thigh-*`, `calf-*`, `shoe-*` | x | | | outside the waist-up crop; kept for a later full-body option |

## 5. Rig mapping (wireframe scene `rive/nomi-sheet-rig/`)
Artboard 690 x 1218 = front-view crop (sheet x 0..345, y 116..725) at 2x. r = character's RIGHT = screen-LEFT, l = character's LEFT = screen-RIGHT; mirror axis x = 175 sheet px.
Bones (checked by forward kinematics against the markers): `hip(root) > spine > chest > neck > head` and from `chest`: `clavicle-l > upperarm-l > forearm-l > hand-l`, `clavicle-r > upperarm-r > forearm-r > hand-r`.
Joint positions (sheet px): hip (175,600), spine (175,480), chest (175,380), neck base (175,305), head pivot (175,285), crown (175,123); shoulder l/r (252,350)/(98,350), elbow (274,498)/(76,498), wrist (286,641)/(64,641), fingertip (286,698)/(64,698).
Layer -> bone: hair.* / face.* / eyes / brows / mouth / hairclip / ribbon -> `head`; choker, pendant -> `neck` (pendant swing later); torso.top, belt, badge, bag -> `chest`/`hip`; jacket.body + hood -> `chest` (+ secondary); sleeve.upper -> `upperarm-*`; sleeve.fore + cuff -> `forearm-*` (skinned across the elbow); hand -> `hand-*`; shorts, thighs -> `hip`.
34 placeholder layers = real pixel crops of the ESRGAN front view at each layer bbox (they re-compose the figure exactly), outlined per group (hair magenta, accessories orange-blue, face green, body orange, jacket red, arm blue, leg grey); bboxes approximate (+-8 sheet px). Bone/joint markers are static shapes mirroring the bone chain (Rive does not draw bones). No animation yet.

## 6. Files
`rive/nomi-sheet/{parts,parts-4x,crops}/`, `rive/nomi-sheet/REQUESTS.md`, `rive/nomi-sheet-rig/` (scene.rml, assets, layers.json), `scripts/rive-sheet/{parts_cut,upscale,build_wire}.py`. Review images in `/workspace/screenshots/nomi-rive-sheet/` (grids, parts-contact-magenta, compare-upscale-face, wireframe-v1(-annotated), crops-expr-montage).
