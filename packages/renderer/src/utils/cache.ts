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
 * 缓存前缀
 */
const CACHE_PREFIX = 'live2d_';

/**
 * 从缓存获取数据，优先尝试Electron API
 * @param key 缓存键
 * @returns 缓存数据，如果不存在则返回null
 */
export async function getCache<T>(key: string, defaultValue?: T): Promise<T | null> {
  // 优先尝试从Electron API获取
  try {
    if (window.electronAPI && key === 'modelName') {
      const value = await window.electronAPI.getSavedModel();
      if (value) {
        console.info(`[Cache] 从Electron获取缓存成功: ${key}=${value}`);
        return value as unknown as T;
      }
    }
  } catch (err) {
    console.warn(`[Cache] 从Electron获取缓存失败: ${key}`, err);
  }

  // 回退到localStorage
  try {
    const data = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!data) return defaultValue ?? null;
    return JSON.parse(data) as T;
  } catch (error) {
    console.error('[Cache] 从localStorage获取缓存失败:', error);
    return defaultValue ?? null;
  }
}

/**
 * 将数据保存到缓存，同时尝试Electron API和localStorage
 * @param key 缓存键
 * @param data 要缓存的数据
 * @returns 是否成功
 */
export async function setCache<T>(key: string, data: T): Promise<boolean> {
  let success = true;

  // 同步到Electron配置
  try {
    if (window.electronAPI) {
      if (key === 'modelId' || key === 'modelTexturesId') {
        // 这些值仅保存在localStorage，不同步到Electron
      } else if (key === 'modelName') {
        await window.electronAPI.saveModel(data as unknown as string);
        console.info(`[Cache] 保存到Electron配置成功: ${key}=${data}`);
      }
    }
  } catch (err) {
    console.warn(`[Cache] 保存到Electron配置失败: ${key}`, err);
    success = false;
  }

  // 同时保存到localStorage
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(data));
    console.info(`[Cache] 保存到localStorage成功: ${key}`);
  } catch (error) {
    console.error('[Cache] 保存到localStorage失败:', error);
    success = false;
  }

  return success;
}

/**
 * 从缓存中删除数据
 * @param key 缓存键
 * @returns 是否成功
 */
export async function removeCache(key: string): Promise<boolean> {
  let success = true;

  // 如果是modelName，尝试从Electron删除
  try {
    if (window.electronAPI && key === 'modelName') {
      await window.electronAPI.saveModel('');
      console.info(`[Cache] 从Electron删除缓存成功: ${key}`);
    }
  } catch (err) {
    console.warn(`[Cache] 从Electron删除缓存失败: ${key}`, err);
    success = false;
  }

  // 从localStorage删除
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    console.info(`[Cache] 从localStorage删除缓存成功: ${key}`);
  } catch (error) {
    console.error('[Cache] 从localStorage删除缓存失败:', error);
    success = false;
  }

  return success;
}

/**
 * 清除所有Live2D相关的缓存
 * @returns 是否成功
 */
export async function clearAllCache(): Promise<boolean> {
  let success = true;

  // 清除Electron中的模型设置
  try {
    if (window.electronAPI) {
      await window.electronAPI.saveModel('');
      console.info('[Cache] 从Electron清除模型成功');
    }
  } catch (err) {
    console.warn('[Cache] 从Electron清除模型失败:', err);
    success = false;
  }

  // 清除localStorage中的所有Live2D数据
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
    console.info('[Cache] 从localStorage清除所有缓存成功');
  } catch (error) {
    console.error('[Cache] 从localStorage清除所有缓存失败:', error);
    success = false;
  }

  return success;
} 