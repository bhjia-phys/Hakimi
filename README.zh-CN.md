# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi 终端欢迎界面，像素风猫耳探索飞船" />
</p>

<p align="center">
  <strong>面向软件开发、终端任务和实验性理论物理科研工作流的开源终端 AI agent。</strong><br />
  <span>在一个专注的工作空间中阅读代码、运行工具、延续会话，并用明确的证据和边界组织科研工作。</span>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">仓库</a> |
  <a href="docs/zh/guides/getting-started.md">使用手册</a> |
  <a href="LICENSE">许可证</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Hakimi 能做什么

Hakimi 是一个以终端为中心的 agent，适合让助手检查工作区、使用工具并跨回合保留上下文。它可以：

- 阅读和修改代码及项目文件、搜索工作区并使用 Git；
- 在配置的权限控制下运行 shell 命令、构建、测试和其他终端任务；
- 执行一次性 prompt 或交互式会话，继续上一次会话并保留本地会话数据；
- 连接已配置的模型 provider，并通过 MCP server、Skills 和子代理扩展 agent；
- 使用 agent profile、preset 和权限模式，控制工具调用及委派工作的方式。

Hakimi 首先服务于实际的软件开发和终端操作。科研功能则为实验性科学工作流增加结构，不取代专家判断或独立验证。

## 快速开始

Hakimi 当前需要从源码构建。请使用 Node.js 24.15.0 或更高版本，以及 pnpm 10.33.0：

```sh
git clone https://github.com/bhjia-phys/Hakimi.git
cd Hakimi
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm build:packages
pnpm -C apps/kimi-code build
mkdir -p .tmp/dist-pack
pnpm -C apps/kimi-code pack --pack-destination ../../.tmp/dist-pack
npm install -g "$(ls -t ./.tmp/dist-pack/*.tgz | head -n 1)"
hakimi --version
```

`pnpm pack` 会打印它实际创建的 tarball 文件名；上述命令会选择 `.tmp/dist-pack` 中最新的 tarball。更新源码安装时，拉取目标 revision 后重复构建、打包和安装步骤即可。

启动交互式终端 agent、执行单次 prompt，或继续上一次会话：

```sh
hakimi
hakimi -p "Summarize the test failures in this repository."
hakimi -c
```

进入交互式会话后，使用 `/login` 配置可用的 provider，包括 Kimi Code OAuth 或 ChatGPT / OpenAI Codex OAuth。Codex 登录会生成 `openai-codex/gpt-5.6-sol`、`openai-codex/gpt-5.6-terra` 和 `openai-codex/gpt-5.6-luna` 模型别名。登录必须显式触发，Hakimi 不会在启动时自动开始 OAuth 登录。Hakimi 默认将配置、会话、日志和缓存保存在 `~/.hakimi` 下；设置 `HAKIMI_HOME` 可改用其他数据目录。

Windows 用户首次启动前请安装 [Git for Windows](https://gitforwindows.org/)。Hakimi 使用随 Git for Windows 提供的 Git Bash shell；如果 Git Bash 安装在其他位置，请将 `KIMI_SHELL_PATH` 设置为 `bash.exe` 的绝对路径。

## 核心能力

- **终端编码：** 检查文件、查看 diff、编辑代码，并在当前项目上下文中工作。
- **搜索与执行：** 搜索项目内容，调用 shell 和文件工具，并在可见的工具活动中运行构建或测试。
- **会话：** 使用交互式对话、prompt 模式、会话继续和会话恢复。
- **Providers：** 通过 CLI 和 TUI 的 provider 设置配置并选择受支持的模型 provider。
- **扩展：** 加载 MCP server 和 Skills，并把有界任务委派给子代理。
- **控制：** 选择 manual、YOLO 或 auto 权限模式，并在已配置时使用 agent profile 或 preset。

可用命令和设置会随开发版本演进。[使用手册](docs/zh/guides/getting-started.md)与[配置指南](docs/zh/configuration/config-files.md)是权威的起点。

## 科研功能

Hakimi 的 Research Loop 围绕结构化状态、证据、falsifier 和决策组织实验性科研工作流。它可以在有界行动之间保留紧凑的科研过程轨迹，并向用户展示科研状态。它不会把 raw hidden chain-of-thought 暴露为科研记录，也不会仅凭 agent 的回答推断科学结论有效。

可选的 `theory-physics` domain pack 增加面向物理的路由、推导检查、数值/HPC 证据边界和 science-first reporting。它不增加第二套 runtime、ledger、文献库或 scheduler observer。

AITP Research Mode 默认可发现。新建 session 初始为 `inactive`，hydration 会保留已持久化的 mode。inactive hydration 以及 `GET` / SDK 快照读取不会探测 AITP 或发生 AITP I/O；持久化为 active 的 session 在 cold restore 后仍保持 active，并重新探测 adapter 执行只读维护。只有显式执行 `/research on`、调用 `EnterAITPMode` 或发送等价的 `enter_mode` 请求后，才会显示 Research Board 并开放其他 Research/AITP 工具。当前 Hakimi 兼容性状态为：**H0–H4 implemented-in-code、H5 部分集成、H6b method distillation planned/unavailable**。已在一次性 scratch store 中用 managed AITP 0.8.0 CLI 完成真实子进程 smoke test；完整的跨平台及 failure-matrix conformance 仍待完成。Hakimi 不读取或解析 `backfill-0.1` 成功 envelope。维护中的兼容性细节见 [`docs/aitp/`](docs/aitp/)。

## 当前状态与限制

- Hakimi 是可从源码构建的开发版本。
- 核心终端工作流——交互式会话、工具、provider 和项目操作——可用。
- Research Loop 和 `theory-physics` pack 仍是实验性功能，可能继续变化；AITP Research Mode 已正式开放，但其 AITP 兼容性边界详见 [`docs/aitp/`](docs/aitp/)。
- 目前没有公开 npm 包或 release installer；请使用上面的源码构建路径。
- Hakimi 不取代人工审阅、可复现实验或专家科研验证。

## 文档

- [快速开始](docs/zh/guides/getting-started.md)
- [配置](docs/zh/configuration/config-files.md)
- [Research Mode](docs/zh/guides/research-mode.md)
- [AITP 文档与兼容性记录](docs/aitp/)
- [实现说明](IMPLEMENTATION.md)

## 项目背景

Hakimi 是拥有独立 `hakimi` 命令、`~/.hakimi` 数据目录、semver 发布线和产品方向的独立仓库。它基于 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的部分工程基础，但不是追求产品 parity 的 fork，也不会自动采用上游行为。历史源代码与署名背景保存在 [`bhjia-phys/Hakimi-upstream-archive`](https://github.com/bhjia-phys/Hakimi-upstream-archive)；所需署名见 [MIT 许可证](LICENSE)。

## 开发

在仓库根目录执行：

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

CLI 位于 `apps/kimi-code`；其他 packages 提供应用所使用的 SDK、模型/provider 集成和 agent runtime。

## 许可证

MIT。详见 [LICENSE](LICENSE)。Hakimi 保留 Moonshot AI Kimi Code 工作所需的上游署名。
