# dsh Profiles

本目录承载本项目的三份 dsh profile。dsh 官方的运行时会在 `$DSH_HOME/profiles/<name>/` 下查找同名 profile，我们在项目内维护"权威副本"，并通过 [scripts/dsh-doctor.ts](../scripts/dsh-doctor.ts) 直接读取本目录，避免 CI/开发机之间因 `~/.dsh` 状态差异带来的漂移。

## 目录结构

```
profiles/
├── waifu/               # 看板娘一体化：Live2D + 语音 + AI 对话
│   ├── package.json     # dsh.profile.bundles 声明 + 依赖
│   └── cordis.patch.yml # 用户补丁层（作用在所有 bundle 补丁之后）
├── chat-only/           # 纯文字聊天：只启用 chat 通路
│   ├── package.json
│   └── cordis.patch.yml
├── mcp-headless/        # 无 UI：以 MCP 工具形式暴露 dsh 能力
│   ├── package.json
│   └── cordis.patch.yml
└── README.md
```

## 三层结构 & override 顺序

dsh 的每次启动都会按下面顺序把补丁层"依次叠加"到空的 entry list 上，后写者胜：

1. **Bundle 补丁层**：`dsh.profile.bundles` 中的每一个 npm 包，按声明顺序 `applyEntryPatches`
   - 本项目锁定的第一层是 `@deepseek-ai/dsh-base`（dsh 官方核心 bundle）
   - P2/P3/P4 之后追加 `@ig-live/bundle-ig-base`、`@ig-live/bundle-ig-electron-caps`、`@ig-live/bundle-ig-mascot`
2. **Profile 用户补丁层**：`profiles/<name>/cordis.patch.yml`，一份顶层 YAML 数组
   - id 定位 + config 覆盖 / disable / insert
   - 允许 `!!js` 表达式（例如 `!!js process.env.FOO`）
3. **Launcher 层**：`--patch <path>` 或 launcher 自动生成的 patch（当前未使用）

约束：id 冲突时最后一层胜出；不存在的 id 会被 loader 报为 skipped-patch，doctor 脚本会把这些警告打印出来。

## Profile 清单

| profile        | patchReload | bundles                 | 用途                                  |
| -------------- | ----------- | ----------------------- | ------------------------------------- |
| `waifu`        | `live`      | `@deepseek-ai/dsh-base` | Electron 主进程接入，桌宠 + AI 一体化 |
| `chat-only`    | `live`      | `@deepseek-ai/dsh-base` | ai-chat 独立窗口消费                  |
| `mcp-headless` | `startup`   | `@deepseek-ai/dsh-base` | IDE / MCP client 消费                 |

## 本地使用

- **诊断**：`pnpm run doctor waifu` / `pnpm run doctor chat-only` / `pnpm run doctor mcp-headless`
  - 打印装配后的 entry list（YAML dump）、skipped-patch 警告
  - 退出码非零表示装配失败（缺 bundle、patch 引用不存在的 id 等）
  - > 注意：不要写成 `pnpm doctor <name>`，pnpm 会把它当成 `pnpm doctor` 内置命令；必须显式 `pnpm run doctor <name>` 或直接 `npx tsx scripts/dsh-doctor.ts <name>`。
- **冒烟**：`pnpm run test:root`
  - 用三份 profile 分别走一遍 `loadProfile → composeEntries`，断言 `entries.length > 50` 且关键 id（`llm` / `session` / `agent` / `tools` / `system-prompt` / `agent-loop`）存在
  - 同时验证 `loadProfile('does-not-exist')` 会抛带 `dsh-smoke: profile ... does not exist` 前缀的错

## dsh 升级 SOP

> dsh 尚处 developer preview，本项目锁定 exact 版本 + 只跟主线 patch。

1. **拉分支**：`git switch -c chore/dsh-<new-version>`
2. **改版本**：把根 [package.json](../package.json)`.dependencies` 里所有 `@deepseek-ai/dsh*` 从旧版改到新版（**exact，不带 `^`**）
3. **同步 profile package.json**：本目录下三份 `package.json` 里的 `@deepseek-ai/dsh-base` 版本也要同步
4. **同步 bundle peer**：`packages/bundle-ig-base/package.json.peerDependencies['@deepseek-ai/dsh']` 同步
5. **重装依赖**：`pnpm install`（会重新生成 `pnpm-lock.yaml`）
6. **本地冒烟**：`pnpm run doctor waifu && pnpm run doctor chat-only && pnpm run doctor mcp-headless && pnpm typecheck && pnpm run test:root`（若三份 profile 都 `86+ entries composed, no warnings` 即通过）
7. **对照 CHANGELOG**：查看 [deepseek-harness releases](https://github.com/deepseek-ai/deepseek-harness/releases)，判断本目录三份 `cordis.patch.yml` 是否需要迁移（id/schema 是否有 break）
8. **端到端**：等 P9 到位后跑 `pnpm test:e2e`
9. **合入 main**：合入后打 tag `deps/dsh@<new-version>` 便于回退
