/**
 * @file Contains utility functions.
 * @module utils
 */

import { IpcApi } from '@ig-live/types';
import path from 'path';

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
  console.log(`处理后的本地路径: ${localPath}`);

  // 尝试读取文件
  let fileContent = await window.electronAPI.readLocalFile(localPath);

  // 如果读取失败，尝试替代路径
  if (!fileContent) {
    console.log(`无法读取文件: ${localPath}，尝试替代路径`);
    const alternativePaths = generateAlternativePaths(localPath, url);

    // 尝试每一个替代路径
    for (const altPath of alternativePaths) {
      console.log(`尝试替代路径: ${altPath}`);
      const altContent = await window.electronAPI.readLocalFile(altPath);
      if (altContent) {
        console.log(`找到匹配的替代路径: ${altPath}`);
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

/**
 * Randomly select an element from an array, or return the original value if not an array.
 * @param {string[] | string} obj - The object or array to select from.
 * @returns {string} The randomly selected element or the original value.
 */
function randomSelection(obj: string[] | string): string {
  return Array.isArray(obj) ? obj[Math.floor(Math.random() * obj.length)] : obj;
}

function randomOtherOption(total: number, excludeIndex: number): number {
  const idx = Math.floor(Math.random() * (total - 1));
  return idx >= excludeIndex ? idx + 1 : idx;
}

/**
 * Asynchronously load external resources.
 * @param {string} url - Resource path.
 * @param {string} type - Resource type.
 */
async function loadExternalResource(url: string, type: string): Promise<string> {
  // 判断当前环境和URL类型
  const dev = isDevelopment();
  const remote = isRemoteUrl(url);

  // 在生产环境下且非远程URL，使用Electron读取本地文件
  if (!dev && !remote && typeof window.electronAPI !== 'undefined') {
    try {
      console.log(`通过Electron加载资源: ${url}, 类型: ${type}`);

      // 读取文件内容
      const fileContent = await readLocalFile(url);

      // 创建Blob并生成URL
      const blob = new Blob(
        [typeof fileContent === 'string' ? fileContent : fileContent],
        { type: getContentType(url) }
      );
      const blobUrl = URL.createObjectURL(blob);
      console.log(`创建Blob URL: ${blobUrl} 用于 ${url}`);

      // 根据资源类型创建DOM元素
      return new Promise((resolve: any, reject: any) => {
        let tag;

        if (type === 'css') {
          tag = document.createElement('link');
          tag.rel = 'stylesheet';
          tag.href = blobUrl;
        }
        else if (type === 'js') {
          tag = document.createElement('script');
          tag.src = blobUrl;
        }

        if (tag) {
          tag.onload = () => {
            console.log(`资源加载成功: ${url}`);
            resolve(url); // 返回原始URL以保持兼容性
          };
          tag.onerror = (e) => {
            console.error(`资源加载失败: ${url}`, e);
            // 释放Blob URL以避免内存泄漏
            URL.revokeObjectURL(blobUrl);
            reject(url);
          };
          document.head.appendChild(tag);
        } else {
          // 如果不是支持的类型，释放Blob URL并拒绝Promise
          URL.revokeObjectURL(blobUrl);
          reject(new Error(`不支持的资源类型: ${type}`));
        }
      });
    } catch (error) {
      console.error(`加载资源失败: ${url}`, error);
      throw error;
    }
  }

  // 开发环境或远程URL使用原始方法
  return new Promise((resolve: any, reject: any) => {
    let tag;

    if (type === 'css') {
      tag = document.createElement('link');
      tag.rel = 'stylesheet';
      tag.href = url;
    }
    else if (type === 'js') {
      tag = document.createElement('script');
      tag.src = url;
    }
    if (tag) {
      tag.onload = () => resolve(url);
      tag.onerror = () => reject(url);
      document.head.appendChild(tag);
    }
  });
}

/**
 * 自定义fetch函数，用于处理开发环境和生产环境的请求差异
 * 在开发环境下使用普通fetch，在生产环境下对本地文件使用fs模块读取
 * @param {string} url - 请求路径
 * @param {RequestInit} [options] - fetch选项
 * @returns {Promise<Response>} - 返回Response对象
 */
async function customFetch(url: string, options?: RequestInit): Promise<Response> {
  console.log('customFetch===>', url, options);

  // 判断当前环境和URL类型
  const dev = isDevelopment();
  const remote = isRemoteUrl(url);

  // 开发环境或远程URL直接使用原生fetch
  if (dev || remote) {
    return fetch(url, options);
  }

  // 生产环境下处理本地文件
  try {
    // 读取本地文件
    const fileContent = await readLocalFile(url);

    // 创建一个模拟的Response对象
    return new Response(fileContent, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': getContentType(url),
      },
    });
  } catch (error) {
    console.error('读取本地文件失败:', error);
    // 创建一个错误Response
    return new Response(JSON.stringify({ error: `读取文件失败: ${error}` }), {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
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
