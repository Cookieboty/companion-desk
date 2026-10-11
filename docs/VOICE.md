# Soft system voice (TTS)

Companion Desk uses the **OS / Edge Web Speech** stack for mascot reaction lines and keyword voice tips — not Live2D audio packs.

## Defaults (soft)

| Knob   | Default                | Notes                                                                   |
| ------ | ---------------------- | ----------------------------------------------------------------------- |
| Voice  | Auto soft zh-CN female | Prefers Edge **Neural / Online Natural** (e.g. Xiaoxiao) when installed |
| Rate   | **0.88×**              | Slower than system default                                              |
| Pitch  | **1.06**               | Avoids the old cartoonish 1.3                                           |
| Volume | 0.78                   |                                                                         |
| Pauses | Clause split           | Split on `，。！？、` with ~140ms gaps (SSML not reliable in Chromium)  |

Native Electron `AdvancedTTSEngine` (`say` / SAPI / espeak) defaults to the same softer speed and prefers **Meijia / Huihui / zh** style voices per platform.

## Voice picker

**语音设置** panel (tray / settings entry that opens VoiceSettings):

1. **音色** — dropdown of scored Chinese / soft voices (`✦` = neural/online).
2. **优先 Edge / 在线自然语音** — boosts Microsoft Edge Online Natural voices in auto-pick.
3. **语速 / 音高** — fine tune.
4. **试听柔和朗读** — sample line.

Prefs persist in `localStorage` key `mascot.softSpeech.v1`.

## Installing softer voices

- **Windows:** Settings → Time & language → Speech → add **Chinese (Simplified)** voices; Edge updates often add _Xiaoxiao Online (Natural)_.
- **macOS:** System Settings → Accessibility → Spoken Content → Voices → download **Meijia** / **Sinji** (Mandarin).
- **Linux:** `espeak-ng` with `zh` is robotic; for softer results use a distro package of **piper** / **festival** later, or rely on Chromium’s cloud voices if available in your Electron build.

## Code map

| Path                                                    | Role                                               |
| ------------------------------------------------------- | -------------------------------------------------- |
| `packages/renderer/src/mascot/softSpeech.ts`            | Pick voice, rate/pitch, clause pauses, `speakSoft` |
| `packages/renderer/src/mascot/interaction/reactions.ts` | Reaction lines → `speakSoft`                       |
| `packages/renderer/src/services/VoiceService.ts`        | Keyword / hourly lines → `speakSoft`               |
| `packages/renderer/src/components/VoiceSettings`        | UI picker                                          |
| `packages/electron/src/services/AdvancedTTSEngine.ts`   | Native TTS soft defaults                           |

## Optional later

- Piper / Edge TTS HTTP provider as a first-class `TtsProvider` (higher quality, offline possible).
- True SSML when a provider supports it (not Web Speech).
