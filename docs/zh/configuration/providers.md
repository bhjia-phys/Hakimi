# 平台与模型

Hakimi 支持同时接入多家 LLM 平台——用 Kimi Code 托管服务一键登录、用 Anthropic API key 接 Claude、用 OpenAI 兼容协议连接第三方推理服务。每个供应商对应一种 API 协议，模型在供应商之上声明自己的名称、上下文长度和能力。本页介绍如何在 `config.toml` 里配置各种供应商。

## 支持的供应商类型

`providers` 表里的 `type` 字段决定使用哪种协议实现：

| 类型 | 协议 | 典型用途 |
| --- | --- | --- |
| `kimi` | OpenAI 兼容 | Kimi Code 托管服务、Kimi Platform API 密钥 |
| `anthropic` | Anthropic Messages | Claude 系列模型 |
| `openai` | OpenAI Chat Completions | OpenAI 及通用兼容服务、Qwen 等 |
| `deepseek` | OpenAI Chat Completions | DeepSeek V4.1 Flash，支持原生思考控制和图片 |
| `openai_responses` | OpenAI Responses API | OpenAI 较新的 Responses 接口 |
| `google-genai` | Google GenAI | Gemini API |
| `vertexai` | Google GenAI on Vertex | Google Cloud Vertex AI |

所有供应商默认以流式方式与模型交互。thinking、视觉、工具调用等能力按模型名前缀自动匹配，通常不需要手动声明。

