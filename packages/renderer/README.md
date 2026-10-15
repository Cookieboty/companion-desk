# @nomi-ai/renderer — 看板娘渲染进程 / Mascot renderer

**中文：** 桌面看板娘窗口（React + Vite）。看板娘使用 **VRM 3D 角色**（`@pixiv/three-vrm`，MIT），
应用只内置 2D 看板娘 Nomi；3D 渲染器仅用于用户导入或商店安装的 VRM（见 `public/assets/models/vrm/CREDITS.md`）。

**English:** Desktop mascot window (React + Vite). Characters use **VRM 3D** (`@pixiv/three-vrm`, MIT).
The app ships only the built-in 2D mascot **Nomi**; the 3D renderer is for user-imported or store-installed VRM models (see `public/assets/models/vrm/CREDITS.md`).

## 结构 / Structure

- `src/mascot/MascotBackend.ts` — 渲染后端抽象（表情 / 口型 / 视线 / 眨眼）与 `mascotRegistry` / backend abstraction (expression / lip / gaze / blink) + `mascotRegistry`
- `src/mascot/backends/vrm.ts` — three-vrm 实现（`aa`/`oh` 口型、情绪表情、随机眨眼、呼吸与头部微动）
- `src/mascot/catalog.ts` — 读取 `model-list.json`（每个模型必须有 `license` / `author` / `source`）
- `src/mascot/expressionDirector.ts` — 聊天 / Agent / 工具事件 → 表情（纯函数）
- `src/mascot/MascotDriver.tsx` — TTS 音量 → 口型、鼠标 → 视线
- `src/mascot/MascotAIBridge.tsx` — AI 事件 → 表情
- `src/mascot/tips.ts` — 原创提示文案（MIT）
- `src/components/Mascot/` — 宿主组件与角色选择器（工具栏「切换角色」左键下一个、右键打开列表）

## 添加模型 / Adding models

应用只内置 Nomi，不再接受内置 `.vrm`（`pnpm check:licenses` 会拒绝）。新角色请加到模型商店目录
（`NOMI_MODEL_CATALOG_URL`，见 docs/features/mascot.md），或在应用内「导入 VRM」。
`pnpm check:licenses` 会拒绝没有开源许可（CC0 / CC-BY / MIT 等白名单）的资源。

The app only ships Nomi; built-in `.vrm` files are rejected by `pnpm check:licenses`. Add new characters to the model-store catalog (`NOMI_MODEL_CATALOG_URL`, see docs/features/mascot.md), or use in-app “Import VRM”. Assets without an allowlisted open license (CC0 / CC-BY / MIT, etc.) are rejected.

> 历史 / History：v1 曾使用 Live2D Cubism 2 运行时与第三方模型；因许可原因已整体移除。 / v1 used Live2D Cubism 2 runtime and third-party models; removed for licensing reasons.
