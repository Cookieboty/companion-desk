/**
 * @file Contains classes related to waifu model loading and management.
 * @module model
 */

import { showMessage } from './message';
import { loadExternalResource, randomOtherOption, customFetch } from './utils';
import type Cubism2Model from '@/cubism2/index';
import logger, { LogLevel } from './logger';
import { getCache, setCache } from './cache';
import { IpcApi } from '@ig-live/types';

// 声明全局电子API类型
declare global {
  interface Window {
    electronAPI: IpcApi;
    cleanupDrag?: () => void;
    drag?: boolean;
    isInitialized?: boolean;
    config?: Config & { forceRefresh?: boolean };
  }
}

interface ModelListCDN {
  messages: string[];
  models: string | string[];
}

interface ModelList {
  name: string;
  paths: string[];
  message: string;
}

interface Config {
  /**
   * Path to the waifu configuration file.
   * @type {string}
   */
  waifuPath: string;
  /**
   * Path to the API, if you need to load models via API.
   * @type {string | undefined}
   */
  apiPath?: string;
  /**
   * Path to the CDN, if you need to load models via CDN.
   * @type {string | undefined}
   */
  cdnPath?: string;
  /**
   * Path to Cubism 2 Core, if you need to load Cubism 2 models.
   * @type {string | undefined}
   */
  cubism2Path?: string;
  /**
   * Default model id.
   * @type {string | undefined}
   */
  modelId?: number;
  /**
   * List of tools to display.
   * @type {string[] | undefined}
   */
  tools?: string[];
  /**
   * Support for dragging the waifu.
   * @type {boolean | undefined}
   */
  drag?: boolean;
  /**
   * Log level.
   * @type {LogLevel | undefined}
   */
  logLevel?: LogLevel;
  /**
   * Force refresh model data.
   * @type {boolean | undefined}
   */
  forceRefresh?: boolean;
}

/**
 * Waifu model class, responsible for loading and managing models.
 */
class ModelManager {
  public readonly useCDN: boolean;
  private readonly cdnPath: string;
  private readonly cubism2Path: string;
  private _modelId: number;
  private _modelTexturesId: number;
  private modelList: ModelListCDN | null = null;
  private cubism2model: Cubism2Model | undefined;
  private currentModelVersion: number;
  private loading: boolean;
  private modelJSONCache: Record<string, any>;
  private models: ModelList[];

  /**
   * Create a Model instance.
   * @param {Config} config - Configuration options
   */
  private constructor(config: Config, models: ModelList[] = []) {
    let { apiPath, cdnPath } = config;
    const { cubism2Path } = config;
    let useCDN = false;
    if (typeof cdnPath === 'string') {
      if (!cdnPath.endsWith('/')) cdnPath += '/';
      useCDN = true;
    } else if (typeof apiPath === 'string') {
      if (!apiPath.endsWith('/')) apiPath += '/';
      cdnPath = apiPath;
      useCDN = true;
      logger.warn('apiPath option is deprecated. Please use cdnPath instead.');
    } else if (!models.length) {
      throw 'Invalid initWidget argument!';
    }

    // 初始化时从缓存加载modelId和modelTexturesId，默认值为0或配置中指定的值
    this._modelId = config.modelId ?? 0;
    this._modelTexturesId = 0;

    this.useCDN = useCDN;
    this.cdnPath = cdnPath || '';
    this.cubism2Path = cubism2Path || '';
    this.currentModelVersion = 0;
    this.loading = false;
    this.modelJSONCache = {};
    this.models = models;
  }

