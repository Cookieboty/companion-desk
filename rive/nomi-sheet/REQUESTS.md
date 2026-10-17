# Nomi sheet re-decomposition: AI art requests (for the parent to generate with GenerateImage)

Source of truth: `rive/nomi-sheet/nomi-layer-sheet.png` (1024x1536, layered parts + front/side/back + 10 expressions + eye/mouth detail)
and `rive/nomi-sheet/nomi-character-sheet.png` (1536x1024, hero pose, detail close-ups, 9 expressions, other elements, palette).
Measured proportions (see `docs/brand/nomi-sheet-decomposition.md`): head crown->chin = 1.00 H; shoulder width (bare shoulder tips) 1.11 H;
shoulder-joint -> wrist 1.79 H (upper arm ~0.89 H, forearm ~0.88 H); hand (wrist -> fingertip) ~0.30 H; hair width 1.26 H; whole figure 6.1 H
(crown to sole, hair volume included). REAL slim proportions, NOT chibi. Keep every brand detail exactly as on the sheets: hairclip with white N logo
(screen-right of the bangs in the front view = character's left), orange ribbon bow beside it (also screen-right) with trailing tails, small orange double-bar hair pin on the screen-left, black choker with silver ring and orange star pendant, black tank with white N logo + small orange star, white-cream oversized jacket with orange
lining/hood, black straps with buckles, black belt with silver buckle, name badge "Nomi" with N logo, thigh strap with star buckle, orange hanging straps with X marks.

## Reference images to attach to EVERY request
1. `rive/nomi-sheet/nomi-layer-sheet.png`  2. `rive/nomi-sheet/nomi-character-sheet.png`
3. `rive/nomi-sheet/crops/layer-front-hipup@4x.jpg` (front A-pose hip-up, upscaled)  4. `rive/nomi-sheet/crops/char-detail-face@4x.png`
plus the request-specific crops named below (all in `rive/nomi-sheet/crops/`, upscaled with Real-ESRGAN x4 anime; originals `@1x.png`).

Global generation rules: flat pure #00FF00 background, no shadow on the background, no text/watermark, 1280x720 landscape unless said otherwise (the image
tool has produced 1280x720 so far; larger is better if available), same anime cel-shading / outline weight / palette as the sheet, front-facing, character's
own left = screen-right. Do not add or remove accessories. Colours: orange #F58A3C-ish, skin #FDE3D3-ish, near-black brown #2B1F1B, white-cream #FBF3EE.

---
## (i) Front-view upper body, rig-friendly A-pose  ->  `gen-src/front-apose-hipup.png`
Refs: sheet 1, sheet 2, `layer-front-hipup@4x.jpg`, `char-hero-front34@4x.jpg`, `layer-expr-01-default@4x.png`.
Prompt:
"Using the attached Nomi character sheets as strict reference, redraw the character from the FRONT, orthographic-style, upper body from the top of the hair
down to the hem of the black shorts (hip-up), centred, filling the image height (1280x720 landscape: the figure about 640 px wide x 700 px tall). Both arms
hang down and slightly AWAY from the body in a relaxed A-pose (about 15 degrees from the torso), hands open, relaxed, palms toward the thighs, fingers slightly apart,
so that no arm overlaps the torso or the jacket front. Neutral default expression (soft closed-mouth smile, eyes looking at the viewer), head upright, no hand touching the cheek.
Real slim proportions exactly like the sheet: head height 1 unit, shoulder width 1.1 units, shoulder-to-wrist 1.8 units, hand 0.3 units. Off-shoulder white-cream jacket with orange lining and hood
draped on the shoulders, black tank top with N logo, belt, orange X straps hanging from the jacket, cuffs with black straps and buckles, name badge and side bag exactly as on the sheet,
hairclip with N logo, orange hair ribbon, choker with star pendant. Flat pure #00FF00 background, no floor, no shadow, no text."

