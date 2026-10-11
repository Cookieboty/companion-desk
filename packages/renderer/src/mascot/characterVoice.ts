/**
 * Per-character soft TTS binding.
 * Merge order: global soft prefs → built-in character defaults → model.config.voice → user override.
 * Overrides persist in localStorage; user-imported models also try models.updateConfig({ voice }).
 */
import type { ModelConfig, ModelVoiceConfig } from '@ig-live/types';

import {
  DEFAULT_SOFT_SPEECH,
  loadSoftSpeechPrefs,
  pickSoftVoice,
  saveSoftSpeechPrefs,
  speakSoft,
  type SoftSpeechPrefs,
  type SpeakSoftOptions,
} from './softSpeech';

const OVERRIDE_KEY = 'mascot.characterVoice.v1';

/** Built-in softer defaults by model id / tag family. */
export const CHARACTER_VOICE_DEFAULTS: Record<string, ModelVoiceConfig> = {
  'default-character': {
    voiceHint: 'xiaoxiao',
    rate: 0.88,
    pitch: 1.06,
  },
  'soft-face': {
    voiceHint: 'yunxia',
    rate: 0.85,
    pitch: 1.08,
  },
  'pixel-neko': {
    voiceHint: 'yaoyao',
    rate: 0.92,
    pitch: 1.12,
  },
};

type OverrideMap = Record<string, ModelVoiceConfig>;

let activeModelName: string | null = null;
let activeModelConfig: ModelConfig | undefined;

function storage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

function readOverrides(): OverrideMap {
  try {
    const raw = JSON.parse(storage()?.getItem(OVERRIDE_KEY) ?? '{}') as OverrideMap;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeOverrides(map: OverrideMap): void {
  try {
    storage()?.setItem(OVERRIDE_KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
}

export function setActiveCharacter(modelName: string | null, config?: ModelConfig): void {
  activeModelName = modelName;
  activeModelConfig = config;
}

export function getActiveCharacter(): { name: string | null; config?: ModelConfig } {
  return { name: activeModelName, config: activeModelConfig };
}

export function defaultsForCharacter(
  modelName: string | null | undefined,
  tags?: string[],
): ModelVoiceConfig {
  if (modelName && CHARACTER_VOICE_DEFAULTS[modelName])
    return { ...CHARACTER_VOICE_DEFAULTS[modelName] };
  if (tags?.includes('pixel')) return { ...CHARACTER_VOICE_DEFAULTS['pixel-neko'] };
  if (tags?.includes('sprite') || tags?.includes('soft'))
    return { ...CHARACTER_VOICE_DEFAULTS['soft-face'] };
  return { ...CHARACTER_VOICE_DEFAULTS['default-character'] };
}

export function getCharacterVoiceOverride(modelName: string): ModelVoiceConfig | undefined {
  const v = readOverrides()[modelName];
  return v && typeof v === 'object' ? { ...v } : undefined;
}

/** Merge voice binding for a character (no speech prefs preferNeural/volume). */
export function resolveCharacterVoice(
  modelName: string | null,
  modelConfig?: ModelConfig,
  tags?: string[],
): ModelVoiceConfig {
  const base = defaultsForCharacter(modelName, tags);
  const fromConfig = modelConfig?.voice ?? {};
  const override = modelName ? (getCharacterVoiceOverride(modelName) ?? {}) : {};
  return { ...base, ...fromConfig, ...override };
}

/** Resolve full SoftSpeechPrefs for the active (or named) character. */
export function resolvePrefsForCharacter(
  modelName: string | null = activeModelName,
  modelConfig: ModelConfig | undefined = activeModelConfig,
  tags?: string[],
): SoftSpeechPrefs {
  const global = loadSoftSpeechPrefs();
  const voice = resolveCharacterVoice(modelName, modelConfig, tags);
  const prefs: SoftSpeechPrefs = {
    ...global,
    voiceURI: voice.voiceURI ?? '',
    rate: voice.rate ?? global.rate,
    pitch: voice.pitch ?? global.pitch,
  };
  // Apply voiceHint when no explicit URI
  if (
    !prefs.voiceURI &&
    voice.voiceHint &&
    typeof window !== 'undefined' &&
    window.speechSynthesis
  ) {
    const voices = window.speechSynthesis.getVoices();
    const hint = voice.voiceHint.toLowerCase();
    const hit =
      voices.find(
        (v) => v.name.toLowerCase().includes(hint) || v.voiceURI.toLowerCase().includes(hint),
      ) ?? null;
    if (hit) prefs.voiceURI = hit.voiceURI;
    else {
      // soft auto-pick still applies via empty URI + scoring
      prefs.voiceURI = '';
    }
  }
  return prefs;
}

export function speakForActiveCharacter(text: string, opts: SpeakSoftOptions = {}): boolean {
  const prefs = resolvePrefsForCharacter();
  return speakSoft(text, { ...opts, prefs: opts.prefs ? { ...prefs, ...opts.prefs } : prefs });
}

/**
 * Save per-character override. Also patches model.config via Electron when possible.
 * Returns the merged voice config for that character.
 */
export async function saveCharacterVoice(
  modelName: string,
  patch: ModelVoiceConfig,
  currentConfig?: ModelConfig,
): Promise<ModelVoiceConfig> {
  const map = readOverrides();
  const merged: ModelVoiceConfig = { ...(map[modelName] ?? {}), ...patch };
  // Drop empty strings
  if (merged.voiceURI === '') delete merged.voiceURI;
  if (merged.voiceHint === '') delete merged.voiceHint;
  map[modelName] = merged;
  writeOverrides(map);

  const nextConfig: ModelConfig = {
    ...(currentConfig ?? activeModelConfig ?? {}),
    voice: resolveCharacterVoice(modelName, { ...(currentConfig ?? {}), voice: merged }),
  };
  if (activeModelName === modelName) activeModelConfig = nextConfig;

  const api = typeof window !== 'undefined' ? window.electronAPI?.models : undefined;
  if (api?.updateConfig) {
    try {
      await api.updateConfig(modelName, { ...(currentConfig ?? {}), voice: nextConfig.voice });
    } catch {
      /* bundled models may reject — localStorage still holds override */
    }
  }
  return nextConfig.voice ?? merged;
}

export function clearCharacterVoiceOverride(modelName: string): void {
  const map = readOverrides();
  delete map[modelName];
  writeOverrides(map);
}

/** Preview pick for UI: show which OS voice would be used. */
export function previewVoiceName(prefs: SoftSpeechPrefs): string {
  if (typeof window === 'undefined' || !window.speechSynthesis) return '（无系统语音）';
  const v = pickSoftVoice(window.speechSynthesis.getVoices(), prefs);
  return v ? v.name : '自动柔和女声';
}

// Re-export for settings that still tweak global preferNeural / volume
export { saveSoftSpeechPrefs, loadSoftSpeechPrefs, DEFAULT_SOFT_SPEECH };
export type { SoftSpeechPrefs, SpeakSoftOptions };