  public static async initCheck(config: Config, models: ModelList[] = []) {
    // 检查是否需要强制刷新
    const forceReset = config.forceRefresh === true;

    // 使用备用CDN的配置
    let useBackupCdn = false;
    let backupCdnPath = '';

    // 创建模型管理器
    const model = new ModelManager(config, models);

    // 从缓存读取modelId和modelTexturesId，除非强制重置
    if (!forceReset) {
      try {
        const modelId = await getCache<number>('modelId');
        if (modelId !== null && !isNaN(modelId)) {
          model._modelId = modelId;
        }

        const modelTexturesId = await getCache<number>('modelTexturesId');
        if (modelTexturesId !== null && !isNaN(modelTexturesId)) {
          model._modelTexturesId = modelTexturesId;
        }
      } catch (err) {
        logger.warn('无法从缓存加载模型配置:', err);
      }
    } else {
      // 强制重置时，使用默认值
      logger.info('检测到强制重置参数，使用默认模型ID');
      model._modelId = 0;
      model._modelTexturesId = 0;
    }

    if (model.useCDN) {
      try {
        // 尝试使用主CDN API
        let response = await customFetch(`${model.cdnPath}model_list.json`);
        model.modelList = await response.json();

        // 检查模型列表是否有效
        if (!model.modelList || !model.modelList.models || !Array.isArray(model.modelList.models) || model.modelList.models.length === 0) {
          throw new Error('无效的模型列表');
        }

        logger.info(`从CDN加载了模型列表，包含 ${Array.isArray(model.modelList.models) ? model.modelList.models.length : 0} 个模型`);
      } catch (err) {
        logger.error('从主CDN加载模型列表失败:', err);

        // 如果使用的是默认CDN但加载失败，尝试备用CDN
        if (model.cdnPath.includes('jsdelivr.net')) {
          try {
            logger.info('尝试使用备用CDN...');
            // 备用CDN
            backupCdnPath = 'https://cdn.jsdelivr.net/gh/fghrsh/live2d_api/';
            const response = await customFetch(`${backupCdnPath}model_list.json`);
            const backupModelList = await response.json();

            // 检查备用模型列表是否有效
            if (backupModelList && backupModelList.models && Array.isArray(backupModelList.models) && backupModelList.models.length > 0) {
              model.modelList = backupModelList;
              useBackupCdn = true;
              logger.info('成功从备用CDN加载模型列表');
            } else {
              throw new Error('备用CDN返回的模型列表无效');
            }
          } catch (backupErr) {
            logger.error('从备用CDN加载模型列表也失败:', backupErr);
            // 如果备用CDN也失败，设置一个基本的模型列表
            model.modelList = {
              models: ['HyperdimensionNeptunia/neptune_classic', 'KantaiCollection/murakumo'],
              messages: ['模型加载成功']
            };
            logger.info('使用内置的基本模型列表');
          }
        } else {
          // 如果不是默认CDN，则使用基本模型列表
          model.modelList = {
            models: ['HyperdimensionNeptunia/neptune_classic', 'KantaiCollection/murakumo'],
            messages: ['模型加载成功']
          };
          logger.info('使用内置的基本模型列表');
        }
      }

      // 尝试从缓存中恢复上次保存的模型
      try {
        const savedModelName = await getCache<string>('modelName');
        logger.info('从缓存加载模型名称:', savedModelName);

        if (savedModelName) {
          // 在模型列表中查找保存的模型名称
          let foundModel = false;

          if (Array.isArray(model.modelList!.models)) {
            for (let i = 0; i < model.modelList!.models.length; i++) {
              const modelItem = model.modelList!.models[i];

              if (Array.isArray(modelItem)) {
                // 如果是包含多个纹理的模型，查找具体的纹理
                const textureIndex = modelItem.findIndex(name => name === savedModelName);
                if (textureIndex !== -1) {
                  model._modelId = i;
                  model._modelTexturesId = textureIndex;
                  foundModel = true;
                  logger.info(`找到缓存的模型: ID=${i}, 纹理ID=${textureIndex}`);
                  break;
                }
              } else if (modelItem === savedModelName) {
                // 单个模型名称匹配
                model._modelId = i;
                model._modelTexturesId = 0;
                foundModel = true;
                logger.info(`找到缓存的模型: ID=${i}`);
                break;
              }
            }
          }

          if (!foundModel) {
            logger.warn(`未找到缓存的模型: ${savedModelName}`);
          }
        }
      } catch (err) {
        logger.warn('无法从缓存恢复模型:', err);
      }

      // 确保模型ID在有效范围内
      if (model._modelId >= model.modelList!.models.length) {
        model._modelId = 0;
      }
      const modelName = model.modelList!.models[model._modelId];
      if (Array.isArray(modelName)) {
        if (model._modelTexturesId >= modelName.length) {
          model._modelTexturesId = 0;
        }
      } else {
        // 确定使用哪个CDN路径
        const cdnPath = useBackupCdn ? backupCdnPath : model.cdnPath;
        const modelSettingPath = `${cdnPath}model/${modelName}/index.json`;

        try {
          const modelSetting = await model.fetchWithCache(modelSettingPath);
          const version = model.checkModelVersion(modelSetting);
          if (version === 2) {
            // 确定使用哪个CDN路径
            const textureCachePath = `${cdnPath}model/${modelName}/textures.cache`;
            const textureCache = await model.fetchWithCache(textureCachePath);
            if (model._modelTexturesId >= textureCache.length) {
              model._modelTexturesId = 0;
            }
          }
        } catch (err) {
          logger.warn(`加载模型设置失败: ${modelSettingPath}`, err);
          // 回退到默认设置
          model._modelId = 0;
          model._modelTexturesId = 0;
        }
      }
    } else {
      // 尝试从缓存中恢复本地模型
      try {
        const savedModelName = await getCache<string>('modelName');
        logger.info('从缓存加载本地模型名称:', savedModelName);

        if (savedModelName) {
          // 在本地模型列表中查找保存的模型路径
          let foundModel = false;

          for (let i = 0; i < models.length; i++) {
            for (let j = 0; j < models[i].paths.length; j++) {
              const path = models[i].paths[j];
              if (path.includes(savedModelName)) {
                model._modelId = i;
                model._modelTexturesId = j;
                foundModel = true;
                logger.info(`找到缓存的本地模型: ID=${i}, 路径ID=${j}`);
                break;
              }
            }
            if (foundModel) break;
          }

          if (!foundModel) {
            logger.warn(`未找到缓存的本地模型: ${savedModelName}`);
          }
        }
      } catch (err) {
        logger.warn('无法从缓存恢复本地模型:', err);
      }

      // 确保模型ID在有效范围内
      if (model._modelId >= model.models.length) {
        model._modelId = 0;
      }
      if (model._modelTexturesId >= model.models[model._modelId].paths.length) {
        model._modelTexturesId = 0;
      }
    }

    // 如果使用备用CDN，创建一个新的ModelManager实例
    if (useBackupCdn && backupCdnPath) {
      const backupConfig = { ...config, cdnPath: backupCdnPath };
      const backupModel = new ModelManager(backupConfig, models);

      // 复制属性
      backupModel._modelId = model._modelId;
      backupModel._modelTexturesId = model._modelTexturesId;
      backupModel.modelList = model.modelList;

      // 初始化完成后同步缓存
      setCache('modelId', backupModel._modelId);
      setCache('modelTexturesId', backupModel._modelTexturesId);

      return backupModel;
    }

    // 初始化完成后同步缓存
    setCache('modelId', model._modelId);
    setCache('modelTexturesId', model._modelTexturesId);

    return model;
  }

