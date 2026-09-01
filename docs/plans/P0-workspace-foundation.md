# P0 · 工程底座与骨架（Workspace Foundation）

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L-1（前置） |
| 依赖 Plan | 无 |
| 建议 Sprint | Sprint 0（1 周） |
| 预估工作量 | 3~5 人日 |
| 关联设计章节 | [§14 P0](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1692-L1705) |

## 目标

一句话：**让"新建一个 workspace 包"从想法到能跑通 `build/test/lint/typecheck` 的时间 < 5 分钟**。

## 准入前提

- 无（本 plan 是第一个开工的）。

## 范围

**包含**：monorepo 骨架、共享构建/测试/lint 配置、Turborepo pipeline、Node 版本锁定、CI 流水线、Git hooks、License 与 CODEOWNERS。

**不包含**（属于其他 plan）：任何业务代码；dsh 依赖（→ P1）；单包的自定义脚本（→ 各自 plan）。

## 任务清单

### P0-1 · pnpm workspace 配置

- 文件：[pnpm-workspace.yaml](file:///Users/botycookie/self/ai-live2d-client/pnpm-workspace.yaml)
- 内容：
  ```yaml
  packages:
    - 'packages/*'
    - '!packages/**/dist'
    - '!packages/**/node_modules'
  ```
- 根 [package.json](file:///Users/botycookie/self/ai-live2d-client/package.json) 追加：
  - `"packageManager": "pnpm@9.x"`
  - `"engines": { "node": ">=20.11", "pnpm": ">=9" }`
- 新建 [.npmrc](file:///Users/botycookie/self/ai-live2d-client/.npmrc)：`auto-install-peers=true` / `strict-peer-dependencies=false` / `enable-pre-post-scripts=true`
- 验收：`pnpm i` 无 warning；`pnpm -r --filter <any> exec node -v` 返回 20+

### P0-2 · 共享 TS/构建/测试配置

- 新建 [tsconfig.base.json](file:///Users/botycookie/self/ai-live2d-client/tsconfig.base.json)：`target: ES2022 / module: ESNext / moduleResolution: Bundler / strict: true / verbatimModuleSyntax: true / isolatedModules: true`
- 新建 [tsconfig.node.json](file:///Users/botycookie/self/ai-live2d-client/tsconfig.node.json)、[tsconfig.dom.json](file:///Users/botycookie/self/ai-live2d-client/tsconfig.dom.json)（分别开 lib: node / dom），供子包 `extends`
- 新建 [tsup.base.ts](file:///Users/botycookie/self/ai-live2d-client/tsup.base.ts)：defineConfig 工厂函数，`format: ['esm','cjs']`、`dts: true`、`splitting: false`、`clean: true`、`sourcemap: true`
- 新建 [vitest.base.ts](file:///Users/botycookie/self/ai-live2d-client/vitest.base.ts)：`environment: 'node' | 'jsdom'` 可覆盖；覆盖率报告 `provider: 'v8'`、`reporter: ['text','lcov']`
- 验收：任意子包只需 3 行即可 extends

### P0-3 · Turborepo pipeline

- 新建 [turbo.json](file:///Users/botycookie/self/ai-live2d-client/turbo.json)：
  ```jsonc
  {
    "$schema": "https://turbo.build/schema.json",
    "tasks": {
      "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
      "typecheck": { "dependsOn": ["^build"], "outputs": [] },
      "lint":      { "outputs": [] },
      "test":      { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
      "test:e2e":  { "dependsOn": ["^build"], "cache": false }
    }
  }
  ```
- 根 `package.json.scripts`：`build/test/lint/typecheck` 全部指向 `turbo run *`
- 验收：`pnpm turbo run build --dry` 打印拓扑正确

### P0-4 · ESLint 9（flat config）+ Prettier

- 新建 [eslint.config.mjs](file:///Users/botycookie/self/ai-live2d-client/eslint.config.mjs)：
  - `@typescript-eslint`、`eslint-plugin-import`、`eslint-plugin-react`（仅对 renderer/ai-chat/sdk-client 生效）、`eslint-plugin-react-hooks`
  - 规则：`no-console: warn / no-restricted-imports: [electron in renderer]`
- 新建 [.prettierrc](file:///Users/botycookie/self/ai-live2d-client/.prettierrc)：`printWidth: 100 / semi: true / singleQuote: true / trailingComma: 'all'`
- 验收：`pnpm lint` / `pnpm format` 全绿

### P0-5 · Git hooks（husky + lint-staged）

- 新建 [.husky/pre-commit](file:///Users/botycookie/self/ai-live2d-client/.husky/pre-commit) → `pnpm lint-staged`
- 新建 [.husky/commit-msg](file:///Users/botycookie/self/ai-live2d-client/.husky/commit-msg) → `pnpm commitlint --edit $1`（Conventional Commits）
- 根 `package.json` 追加 `lint-staged` 段：`*.{ts,tsx}: eslint --fix / prettier -w`
- 验收：`git commit -m "wip"` 被拒（非 conventional）；`git commit -m "chore: init"` 成功

### P0-6 · CI（GitHub Actions）

- 新建 [.github/workflows/ci.yml](file:///Users/botycookie/self/ai-live2d-client/.github/workflows/ci.yml)：
  - matrix: `os: [ubuntu-latest, macos-latest, windows-latest]`
  - steps: `pnpm/action-setup` → `setup-node@v4 (cache: pnpm)` → `pnpm i --frozen-lockfile` → `pnpm turbo run typecheck lint test build`
  - artifact: 上传 `coverage/`
- 分支保护：main 必须过 CI；PR 必须 1 reviewer approve
- 验收：一次故意破坏 lint 的 PR 被 CI 拦截

### P0-7 · License / CODEOWNERS / 基础文档

- 新建 [LICENSE](file:///Users/botycookie/self/ai-live2d-client/LICENSE)（MIT）
- 新建 [.github/CODEOWNERS](file:///Users/botycookie/self/ai-live2d-client/.github/CODEOWNERS)
- 更新根 [README.md](file:///Users/botycookie/self/ai-live2d-client/README.md)：加"如何新建一个 workspace 包（复制 templates/pkg-template）"章节
- 新建 [templates/pkg-template](file:///Users/botycookie/self/ai-live2d-client/templates/pkg-template)：一个空 workspace 包模板，含 `package.json / tsconfig.json / tsup.config.ts / vitest.config.ts / src/index.ts / README.md`

## 交付物

- monorepo 骨架 6 个根文件 + 1 个模板包 + 1 条 CI 工作流

## 退出准则（自动化）

1. `pnpm i --frozen-lockfile` 三平台全绿
2. `pnpm turbo run build test lint typecheck` 一次通过 & Turbo 命中缓存 ≥ 1
3. `cp -r templates/pkg-template packages/demo && pnpm i && pnpm --filter demo build test` 全绿；然后 `rm -rf packages/demo`
4. 故意 push 一次 lint 失败 PR，CI 拦截 & 分支保护生效

## 测试策略

- 手工：完成上述 4 项退出准则
- 自动：CI 作为唯一门禁

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Windows CI 因换行/权限失败 | 统一 LF；`.editorconfig` + `.gitattributes` |
| pnpm 版本漂移导致锁文件不同 | `packageManager` 字段 + Corepack + CI 显式 `pnpm/action-setup@v4` |
| ESLint 9 生态兼容 | 优先用官方插件的 flat-config 版本，未支持的用 `FlatCompat` 兜底 |