## (ii) Arm parts matching the sheet's real proportions
### (ii-a) Hanging arm (screen-right = character's left) -> `gen-src/arm-hang-real.png`
Refs: sheets, `parts-4x/forearm-l.png`, `parts-4x/forearm-r.png`, `parts-4x/hand-l.png`, `char-detail-jacket@4x.png`.
Prompt:
"One single arm of the Nomi character from the attached sheets, seen from the front, hanging straight down with a 10 degree outward lean, on a flat pure #00FF00 background,
1280x720 landscape with the arm vertical in the middle filling at least 640 px of the height. REAL slim proportions: from the cut shoulder end to the wrist is 1.8 head heights, wrist to
fingertip 0.3 head heights (head height = 168 units; so shoulder-to-wrist 300 units, hand 50 units, forearm width at the wrist 28 units, upper-arm width 45 units, jacket sleeve width 70 units).
The arm is dressed in the oversized white-cream jacket sleeve with orange lining, black strap with silver buckle around the upper arm, orange X strap hanging beside it, soft grey fold
shadows, thin brown outlines, ending in the official cuff: ribbed white under-cuff with orange lining visible at its edge and a black strap with buckle. Below the cuff a slim relaxed open hand, fingers slightly
apart, palm facing inward, fingertips pointing down. Cut the sleeve FLAT at the shoulder end (it is hidden under the jacket body). Also draw, in the same image on the right half,
the same arm WITHOUT the jacket sleeve (bare slim arm: upper arm, elbow, forearm, wrist, hand, same skin tone, same length) hanging at the same pose, so the hidden arm underneath the sleeve exists. No torso, no hair."
### (ii-b) Bent-elbow raised arm -> `gen-src/arm-bent-real.png`
Prompt:
"The same single arm of the Nomi character (screen-right = character's left), raised and bent at the elbow about 100 degrees for a cheer/wave: upper arm goes out to the side and slightly down
from the cut shoulder end at the lower left, elbow at the lower middle, forearm points UP with an open hand raised, palm to the viewer, five fingers slightly spread. Real slim proportions:
upper arm 150 units, forearm 147 units (elbow to wrist), hand 50 units, forearm width at the wrist 28 units, jacket sleeve width 70 units at the elbow, tapering to the cuff (head height = 168 units).
Oversized white-cream jacket sleeve with orange lining, a black strap with buckle on the upper arm, official cuff (ribbed white under-cuff, orange lining at the edge, black strap with buckle), slim skin-tone hand.
Cut flat at the shoulder end. Flat pure #00FF00 background, 1280x720. Also add the bare arm (no jacket sleeve) in the same pose on the right half of the image."

## (iii) Hand set -> `gen-src/hands-set.png`
Refs: sheets, `parts-4x/hand-l.png`, `parts-4x/hand-r.png`, `char-detail-face@4x.png` (the hand touching the cheek).
Prompt:
"A hand reference set for the Nomi character on a flat pure #00FF00 background, 1280x720, 4 columns x 2 rows, each cell the RIGHT hand (character's right = screen-left) shown from the wrist (include 15 units of bare forearm cut flat)
with real slim anime proportions (hand length = 0.3 of the head height, i.e. about 50 units at head height 168; scale each cell so the hand is 300 px long): (1) relaxed hanging, fingertips down, slightly curled; (2) open palm facing the viewer,
fingers spread (wave); (3) open palm facing inward, fingers together, slightly bent; (4) loose fist; (5) index finger raised (pointing); (6) peace sign; (7) hand against the cheek, fingers curled under the jaw (as on the character sheet hero pose); (8) thumbs-up. Same skin tone and outline weight as the sheet,
nails barely visible, no jewellery. Separate cells, no overlap, no text."

