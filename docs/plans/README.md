# 实施计划总索引（Plans Index）

> 本目录把 [AI_HARNESS_DESIGN.md §14](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1669-L1883) 的路线图**按分层模型从低到高**逐个拆成独立 plan 文件。每份 plan 都是**可独立发起 / 可独立验收**的最小工作单元，包含：目标 / 准入前提 / 任务清单（含代码路径与关键 API）/ 交付物 / 退出准则 / 测试策略 / 风险。

## 分层与依赖 DAG

```
L-1  ┌────────────────────────────┐
     │  P0 · 工程底座（前置）      │
     └──────────────┬─────────────┘
L0                  ▼
     ┌────────────────────────────┐
     │  P1 · dsh 基座接入          │
     └──────────────┬─────────────┘
L0.5                ▼
     ┌────────────────────────────┐
     │  P2 · bundle-ig-base        │  ← 通用能力（LLM / 工具 / 记忆 / 偏好 / MCP / 护栏）
     └──┬──────────┬──────────┬───┘
        ▼          ▼          ▼
     ┌─────┐   ┌─────┐   ┌─────────┐
     │ P3  │   │ P4  │   │  P5     │
     │ Elec│   │ L2D │   │ ai-sdk  │
     └──┬──┘   └──┬──┘   └────┬────┘
L2         ▼                  ▼
        ┌─────────────────────────┐
        │  P6 · ai-runtime         │  依赖 P3 + P5
        └────────────┬────────────┘
L3                   ▼
        ┌─────────────────────────┐
        │  P7 · ai-sdk-client      │  依赖 P5 + P6
        └────────────┬────────────┘
L4                   ▼
        ┌─────────────────────────┐
        │  P8 · 三端消费方接入      │  依赖 P4 + P7
        └────────────┬────────────┘
L5                   ▼
        ┌─────────────────────────┐
        │  P9 · 打磨、观测、发布    │
        └─────────────────────────┘
```

**并行度**：`P0 → P1 → P2 → { P3, P4, P5 } → P6 → P7 → P8 → P9`。其中 **P3 / P4 / P5 三线可完全并行**。

## Plan 列表

| Plan | 层级 | 名称 | 文档 | 依赖 |
|---|---|---|---|---|
| P0 | L-1 | 工程底座与骨架 | [P0-workspace-foundation.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P0-workspace-foundation.md) | — |
| P1 | L0 | dsh 基座接入 | [P1-dsh-kernel-adoption.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P1-dsh-kernel-adoption.md) | P0 |
| P2 | L0.5 | Bundle 通用能力 | [P2-bundle-ig-base.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md) | P1 |
| P3 | L0.5 | Bundle Electron 能力 | [P3-bundle-ig-electron-caps.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P3-bundle-ig-electron-caps.md) | P2 |
| P4 | L0.5 | Bundle 看板娘能力 | [P4-bundle-ig-live2d.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P4-bundle-ig-live2d.md) | P2 |
| P5 | L1 | ai-sdk 业务门面 | [P5-ai-sdk-facade.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P5-ai-sdk-facade.md) | P2 |
| P6 | L2 | ai-runtime 主进程运行时 | [P6-ai-runtime.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P6-ai-runtime.md) | P3 + P5 |
| P7 | L3 | ai-sdk-client 渲染薄层 | [P7-ai-sdk-client.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P7-ai-sdk-client.md) | P5 + P6 |
| P8 | L4 | 三端消费方接入 | [P8-consumer-migration.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md) | P4 + P7 |
| P9 | L5 | 打磨、观测与发布 | [P9-polish-observability-release.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md) | P8 |

## 每份 Plan 的统一结构

```
# P{N} · {名称}
## 元数据（层级 / 依赖 / Sprint / 预估）
## 目标（一句话结果）
## 准入前提（前置 plan 的退出准则）
## 范围与非范围
## 任务清单（P{N}-i 精细拆解，含代码路径 / 关键 API / 复杂度）
## 交付物
## 退出准则（可自动化验证）
## 测试策略
## 风险与缓解
```

## 使用方式

1. 每个 Sprint 拉起对应 Plan 的所有子任务（表格里 `P{N}-i`）到 issue tracker
2. **必须按依赖顺序开工**；下层未达到退出准则前，上层不能启动
3. Plan 内部任务在同一包内的可以合并 PR，跨包必须分 PR
4. Plan 文件是设计与验收基线；若发现遗漏，直接编辑对应 plan 并在 [CHANGELOG](file:///Users/botycookie/self/ai-live2d-client/docs/plans/CHANGELOG.md) 追加一行
