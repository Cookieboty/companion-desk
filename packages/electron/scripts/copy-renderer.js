const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const copydir = require('fs-extra').copy;

// 路径设置
const srcDir = path.join(__dirname, '../../renderer/dist');
const destDir = path.join(__dirname, '../dist/renderer');

// 确保目标目录存在
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

async function copyRenderer() {
  try {
    // 检查源目录是否存在
    if (!fs.existsSync(srcDir)) {
      console.error(`错误: 渲染器构建产物目录不存在 (${srcDir})`);
      console.error('请先运行 "pnpm run build" 在 renderer 包中');
      process.exit(1);
    }

    // 复制目录
    await copydir(srcDir, destDir);
    console.log(`✅ 已复制渲染器构建产物到 ${destDir}`);

    // 复制 tts-config.html 文件
    const ttsConfigSrc = path.join(__dirname, '../../renderer/tts-config.html');
    const ttsConfigDest = path.join(destDir, 'tts-config.html');

    if (fs.existsSync(ttsConfigSrc)) {
      await copydir(ttsConfigSrc, ttsConfigDest);
      console.log(`✅ 已复制 TTS 配置页面到 ${ttsConfigDest}`);
    } else {
      console.warn(`⚠️  TTS 配置页面不存在: ${ttsConfigSrc}`);
    }
  } catch (err) {
    console.error('复制渲染器构建产物时出错:', err);
    process.exit(1);
  }
}

copyRenderer(); 