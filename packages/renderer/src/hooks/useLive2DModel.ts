import { useState, useEffect, useCallback, useRef } from 'react';
import { useLive2D, ModelItem } from '@/contexts/Live2DContext';
import { getCache, setCache } from '@/utils/cache';
import { customFetch } from '@/utils/live2d-utils';
import logger from '@/utils/logger';
import { DEFAULT_ADAPTIVE_CONFIG } from '@/config/adaptive-defaults';

// 使用新的模型结构定义，与costume_model_list.json保持一致
interface CostumeModelItem {
  name: string;
  path: string;
  message: string;
  costumes?: string[]; // 换装列表，包含不同服装的模型路径
}

// 模型列表结构
interface ModelList {
  models: CostumeModelItem[];
}

export function useLive2DModel() {
  const { state, dispatch, config } = useLive2D();
  const [cubism2Model, setCubism2Model] = useState<any>(null);
  const modelJSONCache = useRef<Record<string, any>>({});
  const loadingRef = useRef(false);
  const modelListLoadedRef = useRef(false);
  const configRef = useRef(config);
  const dispatchRef = useRef(dispatch);
  const loadModelRef = useRef<((modelIndex: number) => Promise<void>) | null>(null);
  const modelListRef = useRef<ModelItem[]>([]);
  const isInitializedRef = useRef(false);
  const modelIdRef = useRef(state.modelId);

  // 更新refs
  useEffect(() => {
    configRef.current = config;
    dispatchRef.current = dispatch;
    modelListRef.current = state.modelList;
    isInitializedRef.current = state.isInitialized;
    modelIdRef.current = state.modelId;
  }, [config, dispatch, state.modelList, state.isInitialized, state.modelId]);

  // 加载模型列表 - 使用新的costume_model_list.json结构
  const loadModelList = useCallback(async () => {
    if (loadingRef.current || modelListLoadedRef.current) {
      console.log('模型列表已加载或正在加载中，跳过重复请求');
      return;
    }

    try {
      console.log('开始加载模型列表...');
      loadingRef.current = true;
      dispatchRef.current({ type: 'SET_LOADING', payload: true });

      // 加载新的costume_model_list.json文件
      const response = await customFetch('./assets/costume_model_list.json');
      const modelConfig: ModelList = await response.json();

      if (modelConfig && modelConfig.models && modelConfig.models.length > 0) {
        console.log('成功加载模型配置:', modelConfig.models.length, '个模型');

        // 直接使用新结构，无需转换
        const formattedList: ModelItem[] = modelConfig.models.map((model: CostumeModelItem) => ({
          name: model.name,
          path: `./assets/models/${model.path}`,
          message: model.message,
          costumes: model.costumes ? model.costumes.map((costume: string) => `./assets/models/${costume}`) : undefined
        }));

        dispatchRef.current({ type: 'SET_MODEL_LIST', payload: formattedList });

        // 尝试从缓存中恢复上次保存的模型
        const savedModelName = await getCache<string>('modelName');
        if (savedModelName) {
          console.log('从缓存中恢复的模型名称:', savedModelName);
          const modelIndex = formattedList.findIndex((model: ModelItem) =>
            model.name === savedModelName
          );
          if (modelIndex >= 0) {
            console.log('找到匹配的模型索引:', modelIndex);
            dispatchRef.current({ type: 'SET_MODEL_ID', payload: modelIndex });

            // 恢复换装索引
            const savedTextureId = await getCache<number>('modelTexturesId') || 0;
            const currentModel = formattedList[modelIndex];
            const maxCostumes = currentModel.costumes ? currentModel.costumes.length : 1;

            if (savedTextureId < maxCostumes) {
              dispatchRef.current({ type: 'SET_TEXTURE_ID', payload: savedTextureId });
            }
          }
        }

        modelListLoadedRef.current = true;
        console.log('模型配置加载完成');
      } else {
        console.warn('模型配置文件为空或格式错误');
        dispatchRef.current({
          type: 'SET_MESSAGE',
          payload: {
            text: '模型配置文件为空或格式错误',
            priority: 100
          }
        });
      }

    } catch (error) {
      console.error('加载模型列表失败:', error);
      logger.error('加载模型列表失败:', error);

      // 显示错误信息
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '模型加载失败，请检查模型文件',
          priority: 100
        }
      });
    } finally {
      loadingRef.current = false;
      dispatchRef.current({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // 加载模型设置
  const fetchModelSetting = useCallback(async (modelPath: string) => {
    console.log('加载模型设置:', modelPath);
    // 检查缓存中是否有此模型设置
    if (modelPath in modelJSONCache.current) {
      console.log('使用缓存的模型设置');
      const cachedSetting = modelJSONCache.current[modelPath];
      // 移除背景图片配置，确保透明背景
      if (cachedSetting.background) {
        delete cachedSetting.background;
        console.log('已移除缓存模型配置中的背景图片设置');
      }
      return cachedSetting;
    }

    // 如果没有则从网络加载
    try {
      console.log('从网络加载模型设置');
      const response = await customFetch(modelPath);
      const modelSetting = await response.json();

      // 移除背景图片配置，确保透明背景
      if (modelSetting.background) {
        console.log('检测到模型配置中的背景图片，正在移除:', modelSetting.background);
        delete modelSetting.background;
        console.log('已移除模型配置中的背景图片设置');
      }

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

    const currentModelList = modelListRef.current;
    const currentIsInitialized = isInitializedRef.current;

    if (!currentModelList || currentModelList.length === 0) {
      console.error('模型列表为空，无法加载模型');
      return;
    }

    if (!currentModelList[modelIndex]) {
      console.error(`模型索引 ${modelIndex} 无效，超出范围`);
      return;
    }

    // 检查Live2D库是否已初始化
    if (!currentIsInitialized) {
      console.warn('Live2D库尚未初始化，无法加载模型');
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '模型引擎正在加载中，请稍候',
          priority: 10
        }
      });
      return;
    }

    loadingRef.current = true;
    dispatchRef.current({ type: 'SET_LOADING', payload: true });

    try {
      const model = currentModelList[modelIndex];
      console.log('加载模型:', model);

      // 保存模型到缓存
      await setCache('modelName', model.name);
      console.log('模型名称已保存到缓存:', model.name);

      // 获取当前要加载的模型路径（考虑换装）
      const currentTextureId = state.textureId || 0;
      let modelPath = model.path;

      // 如果有换装且当前纹理ID大于0，使用换装路径
      if (model.costumes && currentTextureId > 0 && currentTextureId <= model.costumes.length) {
        modelPath = model.costumes[currentTextureId - 1];
        console.log('使用换装路径:', modelPath);
      }

      const modelSetting = await fetchModelSetting(modelPath);
      const version = checkModelVersion(modelSetting);
      console.log(`模型${model.name}版本:`, version);

      if (version === 2) {
        // 初始化Cubism2模型
        console.log('开始初始化Cubism2模型');
        if (!cubism2Model && configRef.current.cubism2Path) {
          console.log('首次加载Cubism2引擎，路径:', configRef.current.cubism2Path);
          // 动态导入Cubism2
          const { default: Cubism2Model } = await import('@/cubism2/index');
          const modelInstance = new Cubism2Model();
          setCubism2Model(modelInstance);

          // 使用标准方法初始化模型
          console.log('使用标准方法初始化模型实例');
          await modelInstance.init('live2d', modelPath, modelSetting);

        } else if (cubism2Model) {
          // 如果已经加载了Cubism2，使用changeModelWithJSON方法切换模型
          console.log('使用已有的Cubism2实例，切换到新模型');
          await cubism2Model.changeModelWithJSON(modelPath, modelSetting);

        } else {
          console.error('未配置cubism2Path，无法加载Cubism2核心');
        }

        // 显示消息
        console.log('发送模型加载完成消息');
        dispatchRef.current({
          type: 'SET_MESSAGE',
          payload: {
            text: model.message || '模型加载完成',
            priority: 10
          }
        });
      } else {
        console.warn(`不支持的模型版本: ${version}`);
        logger.warn(`Model ${modelPath} has version ${version} which is not supported`);
      }
    } catch (error) {
      console.error('加载模型失败:', error);
      logger.error('加载模型失败:', error);

      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '模型加载失败，请检查模型文件',
          priority: 100
        }
      });
    } finally {
      loadingRef.current = false;
      dispatchRef.current({ type: 'SET_LOADING', payload: false });
    }
  }, [state.textureId, cubism2Model]);

  // 存储loadModel函数引用
  useEffect(() => {
    loadModelRef.current = loadModel;
  }, [loadModel]);

  // 切换到下一个模型
  const loadNextModel = useCallback(async () => {
    const currentModelList = modelListRef.current;
    const currentModelId = modelIdRef.current;

    if (!currentModelList || currentModelList.length === 0) {
      console.warn('模型列表为空，无法切换模型');
      return;
    }

    const nextModelId = (currentModelId + 1) % currentModelList.length;
    console.log(`切换到下一个模型: ${currentModelId} -> ${nextModelId}`);

    // 重置纹理ID为0（默认服装）
    dispatchRef.current({ type: 'SET_TEXTURE_ID', payload: 0 });
    dispatchRef.current({ type: 'SET_MODEL_ID', payload: nextModelId });

    // 加载新模型
    if (loadModelRef.current) {
      await loadModelRef.current(nextModelId);
    }
  }, []);

  // 优化的换装功能 - 使用新的costumes结构
  const loadRandomTexture = useCallback(async () => {
    const currentModelList = modelListRef.current;
    const currentModelId = modelIdRef.current;
    const currentTextureId = state.textureId;

    if (!currentModelList || currentModelList.length === 0) {
      console.warn('模型列表为空，无法切换换装');
      return;
    }

    const currentModel = currentModelList[currentModelId];
    if (!currentModel) {
      console.warn('当前模型不存在');
      return;
    }

    // 计算可用的换装数量（包括默认服装）
    const totalCostumes = currentModel.costumes ? currentModel.costumes.length + 1 : 1;

    if (totalCostumes <= 1) {
      console.log('当前模型没有换装');
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '当前模型没有换装',
          priority: 5
        }
      });
      return;
    }

    // 切换到下一个换装
    const nextTextureId = (currentTextureId + 1) % totalCostumes;
    console.log(`切换换装: ${currentTextureId} -> ${nextTextureId}`);

    dispatchRef.current({ type: 'SET_TEXTURE_ID', payload: nextTextureId });

    // 保存换装索引到缓存
    await setCache('modelTexturesId', nextTextureId);

    // 重新加载模型以应用新的换装
    if (loadModelRef.current) {
      await loadModelRef.current(currentModelId);
    }

    // 显示换装消息
    const costumeMessage = nextTextureId === 0 ? '默认服装' : `换装 ${nextTextureId}`;
    dispatchRef.current({
      type: 'SET_MESSAGE',
      payload: {
        text: `${currentModel.name} - ${costumeMessage}`,
        priority: 5
      }
    });
  }, [state.textureId]);

  // 初始化时加载模型列表
  useEffect(() => {
    if (!modelListLoadedRef.current) {
      loadModelList();
    }
  }, [loadModelList]);

  // 当模型ID变化时加载对应模型
  useEffect(() => {
    if (state.isInitialized && state.modelList.length > 0 && loadModelRef.current) {
      loadModelRef.current(state.modelId);
    }
  }, [state.modelId, state.isInitialized, state.modelList.length]);

  return {
    cubism2Model,
    loadNextModel,
    loadRandomTexture,
    loadModelList
  };
} 