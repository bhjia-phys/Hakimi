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
  <a href="docs/zh/guides/getting-started.md">Hakimi 使用手册</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Hakimi 是什么

Hakimi 是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 fork，但上游是经过选择性评审的工程来源，不是产品 parity 目标。当前产品外壳大体继承 Kimi Code 基础，Hakimi 则自主决定 v2 架构、研究编排、工具、workflow 和交互；独立的 [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) 仍是持久研究记忆和证据的权威。

底层终端循环、工具、session、Skills、MCP、子代理、权限和 OAuth 源自上游 Kimi Code，也继续作为通用改进的候选来源。Hakimi 只吸收符合自身目标和 canonical v2 contract 的变化，不默认引入上游产品特定行为。历史上的深度内嵌科研原型保留在 [`aitp-research`](https://github.com/bhjia-phys/Hakimi/tree/aitp-research) 分支归档，不是当前产品线的集成路径。

## 与上游的差异

- **品牌**：`hakimi` 命令、`Hakimi` 产品名和像素风猫耳飞船欢迎图标。本包只安装 `hakimi`，不会覆盖独立安装的 `kimi` 命令。
- **独立主目录**：配置、session、日志和缓存都在 `~/.hakimi`（可用 `HAKIMI_HOME` 覆盖），与 `~/.kimi-code` 独立。
- **双向 session 共享**：`hakimi -r` 和 `/sessions` 可以恢复 Kimi Code session；新建的 Hakimi session 会镜像到 `~/.kimi-code`，供上游 CLI 恢复。共享只在默认的 `~/.hakimi` 主目录下启用。
- **独立发布通道**：更新检查和提示使用 [Hakimi releases](https://github.com/bhjia-phys/Hakimi/releases)，包括 prerelease。Hakimi 使用独立的 semver 版本线（当前 `0.21.x`），不跟随上游 tag。
- **DeepSeek provider**：提供 `provider add deepseek` 一键配置，以及无需鉴权的本地网页搜索兜底，让 `WebSearch` 在没有 Moonshot token 时仍可用。
- **实验性 ChatGPT OAuth**：可选的 device login 通过 OpenAI Codex backend 使用 ChatGPT 订阅，不依赖 API key 计费。
- **子代理 preset**：`[subagent.agents.<类型>]` 和 `[subagent.presets.<名称>]` 可以固定各类子代理的模型与思维强度，运行时用 `/preset <名称>` 切换。
- **传输身份**：provider pipeline 请求以 `kimi-code-cli/<版本> (hakimi)` 标识，Kimi for Coding OAuth 流程不受影响。
- **选择性吸收上游**：上游变化按“通用能力直接吸收、v2 适配、仅 legacy 兼容、与 Hakimi overlay 冲突、拒绝”分类处理；不追求产品 parity。

对于 Hakimi 尚未覆盖的继承行为，[上游文档](https://moonshotai.github.io/kimi-code/zh/)仍是有用的起点；当两者不同时，以本仓代码和本地文档为准。`[subagent]` preset 字段见 `docs/zh/configuration/config-files.md`，产品规划见下方 Roadmap。

## Roadmap（路线图）

**定位**：Hakimi 正在被建设为面向 DeepSeek、Kimi 等 reasoning model 的理论物理科研 agent。它要开发科研软件、在研究全过程提出有用的问题、检验竞争性解释，并通过 AITP 保存有依据的结果，而不是把 transcript 或原始思维链当成研究记忆。

### 产品外壳基线

已完成：品牌与欢迎 logo、独立 `~/.hakimi` 主目录、双向 session 共享、独立发布通道、DeepSeek provider、实验性 ChatGPT/OpenAI Codex OAuth 和子代理 preset。

### 共享 gate 与执行顺序

七条轨道固定为：**A Web**、**B 手机远程**、**C AITP 集成**、**D 内置 Hakimi Research Loop**、**E UI 与设置**、**F 持续吸收 Kimi Code 上游与基础功能建设**、**G DeepSeek 专属适配与 DeepSeek Harness 吸收**。共享 contract、发布、文档、评估和教程服务于七轨，不单独成轨。

顺序是 **contract freeze → 核心正确性 → 公共边界 → Hakimi overlay → 可复用 Tower workflow runtime → 最后评估 `GoalFeature`**。A–E 和 G 可以基于冻结 fixtures 并行开发，但跨轨集成与发布要等待 F 的 gate。默认 runtime 是 `agent-core-v2`；`packages/agent-core` 冻结为 v1 legacy compatibility 与 rollback 参考。

**平台决策（2026-08-14）：研究层（D/C 轨）在 Hakimi 自身实现；DeepSeek Harness 只作机制参考上游。** DSH 曾作为研究层承载方评估，本次否决——rc 级成熟度且明示 breaking changes；复审条件为 DSH 稳定 release 且 G2 跨 harness 基准给出明确优势。

### 跨轨基础能力 · 可编排 Tower workflow

Tower 将从当前固定的 worker/reviewer 协议演进为可复用、可校验、可观察的多 Agent workflow runtime。这是 F/E/A 共享基础能力，不是第八条产品轨道：F 拥有 headless engine、compiler、恢复、worktree 隔离和工具强制 gate；E 拥有跨 surface workflow UX；A 在外部 code-app Web source 中承载可视化编辑器和实时监控。D 可以提供科研 workflow 模板，C 仍只是可选 AITP adapter，绝不成为 Tower 的状态存储。

设计分离三个关注点：**workflow** 定义节点、依赖、scope、产物、fan-out/fan-in、评审/合并 gate、重试和完成条件；**role/profile** 定义工具、权限、通信和 worktree 约束；canonical **preset** 把 research、architecture、implementation、testing、review 等语义 route 映射到模型和 Thinking 强度。workflow 文件不包含模型别名，切换 preset 也不得改变 workflow 图。实施计划在这三个策略关注点之外，再增加 authoritative compiler/runtime 与 typed public projection 两层基础设施。

`Agent` 保持为叶子委派原语，`AgentSwarm` 成为可复用的 fan-out/fan-in 原语，Tower 则通过唯一 control tower、互斥 mission scope、worker 分支、独立 review 和确定性 merge gate 编排它们。版本化 workflow template 与 typed runtime projection 先支持 TUI 启动/状态流程，之后再支持可视化图编辑与实时执行检查，engine 状态始终不归 UI 所有。

当前基线已经具备固定 Tower 协议以及独立的 `tower_worker` / `tower_reviewer` preset route。named workflow role、schema/compiler、可恢复 DAG 执行、公共 projection、可复用工程/科研模板和可视化编辑器仍是 roadmap 项，不是已发布能力。详细 contract、阶段、证据和停止规则见 [`IMPLEMENTATION.md`](IMPLEMENTATION.md)。

### A · Web

- **所有权**：Hakimi 拥有恢复到 `apps/kimi-web` 的 in-repo source；过渡期同时负责接收、branding、验证和发布 external production bundle。
- **依赖**：F 的公共 contracts 以及 B–E 的公开 projection；A 不重新定义 domain ownership。
- **交付**：`apps/kimi-web` 是从上游最后公开快照恢复的 source-shadow workspace。在 contract/UX parity 与 provenance cutover 通过前，发布版 CLI/native 继续使用已提交的 external `apps/kimi-code/dist-web`。

### B · 手机远程

- **所有权**：远程产品与部署 owner。
- **依赖**：F 的 session、permission、auth、REST/WS 和 transcript contracts，以及 A 的可部署 bundle；C 是可选项，D 不得成为前置条件。
- **交付**：首期是 responsive Web/PWA shell，不承诺原生 App。生产只使用 `kap-server` `/api/v1` REST/WS + transcript，并配合强化认证；范围包括 approval、暂停/恢复、结果查看、反馈、重连和 catch-up。不复活通用 `/api/v2` RPC、debug reflection 或 daemon。

### C · AITP 集成

- **所有权**：只负责 Hakimi 侧 AITP adapter；AITP 负责 `.aitp` schema、校验、持久化、provenance 和 ledger 语义。
- **依赖**：AITP 的 CLI + 文件，以及 F 的 adapter/contribution 边界。D 的内置 loop 不依赖 C。

最后核对的 AITP HEAD 是 `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`（2026-08-23，逐命令重新核对 `--help`；committed HEAD 是 0.8.0——Skill-only amendment 已 commit）：M0/M0.5 已完成；M0.6 以缩小声明关闭；M1a、M1b-R1、M1c、M1d、M1e 均 **done；deterministic gate passed**（154 个测试）。当前安装的 Skill 可用 Python 3.11 或更高版本手动调用 CLI，会相对 plugin 自带的 `scripts/aitp.py` 运行，不要求全局 `aitp` executable。Hakimi 原生 AITP Research Mode 的首个实验性（默认开启）纵切片是 **H0–H4 已实现、H5 仅部分集成**，受 flag `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`（默认开启）门控：包含严格契约发现、Python 探测、`enter`/`list`/`show`/`check` 读侧消费（H0–H4；H5 集成仍是 partial）、`record`/`note prepare|save` 写入门控持久化、scoped `--workstream` 读取/check、M1e 只投影 check finding code（opaque string）；不暴露、不调用、不解析 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:` 或 `check-policy` 语义，以及 TUI `/research` 命令与 Research Board 和管理器。**不**自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`；本轮不把 `backfill` 暴露为模型工具。Research state 模型覆盖 Question/Line/Focus、三轴（workflow/epistemic/persistence）问题模型、基于 revision 的人类 steering（乐观并发）、pending checkpoint 与 save+show+check commit barrier，以及 Goal complete 守卫（checkpoint pending 或 degraded 时阻止完成）。mode、loop、Question、Focus 和 checkpoint 转换会向 TUI 推送一个完整 Research 快照，冷启动 hydrate 不能覆盖更新的实时状态；active research step 会收到语义状态维护规则，普通工具调用和 AITP 读取不会被误报为科研进展。`/research on` 只激活 capability 和 Board，不会调度模型轮次；跨轮次 continuation 仍只由 Goal 负责。protocol（`packages/protocol`）、`node-sdk`、`kap-server` REST（`GET/POST /sessions/{id}/research`）和 `klient` 表面已接通。flag 关闭时（`=0` 或 `/experiments` 切换）所有 AITP 工具、skill 和 Research Board 隐藏，零 AITP I/O；flag 开启但未进入模式时同样零 AITP I/O。`record`/`note prepare|save` 仍是严格、未版本化的 version-0 response contract，未知 `status` 必须 fail closed。版本化读契约 `aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1`、`aitp/check-report-0.1` 已 shipped 且 gate 通过；M1c 作用域契约 `aitp/enter-0.3`/`aitp/list-0.2` 和 M1d 作用域 check 契约 `aitp/check-report-0.2` 仅在传入单次 `--workstream <slug>` 时发出；M1e 增加 `backfill` 命令（`backfill-0.1` 成功 envelope，默认 dry-run）和 `sha256-once:` 可变观测 pin，无 transport schema 变化。AITP 0.8 是 **Skill-only amendment**（已 commit）：定义 `method-observation` marker 候选、保守 card/trial review、两步 human decision（approval + publication）和 platform tool/card/Skill 三层边界——不改 CLI/schema/transport。持久化的 `aitp/lite-entry-0.1` 和 `aitp/lite-note-0.1` 标识 AITP 文件，不是 response envelope；不存在 `aitp/enter-0.1`、`aitp search`、`aitp --version`，`aitp lineage` 仍是 deferred candidate。typed AITP question/line registry、literature/compute/Portfolio 支持和 H6 native method-distillation orchestration **未实现**。

Research Mode 进入以及 active undo/cold restore 会在 ready probe 后执行只读的 current-state maintenance 周期（`aitp enter` → `aitp check`）。这不是 session-end automatic closeout。maintenance receipt 和上下文注入只暴露安全摘要——Working Note age、未解决 failure 数、next action、warning/check code 及计数；完整 Research snapshot/API 响应或展开的 Board 仍可能包含 checkpoint、revision 和 adapter health 字段。只有 warning 的 findings 保持 ready，error finding 或周期不可用时显示 degraded。该周期不会自动运行 `init`、adopt、backfill，也不会自动写入 semantic handoff、Entry 或 Note。这只是维护能力，不是 H6 native method-distillation orchestration；H6 仍是 planned 且 unavailable。

alerts 和 generic human gate 已实现，但 candidate confirmation 不是 `SetResearchFocus` 的 runtime 强制 guard，`ResolveResearchDecision` 也不会自动写入 AITP decision Entry。active Research Mode 处于 degraded 时，AITP writes 和 Goal completion 会被阻止；未解决的 human gate 也会阻止 Goal completion，但本地 Question/Line mutation 仍可能发生。当前没有 automatic session-closeout。

本地兼容性测试使用已 commit 的官方 AITP 0.8.0 golden fixtures：`enter.json`、`enter-after-save.json`、`list.json`、`show.json`、`check.json` 和 `check-workstream.json`。这些测试只运行本地 parser/contract 行为，不启动 live CLI subprocess，因此不等于 live CLI conformance 测试。

| Hakimi gate | AITP gate | 状态 |
| --- | --- | --- |
| H0 · 当前 CLI | M0/M0.6 | **已实现（实验性）。** Launcher adapter、Python ≥ 3.11 探测、严格的 version-0 prepare/save envelope 校验、与契约一致的 record/Note argv、`enter` lifecycle、prepare→fill→save 流程，以及 typed `not_initialized` 降级。绝不自动运行 `init`、`init --adopt` 或 `inventory`。 |
| H1 · 检索 | M1a（gate 已通过） | **已实现（实验性）。** 严格 feature-detect 并消费 `enter-0.2`、`list-0.1` 和 `show-0.1`（包括 malformed Entry 响应）；支持 Note-age 信号；current-state maintenance 仅在进入模式及 active undo/cold restore 时只读执行 `enter` → `check`，不是 session-end closeout。完整 canonical Entry 只通过 `show` 读取，不使用临时 Markdown 解析。 |
| H2 · 关系与诊断 | M1b-R1（gate 已通过） | **已实现（实验性）。** 严格消费 `check-report-0.1`：exit 0/1 都是带数据的成功响应，只有 warning 的 findings 不会使适配器降级，error finding 会阻止 checkpoint commit。有效的 exit-2 AITP 错误会 fail closed；参数解析错误只作为命令错误，不会使整个适配器降级。持久化 `based_on`/`used_by` 与 pointer bundle 不在 R1。 |
| H3 · 科研记忆 | M1c（gate 已通过）；AITP M2–M4 之后 | **已实现（实验性）。** 消费 M1c 作用域契约（`enter-0.3`/`list-0.2`，仅单次 `--workstream`）。typed question/line registry、reviewed artifacts、跨 Topic links 和 Skill-driven collaborator protocol 未实现。 |
| H4 · workstream 健康 | M1d（gate 已通过） | **已实现（实验性）。** 消费 scoped `check`（`check-report-0.2`，仅 `--workstream`：admitted in-scope 计数、`by_code`/`outside_scope`，四行文本仅人阅）；无 flag 时 `check-report-0.1` 字节不变。 |
| H5 · evidence lifecycle | M1e（gate 已通过） | **部分实现（实验性）。** AITP upstream 已 shipped `backfill-0.1` 及其 `sha256-once:`/policy 语义，但 Hakimi adapter 不暴露、不调用、不解析 backfill 成功 envelope；Hakimi 只把 check finding code 作为 opaque string 投影，不实现 `sha256-once:` 或 `check-policy` 语义。 |
| H6 · native distillation | planned（adapter-contract extension 未冻结） | **planned，unavailable**。native method-distillation orchestration：Session-scope coordinator、candidate/proposal lifecycle、human question + decision write、crash/resume。详见 [`docs/aitp/method-distillation-orchestration.md`](docs/aitp/method-distillation-orchestration.md)。 |

边界始终是严格的 CLI + 文件：不复制 AITP runtime、SDK、API/MCP server、daemon、第二套 ledger，也不直接写 canonical 文件。未初始化或没有 AITP 的 workspace 要以明确 degraded status 继续运行。Hakimi adapter 已 shipped 的范围是 H0–H4；H5 只有部分集成，均受 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`（默认开启）门控；AITP upstream 的 0.8.0 Skill-only amendment 是独立的 upstream-shipped 层。这个 default-on flag 是 Hakimi 的产品决策，不是 AITP 协议状态，也不是 H6 可用性信号。普通启动已开放 `/research` 和 `EnterAITPMode`，但不进入模式、不探测 AITP、不显示 Board、不开放 AITP plugin skill——inactive 状态零 AITP I/O，绝不自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`。设置 `=0` 或在 `/experiments` 中切换可隐藏整个 Research 入口。H6（native method-distillation orchestration）是 planned 且 unavailable，依赖尚未冻结的 reviewed adapter-contract extension。详细矩阵和已核验决策见 [`docs/aitp/`](docs/aitp/)；native distillation orchestration 设计见 [`docs/aitp/method-distillation-orchestration.md`](docs/aitp/method-distillation-orchestration.md)。修改兼容性声明前，先重新核对 AITP `--help`、schema 和官方 fixtures。

### D · 内置 Hakimi Research Loop

D 轨是研究层的主实现轨道（2026-08-14 平台决策）。

- **所有权**：Hakimi research domain，包含 Research Frame、Research Question Board、bounded checkpoint、physics insight 和结构化 research trace。
- **依赖**：F 的 agent、subagent、tool、permission 和 transcript seams；不依赖 C，必须能在没有 AITP 时运行。
- **交付**：区分结果（`Goal`）、动作（`Todo`）和未知/挑战（Research Question）；使用 skeptical、literature、physics、numerical、code 等独立视角；执行有边界的物理检查；向用户展示 frame、问题、证据、falsifier 和决策，而不是 raw hidden chain-of-thought。维护一条持久化的**科研过程轨迹**：从 wire/transcript 事件派生的可重放科研阶段线（question → literature → hypothesis/derivation → numerics → evidence → decision），折叠成紧凑快照在 turn 边界注入上下文，让模型始终清楚"已做了什么、处于哪个阶段、下一步缺口"；AITP 启用且用户显式开启持久化时，符合条件的轨迹节点才进入 adapter-gated `record`/`note prepare|save` 流程，并只在 write gate 成功后沉淀为有依据的 research memory。

### E · UI 与设置

- **所有权**：TUI、Web、mobile 的跨表面 UX 与设置 owner；业务 domain 继续拥有业务 schema 和语义。
- **依赖**：A–D 与 F 的 typed contracts、events、config contributions 和状态 projection。
- **交付**：统一设置、provider setup、交互、加载/错误/degraded 状态、双语文案和可访问性；不复制 domain 校验、默认值、持久化或状态机。对于 Tower workflow，E 拥有图结构/导航语义、校验结果/诊断与降级展示、preset overlay 和实时执行检查；TUI 先提供模板选择与状态入口，可视化编辑器则通过 A 的外部 Web source 交付。

### F · 持续吸收 Kimi Code 上游与基础功能建设

- **所有权**：platform/engine owner，负责默认 `agent-core-v2` runtime、公共 facade、release/CI、Hakimi overlay regression checks 和 headless Tower workflow runtime。
- **依赖**：upstream `main`、已分类的 migration/deletion 以及其他轨道的证据；F 分类并测试变更，不机械同步。
- **交付**：维护 v2 canonical contracts 和 adapters，通过公共边界吸收 provider、auth、tools、session、SDK、transcript、permission、performance、security 变化，运行共享 gate 并维护 release automation；建设版本化 Tower workflow schema/compiler、确定性恢复、role-route 解析、worktree/review/merge 强制规则，以及供 E/A/D/C 消费的 typed public projection。只有前置 gate 全部通过后才评估 `GoalFeature`；不提前迁移或删除 Goal 能力。

### G · DeepSeek 专属适配与 DeepSeek Harness 吸收

- **所有权**：platform/engine owner；适配器落在 kosong provider 层，缓存纪律落在 v2 engine 的请求组装层。
- **依赖**：F 的 contract freeze 与公共边界；以 DeepSeek Harness `main` 为参考上游，通过受跟踪的 intake 流程（计划 `docs/dsh-intake/`）评审；E 的 provider 设置面；不得回归 GPT/Kimi 路径。
- **交付**：专用 DeepSeek 适配器——顶层 `thinking` 语义、官方 `reasoning_effort` 级别、按回合的 CoT passback 省 token、带 context window 的模型目录、DeepSeek 专属错误分类与遥测、流空闲 watchdog——全部锁在适配器层，核心保持 dialect-free；同时持续吸收 DeepSeek Harness 机制，以缓存命中为核心：epoch 请求头、session 日志派生请求、压缩后 system prompt 稳定、确定性工具排序、动态内容追加在尾部、缓存用量记账，以及断言"除首个请求外每个请求 `cacheReadTokens > 0`"的真 API 缓存 e2e。范围限定（2026-08-14）：仅机制吸收——DSH 已评估并被否决为研究层承载方，不在 DSH 上建任何研究层。

## 从源码安装

Hakimi 目前尚未发布公开 npm 包或 release 安装脚本。构建当前开发版本需要 Node.js 24.15.0 或更高版本，以及 pnpm 10.33.0：

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
npm install -g ./.tmp/dist-pack/bhjia-phys-hakimi-0.21.0.tgz
hakimi --version
```

压缩包文件名包含当前包版本；如果版本已经变化，请使用 `pnpm pack` 实际打印的文件名替换示例中的 `0.21.0`。升级源码安装时，拉取目标 revision 后重复构建、打包与全局安装步骤。

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
