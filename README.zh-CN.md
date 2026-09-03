# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi 终端欢迎界面，像素风猫耳探索飞船" />
</p>

<p align="center">
  <strong>以追求真理为唯一目标的理论物理科研 Agent。</strong><br />
  <span>真理是目标，证据是边界，可复现性是检验。</span>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">仓库</a> |
  <a href="docs/zh/guides/getting-started.md">使用手册</a> |
  <a href="LICENSE">许可证</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## 为什么是 Hakimi

Hakimi 不是一次性回答机器。它以有界的工作追问一个理论物理问题：明确假设，寻找可推翻的证据，区分结果与不确定性，并选择能够判别问题的下一项检验。

终端、代码、搜索、测试和 subagent 是它的科研工具，而不是产品身份。Hakimi 不以忙碌或工程复杂度为目标；它从最简单的有用模型开始，优先选择最小、最有判别力的检验，而非更大却更含混的构造。

## 科研闭环

```text
问题
  → 有界行动
  → 证据
  → 结果与不确定性
  → 下一项判别性行动
```

只有一项行动能够改变接下来应当相信什么或做什么时，问题才构成科研。Hakimi 将这条闭环显式化：每项行动都有边界，每个结果都记录其限制，每一步都根据区分现存可能性的能力来选择。

## 目前已经具备

- **科研界面：** TUI 和 Web 提供 Research Board 与 Research Manager，用于追踪和引导进行中的工作。
- **科研结构：** Research Line、Question 和 Focus 让当前未知、假设与优先级可见。
- **有界行动：** `BeginResearchAction` 与 `ConcludeResearchAction` 以结果、限制、下一步和一次显式 durability assessment 框定科研工作。没有 durable delta 时不做账本持久化；存在 durable delta 时只生成一个 typed pending candidate，并复用现有 AITP commit barrier。
- **科学优先的进展：** 进展围绕证据与不确定性组织，而非工具活动或 transcript 数量。
- **审阅与人工控制：** human gate 与 alert 支持明确判断，类型化的子 Agent 证据审阅使委派工作可检查。
- **外部计算观察：** Hakimi 可以记录外部 HPC 工作的结构化观察，同时严格区分 scheduler 状态与科学证据。它不调度任务、不轮询至结束，也不认证成功。Goal 是跨 turn continuation 的唯一 owner。

## 理论物理研究规程

可选的 `theory-physics` domain pack 是持续理论物理研究的上层使用手册。它将请求从 Research Mode admission 路由到当前 Line / Question / Focus 与阶段 Goal，再进入一个有界 Research Action；只有 durable scientific delta 或可复用方法候选，才会按需转交外部的 `using-aitp` 或 `distilling-methods` skill。

普通的一次性物理问答不需要 Research Mode。这个 pack 提供的是规程而不是物理预言机：它不是文献库、物理正确性服务、调度器、第二套 runtime、账本或后台自主 loop。研究者仍然负责物理约定、重要性判断和最终的科学结论；AITP 仍是协议 authority。

## 先有证据，再谈确信

Hakimi 可以帮助构建论证、计算、代码、检索和测试，但这些都不能单独认证一个物理主张。Hakimi 不认证物理正确性、数值收敛性或正在运行的外部任务是否成功。

人工审阅和可复现验证是科研闭环的一部分，而不是最后装饰性的步骤。证据不足或彼此冲突时，诚实的结果应当是不确定性、被阻塞的问题，或一项更小的判别性检验。

## Research Mode 与 AITP

Research Mode 默认可发现，但每个新 session 都从 inactive 开始。对于持续工作，`theory-physics` 可以指导模型调用 `EnterAITPMode`、等待 authoritative probe status，并执行有界行动；inactive session 的 AITP I/O 为零。Research Board 和模型上下文会明确区分 Hakimi Goal、observed AITP Program（含其顶层 **Research goal**）和 Local Research Loop。Hakimi 只通过 AITP `enter` 观测该顶层目标，从不写 `TOPIC.md` 或 AITP Topic。Goal↔Program alignment 是仅在本地 checkpointed、由用户显式确认的 binding，不会根据文本相似度推断。在 active Research Mode 中，缺少 binding、binding stale 或明确 conflict 都会阻止 Goal completion 和 automatic continuation；inactive Goal 不受影响。进入 Research Mode 不会调度模型轮次，跨 turn continuation 仅由 Goal 负责，Plan 只是行动内短期 overlay；没有 Goal 时交互式 Research 仍可正常工作。TUI/Web 的紧凑 Board 统一为 Project、Current cycle、Attention、Next 四个位置，并把旧 period counter 准确标为 Research turn 数；健康 AITP 与 provenance 折叠到展开详情。存在 live Action/Run、checkpoint、human gate 或非 idle cycle 时会拒绝切换 Line，其他 Line 的 alert 也不会冒充当前 attention。默认 Goal engine 还会公开派生的 `idle`/`deciding`/`enqueued`/`running`/`held`/`waiting` continuation 状态，因此被 Research policy hold 的 active Goal 会显示为 `active · continuation held` 及其 owner/reason，而不会与 paused Goal 混淆。缺少该可选字段的旧 snapshot 会标为 unavailable，多 Line Board 状态则始终按当前选中 Line 隔离。replay 只修复可确定的 Action/phase 结构：同一个 Action 保持 live、阻止 Goal completion，并在下一次 interactive Research turn 中根据证据解决，不会被自动完成或自动放弃。在 `auto` 权限模式下，常规且任务范围内的 Research Action 使用统一的工具权限策略，不会再创建第二层 durable approval gate；旧 session 留下的 matching action approval 会以可审计的 standing auto authorization 继续执行。

