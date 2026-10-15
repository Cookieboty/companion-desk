# Nomi built-in Fish reference (`nomi`)

Default local fish-speech reference id: `nomi`.

At runtime the Electron main process loads these files and sends them inline as
`reference_audio` (base64) + `reference_text` on `POST /v1/tts`, so you do **not**
need to copy them into the fish-speech server `references/` folder.

## Files

- `sample.wav` — mono 44.1 kHz, ~8s cute Mandarin seed for zero-shot cloning
- `sample.lab` — exact transcript (UTF-8)

## Provenance (provisional seed)

`sample.wav` was synthesized with Microsoft Edge neural TTS voice **zh-CN-XiaoyiNeural**
(cartoon / lively), rate +5%, pitch +4Hz, for use as Nomi’s built-in cute seed.

- Not a third-party anime/galgame character voice.
- Treat as a **provisional** product seed: replace with a project-owned recording when you have one.
- Shipping Edge-generated audio in an open-source app may be subject to Microsoft TTS / Online Services terms; keep an eye on redistribution rights for your release channel.
- Fish Audio Community License still requires **Built with Fish Audio** when using fish-speech materials.

Do not commit multi-GB model weights here. Do not add infringing character packs.
