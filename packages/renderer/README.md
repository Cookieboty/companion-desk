# @ig-live/renderer — 看板娘渲染进程

桌面看板娘窗口（React + Vite）。看板娘使用 **VRM 3D 角色**（`@pixiv/three-vrm`，MIT），
内置 5 个 pixiv VRoid 项目的 **CC0** 样例模型（见 `public/assets/models/vrm/CREDITS.md`）。

## 结构

- `src/mascot/MascotBackend.ts` — 渲染后端抽象（表情 / 口型 / 视线 / 眨眼）与 `mascotRegistry`
- `src/mascot/backends/vrm.ts` — three-vrm 实现（`aa`/`oh` 口型、情绪表情、随机眨眼、呼吸与头部微动）
- `src/mascot/catalog.ts` — 读取 `model-list.json`（每个模型必须有 `license` / `author` / `source`）
- `src/mascot/expressionDirector.ts` — 聊天 / Agent / 工具事件 → 表情（纯函数）
- `src/mascot/MascotDriver.tsx` — TTS 音量 → 口型、鼠标 → 视线
- `src/mascot/MascotAIBridge.tsx` — AI 事件 → 表情
- `src/mascot/tips.ts` — 原创提示文案（MIT）
- `src/components/Mascot/` — 宿主组件与角色选择器（工具栏「切换角色」左键下一个、右键打开列表）

## 添加模型

把 `.vrm` 放进 `public/assets/models/vrm/`，并在 `model-list.json` 中加入条目
（`name`、`displayName`、`path`、`thumbnail`、`author`、`license`、`source`）。
`pnpm check:licenses` 会拒绝没有开源许可（CC0 / CC-BY / MIT 等白名单）的资源。

> 历史：v1 曾使用 Live2D Cubism 2 运行时与第三方模型；因许可原因已整体移除。
