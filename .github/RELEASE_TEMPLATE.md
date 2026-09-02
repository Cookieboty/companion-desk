# Release Notes · {{VERSION}}

> 首个 alpha 目标：`v0.1.0-alpha.1`
> 面向消费方的迁移背景：[docs/plans/README.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/README.md)

## 摘要

- 版本：`{{VERSION}}`（通道：alpha / beta / stable —— 三选一）
- 日期：{{DATE}}
- Git 范围：`{{PREV_TAG}}...{{VERSION}}`

## 平台产物

| 平台              | 安装包                             | 大小 | SHA256 |
| ----------------- | ---------------------------------- | ---- | ------ |
| macOS (x64/arm64) | `智能小助手-{{VERSION}}.dmg`       |      |        |
| Windows (x64)     | `智能小助手-Setup-{{VERSION}}.exe` |      |        |
| Linux (x64)       | `智能小助手-{{VERSION}}.AppImage`  |      |        |

## 变更

> 逐条从 [docs/plans/CHANGELOG.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/CHANGELOG.md) 的 `[Unreleased]` 复制，按分类：

### Added

-

### Changed

-

### Deprecated

-

### Removed

-

### Fixed

-

### Security

-

## 升级指南

- **从旧版本升级**：
  - 首次启动会自动执行 [migrate-config](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-config.ts) / [migrate-history](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-history.ts) / [migrate-user-profile](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-user-profile.ts)；
  - 原文件保留为 `<原名>.legacy.json`，回滚只需删除 `userData/keys/` 与相关 dsh session log；
- **SDK 消费方**：如引用 `@ig-live/ai-sdk` / `@ig-live/ai-runtime` / `@ig-live/ai-sdk-client`，遵循 fixed-group（同版本号）；参考 [.changeset/README.md](file:///Users/botycookie/self/ai-live2d-client/.changeset/README.md)。

## 已知问题

-

## 验收清单（发版前 checklist）

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` 全绿
- [ ] `pnpm run doctor waifu && pnpm run doctor chat-only && pnpm run doctor mcp-headless` 全绿
- [ ] `pnpm changeset status` 无未消费 changeset
- [ ] 三平台 CI matrix build 全绿（[ci.yml · build-electron](file:///Users/botycookie/self/ai-live2d-client/.github/workflows/ci.yml)）
- [ ] 手工验收 [P9-11 E5 同意路径](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-11-e2e-补齐p8-8-交接项)（危险工具确认弹窗 → 同意 → fs 写入成功）
- [ ] `docs/plans/CHANGELOG.md` 已把 `[Unreleased]` 归档到本版本号
- [ ] 内部 npm registry / GitHub Releases 上传完成
- [ ] Release notes 中的 SHA256 与产物大小已填写

## 致谢

感谢参与 alpha 招募的 XX 名内部用户。
