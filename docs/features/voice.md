# 语音

## 语音输入

- **按住说话**：按住 🎙 按钮，或在对话窗口按住 `F2`；`Esc` 取消。
- **免按键对话**：`Ctrl/⌘+Shift+H`，或右键 Nomi 的麦克风。自动检测你什么时候开始和停止说话。
- **语音打断**：你一开口，Nomi 的语音播报就会停下。
- 听的时候 Nomi 会点头，识别时做思考状。
- **识别引擎**：默认在本机离线识别（模型按需下载，下载前显示许可并校验）；也可以使用你已配置供应商的在线识别服务（首次使用需同意，开启「仅本地」时不可用）。

## 唤醒词（默认关闭）

开启后说出唤醒词（默认「你好小桌」，可修改），Nomi 会开始听你说话；唤醒词后面紧跟的话会直接作为指令。

## 语音播报（Built with Fish Audio）

Nomi 默认走 **内置 Fish Audio** 高质量播报路径（可爱 / 卡哇伊声线预设 `nomi`），而不是系统硬朗读。

| 提供方 | 说明 |
| --- | --- |
| `fish-local`（默认） | 本机 [fish-speech](https://github.com/fishaudio/fish-speech) HTTP API，`http://127.0.0.1:8080` |
| `fish-cloud` | [Fish Audio 云](https://fish.audio) `https://api.fish.audio/v1/tts`，使用**你自己的** API Key（safeStorage 加密） |
| `legacy` | 保留：对接你自己的外部克隆 TTS（hostname/port/path/audioUrl/promptText） |
| `system` | 仅系统 Web Speech（柔和中文女声回退） |

**行为**

- 角色说话时主进程调用 Fish `/v1/tts`，渲染层播放音频并驱动口型；失败或服务未就绪时**自动回退系统语音**，无需先打开设置试听。
- Nomi 默认 `referenceId` / `voiceHint` = `nomi`（内置可爱预设）。**不提供**「上传我的音色 / 任意参考音频克隆」入口。
- 产品内角色自己说话 ≠ Hosted Service；不要把本应用做成对外自助 TTS 平台。

### 本地 fish-speech 快速开始

```bash
# 示例：Docker Compose（以官方文档为准）
docker compose --profile server up

# 健康检查
curl -s http://127.0.0.1:8080/v1/health
# → {"status":"ok"}
```

把**项目自有、可分发**的可爱普通话样例放到服务端：

```
references/nomi/sample.wav   # 约 5–15 秒清晰人声，勿用侵权角色包
references/nomi/sample.lab   # 与音频一致的转写文本
```

仓库内占位说明见 `packages/electron/assets/tts/references/nomi/`。  
**不要**把数 GB 模型权重 commit 进本仓库；权重由你本地或镜像按 fish-speech 文档下载。

也可用 uv / 官方 `tools/api_server.py` 启动本地服务（见 Fish Speech 文档）。

### Fish 云

在 TTS 配置页选择「Fish 云」，填写你自己的 Bearer Token。默认模型头可用 `s2.1-pro-free`（以官方为准）。应用不捆绑共享 Key。

### 设置页

- 「TTS 语音配置」：切换 Fish 本地/云、legacy、系统；检测 `/v1/health`；**Built with Fish Audio** 标注。
- 「语音设置」：系统回退音色、语速/音高、音量；说明内置 Fish 路径。

## 许可要点（Fish Audio Community License）

- **Built with Fish Audio**（协议要求显著标注）。
- 研究 / 非商用免费；年营收 &lt; **USD 500,000** 可在社区许可下商用（以官方 LICENSE 为准）。
- **Hosted Service**（向第三方提供自助 TTS / 克隆 API）需与 Fish Audio 另行签约。
- 不可未经同意克隆真人；不可用输出训练其他基础 TTS 模型。
- 完整摘录见仓库根目录 `NOTICE` 与 `THIRD_PARTY_NOTICES.md`。

## 技术说明

- 本地识别使用 whisper.cpp（MIT）；语音活动检测使用 Silero VAD（MIT，ONNX Runtime 运行），未下载时退回能量检测。
- 录音只在内存或临时文件中，识别后立即删除，不写日志。在线识别每次调用都记入审计日志。
- 唤醒词通过「语音分段 → 本地识别 → 模糊匹配」实现。
- Fish 客户端：`packages/electron/src/tts/fish/`；IPC `tts:speak` / `tts:health`；渲染播放 `packages/renderer/src/mascot/tts/fishSpeak.ts`。