  public set modelId(modelId: number) {
    this._modelId = modelId;
    setCache('modelId', modelId);
  }

  public get modelId() {
    return this._modelId;
  }

  public set modelTexturesId(modelTexturesId: number) {
    this._modelTexturesId = modelTexturesId;
    setCache('modelTexturesId', modelTexturesId);
  }

  public get modelTexturesId() {
    return this._modelTexturesId;
  }

  resetCanvas() {
    try {
      logger.info('重置画布');
      const canvas = document.getElementById('waifu-canvas');
      if (canvas) {
        canvas.innerHTML = '<canvas id="live2d" width="800" height="800"></canvas>';
        logger.info('画布重置成功');
      } else {
        logger.error('未找到waifu-canvas元素');
      }
    } catch (err) {
      logger.error('重置画布失败:', err);
    }
  }

  async fetchWithCache(url: string) {
    // 检查是否需要强制刷新
    const forceRefresh = this.useCDN && (window as any).config?.forceRefresh === true;

    // 为了避免缓存问题，在URL上添加时间戳
    const finalUrl = forceRefresh && !url.includes('?_t=') && !url.includes('&_t=') ?
      `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}` : url;

    let result;
    if (!forceRefresh && url in this.modelJSONCache) {
      result = this.modelJSONCache[url];
    } else {
      logger.info(`正在请求: ${finalUrl}`);
      const response = await customFetch(finalUrl);
      try {
        result = await response.json();
      } catch (error) {
        logger.error(`解析JSON失败: ${finalUrl}`, error);
        result = null;
      }
      this.modelJSONCache[url] = result;
    }
    return result;
  }

