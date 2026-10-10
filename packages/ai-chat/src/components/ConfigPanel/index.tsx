import { Badge, Button, Card, EmptyState, FormField, Input, Modal, Switch } from '@ig-live/ui';
import React, { useState, useEffect } from 'react';

import { useAiChat } from '../../contexts/AiChatContext';
import { type AIModelConfig } from '../../types/config';

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

  const handleInputChange = (
    field: keyof AIModelConfig,
    value: AIModelConfig[keyof AIModelConfig],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
    <Modal open onClose={onClose} title="AI模型配置" closeOnOverlay={false}>
      {editingModel ? (
        <div className={styles.editForm}>
          <h3 className="cd-section-title">编辑模型: {editingModel.name}</h3>
          <FormField label="模型名称">
            <Input
              type="text"
              value={formData.name || ''}
              onChange={(e) => handleInputChange('name', e.target.value)}
            />
          </FormField>
          <FormField label="API URL">
            <Input
              type="text"
              value={formData.apiUrl || ''}
              onChange={(e) => handleInputChange('apiUrl', e.target.value)}
            />
          </FormField>
          <FormField label="API 密钥">
            <Input
              type="password"
              value={formData.apiKey || ''}
              onChange={(e) => handleInputChange('apiKey', e.target.value)}
              placeholder="输入API密钥"
            />
          </FormField>
          <FormField label="模型">
            <Input
              type="text"
              value={formData.model || ''}
              onChange={(e) => handleInputChange('model', e.target.value)}
            />
          </FormField>
          <div className={styles.twoCol}>
            <FormField label="温度 (0-1)">
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={formData.temperature || 0.7}
                onChange={(e) => handleInputChange('temperature', parseFloat(e.target.value))}
              />
            </FormField>
            <FormField label="最大Token数">
              <Input
                type="number"
                min="1"
                max="8192"
                value={formData.maxTokens || 2048}
                onChange={(e) => handleInputChange('maxTokens', parseInt(e.target.value))}
              />
            </FormField>
          </div>
          <Switch
            checked={formData.enabled || false}
            onChange={(v) => handleInputChange('enabled', v)}
            label="启用此模型"
          />
          <div className="cd-row">
            <Button variant="primary" onClick={handleSaveModel}>
              保存
            </Button>
            <Button onClick={handleCancelEdit}>取消</Button>
          </div>
        </div>
      ) : (
        <div className={styles.modelList}>
          <h3 className="cd-section-title">可用模型</h3>
          {state.models.length === 0 && <EmptyState icon="🤖" title="暂无模型" />}
          {state.models.map((model) => (
            <Card
              key={model.id}
              flat
              title={
                <>
                  {model.name}{' '}
                  <Badge tone={model.enabled ? 'success' : 'neutral'}>
                    {model.enabled ? '已启用' : '已禁用'}
                  </Badge>
                </>
              }
              subtitle={
                <>
                  {model.provider} • {model.model}
                  <div className="cd-code">{model.apiUrl}</div>
                </>
              }
              actions={
                <>
                  <Button size="sm" onClick={() => handleEditModel(model)}>
                    编辑
                  </Button>
                  {model.enabled && model.apiKey && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleTestConnection(model.id)}
                    >
                      测试连接
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}
    </Modal>
  );
};
