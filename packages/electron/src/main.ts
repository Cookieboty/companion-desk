/**
 * Electron应用主入口文件 - 重构版本
 * 简化架构，使用Application类管理应用生命周期
 */

import { app } from 'electron';

import { Application } from './core/Application';
import { registerModelSchemePrivileges } from './models/ModelService';
import { migrateLegacyUserData } from './utils/legacyUserData';
import { perfMark } from './utils/perfMarks';

perfMark('main-entry');

// 品牌更名后沿用旧 userData（仅打包产物；需在 ready 之前）
if (app.isPackaged) {
  try {
    const res = migrateLegacyUserData(app.getPath('appData'), app.getPath('userData'));
    if (res.migrated) console.log(`📦 已迁移旧版用户数据: ${res.from} → ${res.to}`);
  } catch (error) {
    console.warn('旧版用户数据迁移失败:', error);
  }
}

// cdmodel://（远程 / 用户模型文件）需在 app ready 之前注册为特权协议
registerModelSchemePrivileges();

// 全局应用实例
let application: Application | null = null;

/**
 * 应用入口函数
 */
async function main(): Promise<void> {
  try {
    // 创建应用实例
    application = new Application();

    // 初始化并启动应用
    await application.initialize();
    await application.start();

    console.log('✅ Companion Desk 启动成功');
  } catch (error) {
    console.error('❌ 应用启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭处理
async function gracefulShutdown(): Promise<void> {
  if (application) {
    await application.stop();
  }
  process.exit(0);
}

// 进程信号处理
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 启动应用
main().catch((error) => {
  console.error('主程序异常:', error);
  process.exit(1);
});
