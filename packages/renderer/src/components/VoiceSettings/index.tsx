import { type VoiceSettings as VoiceSettingsType } from '@ig-live/types';
import { Modal, Switch } from '@ig-live/ui';
import React, { useState, useEffect } from 'react';

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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isVisible) {
      loadSettings();
    }
  }, [isVisible]);

  const loadSettings = () => {
    const currentSettings = voiceService.getSettings();
    setSettings(currentSettings);
  };

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

  if (!isVisible || !settings) {
    return null;
  }

  const off = isLoading || !settings.enabled;
  return (
    <Modal open onClose={onClose} title="语音设置" className={styles.panel}>
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
            <strong>键盘监听</strong>：监听全局键盘输入，当检测到编程关键词时播放相应语音
          </li>
          <li>
            <strong>定时播报</strong>：根据当前时间自动播放问候语音
          </li>
          <li>
            <strong>支持的关键词</strong>：function、if、for、await、catch、import 等编程关键词
          </li>
          <li>
            <strong>时间播报</strong>：早上、中午、下午、晚上、深夜时段的问候语
          </li>
        </ul>
      </section>
      {isLoading && <div className="cd-muted">保存中…</div>}
    </Modal>
  );
};
