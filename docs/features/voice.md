# 语音

## 语音输入

- **按住说话**：按住 🎙 按钮，或在对话窗口按住 `F2`；`Esc` 取消。
- **免按键对话**：`Ctrl/⌘+Shift+H`，或右键 Nomi 的麦克风。自动检测你什么时候开始和停止说话。
- **语音打断**：你一开口，Nomi 的语音播报就会停下。
- 听的时候 Nomi 会点头，识别时做思考状。
- **识别引擎**：默认在本机离线识别（模型按需下载，下载前显示许可并校验）；也可以使用你已配置供应商的在线识别服务（首次使用需同意，开启「仅本地」时不可用）。

## 唤醒词（默认关闭）

开启后说出唤醒词（默认「你好小桌」，可修改），Nomi 会开始听你说话；唤醒词后面紧跟的话会直接作为指令。

## 语音播报

Nomi 默认使用**内置离线语音**（[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)，本机 CPU 合成，不需要联网或外部服务）。
合成发生在 Electron 主进程；渲染层只拿到一段 WAV 播放并驱动口型。

| 提供方（`provider`）         | 说明                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `sherpa-theresa`（**默认**） | 内置离线 TTS：sherpa-onnx 原生 addon + 中文 VITS 模型，`sid=0`、`speed=1.0`（不加速）                       |
| `fish-local`                 | 高级 / 可选：本机 [fish-speech](https://github.com/fishaudio/fish-speech) HTTP API，`http://127.0.0.1:8080` |
| `fish-cloud`                 | 高级 / 可选：[Fish Audio 云](https://fish.audio) `https://api.fish.audio/v1/tts`，**你自己的** API Key      |
| `legacy`                     | 保留：自行接入外部 TTS（hostname/port/path/audioUrl/promptText）                                            |
| `system`                     | 仅系统 Web Speech                                                                                           |

**行为**

- 没有保存过配置时默认就是 `sherpa-theresa`；已保存过其它提供方的用户保持原选择。
- 路由（`packages/electron/src/tts/ttsRouter.ts`）：`sherpa-theresa` → sherpa；`fish-*` → Fish；`legacy` → 遗留播放器；`system` / 关闭 → 系统语音。
- **回退**：sherpa 模型缺失 / 原生库加载失败 / 合成出错，一律**回退系统语音**（Web Speech），不会自动改走 Fish；无需先打开设置试听。
- 角色说话时主进程分句合成并拼接成一段 WAV（`audio/wav`，22.05 kHz mono），经 IPC `tts:speak` 以 base64 返回；渲染层沿用原有播放 / 口型 / 打断逻辑。
- **不提供**「上传我的音色 / 任意参考音频克隆」入口。产品内角色自己说话 ≠ Hosted Service；不要把本应用做成对外自助 TTS 平台。

### 模型分发

模型约 133 MB（解压目录），**随安装包 `extraResources` 分发**到 `resources/tts-models/<id>/`，不进 git。

1. 打包前 `pnpm --filter @nomi-ai/electron sync-tts-model`（各 `package:*` 的 `prepackage*` 会自动调用）把源目录同步到 `packages/electron/resources/tts-models/`（已 gitignore）。
2. 源目录解析顺序：`NOMI_SHERPA_TTS_MODEL_DIR` → 仓库同级 `../models/<id>` → 仓库内 `models/<id>`。文件清单与字节数钉死在 `packages/electron/src/tts/sherpa/manifest.ts`（与 sync 脚本一致）。
3. 运行时定位顺序：环境变量 → `process.resourcesPath/tts-models/<id>`（打包）→ 开发态上述目录。缺失或大小不符时回退系统语音。
4. IPC：`tts:sherpa:status`（ready / missing / error）；设置页只展示状态，无下载进度条。

### 实现与平台

- 原生 addon：`sherpa-onnx-node@1.13.8`（N-API，Electron 可直接加载，无需 electron-rebuild）。预编译包为 optionalDependencies：`darwin-arm64` / `darwin-x64` / `linux-x64` / `linux-arm64` / `win-x64` / `win-ia32`。
- `electron-builder.yml` 的 `asarUnpack` 已包含 `sherpa-onnx-*`（`.node` 与 `libonnxruntime` / `libsherpa-onnx-c-api` 动态库必须在磁盘上）。
- 懒加载 + 单例：首次合成时才 `require` addon 并加载模型（约 0.7–1.5 s）；推理用 `createAsync` / `generateAsync`，不阻塞主进程事件循环；同一时刻只跑一个合成，新请求会让旧请求在句间退出（对应打断）。
- 参考参数（同 `/workspace/tts-samples/gen.py`）：`numThreads=4`、`provider=cpu`、`maxNumSentences=1`、`ruleFsts=phone/date/number/new_heteronym`、`dictDir=dict/`。CPU 实时率约 0.15–0.2。
- 单次文本上限 1500 字符（超出回退系统语音）；引擎加载失败后 60 s 内不重试，直接回退。

### 本地验证

```bash
# 单元测试（路由 / 回退 / 模型定位 / 分句 / WAV）
pnpm --filter @nomi-ai/electron exec jest --watchman=false --coverage=false tests/unit/tts

# 用已有模型目录跑通真实合成（开发态）
NOMI_SHERPA_TTS_MODEL_DIR=/path/to/extracted-model pnpm dev
# 然后让看板娘说话；或在「TTS 语音配置」点「检测连接」（会预热引擎并报告耗时）
```

### 设置页

- 「TTS 语音配置」：默认「内置离线语音」；模型状态；高级可切换 Fish 本地 / 云、legacy、系统；检测连接；**Built with Fish Audio** 标注（仅选用 Fish 时适用，文案保留）。
- 「语音设置」：系统回退音色、语速/音高、音量；说明引擎优先级。

## 高级：Fish Audio（可选，Built with Fish Audio）

Fish 代码与合规文案保留，但**不再默认启用**。选择 `fish-local` / `fish-cloud` 后：

- 主进程调用 Fish `/v1/tts`；失败或服务未就绪时自动回退系统语音。
- Nomi 默认 `referenceId` / `voiceHint` = `nomi`（内置可爱预设）。
- 应用已内置种子 `packages/electron/assets/tts/references/nomi/{sample.wav,sample.lab}`，合成时以 `reference_audio`（base64）+ `reference_text` 发给本地 Fish，**无需**拷进 fish-speech 的 `references/`。

```bash
# 示例：Docker Compose（以官方文档为准）
docker compose --profile server up

# 健康检查
curl -s http://127.0.0.1:8080/v1/health
# → {"status":"ok"}
```

仍需在本机（或局域网）运行 fish-speech HTTP 服务；应用不捆绑数 GB 模型权重。Fish 云：在配置页填写你自己的 Bearer Token（safeStorage 加密），默认模型头可用 `s2.1-pro-free`（以官方为准）。

## 许可要点

- **sherpa-onnx**：Apache-2.0（© k2-fsa 项目贡献者），见 `NOTICE` 与 `THIRD_PARTY_NOTICES.md`。

### Fish Audio Community License（仅选用 Fish 时适用）

- **Built with Fish Audio**（协议要求显著标注）。
- 研究 / 非商用免费；年营收 &lt; **USD 500,000** 可在社区许可下商用（以官方 LICENSE 为准）。
- **Hosted Service**（向第三方提供自助 TTS / 克隆 API）需与 Fish Audio 另行签约。
- 不可未经同意克隆真人；不可用输出训练其他基础 TTS 模型。
- 完整摘录见仓库根目录 `NOTICE` 与 `THIRD_PARTY_NOTICES.md`。

## 技术说明

- 本地识别使用 whisper.cpp（MIT）；语音活动检测使用 Silero VAD（MIT，ONNX Runtime 运行），未下载时退回能量检测。
- 录音只在内存或临时文件中，识别后立即删除，不写日志。在线识别每次调用都记入审计日志。
- 唤醒词通过「语音分段 → 本地识别 → 模糊匹配」实现。
- sherpa：`packages/electron/src/tts/sherpa/`；路由 `packages/electron/src/tts/ttsRouter.ts`；IPC `tts:speak` / `tts:health` / `tts:sherpa:*`。
- Fish 客户端：`packages/electron/src/tts/fish/`；渲染播放 `packages/renderer/src/mascot/tts/fishSpeak.ts`（对所有引擎返回的音频通用）。