  checkModelVersion(modelSetting: any) {
    if (modelSetting.Version === 3 || modelSetting.FileReferences) {
      return 3;
    }
    return 2;
  }

  async loadLive2D(modelSettingPath: string, modelSetting: object) {
    if (this.loading) {
      logger.warn('Still loading. Abort.');
      return;
    }
    this.loading = true;
    try {
      const version = this.checkModelVersion(modelSetting);
      if (version === 2) {
        if (!this.cubism2model) {
          if (!this.cubism2Path) {
            logger.error('No cubism2Path set, cannot load Cubism 2 Core.')
            return;
          }
          await loadExternalResource(this.cubism2Path, 'js');
          const { default: Cubism2Model } = await import('@/cubism2/index');
          this.cubism2model = new Cubism2Model();
        }
        await this.cubism2model.init('live2d', modelSettingPath, modelSetting);
        logger.info(`Model ${modelSettingPath} (Cubism version ${version}) loaded`);
        this.currentModelVersion = version;

        // 保存模型到缓存
        try {
          const modelName = modelSettingPath.split('/').slice(-2)[0];
          logger.info(`保存模型到缓存: ${modelName}`);
          await setCache('modelName', modelName);
        } catch (err) {
          logger.warn('保存模型到缓存失败:', err);
        }
      } else {
        logger.warn(`Model ${modelSettingPath} has version ${version} which is not supported`);
      }
    } catch (err) {
      console.error('loadLive2D failed', err);
    }
    this.loading = false;
  }

  async loadTextureCache(modelName: string): Promise<any[]> {
    const textureCache = await this.fetchWithCache(`${this.cdnPath}model/${modelName}/textures.cache`);
    return textureCache || [];
  }

