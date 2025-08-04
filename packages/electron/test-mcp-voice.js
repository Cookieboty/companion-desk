#!/usr/bin/env node

/**
 * 测试MCP服务器的语音播放逻辑
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

console.log('🎵 测试MCP语音播放逻辑...\n');

async function testMCPVoiceLogic() {
  console.log(`📁 当前工作目录: ${process.cwd()}`);
  console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`📦 process.resourcesPath: ${process.resourcesPath || 'undefined'}\n`);

  // 模拟MCP服务器的路径逻辑
  const selectedFile = 'completion/normal/completion_01.mp3';
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

  console.log(`🎯 选择的文件: ${selectedFile}`);
  console.log(`📍 构建的路径: ${voicePath}`);
  console.log(`📂 文件存在: ${fs.existsSync(voicePath) ? '✅' : '❌'}`);

  if (fs.existsSync(voicePath)) {
    console.log(`✅ 路径逻辑正确！`);

    // 测试播放
    console.log(`🔊 测试播放...`);
    const playProcess = spawn('afplay', [voicePath]);

    playProcess.on('error', (err) => {
      console.log(`❌ 播放错误: ${err.message}`);
    });

    playProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ 播放成功！`);
      } else {
        console.log(`❌ 播放失败，退出码: ${code}`);
      }
    });

    // 2秒后停止
    setTimeout(() => {
      playProcess.kill();
      console.log(`🛑 停止播放`);
      process.exit(0);
    }, 2000);

  } else {
    console.log(`❌ 文件不存在！这就是fallback到TTS的原因。`);

    // 检查assets目录
    const assetsDir = path.dirname(voicePath);
    console.log(`📂 检查目录: ${assetsDir}`);

    try {
      const parentDir = path.dirname(assetsDir);
      if (fs.existsSync(parentDir)) {
        console.log(`📁 父目录存在: ${parentDir}`);
        const contents = fs.readdirSync(parentDir);
        console.log(`   内容:`, contents);
      }
    } catch (err) {
      console.log(`❌ 检查目录失败: ${err.message}`);
    }

    process.exit(1);
  }
}

testMCPVoiceLogic().catch(console.error);