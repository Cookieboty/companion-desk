# Soft system voice (TTS)

Nomi uses the **OS / Edge Web Speech** stack for mascot reaction lines and keyword voice tips — not Live2D audio packs.

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

## Per-character voice binding

Each model id can bind its own softer TTS:

| Field            | Meaning                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `voiceURI`       | Exact `speechSynthesis` voiceURI (OS-specific)                      |
| `voiceHint`      | Portable name substring (`xiaoxiao`, `yunxia`, `yaoyao`, `meijia`…) |
| `rate` / `pitch` | Per-character soft defaults                                         |

Stored on `ModelConfig.voice` (model-list defaults + user `models.updateConfig`) and user overrides in `localStorage` key `mascot.characterVoice.v1`.

Built-in defaults:

| Character          | Hint     | Rate | Pitch |
| ------------------ | -------- | ---- | ----- |
| (imported, 2D tag) | xiaoxiao | 0.90 | 1.08  |
| (imported, other)  | xiaoxiao | 0.88 | 1.06  |

Resolve order: global soft prefs (preferNeural/volume) → character defaults → `model.config.voice` → local override.

Code: `packages/renderer/src/mascot/characterVoice.ts`; UI: VoiceSettings「当前角色音色」.

# Voice input (speech-to-text)

Local-first: audio never leaves the machine unless you pick a cloud engine and confirm it.

## Engines

| Engine                                    | Where                    | Notes                                                                                                                                                                 |
| ----------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper.cpp (default)**                 | local CLI, `whisper-cli` | Binary + model downloaded on demand (SHA-256 verified, licence shown, progress bar, cancel). macOS: `brew install whisper-cpp` or set a custom path.                  |
| OpenAI-compatible `/audio/transcriptions` | cloud                    | Uses an existing provider's key. A one-time consent per endpoint is required; refused when **仅本地** (local-only) is on. Every call is audited (`voice_transcribe`). |

## Modes

- **按住说话** — hold the 🎙 button, or hold **F2** in the chat window. Slide off / **Esc** cancels.
- **免按键对话** — **Ctrl/⌘+Shift+H** in chat, or right-click the mascot's mic. Silero VAD segments speech; falls back to an energy detector if the VAD model is not downloaded.
- **语音打断** — when the user starts talking, mascot TTS stops (setting _bargeIn_).
- Mascot reacts: nods while hearing, _think_ while transcribing, waves on wake. The status pill sits at the bottom of the window, never over the face.

## Wake word (off by default)

Implementation (option 3): Silero VAD detects a speech segment → local whisper.cpp transcribes it with the phrase as prompt → fuzzy match (edit distance) against the configured phrase (default 「你好小桌」, any language). Text after the phrase is used as the command; otherwise the mascot says 「我在～请说」 and listens for `windowSec` seconds. Wake checks are **always local** even when a cloud engine is selected. A visible pill 「等待唤醒词…」 shows whenever the mic is armed.

**Future upgrade (option 1):** train a project-owned openWakeWord model (the public pretrained models are CC BY-NC-SA 4.0 and cannot be shipped) for lower CPU use and better far-field accuracy.

## Code map

- `packages/voice` — mic capture, resampling, segmenter, wake matcher, controller, React UI.
- `packages/electron/src/voice` — catalog, verified downloader, whisper.cpp runner, cloud ASR, Silero VAD (main process; renderer CSP unchanged), IPC `ai:voice:*`.
- `packages/renderer/src/mascot/voice` — toolbar mic, expression mapping, barge-in.
