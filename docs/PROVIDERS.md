# 供应商预设核对表

预设只是「添加供应商」表单的预填模板（名称 / 官网 / 请求地址 / 协议 / 推荐默认模型），保存后的供应商全部字段可改。
下表逐项对照各厂商**官方** API 文档核对，**核对日期：2026-10-11**。数据同步在
`packages/ai-runtime/src/providers/presets.ts`（`docsUrl` / `modelsEndpoint` / `verified`）。

列说明：

- **协议**：Chat = OpenAI Chat Completions，Responses = OpenAI Responses，Messages = Anthropic Messages。
- **模型列表**：官方文档是否写明 `GET {base}/models`（Anthropic 为 `/v1/models`）。✅ 写明；— 文档未写明（「获取模型」可以试，失败时手填模型名）。
- **默认模型**：核对当天文档标注的旗舰 / 推荐模型；平台类（OpenRouter、本地服务）不预设，请用「获取模型」选择。

| 预设        | Base URL                                                                | 协议      | 模型列表 | 默认模型                     | 官方文档                                                                                      | 状态                                    |
| ----------- | ----------------------------------------------------------------------- | --------- | -------- | ---------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| OpenAI      | `https://api.openai.com/v1`                                             | Responses | ✅       | `gpt-6-astra`                | https://platform.openai.com/docs/models                                                       | ✅                                      |
| Anthropic   | `https://api.anthropic.com`                                             | Messages  | ✅       | `claude-opus-5-5`            | https://docs.anthropic.com/en/docs/about-claude/models/overview （列表：/en/api/models-list） | ✅                                      |
| Gemini      | `https://generativelanguage.googleapis.com/v1beta/openai`               | Chat      | ✅       | `gemini-3.8-flash`           | https://ai.google.dev/gemini-api/docs/openai                                                  | ✅                                      |
| DeepSeek    | `https://api.deepseek.com`（原 `/v1` 改为文档写法）                     | Chat      | ✅       | `deepseek-v4-pro`            | https://api-docs.deepseek.com/ （列表：/api/list-models）                                     | ✅                                      |
| Kimi        | `https://api.moonshot.cn/v1`                                            | Chat      | ✅       | `kimi-k3`                    | https://platform.moonshot.cn/docs/guide/start-using-kimi-api                                  | ✅                                      |
| 智谱 GLM    | `https://open.bigmodel.cn/api/paas/v4`                                  | Chat      | —        | `glm-5.3`                    | https://docs.bigmodel.cn/cn/guide/develop/openai/introduction                                 | ✅                                      |
| 通义千问    | `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | Chat      | —        | `qwen3.8-max`                | https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope                | ✅ 需把 `{WorkspaceId}` 换成业务空间 ID |
| 火山方舟    | `https://ark.cn-beijing.volces.com/api/v3`                              | Chat      | —        | `doubao-seed-2-1-pro-260628` | https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk?lang=zh                       | ✅ 部分账号需填 `ep-…` 接入点 ID        |
| MiniMax     | `https://api.minimax.cn/v1`（原 `api.minimaxi.com` 已更正）             | Chat      | —        | `MiniMax-M3`                 | https://platform.minimaxi.com/docs/api-reference/text-openai-api                              | ✅                                      |
| xAI Grok    | `https://api.x.ai/v1`                                                   | Responses | —        | `grok-4.7`                   | https://docs.x.ai/docs/models                                                                 | ✅                                      |
| OpenRouter  | `https://openrouter.ai/api/v1`                                          | Chat      | ✅       | （获取模型）                 | https://openrouter.ai/docs/api/api-reference/models/get-models                                | ✅                                      |
| SiliconFlow | `https://api.siliconflow.cn/v1`                                         | Chat      | ✅       | `deepseek-ai/DeepSeek-V3.2`  | https://docs.siliconflow.cn/cn/userguide/capabilities/text-generation                         | ✅                                      |
| Ollama      | `http://localhost:11434/v1`                                             | Chat      | ✅       | （获取模型）                 | https://docs.ollama.com/api/openai-compatibility                                              | ✅                                      |
| LM Studio   | `http://localhost:1234/v1`                                              | Chat      | ✅       | （获取模型）                 | https://lmstudio.ai/docs/app/api/endpoints/openai                                             | ✅                                      |

本轮变更：14 个预设全部核对通过、无删除；更正 DeepSeek base URL、MiniMax 域名、通义千问（百炼）地域端点，所有默认模型更新为当天文档中的旗舰 / 推荐型号。
Kimi / DeepSeek / 火山方舟同时提供 Anthropic 兼容端点，需要时可新建「自定义配置」并选 Anthropic Messages 协议。

## 品牌图标

图标来自 [`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons)（MIT，v1.95.1），按需复制到
`packages/ui/src/brand/`。代码许可为 MIT；各 logo 的商标权归各自所有者，本应用仅用于标识对应服务（指示性使用），
不暗示任何合作或背书。没有对应图标的预设 / 自定义供应商使用首字母头像。
