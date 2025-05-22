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
    const model = new ModelManager(config, models);

    // 从缓存读取modelId和modelTexturesId
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

    if (model.useCDN) {
      const response = await customFetch(`${model.cdnPath}model_list.json`);
      model.modelList = await response.json();

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
        const modelSettingPath = `${model.cdnPath}model/${modelName}/index.json`;
        const modelSetting = await model.fetchWithCache(modelSettingPath);
        const version = model.checkModelVersion(modelSetting);
        if (version === 2) {
          const textureCache = await model.loadTextureCache(modelName);
          if (model._modelTexturesId >= textureCache.length) {
            model._modelTexturesId = 0;
          }
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
    const canvas = document.getElementById('waifu-canvas');
    if (canvas) {
      canvas.innerHTML = '<canvas id="live2d" width="800" height="800"></canvas>';
    }
  }

  async fetchWithCache(url: string) {
    let result;
    if (url in this.modelJSONCache) {
      result = this.modelJSONCache[url];
    } else {
      const response = await customFetch(url);
      try {
        result = await response.json();
      } catch {
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
    let modelSettingPath, modelSetting;
    if (this.useCDN) {
      let modelName = this.modelList!.models[this.modelId];
      if (Array.isArray(modelName)) {
        modelName = modelName[this.modelTexturesId];
      }
      modelSettingPath = `${this.cdnPath}model/${modelName}/index.json`;
      modelSetting = await this.fetchWithCache(modelSettingPath);
      const version = this.checkModelVersion(modelSetting);
      if (version === 2) {
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
      modelSettingPath = this.models[this.modelId].paths[this.modelTexturesId];
      modelSetting = await this.fetchWithCache(modelSettingPath);

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
    this.resetCanvas();
    await this.loadLive2D(modelSettingPath, modelSetting);
    showMessage(message, 4000, 10);
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
    this.modelTexturesId = 0;
    if (this.useCDN) {
      this.modelId = (this.modelId + 1) % this.modelList!.models.length;
      await this.loadModel(this.modelList!.messages[this.modelId]);
    } else {
      this.modelId = (this.modelId + 1) % this.models.length;
      await this.loadModel(this.models[this.modelId].message);
    }
  }
}

export { ModelManager };
export type { Config, ModelList };