  /**
   * Load the specified model.
   * @param {string | string[]} message - Loading message.
   */
  async loadModel(message: string | string[]) {
    try {
      logger.info(`开始加载模型，当前modelId: ${this.modelId}, modelTexturesId: ${this.modelTexturesId}`);

      // 打印模型列表信息
      if (this.useCDN && this.modelList) {
        logger.info('CDN模型列表内容:', JSON.stringify(this.modelList.models));

        // 检查是否是超时处理中的强制加载
        if (window.config?.forceRefresh === true) {
          // 在强制刷新模式下，随机选择一个不同的模型
          logger.info('检测到强制刷新模式，尝试随机选择一个不同的模型');

          const currentModel = this.modelId;
          const modelCount = this.modelList.models.length;

          if (modelCount > 1) {
            // 如果有多个模型，随机选择一个不同的
            let newModelId;
            do {
              newModelId = Math.floor(Math.random() * modelCount);
            } while (newModelId === currentModel && modelCount > 1);

            this.modelId = newModelId;
            this.modelTexturesId = 0;

            logger.info(`随机选择了新的模型ID: ${this.modelId}`);
          }
        }
      } else if (this.models && this.models.length > 0) {
        logger.info('本地模型列表内容:', JSON.stringify(this.models.map(m => m.name)));

        // 对本地模型也进行同样的随机选择
        if (window.config?.forceRefresh === true) {
          logger.info('检测到强制刷新模式，尝试随机选择一个不同的本地模型');

          const currentModel = this.modelId;
          const modelCount = this.models.length;

          if (modelCount > 1) {
            // 如果有多个模型，随机选择一个不同的
            let newModelId;
            do {
              newModelId = Math.floor(Math.random() * modelCount);
            } while (newModelId === currentModel && modelCount > 1);

            this.modelId = newModelId;
            this.modelTexturesId = 0;

            logger.info(`随机选择了新的本地模型ID: ${this.modelId}`);
          }
        }
      }

      // 如果不是首次初始化，才显示加载中提示
      // 初始化时由widget.ts中的加载指示器处理
      if (window.isInitialized) {
        showMessage('模型加载中...', 999999, 10);
      }

      // 定义加载进度指示器
      const createLoadingTip = () => {
        const waifuTips = document.getElementById('waifu-tips');
        if (!waifuTips) return;

        const existingLoader = document.getElementById('model-loading-progress');
        if (existingLoader) return;

        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'model-loading-progress';
        loadingDiv.style.width = '0%';
        loadingDiv.style.height = '3px';
        loadingDiv.style.backgroundColor = '#0084ff';
        loadingDiv.style.position = 'absolute';
        loadingDiv.style.bottom = '0';
        loadingDiv.style.left = '0';
        loadingDiv.style.transition = 'width 0.3s';
        waifuTips.appendChild(loadingDiv);

        return loadingDiv;
      };

      // 更新加载进度
      const updateLoadingProgress = (percent: number) => {
        const loadingDiv = document.getElementById('model-loading-progress');
        if (loadingDiv) {
          loadingDiv.style.width = `${percent}%`;
        }
      };

      // 移除加载进度指示器
      const removeLoadingTip = () => {
        const loadingDiv = document.getElementById('model-loading-progress');
        if (loadingDiv) {
          loadingDiv.remove();
        }
      };

      // 创建加载进度条
      const loadingTip = createLoadingTip();
      updateLoadingProgress(10);

      let modelSettingPath, modelSetting;
      if (this.useCDN) {
        updateLoadingProgress(20);
        let modelName = this.modelList!.models[this.modelId];
        if (Array.isArray(modelName)) {
          modelName = modelName[this.modelTexturesId];
        }
        modelSettingPath = `${this.cdnPath}model/${modelName}/index.json`;
        updateLoadingProgress(30);
        modelSetting = await this.fetchWithCache(modelSettingPath);
        updateLoadingProgress(40);
        const version = this.checkModelVersion(modelSetting);
        if (version === 2) {
          updateLoadingProgress(50);
          const textureCache = await this.loadTextureCache(modelName);
          let textures = textureCache[this.modelTexturesId];
          if (typeof textures === 'string') textures = [textures];
          modelSetting.textures = textures;
        }

        // 保存CDN模型名称到缓存
        try {
          logger.info(`保存CDN模型到缓存: ${modelName}`);
          await setCache('modelName', modelName);
        } catch (err) {
          logger.warn('保存模型到缓存失败:', err);
        }
      } else {
        updateLoadingProgress(20);
        modelSettingPath = this.models[this.modelId].paths[this.modelTexturesId];
        updateLoadingProgress(30);
        modelSetting = await this.fetchWithCache(modelSettingPath);
        updateLoadingProgress(40);

        // 保存本地模型路径到缓存
        try {
          const modelPathParts = modelSettingPath.split('/');
          const modelName = modelPathParts[modelPathParts.length - 2] || modelPathParts[modelPathParts.length - 1];
          logger.info(`保存本地模型到缓存: ${modelName}`);
          await setCache('modelName', modelName);
        } catch (err) {
          logger.warn('保存模型到缓存失败:', err);
        }
      }

      updateLoadingProgress(60);
      this.resetCanvas();
      updateLoadingProgress(70);
      await this.loadLive2D(modelSettingPath, modelSetting);

      // 重新注册拖动功能
      updateLoadingProgress(90);
      if (window.drag === true) {
        try {
          // 延迟一点时间确保DOM已更新
          setTimeout(async () => {
            // 动态导入以避免循环引用
            const { default: registerDrag } = await import('./drag');
            if (typeof window.cleanupDrag === 'function') {
              window.cleanupDrag();
            }
            window.cleanupDrag = registerDrag();
            logger.info('已重新注册拖动功能');
          }, 100);
        } catch (err) {
          logger.error('重新注册拖动功能失败:', err);
        }
      }

      updateLoadingProgress(100);

      // 加载完成，移除进度条并显示完成消息
      setTimeout(() => {
        removeLoadingTip();
        // 显示加载完成信息，然后再显示模型自身的信息
        showMessage('模型加载完毕！', 2000, 10);
        setTimeout(() => {
          showMessage(message, 4000, 10);
        }, 2000);
      }, 500);

    } catch (error) {
      // 发生错误时也移除加载提示
      const loadingDiv = document.getElementById('model-loading-progress');
      if (loadingDiv) loadingDiv.remove();

      logger.error('加载模型失败:', error);
      showMessage('加载模型失败', 4000, 10);
    }
  }

