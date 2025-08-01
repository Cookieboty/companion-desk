import { BaseAdapter, ToolResult, CharacterResponse } from './BaseAdapter.js';

/**
 * 代码解释工具
 * 提供代码分析、解释和演示功能
 */
export class CodeExplanationTool extends BaseAdapter {
  private errorCount: number = 0;
  private totalExecutionTime: number = 0;
  private executionCount: number = 0;

  constructor() {
    super(
      'explain_code',
      '分析和解释代码，提供详细的语法说明和概念介绍，支持多种编程语言',
      '1.0.0'
    );
  }

  /**
   * 执行代码解释
   */
  async execute(args: any): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      console.log('CodeExplanationTool: 开始执行代码解释', args);

      // 验证输入参数
      const validation = this.validateInput(args);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const { code, language, context } = args;

      // 分析代码
      const analysis = await this.analyzeCode(code, language, context);

      // 生成角色响应
      const characterResponse = this.generateCharacterResponse(analysis);

      const duration = Date.now() - startTime;
      this.updateStats(duration);

      console.log('CodeExplanationTool: 代码解释完成');

      return {
        success: true,
        content: analysis.explanation,
        metadata: {
          timestamp: Date.now(),
          duration,
          characterResponse,
          codeLanguage: language,
          complexity: analysis.complexity,
          concepts: analysis.concepts
        }
      };
    } catch (error) {
      this.errorCount++;
      const duration = Date.now() - startTime;
      this.updateStats(duration);

      console.error('CodeExplanationTool: 执行失败:', error);

      return {
        success: false,
        content: '代码解释失败',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          timestamp: Date.now(),
          duration
        }
      };
    }
  }

  /**
   * 获取输入参数模式
   */
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要解释的代码'
        },
        language: {
          type: 'string',
          description: '编程语言',
          enum: ['javascript', 'typescript', 'python', 'java', 'cpp', 'csharp', 'go', 'rust']
        },
        context: {
          type: 'string',
          description: '代码上下文或背景信息（可选）'
        },
        level: {
          type: 'string',
          description: '解释详细程度',
          enum: ['basic', 'intermediate', 'advanced'],
          default: 'intermediate'
        }
      },
      required: ['code', 'language']
    };
  }

  /**
   * 分析代码
   */
  private async analyzeCode(code: string, language: string, context?: string): Promise<CodeAnalysis> {
    try {
      // 根据语言进行特定分析
      let analysis: CodeAnalysis;

      switch (language.toLowerCase()) {
        case 'javascript':
        case 'typescript':
          analysis = this.analyzeJavaScript(code, context);
          break;
        case 'python':
          analysis = this.analyzePython(code, context);
          break;
        case 'java':
          analysis = this.analyzeJava(code, context);
          break;
        default:
          analysis = this.analyzeGeneric(code, language, context);
      }

      return analysis;
    } catch (error) {
      console.error('代码分析失败:', error);
      throw new Error(`代码分析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * JavaScript/TypeScript 代码分析
   */
  private analyzeJavaScript(code: string, context?: string): CodeAnalysis {
    const concepts: string[] = [];
    const patterns: string[] = [];
    const suggestions: string[] = [];
    let complexity = 0;

    // 检测概念和模式
    if (code.includes('async') || code.includes('await')) {
      concepts.push('异步编程', 'Promise', 'async/await');
      patterns.push('异步函数模式');
      complexity += 0.3;
    }

    if (code.includes('=>')) {
      concepts.push('箭头函数', 'ES6语法');
      patterns.push('函数式编程');
      complexity += 0.2;
    }

    if (code.includes('class')) {
      concepts.push('类', '面向对象编程');
      patterns.push('类定义模式');
      complexity += 0.4;
    }

    if (code.includes('const') || code.includes('let')) {
      concepts.push('块级作用域', 'ES6变量声明');
    }

    // 生成解释
    let explanation = `这段${code.includes('class') ? 'TypeScript' : 'JavaScript'}代码`;

    if (concepts.length > 0) {
      explanation += `主要涉及以下概念：${concepts.join('、')}。`;
    }

    if (patterns.length > 0) {
      explanation += `使用了${patterns.join('、')}等编程模式。`;
    }

    // 添加建议
    if (code.includes('var')) {
      suggestions.push('建议使用 const 或 let 替代 var');
    }

    if (!code.includes('use strict') && !code.includes('class')) {
      suggestions.push('建议使用严格模式');
    }

    return {
      explanation: explanation + (suggestions.length > 0 ? ` 建议：${suggestions.join('；')}。` : ''),
      complexity: Math.min(complexity, 1),
      concepts,
      suggestions,
      patterns
    };
  }

  /**
   * Python 代码分析
   */
  private analyzePython(code: string, context?: string): CodeAnalysis {
    const concepts: string[] = [];
    const patterns: string[] = [];
    const suggestions: string[] = [];
    let complexity = 0;

    // 检测Python特性
    if (code.includes('def ')) {
      concepts.push('函数定义');
      complexity += 0.2;
    }

    if (code.includes('class ')) {
      concepts.push('类', '面向对象编程');
      complexity += 0.4;
    }

    if (code.includes('import ') || code.includes('from ')) {
      concepts.push('模块导入');
    }

    if (code.includes('[') && code.includes('for') && code.includes('in')) {
      concepts.push('列表推导式');
      patterns.push('函数式编程');
      complexity += 0.3;
    }

    if (code.includes('with ')) {
      concepts.push('上下文管理器');
      patterns.push('资源管理模式');
      complexity += 0.3;
    }

    const explanation = `这段Python代码${concepts.length > 0 ? `涉及${concepts.join('、')}等概念` : ''}，体现了Python的简洁性和可读性。`;

    return {
      explanation,
      complexity: Math.min(complexity, 1),
      concepts,
      suggestions,
      patterns
    };
  }

  /**
   * Java 代码分析
   */
  private analyzeJava(code: string, context?: string): CodeAnalysis {
    const concepts: string[] = [];
    const patterns: string[] = [];
    let complexity = 0;

    if (code.includes('public class')) {
      concepts.push('类定义', '面向对象编程');
      complexity += 0.3;
    }

    if (code.includes('interface')) {
      concepts.push('接口', '抽象');
      complexity += 0.4;
    }

    if (code.includes('extends') || code.includes('implements')) {
      concepts.push('继承', '多态');
      complexity += 0.5;
    }

    const explanation = `这段Java代码展示了${concepts.join('、')}等面向对象编程的核心概念。`;

    return {
      explanation,
      complexity: Math.min(complexity, 1),
      concepts,
      suggestions: [],
      patterns
    };
  }

  /**
   * 通用代码分析
   */
  private analyzeGeneric(code: string, language: string, context?: string): CodeAnalysis {
    const lineCount = code.split('\n').length;
    const complexity = lineCount > 50 ? 0.8 : lineCount > 20 ? 0.5 : 0.3;

    return {
      explanation: `这段${language}代码包含${lineCount}行，${complexity > 0.6 ? '相对复杂' : '结构清晰'}。`,
      complexity,
      concepts: [language + '编程'],
      suggestions: [],
      patterns: []
    };
  }

  /**
   * 生成角色响应
   */
  private generateCharacterResponse(analysis: CodeAnalysis): CharacterResponse {
    let animation = 'explaining';
    let expression = 'neutral';

    // 根据复杂度选择动画
    if (analysis.complexity > 0.7) {
      animation = 'thinking_complex';
      expression = 'focused';
    } else if (analysis.complexity > 0.4) {
      animation = 'explaining_detailed';
      expression = 'interested';
    } else {
      animation = 'explaining_simple';
      expression = 'friendly';
    }

    // 生成语音文本
    const speechText = `让我来解释这段代码。${analysis.explanation}`;

    return {
      animation,
      expression,
      speech: speechText,
      gesture: analysis.complexity > 0.5 ? 'point_highlight' : 'normal_gesture'
    };
  }

  /**
   * 更新统计信息
   */
  private updateStats(duration: number): void {
    this.executionCount++;
    this.totalExecutionTime += duration;
  }

  /**
   * 获取工具状态
   */
  getStatus() {
    return {
      isReady: true,
      lastUsed: Date.now(),
      errorCount: this.errorCount,
      averageExecutionTime: this.executionCount > 0 ? this.totalExecutionTime / this.executionCount : 0
    };
  }
}

/**
 * 代码分析结果接口
 */
interface CodeAnalysis {
  explanation: string;
  complexity: number;
  concepts: string[];
  suggestions: string[];
  patterns: string[];
}