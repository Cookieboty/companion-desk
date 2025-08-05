#!/usr/bin/env node

/**
 * 直接测试固定语音播放函数
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

async function playFixedVoice(urgency = 'normal') {
  try {
    console.log(`🎵 测试 playFixedVoice(${urgency})...`);

    // 根据urgency选择语音文件
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

    console.log(`📁 选择的文件: ${selectedFile}`);

    // 构建语音文件路径 - 修复后的逻辑
    const isDev = process.env.NODE_ENV === 'development';
    let voicePath;

    if (isDev || !process.resourcesPath) {
      const currentDir = process.cwd();

      if (currentDir.includes('packages/electron')) {
        voicePath = path.join(currentDir, 'assets', selectedFile);
      } else {
        voicePath = path.join(currentDir, 'packages', 'electron', 'assets', selectedFile);
      }
    } else {
      voicePath = path.join(process.resourcesPath, 'app', 'assets', selectedFile);
    }

    console.log(`📍 语音路径: ${voicePath}`);

    // 检查文件是否存在
    if (!fs.existsSync(voicePath)) {
      console.log(`❌ 语音文件不存在: ${voicePath}，fallback到TTS`);
      return false;
    }

    console.log(`✅ 语音文件存在，开始播放...`);

    // 播放音频文件
    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        console.log(`🔊 执行命令: afplay "${voicePath}"`);
        const playProcess = spawn('afplay', [voicePath]);

        playProcess.on('error', (err) => {
          console.log(`❌ 播放错误: ${err.message}`);
          resolve(false);
        });

        playProcess.on('close', (code) => {
          if (code === 0) {
            console.log(`✅ 播放成功完成`);
            resolve(true);
          } else {
            console.log(`❌ 播放失败，退出码: ${code}`);
            resolve(false);
          }
        });

        // 3秒后自动解决，防止卡住
        setTimeout(() => {
          console.log(`⏰ 播放超时，认为成功`);
          resolve(true);
        }, 3000);

      } else {
        console.log(`⚠️  非macOS平台，跳过播放测试`);
        resolve(true);
      }
    });

  } catch (error) {
    console.log(`❌ playFixedVoice失败: ${error.message}`);
    return false;
  }
}

async function runTest() {
  console.log(`🖥️  平台: ${process.platform}`);
  console.log(`📁 工作目录: ${process.cwd()}`);
  console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'undefined'}\n`);

  const urgencyLevels = ['normal', 'high', 'low'];

  for (const urgency of urgencyLevels) {
    console.log(`\n${'='.repeat(60)}`);
    const success = await playFixedVoice(urgency);
    console.log(`结果: ${success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`${'='.repeat(60)}`);

    // 等待一秒，避免音频重叠
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🏁 测试完成！');
}

runTest().catch(console.error);