/**
 * @file Contains utility functions.
 * @module utils
 */

import { IpcApi } from '@ig-live/types';
import path from 'path';
import { randomSelection, loadExternalResource, customFetch } from './live2d-utils';

// 声明全局电子API类型
declare global {
  interface Window {
    electronAPI: IpcApi;
  }
}

/**
 * 判断是否是开发环境
 * @returns {boolean} 是否是开发环境
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * 判断URL是否是远程URL（http或https）
 * @param {string} url - 要检查的URL
 * @returns {boolean} 是否是远程URL
 */
function isRemoteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * 处理文件路径，标准化为适合Electron读取的格式
 * @param {string} url - 原始URL或路径
 * @returns {string} 处理后的路径
 */
function processFilePath(url: string): string {
  // 处理URL参数
  let localPath = url;
  if (url.includes('?')) {
    localPath = url.split('?')[0];
  }

  // 移除开头的斜杠
  localPath = localPath.replace(/^\//, '');

  // 处理assets路径
  if (localPath.includes('assets/')) {
    const assetsMatch = localPath.match(/assets\/(.*)/);
    if (assetsMatch && assetsMatch[1]) {
      localPath = `assets/${assetsMatch[1]}`;
    }
  }

  // 确保assets路径格式正确
  if (localPath.startsWith('assets') && !localPath.startsWith('assets/')) {
    localPath = `assets/${localPath.substring(6)}`;
  }

  return localPath;
}

/**
 * 生成可能的替代路径列表
 * @param {string} localPath - 原始本地路径
 * @param {string} originalUrl - 原始URL
 * @returns {string[]} 替代路径列表
 */
function generateAlternativePaths(localPath: string, originalUrl: string): string[] {
  const paths = [
    // 尝试直接使用文件名
    path.basename(localPath),
    // 尝试assets/文件名
    `assets/${path.basename(localPath)}`,
    // 尝试去掉assets/
    localPath.replace(/^assets\//, ''),
    // 原始路径，添加开头的斜杠
    `/${originalUrl}`
  ];

  // 对于特定文件添加特殊处理
  if (localPath.includes('waifu-tips.json')) {
    paths.push('waifu-tips.json');
  }

  return paths;
}

/**
 * 读取本地文件，支持多路径尝试
 * @param {string} url - 原始URL或路径
 * @returns {Promise<any>} 文件内容
 */
async function readLocalFile(url: string): Promise<any> {
  // 检查window.electronAPI是否存在
  if (typeof window.electronAPI === 'undefined') {
    throw new Error('electronAPI未定义');
  }

  // 处理路径
  const localPath = processFilePath(url);

  // 尝试读取文件
  let fileContent = await window.electronAPI.readLocalFile(localPath);

  // 如果读取失败，尝试替代路径
  if (!fileContent) {
    const alternativePaths = generateAlternativePaths(localPath, url);

    // 尝试每一个替代路径
    for (const altPath of alternativePaths) {
      const altContent = await window.electronAPI.readLocalFile(altPath);
      if (altContent) {
        fileContent = altContent;
        break;
      }
    }

    // 如果仍然没有找到，抛出错误
    if (!fileContent) {
      console.error(`所有路径尝试失败，无法加载资源: ${url}`);
      throw new Error(`无法读取文件: ${url}`);
    }
  }

  return fileContent;
}

function randomOtherOption(total: number, excludeIndex: number): number {
  const idx = Math.floor(Math.random() * (total - 1));
  return idx >= excludeIndex ? idx + 1 : idx;
}

/**
 * 获取文件的Content-Type
 * @param {string} filePath - 文件路径
 * @returns {string} - 文件的Content-Type
 */
function getContentType(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';

  const contentTypes: Record<string, string> = {
    // 文本文件
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'txt': 'text/plain',
    'xml': 'application/xml',
    'csv': 'text/csv',
    'md': 'text/markdown',

    // 图片
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',

    // 音频
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',

    // 视频
    'mp4': 'video/mp4',
    'webm': 'video/webm',

    // 字体
    'ttf': 'font/ttf',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'otf': 'font/otf',

    // 文档
    'pdf': 'application/pdf',

    // 压缩文件
    'zip': 'application/zip',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',

    // 特定的文件类型
    'moc': 'application/octet-stream',
    'moc3': 'application/octet-stream',
    'model': 'application/octet-stream',
    'model3.json': 'application/json',
    'physics3.json': 'application/json',
  };

  // 检查扩展名是否存在于映射表中
  return contentTypes[extension] || 'application/octet-stream';
}

/**
 * 防抖函数
 * @param fn 要执行的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖处理后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 节流函数
 * @param fn 要执行的函数
 * @param limit 时间限制（毫秒）
 * @returns 节流处理后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

export {
  randomSelection,
  loadExternalResource,
  randomOtherOption,
  customFetch,
  getContentType,
  isDevelopment,
  isRemoteUrl,
  processFilePath,
  readLocalFile
};