  /**
   * Load a random texture for the current model.
   */
  async loadRandTexture(successMessage: string | string[] = '', failMessage: string | string[] = '') {
    const { modelId } = this;
    let noTextureAvailable = false;
    if (this.useCDN) {
      const modelName = this.modelList!.models[modelId];
      if (Array.isArray(modelName)) {
        this.modelTexturesId = randomOtherOption(modelName.length, this.modelTexturesId);
      } else {
        const modelSettingPath = `${this.cdnPath}model/${modelName}/index.json`;
        const modelSetting = await this.fetchWithCache(modelSettingPath);
        const version = this.checkModelVersion(modelSetting);
        if (version === 2) {
          const textureCache = await this.loadTextureCache(modelName);
          if (textureCache.length <= 1) {
            noTextureAvailable = true;
          } else {
            this.modelTexturesId = randomOtherOption(textureCache.length, this.modelTexturesId);
          }
        } else {
          noTextureAvailable = true;
        }
      }
    } else {
      if (this.models[modelId].paths.length === 1) {
        noTextureAvailable = true;
      } else {
        this.modelTexturesId = randomOtherOption(this.models[modelId].paths.length, this.modelTexturesId);
      }
    }
    if (noTextureAvailable) {
      showMessage(failMessage, 4000, 10);
    } else {
      await this.loadModel(successMessage);
    }
  }

  /**
   * Load the next character's model.
   */
  async loadNextModel() {
    try {
      logger.info('开始切换到下一个模型');
      this.modelTexturesId = 0;

      if (this.useCDN) {
        if (!this.modelList) {
          logger.error('模型列表未加载，无法切换模型');
          showMessage('模型列表未加载，无法切换', 4000, 10);
          return;
        }

        if (!this.modelList.models || !this.modelList.models.length) {
          logger.error('模型列表为空，无法切换模型');
          showMessage('模型列表为空，无法切换', 4000, 10);
          return;
        }

        logger.info(`当前模型ID: ${this.modelId}, 总模型数: ${this.modelList.models.length}`);
        this.modelId = (this.modelId + 1) % this.modelList.models.length;
        logger.info(`切换到新的模型ID: ${this.modelId}`);

        await this.loadModel(this.modelList.messages[this.modelId] || '模型已切换');
      } else {
        if (!this.models || !this.models.length) {
          logger.error('本地模型列表为空，无法切换模型');
          showMessage('模型列表为空，无法切换', 4000, 10);
          return;
        }

        logger.info(`当前模型ID: ${this.modelId}, 总模型数: ${this.models.length}`);
        this.modelId = (this.modelId + 1) % this.models.length;
        logger.info(`切换到新的模型ID: ${this.modelId}`);

        await this.loadModel(this.models[this.modelId].message || '模型已切换');
      }

      logger.info('模型切换成功');
    } catch (err) {
      logger.error('切换模型失败:', err);
      showMessage('切换模型失败', 4000, 10);
    }
  }
}

export { ModelManager };
export type { Config, ModelList };
