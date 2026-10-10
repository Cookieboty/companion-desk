# History

Short record of what was removed and why, so nothing is lost silently. Everything here is
still in git history (`git log --diff-filter=D --stat -- <path>`).

## Live2D → VRM (2026)

- The first versions rendered the mascot with the proprietary **Live2D Cubism 2** runtime and
  Live2D models of unclear provenance. Both were removed for licensing reasons and replaced by
  open-source **three-vrm** with CC0 / openly licensed VRM models (see `docs/MODELS.md`,
  `THIRD_PARTY_NOTICES.md`). AI tool names `live2d_play_motion` / `live2d_set_expression` keep the
  old protocol name for compatibility.
- `docs/plans/P4-bundle-ig-live2d.md` — plan for the old Live2D bundle; superseded by
  `packages/bundle-ig-mascot` and `docs/plans/mascot-open-source.md`.
- `experiments/inochi2d-spike/` — a throw-away spike that evaluated Inochi2D (BSD-2) as a 2D
  alternative. Result: no maintained web runtime, so VRM was chosen. Never built or shipped.
- `specs/custom-image-mode`, `specs/3d-virtual-character`, `specs/electron-optimization` —
  early design specs for the Live2D-era app; implemented differently or superseded.

## dsh harness → Vercel AI SDK

- The AI runtime moved from the dsh kernel to the Vercel AI SDK. dsh is now an **optional**
  dependency (`optionalDependencies`, `pnpm run doctor:dsh`); profiles under `profiles/` remain for it.
- `scripts/migrate-config.ts`, `migrate-history.ts`, `migrate-user-profile.ts` (+ `scripts/lib/migrate`)
  — one-shot converters from the old app's config/history to dsh formats. Obsolete: the app migrates
  legacy userData itself on first launch, and providers are managed in the provider panel.

## Misc cleanup (PR "Companion Desk: AI SDK harness, VRM mascot, desktop tools")

- Loose debug scripts `packages/electron/test-voice.js`, `test-mcp-voice.js`, `test-fixed-voice.js`.
- Unreferenced modules: electron `config/EnvironmentConfig.ts`, `utils/LoggerConfig.ts`,
  `services/MCPIntegrationService.ts`, barrel files `services/index.ts`, `handlers/ipc/index.ts`;
  renderer `hooks/useMCPState.ts`, `hooks/useVRMCharacter.ts`, `services/TTSConfigService.ts`.
- Unused dependencies: `concurrently`, `wait-on`, `electron-reload` (dev orchestration is now
  `packages/electron/scripts/dev.mjs`), `copyfiles`, `@typescript-eslint/{parser,eslint-plugin}`
  (replaced by `typescript-eslint`), `yaml` in the three bundles, `jest` in ai-chat (uses vitest).
