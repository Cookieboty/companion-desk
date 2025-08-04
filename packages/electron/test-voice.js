#!/usr/bin/env node

/**
 * 固定语音播放测试脚本
 * 用于排查语音播放问题
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

console.log('🔍 开始测试固定语音播放...\n');

// 测试配置
const testConfig = {
  voiceMode: 'fixed',
  enableProjectSummary: true
};

/**
 * 测试固定语音播放
 */
async function testPlayFixedVoice(urgency = 'normal') {
  console.log(`📢 测试 playFixedVoice(${urgency})...`);

  try {
    // 1. 选择语音文件（复制原来的逻辑）
    let selectedFile;
    switch (urgency) {
      case 'high':
        selectedFile = 'completion/excited/great_job_01.mp3';
        break;
      case 'low':
        selectedFile = 'completion/calm/done_01.mp3';
        break;
      default:
        const normalFiles = ['completion/normal/completion_01.mp3', 'completion/normal/completion_02.mp3'];
        selectedFile = normalFiles[Math.floor(Math.random() * normalFiles.length)];
    }

    console.log(`   选择的文件: ${selectedFile}`);

    // 2. 构建路径（复制原来的逻辑）
    const isDev = process.env.NODE_ENV === 'development';
    console.log(`   process.resourcesPath: ${process.resourcesPath || 'undefined'}`);

    let voicePath;

    if (isDev || !process.resourcesPath) {
      // 开发环境或者resourcesPath不存在时
      // 如果当前目录已经是packages/electron，直接使用assets
      if (process.cwd().endsWith('packages/electron')) {
        voicePath = path.join(process.cwd(), 'assets', selectedFile);
      } else {
        voicePath = path.join(process.cwd(), 'packages', 'electron', 'assets', selectedFile);
      }
    } else {
      voicePath = path.join(process.resourcesPath, 'app', 'assets', selectedFile);
    }

    console.log(`   环境: ${isDev ? '开发环境' : '生产环境'}`);
    console.log(`   完整路径: ${voicePath}`);

    // 3. 检查文件是否存在
    const fileExists = fs.existsSync(voicePath);
    console.log(`   文件存在: ${fileExists ? '✅' : '❌'}`);

    if (!fileExists) {
      console.log(`   ❌ 文件不存在，这就是fallback到TTS的原因！`);

      // 尝试列出目录内容来调试
      const dirPath = path.dirname(voicePath);
      console.log(`   尝试列出目录内容: ${dirPath}`);
      try {
        const files = fs.readdirSync(dirPath);
        console.log(`   目录内容:`, files);
      } catch (err) {
        console.log(`   ❌ 无法读取目录: ${err.message}`);
      }

      return false;
    }

    // 4. 检查文件权限
    try {
      fs.accessSync(voicePath, fs.constants.R_OK);
      console.log(`   文件权限: ✅ 可读`);
    } catch (err) {
      console.log(`   ❌ 文件权限问题: ${err.message}`);
      return false;
    }

    // 5. 获取文件信息
    const stats = fs.statSync(voicePath);
    console.log(`   文件大小: ${stats.size} bytes`);
    console.log(`   文件修改时间: ${stats.mtime}`);

    // 6. 测试播放命令（不实际播放，只检查命令）
    console.log(`   测试播放命令...`);

    if (process.platform === 'darwin') {
      console.log(`   MacOS命令: afplay "${voicePath}"`);

      // 检查afplay是否可用
      try {
        const result = spawn('which', ['afplay'], { stdio: 'pipe' });
        result.on('close', (code) => {
          if (code === 0) {
            console.log(`   ✅ afplay 命令可用`);

            // 实际测试播放（短暂播放）
            console.log(`   🔊 尝试播放语音文件...`);
            const playProcess = spawn('afplay', [voicePath]);

            playProcess.on('error', (err) => {
              console.log(`   ❌ 播放失败: ${err.message}`);
            });

            playProcess.on('close', (code) => {
              if (code === 0) {
                console.log(`   ✅ 播放成功！`);
              } else {
                console.log(`   ❌ 播放失败，退出码: ${code}`);
              }
            });

            // 2秒后停止播放
            setTimeout(() => {
              playProcess.kill();
              console.log(`   🛑 停止播放`);
            }, 2000);

          } else {
            console.log(`   ❌ afplay 命令不可用`);
          }
        });
      } catch (err) {
        console.log(`   ❌ 检查afplay命令失败: ${err.message}`);
      }
    } else if (process.platform === 'win32') {
      console.log(`   Windows命令: powershell -c "(New-Object Media.SoundPlayer \\"${voicePath}\\").PlaySync()"`);
    } else {
      console.log(`   Linux命令: mpg123 "${voicePath}"`);
    }

    return true;
  } catch (error) {
    console.log(`   ❌ 测试失败: ${error.message}`);
    return false;
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log(`🖥️  平台: ${process.platform}`);
  console.log(`📁 工作目录: ${process.cwd()}`);
  console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'undefined'}\n`);

  // 测试不同urgency级别
  const urgencyLevels = ['normal', 'high', 'low'];

  for (const urgency of urgencyLevels) {
    console.log(`\n${'='.repeat(50)}`);
    await testPlayFixedVoice(urgency);
    console.log(`${'='.repeat(50)}\n`);
  }

  console.log('🏁 测试完成！');

  // 给播放一些时间，然后退出
  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

// 运行测试
runTests().catch(console.error);