/**
 * 环境配置管理器
 * 支持多环境配置加载和验证
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type Environment = 'development' | 'production' | 'test';

export interface EnvironmentConfigOptions {
  configDir?: string;
  environment?: Environment;
  enableHotReload?: boolean;
  enableValidation?: boolean;
}

export interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    default?: any;
    validate?: (value: any) => boolean;
    description?: string;
  };
}

export class EnvironmentConfig {
  private environment: Environment;
  private configDir: string;
  private configs = new Map<string, any>();
  private schema?: ConfigSchema;
  private watchers = new Map<string, fs.FSWatcher>();
  private enableHotReload: boolean;
  private enableValidation: boolean;

  constructor(options: EnvironmentConfigOptions = {}) {
    this.environment = options.environment || this.detectEnvironment();
    this.configDir = options.configDir || this.getDefaultConfigDir();
    this.enableHotReload = options.enableHotReload ?? false;
    this.enableValidation = options.enableValidation ?? true;
  }

  /**
   * 加载配置
   */
  async load(schema?: ConfigSchema): Promise<void> {
    this.schema = schema;

    try {
      // 加载默认配置
      await this.loadConfig('default');

      // 加载环境特定配置
      await this.loadConfig(this.environment);

      // 加载本地覆盖配置（不纳入版本控制）
      await this.loadConfig('local', false);

      // 验证配置
      if (this.enableValidation && this.schema) {
        this.validateConfigs();
      }

      // 设置热重载
      if (this.enableHotReload) {
        this.setupHotReload();
      }

      console.log(`✅ 配置加载完成 (环境: ${this.environment})`);
    } catch (error) {
      console.error('❌ 配置加载失败:', error);
      throw error;
    }
  }

  /**
   * 获取配置值
   */
  get<T = any>(key: string, defaultValue?: T): T {
    const keys = key.split('.');
    let value: any;

    // 从环境特定配置开始查找
    const searchOrder = [this.environment, 'local', 'default'];

    for (const configName of searchOrder) {
      const config = this.configs.get(configName);
      if (config) {
        value = this.getNestedValue(config, keys);
        if (value !== undefined) {
          break;
        }
      }
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * 设置配置值
   */
  set(key: string, value: any): void {
    const keys = key.split('.');
    const config = this.configs.get(this.environment) || {};

    this.setNestedValue(config, keys, value);
    this.configs.set(this.environment, config);
  }

  /**
   * 获取完整配置对象
   */
  getAll(): any {
    const merged = {};

    // 按优先级合并配置
    const mergeOrder = ['default', 'local', this.environment];

    for (const configName of mergeOrder) {
      const config = this.configs.get(configName);
      if (config) {
        this.deepMerge(merged, config);
      }
    }

    return merged;
  }

  /**
   * 保存配置到文件
   */
  async save(configName?: string): Promise<void> {
    const targetConfig = configName || this.environment;
    const config = this.configs.get(targetConfig);

    if (!config) {
      throw new Error(`配置 ${targetConfig} 不存在`);
    }

    const configPath = this.getConfigPath(targetConfig);

    try {
      await fs.promises.writeFile(
        configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );
      console.log(`✅ 配置已保存: ${configPath}`);
    } catch (error) {
      console.error(`❌ 配置保存失败: ${configPath}`, error);
      throw error;
    }
  }

  /**
   * 切换环境
   */
  async switchEnvironment(env: Environment): Promise<void> {
    if (env === this.environment) {
      return;
    }

    console.log(`🔄 切换环境: ${this.environment} -> ${env}`);

    // 清理当前环境的热重载
    this.cleanupHotReload();

    this.environment = env;

    // 重新加载配置
    await this.load(this.schema);
  }

  /**
   * 验证配置
   */
  validateConfigs(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.schema) {
      return { isValid: true, errors };
    }

    const config = this.getAll();

    for (const [key, schemaItem] of Object.entries(this.schema)) {
      const value = this.getNestedValue(config, key.split('.'));

      // 检查必需字段
      if (schemaItem.required && (value === undefined || value === null)) {
        errors.push(`必需字段缺失: ${key}`);
        continue;
      }

      // 如果值不存在且有默认值，使用默认值
      if (value === undefined && schemaItem.default !== undefined) {
        this.setNestedValue(config, key.split('.'), schemaItem.default);
        continue;
      }

      // 类型检查
      if (value !== undefined && !this.checkType(value, schemaItem.type)) {
        errors.push(`字段 ${key} 类型错误，期望 ${schemaItem.type}，实际 ${typeof value}`);
      }

      // 自定义验证
      if (value !== undefined && schemaItem.validate && !schemaItem.validate(value)) {
        errors.push(`字段 ${key} 验证失败`);
      }
    }

    if (errors.length > 0) {
      console.error('❌ 配置验证失败:', errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取当前环境
   */
  getEnvironment(): Environment {
    return this.environment;
  }

  /**
   * 销毁配置管理器
   */
  destroy(): void {
    this.cleanupHotReload();
    this.configs.clear();
  }

  /**
   * 加载特定配置文件
   */
  private async loadConfig(configName: string, required: boolean = true): Promise<void> {
    const configPath = this.getConfigPath(configName);

    try {
      if (!fs.existsSync(configPath)) {
        if (required) {
          throw new Error(`配置文件不存在: ${configPath}`);
        }
        return;
      }

      const content = await fs.promises.readFile(configPath, 'utf8');
      const config = JSON.parse(content);

      this.configs.set(configName, config);
      console.log(`📄 已加载配置: ${configName}`);

    } catch (error) {
      if (required) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`加载配置失败 ${configName}: ${errorMessage}`);
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ 可选配置加载失败: ${configName}`, errorMessage);
      }
    }
  }

  /**
   * 获取配置文件路径
   */
  private getConfigPath(configName: string): string {
    return path.join(this.configDir, `${configName}.json`);
  }

  /**
   * 检测当前环境
   */
  private detectEnvironment(): Environment {
    if (process.env.NODE_ENV === 'test') {
      return 'test';
    }

    if (process.env.NODE_ENV === 'production' || app.isPackaged) {
      return 'production';
    }

    return 'development';
  }

  /**
   * 获取默认配置目录
   */
  private getDefaultConfigDir(): string {
    if (app.isPackaged) {
      return path.join(app.getPath('userData'), 'config');
    } else {
      return path.join(app.getAppPath(), 'config');
    }
  }

  /**
   * 设置热重载
   */
  private setupHotReload(): void {
    if (this.environment === 'production') {
      return; // 生产环境不启用热重载
    }

    const configsToWatch = ['default', this.environment, 'local'];

    for (const configName of configsToWatch) {
      const configPath = this.getConfigPath(configName);

      if (fs.existsSync(configPath)) {
        const watcher = fs.watch(configPath, async (eventType) => {
          if (eventType === 'change') {
            console.log(`🔄 配置文件变更: ${configName}`);
            try {
              await this.loadConfig(configName, false);
              console.log(`✅ 热重载完成: ${configName}`);
            } catch (error) {
              console.error(`❌ 热重载失败: ${configName}`, error);
            }
          }
        });

        this.watchers.set(configName, watcher);
      }
    }
  }

  /**
   * 清理热重载
   */
  private cleanupHotReload(): void {
    for (const [configName, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * 获取嵌套值
   */
  private getNestedValue(obj: any, keys: string[]): any {
    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  /**
   * 设置嵌套值
   */
  private setNestedValue(obj: any, keys: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
  }

  /**
   * 深度合并对象
   */
  private deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          if (!(key in target) || typeof target[key] !== 'object') {
            target[key] = {};
          }
          this.deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
  }

  /**
   * 检查类型
   */
  private checkType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }
}