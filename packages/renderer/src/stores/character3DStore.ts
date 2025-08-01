import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { Character3DState, Character3DActions, PerformanceMetrics } from '../types/character3d';

/**
 * 3D角色状态管理Store
 * 使用Zustand进行轻量化状态管理
 */
interface Character3DStore extends Character3DState, Character3DActions { }

export const useCharacter3DStore = create<Character3DStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // ==================== 状态 ====================

      // 渲染状态
      isLoaded: false,
      renderQuality: 'medium' as const,
      frameRate: 60,
      memoryUsage: 0,

      // 模型状态
      currentModel: '',
      currentAnimation: 'idle',
      currentExpression: 'neutral',
      isVisible: true,
      modelScale: 1,
      modelPosition: [0, 0, 0],

      // 语音状态
      isSpeaking: false,
      currentViseme: 'SIL',
      audioLevel: 0,

      // MCP状态
      mcpConnected: false,
      activeTools: [],
      lastCommand: '',

      // 性能监控
      performanceHistory: [],
      lastPerformanceCheck: Date.now(),

      // ==================== Actions ====================

      /**
       * 设置渲染质量
       */
      setRenderQuality: (quality) => set((state) => {
        state.renderQuality = quality;
        console.log(`渲染质量设置为: ${quality}`);

        // 触发质量变更事件
        window.dispatchEvent(new CustomEvent('character3d:qualityChanged', {
          detail: { quality }
        }));
      }),

      /**
       * 设置模型加载状态
       */
      setIsLoaded: (loaded) => set((state) => {
        state.isLoaded = loaded;
        console.log(`模型加载状态: ${loaded ? '已加载' : '未加载'}`);
      }),

      /**
       * 设置当前模型
       */
      setCurrentModel: (modelPath) => set((state) => {
        state.currentModel = modelPath;
        state.isLoaded = false; // 重置加载状态
        console.log(`设置当前模型: ${modelPath}`);
      }),

      /**
       * 播放动画
       */
      playAnimation: (animationName, options = {}) => set((state) => {
        state.currentAnimation = animationName;
        console.log(`播放动画: ${animationName}`, options);

        // 触发动画变更事件
        window.dispatchEvent(new CustomEvent('character3d:animationChanged', {
          detail: { animation: animationName, options }
        }));
      }),

      /**
       * 设置表情
       */
      setExpression: (expressionName, intensity = 1.0) => set((state) => {
        state.currentExpression = expressionName;
        console.log(`设置表情: ${expressionName}, 强度: ${intensity}`);

        // 触发表情变更事件
        window.dispatchEvent(new CustomEvent('character3d:expressionChanged', {
          detail: { expression: expressionName, intensity }
        }));
      }),

      /**
       * 设置语音状态
       */
      setSpeaking: (speaking, viseme = 'SIL') => set((state) => {
        state.isSpeaking = speaking;
        state.currentViseme = viseme;
        console.log(`语音状态: ${speaking ? '正在说话' : '静默'}, Viseme: ${viseme}`);
      }),

      /**
       * 设置音频级别
       */
      setAudioLevel: (level) => set((state) => {
        state.audioLevel = Math.max(0, Math.min(1, level));
      }),

      /**
       * 设置模型可见性
       */
      setVisible: (visible) => set((state) => {
        state.isVisible = visible;
        console.log(`模型可见性: ${visible ? '可见' : '隐藏'}`);
      }),

      /**
       * 设置模型变换
       */
      setModelTransform: (scale, position) => set((state) => {
        if (scale !== undefined) state.modelScale = scale;
        if (position !== undefined) state.modelPosition = position;
      }),

      /**
       * 更新性能指标
       */
      updatePerformanceMetrics: (metrics) => set((state) => {
        state.frameRate = metrics.fps;
        state.memoryUsage = metrics.memoryMB;

        const now = Date.now();

        // 添加到性能历史
        state.performanceHistory.push({
          ...metrics,
          timestamp: now
        });

        // 保持最近5分钟的性能历史
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        state.performanceHistory = state.performanceHistory.filter(
          (record: any) => record.timestamp > fiveMinutesAgo
        );

        state.lastPerformanceCheck = now;

        // 自动调整质量
        const shouldAutoAdjust = now - state.lastPerformanceCheck > 5000; // 5秒间隔
        if (shouldAutoAdjust) {
          if (metrics.fps < 25 && state.renderQuality !== 'low') {
            console.log('性能监控: 帧率过低，自动降低渲染质量');
            const newQuality = state.renderQuality === 'ultra' ? 'high' :
              state.renderQuality === 'high' ? 'medium' : 'low';
            state.renderQuality = newQuality;
          } else if (metrics.fps > 55 && metrics.memoryMB < 100) {
            // 性能良好时可以适当提升质量
            if (state.renderQuality === 'low') {
              state.renderQuality = 'medium';
            } else if (state.renderQuality === 'medium' && metrics.memoryMB < 50) {
              state.renderQuality = 'high';
            }
          }
        }
      }),

      /**
       * 设置MCP连接状态
       */
      setMCPConnected: (connected) => set((state) => {
        state.mcpConnected = connected;
        console.log(`MCP连接状态: ${connected ? '已连接' : '断开'}`);
      }),

      /**
       * 添加活跃工具
       */
      addActiveTool: (toolName) => set((state) => {
        if (!state.activeTools.includes(toolName)) {
          state.activeTools.push(toolName);
        }
      }),

      /**
       * 移除活跃工具
       */
      removeActiveTool: (toolName) => set((state) => {
        state.activeTools = state.activeTools.filter((tool: string) => tool !== toolName);
      }),

      /**
       * 设置最后执行的命令
       */
      setLastCommand: (command) => set((state) => {
        state.lastCommand = command;
      }),

      /**
       * 重置状态
       */
      reset: () => set((state) => {
        // 保留一些基础设置，重置其他状态
        state.isLoaded = false;
        state.currentAnimation = 'idle';
        state.currentExpression = 'neutral';
        state.isSpeaking = false;
        state.currentViseme = 'SIL';
        state.audioLevel = 0;
        state.activeTools = [];
        state.lastCommand = '';
        state.performanceHistory = [];
        console.log('3D角色状态已重置');
      }),

      /**
       * 获取性能统计
       */
      getPerformanceStats: () => {
        const state = get();
        const history = state.performanceHistory;

        if (history.length === 0) {
          return {
            averageFPS: 0,
            minFPS: 0,
            maxFPS: 0,
            averageMemory: 0,
            maxMemory: 0
          };
        }

        const fps = history.map(h => h.fps);
        const memory = history.map(h => h.memoryMB);

        return {
          averageFPS: fps.reduce((a, b) => a + b, 0) / fps.length,
          minFPS: Math.min(...fps),
          maxFPS: Math.max(...fps),
          averageMemory: memory.reduce((a, b) => a + b, 0) / memory.length,
          maxMemory: Math.max(...memory)
        };
      }
    }))
  )
);

// 性能监控订阅
useCharacter3DStore.subscribe(
  (state) => state.frameRate,
  (frameRate) => {
    // 如果帧率过低，发出警告
    if (frameRate < 20) {
      console.warn(`性能警告: 当前帧率 ${frameRate.toFixed(1)} FPS 过低`);
    }
  }
);

// 内存使用监控订阅
useCharacter3DStore.subscribe(
  (state) => state.memoryUsage,
  (memoryUsage) => {
    // 如果内存使用过高，发出警告
    if (memoryUsage > 200) {
      console.warn(`内存警告: 当前内存使用 ${memoryUsage.toFixed(1)} MB 过高`);
    }
  }
);

// 导出类型以供其他模块使用
export type { Character3DStore };