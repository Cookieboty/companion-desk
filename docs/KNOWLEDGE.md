# 本地知识库

对话窗口 → 底栏 📚（或 `Ctrl/⌘+Shift+L`）打开管理面板；输入框左侧 📚 开关（`Ctrl/⌘+Shift+K`）切换「知识库问答」。

## 来源与权限

- **文件夹**：只能通过系统选择框加入；加入即授予桌面能力的**只读**作用域（可在「桌面能力 → 授权文件夹」撤销，撤销后下次索引会清掉该来源）。
- **笔记**：本地笔记（`desktop/notes`）。
- 桌面能力的黑名单（`.ssh`、凭据、浏览器配置、应用数据目录…）同样生效；隐藏目录、`node_modules`、`dist` 等跳过；单文件 > 30MB 跳过。
- 解析在受限 `utilityProcess` 中进行（超时 / 内存上限），与 `fs_read_text` 共用。

支持：txt / md / csv / tsv / json / 代码、pdf（逐页，引用带页码）、docx、**odt、rtf、xlsx**；开启 OCR 后还有 png / jpg / webp / bmp / tiff / gif。

## 检索

1. **BM25**（默认，完全本地）：拉丁词 + 中日韩单字/二元组分词，无需词典。
2. **向量（可选）**：任意 OpenAI 兼容 `/embeddings`（推荐本机 Ollama：`ollama pull nomic-embed-text` 或 `bge-m3`），与 BM25 用 RRF 融合。更换模型会自动重建。
3. **重排（可选）**：`POST {baseURL}/rerank`（llama.cpp server、TEI、Jina/Cohere 兼容）。

云端向量 / 重排服务：需在面板中**单独同意**「发送文件片段」；开启「仅本地模型可读文件」时一律不发送。

## 带引用的回答

检索 top-K 片段 → 编号 `[1]…[n]` 交给当前对话模型（发送前走桌面能力的云端首次确认 / 仅本地检查）→ 正文中的 `[n]` 渲染为可点击上标，底部列出出处；点击可预览片段、打开文件或在文件夹中显示（主进程会重新检查授权）。资料被标为不可信数据，防提示注入。

AI 工具循环中还有 `kb_search` 工具（只读）。

## OCR

tesseract.js（Apache-2.0）本地 WASM 识别；语言数据 `eng` / `chi_sim`（tessdata_fast，Apache-2.0）按需下载：先显示许可，带进度、可取消、SHA-256 校验。

## 数据

全部在 `userData/knowledge`（`settings.json`、`index.json`、`ocr/`）。「全部重建」重新解析；移除来源会删除其索引。

## 暂不支持

- 扫描版 PDF 的 OCR（需要把 PDF 页渲染成图片，Node 端没有无原生依赖的方案；图片文件可以 OCR）。
- 实时文件监听：启动 20s 后与每 30 分钟增量更新一次，可随时手动「更新索引」。
