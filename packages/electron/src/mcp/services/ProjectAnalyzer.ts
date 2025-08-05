/**
 * 项目分析服务
 * 负责分析项目结构和状态
 */

import * as path from 'path';
import * as fs from 'fs';

export interface ProjectInfo {
  type: string;
  fileCount: number;
  summary: string;
  features: string[];
}

export class ProjectAnalyzer {
  /**
   * 分析当前项目
   */
  async analyzeProject(): Promise<string> {
    try {
      const currentDir = process.cwd();
      console.log(`MCP: 分析项目目录: ${currentDir}`);

      const projectInfo = this.getProjectInfo(currentDir);

      const summary = `当前${projectInfo.type}，包含${projectInfo.fileCount}个主要文件，项目状态正常`;
      console.log(`MCP: 项目分析结果: ${summary}`);

      return summary;
    } catch (error) {
      console.error('MCP: 项目分析失败:', error);
      return '项目分析失败，但工作继续进行中';
    }
  }

  /**
   * 获取详细项目信息
   */
  getProjectInfo(projectDir: string): ProjectInfo {
    const projectFiles = [
      'package.json',
      'tsconfig.json',
      'src',
      'packages',
      'README.md'
    ];

    const existingFiles = projectFiles.filter(file => {
      const filePath = path.join(projectDir, file);
      return fs.existsSync(filePath);
    });

    const fileCount = existingFiles.length;

    // 项目类型检测
    let projectType = '未知项目';
    const features: string[] = [];

    if (existingFiles.includes('package.json')) {
      projectType = 'Node.js项目';
      features.push('Node.js');

      // 检查package.json内容
      try {
        const packagePath = path.join(projectDir, 'package.json');
        const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

        if (packageContent.dependencies?.electron) {
          features.push('Electron');
        }
        if (packageContent.dependencies?.react) {
          features.push('React');
        }
        if (packageContent.dependencies?.typescript) {
          features.push('TypeScript');
        }
      } catch (error) {
        console.warn('读取package.json失败:', error);
      }
    }

    if (existingFiles.includes('packages')) {
      projectType = 'Monorepo项目';
      features.push('Monorepo');
    }

    if (existingFiles.includes('tsconfig.json')) {
      features.push('TypeScript');
    }

    return {
      type: projectType,
      fileCount,
      summary: `${projectType}，包含${fileCount}个主要文件`,
      features
    };
  }

  /**
   * 获取项目特性描述
   */
  getProjectFeatures(projectDir: string): string[] {
    const info = this.getProjectInfo(projectDir);
    return info.features;
  }

  /**
   * 检查项目健康状态
   */
  checkProjectHealth(projectDir: string): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];

    // 检查基本文件
    if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
      issues.push('缺少package.json文件');
    }

    // 检查node_modules
    if (!fs.existsSync(path.join(projectDir, 'node_modules'))) {
      issues.push('缺少node_modules，请运行npm install');
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }
}