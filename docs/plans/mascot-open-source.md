# Mascot stack → 100% open-source (Phase 1: audit + spike + plan)

Status: planning. Nothing deleted yet. Spike: `experiments/inochi2d-spike/` (not built, not shipped).

## 1. License audit

| Item | Location | Size | License | Verdict |
|---|---|---|---|---|
| Live2D Cubism 2 runtime `live2d.min.js` | `renderer/public/assets/` | 128 KB | Live2D Proprietary Software License (header links the Live2D doc; redistributable code but commercial use is governed by Live2D's SDK release licence / revenue thresholds; Cubism 2 SDK is EOL) | **Proprietary — remove** |
| Cubism 2 framework port `src/cubism2/*` (LAppModel, Live2DFramework, PlatformManager, LAppDefine, MatrixStack, ModelSettingJson) | `renderer/src/cubism2/` | ~3.1k LOC incl. Live2D hooks | Header: "(c) Live2D Inc. … use freely only for the development of application related Live2D" | **Proprietary-derived — remove** |
| Live2D glue: `components/Live2D/*`, `Live2dWidget.tsx`, `hooks/useLive2DModel.ts`, `utils/live2d-utils.ts`, `types/live2dApi.d.ts`, cubism2 dynamic import in `Live2DCanvas` | `renderer/src` | — | Our MIT code, but only useful with Cubism | Rewrite against new backend |
| 58 Cubism 2 models | `renderer/public/assets/models/*` (not `vrm/`) | 219 MB | **No licence files** except `yukari_model/readme.txt` (Japanese: *no commercial use, no redistribution*). Characters are third-party IP: Girls' Frontline (~30 dolls, Sunborn/MICA), Honkai `Bronya` (miHoYo), Neptunia (`neptune`, `histoire`), Railgun/Index (`mikoto`, `kuroko`, `index`), Madoka, Umaru, Miku/`snow_miku` (Crypton), Cells at Work (`kesshouban`, `platelet`), Unity-chan (UCL, not OSI), Live2D samples (`hijiki`, `tororo`, `wanko`, `Pio`, `potion-Maker-*` — Live2D Free Material License, restricted commercial use), Yuzuki Yukari (AHS), others unknown | **Proprietary / unknown — remove all** |
| `costume_model_list.json` | public/assets | 8 KB | list of the above | Remove/replace |
| `waifu-tips.json` | public/assets | 12 KB | Text/structure from stevenjoezhang/live2d-widget (**GPL-3.0**) | **Copyleft — rewrite our own tips** |
| Voice clips `voice/*.mp3` + `contributes.json` | public/assets/voice | 2.3 MB | Keyword→clip scheme from "Rainbow Fart" VS Code ext; clip voice actor/licence not recorded | **Unknown — replace (TTS or CC0 recordings)** |
| VRM model list `models/vrm/model-list.json` | public/assets | 1 KB | Points to `default-character.vrm` which **is not in the repo** | Replace once CC0 VRM sourced |
| 3D fallback characters (`DefaultCharacter3D`, `CuteCharacter3D`, `VRMModelFallback`) | renderer/src/components/VirtualCharacter3D | code | Our MIT (procedural three.js primitives) | Open, but ugly → retire once a CC0 VRM ships |
| `@pixiv/three-vrm` 3.x, `three`, `@react-three/fiber`, `@react-three/drei` | deps | — | MIT | **Open ✓** |
| Toolbar icons `utils/icons.ts` | renderer | — | Font Awesome Free (icons CC BY 4.0, code MIT) | **Open ✓** (keep attribution in NOTICE) |
| App code | repo | — | MIT | ✓ |

## 2. 2D replacement: Inochi2D in the browser/Electron

| Runtime | License | State | Notes |
|---|---|---|---|
| **Inox2D** (Rust, official port; `inox2d` + `inox2d-opengl`, WebGL via WASM) | BSD-2-Clause | "prototype, not recommended for production" (README). Active (last commit 2026-09-23). | Parses INP/INX, renders (WebGL2), params (deforms + values), physics. **Missing:** animations, Z-sort params, MeshGroups (newer models break), draw list. |
| `inochi-avatar` (npm 1.0.1, 1★, single author) | BSD-2 (package.json) | wrapper over an old Inox2D commit | ~650 KB wasm + 44 KB JS; API `InoxModel(bytes, canvasId)`, `set_parameter`, `set_parameter_2d`, `get_parameter_names`, `begin_frame/end_frame/draw`. |
| `inochi2d-ts` (three.js) | BSD-2 | stale since 2023-07 | toy |
| Official D `inochi2d` | BSD-2 | mature, but native D (no web build); new TS web wrapper started 2026-07 (`inochi2d-ts/` in main repo, early) | watch |

### Spike result (Electron 44, sandboxed, xvfb + swiftshader)

- Loads Arch-chan `.inp` (CC0, 11 MB) in ~650 ms, runs at 60 fps — **Electron/WebGL2 path works**.
- Screenshot: `/workspace/screenshots/inochi2d-spike-archchan.png` (full body), `…-zoom.png`.
- **Blocking problems:**
  - The face doesn't render (no eyes, brows or mouth). Masked/sorted parts are not drawn correctly.
  - `get_parameter_names()` returns `[]` for Arch-chan, and the log shows `Invalid binding: Unknown param name "transform.t.z"`. Without parameters there is **no lip-sync, blink, expressions or eye tracking**.
  - Panics: physics panics when `dt` is 0 or too large (fixed in the spike by clamping `dt`). `tracing-wasm` panics on `performance.measure` (worked around by patching).
  - Only ~1 in 4 `capturePage` captures had content. This may be a capture artefact (no `preserveDrawingBuffer`), but it needs checking.
  - The `.inx` export fails to parse (`KeyDoesNotExist("uuid")`).
- **Feature parity vs. our Cubism usage:**
  - Head and body params: yes in principle.
  - Physics: yes, but crash-prone.
  - Expressions: no expression or motion files. We would drive params ourselves.
  - Lip-sync: possible only if the params resolve (they don't today).
  - Eye tracking: same as lip-sync.
  - Motions/animations: not supported.
- **Size:** about 0.7 MB runtime, versus 128 KB Cubism plus the framework.

**Verdict:** there is **no production-viable open 2D runtime today**. Inochi2D is the only open, Live2D-class format. Its web runtime is prototype-grade: faces are broken on the reference model, parameters are missing and it panics. Building on it would mean us forking and fixing Inox2D in Rust (MeshGroups, Z-sort, param bindings, animations). That is weeks of graphics work, with the risk of chasing a moving spec.

Other open 2D options considered:
- Spine: proprietary.
- DragonBones: MIT runtime, but the editor is abandoned and anime-style rigs are rare.
- Hand-rolled sprite/PNG-tuber (layered PNG plus parameter-driven transforms for mouth and blink, all MIT code with CC0 art): open and easy, but lower fidelity.

## 3. 3D (three-vrm)

`@pixiv/three-vrm` (MIT) + three (MIT) is fine; VRM 0.x/1.0 supports expressions (`happy/sad/angry/surprised/relaxed`), `aa/ih/ou/ee/oh` visemes (lip-sync), lookAt (eye tracking), spring bones (physics), humanoid for VRMA animations. Model licences are per-file (VRoid/VRM meta: check `commercialUsage`, `allowRedistribution`/`licenseName` = CC0 or CC-BY). Waiting on the other worker's CC0 VRMs. Already lazy-loaded (966 KB chunk) since the perf work.

## Status (2026-10-10)

**Phase 2 + 3 done.** VRM is the only mascot backend (`packages/renderer/src/mascot/`), behind `MascotBackend`.
Removed: Live2D runtime, `cubism2/`, all Live2D models, the GPL `waifu-tips.json` (replaced by original `mascot/tips.ts`),
keyword voice clips (replaced by original lines spoken with the Web Speech API), unverified completion sounds
(replaced by synthesised CC0 chimes) and the app icon of unknown provenance (replaced by a CC0 VRoid-derived icon).
`bundle-ig-live2d` is renamed `bundle-ig-mascot`; the wire protocol keeps the `live2d` name for compatibility.
Licence gate: `pnpm check:licenses` (CI). The Inochi2D and PNG-tuber backends are still open options.

## 4. Replacement plan

**Recommendation:** make **VRM the primary (default) mascot backend now**. Keep a **thin `MascotBackend` abstraction** so an Inochi2D backend can be added behind an experimental flag when Inox2D matures. Optionally add a tiny MIT "PNG-tuber" 2D backend as a low-GPU fallback.

### Architecture

```
packages/renderer/src/mascot/
  MascotBackend.ts      interface: load(src), dispose(), setParam(name,v), setExpression(id, weight),
                        setMouthOpen(0..1), lookAt(x,y), playMotion(id), onHit(cb), getBounds(), capabilities
  MascotHost.tsx        picks backend from config, owns canvas, drag/hit-test, resize, fps throttle when hidden
  backends/vrm/         three-vrm (existing VRMCharacterController → adapter)
  backends/inochi2d/    Inox2D WASM (experimental flag; lazy chunk)
  backends/pngtuber/    optional: layered PNG + transforms (MIT)
  catalog.ts            model catalog with mandatory licence metadata {id, name, backend, url, license, author, source, thumbnail}
```

Feature wiring:
- **Lip-sync:** `lipSyncStore` → `backend.setMouthOpen()`. VRM uses the `aa` viseme or a mix; Inochi uses the mouth param.
- **Expressions:** the AI agent's emotion tags map to `setExpression`.
- **Eye tracking:** cursor → `lookAt`.
- **Model switcher:** reads `catalog.ts`. The toolbar "switch-model" cycles models of the current backend and shows each model's licence and author in the info bubble.
- **Waifu tips / bubble:** keep the bubble UI, which is ours. Rewrite the tip texts from scratch and stop using `#live2d` selectors.
- **Toolbar:** unchanged buttons. Collapse the "mode-switch" between live2d and 3d into a backend picker (vrm / inochi2d-exp / custom-image).
- **Packaging:** models stay as user-visible extraResources. Ship 1–2 CC0 VRMs (~10–20 MB each) and allow user-imported VRM, with a licence prompt.

### Removal list (Phase 3, after the replacement lands)

- `public/assets/live2d.min.js`, `costume_model_list.json`, all `public/assets/models/*` except `vrm/`. This cuts about 219 MB from the installer, so the AppImage drops from ~290 MB to ~70 MB plus the VRMs.
- `src/cubism2/**`, `components/Live2D/**`, `Live2dWidget.tsx`, `hooks/useLive2DModel.ts`, `utils/live2d-utils.ts`, `types/live2dApi.d.ts`, and the related tests.
- `waifu-tips.json`, replaced by our own tips. `voice/*.mp3` + `contributes.json`, replaced by TTS ("code keyword" reactions via the existing TTS engine) or CC0 recordings.
- The 3D primitive fallbacks, replaced by a tasteful loading or empty state once a default VRM is bundled.
- Add `THIRD_PARTY_NOTICES.md`: three, three-vrm, Font Awesome, model credits. Add a CI licence check: every catalog entry must have an allow-listed licence (CC0, CC-BY, MIT).

### Phases and effort (1 engineer)

| Phase | Work | Estimate |
|---|---|---|
| 2a | `MascotBackend` interface + VRM adapter; make VRM default; catalog with licence metadata; lip-sync/expressions/lookAt via VRM | 3–4 d |
| 2b | Re-home bubble/tips/toolbar off Live2D context (`Live2DProvider` → `MascotProvider`); new tips text; voice → TTS | 2–3 d |
| 2c | e2e: mascot renders, lip-sync param moves, model switch; screenshots | 1 d |
| 3 | Delete Live2D runtime/assets/code, notices, licence CI gate | 1 d |
| opt | PNG-tuber 2D backend (MIT) with CC0 art | 2–3 d + art |
| opt | Inochi2D experimental backend: own Inox2D WASM build from upstream main (not inochi-avatar), fix param exposure; upstream MeshGroups/Z-sort | 1–2 d spike-to-flag; **weeks** for production quality |

### Risks

- **Looks:** "good-looking" depends entirely on the CC0 VRMs the other worker finds. VRoid-based CC0 avatars exist but are limited. Commissioning a CC0/owned VRM is the safe path.
- **2D fans lose Live2D:** expect a perceived feature regression for the 2D look until Inochi2D matures.
- **GPU cost:** VRM costs more than Live2D 2D. Keep fps throttling and allow lower pixel ratio. Transparent window + WebGL works today.
- **Inox2D spec churn:** the Inochi2D 0.9 → 1.0 format is moving. Pin model versions.
- **Licence metadata trust:** VRM meta can be wrong. Keep the source URL and licence text alongside each model.
