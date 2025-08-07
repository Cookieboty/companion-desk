/**
 * 语音服务模块 - Standalone版本
 * 负责TTS语音克隆和固定语音播放
 * 移除了electron依赖，适用于独立node.js环境
 */

import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { StandaloneMCPConfigManager } from '../config/StandaloneMCPConfig.js';

export class StandaloneVoiceService {
  private configManager: StandaloneMCPConfigManager;

  constructor() {
    this.configManager = StandaloneMCPConfigManager.getInstance();
  }

  /**
   * 执行语音播放（根据配置模式自动选择）
   */
  async executeVoicePlayback(message: string, urgency: string = 'normal'): Promise<boolean> {
    try {
      // 刷新配置
      this.configManager.loadFromApp();
      const voiceConfig = this.configManager.getVoiceConfig();

      console.log(`MCP: 执行语音播放 - 模式: ${voiceConfig.voiceMode}, 消息: ${message}`);

      let success = false;

      switch (voiceConfig.voiceMode) {
        case 'fixed':
          console.log('MCP: 执行fixed模式语音播放');
          success = await this.playFixedVoice(urgency);
          if (!success) {
            console.log('MCP: 固定语音失败，fallback到TTS');
            await this.playTextToSpeech(message);
            success = true;
          }
          break;

        case 'tts':
          console.log('MCP: 执行TTS模式语音播放，调用语音克隆API');
          await this.playTextToSpeech(message);
          success = true;
          break;

        case 'mixed':
        default:
          console.log('MCP: 执行mixed模式语音播放');
          if (message.length > 20) {
            console.log('MCP: 消息较长，使用TTS');
            await this.playTextToSpeech(message);
            success = true;
          } else {
            console.log('MCP: 消息较短，尝试固定语音');
            success = await this.playFixedVoice(urgency);
            if (!success) {
              console.log('MCP: 固定语音失败，fallback到TTS');
              await this.playTextToSpeech(message);
              success = true;
            }
          }
          break;
      }

      return success;
    } catch (error) {
      console.error('MCP: 语音播放执行失败:', error);
      return false;
    }
  }

  /**
   * 播放固定语音文件
   */
  async playFixedVoice(urgency: string = 'normal'): Promise<boolean> {
    try {
      // 根据urgency选择语音文件
      let selectedFile: string;
      switch (urgency) {
        case 'high':
          selectedFile = 'completion/excited/great_job_01.mp3';
          break;
        case 'low':
          selectedFile = 'completion/calm/done_01.mp3';
          break;
        default:
          // 随机选择normal语音
          const normalFiles = ['completion/normal/completion_01.mp3', 'completion/normal/completion_02.mp3'];
          selectedFile = normalFiles[Math.floor(Math.random() * normalFiles.length)];
      }

      // 构建语音文件路径
      const assetsPath = this.configManager.getAssetsPath();
      const voicePath = this.resolveVoicePath(assetsPath, selectedFile);

      console.log(`MCP: 最终选择的语音文件路径: ${voicePath}`);

      // 检查文件是否存在
      if (!fs.existsSync(voicePath)) {
        console.log(`MCP: 语音文件不存在: ${voicePath}`);
        return false;
      }

      console.log(`MCP: 播放固定语音: ${selectedFile}`);

      // 播放音频文件
      this.playAudioFile(voicePath);
      return true;
    } catch (error) {
      console.error('MCP: 固定语音播放失败:', error);
      return false;
    }
  }

  /**
   * 使用语音克隆API播放语音
   */
  async playTextToSpeech(text: string): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        console.log('MCP: 使用语音克隆API播放:', text);

        // 限制文本长度，避免API调用失败
        const maxLength = 200;
        const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

        console.log('MCP: 处理后的文本长度:', truncatedText.length);

        // 获取TTS API配置
        const apiConfig = this.configManager.getTTSApiConfig();

        // 调用语音克隆API
        console.log('MCP: 开始调用语音克隆API...');

        const postData = JSON.stringify({
          audio_url: apiConfig.audioUrl,
          prompt_text: apiConfig.promptText,
          tts_text: truncatedText
        });

