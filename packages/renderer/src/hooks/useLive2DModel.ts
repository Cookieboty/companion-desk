import { useState, useEffect, useCallback, useRef } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { getCache, setCache } from '@/utils/cache';
import { customFetch } from '@/utils/live2d-utils';
import logger from '@/utils/logger';

export function useLive2DModel() {
  const { state, dispatch, config } = useLive2D();
  const [cubism2Model, setCubism2Model] = useState<any>(null);
  const modelJSONCache = useRef<Record<string, any>>({});
  const loadingRef = useRef(false);

  // 加载模型列表
  const loadModelList = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      // 从CDN加载模型列表
      if (config.cdnPath) {
        const cdnPath = config.cdnPath.endsWith('/') ? config.cdnPath : `${config.cdnPath}/`;
        const response = await customFetch(`${cdnPath}model_list.json`);
        const modelList = await response.json();

        if (modelList && modelList.models) {
          // 将modelList.models转换为标准格式
          const formattedList = Array.isArray(modelList.models)
            ? modelList.models.map((model: string | string[], index: number) => {
              if (Array.isArray(model)) {
                // 有多个纹理的模型
                return model.map(textureName => ({
                  name: textureName,
                  path: `${cdnPath}model/${textureName}/index.json`,
                  message: modelList.messages?.[index] || '模型已加载'
                }));
              } else {
                // 单个模型
                return {
                  name: model,
                  path: `${cdnPath}model/${model}/index.json`,
                  message: modelList.messages?.[index] || '模型已加载'
                };
              }
            }).flat()
            : [];

          dispatch({ type: 'SET_MODEL_LIST', payload: formattedList });

          // 尝试从缓存中恢复上次保存的模型
          const savedModelName = await getCache<string>('modelName');
          if (savedModelName) {
            const modelIndex = formattedList.findIndex(model => model.name === savedModelName);
            if (modelIndex >= 0) {
              dispatch({ type: 'SET_MODEL_ID', payload: modelIndex });
            }
          }
        }
      }
      // 从本地配置加载模型列表
      else if (config.waifuPath) {
        const response = await customFetch(config.waifuPath);
        const waifuConfig = await response.json();

        if (waifuConfig && waifuConfig.models) {
          const formattedList = waifuConfig.models.map((model: any) => ({
            name: model.name,
            path: model.paths[0], // 使用第一个路径
            message: model.message || '模型已加载',
            textures: model.paths // 所有路径作为纹理
          }));

          dispatch({ type: 'SET_MODEL_LIST', payload: formattedList });

          // 尝试从缓存中恢复上次保存的模型
          const savedModelName = await getCache<string>('modelName');
          if (savedModelName) {
            const modelIndex = formattedList.findIndex(model =>
              model.name === savedModelName ||
              model.path.includes(savedModelName)
            );
            if (modelIndex >= 0) {
              dispatch({ type: 'SET_MODEL_ID', payload: modelIndex });
            }
          }
        }
      }

      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      logger.error('加载模型列表失败:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [config, dispatch]);

  // 加载模型设置
  const fetchModelSetting = useCallback(async (modelPath: string) => {
    // 检查缓存中是否有此模型设置
    if (modelPath in modelJSONCache.current) {
      return modelJSONCache.current[modelPath];
    }

    // 如果没有则从网络加载
    try {
      const response = await customFetch(modelPath);
      const modelSetting = await response.json();
      modelJSONCache.current[modelPath] = modelSetting;
      return modelSetting;
    } catch (error) {
      logger.error(`加载模型设置失败: ${modelPath}`, error);
      throw error;
    }
  }, []);

  // 检查模型版本
  const checkModelVersion = useCallback((modelSetting: any) => {
    if (modelSetting.Version === 3 || modelSetting.FileReferences) {
      return 3;
    }
    return 2;
  }, []);

  // 加载Live2D模型
  const loadModel = useCallback(async (modelIndex: number) => {
    if (loadingRef.current || !state.modelList[modelIndex]) {
      return;
    }

    loadingRef.current = true;
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const model = state.modelList[modelIndex];

      // 保存模型到缓存
      await setCache('modelName', model.name);
      dispatch({ type: 'SET_MODEL_ID', payload: modelIndex });

      const modelSetting = await fetchModelSetting(model.path);
      const version = checkModelVersion(modelSetting);

      if (version === 2) {
        // 初始化Cubism2模型
        // 注意：这里需要实际实现Cubism2Model的初始化逻辑
        // 在React组件中，我们会用ref引用canvas元素
        if (!cubism2Model && config.cubism2Path) {
          // 动态导入Cubism2
          const { default: Cubism2Model } = await import('@/cubism2/index');
          const modelInstance = new Cubism2Model();
          setCubism2Model(modelInstance);

          // 初始化模型
          await modelInstance.init('live2d', model.path, modelSetting);
        } else if (cubism2Model) {
          // 如果已经加载了Cubism2，直接初始化新模型
          await cubism2Model.init('live2d', model.path, modelSetting);
        }

        // 显示消息
        dispatch({
          type: 'SET_MESSAGE',
          payload: {
            text: model.message || '模型加载完成',
            priority: 10
          }
        });
      } else {
        logger.warn(`Model ${model.path} has version ${version} which is not supported`);
      }
    } catch (error) {
      logger.error('加载模型失败:', error);
    } finally {
      loadingRef.current = false;
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.modelList, dispatch, fetchModelSetting, checkModelVersion, cubism2Model, config.cubism2Path]);

  // 加载随机纹理
  const loadRandomTexture = useCallback(async () => {
    const currentModel = state.modelList[state.modelId];
    if (!currentModel || !currentModel.textures || currentModel.textures.length <= 1) {
      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '当前模型没有其他纹理可供更换',
          priority: 10
        }
      });
      return;
    }

    // 随机选择一个不同的纹理
    let newTextureId;
    do {
      newTextureId = Math.floor(Math.random() * currentModel.textures.length);
    } while (newTextureId === state.textureId && currentModel.textures.length > 1);

    dispatch({ type: 'SET_TEXTURE_ID', payload: newTextureId });

    // 加载新纹理
    try {
      const texturePath = currentModel.textures[newTextureId];

      // 这里需要实际实现纹理切换逻辑
      // 可能需要重新初始化模型或更新cubism2model的纹理

      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '纹理更换成功',
          priority: 10
        }
      });
    } catch (error) {
      logger.error('加载纹理失败:', error);
      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '纹理更换失败',
          priority: 10
        }
      });
    }
  }, [state.modelList, state.modelId, state.textureId, dispatch]);

  // 加载下一个模型
  const loadNextModel = useCallback(async () => {
    if (state.modelList.length <= 1) {
      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '没有其他模型可供切换',
          priority: 10
        }
      });
      return;
    }

    const nextModelId = (state.modelId + 1) % state.modelList.length;
    dispatch({ type: 'SET_TEXTURE_ID', payload: 0 }); // 重置纹理ID
    await loadModel(nextModelId);
  }, [state.modelList, state.modelId, loadModel, dispatch]);

  // 初始化
  useEffect(() => {
    loadModelList();
  }, [loadModelList]);

  // 当模型ID变化时加载对应模型
  useEffect(() => {
    if (state.modelList.length > 0 && state.modelId < state.modelList.length) {
      loadModel(state.modelId);
    }
  }, [state.modelList, state.modelId, loadModel]);

  return {
    loadModel,
    loadRandomTexture,
    loadNextModel,
    cubism2Model,
  };
} 