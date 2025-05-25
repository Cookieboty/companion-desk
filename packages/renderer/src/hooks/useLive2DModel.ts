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
  textures?: string[]; // 同一模型的不同纹理路径
}

// 定义模型组的接口（用于处理数组格式的模型）
interface ModelGroup {
  models: string[]; // 模型名称数组
  message: string;
  currentIndex: number; // 当前选中的模型索引
}

export function useLive2DModel() {
  const { state, dispatch, config } = useLive2D();
  const [cubism2Model, setCubism2Model] = useState<any>(null);
  const modelJSONCache = useRef<Record<string, any>>({});
  const modelGroupsRef = useRef<ModelGroup[]>([]); // 存储模型组信息
  const loadingRef = useRef(false);
  const modelListLoadedRef = useRef(false); // 添加加载状态标记
  const configRef = useRef(config); // 存储config引用
  const dispatchRef = useRef(dispatch); // 存储dispatch引用
  const loadModelRef = useRef<((modelIndex: number) => Promise<void>) | null>(null); // 存储loadModel函数引用
  const modelListRef = useRef<ModelItem[]>([]); // 存储最新的modelList状态
  const isInitializedRef = useRef(false); // 存储最新的初始化状态

  // 更新refs
  useEffect(() => {
    configRef.current = config;
    dispatchRef.current = dispatch;
    modelListRef.current = state.modelList;
    isInitializedRef.current = state.isInitialized;
  }, [config, dispatch, state.modelList, state.isInitialized]);

  // 加载模型列表
  const loadModelList = useCallback(async () => {
    // 避免重复加载
    if (loadingRef.current || modelListLoadedRef.current) {
      console.log('模型列表已加载或正在加载中，跳过重复请求');
      return;
    }

    try {
      console.log('开始加载本地模型列表...');
      loadingRef.current = true;
      dispatchRef.current({ type: 'SET_LOADING', payload: true });

      // 使用本地模型扫描器加载模型
      const { getLocalModelScanner } = await import('@/utils/localModelScanner');
      const scanner = getLocalModelScanner();
      const { models: scannedModels, groups: scannedGroups } = await scanner.scanLocalModels();

      if (scannedModels.length > 0) {
        console.log('成功扫描到本地模型:', scannedModels.length, '个');
        console.log('本地模型列表:', scannedModels);

        // 转换为项目所需的格式
        const formattedList: ModelItem[] = scannedModels.map((model: any) => ({
          name: model.name,
          path: model.path,
          message: model.message,
          textures: model.textures || [model.path]
        }));

        modelGroupsRef.current = scannedGroups;
        dispatchRef.current({ type: 'SET_MODEL_LIST', payload: formattedList });

        // 尝试从缓存中恢复上次保存的模型
        const savedModelName = await getCache<string>('modelName');
        if (savedModelName) {
          console.log('从缓存中恢复的模型名称:', savedModelName);
          const modelIndex = formattedList.findIndex((model: ModelItem) =>
            model.name === savedModelName || model.path.includes(savedModelName)
          );
          if (modelIndex >= 0) {
            console.log('找到匹配的模型索引:', modelIndex);
            dispatchRef.current({ type: 'SET_MODEL_ID', payload: modelIndex });

            // 恢复纹理索引
            const savedTextureId = await getCache<number>('modelTexturesId') || 0;
            if (savedTextureId < formattedList[modelIndex].textures!.length) {
              dispatchRef.current({ type: 'SET_TEXTURE_ID', payload: savedTextureId });
              // 更新模型组的当前索引
              if (scannedGroups[modelIndex]) {
                scannedGroups[modelIndex].currentIndex = savedTextureId;
              }
            }
          }
        }

        modelListLoadedRef.current = true;
        console.log('本地模型加载完成');
      } else {
        console.warn('未找到本地模型文件');
        // 如果没有本地模型，显示错误信息
        dispatchRef.current({
          type: 'SET_MESSAGE',
          payload: {
            text: '未找到本地模型文件，请检查模型目录',
            priority: 100
          }
        });
      }

    } catch (error) {
      console.error('加载本地模型列表失败:', error);
      logger.error('加载本地模型列表失败:', error);

      // 显示错误信息
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '本地模型加载失败，请检查模型文件',
          priority: 100
        }
      });
    } finally {
      loadingRef.current = false;
      dispatchRef.current({ type: 'SET_LOADING', payload: false });
    }
  }, []); // 移除config和dispatch依赖，避免重复调用

  // 处理模型列表的通用函数
  const processModelList = useCallback(async (modelList: any, basePath: string) => {
    // 处理模型列表，保持原有的组结构
    const formattedList: ModelItem[] = [];
    const modelGroups: ModelGroup[] = [];

    for (let index = 0; index < modelList.models.length; index++) {
      const model = modelList.models[index];
      const message = modelList.messages?.[index] || '模型已加载';

      if (Array.isArray(model)) {
        // 模型组（同一角色的不同服装）
        modelGroups.push({
          models: model,
          message: message,
          currentIndex: 0 // 默认选择第一个
        });

        // 添加组中的第一个模型到列表
        const firstModel = model[0];
        // 统一使用CDN路径格式
        const modelPath = `${basePath}model/${firstModel}/index.json`;

        formattedList.push({
          name: firstModel,
          path: modelPath,
          message: message,
          textures: model.map(m => `${basePath}model/${m}/index.json`)
        });
      } else {
        // 单个模型
        modelGroups.push({
          models: [model],
          message: message,
          currentIndex: 0
        });

        // 统一使用CDN路径格式
        const modelPath = `${basePath}model/${model}/index.json`;

        formattedList.push({
          name: model,
          path: modelPath,
          message: message,
          textures: [modelPath]
        });
      }
    }

    console.log('格式化后的模型列表:', formattedList);
    console.log('模型组信息:', modelGroups);

    modelGroupsRef.current = modelGroups;
    dispatchRef.current({ type: 'SET_MODEL_LIST', payload: formattedList });

    // 尝试从缓存中恢复上次保存的模型
    const savedModelName = await getCache<string>('modelName');
    if (savedModelName) {
      console.log('从缓存中恢复的模型名称:', savedModelName);
      const modelIndex = formattedList.findIndex((model: ModelItem) => model.name === savedModelName);
      if (modelIndex >= 0) {
        console.log('找到匹配的模型索引:', modelIndex);
        dispatchRef.current({ type: 'SET_MODEL_ID', payload: modelIndex });

        // 恢复纹理索引
        const savedTextureId = await getCache<number>('modelTexturesId') || 0;
        if (savedTextureId < formattedList[modelIndex].textures!.length) {
          dispatchRef.current({ type: 'SET_TEXTURE_ID', payload: savedTextureId });
          // 更新模型组的当前索引
          if (modelGroups[modelIndex]) {
            modelGroups[modelIndex].currentIndex = savedTextureId;
          }
        }
      }
    }
  }, []);

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

    // 使用ref获取最新的modelList状态
    const currentModelList = modelListRef.current;
    const currentIsInitialized = isInitializedRef.current;

    if (!currentModelList || currentModelList.length === 0) {
      console.error('模型列表为空，无法加载模型');
      console.log('当前modelList状态:', currentModelList);
      return;
    }

    if (!currentModelList[modelIndex]) {
      console.error(`模型索引 ${modelIndex} 无效，超出范围`);
      console.log('当前modelList长度:', currentModelList.length);
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
      dispatchRef.current({ type: 'SET_MODEL_ID', payload: modelIndex });

      const modelSetting = await fetchModelSetting(model.path);
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
        dispatchRef.current({
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
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '模型加载失败',
          priority: 10
        }
      });
    } finally {
      loadingRef.current = false;
      dispatchRef.current({ type: 'SET_LOADING', payload: false });
    }
  }, [fetchModelSetting, checkModelVersion, cubism2Model]); // 移除state.modelList依赖，在函数内部使用最新的state

  // 更新loadModel引用
  useEffect(() => {
    loadModelRef.current = loadModel;
  }, [loadModel]);

  // 加载随机纹理 - 修复换装功能
  const loadRandomTexture = useCallback(async () => {
    console.log('尝试换装');

    // 使用ref获取最新状态
    const currentModelList = modelListRef.current;
    const currentModelId = state.modelId; // modelId可以直接使用，因为它会触发重新渲染

    if (!currentModelList || currentModelList.length === 0 || currentModelId >= currentModelList.length) {
      console.error('模型列表为空或当前模型索引超出范围');
      return;
    }

    const currentModelGroup = modelGroupsRef.current[currentModelId];
    if (!currentModelGroup || currentModelGroup.models.length <= 1) {
      console.log('当前模型组没有多个服装可供切换');
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '当前模型没有其他服装可供更换',
          priority: 10
        }
      });
      return;
    }

    // 在模型组内随机选择一个不同的模型
    let newTextureId;
    do {
      newTextureId = Math.floor(Math.random() * currentModelGroup.models.length);
    } while (newTextureId === currentModelGroup.currentIndex && currentModelGroup.models.length > 1);

    console.log(`切换到模型组内索引: ${newTextureId}, 模型: ${currentModelGroup.models[newTextureId]}`);

    // 更新模型组的当前索引
    currentModelGroup.currentIndex = newTextureId;

    // 保存纹理ID到缓存
    await setCache('modelTexturesId', newTextureId);
    dispatchRef.current({ type: 'SET_TEXTURE_ID', payload: newTextureId });

    // 加载新模型
    try {
      const newModelName = currentModelGroup.models[newTextureId];

      // 构建CDN路径（因为所有模型都从CDN加载）
      if (!configRef.current.cdnPath) {
        throw new Error('CDN路径未配置');
      }

      const cdnPath = configRef.current.cdnPath.endsWith('/') ? configRef.current.cdnPath : `${configRef.current.cdnPath}/`;
      const newModelPath = `${cdnPath}model/${newModelName}/index.json`;

      console.log('加载新模型路径:', newModelPath);

      if (cubism2Model) {
        // 获取新模型设置
        const modelSetting = await fetchModelSetting(newModelPath);

        console.log('使用新模型设置重新初始化模型');

        // 重新初始化模型
        await cubism2Model.init('live2d', newModelPath, modelSetting);

        dispatchRef.current({
          type: 'SET_MESSAGE',
          payload: {
            text: '服装更换成功',
            priority: 10
          }
        });
      } else {
        console.error('Cubism2模型实例不存在，无法更换服装');
        dispatchRef.current({
          type: 'SET_MESSAGE',
          payload: {
            text: '更换服装失败:模型未初始化',
            priority: 10
          }
        });
      }
    } catch (error) {
      console.error('加载新模型失败:', error);
      logger.error('加载新模型失败:', error);
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '服装更换失败',
          priority: 10
        }
      });
    }
  }, [state.modelId, cubism2Model, fetchModelSetting]); // 移除state.modelList依赖

  // 加载下一个模型
  const loadNextModel = useCallback(async () => {
    console.log('尝试加载下一个模型');

    // 使用ref获取最新状态
    const currentModelList = modelListRef.current;
    const currentModelId = state.modelId;

    if (!currentModelList || currentModelList.length === 0) {
      console.error('模型列表为空，无法加载下一个模型');
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '没有可用的模型',
          priority: 10
        }
      });
      return;
    }

    if (currentModelList.length <= 1) {
      console.log('只有一个模型可用，无需切换');
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '没有其他模型可供切换',
          priority: 10
        }
      });
      return;
    }

    const nextModelId = (currentModelId + 1) % currentModelList.length;
    console.log(`当前模型索引: ${currentModelId}, 下一个模型索引: ${nextModelId}`);

    // 重置纹理ID和模型组索引
    dispatchRef.current({ type: 'SET_TEXTURE_ID', payload: 0 });
    if (modelGroupsRef.current[nextModelId]) {
      modelGroupsRef.current[nextModelId].currentIndex = 0;
    }

    try {
      await loadModel(nextModelId);
      console.log('下一个模型加载成功');
    } catch (error) {
      console.error('加载下一个模型失败:', error);
      dispatchRef.current({
        type: 'SET_MESSAGE',
        payload: {
          text: '切换模型失败',
          priority: 10
        }
      });
    }
  }, [state.modelId, loadModel]); // 移除state.modelList依赖

  // 初始化
  useEffect(() => {
    console.log('useLive2DModel初始化，加载模型列表');
    loadModelList();
  }, [loadModelList]);

  // 当模型列表加载完成后，如果库已初始化则自动加载第一个模型
  useEffect(() => {
    if (state.modelList && state.modelList.length > 0 && !loadingRef.current && state.isInitialized && loadModelRef.current) {
      console.log('模型列表加载完成，库已初始化，自动加载第一个模型');
      // 检查当前modelId是否有效，如果无效则加载第一个模型
      const modelIdToLoad = state.modelId < state.modelList.length ? state.modelId : 0;
      loadModelRef.current(modelIdToLoad);
    } else if (state.modelList && state.modelList.length > 0 && !state.isInitialized) {
      console.log('模型列表已加载，但库尚未初始化，等待初始化完成');
    }
  }, [state.modelList, state.isInitialized]); // 移除loadModel依赖，避免循环依赖

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