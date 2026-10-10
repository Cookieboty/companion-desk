# 启动与打包性能

## 怎么测

```bash
pnpm turbo run build && node packages/electron/scripts/copy-renderer.js
xvfb-run -a node scripts/measure-startup.mjs 9 --json /tmp/startup.json   # Linux 无显示器时用 xvfb
```

脚本会用全新的 `--user-data-dir` 启动未打包的生产构建（`packages/electron/dist`），设置 `IG_PERF_LOG=1`，
并读取主进程的 `[perf]` 打点（时间从启动 `electron` 进程开始算，取中位数）：

| 打点                                  | 含义                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `main-entry`                          | 主进程模块加载完毕                                                                     |
| `app-ready`                           | `app.whenReady()`                                                                      |
| `ai-runtime-ready`                    | AI runtime（AI SDK providers、MCP、IPC 通道）启动完成                                  |
| `main-did-finish-load` / `main-shown` | 主窗口加载完成 / 触发 `ready-to-show` 并显示                                           |
| `main:mascot-model-loaded`            | 渲染进程首个看板娘模型加载完成（由 renderer 的 console 转发；当时为 Live2D，现为 VRM） |

`--enable-unsafe-swiftshader` 让 xvfb 下也有软件 WebGL（否则 WebGL 看板娘永远不会加载）。

## 前后对比（2026-10-10，Linux x64，xvfb，各 9 次取中位数）

| 指标                                             | 优化前                                  | 优化后                                                                                       |
| ------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| 窗口显示（`main-shown`）                         | 426 ms                                  | 439 ms（在噪声范围内）                                                                       |
| 看板娘渲染完成（`mascot-model-loaded`）          | 593 ms                                  | 597 ms（在噪声范围内）                                                                       |
| AI runtime 就绪                                  | 317 ms                                  | 333 ms（在噪声范围内）                                                                       |
| renderer 首屏 JS                                 | 1,298.9 KB（gzip 360.4 KB），单个 chunk | 289 KB（gzip 93 KB）：index 70 KB + vendor-react 219 KB；three/VRM 966 KB 只在切到 3D 时加载 |
| ai-chat JS / CSS                                 | 292.2 KB / 33.3 KB                      | 294.5 KB / 42.0 KB（多了共享 UI 组件和 token）                                               |
| AppImage 安装包                                  | 498.2 MB                                | **290.6 MB（−42%）**                                                                         |
| `app.asar`                                       | 255 MB（7,073 个文件）                  | **14 MB（2,554 个文件）**                                                                    |
| linux-unpacked 目录                              | 764 MB                                  | 522 MB                                                                                       |
| 本地打包耗时（`package:prod:linux`）             | 177 s                                   | 160 s                                                                                        |
| `pnpm install --frozen-lockfile`（store 已缓存） | 1.8 s                                   | 1.8 s                                                                                        |
| `turbo run build --force`                        | 20.2 s                                  | 19.2 s                                                                                       |
| CI build-electron（ubuntu / macos / windows）    | 355 / 284 / 477 s                       | 见提交说明（缓存要第二次运行才会命中）                                                       |

### 改了什么

- **打包**：生产环境的 renderer / ai-chat 本来就从 `process.resourcesPath` 加载（`extraResources`），
  但 `files: dist/**/*` 又把 `copy-renderer` 生成的同一份 224 MB 副本（主要是 Live2D 模型）打进了 asar。现在把它排除了，
  同时排除 `*.map`、`*.ts`/`*.d.ts`、node_modules 里的 markdown/测试/文档/示例目录，以及没有打包的 preload 源文件。
  保留了 LICENSE 文件；**没有删掉任何对用户可见的模型**。
- **renderer**：3D 模式（three、@react-three、VRM）和自定义图片模式改用 `React.lazy` 按需加载；
  拆出 `vendor-react` / `vendor-three` 两个 chunk，保证缓存命中稳定。
- **依赖清理**：ai-chat 里没有用到的 `marked`、`highlight.js` 已删除。
- **CI**：`build-electron` 直接复用 quality 作业的 turbo 缓存（同一个 key），并缓存 electron / electron-builder 的下载内容。

### 评估过但没有改的

- **冷启动**：原本已经很快了（约 0.43 s 显示窗口，约 0.6 s 渲染出看板娘）。其中 Electron 自身启动约占 150 ms，
  AI runtime 的 `require` 约占 150 ms（AI SDK + MCP SDK）。试过把 AI runtime 改成在 `whenReady` 之前延迟 import，
  中位数没有可测量的变化（`require` 是同步的，`ready` 仍然要等它执行完），所以撤回了。要真正把这部分并行起来，
  就得先创建窗口、后注册 IPC 处理函数，这需要渲染进程能容忍 `ai:*` 处理函数还没注册好的情况，留作后续工作。
- 窗口本来就是在 `ready-to-show` 时才显示；preload 包很小（8.6 KB / 2.7 KB）；启动阶段的同步 fs 调用只有 userData 迁移检查。
- **Live2D 模型**（`packages/renderer/public/assets/models`，约 222 MB，60 个目录）是安装包里最大的部分，
  但它们都能在「切换模型」里被用户看到，所以一个都没删。如果之后要缩小体积，可以考虑按需下载模型包。
