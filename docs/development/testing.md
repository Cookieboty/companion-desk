# 测试

| 层级         | 位置                                       | 运行                   | 跑什么                                                                                                          |
| ------------ | ------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| 单元测试     | `packages/*/src/**`、`packages/*/tests/**` | `pnpm test`            | 各包逻辑；`electron` 用 Jest（`packages/electron/tests/unit`），其余包用 Vitest                                 |
| 脚本测试     | `scripts/__tests__`                        | `pnpm test:root`       | changelog 与签名环境脚本                                                                                        |
| 无界面 E2E   | `e2e/tests`                                | `pnpm test:e2e`        | 不启动 Electron：真实 `AIClient` + IPC 服务端 + 事件广播，配合假的 IPC / LLM / 工具，验证跨窗口的调用与事件契约 |
| 包内 E2E     | 各包的 `test:e2e` 脚本                     | `pnpm test:e2e:pkg`    | 预留入口：目前只有 `electron` 定义了（`jest tests/e2e`），该目录暂无用例                                        |
| 真实应用 E2E | `e2e-headed/tests`                         | `pnpm test:e2e:headed` | Playwright 启动真实 Electron，操作界面                                                                          |

## 无界面 E2E（`e2e/`，Vitest，4 个文件 / 11 个用例）

- `E1.waifu-tts-lipsync`：TTS 分片与回合结束事件广播到看板娘窗口
- `E2.chat-only-send-and-tool`：对话窗口发消息、工具执行事件、工具列表
- `E4.waifu-profile-write-read`：用户档案写入后广播到多个窗口，下一次对话读到最新值
- `E5.write-file-confirm`：危险工具 `write_file` 需要确认，拒绝后不执行并返回 `E_TOOL_DENIED`

## 真实应用 E2E（`e2e-headed/`，Playwright，21 个文件 / 23 个用例）

看板娘与 3D 角色（E1、E4、E15）、对话与历史（E2、E6）、MCP（E3）、整机冒烟（E5）、供应商（E7）、模型商店（E8）、互动（E9）、桌面能力（E10）、气泡安全与工具栏（E11、E12）、笔记 / 提醒 / 剪贴板（E13）、引导与语言（E14、E16）、无障碍（A11Y）、快捷键与命令面板（KEYS）、英文界面（I18N）、界面截图（UI、ANIM）。

```bash
# 在仓库根目录运行（globalSetup 会下载并缓存测试用 VRM）
xvfb-run -a pnpm test:e2e:headed
```

`playwright.config.ts` 固定界面语言为中文（`CD_LOCALE=zh-CN`），默认关闭首次引导（`CD_ONBOARDING=off`），并把一个 CC0 测试 VRM（不入库）作为用户导入的模型。

## 为什么是两套 E2E

两套测的是不同层，没有可以删掉的重复：

- `e2e/` 用假的 LLM 与工具在进程内验证 IPC 契约（事件名、广播范围、拒绝路径的错误码），结果确定、不需要网络与 Electron。这些断言在真实应用里拿不到（没有可控的模型输出），真实应用 E2E 也没有覆盖 `write_file` 拒绝路径和 TTS 分片广播。
- `e2e-headed/` 验证用户真正看到和操作的界面，需要 Electron、显示环境和测试模型下载。
- 合并到同一个 Playwright 配置需要把 Vitest 用例改写为 Playwright 的 test/expect，并让所有 headless 运行也执行下载测试模型的 globalSetup，收益只是少一个配置文件。
- CI 里无界面 E2E 每个平台 1–2 分钟，真实应用 E2E 5–9 分钟；分成两个 job 可以并行，先给出快速信号。

## CI

`.github/workflows/ci.yml`：

- `quality`（Ubuntu / Windows / macOS）：许可、i18n、typecheck、lint、单元测试、构建
- `e2e-headless`、`e2e-headed`（Ubuntu / Windows）
- `dev-smoke`（Ubuntu）
- `changeset status`
- `build-electron`（三平台打包）
