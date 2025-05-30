import React, { useState, useEffect } from 'react';
import { VoiceSettings as VoiceSettingsType } from '@ig-live/types';
import { VoiceService } from '../../services/VoiceService';

interface VoiceSettingsProps {
  voiceService: VoiceService;
  isVisible: boolean;
  onClose: () => void;
  onSettingsChange?: () => void;
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: 'white',
    borderRadius: '8px',
    width: '400px',
    maxHeight: '80vh',
    overflowY: 'auto' as const,
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    position: 'relative' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #eee',
    background: '#f8f9fa',
    borderRadius: '8px 8px 0 0',
  },
  title: {
    margin: 0,
    color: '#333',
    fontSize: '18px',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#666',
    padding: 0,
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  },
  content: {
    padding: '20px',
  },
  settingGroup: {
    marginBottom: '24px',
  },
  groupTitle: {
    margin: '0 0 12px 0',
    color: '#333',
    fontSize: '16px',
    fontWeight: 600,
  },
  settingItem: {
    marginBottom: '12px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    color: '#555',
  },
  rangeInput: {
    flex: 1,
    marginLeft: '12px',
  },
  testButtons: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  testButton: {
    padding: '8px 16px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  helpText: {
    fontSize: '14px',
    color: '#666',
    lineHeight: 1.5,
  },
  helpParagraph: {
    margin: '8px 0',
  },
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(255, 255, 255, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
  },
  loadingSpinner: {
    padding: '12px 24px',
    background: '#333',
    color: 'white',
    borderRadius: '4px',
    fontSize: '14px',
  },
};

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  voiceService,
  isVisible,
  onClose,
  onSettingsChange
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

  const handleSettingChange = async (key: keyof VoiceSettingsType, value: any) => {
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

  const handleTestVoice = async (keyword: string) => {
    setIsLoading(true);
    try {
      await voiceService.testVoice(keyword);
    } catch (error) {
      console.error('测试语音失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible || !settings) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h3 style={styles.title}>语音设置</h3>
          <button
            style={{
              ...styles.closeButton,
              opacity: isLoading ? 0.5 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
            onClick={onClose}
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        <div style={styles.content}>
          {/* 基本设置 */}
          <div style={styles.settingGroup}>
            <h4 style={styles.groupTitle}>基本设置</h4>

            <div style={styles.settingItem}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => handleSettingChange('enabled', e.target.checked)}
                  disabled={isLoading}
                />
                启用语音功能
              </label>
            </div>

            <div style={styles.settingItem}>
              <label style={styles.label}>
                音量: {Math.round(settings.volume * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.volume}
                  onChange={(e) => handleSettingChange('volume', parseFloat(e.target.value))}
                  disabled={isLoading || !settings.enabled}
                  style={styles.rangeInput}
                />
              </label>
            </div>
          </div>

          {/* 功能设置 */}
          <div style={styles.settingGroup}>
            <h4 style={styles.groupTitle}>功能设置</h4>

            <div style={styles.settingItem}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={settings.keyboardListening}
                  onChange={(e) => handleSettingChange('keyboardListening', e.target.checked)}
                  disabled={isLoading || !settings.enabled}
                />
                键盘监听（根据输入内容播放语音）
              </label>
            </div>

            <div style={styles.settingItem}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={settings.timeAnnouncement}
                  onChange={(e) => handleSettingChange('timeAnnouncement', e.target.checked)}
                  disabled={isLoading || !settings.enabled}
                />
                定时播报（根据时间播放问候语音）
              </label>
            </div>
          </div>

          {/* 测试区域 */}
          <div style={styles.settingGroup}>
            <h4 style={styles.groupTitle}>语音测试</h4>
            <div style={{ marginBottom: '15px' }}>
              <button
                onClick={() => voiceService.testVoice('function')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
              >
                测试编程语音
              </button>
              <button
                onClick={() => voiceService.testVoice('time')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
              >
                测试时间语音
              </button>
              <button
                onClick={() => voiceService.testKeyboardListener()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FF9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                测试键盘监听
              </button>
            </div>
          </div>

          {/* 说明文字 */}
          <div style={styles.settingGroup}>
            <h4 style={styles.groupTitle}>使用说明</h4>
            <div style={styles.helpText}>
              <p style={styles.helpParagraph}>• <strong>键盘监听</strong>：监听全局键盘输入，当检测到编程关键词时播放相应语音</p>
              <p style={styles.helpParagraph}>• <strong>定时播报</strong>：根据当前时间自动播放问候语音</p>
              <p style={styles.helpParagraph}>• <strong>支持的关键词</strong>：function、if、for、await、catch、import 等编程关键词</p>
              <p style={styles.helpParagraph}>• <strong>时间播报</strong>：早上、中午、下午、晚上、深夜时段的问候语</p>
            </div>
          </div>
        </div>

        {isLoading && (
          <div style={styles.loadingOverlay}>
            <div style={styles.loadingSpinner}>加载中...</div>
          </div>
        )}
      </div>
    </div>
  );
}; 