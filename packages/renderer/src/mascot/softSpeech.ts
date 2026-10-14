/**
 * Soft system TTS helpers (Web Speech API).
 * Prefer softer Chinese female / Edge neural voices, slower rate, gentle pitch.
 * Chromium does not honor full SSML; we insert clause pauses instead.
 */

const STORAGE_KEY = 'mascot.softSpeech.v1';

export interface SoftSpeechPrefs {
  /** speechSynthesis voiceURI; empty = auto-pick soft Chinese female */
  voiceURI: string;
  /** 0.5..1.5 — default slower than system */
  rate: number;
  /** 0..2 — slightly above 1 sounds softer than high cartoon pitch */
  pitch: number;
  /** Prefer Microsoft Edge / Online Natural voices when present */
  preferNeural: boolean;
  volume: number;
}

export const DEFAULT_SOFT_SPEECH: SoftSpeechPrefs = {
  voiceURI: '',
  rate: 0.88,
  pitch: 1.06,
  preferNeural: true,
  volume: 0.78,
};

/** Name patterns scored higher for "soft Chinese female" (incl. Edge neural). */
const SOFT_ZH_FEMALE: Array<{ re: RegExp; score: number }> = [
  { re: /xiaoxiao/i, score: 100 },
  { re: /yunxia|xiaoqiu|xiaoyi|xiaohan/i, score: 95 },
  { re: /online.*natural|natural.*chinese|neural/i, score: 90 },
  { re: /huihui|yaoyao|meijia|ting-?ting|sinji|hanhan/i, score: 80 },
  { re: /microsoft.*(xiao|hui|yao|mei)|google.*(中文|chinese).*female/i, score: 70 },
  { re: /zh[-_]cn|chinese.*(china|mainland)|华语|普通话|國語|粤/i, score: 40 },
  { re: /female|女/i, score: 25 },
];

const AVOID: RegExp[] = [/male|男|kangkang|yunyang|yunjian|david|mark|george|ravi|espeak|robot/i];

export function loadSoftSpeechPrefs(): SoftSpeechPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SoftSpeechPrefs>;
    return {
      ...DEFAULT_SOFT_SPEECH,
      ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null)),
    } as SoftSpeechPrefs;
  } catch {
    return { ...DEFAULT_SOFT_SPEECH };
  }
}

export function saveSoftSpeechPrefs(patch: Partial<SoftSpeechPrefs>): SoftSpeechPrefs {
  const next = { ...loadSoftSpeechPrefs(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export function scoreVoice(v: SpeechSynthesisVoice, preferNeural: boolean): number {
  const label = `${v.name} ${v.lang} ${v.voiceURI}`;
  if (AVOID.some((re) => re.test(label))) return -1000;
  let s = 0;
  for (const { re, score } of SOFT_ZH_FEMALE) if (re.test(label)) s += score;
  if (/^zh/i.test(v.lang) || /chinese/i.test(label)) s += 30;
  if (preferNeural && /online|natural|neural|edge/i.test(label)) s += 35;
  if (v.localService === false) s += 10; // cloud/neural often localService=false
  return s;
}

export function pickSoftVoice(
  voices: SpeechSynthesisVoice[],
  prefs: SoftSpeechPrefs = loadSoftSpeechPrefs(),
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  if (prefs.voiceURI) {
    const exact = voices.find((v) => v.voiceURI === prefs.voiceURI);
    if (exact) return exact;
  }
  const ranked = [...voices]
    .map((v) => ({ v, s: scoreVoice(v, prefs.preferNeural) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return ranked[0]?.v ?? voices.find((v) => /^zh/i.test(v.lang)) ?? null;
}

/** Split on Chinese/English clause punctuation for gentle pauses. */
export function clausePauseParts(text: string): string[] {
  const parts = text
    .split(/(?<=[，。！？；、,…~～])/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

export interface SpeakSoftOptions {
  prefs?: SoftSpeechPrefs;
  /** Cancel any current utterance first (default true) */
  cancel?: boolean;
  onEnd?: () => void;
}

/**
 * Speak with soft defaults. Returns false if Speech Synthesis is unavailable.
 */
let generation = 0;

/** 立即停止系统朗读（语音打断用）：作废尚未开始的分句 */
export function stopSoftSpeech(): void {
  generation++;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export function speakSoft(text: string, opts: SpeakSoftOptions = {}): boolean {
  const gen = ++generation;
  try {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined' || !text.trim()) return false;
    const prefs = opts.prefs ?? loadSoftSpeechPrefs();
    if (opts.cancel !== false) synth.cancel();

    // Voices often empty until voiceschanged
    const voices = synth.getVoices();
    const voice = pickSoftVoice(voices, prefs);
    const parts = clausePauseParts(text);
    let i = 0;

    const speakNext = () => {
      if (gen !== generation) return;
      if (i >= parts.length) {
        opts.onEnd?.();
        return;
      }
      const u = new SpeechSynthesisUtterance(parts[i++]);
      u.lang = voice?.lang || 'zh-CN';
      if (voice) u.voice = voice;
      u.rate = prefs.rate;
      u.pitch = prefs.pitch;
      u.volume = prefs.volume;
      u.onend = () => {
        // Short breath between clauses (~120–180ms)
        if (gen !== generation) return;
        if (i < parts.length) setTimeout(speakNext, 140);
        else opts.onEnd?.();
      };
      u.onerror = () => opts.onEnd?.();
      synth.speak(u);
    };

    if (!voices.length) {
      const once = () => {
        synth.removeEventListener('voiceschanged', once);
        speakNext();
      };
      synth.addEventListener('voiceschanged', once);
      // Fallback if event never fires
      setTimeout(() => {
        synth.removeEventListener('voiceschanged', once);
        if (!synth.speaking) speakNext();
      }, 400);
    } else {
      speakNext();
    }
    return true;
  } catch {
    return false;
  }
}

export function listSoftVoiceChoices(): Array<{
  voiceURI: string;
  name: string;
  lang: string;
  score: number;
  neural: boolean;
}> {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return [];
  const prefs = loadSoftSpeechPrefs();
  return synth
    .getVoices()
    .map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      score: scoreVoice(v, prefs.preferNeural),
      neural: /online|natural|neural|edge/i.test(v.name),
    }))
    .filter((v) => v.score > 0 || /^zh/i.test(v.lang))
    .sort((a, b) => b.score - a.score);
}
