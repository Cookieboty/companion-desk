import { type VoiceSettings as VoiceSettingsType } from '@ig-live/types';
import { Modal, Switch } from '@ig-live/ui';
import React, { useState, useEffect, useCallback } from 'react';

import {
  DEFAULT_SOFT_SPEECH,
  listSoftVoiceChoices,
  loadSoftSpeechPrefs,
  saveSoftSpeechPrefs,
  speakSoft,
  type SoftSpeechPrefs,
} from '../../mascot/softSpeech';
import { type VoiceService } from '../../services/VoiceService';

import styles from './style.module.css';

interface VoiceSettingsProps {
  voiceService: VoiceService;
  isVisible: boolean;
  onClose: () => void;
  onSettingsChange?: () => void;
}

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  voiceService,
  isVisible,
  onClose,
  onSettingsChange,
}) => {
  const [settings, setSettings] = useState<VoiceSettingsType | null>(null);
  const [soft, setSoft] = useState<SoftSpeechPrefs>(DEFAULT_SOFT_SPEECH);
  const [voices, setVoices] = useState<ReturnType<typeof listSoftVoiceChoices>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshVoices = useCallback(() => {
    setVoices(listSoftVoiceChoices());
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    setSettings(voiceService.getSettings());
    setSoft(loadSoftSpeechPrefs());
    refreshVoices();
    const synth = window.speechSynthesis;
    synth?.addEventListener('voiceschanged', refreshVoices);
    // Chrome populates voices asynchronously
    const t = setTimeout(refreshVoices, 300);
    return () => {
      synth?.removeEventListener('voiceschanged', refreshVoices);
      clearTimeout(t);
    };
  }, [isVisible, voiceService, refreshVoices]);

  const handleSettingChange = async (
    key: keyof VoiceSettingsType,
    value: VoiceSettingsType[keyof VoiceSettingsType],
  ) => {
    if (!settings) return;
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    setIsLoading(true);
    try {
      await voiceService.updateSettings({ [key]: value });
      onSettingsChange?.();
    } catch (error) {
      console.error('更新设置失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const patchSoft = (patch: Partial<SoftSpeechPrefs>) => {
    const next = saveSoftSpeechPrefs(patch);
    setSoft(next);
  };

  if (!isVisible || !settings) {
    return null;
  }

  const off = isLoading || !settings.enabled;
  return (
    <Modal
      open
      onClose={onClose}
      title="语音设置"
      className={styles.panel}
      data-testid="voice-settings"
    >
      <section className={styles.group}>
        <h4 className="cd-section-title">基本设置</h4>
        <Switch
          checked={settings.enabled}
          onChange={(v) => handleSettingChange('enabled', v)}
          disabled={isLoading}
          label="启用语音功能"
        />
        <label className={styles.range}>
          <span>音量: {Math.round(settings.volume * 100)}%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.volume}
            onChange={(e) => handleSettingChange('volume', parseFloat(e.target.value))}
            disabled={off}
          />
        </label>
      </section>

      <section className={styles.group}>
        <h4 className="cd-section-title">柔和朗读（系统 / Edge 语音）</h4>
        <p className="cd-muted" style={{ marginBottom: 8, fontSize: 12 }}>
          优先选用柔和中文女声；若本机装有 Microsoft Edge 在线自然语音（如 Xiaoxiao
          Online），会自动偏好它们。也可手动挑选。
        </p>
        <label className={styles.range}>
          <span>音色</span>
          <select
            data-testid="soft-speech-voice"
            value={soft.voiceURI}
            disabled={off}
            onChange={(e) => patchSoft({ voiceURI: e.target.value })}
            style={{ width: '100%', marginTop: 4 }}
          >
            <option value="">自动（柔和中文女声）</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.neural ? '✦ ' : ''}
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
        <Switch
          checked={soft.preferNeural}
          onChange={(v) => patchSoft({ preferNeural: v })}
          disabled={off}
          label="优先 Edge / 在线自然语音（Neural）"
        />
        <label className={styles.range}>
          <span>语速: {soft.rate.toFixed(2)}×（偏慢更柔和）</span>
          <input
            type="range"
            min="0.7"
            max="1.15"
            step="0.01"
            value={soft.rate}
            data-testid="soft-speech-rate"
            onChange={(e) => patchSoft({ rate: parseFloat(e.target.value) })}
            disabled={off}
          />
        </label>
        <label className={styles.range}>
          <span>音高: {soft.pitch.toFixed(2)}</span>
          <input
            type="range"
            min="0.85"
            max="1.25"
            step="0.01"
            value={soft.pitch}
            data-testid="soft-speech-pitch"
            onChange={(e) => patchSoft({ pitch: parseFloat(e.target.value) })}
            disabled={off}
          />
        </label>
        <button
          type="button"
          className="cd-btn cd-btn--sm"
          data-testid="soft-speech-test"
          disabled={off}
          onClick={() =>
            speakSoft('你好，我是看板娘。今天也一起加油吧。', {
              prefs: { ...soft, volume: settings.volume },
            })
          }
        >
          试听柔和朗读
        </button>
      </section>

      <section className={styles.group}>
        <h4 className="cd-section-title">功能设置</h4>
        <Switch
          checked={settings.keyboardListening}
          onChange={(v) => handleSettingChange('keyboardListening', v)}
          disabled={off}
          label="键盘监听（根据输入内容播放语音）"
        />
        <Switch
          checked={settings.timeAnnouncement}
          onChange={(v) => handleSettingChange('timeAnnouncement', v)}
          disabled={off}
          label="定时播报（根据时间播放问候语音）"
        />
      </section>

      <section className={styles.group}>
        <h4 className="cd-section-title">使用说明</h4>
        <ul className={styles.help}>
          <li>
            <strong>柔和音色</strong>：互动台词与关键词播报走 Web Speech；标 ✦ 的多为 Edge
            在线自然女声。
          </li>
          <li>
            <strong>键盘监听</strong>：检测到编程关键词时播放相应语音
          </li>
          <li>
            <strong>定时播报</strong>：按时段问候
          </li>
          <li>
            详见 <code>docs/VOICE.md</code>
          </li>
        </ul>
      </section>
      {isLoading && <div className="cd-muted">保存中…</div>}
    </Modal>
  );
};
