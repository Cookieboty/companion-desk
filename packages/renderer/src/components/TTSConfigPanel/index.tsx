/**
 * TTS配置面板组件
 * 提供TTS配置的图形化管理界面
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TTSConfig, TTSTestResult } from '@ig-live/types';
import { ttsConfigService } from '../../services/TTSConfigService';
import styles from './index.module.css';

interface TTSConfigPanelProps {
  isVisible: boolean;
  onClose: () => void;
  onConfigSaved?: (config: TTSConfig) => void;
}

interface FormErrors {
  hostname?: string;
  port?: string;
  path?: string;
  audioUrl?: string;
  promptText?: string;
}

// SVG图标组件
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
  </svg>
);

const TestIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M9,11H7v6h2V11z M13,5h-2v12h2V5z M17,3h-2v16h2V3z" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
  </svg>
);

const SaveIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3M19,19H5V5H16.17L19,7.83V19M12,12A3,3 0 0,0 9,15A3,3 0 0,0 12,18A3,3 0 0,0 15,15A3,3 0 0,0 12,12Z" />
  </svg>
);

const ResetIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12,4C14.1,4 16.1,4.8 17.6,6.3C20.7,9.4 20.7,14.5 17.6,17.6C15.8,19.5 13.3,20.2 10.9,19.9L11.4,17.9C13.1,18.1 14.9,17.5 16.2,16.2C18.5,13.9 18.5,10.1 16.2,7.7C15.1,6.6 13.5,6 12,6V10.5L7,5.5L12,0.5V4M6.3,17.6C3.7,15 3.3,11 5.1,7.9L6.6,9.4C5.5,11.6 5.9,14.4 7.8,16.2C8.3,16.7 8.9,17.1 9.6,17.4L9,19.4C8,19 7.1,18.4 6.3,17.6Z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
  </svg>
);

const ErrorIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" />
  </svg>
);

export const TTSConfigPanel: React.FC<TTSConfigPanelProps> = ({
  isVisible,
  onClose,
  onConfigSaved
}) => {
  const [config, setConfig] = useState<TTSConfig>(ttsConfigService.createDefaultConfig());
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TTSTestResult | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 加载当前配置
  useEffect(() => {
    if (isVisible) {
      loadCurrentConfig();
    }
  }, [isVisible]);

  const loadCurrentConfig = async () => {
    setIsLoading(true);
    try {
      const currentConfig = await ttsConfigService.loadConfig();
      if (currentConfig) {
        setConfig(currentConfig);
      } else {
        setConfig(ttsConfigService.createDefaultConfig());
      }
      setHasUnsavedChanges(false);
      setTestResult(null);
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理输入变更
  const handleInputChange = useCallback((field: keyof TTSConfig, value: string | number | boolean) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    setHasUnsavedChanges(true);

    // 清除相关字段的错误
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  }, [errors]);

  // 验证表单
  const validateForm = (): boolean => {
    const validation = ttsConfigService.validateConfig(config);

    if (!validation.isValid) {
      const newErrors: FormErrors = {};

      validation.errors.forEach(error => {
        if (error.includes('服务器地址') || error.includes('hostname')) {
          newErrors.hostname = error;
        } else if (error.includes('端口') || error.includes('port')) {
          newErrors.port = error;
        } else if (error.includes('请求路径') || error.includes('path')) {
          newErrors.path = error;
        } else if (error.includes('音频URL') || error.includes('audioUrl')) {
          newErrors.audioUrl = error;
        } else if (error.includes('提示文本') || error.includes('promptText')) {
          newErrors.promptText = error;
        }
      });

      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  // 保存配置
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      await ttsConfigService.saveConfig(config);
      setHasUnsavedChanges(false);
      onConfigSaved?.(config);

      // 显示成功消息
      setTestResult({
        success: true,
        message: '配置保存成功！'
      });

      // 3秒后关闭面板
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('保存配置失败:', error);
      setTestResult({
        success: false,
        message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 测试连接
  const handleTestConnection = async () => {
    if (!validateForm()) {
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await ttsConfigService.testConnection(config);
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: `测试失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 测试语音播放
  const handleTestVoicePlayback = async () => {
    if (!validateForm()) {
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // 使用当前配置进行语音测试
      const testText = config.promptText || '这是TTS语音测试。';

      // 调用Electron API进行语音测试
      const result = await window.electronAPI.invoke('test-tts-voice', {
        ...config,
        testText
      });

      if (result.success) {
        setTestResult({
          success: true,
          message: '语音测试成功！您应该听到了测试语音。'
        });
      } else {
        setTestResult({
          success: false,
          message: `语音测试失败: ${result.message || '未知错误'}`
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `语音测试失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 重置配置
  const handleReset = async () => {
    if (!confirm('确定要重置TTS配置吗？这将删除所有已保存的配置。')) {
      return;
    }

    setIsLoading(true);
    try {
      await ttsConfigService.resetConfig();
      setConfig(ttsConfigService.createDefaultConfig());
      setHasUnsavedChanges(false);
      setTestResult({
        success: true,
        message: '配置已重置！现在将使用系统语音。'
      });
    } catch (error) {
      console.error('重置配置失败:', error);
      setTestResult({
        success: false,
        message: `重置失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 处理ESC键关闭
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isVisible) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, onClose]);

  // 处理点击遮罩关闭
  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isVisible) {
    return null;
  }

  const configStatus = ttsConfigService.getConfigStatus(
    ttsConfigService.isConfigComplete(config) ? config : null
  );

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>TTS语音配置</h3>
          <button
            className={styles.closeButton}
            onClick={onClose}
            disabled={isLoading}
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.content}>
          {/* 配置状态指示器 */}
          <div className={`${styles.statusIndicator} ${styles[configStatus.status === 'complete' ? 'success' : configStatus.status === 'incomplete' ? 'warning' : 'error']}`}>
            <div className={styles.statusIcon}>
              {configStatus.status === 'complete' ? <CheckIcon /> : <ErrorIcon />}
            </div>
            {configStatus.message}
          </div>

          {/* 基本配置 */}
          <div className={styles.configGroup}>
            <h4 className={styles.groupTitle}>
              <div className={styles.groupIcon}><SettingsIcon /></div>
              基本配置
            </h4>

            <div className={styles.formItem}>
              <label className={styles.label}>
                服务器地址 <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className={`${styles.input} ${errors.hostname ? styles.error : ''}`}
                value={config.hostname}
                onChange={(e) => handleInputChange('hostname', e.target.value)}
                placeholder="例如: example.com 或 192.168.1.100"
                disabled={isLoading}
              />
              {errors.hostname && (
                <div className={styles.errorText}>
                  <ErrorIcon />
                  {errors.hostname}
                </div>
              )}
              <div className={styles.helpText}>
                TTS服务的域名或IP地址
              </div>
            </div>

            <div className={styles.inputGroup}>
              <div className={styles.formItem}>
                <label className={styles.label}>
                  端口 <span className={styles.required}>*</span>
                </label>
                <input
                  type="number"
                  className={`${styles.input} ${errors.port ? styles.error : ''}`}
                  value={config.port}
                  onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 0)}
                  placeholder="8443"
                  min="1"
                  max="65535"
                  disabled={isLoading}
                />
                {errors.port && (
                  <div className={styles.errorText}>
                    <ErrorIcon />
                    {errors.port}
                  </div>
                )}
              </div>

              <div className={styles.formItem}>
                <label className={styles.label}>
                  请求路径 <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={`${styles.input} ${errors.path ? styles.error : ''}`}
                  value={config.path}
                  onChange={(e) => handleInputChange('path', e.target.value)}
                  placeholder="/voice_clone_direct"
                  disabled={isLoading}
                />
                {errors.path && (
                  <div className={styles.errorText}>
                    <ErrorIcon />
                    {errors.path}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 音频配置 */}
          <div className={styles.configGroup}>
            <h4 className={styles.groupTitle}>
              <div className={styles.groupIcon}>🎵</div>
              音频配置
            </h4>

            <div className={styles.formItem}>
              <label className={styles.label}>
                音频URL <span className={styles.required}>*</span>
              </label>
              <input
                type="url"
                className={`${styles.input} ${errors.audioUrl ? styles.error : ''}`}
                value={config.audioUrl}
                onChange={(e) => handleInputChange('audioUrl', e.target.value)}
                placeholder="https://example.com/audio.wav"
                disabled={isLoading}
              />
              {errors.audioUrl && (
                <div className={styles.errorText}>
                  <ErrorIcon />
                  {errors.audioUrl}
                </div>
              )}
              <div className={styles.helpText}>
                用于语音克隆的参考音频文件URL
              </div>
            </div>

            <div className={styles.formItem}>
              <label className={styles.label}>
                提示文本 <span className={styles.required}>*</span>
              </label>
              <textarea
                className={`${styles.input} ${styles.textarea} ${errors.promptText ? styles.error : ''}`}
                value={config.promptText}
                onChange={(e) => handleInputChange('promptText', e.target.value)}
                placeholder="请输入用于语音合成的提示文本..."
                maxLength={500}
                disabled={isLoading}
              />
              {errors.promptText && (
                <div className={styles.errorText}>
                  <ErrorIcon />
                  {errors.promptText}
                </div>
              )}
              <div className={styles.helpText}>
                用于语音合成的示例文本 ({config.promptText.length}/500)
              </div>
            </div>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div className={`${styles.testResult} ${testResult.success ? styles.success : styles.error}`}>
              <div className={styles.resultHeader}>
                {testResult.success ? <CheckIcon /> : <ErrorIcon />}
                {testResult.success ? '测试成功' : '测试失败'}
              </div>
              <div className={styles.resultDetails}>
                {testResult.message}
                {testResult.latency && ` (延迟: ${testResult.latency}ms)`}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className={styles.buttonGroup}>
            <button
              className={`${styles.button} ${styles.secondaryButton}`}
              onClick={handleTestConnection}
              disabled={isLoading || isTesting}
            >
              {isTesting ? (
                <>
                  <div className={styles.spinner} />
                  测试中...
                </>
              ) : (
                <>
                  <TestIcon />
                  测试连接
                </>
              )}
            </button>

            <button
              className={`${styles.button} ${styles.secondaryButton}`}
              onClick={handleTestVoicePlayback}
              disabled={isLoading || isTesting}
            >
              {isTesting ? (
                <>
                  <div className={styles.spinner} />
                  播放中...
                </>
              ) : (
                <>
                  <PlayIcon />
                  语音测试
                </>
              )}
            </button>

            <button
              className={`${styles.button} ${styles.primaryButton}`}
              onClick={handleSave}
              disabled={isLoading || !hasUnsavedChanges}
            >
              <SaveIcon />
              保存配置
            </button>

            <button
              className={`${styles.button} ${styles.dangerButton}`}
              onClick={handleReset}
              disabled={isLoading}
            >
              <ResetIcon />
              重置
            </button>
          </div>
        </div>

        {/* 加载遮罩 */}
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingSpinner}>
              <div className={styles.spinner} />
              <div className={styles.loadingText}>处理中...</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};