# 供应商预设核对表

预设只是「添加供应商」表单的预填模板（名称 / 官网 / 请求地址 / 协议），**不附带默认模型**：添加后须点「获取模型」再勾选并设为默认（上游不支持列表时可手填模型 ID）。保存后的供应商全部字段可改。
下表逐项对照各厂商**官方** API 文档核对，**核对日期：2026-10-11**。数据同步在
`packages/ai-runtime/src/providers/presets.ts`（`docsUrl` / `modelsEndpoint` / `verified`；`defaultModel` 一律为空）。

列说明：

- **协议**：Chat = OpenAI Chat Completions，Responses = OpenAI Responses，Messages = Anthropic Messages。
- **模型列表**：官方文档是否写明 `GET {base}/models`（Anthropic 为 `/v1/models`）。✅ 写明；— 文档未写明（「获取模型」可以试，失败时手填模型名）。
- **推荐旗舰（文档）**：核对当天官方文档标注的旗舰 / 推荐型号，仅供参考；**不会预填进表单**，须由用户获取后选择。

| 预设        | Base URL                                                                | 协议      | 模型列表 | 推荐旗舰（文档，不预填）             | 官方文档                                                                                      | 状态                                    |
| ----------- | ----------------------------------------------------------------------- | --------- | -------- | ------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| OpenAI      | `https://api.openai.com/v1`                                             | Responses | ✅       | `gpt-6-astra`                        | https://platform.openai.com/docs/models                                                       | ✅                                      |
| Anthropic   | `https://api.anthropic.com`                                             | Messages  | ✅       | `claude-opus-5-5`                    | https://docs.anthropic.com/en/docs/about-claude/models/overview （列表：/en/api/models-list） | ✅                                      |
| Gemini      | `https://generativelanguage.googleapis.com/v1beta/openai`               | Chat      | ✅       | `gemini-3.8-flash`                   | https://ai.google.dev/gemini-api/docs/openai                                                  | ✅                                      |
| DeepSeek    | `https://api.deepseek.com`                                              | Chat      | ✅       | `deepseek-v4-pro`                    | https://api-docs.deepseek.com/ （列表：/api/list-models）                                     | ✅                                      |
| Kimi        | `https://api.moonshot.cn/v1`                                            | Chat      | ✅       | `kimi-k3`                            | https://platform.moonshot.cn/docs/guide/start-using-kimi-api                                  | ✅                                      |
| 智谱 GLM    | `https://open.bigmodel.cn/api/paas/v4`                                  | Chat      | —        | `glm-5.3`                            | https://docs.bigmodel.cn/cn/guide/develop/openai/introduction                                 | ✅                                      |
| 通义千问    | `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | Chat      | —        | `qwen3.8-max`                        | https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope                | ✅ 需把 `{WorkspaceId}` 换成业务空间 ID |
| 火山方舟    | `https://ark.cn-beijing.volces.com/api/v3`                              | Chat      | —        | `doubao-seed-2-1-pro-260628`         | https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk?lang=zh                       | ✅ 部分账号需填 `ep-…` 接入点 ID        |
| MiniMax     | `https://api.minimax.cn/v1`                                             | Chat      | —        | `MiniMax-M3`                         | https://platform.minimaxi.com/docs/api-reference/text-openai-api                              | ✅                                      |
| xAI Grok    | `https://api.x.ai/v1`                                                   | Responses | —        | `grok-4.7`                           | https://docs.x.ai/docs/models                                                                 | ✅                                      |
| OpenRouter  | `https://openrouter.ai/api/v1`                                          | Chat      | ✅       | （获取模型）                         | https://openrouter.ai/docs/api/api-reference/models/get-models                                | ✅                                      |
| SiliconFlow | `https://api.siliconflow.cn/v1`                                         | Chat      | ✅       | `deepseek-ai/DeepSeek-V3.2`          | https://docs.siliconflow.cn/cn/userguide/capabilities/text-generation                         | ✅                                      |
| Amux        | `https://gateway.amux.ai/v1`                                            | Chat      | ✅       | （获取模型，ID 形如 `vendor/model`） | https://amux.ai/api-reference （列表：/api-reference/models/list-models）                     | ✅ 2026-10-12 核对；图标见下            |
| Ollama      | `http://localhost:11434/v1`                                             | Chat      | ✅       | （获取模型）                         | https://docs.ollama.com/api/openai-compatibility                                              | ✅                                      |
| LM Studio   | `http://localhost:1234/v1`                                              | Chat      | ✅       | （获取模型）                         | https://lmstudio.ai/docs/app/api/endpoints/openai                                             | ✅                                      |

所有预设的 `defaultModel` / `models` 均为空。添加或编辑保存后（有 Key + 请求地址时）会**自动获取一次**模型列表并留在编辑器里供选择默认模型；也可手动点「获取模型」。不会自动设默认。
**Amux（2026-10-12 核对）**：官方 [API 概览](https://amux.ai/api-reference) / [快速开始](https://amux.ai/docs/quickstart)
写明网关 `https://gateway.amux.ai`，OpenAI SDK `base_url` 为 `https://gateway.amux.ai/v1`，同时原生支持
OpenAI Chat Completions（`/v1/chat/completions`，`Authorization: Bearer`）、OpenAI Responses（`/v1/responses`）、
Anthropic Messages（`/v1/messages`，`x-api-key`）和 Gemini。预设选 Chat（每个模型可用协议不同，Chat 覆盖面最广）；
需要时可新建「自定义配置」用 Responses / Messages。模型列表 `GET https://gateway.amux.ai/v1/models`
（[文档](https://amux.ai/api-reference/models/list-models)，无 Key 返回全部、带 Key 返回该 Key 可调用的模型；核对时实测 200）。
旧版文档（`www.amux.ai/docs/amux-api/...`）写的是 `https://api.amux.ai/v1`，当前 API reference 已改为 gateway 域名，预设以后者为准。
官方文档未给出 API Key 控制台页面的直链，故未填 `apiKeyUrl`。

Kimi / DeepSeek / 火山方舟同时提供 Anthropic 兼容端点，需要时可新建「自定义配置」并选 Anthropic Messages 协议。

## 品牌图标

图标来自 [`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons)（MIT，v1.95.1），按需复制到
`packages/ui/src/brand/`。代码许可为 MIT；各 logo 的商标权归各自所有者，本应用仅用于标识对应服务（指示性使用），
不暗示任何合作或背书。没有对应图标的预设 / 自定义供应商使用首字母头像。

**Amux 无内置图标**：官方站点的 logo（`https://amux.ai/brand-icons.svg` 中的 `brand-amux`）未声明任何可再分发许可，
lobe-icons v1.95.1 也没有 Amux，按 `assets-licenses.json` 白名单政策不打包，UI 显示首字母头像。拿到官方授权后再补。
