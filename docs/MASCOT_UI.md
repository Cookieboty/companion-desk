# 看板娘窗口：气泡安全与工具栏

## 气泡只渲染纯文本

所有进入看板娘气泡的文字（AI 回复、提示语、工具结果、文件摘要、`mascot:say` 事件……）都经过
`useWaifuMessage → MascotContext → MessageBubble`，最终以 **React 文本节点**渲染，永不使用 `innerHTML`。
`packages/renderer/src/security/bubbleText.ts` 负责显示层清理：去掉控制字符、零宽 / 双向覆盖字符，
合并空白，按字符截断（默认 400）。HTML / `<script>` / `onerror` 都会按字面显示。

不需要富文本，因此没有引入 DOMPurify。若以后要支持富文本，必须用 DOMPurify（MIT）+ 严格白名单，
并在 `tests/security/bubble.test.tsx` 补用例。

## CSP

生产构建时 Vite 插件 `mascot-csp` 往看板娘窗口的 `index.html` 注入 `<meta http-equiv="Content-Security-Policy">`，
策略定义在 `packages/renderer/src/security/csp.ts`：

- `script-src 'self'`（无 `unsafe-inline` / `unsafe-eval` / 远程源）
- `object-src`、`frame-src`、`base-uri`、`form-action` 均为 `'none'`
- `connect-src` 只允许本地（`'self'`、`cdmodel:`、`blob:`、`data:`）

开发模式（Vite HMR 需要内联脚本）不注入。工具栏里会加载远程脚本的「小行星」与访问外网的「一言」已移除。

测试：`tests/security/*.test.ts(x)`（单元）、`e2e-headed/tests/E11.bubble-security-toolbar.headed.spec.ts`
（真实窗口：CSP 生效、内联脚本被拦截、`mascot:say` 与 AI 摘要中的 HTML 按文本显示）。

## 工具栏

- 磨砂玻璃 + 低饱和配色，无霓虹辉光；Lucide（ISC）图标；`@ig-live/ui` Tooltip；键盘焦点有清晰焦点环。
- 常驻按钮：AI 对话、切换角色、动作、语音、置顶；其余在「更多」菜单里。菜单里可以「收起为单个按钮」，
  以及在 静谧深色（默认）/ 浅色 / 暖色 三套配色间切换（保存在本机）。
- 布局：独立图层（z-index 高于画布与气泡），放在角色包围盒旁的槽位（`placeGutter`，见 `mascot/layoutStore.ts`），
  不压住角色；窗口贴近屏幕右缘、右侧槽位落到屏幕外时自动翻到左侧。
- 空闲时淡出；光标靠近角色或工具栏（全局光标轮询，点击穿透状态下也有效）时出现。显示时带 `data-mascot-ui`，
  点击穿透的命中测试（Win/mac `elementFromPoint`、Linux `setShape`）都会算上它。

`@ig-live/ui` 的强调色同时调柔：`--cd-color-accent` 为 `#55759f`（白字对比 4.7:1，AA），
`--cd-color-accent-2` 为 `#8db4c8`（深色背景上 8:1），去掉了霓虹蓝 / 青 / 紫辉光。对话窗口的硬编码颜色已改为引用这些 token。
