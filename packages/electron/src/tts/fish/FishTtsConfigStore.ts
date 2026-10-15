/**
 * Persist TTS config under userData/tts-config.json.
 * fish-cloud apiKey lives in safeStorage (keys/tts.fish.apiKey.bin), not in the JSON file.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { TTSConfig } from '@nomi-ai/types';
import { DEFAULT_TTS_CONFIG } from '@nomi-ai/types';
import { app, safeStorage } from 'electron';

import { writePrivateFile } from '../../utils/privateFile';

import { normalizeTtsConfig, validateTtsConfig } from './validateTtsConfig';

const API_KEY_FILE = 'tts.fish.apiKey.bin';

export class FishTtsConfigStore {
  private configPath(): string {
    return path.join(app.getPath('userData'), 'tts-config.json');
  }

  private keyPath(): string {
    return path.join(app.getPath('userData'), 'keys', API_KEY_FILE);
  }

  load(): TTSConfig {
    try {
      const p = this.configPath();
      if (!fs.existsSync(p)) {
        return { ...DEFAULT_TTS_CONFIG, lastModified: 0 };
      }
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<TTSConfig>;
      // Never keep apiKey from disk JSON
      const { apiKey: _drop, ...rest } = raw;
      return normalizeTtsConfig(rest);
    } catch {
      return { ...DEFAULT_TTS_CONFIG, lastModified: 0 };
    }
  }

  /** Config safe to send to renderer (apiKey stripped; hasApiKey set). */
  loadPublic(): TTSConfig {
    const cfg = this.load();
    return {
      ...cfg,
      apiKey: '',
      hasApiKey: this.hasApiKey(),
    };
  }

  save(input: TTSConfig): TTSConfig {
    const normalized = normalizeTtsConfig(input);
    const validation = validateTtsConfig(normalized);
    if (!validation.isValid) {
      throw new Error(`TTS config invalid: ${validation.errors.join(', ')}`);
    }

    if (input.clearApiKey) {
      this.clearApiKey();
    } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      this.setApiKey(input.apiKey.trim());
    }

    const toDisk: Record<string, unknown> = {
      ...normalized,
      lastModified: Date.now(),
    };
    delete toDisk.apiKey;
    delete toDisk.hasApiKey;
    delete toDisk.clearApiKey;

    writePrivateFile(this.configPath(), JSON.stringify(toDisk, null, 2));
    return this.loadPublic();
  }

  reset(): void {
    const p = this.configPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    this.clearApiKey();
  }

  hasApiKey(): boolean {
    try {
      return fs.existsSync(this.keyPath()) && fs.statSync(this.keyPath()).size > 0;
    } catch {
      return false;
    }
  }

  getApiKey(): string | undefined {
    try {
      const p = this.keyPath();
      if (!fs.existsSync(p)) return undefined;
      const buf = fs.readFileSync(p);
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf);
      }
      return buf.toString('utf8');
    } catch {
      return undefined;
    }
  }

  setApiKey(value: string): void {
    const dir = path.dirname(this.keyPath());
    fs.mkdirSync(dir, { recursive: true });
    let buf: Buffer;
    if (safeStorage.isEncryptionAvailable()) {
      buf = safeStorage.encryptString(value);
    } else {
      buf = Buffer.from(value, 'utf8');
    }
    fs.writeFileSync(this.keyPath(), buf, { mode: 0o600 });
  }

  clearApiKey(): void {
    try {
      if (fs.existsSync(this.keyPath())) fs.unlinkSync(this.keyPath());
    } catch {
      /* ignore */
    }
  }
}
