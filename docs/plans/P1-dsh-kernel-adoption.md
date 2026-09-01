# P1 · L0 · dsh 基座接入（Kernel Adoption）

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L0（AI 基座） |
| 依赖 Plan | [P0](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P0-workspace-foundation.md) |
| 建议 Sprint | Sprint 0 后半 |
| 预估工作量 | 2~3 人日 |
| 关联设计章节 | [§2.4](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L177-L268) / [§3.0](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L279-L298) / [§14 P1](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1709-L1722) |

## 目标

一句话：**把 `@deepseek-ai/dsh` 作为唯一 AI 内核锁进项目，`pnpm doctor waifu` 能装配出可用的空 ctx，为 P2/P3/P4 让路。**

## 准入前提

- P0 全部退出准则达成（Turbo/CI/Lint 就绪）。

## 范围

**包含**：dsh 依赖锁定、3 份 profile 骨架、doctor 诊断脚本、echo provider 冒烟、升级 SOP、CI 冒烟集成。

**不包含**：任何本项目 bundle（→ P2/P3/P4）；不 fork、不 patch dsh 源码。

## 任务清单

### P1-1 · 锁定 dsh 依赖

- 根 [package.json](file:///Users/botycookie/self/ai-live2d-client/package.json)`.dependencies` 加 `"@deepseek-ai/dsh": "^0.1.2-alpha.2"`（当前 developer preview）
- 用 `pnpm add -w @deepseek-ai/dsh@0.1.2-alpha.2 --save-exact` 固定
- `pnpm dedupe` 后提交 `pnpm-lock.yaml`
- 若 npm 上尚未发布，则改为 `"file:vendor/deepseek-harness-0.1.2.tgz"` 并把 tgz 落到 `/vendor/`
- 验收：`node -e "require.resolve('@deepseek-ai/dsh')"` 成功

### P1-2 · 三份 profile 骨架

- 新建 [profiles/waifu.yml](file:///Users/botycookie/self/ai-live2d-client/profiles/waifu.yml)：
  ```yaml
  name: waifu
  bundles: [dsh-base]      # 本项目 bundle 在 P2/P3/P4 追加
  patch:
    - id: llm.default
      config: { provider: echo, model: echo }
  ```
- 新建 [profiles/chat-only.yml](file:///Users/botycookie/self/ai-live2d-client/profiles/chat-only.yml)、[profiles/mcp-headless.yml](file:///Users/botycookie/self/ai-live2d-client/profiles/mcp-headless.yml) 同模板
- 新建 [profiles/README.md](file:///Users/botycookie/self/ai-live2d-client/profiles/README.md)：解释 profile / bundle / patch 三层结构与 override 顺序
- 验收：三份 YAML 通过 `yq` 语法校验

### P1-3 · doctor 诊断脚本

- 新建 [scripts/dsh-doctor.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/dsh-doctor.ts)：
  ```ts
  import { boot } from '@deepseek-ai/dsh';
  const profile = process.argv[2] ?? 'waifu';
  const ctx = await boot({ profile, home: `.dsh-home/${profile}` });
  console.log('services:', Object.keys(ctx.services));
  console.log('bundles:', ctx.meta.bundles);
  console.log('plugins:', ctx.meta.plugins.map(p => p.id));
  console.log('events:',  ctx.events.list());
  await ctx.dispose();
  ```
- 根 `package.json.scripts.doctor`：`"tsx scripts/dsh-doctor.ts"`
- 验收：`pnpm doctor waifu` 打印非空的 services/plugins/events 列表且退出码 0

### P1-4 · echo 冒烟测试

- 新建 [scripts/__tests__/dsh-smoke.test.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/__tests__/dsh-smoke.test.ts)：
  - 用 `boot('mcp-headless')` 装配 → `ctx.agents.create()` → 发一条 "ping" → 断言收到 echo → `dispose()`
- 集成到 CI 的 `pnpm test`
- 验收：CI 冒烟 < 3 s 通过

### P1-5 · 升级 SOP 文档

- 更新 [profiles/README.md](file:///Users/botycookie/self/ai-live2d-client/profiles/README.md) 追加"dsh 升级流程"：
  1. 在 feature 分支 `pnpm add -w @deepseek-ai/dsh@<new>`
  2. `pnpm doctor waifu` + `pnpm test` 冒烟
  3. 观察 profile YAML 是否需要迁移（对照 dsh CHANGELOG）
  4. 触发 e2e（P9 到位后）
  5. 合入 main 后打 tag `deps/dsh@<new>`
- 在根 [README.md](file:///Users/botycookie/self/ai-live2d-client/README.md) 加"dsh 版本策略"段落，声明"锁定 exact 版本 + 只跟主线 patch"

### P1-6 · CI 集成 dsh 冒烟

- 更新 [.github/workflows/ci.yml](file:///Users/botycookie/self/ai-live2d-client/.github/workflows/ci.yml)：在 `test` 之后追加 `pnpm doctor waifu` 一步
- 验收：CI 日志能看到 doctor 输出

## 交付物

- 3 份 profile YAML + 1 份 doctor 脚本 + 1 份冒烟测试 + 1 段升级 SOP + CI 冒烟接入

## 退出准则（自动化）

1. `pnpm doctor waifu` 输出 services/bundles/plugins/events 均非空
2. `pnpm test scripts/__tests__/dsh-smoke.test.ts` 通过
3. `pnpm-lock.yaml` 中 dsh 版本被锁死（exact）
4. CI 冒烟一次绿

## 测试策略

- 单元：doctor 脚本 shell 断言（`pnpm doctor waifu | grep services`）
- 集成：echo end-to-end
- 契约：确保 `ctx.services` 至少包含 `llm/tools/sessions/agents/systemPrompt`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| dsh alpha 版本破坏性升级 | exact 锁 + 升级 SOP + CI 冒烟；升级失败直接 revert |
| npm 上暂未发布 | vendor tgz 兜底；把 vendor/ 加入 git-lfs |
| Windows 上 `boot` home 路径大小写敏感 | 统一小写 + `path.resolve()` |
