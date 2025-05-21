/**
 * @file Contains classes related to waifu model loading and management.
 * @module model
 */

import { showMessage } from './message';
import { loadExternalResource, randomOtherOption } from './utils';
import type Cubism2Model from '@/cubism2/index';
import logger, { LogLevel } from './logger';

// 声明全局电子API类型
declare global {
  interface Window {
    electronAPI: {
      saveModel: (modelName: string) => void;
      getSavedModel: () => Promise<string>;
    };
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
    let modelId: number = parseInt(localStorage.getItem('modelId') as string, 10);
    let modelTexturesId: number = parseInt(
      localStorage.getItem('modelTexturesId') as string, 10
    );
    if (isNaN(modelId) || isNaN(modelTexturesId)) {
      modelTexturesId = 0;
    }
    if (isNaN(modelId)) {
      modelId = config.modelId ?? 0;
    }
    this.useCDN = useCDN;
    this.cdnPath = cdnPath || '';
    this.cubism2Path = cubism2Path || '';
    this._modelId = modelId;
    this._modelTexturesId = modelTexturesId;
    this.currentModelVersion = 0;
    this.loading = false;
    this.modelJSONCache = {};
    this.models = models;
  }

  public static async initCheck(config: Config, models: ModelList[] = []) {
    const model = new ModelManager(config, models);
    if (model.useCDN) {
      const response = await fetch(`${model.cdnPath}model_list.json`);
      model.modelList = await response.json();

      // 尝试从Electron配置中恢复上次保存的模型
      try {
        const savedModelName = await window.electronAPI.getSavedModel();
        if (savedModelName) {
          // 在模型列表中查找保存的模型名称
          const modelIndex = Array.isArray(model.modelList!.models)
            ? model.modelList!.models.findIndex(m =>
              Array.isArray(m)
                ? m.includes(savedModelName)
                : m === savedModelName
            )
            : -1;

          if (modelIndex !== -1) {
            model.modelId = modelIndex;
            // 如果是包含多个纹理的模型，找到具体的纹理ID
            const modelName = model.modelList!.models[modelIndex];
            if (Array.isArray(modelName)) {
              const textureIndex = modelName.indexOf(savedModelName);
              if (textureIndex !== -1) {
                model.modelTexturesId = textureIndex;
              }
            }
          }
        }
      } catch (err) {
        logger.warn('无法从Electron配置恢复模型:', err);
      }

      // 确保模型ID在有效范围内
      if (model.modelId >= model.modelList!.models.length) {
        model.modelId = 0;
      }
      const modelName = model.modelList!.models[model.modelId];
      if (Array.isArray(modelName)) {
        if (model.modelTexturesId >= modelName.length) {
          model.modelTexturesId = 0;
        }
      } else {
        const modelSettingPath = `${model.cdnPath}model/${modelName}/index.json`;
        const modelSetting = await model.fetchWithCache(modelSettingPath);
        const version = model.checkModelVersion(modelSetting);
        if (version === 2) {
          const textureCache = await model.loadTextureCache(modelName);
          if (model.modelTexturesId >= textureCache.length) {
            model.modelTexturesId = 0;
          }
        }
      }
    } else {
      // 尝试从Electron配置中恢复本地模型
      try {
        const savedModelName = await window.electronAPI.getSavedModel();
        if (savedModelName) {
          // 在本地模型列表中查找保存的模型路径
          for (let i = 0; i < models.length; i++) {
            const pathIndex = models[i].paths.findIndex(p => p.includes(savedModelName));
            if (pathIndex !== -1) {
              model.modelId = i;
              model.modelTexturesId = pathIndex;
              break;
            }
          }
        }
      } catch (err) {
        logger.warn('无法从Electron配置恢复模型:', err);
      }

      // 确保模型ID在有效范围内
      if (model.modelId >= model.models.length) {
        model.modelId = 0;
      }
      if (model.modelTexturesId >= model.models[model.modelId].paths.length) {
        model.modelTexturesId = 0;
      }
    }
    return model;
  }

  public set modelId(modelId: number) {
    this._modelId = modelId;
    localStorage.setItem('modelId', modelId.toString());
  }

  public get modelId() {
    return this._modelId;
  }

  public set modelTexturesId(modelTexturesId: number) {
    this._modelTexturesId = modelTexturesId;
    localStorage.setItem('modelTexturesId', modelTexturesId.toString());
  }

  public get modelTexturesId() {
    return this._modelTexturesId;
  }

  resetCanvas() {
    document.getElementById('waifu-canvas')!.innerHTML = '<canvas id="live2d" width="800" height="800"></canvas>';
  }

  async fetchWithCache(url: string) {
    let result;
    if (url in this.modelJSONCache) {
      result = this.modelJSONCache[url];
    } else {
      const response = await fetch(url);
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

        // 保存模型到Electron配置
        try {
          const modelName = modelSettingPath.split('/').slice(-2)[0];
          window.electronAPI.saveModel(modelName);
        } catch (err) {
          logger.warn('保存模型到Electron配置失败:', err);
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

      // 保存CDN模型名称到Electron配置
      try {
        window.electronAPI.saveModel(modelName);
      } catch (err) {
        logger.warn('保存模型到Electron配置失败:', err);
      }
    } else {
      modelSettingPath = this.models[this.modelId].paths[this.modelTexturesId];
      modelSetting = await this.fetchWithCache(modelSettingPath);

      // 保存本地模型路径到Electron配置
      try {
        const modelPathParts = modelSettingPath.split('/');
        const modelName = modelPathParts[modelPathParts.length - 2] || modelPathParts[modelPathParts.length - 1];
        window.electronAPI.saveModel(modelName);
      } catch (err) {
        logger.warn('保存模型到Electron配置失败:', err);
      }
    }
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
