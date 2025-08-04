/**
 * 文件操作相关IPC处理器
 * 处理文件读取、路径获取等相关的IPC通信
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { BaseIpcHandler } from './BaseIpcHandler';
import { ILoggerService } from '../../services/LoggerService';
import { ICacheService } from '../../services/CacheService';

export class FileIpcHandler extends BaseIpcHandler {
  private cacheService?: ICacheService;

  constructor(logger: ILoggerService, cacheService?: ICacheService) {
    super(logger);
    this.cacheService = cacheService;
  }

  /**
   * 初始化文件操作相关IPC处理器
   */
  initialize(): void {
    // 读取本地JSON文件
    this.registerHandler('read-local-json', async (_, filePath: string) => {
      this.validateArgs([filePath], 1, ['string']);

      try {
        // 检查缓存
        const cacheKey = `json:${filePath}`;
        if (this.cacheService) {
          const cached = this.cacheService.get(cacheKey);
          if (cached) {
            this.logger.debug('从缓存读取JSON文件', { filePath });
            return cached;
          }
        }

        const resolvedPath = this.resolveFilePath(filePath);

        // 检查文件是否存在
        if (!fs.existsSync(resolvedPath)) {
          this.logger.warn('JSON文件不存在', { filePath, resolvedPath });
          return null;
        }

        // 读取并解析JSON文件
        const data = fs.readFileSync(resolvedPath, 'utf8');
        const jsonData = JSON.parse(data);

        // 缓存结果
        if (this.cacheService) {
          this.cacheService.set(cacheKey, jsonData, 5 * 60 * 1000); // 5分钟缓存
        }

        this.logger.debug('JSON文件读取成功', { filePath, resolvedPath });
        return jsonData;
      } catch (error) {
        this.logger.error('读取JSON文件失败', {
          error: error.message,
          filePath
        });
        return null;
      }
    });

    // 读取本地文件（通用）
    this.registerHandler('read-local-file', async (_, filePath: string) => {
      this.validateArgs([filePath], 1, ['string']);

      try {
        // 检查缓存
        const cacheKey = `file:${filePath}`;
        if (this.cacheService) {
          const cached = this.cacheService.get(cacheKey);
          if (cached) {
            this.logger.debug('从缓存读取文件', { filePath });
            return cached;
          }
        }

        const absolutePath = this.resolveFilePath(filePath);

        // 检查文件是否存在
        if (!fs.existsSync(absolutePath)) {
          this.logger.warn('文件不存在', { filePath, absolutePath });
          return null;
        }

        // 读取文件内容
        const content = fs.readFileSync(absolutePath);
        const extension = path.extname(absolutePath).toLowerCase();

        let result: any;

        // 根据文件类型返回不同的格式
        if (['.json', '.txt', '.html', '.css', '.js', '.xml', '.md'].includes(extension)) {
          result = content.toString('utf8');
        } else {
          // 对于二进制文件，返回Buffer数据
          result = content;
        }

        // 缓存结果（文本文件缓存时间长一些）
        if (this.cacheService) {
          const ttl = extension === '.json' ? 5 * 60 * 1000 : 10 * 60 * 1000;
          this.cacheService.set(cacheKey, result, ttl);
        }

        this.logger.debug('文件读取成功', {
          filePath,
          absolutePath,
          extension,
          size: content.length
        });

        return result;
      } catch (error) {
        this.logger.error('读取文件失败', {
          error: error.message,
          filePath
        });
        return null;
      }
    });

    // 检查文件是否存在
    this.registerHandler('file-exists', async (_, filePath: string) => {
      this.validateArgs([filePath], 1, ['string']);

      try {
        const resolvedPath = this.resolveFilePath(filePath);
        const exists = fs.existsSync(resolvedPath);

        this.logger.debug('检查文件存在', { filePath, resolvedPath, exists });
        return exists;
      } catch (error) {
        this.logger.error('检查文件存在失败', {
          error: error.message,
          filePath
        });
        return false;
      }
    });

    // 获取应用资源路径
    this.registerHandler('get-resources-path', async () => {
      let resourcesPath: string;

      if (app.isPackaged) {
        resourcesPath = path.join(
          path.dirname(path.dirname(app.getPath('exe'))),
          'Resources'
        );
      } else {
        resourcesPath = app.getAppPath();
      }

      this.logger.debug('获取资源路径', { resourcesPath, isPackaged: app.isPackaged });
      return resourcesPath;
    });

    // 获取用户数据路径
    this.registerHandler('get-user-data-path', async () => {
      const userDataPath = app.getPath('userData');
      this.logger.debug('获取用户数据路径', { userDataPath });
      return userDataPath;
    });

    // 获取临时目录路径
    this.registerHandler('get-temp-path', async () => {
      const tempPath = app.getPath('temp');
      this.logger.debug('获取临时目录路径', { tempPath });
      return tempPath;
    });

    // 获取文件统计信息
    this.registerHandler('get-file-stats', async (_, filePath: string) => {
      this.validateArgs([filePath], 1, ['string']);

      try {
        const resolvedPath = this.resolveFilePath(filePath);

        if (!fs.existsSync(resolvedPath)) {
          return null;
        }

        const stats = fs.statSync(resolvedPath);
        const fileStats = {
          size: stats.size,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          mtime: stats.mtime,
          ctime: stats.ctime,
          atime: stats.atime
        };

        this.logger.debug('获取文件统计信息', { filePath, resolvedPath, fileStats });
        return fileStats;
      } catch (error) {
        this.logger.error('获取文件统计信息失败', {
          error: error.message,
          filePath
        });
        return null;
      }
    });

    // 列出目录内容
    this.registerHandler('list-directory', async (_, dirPath: string) => {
      this.validateArgs([dirPath], 1, ['string']);

      try {
        const resolvedPath = this.resolveFilePath(dirPath);

        if (!fs.existsSync(resolvedPath)) {
          this.logger.warn('目录不存在', { dirPath, resolvedPath });
          return [];
        }

        if (!fs.statSync(resolvedPath).isDirectory()) {
          throw new Error('指定路径不是目录');
        }

        const items = fs.readdirSync(resolvedPath).map(item => {
          const itemPath = path.join(resolvedPath, item);
          const stats = fs.statSync(itemPath);

          return {
            name: item,
            path: itemPath,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            size: stats.size,
            mtime: stats.mtime
          };
        });

        this.logger.debug('列出目录内容', {
          dirPath,
          resolvedPath,
          itemCount: items.length
        });

        return items;
      } catch (error) {
        this.logger.error('列出目录内容失败', {
          error: error.message,
          dirPath
        });
        return [];
      }
    });

    // 清理文件缓存
    this.registerHandler('clear-file-cache', async () => {
      if (this.cacheService) {
        // 这里可以更精确地清理文件相关的缓存
        this.cacheService.clear();
        this.logger.info('文件缓存已清理');
        return this.createSuccessResponse();
      } else {
        this.logger.warn('缓存服务不可用');
        return this.createErrorResponse(new Error('缓存服务不可用'));
      }
    });

    this.logger.info('FileIpcHandler 初始化完成', {
      registeredChannels: this.getRegisteredChannels().length
    });
  }

  /**
   * 解析文件路径
   */
  private resolveFilePath(filePath: string): string {
    // 如果是绝对路径，直接返回
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // 相对路径解析
    if (app.isPackaged) {
      // 打包环境中的路径解析
      if (process.platform === 'darwin') {
        // macOS应用包结构
        let resolvedPath = path.join(
          path.dirname(path.dirname(app.getPath('exe'))),
          'Resources',
          'app.asar.unpacked',
          filePath
        );

        // 如果不存在，尝试其他可能的位置
        if (!fs.existsSync(resolvedPath)) {
          resolvedPath = path.join(
            path.dirname(path.dirname(app.getPath('exe'))),
            'Resources',
            filePath
          );
        }

        // 如果还不存在，尝试在renderer目录下查找
        if (!fs.existsSync(resolvedPath)) {
          resolvedPath = path.join(
            path.dirname(path.dirname(app.getPath('exe'))),
            'Resources',
            'renderer',
            filePath.replace(/^\//, '')
          );
        }

        return resolvedPath;
      } else {
        // Windows/Linux应用包结构
        let resolvedPath = path.join(
          path.dirname(app.getPath('exe')),
          'resources',
          filePath
        );

        // 如果不存在，尝试在renderer目录下查找
        if (!fs.existsSync(resolvedPath)) {
          resolvedPath = path.join(
            path.dirname(app.getPath('exe')),
            'resources',
            'renderer',
            filePath.replace(/^\//, '')
          );
        }

        return resolvedPath;
      }
    } else {
      // 开发环境中的路径解析
      let resolvedPath = path.join(app.getAppPath(), filePath);

      // 如果不存在，尝试在renderer/public目录下查找
      if (!fs.existsSync(resolvedPath)) {
        resolvedPath = path.join(
          app.getAppPath(),
          'packages',
          'renderer',
          'public',
          filePath.replace(/^\//, '')
        );
      }

      // 如果还不存在，尝试在renderer/dist目录下查找
      if (!fs.existsSync(resolvedPath)) {
        resolvedPath = path.join(
          app.getAppPath(),
          'packages',
          'renderer',
          'dist',
          filePath.replace(/^\//, '')
        );
      }

      return resolvedPath;
    }
  }
}