## (iv) Hair-back layer without the head -> `gen-src/hair-back.png`
Refs: sheets, `parts-4x/hair-back.png`, `parts-4x/hair-side-l.png`, `parts-4x/hair-side-r.png`, `layer-back@4x.jpg`, `char-other-hair-structure@4x.png`.
Prompt:
"The hair of the Nomi character seen from the FRONT but ONLY the hair that is behind the head and neck: the back mass of the short wavy brown bob with orange under-tips and the two orange ribbon tails, the part that
is hidden behind the face and neck on the sheet completed (so it can be moved behind a separate face layer). No face, no head, no neck, no ears, no bangs, no hairclip; the middle is simply the hair continuing behind where the head would be, drawn
as a solid shape with a smooth inner edge, the outer silhouette and the orange tips exactly as the sheet. Centred, 1280x720, hair width about 640 px, flat pure #00FF00 background. Second image on the same canvas to the right: the front hair pieces only
(bangs with the N hairclip and the side locks) as separate hair-only layers with transparent-looking holes where the face shows (filled with #00FF00)."

## (v) Torso + jacket WITHOUT arms (body-noarm) with completed underarm -> `gen-src/body-noarm.png`
Refs: sheets, `layer-front-hipup@4x.jpg`, `parts-4x/torso.png`, `parts-4x/jacket-l.png`, `parts-4x/jacket-r.png`, `parts-4x/jacket-back.png`, `parts-4x/shorts.png`, `char-detail-jacket@4x.png`, `char-detail-belt-badge@4x.png`.
Prompt:
"The Nomi character from the FRONT, upper body from the collarbone/neck down to the hem of the shorts, WITHOUT ARMS AND WITHOUT HEAD: bare shoulder stumps are NOT drawn; instead the torso (black tank with N logo, belt, badge, side bag strap,
shorts, hanging orange X straps) and the open off-shoulder jacket body (orange hood draped around the neck, inner orange lining, front jacket panels left and right) are complete, the armholes completed with plausible jacket-interior lining and the
black tank armholes, the underarm and side torso fully drawn where the arms normally cover them, the shoulder caps of the jacket drawn as a clean rounded edge where the sleeves attach. Strict proportions of the sheet (shoulder width 1.1 head heights, torso crown-free: neck base to belt 0.88 head heights, with head height = 168 units; render so the shoulder width is about 400 px).
Centred, 1280x720, flat pure #00FF00 background, no text."

## (vi) Nine (ten) expressions on the same face -> `gen-src/expressions.png`
Refs: sheets, `layer-expr-01..10@4x.png`, `char-expr-1..9@4x.png`, `layer-eye-open/closed/pupil@4x.png`, `layer-mouth-open/smile/pout@4x.png`, `parts-4x/face.png`.
Prompt (run once per row if the tool needs fewer cells):
"Ten expression variants of the Nomi character's FACE ONLY on one canvas 1280x720, 5 columns x 2 rows, flat pure #00FF00 background, identical head position, identical face shape and skin, identical size (face 220 px wide), straight-on, NO hair (bald head, so only
the face is changing), no hairclip, no neck. Each cell shows: eyes (with brows) and mouth only differing: (1) default - eyes open looking at viewer, soft closed smile; (2) happy - open smiling mouth, eyes bright arcs; (3) squint - one eye winking/narrowed, small smile;
(4) surprised - eyes wide, small round open mouth, brows raised; (5) angry - brows slanted down, eyes narrowed, small frown; (6) sad - brows slanted up inward, glossy eyes, small frown; (7) shy - blush on cheeks, eyes looking aside, small wavy mouth;
(8) confused - one brow up, tilted small mouth; (9) thinking - eyes looking up-aside, closed small mouth; (10) eyes closed - closed peaceful eyes with lashes, soft smile. Keep the exact eye style of the sheet (large orange iris with double highlight, dark upper lash line with small lash flicks), cheeks blushed as on the sheet.
Also output, on a second canvas, the eye parts alone (left eye open, right eye open, left eye closed, right eye closed, pupil/iris layer alone, upper lid layer alone) at 4x the face scale for blink/gaze rigging."
