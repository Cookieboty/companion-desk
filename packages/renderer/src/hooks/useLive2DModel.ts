import { useState, useEffect, useCallback, useRef } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { getCache, setCache } from '@/utils/cache';
import { customFetch } from '@/utils/live2d-utils';
import logger from '@/utils/logger';

// 定义模型项的接口
interface ModelItem {
  name: string;
  path: string;
  message?: string;
  textures?: string[];
}

export function useLive2DModel() {
  const { state, dispatch, config } = useLive2D();
  const [cubism2Model, setCubism2Model] = useState<any>(null);
  const modelJSONCache = useRef<Record<string, any>>({});
  const loadingRef = useRef(false);

  // 加载模型列表
  const loadModelList = useCallback(async () => {
    try {
      console.log('开始加载模型列表...');
      dispatch({ type: 'SET_LOADING', payload: true });

      // 从CDN加载模型列表
      if (config.cdnPath) {
        console.log('使用CDN路径加载模型列表:', config.cdnPath);
        const cdnPath = config.cdnPath.endsWith('/') ? config.cdnPath : `${config.cdnPath}/`;
        const response = await customFetch(`${cdnPath}model_list.json`);
        const modelList = await response.json();

        if (modelList && modelList.models) {
          console.log('成功加载CDN模型列表:', modelList);
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

          console.log('格式化后的模型列表:', formattedList);
          dispatch({ type: 'SET_MODEL_LIST', payload: formattedList });

          // 尝试从缓存中恢复上次保存的模型
          const savedModelName = await getCache<string>('modelName');
          if (savedModelName) {
            console.log('从缓存中恢复的模型名称:', savedModelName);
            const modelIndex = formattedList.findIndex((model: ModelItem) => model.name === savedModelName);
            if (modelIndex >= 0) {
              console.log('找到匹配的模型索引:', modelIndex);
              dispatch({ type: 'SET_MODEL_ID', payload: modelIndex });
            }
          }
        }
      }
      // 从本地配置加载模型列表
      else if (config.waifuPath) {
        console.log('使用本地配置加载模型列表:', config.waifuPath);
        const response = await customFetch(config.waifuPath);
        const waifuConfig = await response.json();

        if (waifuConfig && waifuConfig.models) {
          console.log('成功加载本地模型配置:', waifuConfig);
          const formattedList = waifuConfig.models.map((model: any) => ({
            name: model.name,
            path: model.paths[0], // 使用第一个路径
            message: model.message || '模型已加载',
            textures: model.paths // 所有路径作为纹理
          }));

          console.log('格式化后的本地模型列表:', formattedList);
          dispatch({ type: 'SET_MODEL_LIST', payload: formattedList });

          // 尝试从缓存中恢复上次保存的模型
          const savedModelName = await getCache<string>('modelName');
          if (savedModelName) {
            console.log('从缓存中恢复的本地模型名称:', savedModelName);
            const modelIndex = formattedList.findIndex((model: ModelItem) =>
              model.name === savedModelName ||
              model.path.includes(savedModelName)
            );
            if (modelIndex >= 0) {
              console.log('找到匹配的本地模型索引:', modelIndex);
              dispatch({ type: 'SET_MODEL_ID', payload: modelIndex });
            }
          }
        }
      } else {
        console.log('未配置模型来源(cdnPath或waifuPath)');
      }

      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      console.error('加载模型列表失败:', error);
      logger.error('加载模型列表失败:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [config, dispatch]);

  // 加载模型设置
  const fetchModelSetting = useCallback(async (modelPath: string) => {
    console.log('加载模型设置:', modelPath);
    // 检查缓存中是否有此模型设置
    if (modelPath in modelJSONCache.current) {
      console.log('使用缓存的模型设置');
      return modelJSONCache.current[modelPath];
    }

    // 如果没有则从网络加载
    try {
      console.log('从网络加载模型设置');
      const response = await customFetch(modelPath);
      const modelSetting = await response.json();
      modelJSONCache.current[modelPath] = modelSetting;
      console.log('模型设置加载成功');
      return modelSetting;
    } catch (error) {
      console.error(`加载模型设置失败: ${modelPath}`, error);
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
    console.log(`开始加载模型, 索引: ${modelIndex}`);
    if (loadingRef.current) {
      console.log('模型加载中，忽略请求');
      return;
    }

    if (!state.modelList || state.modelList.length === 0) {
      console.error('模型列表为空，无法加载模型');
      return;
    }

    if (!state.modelList[modelIndex]) {
      console.error(`模型索引 ${modelIndex} 无效，超出范围`);
      return;
    }

    // 检查Live2D库是否已初始化
    if (!state.isInitialized) {
      console.warn('Live2D库尚未初始化，无法加载模型');
      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '模型引擎正在加载中，请稍候',
          priority: 10
        }
      });
      return;
    }

    loadingRef.current = true;
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const model = state.modelList[modelIndex];
      console.log('加载模型:', model);

      // 保存模型到缓存
      await setCache('modelName', model.name);
      console.log('模型名称已保存到缓存:', model.name);
      dispatch({ type: 'SET_MODEL_ID', payload: modelIndex });

      const modelSetting = await fetchModelSetting(model.path);
      const version = checkModelVersion(modelSetting);
      console.log(`模型${model.name}版本:`, version);

      if (version === 2) {
        // 初始化Cubism2模型
        console.log('开始初始化Cubism2模型');
        if (!cubism2Model && config.cubism2Path) {
          console.log('首次加载Cubism2引擎，路径:', config.cubism2Path);
          // 动态导入Cubism2
          const { default: Cubism2Model } = await import('@/cubism2/index');
          const modelInstance = new Cubism2Model();
          setCubism2Model(modelInstance);

          // 初始化模型
          console.log('初始化模型实例');
          await modelInstance.init('live2d', model.path, modelSetting);
        } else if (cubism2Model) {
          // 如果已经加载了Cubism2，直接初始化新模型
          console.log('使用已有的Cubism2实例初始化新模型');
          await cubism2Model.init('live2d', model.path, modelSetting);
        } else {
          console.error('未配置cubism2Path，无法加载Cubism2核心');
        }

        // 显示消息
        console.log('发送模型加载完成消息');
        dispatch({
          type: 'SET_MESSAGE',
          payload: {
            text: model.message || '模型加载完成',
            priority: 10
          }
        });
      } else {
        console.warn(`不支持的模型版本: ${version}`);
        logger.warn(`Model ${model.path} has version ${version} which is not supported`);
      }
    } catch (error) {
      console.error('加载模型失败:', error);
      logger.error('加载模型失败:', error);
      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '模型加载失败',
          priority: 10
        }
      });
    } finally {
      loadingRef.current = false;
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.modelList, dispatch, fetchModelSetting, checkModelVersion, cubism2Model, config.cubism2Path]);

  // 加载随机纹理
  const loadRandomTexture = useCallback(async () => {
    console.log('尝试加载随机纹理');
    if (!state.modelList || state.modelList.length === 0 || state.modelId >= state.modelList.length) {
      console.error('模型列表为空或当前模型索引超出范围');
      return;
    }

    const currentModel = state.modelList[state.modelId];
    if (!currentModel || !currentModel.textures || currentModel.textures.length <= 1) {
      console.log('当前模型没有多个纹理可供切换');
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

    console.log(`切换到纹理索引: ${newTextureId}`);
    dispatch({ type: 'SET_TEXTURE_ID', payload: newTextureId });

    // 加载新纹理
    try {
      const texturePath = currentModel.textures[newTextureId];
      console.log('加载新纹理路径:', texturePath);

      // 这里我们需要重新加载模型以使用新的纹理路径
      if (cubism2Model) {
        const modelSetting = await fetchModelSetting(texturePath);
        console.log('纹理模型设置已加载，开始初始化');
        await cubism2Model.init('live2d', texturePath, modelSetting);

        dispatch({
          type: 'SET_MESSAGE',
          payload: {
            text: '纹理更换成功',
            priority: 10
          }
        });
      } else {
        console.error('Cubism2模型实例不存在，无法更换纹理');
        dispatch({
          type: 'SET_MESSAGE',
          payload: {
            text: '更换纹理失败:模型未初始化',
            priority: 10
          }
        });
      }
    } catch (error) {
      console.error('加载纹理失败:', error);
      logger.error('加载纹理失败:', error);
      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '纹理更换失败',
          priority: 10
        }
      });
    }
  }, [state.modelList, state.modelId, state.textureId, dispatch, cubism2Model, fetchModelSetting]);

  // 加载下一个模型
  const loadNextModel = useCallback(async () => {
    console.log('尝试加载下一个模型');
    if (!state.modelList || state.modelList.length === 0) {
      console.error('模型列表为空，无法加载下一个模型');
      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '没有可用的模型',
          priority: 10
        }
      });
      return;
    }

    if (state.modelList.length <= 1) {
      console.log('只有一个模型可用，无需切换');
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
    console.log(`当前模型索引: ${state.modelId}, 下一个模型索引: ${nextModelId}`);

    dispatch({ type: 'SET_TEXTURE_ID', payload: 0 }); // 重置纹理ID
    try {
      await loadModel(nextModelId);
      console.log('下一个模型加载成功');
    } catch (error) {
      console.error('加载下一个模型失败:', error);
      dispatch({
        type: 'SET_MESSAGE',
        payload: {
          text: '切换模型失败',
          priority: 10
        }
      });
    }
  }, [state.modelList, state.modelId, loadModel, dispatch]);

  // 初始化
  useEffect(() => {
    console.log('useLive2DModel初始化，加载模型列表');
    loadModelList();
  }, [loadModelList]);

  // 当模型列表加载完成后，如果库已初始化则自动加载第一个模型
  useEffect(() => {
    if (state.modelList && state.modelList.length > 0 && !loadingRef.current && state.isInitialized) {
      console.log('模型列表加载完成，库已初始化，自动加载第一个模型');
      // 检查当前modelId是否有效，如果无效则加载第一个模型
      const modelIdToLoad = state.modelId < state.modelList.length ? state.modelId : 0;
      loadModel(modelIdToLoad);
    } else if (state.modelList && state.modelList.length > 0 && !state.isInitialized) {
      console.log('模型列表已加载，但库尚未初始化，等待初始化完成');
    }
  }, [state.modelList, loadModel, state.isInitialized]);

  // 当模型ID变化时加载对应模型
  useEffect(() => {
    console.log('模型ID变更:', state.modelId);
    if (state.modelList && state.modelList.length > 0 && state.modelId < state.modelList.length && state.isInitialized) {
      console.log('模型ID变更触发加载:', state.modelId);
      // 为了避免无限循环，不要在这里加载模型
      // 模型加载应该由切换动作触发
    }
  }, [state.modelId, state.modelList, state.isInitialized]);

  return {
    loadModel,
    loadRandomTexture,
    loadNextModel,
    cubism2Model,
  };
} 