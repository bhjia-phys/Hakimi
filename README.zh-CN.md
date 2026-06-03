# AITP Agent

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Status](https://img.shields.io/badge/status-runtime--roadmap-blue)](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-slices-v2.md)

[English](README.md) | [上游 Kimi Code 文档](https://moonshotai.github.io/kimi-code/zh/)

AITP Agent 是一个面向理论物理科研的 agent runtime 项目。它以 Kimi Code CLI 代码库为基线，目标是在 agent 底层运行时中原生嵌入理论物理记忆、知识编译、科研动作、验证、benchmark 证据、replay 和失败回灌。

当前仓库仍处在早期阶段，是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 fork。默认产品行为仍继承 Kimi Code；只有当 AITP 实验 flag 明确开启时，新的 runtime feature 才会生效。已完成的第一批切片见 [AITP Agent 0.0.1 Implementation Plan](docs/superpowers/plans/2026-05-30-aitp-agent-0.0.1.md) 和 [AITP Agent 0.0.2 Research Ledger And ActionAlgebra Implementation Plan](docs/superpowers/plans/2026-06-01-aitp-agent-0.0.2-research-ledger-actionalgebra.md)。跨 slice 的 runtime 路线图见 [AITP Agent Runtime Roadmap Implementation Plan](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-roadmap.md)，后续实现细节见 [AITP Agent Next Slices And Upstream Sync Implementation Plan](docs/superpowers/plans/2026-06-02-aitp-agent-next-slices-and-upstream-sync.md)。

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
- `validate.check_convention`
- `code.map_formula_to_code_region`
- `code.compare_git_diff_to_mapping`
- `benchmark.run_minimal_case`
- `memory.propose_failure_mode`
- `harness.build_eval_from_failure`

Universal action layer 必须保持 domain-neutral。具体课题意图通过结构化 `ResearchActionBinding` 附着到通用 action 上，包括 `domainId`、`workflowId`、`lensId`、`checkId`、`adapterId` 和局部参数。

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
- 0.0.4 已经开始实现 schema-checked `ResearchLedger.write_event` 和 controlled `capture_event`：紧凑的 source-backed events 可以写入确定性的 `.aitp/research-ledger/<topic>/events/*.md` 路径，立即注册到当前 registry，通过 `research_ledger.event_written` 审计，并经过 source/git-diff/benchmark/failure capture policy 过滤。详见 [AITP Agent 0.0.4 Audit](docs/internal/aitp-agent-0.0.4-audit.md)。
- 0.0.5 已经开始实现 active WorkFrame runtime state 和 ResearchAction call trace：`ResearchAction` 可以打开、切换、列出、关闭 WorkFrames，也可以 start/finish action calls；二者都可以 replay；action result 可以携带 ledger event ids；primitive tool lifecycle records 现在会携带 active `workFrameId` 和 `actionCallId`。详见 [AITP Agent 0.0.5 Audit](docs/internal/aitp-agent-0.0.5-audit.md)。
- 0.0.6 已经开始实现 LibRPA head-wing micro vertical slice：绑定到 LibRPA workflow intent 的通用 code/benchmark actions、CI-safe head-wing smoke benchmark stand-in、scheduler expectations、controlled failure capture 和 harness candidate conversion。详见 [AITP Agent 0.0.6 Audit](docs/internal/aitp-agent-0.0.6-audit.md)。
- 0.0.7 已经开始实现 capsule boundary compiler：局部自洽的 `ResearchBlock` 可以编译成未提升的 `PhysicsCapsule` candidate，并保留 assumptions、conventions、source refs、open questions 和 required checks。详见 [AITP Agent 0.0.7 Audit](docs/internal/aitp-agent-0.0.7-audit.md)。
- 0.0.8 已经开始实现 PhysicsDirectionEngine 和带 applicability check 的 physics lenses：FQHE/CS 的 charge-flux quantization、LibRPA head-wing 的 formula-code mapping 现在可以被推荐、拒绝并审计，输出 caveats、guiding questions、required checks 和结构化 ResearchAction bindings。详见 [AITP Agent 0.0.8 Audit](docs/internal/aitp-agent-0.0.8-audit.md)。
- 0.0.9 已经开始实现 EscalationPolicy 和 Final Gate：简单物理问题保持轻量，代码、benchmark、高风险理论 claim 和 promotion 会升级到必要的 runtime controls；当 blocking obligations 仍然打开时，validated final claim 会被降级或阻断。详见 [AITP Agent 0.0.9 Audit](docs/internal/aitp-agent-0.0.9-audit.md)。
- 0.1 已经开始实现 Harness 和 Eval Runner：failed/inconclusive action traces 可以转成确定性的 eval cases；eval run 可以检查 action sequence、action outcomes、evidence refs 和 required checks。详见 [AITP Agent 0.1 Audit](docs/internal/aitp-agent-0.1-audit.md)。
- 0.2 已经开始实现可执行的 FQHE/CS theory vertical slice：Laughlin wavefunction、flux insertion、Abelian CS action 和 K-matrix response blocks 可以编译成 candidate capsules，经过 charge-flux lens/convention checks，生成 eval case，并进入 final gate。详见 [AITP Agent 0.2 Audit](docs/internal/aitp-agent-0.2-audit.md)。
- 0.2.1 upstream sync guardrail 已经配置本地 Kimi Code `upstream` remote；由于当前环境 GitHub HTTPS 访问失败，fetch/merge 暂未执行。详见 [Upstream Sync 2026-06-02](docs/internal/upstream-sync-2026-06-02.md)。
- 0.2.2 已经把 research actions 重构为 universal ids 加结构化 `ResearchActionBinding`：FQHE/CS charge-flux check 现在绑定到 `validate.check_convention` 和 charge-flux `checkId`；LibRPA head-wing benchmark 现在绑定到 `benchmark.run_minimal_case` 和 LibRPA adapter id。详见 [AITP Agent 0.2.2 Audit](docs/internal/aitp-agent-0.2.2-audit.md)。
- 0.2.3 已经加入 file-backed `DomainProfile` 和 `WorkflowRecipe` registries，通过 `KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE` 和 `KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE` 开启，扫描 `.aitp/domain-profiles` 和 `.aitp/workflow-recipes` 并暴露为 `agent.domainProfiles` 和 `agent.workflowRecipes`。详见 [AITP Agent 0.2.3 Audit](docs/internal/aitp-agent-0.2.3-audit.md)。
- 0.2.5 已经加入第一版 WorkFrame ContextPack orchestrator：active WorkFrame 可以从 DomainProfile、WorkflowRecipe、PhysicsMemory、ResearchLedger 和 action bindings 编译 bounded `ResearchContextPack` summary，并把 pack id 绑定回 WorkFrame 用于 replay 和审计。详见 [AITP Agent 0.2.5 Audit](docs/internal/aitp-agent-0.2.5-audit.md)。
- 0.2.6 已经开始闭合 turn loop：prompt-sensitive 的 WorkFrame 复用/切换现在会在 injection cycle 里发生，系统会为推断出的 active WorkFrame 重新编译 bounded `ResearchContextPack`，并在 research step 之前把一个紧凑的 AITP research-context reminder 注入到 model-facing context。详见 [AITP Agent 0.2.6 Audit](docs/internal/aitp-agent-0.2.6-audit.md)。
- 0.2.7 已经开始动态工具暴露：当 research turn 已经拿到 bounded `ResearchContextPack` 之后，runtime 可以施加一个临时 managed-tool overlay，使 theory-oriented turn 保留语义研究工具，而 code-oriented turn 额外暴露 `Bash` / `Write` / `Edit`。详见 [AITP Agent 0.2.7 Audit](docs/internal/aitp-agent-0.2.7-audit.md)。
- 0.2.8 已经开始受控自动捕获：`tool_lifecycle.completed` 现在可以结合 active `WorkFrame` 自动识别真实工具结果，把 git diff / benchmark / failure / source excerpt 压缩写入 `.aitp/research-ledger`，同时为低价值工具噪音留下明确的 skip reason 审计记录。详见 [AITP Agent 0.2.8 Audit](docs/internal/aitp-agent-0.2.8-audit.md)。
- 0.2.9 已经开始 graph-aware memory compilation：research-ledger events 现在可以编译成 typed graph candidates，并附带 provenance check、dependency diagnostics、assumption trace 和 incompatible convention warning；这些输出仍然保持 candidate-level，不会静默变成 canonical memory。详见 [AITP Agent 0.2.9 Audit](docs/internal/aitp-agent-0.2.9-audit.md)。
- 0.3.0 已经开始 promotion pipeline 和 trust-ladder gate：graph candidates 现在只能通过显式 `PhysicsPromotionPacket` 才能晋升，source refs、scope、validation refs 以及 formalized 所需的人类 checkpoint 都会被严格检查；晋升后的 capsule 会保留 trust metadata，而不是抹掉 promotion path。详见 [AITP Agent 0.3.0 Audit](docs/internal/aitp-agent-0.3.0-audit.md)。
- 0.3.1 已经开始 final-gate lifecycle integration：当一个 research turn 试图结束，但 active `WorkFrame` 仍然没有通过 final gate 时，runtime 现在会注入一条非常短的 final-gate continuation 提示，并强制模型再走一步，把答案降级成更保守的表述，而不是静默过度宣称完成。详见 [AITP Agent 0.3.1 Audit](docs/internal/aitp-agent-0.3.1-audit.md)。
- 0.4.0 到 0.10.0 已经补齐 Harness V2、LibRPA/FQHE file-backed verticals、bridge-gated domain isolation、physics graph kernel、formalization bridge，以及图查询、benchmark adapter 和 formalization blueprint 的 in-process `ResearchAction` executor lane。
- 0.11.0 已经开始 primitive tool plan templates 和 live native-tool orchestration：每个默认 `ResearchAction` 都可以渲染可审计的原生工具计划；文献搜索、局部代码 patch 准备、外部 benchmark job 提交都有一等语义 action。Runtime tool exposure 会读取 action bindings，通过 turn-scoped Kimi tool builder 激活模板所需的 Kimi 原生工具，并且 replay 后保持 topic-scoped overlay 和 evidence attribution 不串会话；`ResearchAction` 本身仍然不直接执行 shell、git、web、MCP 或 HPC。整轮测试现在已经覆盖 source search、code patch、external job submission，并通过原生 `WebSearch`/`FetchURL`、`Read`/`Edit`、`Bash` 和 `ResearchLedger.capture_event` 的 call attribution 回填到 `ResearchAction.finish_action_call`，同时写入 durable source/code/job ledger event、发出 `research_ledger.event_written`，并把 `ledger:event...` id 放进 `evidence_refs`。详见 [AITP Agent 0.11.0 Audit](docs/internal/aitp-agent-0.11.0-audit.md)。
- 0.11.1 已经加入第一版 external job submission adapter contract：`adapter.external.job-submission` 可以把 scheduler/MCP/HPC/manual job receipt 归一化成 `benchmark.submit_external_job` 的 `BenchmarkAdapterRunResult`，但不在 `ResearchAction` 内执行调度器。Primitive plan 现在会在原生提交之后、ledger/action 记录之前加入 adapter normalization 步骤。详见 [AITP Agent 0.11.1 Audit](docs/internal/aitp-agent-0.11.1-audit.md)。
- 0.11.2 已经把 WorkFrame-scoped evidence inspection 加入 `ResearchAction`：模型可以列出 active 或显式 WorkFrame 最近动作产生的 evidence refs，并且只能在 ledger metadata 匹配当前 frame 的 domain/topic 时加载 `ledger:event...` 正文。加载会写入 `research_ledger.event_loaded`；跨课题/跨 domain 加载会在渲染正文前失败。详见 [AITP Agent 0.11.2 Audit](docs/internal/aitp-agent-0.11.2-audit.md)。
- 截至 0.11.2，当前 baseline 已经是 file-backed、graph-aware、bridge-gated、带审计和恢复测试的科研 runtime；literature、code、external benchmark workflow 都已经能通过 Kimi 原生工具执行，回填 primitive call ids，并留下 durable ledger evidence refs。外部 job 提交有稳定 receipt contract，语义 action 层也能按 WorkFrame scope 重新读取证据。

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
pnpm vitest run packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/research-ledger/capture-policy.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/research-ledger
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-ledger/writer.ts packages/agent-core/src/research-ledger/capture-policy.ts packages/agent-core/src/research-ledger/index.ts packages/agent-core/src/research-ledger/registry.ts packages/agent-core/src/agent/research-ledger/index.ts packages/agent-core/src/tools/builtin/collaboration/research-ledger-tool.ts packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/research-ledger/capture-policy.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts
```

0.0.5 WorkFrame runtime 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/agent/workframe.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/research-action/harness.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-action/types.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/workframe.test.ts packages/agent-core/test/research-action/harness.test.ts
```

0.0.6 LibRPA micro slice 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/integration/librpa-head-wing.test.ts packages/agent-core/test/research-action/scheduler.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-action/librpa-head-wing.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-action/index.ts packages/agent-core/test/integration/librpa-head-wing.test.ts
```

0.0.7 capsule boundary compiler 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-block/compiler.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-block packages/agent-core/src/index.ts packages/agent-core/test/research-block/compiler.test.ts
```

0.0.8 physics direction engine 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/default-actions.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/physics-direction packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/index.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/default-actions.test.ts
```

0.0.9 escalation policy 和 final gate 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-policy packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/obligation.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-policy packages/agent-core/src/index.ts packages/agent-core/test/research-policy
```

0.1 harness 和 eval runner 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-harness/runner.test.ts packages/agent-core/test/research-action/harness.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-harness packages/agent-core/src/index.ts packages/agent-core/test/research-harness/runner.test.ts
```

0.2 FQHE/CS vertical slice 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/physics-verticals/fqhe-cs.test.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-harness/runner.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/physics-verticals packages/agent-core/src/index.ts packages/agent-core/test/physics-verticals/fqhe-cs.test.ts
```

0.2.5 WorkFrame ContextPack orchestrator 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-context packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

0.2.6 turn-loop context closure 第一阶段的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

0.2.7 dynamic tool exposure 第一阶段的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

0.11.0 primitive tool plan template slice 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/research-action/records.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/loop/hooks.e2e.test.ts
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/loop/types.ts packages/agent-core/src/loop/index.ts packages/agent-core/src/loop/run-turn.ts packages/agent-core/src/loop/turn-step.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/tool/index.ts packages/agent-core/src/research-action/primitive-plan.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-action/index.ts packages/agent-core/src/agent/tool-exposure/index.ts packages/agent-core/src/agent/workframe/context-pack.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.md packages/agent-core/test/loop/hooks.e2e.test.ts packages/agent-core/test/loop/api-shape.e2e.test.ts packages/agent-core/test/agent/harness/agent.ts packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/agent/turn.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/research-action/records.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts
```

0.11.1 external job submission adapter-contract slice 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter/external-job-submission.ts packages/agent-core/src/benchmark-adapter/default-adapters.ts packages/agent-core/src/benchmark-adapter/index.ts packages/agent-core/src/research-action/primitive-plan.ts packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

0.11.2 WorkFrame-scoped evidence inspection slice 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/tools/research-action-tool.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.md packages/agent-core/test/tools/research-action-tool.test.ts
```

仓库工作规则：

- 每完成一个 coherent runtime change，都应该先提交 commit，再进入下一块；
- 当项目目标、feature 状态、安装验证方式或用户可见行为变化时，同步更新 `README.md` 和 `README.zh-CN.md`。

## 许可证

基于 [MIT](LICENSE) 协议发布。
