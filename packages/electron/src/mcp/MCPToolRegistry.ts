import { BaseAdapter } from './tools/BaseAdapter.js';

/**
 * MCP工具注册中心
 * 管理所有MCP工具的注册、发现和元数据
 */
export class MCPToolRegistry {
  private tools: Map<string, BaseAdapter>;
  private metadata: Map<string, ToolMetadata>;

  constructor() {
    this.tools = new Map();
    this.metadata = new Map();
  }

  /**
   * 注册工具
   */
  async registerTool(name: string, tool: BaseAdapter): Promise<void> {
    try {
      console.log(`MCPToolRegistry: 注册工具 ${name}`);

      // 验证工具
      if (!tool || typeof tool.execute !== 'function') {
        throw new Error(`无效的工具实现: ${name}`);
      }

      // 注册工具
      this.tools.set(name, tool);

      // 收集工具元数据
      const metadata: ToolMetadata = {
        name,
        description: tool.getDescription(),
        inputSchema: tool.getInputSchema(),
        category: this.categorizeTool(name),
        version: '1.0.0',
        registeredAt: Date.now(),
        lastUsed: null,
        usageCount: 0
      };

      this.metadata.set(name, metadata);

      console.log(`MCPToolRegistry: 工具 ${name} 注册成功`);
    } catch (error) {
      console.error(`MCPToolRegistry: 注册工具 ${name} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取工具
   */
  getTool(name: string): BaseAdapter | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具名称
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取工具元数据
   */
  getToolMetadata(name: string): ToolMetadata | undefined {
    return this.metadata.get(name);
  }

  /**
   * 获取所有工具元数据
   */
  getAllMetadata(): ToolMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * 按类别获取工具
   */
  getToolsByCategory(category: ToolCategory): ToolMetadata[] {
    return Array.from(this.metadata.values()).filter(meta => meta.category === category);
  }

  /**
   * 更新工具使用统计
   */
  updateUsageStats(name: string): void {
    const metadata = this.metadata.get(name);
    if (metadata) {
      metadata.lastUsed = Date.now();
      metadata.usageCount++;
    }
  }

  /**
   * 获取使用统计
   */
  getUsageStats(): UsageStats {
    const stats: UsageStats = {
      totalTools: this.tools.size,
      totalUsage: 0,
      mostUsedTool: null,
      categoryCounts: {
        codeAssist: 0,
        animation: 0,
        voice: 0,
        interaction: 0,
        system: 0
      }
    };

    for (const metadata of this.metadata.values()) {
      stats.totalUsage += metadata.usageCount;
      stats.categoryCounts[metadata.category]++;

      if (!stats.mostUsedTool || metadata.usageCount > stats.mostUsedTool.usageCount) {
        stats.mostUsedTool = metadata;
      }
    }

    return stats;
  }

  /**
   * 工具分类
   */
  private categorizeTool(name: string): ToolCategory {
    if (name.includes('code') || name.includes('explain')) {
      return 'codeAssist';
    } else if (name.includes('animation') || name.includes('gesture')) {
      return 'animation';
    } else if (name.includes('voice') || name.includes('speech')) {
      return 'voice';
    } else if (name.includes('guide') || name.includes('demo')) {
      return 'interaction';
    } else {
      return 'system';
    }
  }

  /**
   * 搜索工具
   */
  searchTools(query: string): ToolMetadata[] {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.metadata.values()).filter(metadata =>
      metadata.name.toLowerCase().includes(lowercaseQuery) ||
      metadata.description.toLowerCase().includes(lowercaseQuery)
    );
  }

  /**
   * 检查工具是否存在
   */
  hasool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 移除工具
   */
  async unregisterTool(name: string): Promise<boolean> {
    try {
      console.log(`MCPToolRegistry: 移除工具 ${name}`);

      const tool = this.tools.get(name);
      if (tool && 'cleanup' in tool && typeof tool.cleanup === 'function') {
        await tool.cleanup();
      }

      const removed = this.tools.delete(name);
      this.metadata.delete(name);

      console.log(`MCPToolRegistry: 工具 ${name} 移除${removed ? '成功' : '失败'}`);
      return removed;
    } catch (error) {
      console.error(`MCPToolRegistry: 移除工具 ${name} 失败:`, error);
      return false;
    }
  }

  /**
   * 清理所有工具
   */
  async cleanup(): Promise<void> {
    try {
      console.log('MCPToolRegistry: 清理所有工具...');

      for (const [name, tool] of this.tools) {
        try {
          if ('cleanup' in tool && typeof tool.cleanup === 'function') {
            await tool.cleanup();
          }
        } catch (error) {
          console.error(`清理工具 ${name} 失败:`, error);
        }
      }

      this.tools.clear();
      this.metadata.clear();

      console.log('MCPToolRegistry: 清理完成');
    } catch (error) {
      console.error('MCPToolRegistry: 清理失败:', error);
    }
  }
}

/**
 * 工具元数据接口
 */
export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: any;
  category: ToolCategory;
  version: string;
  registeredAt: number;
  lastUsed: number | null;
  usageCount: number;
}

/**
 * 工具类别
 */
export type ToolCategory = 'codeAssist' | 'animation' | 'voice' | 'interaction' | 'system';

/**
 * 使用统计接口
 */
export interface UsageStats {
  totalTools: number;
  totalUsage: number;
  mostUsedTool: ToolMetadata | null;
  categoryCounts: Record<ToolCategory, number>;
}