Research Line 与 AITP workstream 也是两个不同的 identity。Hakimi 观测到当前 Topic 后，必须由用户或 main agent 显式确认一条带 revision 的本地 Line→workstream binding；slug、文本、路径或 ID 相同都不表示 membership。每次确认都有 server-owned opaque identity，clear 必须同时比较该 identity 与不随 undo 回退的 public Research revision。`unbound`、`unavailable`、`stale` 或 `conflict` 的 Line 仍可做低风险本地探索，但 scoped maintenance 和 Hakimi checkpoint adoption 必须使用精确的 confirmed binding。Hakimi 会在 scoped maintenance 与 checkpoint write 前重新做无作用域 Topic observation，post-save commit barrier 同时校验 captured Topic 与唯一一个 captured workstream。checkpoint-bound save 要求 AITP 0.9.0 adapter-contract 0.2：Hakimi 会把 captured Topic 与 exact singleton workstream 传给 atomic `record save`，因此 mismatch 不产生 canonical Entry；post-save `show` 和 scoped `check` 继续作为 defense in depth。重新绑定前必须先显式清除；undo 或 cold restore 会重新校验已保存的 Topic 与 observed revision，不会自动修复 binding。REST、WebSocket、Node SDK、klient、TUI 和 Web 投影同一个 binding status 与 typed durable-candidate state。

[AITP](docs/aitp/) 是可选的外部持久证据账本，通过其 CLI 与文件使用；它不是 Hakimi 的第二套 runtime 或数据库。`ConcludeResearchAction` 之后，Hakimi 可以把一个 assessed durable delta 路由到现有 prepare/fill/save/show/checkpoint 路径；no-delta 结论不会安排 persistence 或 distillation，human assertion/decision 也始终与 agent/tool/source verification 分开。一个新 checkpoint 首次成功 commit 后，Hakimi 会在同一轮把且只把本次 touched Entry best-effort 交给精确的外部 `distilling-methods` Skill 做一次有界 review。重复 commit 或 Skill 不可用是非阻塞 no-op；是否满足既有 trigger 只由外部 Skill 判断。Research snapshot 只会显示最新精确 handoff 已请求或不可用，不会声称 trigger、card、trial、review 完成、批准或发布。Hakimi 不自行解析 marker、创建或 revision card、approval 或 publish，也不会自动初始化/adopt/backfill workspace，不增加 `/research goal` 或 workstream registry，并且仍没有计划中的 native H6b coordinator。Hakimi 本地的 Goal–Program 与 Line–workstream binding 绝不写入 AITP。AITP 不可用时，Research Mode 会明确显示 degraded，并阻止 durable write、checkpoint 和 active Research Goal completion。详细兼容性与运行边界见 [AITP 文档](docs/aitp/)。

## 从源码安装

Hakimi 当前从源码安装。请使用 Node.js 24.15.0 或更高版本，以及 pnpm 10.33.0：

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

`pnpm pack` 会打印实际创建的 tarball 文件名；上述命令会选择 `.tmp/dist-pack` 中最新的 tarball。更新源码安装时，拉取目标 revision 后重复构建、打包和安装步骤即可。

启动交互式会话、执行一次 prompt，或继续上一次会话：

```sh
hakimi
hakimi -p "Summarize the test failures in this repository."
hakimi -c
```

在交互式会话中，当工作需要时显式进入 Research Mode：

```text
/research on
```

使用 `/login` 配置可用的 provider。配置 DeepSeek 时运行 `hakimi provider deepseek`。登录必须显式触发，Hakimi 不会在启动时自动开始 OAuth 登录。配置、session、日志和缓存默认保存在 `~/.hakimi`；设置 `HAKIMI_HOME` 可使用其他数据目录。

Windows 用户首次启动前请安装 [Git for Windows](https://gitforwindows.org/)。Hakimi 使用其附带的 Git Bash shell；如果 Git Bash 安装在其他位置，请将 `KIMI_SHELL_PATH` 设置为 `bash.exe` 的绝对路径。

## 当前状态

- Hakimi 是可从源码构建的开发版本。
- Research Loop 和可选的 `theory-physics` pack 仍是实验性功能，可能继续变化。
- 当前没有公开 npm 包或 release installer；请使用上面的源码构建路径。
- Hakimi 不取代专家判断、人工审阅或可复现的科学验证。

## 文档

- [快速开始](docs/zh/guides/getting-started.md)
- [配置](docs/zh/configuration/config-files.md)
- [Research Mode](docs/zh/guides/research-mode.md)
- [AITP 文档与兼容性记录](docs/aitp/)
- [实现说明](IMPLEMENTATION.md)

## 项目背景

Hakimi 是拥有独立 `hakimi` 命令、`~/.hakimi` 数据目录、semver 发布线和科研方向的独立仓库。它选择性地建立在 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的工程基础之上，但不是追求产品 parity 的 fork，也不会自动采用上游行为。

历史源代码与署名背景保存在 [`bhjia-phys/Hakimi-upstream-archive`](https://github.com/bhjia-phys/Hakimi-upstream-archive)。所需署名见 [MIT 许可证](LICENSE)。

## 开发

在仓库根目录执行：

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

CLI 位于 `apps/kimi-code`；其他 package 提供应用使用的 SDK、模型/provider 集成和 agent runtime。

## 许可证

MIT。详见 [LICENSE](LICENSE)。Hakimi 保留 Moonshot AI Kimi Code 工作所需的上游署名。
