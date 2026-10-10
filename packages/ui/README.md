# @ig-live/ui

Companion Desk 共享 UI：设计 token（CSS 变量）+ 轻量 React 组件。renderer（看板娘窗口）与 ai-chat（对话窗口）共用。

```ts
import '@ig-live/ui/styles.css'; // 含 tokens.css
import { Button, Modal, Select, Switch } from '@ig-live/ui';
```

- **Tokens**（`src/tokens.css`）：`--cd-color-*`、`--cd-radius-*`、`--cd-space-*`、`--cd-font-*`、`--cd-shadow-*`、`--cd-z-*`。默认暗色（深海军蓝 + 玻璃拟态 + 蓝/青强调），`[data-theme='light']` 预留浅色。
- **组件**：Button、IconButton、Input、Textarea、Select（原生 select）、Switch（role=switch）、Card/Panel、Modal/Dialog（Esc / 遮罩关闭，关闭按钮 aria-label「关闭」）、Tabs、Badge/Tag、Tooltip、Toast（ToastProvider + useToast）、EmptyState、FormField、Notice。
- 所有组件透传原生属性（`data-testid`、`aria-*` 等），类名统一 `cd-` 前缀，不使用 CSS Modules，便于跨包复用和覆盖。
