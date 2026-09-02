# Changesets

> 本目录由 [@changesets/cli](https://github.com/changesets/changesets) 管理。
> 计划背景：[P9-8 · SDK 版本化与发布](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-8-sdk-版本化与发布)

## Fixed group

以下三个包**必须同版本号**（changesets 会强制一起 bump）：

- `@ig-live/ai-sdk`
- `@ig-live/ai-runtime`
- `@ig-live/ai-sdk-client`

见 [config.json](file:///Users/botycookie/self/ai-live2d-client/.changeset/config.json) 的 `fixed` 数组。

## Ignored（不参与版本化）

以下包目前**不对外发布**，因此从版本流程中 ignore：

- `@ig-live/electron`（应用主进程，走 electron-builder 发布通道）
- `@ig-live/renderer`
- `@ig-live/ai-chat`
- `@ig-live/types`
- `@ig-live/bundle-ig-base`
- `@ig-live/bundle-ig-electron-caps`
- `@ig-live/bundle-ig-live2d`

## 日常流程

1. **在 PR 中新增 changeset**：

   ```bash
   pnpm changeset
   ```

   选择本次涉及的包 + 版本类型（`patch` / `minor` / `major`）+ 摘要。命令会生成 `.changeset/xxx-yyy-zzz.md` 文件，一并提交。

2. **CI 校验**：CI 会跑 `pnpm changeset status --since=origin/main`，若涉及 fixed-group 三个包的 PR 未附 changeset，将失败。

3. **发版**：在 `main` 上执行 `pnpm changeset version` 会一次性把 fixed-group 三个包 bump 到同版本、并汇总 changelog；随后 `pnpm publish -r --filter '@ig-live/ai-*' --access=restricted --no-git-checks` 走内部 registry。首个 alpha tag 目标 `v0.1.0-alpha.1`。

## 版本策略

- AIClient 公开签名破坏 → **major**
- 新增 facade / 方法 → **minor**
- bugfix / 内部重构 → **patch**

详见 [docs/sdk-compat.md](file:///Users/botycookie/self/ai-live2d-client/docs/sdk-compat.md)（P9 后续补齐）。