        const options = {
          hostname: apiConfig.hostname,
          port: apiConfig.port,
          path: apiConfig.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 30000
        };

        console.log('MCP: 请求参数:', options);
        console.log('MCP: 请求数据:', postData);

        const req = https.request(options, (res) => {
          console.log('MCP: API响应状态码:', res.statusCode);

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', async () => {
            try {
              console.log('MCP: API原始响应:', data);
              const result = JSON.parse(data);

              if (result.code !== 0) {
                throw new Error(`API返回错误: ${result.content}`);
              }

              const audioUrl = result.data.cos_url;
              console.log('MCP: 获取到语音文件URL:', audioUrl);
              console.log('MCP: 语音克隆API调用成功，开始下载音频');

              await this.downloadAndPlayAudio(audioUrl);
              console.log('MCP: 语音克隆播放完成');
              resolve();
            } catch (parseError) {
              console.error('MCP: 解析API响应失败:', parseError);
              console.error('MCP: 原始响应数据:', data);
              throw parseError;
            }
          });
        });

        req.on('error', (error) => {
          console.error('MCP: HTTPS请求错误:', error);
          throw error;
        });

        req.on('timeout', () => {
          console.error('MCP: API请求超时');
          req.destroy();
          throw new Error('API请求超时');
        });

        // 发送请求数据
        req.write(postData);
        req.end();

      } catch (error) {
        console.error('MCP: 语音克隆API调用失败:', error);

        // 网络错误时fallback到系统TTS
        const errorMessage = (error as any)?.message || String(error);
        const isNetworkError = errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('timeout');

        if (isNetworkError) {
          console.log('MCP: 网络错误，fallback到系统TTS');
          this.fallbackToSystemTTS(text);
          setTimeout(resolve, 2000);
        } else {
          console.error('MCP: 语音克隆API错误，不使用fallback TTS');
          resolve();
        }
      }
    });
  }

  /**
   * 下载并播放音频文件
   */
  private async downloadAndPlayAudio(audioUrl: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        console.log('MCP: 开始下载音频文件:', audioUrl);

        // 创建临时文件
        const tmpDir = require('os').tmpdir();
        const tempFilePath = path.join(tmpDir, `tts_${Date.now()}.mp3`);
        const file = fs.createWriteStream(tempFilePath);

        // 解析URL
        const url = new URL(audioUrl);
        const client = url.protocol === 'https:' ? https : http;

        // 下载音频文件
        const request = client.get(audioUrl, (response) => {
          console.log('MCP: 下载响应状态码:', response.statusCode);

          if (response.statusCode !== 200) {
            throw new Error(`下载音频失败: ${response.statusCode}`);
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            console.log('MCP: 音频文件已下载到:', tempFilePath);

            // 播放音频文件
            this.playDownloadedAudio(tempFilePath, resolve);
          });

          file.on('error', (error) => {
            console.error('MCP: 写入音频文件失败:', error);
            resolve();
          });
        });

        request.on('error', (error) => {
          console.error('MCP: 下载音频请求失败:', error);
          resolve();
        });

        request.setTimeout(30000, () => {
          console.error('MCP: 下载音频超时');
          request.destroy();
          resolve();
        });

      } catch (error) {
        console.error('MCP: 下载播放音频失败:', error);
        resolve();
      }
    });
  }

  /**
   * 播放下载的音频文件
   */
  private playDownloadedAudio(tempFilePath: string, callback: () => void): void {
    console.log('MCP: 开始播放音频文件...');

    let audioProcess: ChildProcess;
    if (process.platform === 'darwin') {
      audioProcess = spawn('afplay', [tempFilePath]);
    } else if (process.platform === 'win32') {
      audioProcess = spawn('powershell', ['-c', `(New-Object Media.SoundPlayer "${tempFilePath}").PlaySync()`]);
    } else {
      audioProcess = spawn('mpg123', [tempFilePath]);
      audioProcess.on('error', () => {
        spawn('ffplay', ['-nodisp', '-autoexit', tempFilePath]);
      });
    }

    console.log('MCP: 音频播放进程已启动，PID:', audioProcess.pid);

    // 监听播放完成
    audioProcess.on('close', (code) => {
      console.log(`MCP: 音频播放完成，退出码: ${code}`);
      this.cleanupTempFile(tempFilePath);
      console.log('MCP: 语音克隆播放完成');
      callback();
    });

    audioProcess.on('error', (error) => {
      console.error('MCP: 音频播放失败:', error);
      this.cleanupTempFile(tempFilePath);
      callback();
    });

    // 添加超时机制，防止播放卡住
    setTimeout(() => {
      if (!audioProcess.killed) {
        console.log('MCP: 音频播放超时，强制完成');
        audioProcess.kill();
        this.cleanupTempFile(tempFilePath);
        callback();
      }
    }, 10000); // 10秒超时
  }

  /**
   * 播放音频文件（通用）
   */
  private playAudioFile(filePath: string): void {
    if (process.platform === 'darwin') {
      spawn('afplay', [filePath]);
    } else if (process.platform === 'win32') {
      spawn('powershell', ['-c', `(New-Object Media.SoundPlayer "${filePath}").PlaySync()`]);
    } else {
      spawn('mpg123', [filePath]).on('error', () => {
        spawn('ffplay', ['-nodisp', '-autoexit', filePath]);
      });
    }
  }

  /**
   * 解析语音文件路径
   */
  private resolveVoicePath(assetsPath: string, selectedFile: string): string {
    const isDev = process.env.NODE_ENV === 'development';
    const scriptDir = __dirname;
    const currentDir = process.cwd();

    if (isDev || !process.env.ELECTRON_RUN_AS_NODE) {
      // 开发环境或standalone环境路径查找策略
      const possiblePaths = [
        path.join(scriptDir, '..', '..', 'assets', selectedFile),
        path.join(scriptDir, 'assets', selectedFile),
        path.join(currentDir, assetsPath, selectedFile),
        path.join(currentDir, 'assets', selectedFile),
        path.resolve(currentDir, assetsPath, selectedFile)
      ];

      // 找到第一个存在的文件路径
      const voicePath = possiblePaths.find(p => {
        const exists = fs.existsSync(p);
        console.log(`MCP: 检查语音文件路径: ${p} -> ${exists ? '存在' : '不存在'}`);
        return exists;
      }) || possiblePaths[0]; // 如果都不存在，使用第一个作为fallback

      return voicePath;
    } else {
      // 生产环境
      return path.join(process.resourcesPath, 'app', 'assets', selectedFile);
    }
  }

  /**
   * 系统TTS fallback
   */
  private fallbackToSystemTTS(text: string): void {
    try {
      if (process.platform === 'darwin') {
        spawn('say', ['-v', 'Ting-Ting', text]);
      } else if (process.platform === 'win32') {
        const script = `Add-Type -AssemblyName System.speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Speak('${text}')`;
        spawn('powershell', ['-Command', script]);
      } else {
        spawn('espeak', [text]);
      }
    } catch (error) {
      console.error('MCP: 系统TTS也失败:', error);
    }
  }

  /**
   * 清理临时文件
   */
  private cleanupTempFile(filePath: string): void {
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('MCP: 临时音频文件已清理:', filePath);
        }
      } catch (cleanupError) {
        console.warn('MCP: 清理临时文件失败:', cleanupError);
      }
    }, 1000);
  }

  /**
   * 播放系统通知声音
   */
  async playSystemSound(): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (process.platform === 'darwin') {
          spawn('afplay', ['/System/Library/Sounds/Glass.aiff']);
        } else if (process.platform === 'win32') {
          spawn('powershell', ['-c', '(New-Object Media.SoundPlayer "C:\\Windows\\Media\\notify.wav").PlaySync()']);
        } else {
          spawn('paplay', ['/usr/share/sounds/alsa/Front_Left.wav']).on('error', () => {
            spawn('aplay', ['/usr/share/sounds/alsa/Front_Left.wav']);
          });
        }

        setTimeout(resolve, 500);
      } catch (error) {
        console.error('播放系统声音失败:', error);
        resolve();
      }
    });
  }
}
