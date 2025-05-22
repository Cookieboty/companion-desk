/**
 * @file 缓存工具，用于处理本地存储，提供统一的API接口
 * @module cache
 */

import logger from './logger';
import { IpcApi } from '@ig-live/types';

// 声明全局电子API类型
declare global {
  interface Window {
    electronAPI: IpcApi;
  }
}

/**
 * 获取缓存值
 * @param key 缓存键名
 * @param defaultValue 默认值
 * @returns 缓存值
 */
export async function getCache<T>(key: string, defaultValue?: T): Promise<T | null> {
  // 优先尝试从Electron API获取
  try {
    if (window.electronAPI && key === 'modelName') {
      const value = await window.electronAPI.getSavedModel();
      if (value) {
        logger.info(`从Electron获取缓存成功: ${key}=${value}`);
        return value as unknown as T;
      }
    }
  } catch (err) {
    logger.warn(`从Electron获取缓存失败: ${key}`, err);
  }

  // 回退到localStorage
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue ?? null;

    // 尝试解析数字
    if (!isNaN(Number(value))) {
      return Number(value) as unknown as T;
    }

    // 尝试解析布尔值
    if (value === 'true') return true as unknown as T;
    if (value === 'false') return false as unknown as T;

    // 尝试解析JSON
    try {
      return JSON.parse(value) as T;
    } catch {
      // 不是JSON，返回字符串
      return value as unknown as T;
    }
  } catch (err) {
    logger.warn(`从localStorage获取缓存失败: ${key}`, err);
    return defaultValue ?? null;
  }
}

/**
 * 设置缓存值
 * @param key 缓存键名
 * @param value 缓存值
 */
export async function setCache(key: string, value: any): Promise<void> {
  // 同步到Electron配置
  try {
    if (window.electronAPI) {
      if (key === 'modelId' || key === 'modelTexturesId') {
        // 这些值仅保存在localStorage，不同步到Electron
      } else if (key === 'modelName') {
        await window.electronAPI.saveModel(value);
        logger.info(`保存到Electron配置成功: ${key}=${value}`);
      }
    }
  } catch (err) {
    logger.warn(`保存到Electron配置失败: ${key}`, err);
  }

  // 同时保存到localStorage
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else if (typeof value === 'object') {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, String(value));
    }
    logger.info(`保存到localStorage成功: ${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`);
  } catch (err) {
    logger.warn(`保存到localStorage失败: ${key}`, err);
  }
}

/**
 * 删除缓存
 * @param key 缓存键名
 */
export async function removeCache(key: string): Promise<void> {
  try {
    localStorage.removeItem(key);
    logger.info(`从localStorage删除缓存成功: ${key}`);
  } catch (err) {
    logger.warn(`从localStorage删除缓存失败: ${key}`, err);
  }
} 