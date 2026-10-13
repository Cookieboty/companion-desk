# Nomi 3D — feasibility note

Status: **decided (2026-10-13): pseudo-3D layered 2D. Real 3D is deferred.** The bundled VRM (千駄ヶ谷 渋, CC0) stays the 3D option. Nomi as a layered 2D rig is the app-wide default mascot.

## Decision

The owner chose a **pseudo-3D layered 2D** Nomi (a Live2D-like feel without Live2D or a 3D model) over building a VRM now.

- **Source:** the owner-approved clean half-body illustration (front pose, arms down). The official poster is the design reference for face and hair; it is not shipped.
- **Layers** (`packages/renderer/public/assets/models/sprite/nomi/layers/`): body, head, left/right side hair, ribbon, left/right eye, mouth, plus painted variants (closed eyes, happy `^^` eyes, open / `o` / frown mouths). `scripts/brand/build-nomi-rig.py` cuts them with local tools only (Pillow, NumPy, OpenCV; nothing uploaded). Occluded areas are filled with OpenCV inpainting: skin under the eyes and mouth, hair under the ribbon, neck under the chin, collar under the side hair.
- **Renderer:** `src/mascot/layeredRig.ts` (Canvas2D, no GPU) driven by the existing sprite backend. It does idle breathing, auto blink (eye squash plus lid line), head tilt and sway, spring-driven side hair and ribbon, cursor parallax (the head moves, and the eyes and mouth move a little further), lip-sync mouth from the TTS RMS level, and expression styles for neutral / happy / relaxed / sad / angry / surprised (talking and blink map onto these). It pauses while the window is hidden and drops positional motion under `prefers-reduced-motion`.
- **Superseded:** the nine blurry brand-board busts were removed. `neutral.png` is the static composite.
- **Limits:** the face is about 150 px wide in the source, so it is upscaled 2×. Eye whites are not separate, so the eyes do not track inside the sockets; gaze is shown with head and feature parallax. Arms and body do not bend.

The real-3D research below is kept for when the owner wants to revisit it.

Goal: a rigged **VRM 1.0** Nomi (humanoid bones, blink/A-I-U-E-O visemes, the 6 emotion presets used by `expressionDirector`). It should look like the brand board (chibi proportions, brown bob, orange clips/bow, cream blouse, black choker) and be licensable for shipping in the MIT repo.

## Options

| # | Route | Output licence / ownership | Effort | Quality for an anime mascot | Notes |
| --- | --- | --- | --- | --- | --- |
| A | **VRoid Studio** (pixiv; free, GUI-only, Win/macOS) — hand-build Nomi with the board as reference | Creator owns the model; VRoid terms allow commercial use and redistribution of models you make. Export VRM 1.0 directly with blend shapes, spring bones and visemes | 1–2 days for a person in the GUI; **cannot be automated from this box** | ★★★★★ — native anime style, rig/expressions correct by construction | **Recommended.** Needs a human (owner or commissioned artist). Hair clips and bow via custom textures/accessories |
| B | **TRELLIS.2** (Microsoft, image → textured mesh) | Model & code **MIT**. Caveats: textured GLB export uses nvdiffrast (NVIDIA non-commercial licence; replaceable), DINOv3 dependency has its own licence | Needs a CUDA GPU (24 GB+ recommended) or a hosted demo | ★★☆☆☆ — a single static mesh, fused hair/clothes, no topology for faces; must be retopologised and rigged | Good for a fast "look test", not a shippable mascot |
| C | **Hunyuan3D 2.1** (Tencent, image → mesh + PBR) | Outputs owned by the user, **but the licence excludes the EU, UK and South Korea**, and products over 1M MAU need approval | GPU required | ★★★☆☆ | The territory restriction conflicts with a worldwide MIT repo: **not recommended** for shipped assets |
| D | **Tripo / Meshy** (hosted SaaS) | Tripo: **free tier = Tripo owns outputs**; paid plan = you own them (commercial OK). Meshy: similar paid-tier ownership | Minutes per generation; paid plan needed | ★★★☆☆ (Tripo has auto-rig for humanoids) | Only on a **paid plan**, and uploading the artwork shares it with a third party |
| E | Commission a VRM artist (BOOTH / Skeb / Fiverr) | Buy a full copyright transfer or an MIT/CC-BY licence in the contract | 2–4 weeks, ~¥1,500–6,000 / US$200–800 | ★★★★★ | Most reliable route to a polished, original Nomi |

### Rigging an image-to-3D mesh into VRM (routes B–D)

1. Clean up in Blender: remesh/retopologise (Quad Remesher or Instant Meshes), separate the hair, face and body, and rebake textures.
2. Auto-rig: Mixamo (free, Adobe account; FBX humanoid) or Blender **Rigify** / **AccuRIG** (ActorCore, free).
3. Build the face rig by hand: blink and A/I/U/E/O shape keys, plus happy/angry/sad/relaxed/surprised. Image-to-3D meshes have no usable face topology, so this is the bulk of the work.
4. Export with **VRM Add-on for Blender** (MIT) or **UniVRM** (MIT). Set humanoid bone mapping, spring bones for hair and bow, expressions and the licence metadata (owner, allowed uses, redistribution) in VRM meta.
5. Check the model with `pnpm --filter @nomi-ai/electron test` (VRM import) and in the model picker. Add it to `model-list.json` and `assets-licenses.json`.

Realistic effort for B–D: 2–5 days for someone with Blender skills. The result will still look less "on model" than A or E.

## Sample

No sample was generated in this pass:
- The box has **no GPU**, so TRELLIS.2 and Hunyuan3D cannot run locally.
- Hosted demos and SaaS (Hugging Face Spaces, Tripo, Meshy) would mean **uploading the owner's artwork to a third party**. Tripo's free tier also hands output ownership to Tripo. That needs the owner's explicit OK, and for Tripo a paid plan.

If approved, the quickest look test is TRELLIS.2 on a rented GPU (or the official Space) with the owner's half-body / poster artwork as input. Then do steps 1–5 above.

## Decision needed

1. **Route:** A (VRoid, self-made), E (commission) or B/D (image-to-3D plus manual rigging)?
2. If B/D: may the artwork be uploaded to a hosted service, and is a paid Tripo/Meshy plan OK?
3. Should Nomi 3D replace the VRM as the 3D default once it exists (the 2D sprite stays the overall default)?
