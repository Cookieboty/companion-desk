# New AI art requests (r4 proportion pass)

Everything below is OPTIONAL polish: the r4 scene already uses the existing three images
(gen-arm-hang.jpg, gen-arm-wave-bent.jpg; gen-arm-cheer-up.jpg is no longer used) re-fitted to the canvas rig's proportions.
These two images would remove the last two art-level mismatches. Save as `gen-src/gen-arm-hang-v2.jpg` and
`gen-src/gen-arm-bent-v2.jpg`; the builder only needs the same chroma-key + joint-marking step (make_ai_parts.py) to swap them in.

Common to both images
- Reference images to attach: the official half-body (`official/` halfbody draft with jacket) AND the current r3/r4 render crop
  of the arm to replace (so the sleeve/skin/line style carries over).
- Output: 1280x720, flat pure green #00FF00 background, no shadow on the background, no text, no watermark.
- Style lock: same anime line art / cel shading / palette as the official Nomi half-body (white-cream jacket, orange #F28A2E-style lining,
  soft grey fold shadows, thin dark-brown outlines). Skin = official hand skin tone.
- ONE arm per image: the arm of the character's LEFT side = screen-RIGHT side (the mirror for the other arm is done in code). Do not draw
  the torso, the hair, the badge or the face, only the sleeve + hand. Sleeve top is open/cut flat (it is hidden under the jacket body).
- CHIBI PROPORTIONS (the key point): the character's head is ~330 units tall and ~190 wide. The arm must be SHORT and SOFT:
  hand (fingertip to wrist) = 0.43x head height, hand width ~0.5x face width, forearm only ~1.4x the hand length,
  upper arm ~0.65x the forearm. Sleeve is baggy and wide: sleeve width at the cuff ~ 0.38x head height, no thin stick arms,
  no long limbs. Hand is NOT tiny: palm is clearly wider than the wrist.

## Request A - rest arm with the OFFICIAL cuff  (gen-arm-hang-v2.jpg)
Prompt:
"Anime game-character asset on a flat pure #00FF00 green background, 1280x720. A single relaxed arm hanging straight down, seen from the
front, belonging to the girl in the reference (white-cream oversized hooded jacket with orange inner lining). The arm fills the image
height vertically, centred. Short chibi-proportion arm: wide baggy white sleeve with soft grey fold shadows and thin brown outline,
gathered at the wrist into the OFFICIAL cuff from the reference jacket: a white elastic under-cuff band with an ORANGE lining visible at
the cuff edge, plus the jacket's thin black strap with a small buckle wrapped once around the sleeve just above the cuff (same strap
design as the reference), NOT a thick black wristband. Below the cuff a relaxed small hand with slightly curled fingers, palm toward the
thigh, official skin tone, hand length only 0.43 of the head height of the character in the reference, hand width about half the face width.
The sleeve is cut flat at the top (shoulder end), no shoulder or torso. No orange stripe on the outer sleeve edge. Flat colour, clean
line art, no background shading, no text."

## Request B - bent-elbow cheer / wave arm  (gen-arm-bent-v2.jpg)
Prompt:
"Anime game-character asset on a flat pure #00FF00 green background, 1280x720. A single arm of the girl in the reference, cheering, bent
at the elbow about 100 degrees: the upper arm goes out to the side and slightly down from the cut shoulder end at the lower left of the
image, the elbow is at the lower middle, and the forearm points straight UP with an open hand raised beside the head, palm facing the
viewer, five fingers slightly spread, thumb toward the inside (the head side). Chibi proportions: upper arm short (about 0.4x head
height), forearm about 0.6x head height from elbow to wrist, hand about 0.43x head height long and half the face width wide. Baggy white-cream
jacket sleeve with grey fold shadows and thin brown outline; the sleeve ends in the OFFICIAL cuff from the reference jacket (white
elastic under-cuff with ORANGE lining at the edge, thin black strap with small buckle above it), then the skin-tone hand. The sleeve
should be cylindrical with only a mild bulge at the elbow (the bulge must not hang more than half a sleeve width below the elbow point).
Cut flat at the shoulder end, no torso, no hair, no face, no badge. Flat colour, clean line art, no background shading, no text."
