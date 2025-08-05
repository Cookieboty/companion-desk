import React, { useState, useEffect } from 'react';
import { useAiChat } from '../../contexts/AiChatContext';
import { AIModelConfig } from '../../types/config';
import styles from './index.module.css';

interface ConfigPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ isVisible, onClose }) => {
  const { state, actions } = useAiChat();
  const [editingModel, setEditingModel] = useState<AIModelConfig | null>(null);
  const [formData, setFormData] = useState<Partial<AIModelConfig>>({});

  useEffect(() => {
    if (editingModel) {
      setFormData({ ...editingModel });
    }
  }, [editingModel]);

  const handleEditModel = (model: AIModelConfig) => {
    setEditingModel(model);
  };

  const handleSaveModel = async () => {
    if (!editingModel || !formData) return;

    try {
      // 调用Context中的updateModel方法
      await actions.updateModel(editingModel.id, formData);

      setEditingModel(null);
      setFormData({});

      alert('模型配置已保存');
    } catch (error) {
      console.error('保存模型配置失败:', error);
      alert(`保存失败: ${error}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingModel(null);
    setFormData({});
  };

  const handleInputChange = (field: keyof AIModelConfig, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTestConnection = async (modelId: string) => {
    try {
      const result = await state.ipcClient.testModelConnection(modelId);
      if (result) {
        alert('连接测试成功！');
      } else {
        alert('连接测试失败，请检查配置');
      }
    } catch (error) {
      alert(`连接测试失败: ${error}`);
    }
  };

  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.configPanel}>
        <div className={styles.header}>
          <h2>AI模型配置</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {editingModel ? (
            <div className={styles.editForm}>
              <h3>编辑模型: {editingModel.name}</h3>

              <div className={styles.formGroup}>
                <label>模型名称</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>API URL</label>
                <input
                  type="text"
                  value={formData.apiUrl || ''}
                  onChange={(e) => handleInputChange('apiUrl', e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>API 密钥</label>
                <input
                  type="password"
                  value={formData.apiKey || ''}
                  onChange={(e) => handleInputChange('apiKey', e.target.value)}
                  placeholder="输入API密钥"
                />
              </div>

              <div className={styles.formGroup}>
                <label>模型名称</label>
                <input
                  type="text"
                  value={formData.model || ''}
                  onChange={(e) => handleInputChange('model', e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>温度 (0-1)</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.temperature || 0.7}
                  onChange={(e) => handleInputChange('temperature', parseFloat(e.target.value))}
                />
              </div>

              <div className={styles.formGroup}>
                <label>最大Token数</label>
                <input
                  type="number"
                  min="1"
                  max="8192"
                  value={formData.maxTokens || 2048}
                  onChange={(e) => handleInputChange('maxTokens', parseInt(e.target.value))}
                />
              </div>

              <div className={styles.formGroup}>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.enabled || false}
                    onChange={(e) => handleInputChange('enabled', e.target.checked)}
                  />
                  启用此模型
                </label>
              </div>

              <div className={styles.formActions}>
                <button className={styles.saveButton} onClick={handleSaveModel}>
                  保存
                </button>
                <button className={styles.cancelButton} onClick={handleCancelEdit}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.modelList}>
              <h3>可用模型</h3>
              {state.models.map((model) => (
                <div key={model.id} className={styles.modelItem}>
                  <div className={styles.modelInfo}>
                    <div className={styles.modelName}>
                      {model.name}
                      <span className={`${styles.status} ${model.enabled ? styles.enabled : styles.disabled}`}>
                        {model.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    <div className={styles.modelDetails}>
                      {model.provider} • {model.model}
                    </div>
                    <div className={styles.modelUrl}>
                      {model.apiUrl}
                    </div>
                  </div>
                  <div className={styles.modelActions}>
                    <button
                      className={styles.editButton}
                      onClick={() => handleEditModel(model)}
                    >
                      编辑
                    </button>
                    {model.enabled && model.apiKey && (
                      <button
                        className={styles.testButton}
                        onClick={() => handleTestConnection(model.id)}
                      >
                        测试连接
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 