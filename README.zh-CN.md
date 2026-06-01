# AITP Agent

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Status](https://img.shields.io/badge/status-runtime--roadmap-blue)](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-roadmap.md)

[English](README.md) | [上游 Kimi Code 文档](https://moonshotai.github.io/kimi-code/zh/)

AITP Agent 是一个面向理论物理科研的 agent runtime 项目。它以 Kimi Code CLI 代码库为基线，目标是在 agent 底层运行时中原生嵌入理论物理记忆、知识编译、科研动作、验证、benchmark 证据、replay 和失败回灌。

当前仓库仍处在早期阶段，是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 fork。默认产品行为仍继承 Kimi Code；只有当 AITP 实验 flag 明确开启时，新的 runtime feature 才会生效。已完成的第一批切片见 [AITP Agent 0.0.1 Implementation Plan](docs/superpowers/plans/2026-05-30-aitp-agent-0.0.1.md) 和 [AITP Agent 0.0.2 Research Ledger And ActionAlgebra Implementation Plan](docs/superpowers/plans/2026-06-01-aitp-agent-0.0.2-research-ledger-actionalgebra.md)。跨 slice 的 runtime 路线图见 [AITP Agent Runtime Roadmap Implementation Plan](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-roadmap.md)。

## 项目目标

AITP Agent 不应该是在 coding agent 外面套一个研究记录本，也不应该依赖一段越来越大的提示词。它的目标是把理论物理科研需要的结构直接放进 agent runtime：

- 在会话中渐进式加载和当前课题相关的物理记忆；
- 把论文、笔记、推导、代码映射、benchmark 输出和失败经验编译成 typed graph objects；
- 用小而准的 context pack 给模型提供输入，而不是把整个知识库塞进 prompt；
- 不同研究方向默认隔离，只有显式 bridge 才允许跨域上下文进入；
- 提供细粒度科研动作，例如约定检查、量纲检查、公式到代码映射、smoke benchmark、失败分析；
- 记录 action trace，让 harness 和科研工作流可以从失败中自我改进。

## 架构方向

AITP Agent 规划为五个运行时层。

### Skills

Skills 是程序性记忆，回答“agent 应该怎么工作”。例如公式到代码 debug、先推导再检查量纲、从失败构造 benchmark、LibRPA 运行准备等。

### Physics Memory Capsules

Physics memory capsules 是语义记忆，回答“知道什么、在哪些假设和范围内成立、证据是什么、依赖什么”。Capsule 比知识图谱原子更粗，是可以直接暴露给模型或科研动作的编译单元，并且应该能进一步展开到图谱内部的定义、公式、推导步、代码映射、benchmark 和失败模式。

### Research Ledger

Research ledger 是 source-backed 的科研事件层，记录会话中真实发生过什么，但这些内容还没有被信任为可复用 physics memory。它应该保存论文、网页摘录、推导草稿、公式候选、代码观察、git diff、benchmark 观察、失败、tool run 和用户决策，并采用确定性的可编译目录结构。

### Compiler

Compiler 不是摘要器，而是知识编译器。它把 raw sources、topic notes、derivations、code traces、benchmark outputs 和 failures 编译成 typed graph objects、capsule proposals 和 context packs，同时保留依赖、scope、矛盾标记、验证状态和失败条件。

### Research Actions

Research actions 是作用在物理图谱、research ledger 和本地工具环境上的细粒度科研动作。它们比“调用某个 MCP”更底层、更可审计；又比原始 shell 命令更接近科研语义。例如：

- `graph.expand_capsule`
- `graph.trace_dependency_closure`
- `derive.check_dimension_consistency`
- `derive.check_convention_consistency`
- `physics.check_flux_quantization_convention`
- `code.map_formula_to_code_region`
- `code.compare_git_diff_to_mapping`
- `benchmark.run_smoke_case`
- `memory.propose_failure_mode`
- `harness.build_eval_from_failure`

这层 action 必须覆盖知识图谱查询、推导检查、代码映射、数值验证、失败回灌和 harness 进化。

### WorkFrames、Obligations 和 Harness

`WorkFrame` 是当前科研问题的运行时状态：domain、topic、goal、active objects、assumptions、conventions、context pack 和 trust state。Research actions 会产生 obligations，例如 source support、量纲一致性、约定一致性、已知极限检查、公式到代码映射和 benchmark 验证。Blocking obligations 应该阻止内容被提升为 validated memory；失败或 inconclusive 的 action trace 可以变成 harness candidate。

## 与其他 agent runtime 的关系

### Kimi Code

Kimi Code 是主基座。它已经有 TypeScript monorepo、终端 agent runtime、model/tool loop、skills、MCP、subagents、sessions、records/replay、compaction、permissions 和 lifecycle hooks。AITP Agent 应该在这个 runtime 里扩展，而不是作为外部插件或 prompt wrapper。

### Codex

Codex 是工具工程参考。最值得迁移的不是整体架构，而是 tool exposure 分层、稳定的 pre/post tool-use payload、结构化 tool output、tool-call source tracking、deferred tool discovery，以及适合 harness 分析的 action trace。

### ForgeCode

ForgeCode 是 harness 和 eval 参考。它值得借鉴的部分包括明确的 agent definitions、tool boundaries、benchmark cases 和可复现 eval 工作流。

## 版本规划

### 0.0.1: Physics Memory Vertical Slice

第一步是在 `packages/agent-core` 内实现 runtime-native memory 路径：

- 新增 `physics-memory` types、parser、scanner、registry、compiler 和 exports；
- 新增模型可调用的 `PhysicsMemory` builtin tool；
- 支持 `list_domains`、`list_capsules`、`load_capsule`、`compile_context`；
- 让 physics memory 平行于 skills，而不是塞进 skills；
- 用 experimental flag 默认关闭；
- 用一个窄的 LibRPA fixture set 证明形状。

0.0.1 的 schema 已经预留 `graphRefs`、`expansionHandles`、`requiredChecks` 和 `actionAffordances`，这样后续 research-action 层有稳定接口。

### 0.0.2: Research Ledger And ActionAlgebra

- 新增 `research-ledger` 子系统，扫描 `.aitp/research-ledger`，把 source-backed research events 和可信 physics memory 分开；
- 从 ledger events 编译出 candidate capsules、graph refs、obligations 和 harness candidates；
- 把 `ResearchActionRegistry` 扩展为 ActionAlgebra，加入 phase、precondition、effect、generated obligation、validator 和 primitive tool attribution；
- 新增 `WorkFrame`、`ResearchObligation` 和 `ValidationScheduler` 基础；
- 在 experimental flags 后暴露 `ResearchLedger` 和 `ResearchAction` model tools；
- 协调 Kimi primitive tools、Codex-style lifecycle ideas 和 ForgeCode-style harness boundaries，但不替换 Kimi 的 tool manager。

### 0.0.3: Thin Base Runtime Spine

先补一条最小的 Codex-style runtime reliability 脊梁：

- primitive tool lifecycle envelope；
- tool call 到 action/workframe 的归因；
- result status 和 artifact refs；
- diff/output capture 边界；
- 必要的 interruption/background 状态。

这个 slice 不搬 Codex，也不重写 Kimi 的 tool manager。

### 0.0.4: LedgerWriter And Controlled Capture

- 增加 schema-checked `ResearchLedger.write_event`；
- 写入确定性的 `.aitp/research-ledger/<topic>/events/*.md`；
- 第一阶段只捕获高价值的 source、git diff、benchmark 和 failure observations；
- 长输出保存为 artifact refs，避免 ledger 变成噪音堆。

### 0.0.5: WorkFrame And ResearchAction Call Trace

- 让 WorkFrame 成为 active session context；
- 支持打开、切换、列出、关闭 WorkFrame；
- 把 ResearchAction call 和 primitive tool call、ledger event 连接起来；
- 从 action effects 生成 obligations；
- 在多个 research frame 之间保持 domain isolation。

### 0.0.6: LibRPA Micro Vertical Slice

先用一个窄的计算物理工作流证明 runtime spine 真的有用：

```text
formula capsule
-> code mapping
-> git diff / implementation trace
-> smoke benchmark
-> intermediate observable check
-> failure mode or validated memory update
-> harness regression case
```

### 0.0.7: Capsule Boundary Compiler

- 把局部自洽的推导/代码块编译成 candidate capsule；
- 推导内部保持轻量；
- 只有当局部块要连接 memory、graph、final answer 或其他块时，才进入 capsule boundary。

### 0.0.8: PhysicsDirectionEngine And Lenses

- 增加带 applicability check 的 physics lenses，而不是关键词触发；
- 先做 `topological-order/fqhe-cs` 和 `librpa/head-wing` domain packs；
- 增加 charge-flux quantization lens，并明确区分 external electromagnetic flux、emergent Chern-Simons flux 和 quasiparticle AB flux period。

### 0.0.9: EscalationPolicy And Final Gate

- 简单问题保持轻量；
- 代码修改、benchmark、promotion 和高风险理论 claim 自动升级；
- blocking obligations 未关闭时，final answer 不能声称 validated。

### 0.1: Harness And Eval Runner

- 把 failed 或 inconclusive action traces 转成可审查的 harness candidates；
- 把确认后的 candidates 提升为确定性的 eval cases；
- 增加 FQHE/CS reasoning 和 LibRPA head-wing workflows 的端到端 eval。

### 0.2: FQHE/CS Theory Vertical Slice

闭环第一个形式理论切片：围绕 Laughlin wavefunction、flux insertion、charge-flux quantization、Chern-Simons effective theory 和 K-matrix response，实现 capsules、derivation blocks、physics lenses、convention checks 和 final-answer status。

## 当前状态

- 2026-06-01 检查过 `MoonshotAI/kimi-code:main` 上游状态；本 fork 当时与上游在 commit `933cf67` 处一致。
- AITP Agent 0.0.1 的 physics-memory vertical slice 已经实现，并通过 `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=1` 默认关闭式启用。
- `packages/agent-core` 现在包含 physics-memory types、parser、scanner、registry、compiler、session scanning、append-only records、模型可调用的 `PhysicsMemory` builtin tool、LibRPA fixture capsules，以及基础版 `ResearchActionRegistry`。
- Windows 环境中 broader `agent-core` suite 的基线失败已经修复；详见 [AITP Agent 0.0.1 Audit](docs/internal/aitp-agent-0.0.1-audit.md)。
- 0.0.2 foundation 已经实现：`research-ledger` types/parser/scanner/registry/compiler、session scanning、append-only records、`ResearchLedger` tool、ActionAlgebra types、默认 research actions、scheduler、`ResearchAction` tool、raw-tool escape records，以及 harness candidate conversion。详见 [AITP Agent 0.0.2 Audit](docs/internal/aitp-agent-0.0.2-audit.md)。
- 0.0.3 已经开始实现 thin primitive tool lifecycle spine：真实 loop 层工具调用现在会写入 `tool_lifecycle.started` 和 `tool_lifecycle.completed` records，包含 status、bounded summaries、timing、cwd，以及后续 WorkFrame/ResearchAction 归因预留槽。详见 [AITP Agent 0.0.3 Audit](docs/internal/aitp-agent-0.0.3-audit.md)。
- 0.0.4 已经开始实现 schema-checked `ResearchLedger.write_event`：紧凑的 source-backed events 可以写入确定性的 `.aitp/research-ledger/<topic>/events/*.md` 路径，并立即注册到当前 registry，同时通过 `research_ledger.event_written` 审计。详见 [AITP Agent 0.0.4 Audit](docs/internal/aitp-agent-0.0.4-audit.md)。
- 剩余阶段的执行顺序已经写入 [AITP Agent Runtime Roadmap Implementation Plan](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-roadmap.md)：action/workframe attribution、diff/artifact capture、capture policy、WorkFrames/action traces、LibRPA micro slice、capsule boundary、physics lenses、final gate、harness/eval 和 FQHE/CS vertical slice。

## 本地开发

环境要求继承自 Kimi Code：

- Node.js `>=24.15.0`
- pnpm `10.33.0`

```sh
pnpm install
pnpm dev:cli
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

0.0.1 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/physics-memory packages/agent-core/test/tools/physics-memory-tool.test.ts
pnpm --filter @moonshot-ai/agent-core test
pnpm --filter @moonshot-ai/agent-core typecheck
```

0.0.2 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-ledger packages/agent-core/test/research-action packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
pnpm --filter @moonshot-ai/agent-core test
pnpm --filter @moonshot-ai/agent-core typecheck
```

0.0.3 primitive tool lifecycle 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/basic.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/agent/tool-lifecycle/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/harness/snapshots.ts
```

0.0.4 research ledger writer 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-ledger/writer.ts packages/agent-core/src/research-ledger/index.ts packages/agent-core/src/research-ledger/registry.ts packages/agent-core/src/agent/research-ledger/index.ts packages/agent-core/src/tools/builtin/collaboration/research-ledger-tool.ts packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts
```

仓库工作规则：

- 每完成一个 coherent runtime change，都应该先提交 commit，再进入下一块；
- 当项目目标、feature 状态、安装验证方式或用户可见行为变化时，同步更新 `README.md` 和 `README.zh-CN.md`。

## 许可证

基于 [MIT](LICENSE) 协议发布。