**凭证优先级**：`api_key` 直接字段 > `[providers.<name>.env]` 子表键 > 两者都缺时启动报错。CLI 不会从 shell 环境变量自动取凭证——详见[配置覆盖：供应商凭证](./overrides.md#供应商凭证)。

## `/provider` — 交互式供应商管理

不想手动编辑 TOML？在 TUI 里输入 `/provider` 打开**供应商管理器**，可以以交互方式添加或删除供应商。

管理器按来源把供应商显示为一行行条目。操作方式：

- ↑/↓ 移动光标，←/→ 翻页
- `d` 键删除当前供应商（有 `[y/N]` 确认）
- 在 `[ Add New Platform ]` 行按 Enter 添加新供应商

添加时有两条路径：

- **Known third-party provider**：从 [models.dev](https://models.dev/) 拉取模型目录，选供应商 → 输入 API 密钥 → 选默认模型。目录未声明协议类型的供应商（如 xai、openrouter 这类厂商专用 SDK）会按 OpenAI 兼容协议导入并显示 "guessed" 提示；目录没有可用端点时会先弹出 base URL 输入框；Amazon Bedrock / Cohere 等专有协议和无法识别的显式协议会被拒绝导入。已下线（deprecated）和 alpha 状态的模型不会出现在导入列表中。如果公共目录不可达，CLI 会回退到内置目录快照，离线或网络受限环境下也能完成导入
- **Custom registry (api.json)**：粘贴自定义 registry 地址和 Bearer token，CLI 自动创建 `providers` / `models` 条目。后续启动时，同一个 registry 地址下的供应商会一起刷新，因此上游新增、删除供应商以及模型元数据变化都会同步。

::: warning
通过 `/login` 登录的 Kimi Code 账号和 ChatGPT / OpenAI Codex OAuth 账号不会在 `/provider` 里显示，请用 `/login` 和 `/logout` 管理。
:::

非交互环境下也可以用 shell 命令完成同样操作：[`hakimi provider`](../reference/kimi-command.md#hakimi-provider)。

## `kimi`

用于对接 Moonshot AI 的 OpenAI 兼容接口，包括 Kimi Code 托管服务和 Kimi Platform API 密钥。

- 默认 `base_url`：`https://api.moonshot.ai/v1`
- 凭证键名：`KIMI_API_KEY`、`KIMI_BASE_URL`
- 额外能力：支持视频上传

```toml
[providers.kimi]
type = "kimi"
base_url = "https://api.moonshot.ai/v1"
api_key = "sk-xxxxx"
```

> 使用 Kimi Code 托管服务时，`/login` 登录后会自动配置 `base_url` 和凭证，无需手动填写。

## `anthropic`

用于对接 Claude API。标准 Claude 模型自动启用视觉、工具调用及 Thinking（如支持）；自定义或未覆盖的模型需在 `[models.<alias>]` 里显式声明 `capabilities`。

- 默认 `base_url`：跟随 Anthropic SDK 默认值
- 凭证键名：`ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`
- 默认 `max_tokens`：按模型自动推断。如需覆盖，在模型别名上设 `max_output_size`

```toml
[providers.anthropic]
type = "anthropic"
api_key = "sk-ant-xxxxx"

[models."claude-opus-4-7"]
provider = "anthropic"
model = "claude-opus-4-7"
max_context_size = 200000
# max_output_size = 32000  # 可选，省略时使用模型推断的默认值
```

## `openai`

用于对接 OpenAI Chat Completions 协议，也可连接任何兼容该协议的第三方服务（覆盖 `base_url` 即可）。

第三方推理模型（DeepSeek、Qwen、One API 等）开箱即用：CLI 自动处理 `reasoning_content` 字段和 `reasoning_effort` 注入。如果你的网关用非标准字段名返回推理内容，在模型别名上设 `reasoning_key` 覆盖。

- 默认 `base_url`：`https://api.openai.com/v1`
- 凭证键名：`OPENAI_API_KEY`、`OPENAI_BASE_URL`

```toml
[providers.openai]
type = "openai"
base_url = "https://api.openai.com/v1"
api_key = "YOUR_API_KEY"
```

### DeepSeek

DeepSeek V4.1 Flash 使用 `type = "deepseek"`。它仍通过 OpenAI Chat Completions 通信，并应用 DeepSeek 专用的思考控制和模型能力。官方模型 ID 为 `deepseek-flash`；兼容名称 `deepseek-v4-flash` 和 `deepseek-v4-flash-vision-exp` 也会被识别为支持图片、思考和工具调用。未知模型名不会自动视为支持图片。

```toml
[providers.deepseek]
type = "deepseek"
base_url = "https://api.deepseek.com/v1"
api_key = "YOUR_API_KEY"
source = { kind = "deepseek" }

[models."deepseek/deepseek-flash"]
provider = "deepseek"
model = "deepseek-flash"
max_context_size = 1000000
overrides = { max_output_size = 65536 }
capabilities = ["image_in", "thinking", "tool_use"]
display_name = "DeepSeek V4.1 Flash"
support_efforts = ["low", "high", "max"]
default_effort = "low"
```

`source.kind = "deepseek"` 标记保留从供应商 `/models` 端点刷新模型列表的功能。它不决定请求适配器，适配器由 `type` 字段选择。现有 `type = "openai"` 供应商保持通用行为；仅将供应商命名为 `deepseek` 不会启用专用适配器。升级 Hakimi 后，将该供应商的 `type` 改为 `deepseek` 即可启用，保留原有 API 密钥、模型别名和其他设置。如显式设置了模型 `protocol`，需使用 `openai` 才会应用此适配器。

示例通过 `overrides.max_output_size` 将输出预算固定为 65,536 token，包含思考内容。这样，模型列表刷新上游元数据时仍保留选定预算；若只在自动生成的别名上设置顶层 `max_output_size`，刷新可能覆盖它。该预算不是模型上限。

`low`、`high`、`max` 会作为 `reasoning_effort` 原样发送，同时开启思考。选择 `off` 会显式关闭思考。在 Hakimi 会话中，`on` 会解析为模型默认档位（本例为 `low`），而不是强制使用 API 默认的 `high`。若需关闭思考，模型能力应使用 `thinking`，不要使用 `always_thinking`。已有全局或会话思考设置仍优先于模型的 `default_effort`。

选择 Flash 后，Hakimi 使用 DeepSeek 的 OpenAI 兼容 `image_url` 内容块发送图片，可以粘贴图片或使用媒体工具。适配器支持 base64 和公开 URL 图片形式，基础流程不要求使用 Files API。仍需遵守 DeepSeek 的图片限制，包括 48 MiB 请求体上限，以及内联或公开 URL 图片的 32 MiB 单图上限。

DeepSeek 的推理响应使用 `reasoning_content`，带工具调用的 Assistant 历史回传时会保留该内容。如果网关改用了其他推理字段名，请在模型别名上设置 `reasoning_key`。专用适配器覆盖 Chat Completions，不会为 Responses 或 Anthropic 协议启用 DeepSeek 专用行为。

官方 DeepSeek 端点支持实验性的用量统计。在 `config.toml` 中启用后，重启 Hakimi 服务：

```toml
[experimental]
deepseek_usage = true
```

打开 Hakimi Web 的 **供应商用量**，可查看今日、本月已记录的 token 和人民币估算费用，以及 DeepSeek 返回的账户余额。自然日和自然月均按北京时间（`Asia/Shanghai`）计算。输入包含缓存命中和未命中的 token；输出已包含思考 token，不会重复计费。估算依据请求使用的模型、高峰或空闲时段，以及内置的[官方价格表](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)快照，不是实时账单数据。供应商改价后，估算可能与最终官方账单不同。

这些数据是 **本机 Hakimi 的记录，不是官方账户账单**。启用后才开始记录，覆盖通过当前 Hakimi 数据目录发出的请求，包括 subagent 和上下文压缩。关闭后停止记录 token 和费用；对于此前已跟踪的供应商，只保留按日的缺口标记，避免重启后把漏记周期误认为完整。不会回填旧会话，也不包含其他程序的 API 调用。面板显示统计起点，并标明不完整周期、未结束请求、缺失用量和无法估价的情况，不会将未知金额显示为零。记录可在正常重启后恢复，但崩溃或存储故障可能导致统计不完整。记账失败不会重试或阻止模型请求；官方余额查询失败时，本地统计仍可单独显示。

## `openai_responses`

对应 OpenAI 较新的 Responses API，始终以流式方式工作。配置方式与 `openai` 相同。

- 默认 `base_url`：`https://api.openai.com/v1`
- 凭证键名：`OPENAI_API_KEY`、`OPENAI_BASE_URL`

```toml
[providers.openai-responses]
type = "openai_responses"
base_url = "https://api.openai.com/v1"
api_key = "sk-xxxxx"
```

## `google-genai`

用于直连 Google Gemini API。thinking、视觉及多模态能力按模型名自动识别。

- 凭证键名：`GOOGLE_API_KEY`

```toml
[providers.gemini]
type = "google-genai"
api_key = "xxxxx"
```

如需经由兼容 Gemini 协议的代理/网关访问，可设置 `base_url`（或 `GOOGLE_GEMINI_BASE_URL` 环境变量）；不填时使用 SDK 默认地址 `https://generativelanguage.googleapis.com`。

> 只填**主机根地址**。Google GenAI SDK 会自行追加 API 版本与路径（如 `/v1beta/models/<model>:generateContent`），所以结尾带 `/v1beta` 会导致路径重复成 `/v1beta/v1beta/…`。

```toml
[providers.gemini]
type = "google-genai"
api_key = "xxxxx"
base_url = "https://your-gateway.example"
```

## `vertexai`

与 `google-genai` 共用实现，`type = "vertexai"` 时切换到 Vertex AI 访问路径。

认证走 Google Cloud 标准 ADC 流程（`gcloud auth application-default login` 或 `GOOGLE_APPLICATION_CREDENTIALS` 服务账号 JSON），这部分与 Hakimi 无关。**项目 ID 和区域必须写在 `[providers.vertexai.env]` 子表里**——直接在 shell 里 `export GOOGLE_CLOUD_PROJECT` 不会被 CLI 读取。

```toml
[providers.vertexai]
type = "vertexai"

[providers.vertexai.env]
GOOGLE_CLOUD_PROJECT = "my-gcp-project"
GOOGLE_CLOUD_LOCATION = "us-central1"
```

```sh
gcloud auth application-default login   # 一次性完成认证
hakimi
```

如需让 Vertex 请求走自定义（如代理）端点，可设置 `base_url`（或 `GOOGLE_VERTEX_BASE_URL` 环境变量）；不填时使用 SDK 默认的区域化 `*-aiplatform.googleapis.com` 地址。与 `google-genai` 一样，只填主机根地址——SDK 会自行追加 `/v1beta1/publishers/google/models/…`。

## OAuth 与凭证注入

Kimi Code 托管服务使用 OAuth 而非静态 API 密钥。运行 `/login` 后，内置的认证工具链会自动写入并刷新凭证，`config.toml` 里无需手动配置这部分内容。OAuth 登录只会由显式登录流程启动；启动和读取登录状态都不会自动登录。需要鉴权的 API 请求或 token 请求，可能在需要认证时刷新已有 OAuth 凭证。

Hakimi 也可以通过 OpenAI Codex OAuth 供应商使用 ChatGPT 订阅。在 TUI 中运行 `/login`，选择 **ChatGPT / OpenAI Codex (OAuth)**。如果希望在终端中一次完成登录，请运行：

```sh
hakimi login --provider openai-codex
```

该命令会打开设备授权页面，并生成 `openai-codex/gpt-5.6-sol`、`openai-codex/gpt-5.6-terra`、`openai-codex/gpt-5.6-luna` 和 `openai-codex/gpt-6-astra` 这些 Codex 模型别名。在无法启动浏览器的无头机器或 WSL 环境中，加上 `--no-open`；Hakimi 只打印验证地址和用户码，不尝试打开浏览器。

```sh
hakimi login --provider openai-codex --no-open
```

该供应商默认可发现，但登录仍需显式触发。Token 与 Hakimi 的其他 OAuth 凭证存放在同一位置；运行 `/logout` 会同时删除凭证和自动生成的 `openai-codex/*` 模型条目。已废弃的 `--enable-experimental` 选项以及旧实验 flag / 配置输入都不会改变这一行为。

## 下一步

- [配置文件](./config-files.md) — `providers` 和 `models` 表的完整字段参考
- [配置覆盖](./overrides.md) — 供应商凭证的解析优先级规则
- [环境变量](./env-vars.md) — 各供应商对应的凭证键名列表
