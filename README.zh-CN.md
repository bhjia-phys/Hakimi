# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi 终端欢迎界面，像素风猫耳探索飞船" />
</p>

<p align="center">
  <strong>从 Kimi Code fork 演进而来的理论物理思维链科研 agent。</strong><br />
  <span>沿用上游工程基础——由 Hakimi 负责科研编排、分阶段 AITP 记忆集成和独立产品体验。</span>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">仓库</a> |
  <a href="https://moonshotai.github.io/kimi-code/zh/">上游 Kimi Code 文档</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Hakimi 是什么

Hakimi 是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 fork，紧跟上游 `main`。当前 `main` 提供产品外壳，科研层则按明确 gate 建设：Hakimi 负责研究编排、工具和交互；独立的 [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) 仍是持久研究记忆和证据的权威。

底层终端循环、工具、session、Skills、MCP、子代理、权限和 OAuth 继续来自上游 Kimi Code。历史上的深度内嵌科研原型保留在 [`aitp-research`](https://github.com/bhjia-phys/Hakimi/tree/aitp-research) 分支归档，不是当前产品线的集成路径。

## 与上游的差异

- **品牌**：`hakimi` 命令、`Hakimi` 产品名和像素风猫耳飞船欢迎图标。本包只安装 `hakimi`，不会覆盖独立安装的 `kimi` 命令。
- **独立主目录**：配置、session、日志和缓存都在 `~/.hakimi`（可用 `HAKIMI_HOME` 覆盖），与 `~/.kimi-code` 独立。
- **双向 session 共享**：`hakimi -r` 和 `/sessions` 可以恢复 Kimi Code session；新建的 Hakimi session 会镜像到 `~/.kimi-code`，供上游 CLI 恢复。共享只在默认的 `~/.hakimi` 主目录下启用。
- **独立发布通道**：更新检查和提示使用 [Hakimi releases](https://github.com/bhjia-phys/Hakimi/releases)，包括 prerelease。Hakimi 使用独立的 semver 版本线（当前 `0.21.x`），不跟随上游 tag。
- **DeepSeek provider**：提供 `provider add deepseek` 一键配置，以及无需鉴权的本地网页搜索兜底，让 `WebSearch` 在没有 Moonshot token 时仍可用。
- **实验性 ChatGPT OAuth**：可选的 device login 通过 OpenAI Codex backend 使用 ChatGPT 订阅，不依赖 API key 计费。
- **子代理 preset**：`[subagent.agents.<类型>]` 和 `[subagent.presets.<名称>]` 可以固定各类子代理的模型与思维强度，运行时用 `/preset <名称>` 切换。
- **传输身份**：provider pipeline 请求以 `kimi-code-cli/<版本> (hakimi)` 标识，Kimi for Coding OAuth 流程不受影响。

除此之外——功能、flag、配置 schema 和行为——都沿用上游 Kimi Code。完整参考见[上游文档](https://moonshotai.github.io/kimi-code/zh/)；`[subagent]` preset 字段见 `docs/zh/configuration/config-files.md`。

## Roadmap（路线图）

**定位**：Hakimi 正在被建设为面向 DeepSeek、Kimi 等 reasoning model 的理论物理科研 agent。它要开发科研软件、在研究全过程提出有用的问题、检验竞争性解释，并通过 AITP 保存有依据的结果，而不是把 transcript 或原始思维链当成研究记忆。

### 产品外壳基线

已完成：品牌与欢迎 logo、独立 `~/.hakimi` 主目录、双向 session 共享、独立发布通道、DeepSeek provider、实验性 ChatGPT/OpenAI Codex OAuth 和子代理 preset。

### 共享 gate 与执行顺序

七条轨道固定为：**A Web**、**B 手机远程**、**C AITP 集成**、**D 内置 Hakimi Research Loop**、**E UI 与设置**、**F 持续吸收 Kimi Code 上游与基础功能建设**、**G DeepSeek 专属适配与 DeepSeek Harness 吸收**。共享 contract、发布、文档、评估和教程服务于七轨，不单独成轨。

顺序是 **contract freeze → 核心正确性 → 公共边界 → Hakimi overlay → 最后评估 `GoalFeature`**。A–E 和 G 可以基于冻结 fixtures 并行开发，但跨轨集成与发布要等待 F 的 gate。默认 runtime 是 `agent-core-v2`；`packages/agent-core` 保留为 v1 legacy compatibility。

**平台决策（2026-08-14）：研究层（D/C 轨）在 Hakimi 自身实现；DeepSeek Harness 只作机制参考上游。** DSH 曾作为研究层承载方评估，本次否决——rc 级成熟度且明示 breaking changes；复审条件为 DSH 稳定 release 且 G2 跨 harness 基准给出明确优势。

### A · Web

- **所有权**：外部 code-app Web owner 拥有 source；Hakimi owner 负责接收、branding、provenance 和发布 bundle。
- **依赖**：F 的公共 contracts 以及 B–E 的公开 projection；A 不重新定义 domain ownership。
- **交付**：Web source 继续位于外部 code-app 仓库。本仓只同步已提交的 `apps/kimi-code/dist-web`，通过公开 contract 展示 session、结构化研究状态、记忆检索和研究者 checkpoint。

### B · 手机远程

- **所有权**：远程产品与部署 owner。
- **依赖**：F 的 session、permission、auth、REST/WS 和 transcript contracts，以及 A 的可部署 bundle；C 是可选项，D 不得成为前置条件。
- **交付**：首期是 responsive Web/PWA shell，不承诺原生 App。生产只使用 `kap-server` `/api/v1` REST/WS + transcript，并配合强化认证；范围包括 approval、暂停/恢复、结果查看、反馈、重连和 catch-up。不复活通用 `/api/v2` RPC、debug reflection 或 daemon。

### C · AITP 集成

- **所有权**：只负责 Hakimi 侧 AITP adapter；AITP 负责 `.aitp` schema、校验、持久化、provenance 和 ledger 语义。
- **依赖**：AITP 的 CLI + 文件，以及 F 的 adapter/contribution 边界。D 的内置 loop 不依赖 C。

最后核对的 AITP HEAD 是 `9f9e873440b8d88bfbb2963d8b5717c83b9ef4cc`（2026-08-14，逐命令重新核对 `--help`）：M0/M0.5 已完成；M0.6 以缩小声明关闭；M1a、M1b-R1、M1c 均 **done；deterministic gate passed**（107 个测试）。H0 可实施；当前安装的 Skill 可用 Python 3.11 或更高版本手动调用 CLI，会相对 plugin 自带的 `scripts/aitp.py` 运行，不要求全局 `aitp` executable。Hakimi 原生结构化 adapter 尚未实现。`record`/`note prepare|save` 仍是严格、未版本化的 version-0 response contract，未知 `status` 必须 fail closed。版本化读契约 `aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1`、`aitp/check-report-0.1` 已 shipped 且 gate 通过；M1c 作用域契约 `aitp/enter-0.3`/`aitp/list-0.2` 仅在传入单次 `--workstream <slug>` 时发出——adapter 落地后均可 feature-detect。持久化的 `aitp/lite-entry-0.1` 和 `aitp/lite-note-0.1` 标识 AITP 文件，不是 response envelope；不存在 `aitp/enter-0.1`、`aitp search`、`aitp --version`，`aitp lineage` 仍是 deferred candidate。

| Hakimi gate | AITP gate | 计划交付与当前事实 |
| --- | --- | --- |
| H0 · 当前 CLI | M0/M0.6 | 通过已安装 Skill 使用 `init`、`enter`、`inventory` 和 `record`/`note prepare|save`；绝不自动运行 `init`、`init --adopt` 或 `inventory`。 |
| H1 · 检索 | M1a（gate 已通过） | 计划 feature-detect 并消费 `enter-0.2`、`list-0.1`、`show-0.1` 及 golden fixtures；AITP 侧已 shipped 且 gate 通过，Hakimi adapter 尚未实现。 |
| H2 · 关系与诊断 | M1b-R1（gate 已通过） | 计划消费 `check-report-0.1`（exit 0/1 解析报告、exit 2 为错误包）；持久化 `based_on`/`used_by` 与 pointer bundle 不在 R1。 |
| H3 · 科研记忆 | M1c（gate 已通过）；AITP M2–M4 之后 | 计划消费 M1c 作用域契约（`enter-0.3`/`list-0.2`，仅单次 `--workstream`），之后再消费 reviewed artifacts、跨 Topic links 和 Skill-driven collaborator protocol。 |

边界始终是严格的 CLI + 文件：不复制 AITP runtime、SDK、API/MCP server、daemon、第二套 ledger，也不直接写 canonical 文件。未初始化或没有 AITP 的 workspace 要以明确 degraded status 继续运行。H1–H3 仍是 Hakimi 侧规划——它们对应的 AITP 契约已 shipped，但 Hakimi 的 adapter 支持尚未实现，不得写成 available。详细矩阵和已核验决策见 [`docs/aitp/`](docs/aitp/)；修改兼容性声明前，先重新核对 AITP `--help`、schema 和官方 fixtures。

### D · 内置 Hakimi Research Loop

D 轨是研究层的主实现轨道（2026-08-14 平台决策）。

- **所有权**：Hakimi research domain，包含 Research Frame、Research Question Board、bounded checkpoint、physics insight 和结构化 research trace。
- **依赖**：F 的 agent、subagent、tool、permission 和 transcript seams；不依赖 C，必须能在没有 AITP 时运行。
- **交付**：区分结果（`Goal`）、动作（`Todo`）和未知/挑战（Research Question）；使用 skeptical、literature、physics、numerical、code 等独立视角；执行有边界的物理检查；向用户展示 frame、问题、证据、falsifier 和决策，而不是 raw hidden chain-of-thought。维护一条持久化的**科研过程轨迹**：从 wire/transcript 事件派生的可重放科研阶段线（question → literature → hypothesis/derivation → numerics → evidence → decision），折叠成紧凑快照在 turn 边界注入上下文，让模型始终清楚"已做了什么、处于哪个阶段、下一步缺口"；AITP 启用时，轨迹节点映射到 `record`/`note prepare|save`，沉淀为有依据的 research memory 而非 transcript。

### E · UI 与设置

- **所有权**：TUI、Web、mobile 的跨表面 UX 与设置 owner；业务 domain 继续拥有业务 schema 和语义。
- **依赖**：A–D 与 F 的 typed contracts、events、config contributions 和状态 projection。
- **交付**：统一设置、provider setup、交互、加载/错误/degraded 状态、双语文案和可访问性；不复制 domain 校验、默认值、持久化或状态机。

### F · 持续吸收 Kimi Code 上游与基础功能建设

- **所有权**：platform/engine owner，负责默认 `agent-core-v2` runtime、公共 facade、release/CI 和 Hakimi overlay regression checks。
- **依赖**：upstream `main`、已分类的 migration/deletion 以及其他轨道的证据；F 分类并测试变更，不机械同步。
- **交付**：维护 v2 canonical contracts 和 adapters，通过公共边界吸收 provider、auth、tools、session、SDK、transcript、permission、performance、security 变化，运行共享 gate 并维护 release automation。只有前置 gate 全部通过后才评估 `GoalFeature`；不提前迁移或删除 Goal 能力。

### G · DeepSeek 专属适配与 DeepSeek Harness 吸收

- **所有权**：platform/engine owner；适配器落在 kosong provider 层，缓存纪律落在 v2 engine 的请求组装层。
- **依赖**：F 的 contract freeze 与公共边界；以 DeepSeek Harness `main` 为参考上游，通过受跟踪的 intake 流程（计划 `docs/dsh-intake/`）评审；E 的 provider 设置面；不得回归 GPT/Kimi 路径。
- **交付**：专用 DeepSeek 适配器——顶层 `thinking` 语义、官方 `reasoning_effort` 级别、按回合的 CoT passback 省 token、带 context window 的模型目录、DeepSeek 专属错误分类与遥测、流空闲 watchdog——全部锁在适配器层，核心保持 dialect-free；同时持续吸收 DeepSeek Harness 机制，以缓存命中为核心：epoch 请求头、session 日志派生请求、压缩后 system prompt 稳定、确定性工具排序、动态内容追加在尾部、缓存用量记账，以及断言"除首个请求外每个请求 `cacheReadTokens > 0`"的真 API 缓存 e2e。范围限定（2026-08-14）：仅机制吸收——DSH 已评估并被否决为研究层承载方，不在 DSH 上建任何研究层。

## 安装

预编译二进制和安装脚本发布在 [releases 页面](https://github.com/bhjia-phys/Hakimi/releases)：

```sh
curl -fsSL https://github.com/bhjia-phys/Hakimi/releases/latest/download/install.sh | bash
```

已有安装在终端里运行 `hakimi upgrade` 即可更新。

## 从源码构建

需要 Node.js 和 pnpm（经 corepack）：

```sh
git clone https://github.com/bhjia-phys/Hakimi.git
cd Hakimi
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code build
node apps/kimi-code/dist/main.mjs --version
```

打包可安装的 tarball：

```sh
mkdir -p dist-pack
corepack pnpm --config.engine-strict=false -C apps/kimi-code pack --pack-destination ../../dist-pack
npm install -g ./dist-pack/bhjia-phys-hakimi-0.21.0.tgz
```

> Windows 上首次启动前请安装 [Git for Windows](https://gitforwindows.org/)，Hakimi 使用自带的 Git Bash 作为 shell 环境。Git Bash 装在自定义位置时，把 `KIMI_SHELL_PATH` 设为 `bash.exe` 的绝对路径。

## 实验性 ChatGPT / OpenAI Codex 登录

启用实验并从终端开始 device-code 流程：

```sh
hakimi login --provider openai-codex --enable-experimental
```

无头终端可加 `--no-open`，手动打开输出的 URL。在 TUI 中运行 `/experiments`，启用 `openai-codex-oauth`，再运行 `/login` 并选择 `ChatGPT / OpenAI Codex (OAuth)`。凭据和生成的 provider 配置仍保存在 Hakimi 自己的主目录下。

## 开发

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

目录布局与上游一致：CLI 在 `apps/kimi-code`；当前 kap-server runtime 在 `packages/agent-core-v2`，`packages/agent-core` 保留为 legacy engine；模型 provider 在 `packages/kosong`，SDK 在 `packages/node-sdk`。

## 许可证

MIT。上游 Kimi Code © Moonshot AI，见 [LICENSE](LICENSE)。
