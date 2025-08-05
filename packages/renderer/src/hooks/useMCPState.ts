import { useState, useEffect, useCallback } from 'react';
import { useCharacter3DStore } from '../stores/character3DStore';

/**
 * MCP状态接口
 */
interface MCPStatus {
  isConnected: boolean;
  isServerReady: boolean;
  lastCommand: string;
  activeTools: string[];
  connectionError: string | null;
}

/**
 * MCP命令结果接口
 */
interface MCPCommandResult {
  success: boolean;
  content: string;
  metadata?: any;
  error?: string;
}

/**
 * MCP状态管理Hook
 * 管理MCP服务器连接状态和命令执行
 */
export const useMCPState = () => {
  const [status, setStatus] = useState<MCPStatus>({
    isConnected: false,
    isServerReady: false,
    lastCommand: '',
    activeTools: [],
    connectionError: null
  });

  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<MCPCommandResult | null>(null);

  const {
    mcpConnected,
    activeTools,
    lastCommand,
    setMCPConnected,
    addActiveTool,
    removeActiveTool,
    setLastCommand
  } = useCharacter3DStore();

  /**
   * 同步状态到store
   */
  useEffect(() => {
    setStatus(prev => ({
      ...prev,
      isConnected: mcpConnected,
      activeTools,
      lastCommand
    }));
  }, [mcpConnected, activeTools, lastCommand]);

  /**
   * 检查MCP服务器状态
   */
  const checkMCPStatus = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.mcp) {
        const serverStatus = await window.electronAPI.mcp.getStatus();

        setStatus(prev => ({
          ...prev,
          isConnected: serverStatus.isRunning,
          isServerReady: serverStatus.mcpServerReady,
          connectionError: null
        }));

        setMCPConnected(serverStatus.isRunning && serverStatus.mcpServerReady);

        return serverStatus;
      } else {
        throw new Error('MCP API不可用');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '连接失败';
      setStatus(prev => ({
        ...prev,
        isConnected: false,
        isServerReady: false,
        connectionError: errorMessage
      }));

      setMCPConnected(false);
      return null;
    }
  }, [setMCPConnected]);

  /**
   * 执行MCP命令
   */
  const executeCommand = useCallback(async (toolName: string, args: any = {}): Promise<MCPCommandResult> => {
    setIsExecuting(true);
    addActiveTool(toolName);
    setLastCommand(`${toolName}(${JSON.stringify(args)})`);

    try {
      if (!status.isConnected || !status.isServerReady) {
        throw new Error('MCP服务器未连接或未就绪');
      }

      if (typeof window === 'undefined' || !window.electronAPI?.mcp) {
        throw new Error('MCP API不可用');
      }

      console.log(`useMCPState: 执行命令 ${toolName}`, args);

      const result = await window.electronAPI.mcp.callTool(toolName, args);

      const commandResult: MCPCommandResult = {
        success: !result.isError,
        content: result.content?.[0]?.text || '',
        metadata: {},
        error: result.isError ? (result.content?.[0]?.text || '未知错误') : undefined
      };

      setLastResult(commandResult);

      console.log(`useMCPState: 命令 ${toolName} 执行完成`, commandResult);

      return commandResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '命令执行失败';
      const commandResult: MCPCommandResult = {
        success: false,
        content: '',
        error: errorMessage
      };

      setLastResult(commandResult);
      console.error(`useMCPState: 命令 ${toolName} 执行失败:`, error);

      return commandResult;
    } finally {
      setIsExecuting(false);
      removeActiveTool(toolName);
    }
  }, [status.isConnected, status.isServerReady, addActiveTool, removeActiveTool, setLastCommand]);

  /**
   * 获取可用工具列表
   */
  const getAvailableTools = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.mcp) {
        const tools = await window.electronAPI.mcp.getAvailableTools();
        return tools || [];
      }
      return [];
    } catch (error) {
      console.error('useMCPState: 获取工具列表失败:', error);
      return [];
    }
  }, []);

  /**
   * 重连MCP服务器
   */
  const reconnect = useCallback(async () => {
    console.log('useMCPState: 尝试重连MCP服务器...');

    setStatus(prev => ({
      ...prev,
      connectionError: null
    }));

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.mcp) {
        await window.electronAPI.mcp.restart();
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待服务器启动
        await checkMCPStatus();
      }
    } catch (error) {
      console.error('useMCPState: 重连失败:', error);
    }
  }, [checkMCPStatus]);

  /**
   * 初始化和定期检查状态
   */
  useEffect(() => {
    // 初始检查
    checkMCPStatus();

    // 定期检查状态（每30秒）
    const interval = setInterval(() => {
      if (!isExecuting) { // 避免在执行命令时检查状态
        checkMCPStatus();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [checkMCPStatus, isExecuting]);

  return {
    // 状态
    status,
    isExecuting,
    lastResult,

    // 方法
    checkMCPStatus,
    executeCommand,
    getAvailableTools,
    reconnect
  };
};

export default useMCPState;