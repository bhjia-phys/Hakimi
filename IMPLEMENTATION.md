# Hakimi 七轨团队实施计划

状态：`active`。本文件是团队执行计划，不是产品路线图，也不是单个 package 的设计文档。根 `README.md` / `README.zh-CN.md` 描述产品方向；本文件描述 owner、边界、阶段、依赖和完成证据。`GOAL.md` 是 Goal mode 行为规格，保持原状，不在本计划中重写。

七条轨道固定如下；共享 contract/gate 由 F 推进，不单独成轨：

| 轨道 | 名称 | 主要 owner | 主要交付边界 |
|---|---|---|---|
| A | Web | Hakimi in-repo production source owner | `apps/kimi-web`、桌面/浏览器 Web、Tower graph editor/live monitor，以及 schema v5 `dist-web` provenance |
| B | 手机远程 | 远程产品与部署 owner | responsive Web/PWA 手机 shell、`kap-server` 远程部署、安全与恢复交互 |
| C | AITP 集成 | AITP adapter owner | CLI + files 的可选 adapter、H0–H4 implemented、H5 partial 的 upstream/adapter 边界、planned H6 native distillation orchestration，以及 gated workflow adapter nodes |
| D | 内置 Hakimi Research Loop | Hakimi research domain owner | Research Frame、Question Board、physics insight、结构化 trace 与 research-cycle template |
| E | UI 与设置 | UI/settings/workflow UX owner；业务 domain 仍拥有 schema | TUI、Web、mobile 的设置、Tower workflow authoring/inspection、双语与可访问性 |
| F | 持续吸收 Kimi Code 上游与基础功能建设 | platform/engine owner | upstream intake、v2 canonical、共享 gate、Tower workflow runtime、release/CI；承接 P0–P3 |
| G | DeepSeek 专属适配与 DeepSeek Harness 吸收 | platform/engine owner | 专用 DeepSeek 适配器（kosong provider 层）；DSH intake（缓存纪律、请求组装、真 API 缓存 e2e）；`docs/dsh-intake/` 跟踪；不回归 GPT/Kimi |

---

## 0. 真实架构基线、边界与执行顺序

### 0.1 架构基线

- 默认 runtime 是 `agent-core-v2`：`packages/kap-server` 直接依赖 v2，CLI 默认通过 SDK/进程内 v2；只有显式 `KIMI_CODE_LEGACY_FLAG` 才走 v1。`packages/agent-core` 冻结为 legacy runtime、rollback 路径和配置/数据 compatibility contract source，只接受安全、构建、数据迁移与维持 rollback/兼容所必需的修改；所有新产品能力只进入 v2。
- v2 的 `[subagent]` 与 `/preset` 是 Agent、AgentSwarm、Tower 的 canonical 模型控制面：Agent/Swarm 不接受逐次 `model`，普通 profile、`swarm`、`tower_worker`、`tower_reviewer` route 统一解析 fresh/resume binding。`[secondary_model]` 仅保留显式配置/API round-trip 和无 active preset 时受旧 flag 控制的 best-effort fallback，不是第二套产品路由。当前 Tower 已有唯一 control tower、mission/worktree、worker/reviewer、review/merge gate 和 activity log；通用 workflow schema/compiler、named role route、可恢复 DAG 与可视化仍是 P3 规划。
- v2 当前真实 `LifecycleScope` 固定为 `App → Session → Agent`，定义在 `packages/agent-core-v2/src/app/scopes.ts`；代码中尚无 `Workspace` tier。Workspace 资源目前由 `Program`/`WorkspaceInstance` 与 session lifecycle 手工装配，四层 `App → Workspace → Session → Agent` 是待 F 轨单独核对和实现的目标架构，不能由 C 轨或普通 Feature 先行假定。
- Goal 仍由 `packages/agent-core-v2/src/agent/goal/` 的 Agent-scope `IAgentGoalService` 拥有；`src/features/plan/` 是现有 Feature 抽取，不代表 Goal 已迁到 `GoalFeature`。
- 调用路径是并列的：TUI → `packages/node-sdk` / 进程内 v2，native print → `apps/kimi-code/src/cli/v2/run-v2-print.ts` 直接使用 v2，Web → `packages/kap-server` REST/WS。`packages/transcript` 与 `packages/klient` 提供可复用 contract/facade，不构成强制线性层链。
- Web production source cutover 已完成：`apps/kimi-web` 是唯一可编辑的 production source；`apps/kimi-code/dist-web` 与 schema v5 `web-base.json` 是被 Git 跟踪的派生发布产物。源码变更后，`pnpm run build:web-assets` 从完整 source tree 按 canonical recipe/toolchain 构建并原子替换二者，提交后再用 `pnpm run build:web-assets -- --check` 做 clean rebuild、bundle 逐字节核验与 source/recipe identity 核验；CI、release、native、direct package build/prepack 与 Nix 都执行同一严格 toolchain preflight。生成物不得手工编辑或局部替换；v4 native receipt 直接绑定实际 toolchain、source/recipe/bundle identity 与最终 binary sha256。
- 手机首期是 responsive Web/PWA remote shell，不承诺 native app。生产远程只使用 `kap-server` `/api/v1` REST/WS + transcript；不得复活 generic `/api/v2` RPC、debug reflection 或 daemon。
- AITP 仍严格是 CLI + files。Hakimi 不复制 AITP runtime、parser、validator、canonical ledger 或 daemon，不创建 SDK/API/MCP server、vector service 或第二套 ledger；C 是可选 adapter，D 不依赖 C。
- DeepSeek Harness（deepseek-harness `main`）是参考上游，不是 merge upstream：只按机制移植（epoch 请求头、session 日志派生请求、缓存纪律、压缩设计、真 API 缓存 e2e），每项带 hakimi 自己的 contract/type/test 证据并过 F gate；DeepSeek 专属 wire 语义只存在于 kosong adapter/provider 层，核心与 GPT/Kimi 路径保持 dialect-free。
- **平台决策（2026-08-14 评审）：研究层（D/C 轨、研究循环、记忆集成）以 hakimi 为实现场；DSH 仅为机制参考上游。** DSH 曾作为研究层承载方评估并被否决——rc 级版本、README 明示 breaking changes、两月龄高频演进，尚不适合承载长期研究资产；可反转条件为 DSH 稳定 release 且 G2 跨 harness 基准给出明确优势（届时重新评审，不做默认迁移）。
- `apps/kimi-code` 通过 `@moonshot-ai/kimi-code-sdk` 消费 core 能力，不直接依赖 `@moonshot-ai/agent-core`。E 不拥有 provider、research、AITP、remote 等业务 schema。

### 0.2 执行顺序与并行规则

顺序固定为：**contract freeze → 核心正确性 → 公共边界 → Hakimi overlay → 可复用 Tower workflow runtime → 最后评估 `GoalFeature`**。

当前开工顺序（平台决策 2026-08-14 后）：**F P0（前缀正确性）→ G1 缓存纪律（压缩后不重渲染 + `KIMI_NOW` 锚定）→ C/H0–H4 AITP adapter（H5 仅部分集成；首个实验性切片受 Hakimi default-off 产品 flag 门控）→ D0–D6 research loop → G0 专用 DeepSeek adapter 按需**。P3.0/P3.1 只能在 P2.1 canonical subagent routing 稳定后开始；P3.2 runtime 复用现有 session/subagent、`IAgentTaskService` detached-task、transcript 和 permission 生命周期，由 P3.1 冻结一个 Tower-owned adapter，不新增未定义的 generic public task facade；P3.4 Web 可视化依赖 P3.3 typed workflow projection 和 A 的 provenance gate。

F 先冻结 canonical matrix；随后完成 P0 核心正确性、P1 klient/SDK/REST/TUI 公共边界和 P2 overlay，再交付 P3 workflow contract/runtime 并接入 A–E/G。A–E、G 可在 gate 之间使用 frozen fixture、fake adapter 和 mock event 并行开发，但跨轨集成与 release 必须等待对应 F gate；D/C 可以在 P3 schema fixture 上设计模板和 adapter node，不能提前实现第二套 runtime。

跨轨只使用稳定 contract、wire/event、transcript operation、`ConfigSectionContribution`、klient/SDK facade 或 REST/WS；禁止 deep import，尤其是 UI 直接 import engine service、A/B 直接 import D/C 内部实现、C 直接 import AITP runtime。业务 schema、默认值、校验和持久化由 domain owner 注册，UI 只消费 typed contract、状态与事件。

需要跨进程、远程恢复或 UI 更新的事实必须有可重放 event/wire/transcript projection；live、backfill、cold 必须收敛，旧 peer、断线、冷 session、未初始化 AITP 和关闭的实验 flag 都必须有明确 degraded contract，不得静默成功。

AITP upstream 的 `list`、`show`、`check`、`backfill` 现已 shipped（M1a/M1b-R1/M1c/M1d/M1e gate passed）；Hakimi adapter 的 H0–H4 已实现，H5 仅部分集成：支持 strict contract discovery、Python probe、`enter`/`list`/`show`/`check` 读侧消费、scoped `--workstream` 和 `record`/`note prepare|save` write gate。`KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` 默认关闭是 Hakimi 产品决策，不是 AITP 协议状态或 H6 可用性信号；设置为 `1` 后才开放 `/research` 与 `EnterAITPMode` 入口，进入模式仍需 `/research on` 或模型入口，inactive 零 AITP I/O。Hakimi 只把 check finding code 作为 opaque string 投影，不暴露、不调用、不解析 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:`/`check-policy` 语义。官方 AITP 0.8.0 六个 golden fixture 只用于本地 parser/contract tests，不启动 live CLI subprocess，不等于 live CLI conformance。绝不模拟或从文档推导；对未安装或旧版本 AITP 按不存在处理。不得自动运行 `init`、`init --adopt` 或 `inventory`，不得直接写 canonical `.aitp` 文件。AITP 0.8 Skill-only amendment（已 commit）定义 `method-observation` marker 和 method-card distillation 规则，但不改 CLI/schema/transport；Hakimi native method-distillation orchestration（H6/C6）是 planned，unavailable。生产手机路径不能依赖 debug surface、未认证 reverse proxy、本地 canonical store 或 native engine。上游变更必须分类吸收而非机械同步；`GoalFeature` 在所有 shared gate 通过且不会产生第二个 Goal owner 前不迁移。

---

## 1. F 轨共享 gate（不单独成轨）

F 负责推进以下 gate，其他轨道消费其公开结果。

### 1.1 F0：upstream intake、canonical contract 与架构冻结

冻结供 v1 compatibility adapter、v2 engine、transcript、klient、REST、SDK、TUI、Web 和 mobile 共用的 matrix，至少包括：

- `CreateGoal { objective; completionCriterion?; replace? }`、`GoalBudgetLimits { tokenBudget?; turnBudget?; wallClockBudgetMs? }`、Goal snapshot/status/change 的字段与 `null`/clear 语义；所有 host budget 统一转发 `IAgentGoalService.setBudgetLimits`，native print safety ceiling 另由 print policy 管理。
- `/goal`/goal facade 作为 mutation surface；`/prompts` 不再接受静默无效的 goal/mode alias；explicit agent profile 只有一个 producer，session snapshot 与同名覆盖规则固定。
- Goal transcript 的 runtime restore、cold fold、marker、`null`/clear 语义，以及远程 REST/WS、op-batch sequencing、approval/question、reconnect/catch-up、Research Loop projection、AITP status 和 domain-owned config 的版本/降级语义。
- v1 只做兼容 adapter，不反向定义 v2；公共 facade 不暴露 raw service locator 或 `engineAccessor` escape hatch。

证据是 contract/parity fixture 覆盖 create、criterion、budget、状态变化、clear、resume，且文档/静态检查能证明各 surface 使用同一语义；`GOAL.md` 无 diff。F0 不迁 GoalFeature，不重写 engine，不恢复 `/api/v2`、debug reflection 或 daemon。

### 1.2 F1：P0 核心正确性

#### P0.1 `UserPromptSubmit` blocked → Goal blocked

`packages/agent-core-v2/src/agent/prompt/promptService.ts:startNext` 当前在 hook block 时只完成 blocked prompt，不创建 `turn.ended`；`goalService.ts:settleAbnormalTurn` 只消费 blocked turn。任务是让 admission result 带稳定的 user-origin/block reason，由 `goalService` 唯一调用 `markBlocked`，不伪造 turn，并保留非 user/system trigger 边界。测试覆盖真实 hook → prompt → Goal 链路、`goal.updated`、wire/transcript marker 和不启动下一轮。

#### P0.2 explicit agent profile 单一 ownership

`workspaceAgentProfileLoader/explicitAgentProfileLoaderService.ts` 与 `sessionAgentProfileCatalog/explicitFileAgentSource.ts` 当前可能以同一 `sourceId`/priority 产生两个 explicit producer。任务是由 Session immutable snapshot 单一拥有 per-session `agentFiles`，Session source 唯一贡献；Workspace loader 只处理 workspace-bound source。测试覆盖同名冲突、原文件修改/删除、resume snapshot、sibling 隔离、reload/error，静态检查确认无双 producer；不删除 v1 profile 行为。

#### P0.3 清理 `/prompts` goal dead fields

`packages/kap-server/src/protocol/rest-prompt.ts`、`packages/protocol/src/rest/prompt.ts` 接受但 `routes/prompts.ts` 不消费 `plan_mode`、`swarm_mode`、`goal_objective`、`goal_control`。按 F0 matrix 删除或显式拒绝这些 no-op alias；若兼容旧 client，只在一个 adapter 中显式转换并返回可观察 deprecation/error，Goal/mode 仍由 canonical surface 管理。schema、route 和 session Goal/profile tests 必须证明不再静默伪成功，也不删除 Goal 能力。

#### P0.4 Goal transcript runtime/cold/clear 一致性

以 `packages/kap-server/src/services/transcript/coreEventMap.ts`、`packages/transcript/src/history/foldFacts.ts`、`src/ops/operation.ts` 和 `src/ops/apply.ts` 为边界，统一 Goal `create/update/blocked/complete/cancel/clear` 的 live、backfill、cold 投影；runtime restore 的 `active → paused`、cold normalization、`meta.goal` clear 与 marker 必须一致。`packages/transcript/test` 与 kap-server transcript tests 使用同一 fixture 比较四种结果，不扩展无关 step/tool/task 细节。

P0 gate：四项通过后，v2 Goal 状态、持久 wire、canonical REST 和 transcript runtime/cold/clear 语义一致，才进入 P1 和跨轨集成。

### 1.3 F2：P1 公共边界

#### P1.1 klient Goal facade

在 `packages/klient/src/contract/agent/services.ts` 增加 zod `IAgentGoalService` contract，在 `core/facade/agent.ts` 暴露 typed `create/get/pause/resume/cancel/setBudgetLimits`，在 memory registry 注册 token，并在 events contract 注册 `goal.updated`。memory/IPC 共享 conformance fixture，覆盖 criterion、三类 budget、状态事件、complete/clear、main-agent 限制；不暴露 engine token 或 raw locator。

#### P1.2 node-sdk、TUI、REST 的 criterion 与 budget forwarding

扩展 `packages/node-sdk` 的 types/session/rpc/v2 client，`apps/kimi-code` 的 `tui/commands/goal.ts`、`cli/goal-prompt.ts`、native/legacy print adapter，以及 `packages/kap-server` 的 goal protocol/events/session routes，让 `completionCriterion` 和 `GoalBudgetLimits` 完整 round-trip。v2 是 canonical，v1 只做兼容映射；所有 host budget 都调用同一 `IAgentGoalService.setBudgetLimits`，print safety ceiling 仍属 print policy。SDK、TUI/print、REST create/get/control/cold tests 验证省略与显式值、stop/resume、事件和 summary。

#### P1.3 goal resume 语义统一

统一 engine、klient、SDK、REST、TUI 的 resume：`paused`/`blocked` → `active` 后只排一次 continuation，重复/并发 resume 去重，`complete`/clear 不可 resume；TUI 不补 synthetic user prompt，当前 turn driver 接管 `UpdateGoal(active)`。memory/IPC、SDK、REST、TUI fixture 必须覆盖这些情形；不改变 `resumeSessionById`、restore 或新增 App-level session lifecycle facade。

#### P1.4 native print 与 `engineAccessor` 收口

以 `packages/node-sdk/src/sdk-rpc-client-v2.ts`、`apps/kimi-code/src/cli/v2/run-v2-print.ts` 为边界抽出 host-neutral print orchestration/policy，复用 Goal continuation、background drain/steer、safety ceiling/maxTurns；native print 改经 SDK/klient typed surface 驱动。移除 public `engineAccessor` getter，`validate-config.ts` 如仍需直接读 v2 只能保留记录的静态校验例外。native/legacy print、goal/cron/background parity 和 import-boundary tests 必须通过。

#### P1.5 Dynamic Goal tool exposure

在 `packages/agent-core-v2/src/agent/tools/goal/update-goal/`、`set-goal-budget/` 及 per-turn assembly 中按 Goal snapshot 控制 schema：无 Goal 时两项不可见，`active`/`paused`/`blocked` 时可见；这独立于 `select_tools` 的 progressive disclosure。Goal tool/turn fixture 覆盖四种状态并证明 `select_tools` 不能绕过 gate。

P1 gate：klient/SDK/REST/TUI/native print/tool exposure 通过同一 contract、conformance、resume、transcript 和 static-boundary 证据后，v2 contract 才提供给 A–E。Goal 的创建、完成标准、暂停/恢复、阻塞、取消、预算、恢复和展示能力必须保留。

### 1.4 F3：P2 overlay 与发布边界

以下是真实 Hakimi overlay 任务；P2.1–P2.4 由 F 承接，P2.5 由 A 承接：

- **P2.1 canonical subagent routing baseline/hardening：** 当前 v2 基线已经把 `[subagent]` / `/preset` 设为唯一正式控制面：Agent 使用 active preset profile → base profile → caller，AgentSwarm 使用 active preset `swarm` → active preset profile → base `swarm` → base profile → caller，Tower 使用 active preset `tower_worker|tower_reviewer` → base route → caller；fresh、resume 和 retry 使用同一 resolver，Agent/AgentSwarm schema 不暴露逐次 `model`。剩余 gate 是冻结跨 engine/SDK/TUI 文档与负向 fixture，并锁定 legacy 插入点：仅在无 active preset、canonical route 无 model、preference 非 `primary`、旧 flag 开启且 route 非 `tower_reviewer` 时，才 best-effort 解析 `[secondary_model].default_model ?? model`，否则 caller；legacy pool/`force` 不参与，provider/model 维护不写回该节。v1 不再追求新功能 parity，只保留 rollback/配置兼容所需 adapter。fixture 覆盖 precedence、unknown/blank alias、thinking 重算、普通 profile resume、Tower binding 保留、worker fallback、reviewer exclusion 和 legacy 隔离。
- **P2.2 Codex OAuth flag：** 以 v2 `app/kosongConfig/flag.ts` 的 `openai-codex-oauth` 为 canonical flag，在 auth service、token adapter 和 provider resolution gate；CLI/TUI 只传递结果，测试 flag off/on 的 login、provision、resolution、status/logout，默认 off。
- **P2.3 local web-search policy：** 由 v2 `webSearchService.ts` 与 `providers/local-web-search.ts` 统一 explicit config → managed OAuth → local fallback、endpoint、result cap 和 abort；v1 provider 只作 adapter，fixture 覆盖 credentials、HTTP/error、abort 和 tool error。
- **P2.4 session mirror：** 分开验收 v2 同一 home 的 derived read-model（metadata → mirror、evict-before-delete、drain）与 v1 `~/.kimi-code` 文件/symlink compatibility mirror；若启用跨 engine sharing，只增加单一 lifecycle adapter，不把 mirror 当 canonical store。
- **P2.5 Web provenance（已完成）：** A 以 `pnpm run build:web-assets` 固化 clean source build → branding patch → schema v5 provenance/verification → atomic bundle cutover；`source` 绑定完整 `apps/kimi-web` tree，`recipe` 同时绑定 canonical build files、Node/pnpm 要求与实际 canonical Node/pnpm，`bundle` 绑定 `dist-web` 文件清单，三者各有 sha256。`dist-web`/`web-base.json` 作为派生发布产物纳入 Git；源码变更后必须整体重新生成并一并提交。`pnpm run build:web-assets -- --check` 必须逐字节复现 tracked bundle 及全部 source/recipe-file identity；只有 recorded 与 rebuilt 两端都满足同一 canonical 要求、pnpm 精确相同且其余 identity 完全一致时，才允许实际 Node 版本不同。CI、release、native、direct package build/prepack 与 Nix 都执行严格 toolchain preflight；Nix 通过 derivation override 提供精确 pnpm 10.33.0，并按 tracked clean check → regenerate → installed check 的顺序构建，不存在 bypass。native snapshot 再验证 bundle，v4 receipt 直接绑定实际 toolchain、source/recipe/bundle identity、branding patch 与 binary sha256。任一输入、摘要或 receipt 不匹配时 packaging 失败。回滚只允许恢复旧 canonical tag 的 source/recipe，再生成完整 bundle/provenance 与 native receipt；不得单独替换 `dist-web`。

每项都要有 parity/negative fixture、typecheck、static boundary 和 release evidence；P2 不通过删除 Goal、复制 runtime 或引入第二套 owner 来解决冲突。

### 1.5 F4：P3 可编排 Tower workflow runtime

P3 把当前固定的 Tower worker/reviewer 协议演进为可复用、可校验、可恢复、可观察的 workflow runtime。它是 F 负责的共享基础能力，不新增第八轨：E 负责跨 surface UX，A 在 `apps/kimi-web` 中实现 Web 可视化，D 提供科研模板，C 只提供可选 AITP adapter node。P3 不改变 AITP、Research、Goal、transcript 或 UI 的 owner，也不让 Tower 成为第二套 research memory、ledger、session lifecycle 或 model router。

#### 1.5.1 产品合同与分层

Tower workflow 固定为五层，依赖只能由上层消费下层公开 contract：

1. **Workflow template：** 描述稳定 node id、依赖图、scope、输入/产物、成功条件、review/retry、fan-out/fan-in 和 completion；可版本化、可提交、可复用，不包含模型别名、provider 凭证、任意 shell 或 runtime agent id。
2. **Role/profile：** 描述 agent 的工具、权限、通信能力、worktree confinement 和 protocol participation。Tower worker/reviewer 即使选择不同语义 route，也继续使用 Tower 专用 profile 与写入 guard，不退化为无隔离的普通 `coder`。
3. **Preset execution policy：** canonical `[subagent]` preset 把 `tower_research`、`tower_architect`、`tower_implement`、`tower_test`、`tower_review` 等语义 route 映射为 model/Thinking。workflow 只引用 route，不引用 raw model；切换 fast/balanced/deep preset 只能改变执行模型和 Thinking，不能改变 workflow 图、scope 或 gate。
4. **Compiler/runtime：** F 的 headless v2 service 校验并编译 template，驱动唯一 control tower、mission state、Agent/AgentSwarm、worktree、review、merge 和恢复；tool protocol 而非 prompt 负责强制规则。
5. **Public projection：** klient/SDK/REST/WS/transcript 或等价 typed surface 提供 template validation、run snapshot、node transition、agent/branch/worktree、finding/review、budget/usage 和 gate reason；TUI/Web 只消费 projection，不持有 canonical state machine。

`Agent` 是一个叶子执行单元；`AgentSwarm` 是可选的 fan-out/fan-in 执行原语；Tower 是在它们之上管理依赖、隔离、评审、恢复和合并的 orchestration runtime。不得让 worker 自行成为第二 control tower；子 workflow 复用同一 runtime 和 control authority，不形成嵌套 merger。

#### 1.5.2 Versioned workflow contract

P3.1 必须先冻结 versioned schema，再实现编辑器。每个 node 至少包含：

| 字段 | 语义与约束 |
|---|---|
| `id` | template 内稳定、唯一、可作为 replay key；重命名是显式 migration。 |
| `kind` | 受注册表约束的 `survey`、`worker`、`swarm`、`review`、`gate`、`integration`/`merge`、`validation` 等节点类型；不允许把任意 executable 当 node kind。 |
| `role` / `route` | `role` 选择工具/权限 contract，`route` 选择 preset 中的语义模型路由；两者独立，均须在启动前解析。 |
| `depends_on` | 构成有向无环图；必须指向已存在 node，compiler 计算 dependency closure、ready set 和 fan-in。 |
| `scope` | picomatch 文件范围；build mission 之间默认互斥，survey 为只读 informational scope，共享文件只能由一个 integration owner 持有。 |
| `inputs` / `artifacts` | 引用上游具名产物与版本化 shape；禁止通过未声明文件、隐藏 prompt 或 UI 内存传递 canonical 结果。 |
| `success` | 可机器检查的完成条件、required checks 和允许的 degraded result；不能只依赖 worker 自报“完成”。 |
| `review` / `retry` | reviewer role/route、quorum、最大轮次、重复 finding 停止规则、可重试错误和 redirect target。 |
| `concurrency_group` | 限制共享 provider、GPU、外部服务或 merge-critical section 的并发；不能覆盖 worktree/scope guard。 |
| `budget` | 引用 run policy 的 wall-clock/token/turn 标签；模型仍来自 preset，预算不得暗含 model alias。 |

项目级、可跟踪 template 必须与 `.tower/` 运行实例分离。P3.1 contract gate 冻结最终 template 目录、扩展名、schema id 和 migration 规则；推荐候选是 `.hakimi/workflows/`，但在 gate 通过前不得描述为现有发现路径。P3.2 的 canonical run/merge state 由 F/TowerStore 独占写入 `.tower/runs/<run-id>/`（最终文件名与 schema 在 P3.1 冻结）：包含 template identity/hash、compiled graph、run/node 状态、monotonic transition sequence、resolved role/route/binding provenance、budget usage、artifact pointers，以及每次 merge 的 idempotency key、target tip、intent/result。它采用原子 checkpoint snapshot + append-only transition journal，`activity.log` 只作人类可读审计，不是唯一恢复源。现有 `.tower/` missions、roster、worktrees、inbox/findings/reviews 和顶层 merge/status 文件只作为由 canonical snapshot/journal 重建的 protocol/compatibility projection，携带 source run id/sequence/hash，不得独立推进 merge state；projection 写失败可以重建，恢复时不一致即丢弃并重放。public projection 同样只从 canonical run snapshot/journal 派生。用户、模型、可视化编辑器和普通文件工具都不得手工编辑 `.tower/`，teardown/retention 只能经 Tower protocol。

#### 1.5.3 Validator、compiler 与恢复语义

compiler 在产生任何 branch/worktree/agent 副作用前完成静态验证：schema/version、node kind、role/route、DAG cycle、dependency closure、artifact references、scope overlap、review target、budget label 和 capability 均合法；失败返回 coded diagnostics，并能定位 node/field/edge。template 中出现 raw `model`、provider secret、未注册 executable、写 `.tower/`、重复 control tower 或未声明 merge owner 时必须 fail closed。

当前 `/tower <objective>` 的行为先被表达为内置 `default` workflow：plan 生成 2–4 个 disjoint mission，dependency-unblocked worker 并行 spawn，worker 在独立 branch/worktree 提交，reviewer 对当前 tip 出 verdict，`TowerMerge` 检查 clean review、dependency 和 scope 后合并，最终 teardown。该抽取必须保持现有 `/tower status|teardown`、activity log、dirty-worktree protection 和 tool error 语义，作为 backward-compatibility fixture。

runtime 使用确定性 node 状态机（至少 `pending → ready → running → waiting_review/waiting_gate → succeeded/failed/blocked → merged/closed`），所有 transition 带 monotonic sequence、原因、actor 和 artifact references。crash/resume 或 session cold restore 从持久 run snapshot + transition journal 重建 ready set，并与 activity-log audit sequence 校验；同一个 node/tip 不得重复 spawn、review、merge 或发放 budget。依赖完成只唤醒新 ready node；失败按声明 retry/redirect，超出轮次或重复 finding 进入 blocked 并继续推进无关分支。

run 使用独立状态机：`created → validating → running`；正常控制环为 `running → pausing → paused → resuming → running`；`running → succeeded|failed|blocked`，其中 `blocked` 可在 blocker revision 变化并重新校验后走 `blocked → resuming → running`，`succeeded`/`failed` 是终态；任一非终态 `{created, validating, running, pausing, paused, resuming, blocked}` 都可走 `canceling → canceled`，`canceled` 是终态。control command 使用 expected run sequence/CAS 和 idempotency key，contract 固定如下：

| command | 允许状态 | 状态与副作用 | 重复/冲突语义 |
|---|---|---|---|
| `pause` | `running` | 进入 `pausing`，立即停止发放新 node/retry/review/merge；已运行 agent/swarm item 到安全边界 checkpoint 后进入 `paused`。 | 在 `pausing/paused` 返回同一 snapshot。 |
| `resume` | `paused`；blocker revision 已变化且 validator 通过的 `blocked` | 进入 `resuming`，从 snapshot 只排一次 ready continuation，journal commit 后进入 `running`。 | 在 `resuming/running` 返回同一 snapshot。 |
| `cancel` | 所有非终态 | 进入 `canceling`，停止新工作、abort 可取消 task、禁止 retry/review/merge，checkpoint 后进入 `canceled`；保留 branch/worktree/artifact/audit，不等同于 teardown。 | 在 `canceling/canceled` 返回同一 snapshot。 |

除表中允许状态和明确 idempotent 状态外，所有 command/state 组合统一返回 coded `RUN_CONTROL_CONFLICT`，不产生 transition、journal 写入或外部副作用；expected sequence 过期返回 `RUN_REVISION_CONFLICT`，相同 idempotency key 重放返回第一次 committed 结果。run aggregation 由 compiler 生成的 completion policy 唯一计算：所有 required node 满足 `success`、required artifact 齐全且仅出现被声明允许的 degraded result 时转 `succeeded`；required node 在 retry/redirect 用尽后 terminal failure 或 required completion predicate 为 false 时转 `failed`；不存在 running/ready node、但 required node 或 gate 仍被可解除 blocker 阻塞时转 `blocked`。每次聚合 transition 必须在 journal 中记录参与的 node sequence、artifact hash、predicate version 和判定原因。

`TowerTeardown` 单独处理受保护的磁盘清理。cold restore 遇到 `pausing/resuming/canceling` 时按最后 committed transition 与 idempotency key 恢复并只完成一次；所有 run/node transition 和控制结果进入同一 public projection/conformance fixture。

`swarm` node 由 compiler 生成 bounded item set 和 aggregation contract：适合只读调查、批量验证或互不重叠的叶子，不允许多个 item 未经 scope 分割写同一文件。fan-out 的每个 item 有稳定 key，fan-in 只有在 required item 达到声明状态后产生版本化聚合 artifact。动态 expansion 只能由受信 validator 接收结构化产物并重新校验新增子图，不能让 LLM 直接注入未验证 node 或边。

#### 1.5.4 Preset、role 与执行策略

现有 `tower_worker` / `tower_reviewer` 保持默认兼容 route。P3.1 增加 named Tower route contract，使 mission 可以选择语义 route，但 `TowerSpawn`、workflow 和 node artifact 都不得接收 raw model。普通推荐角色为 research、architecture、implementation、testing、review 和 integration；项目/Plugin 可以贡献额外 role/route definition，但 name collision、override、工具 allow/deny 和 profile provenance 必须沿用 agent profile registry 的显式规则。

模型与 Thinking 只由 active `[subagent]` preset 和 base route 解析；active preset 存在时永不读取 legacy。无 active preset 时先取 canonical base route；只有 canonical route 没有 model、profile preference 不是 `primary`、`secondary-model` 旧 flag 开启且 route 不是 `tower_reviewer` 时，才尝试可解析的 legacy `default_model ?? model`，否则继承 caller。因而 Tower worker 可在该严格条件下兼容 fallback，Tower reviewer 永不使用，legacy `models` pool/`force` 不参与 v2 选择。并发、retry、timeout、token/turn/wall-clock budget 属于 workflow/run policy，不应全部塞入 subagent model route；两类 policy 在 run snapshot 中分别记录 provenance，便于复现“使用了哪个图”和“使用了哪套执行资源”。已 spawn agent 保留其 resolved binding；preset 变化只影响之后允许重绑定的 node，并产生显式 event，不能静默改变正在运行或待 review 的 tip。

#### 1.5.5 Public surface 与可视化

F 先提供 headless contract：`list/get/validate/run/status/pause/resume/cancel`（最终 action 命名在 P3.3 冻结）以及 node/run events；memory/IPC/REST/WS 使用同一 conformance fixture。生产 Web 只通过 `/api/v1` REST/WS + transcript/typed operations 消费，不使用 `/api/v1/debug/*`、generic `/api/v2` 或 engine service locator。live、backfill、cold 对同一 run 必须得到一致 graph、node state、sequence 和 gate reason。

E 定义跨 surface information architecture：

- TUI 第一阶段提供 workflow template 选择、参数预览、静态 validation、run 启动、compact status、节点失败/blocked 原因和 `/tower status|teardown` 兼容入口；不在终端内先造完整图编辑器。
- Web 可视化提供 node/edge canvas、node inspector、scope/dependency/review/retry 编辑、preset overlay、resolved model/Thinking（只读）、运行时间线、agent/branch/worktree、finding/review round、token/时间预算和 merge-gate reason。
- 编辑态只修改 versioned template draft；运行态只消费 engine projection。UI 不能直接写 `.tower/`、计算 authoritative ready set、绕过 validator、替代 merge gate 或把本地 graph state 当作恢复来源。
- Web source 由 A 在 `apps/kimi-web` 实现；每次可视化交付都必须通过 canonical build 生成 `dist-web`，携带 schema v5 source/recipe/bundle provenance、contract fixture 和 accessibility evidence。

#### 1.5.6 跨轨模板与边界

首批候选模板是 `feature-development`、`bug-investigation`、`review-audit` 和 `research-cycle`。F 只拥有通用 workflow contract/runtime；模板中的领域 node 由对应 owner 贡献：D 可定义 Research Frame/Question、literature、derivation、numerics、evidence、falsifier 和 decision 的结构化 artifact，但不能把 hidden chain-of-thought 变成 node state；C 可贡献显式 feature-detected 的 AITP read/prepare/save adapter node，但不存在 AITP 时必须 degraded，且所有 canonical 写入仍经官方 CLI。Tower activity log 不是 research memory，workflow artifact 不是 AITP ledger，Research trajectory 仍由 D 的 wire/transcript projection 拥有。

A/E 不定义 node business schema；G 可以通过 preset 提供 DeepSeek-oriented model route，但不得让 workflow 知道 provider dialect；B 只消费可恢复 run/status/approval projection，不在手机端运行 workflow engine。所有跨轨 node contribution 必须通过 F 的 registry、typed contract、version/degraded 和 import-boundary gate。

#### 1.5.7 分阶段交付与证据

- **P3.0 planned baseline fixture extraction：** 盘点并冻结现有 TowerInit/Plan/Spawn/Mission/Send/Inbox/Finding/Review/Merge/Status/Teardown、唯一 tower、worktree、scope、review round、merge gate、activity log、permission 和 preset route 行为；把当前固定协议表达为不改变运行结果的内置 `default` workflow golden fixture。这里的现有能力是固定 Tower protocol，`default` workflow schema/fixture 本身仍是待交付项。
- **P3.1 schema/named routes/compiler：** 冻结 template/run-state version、目录与 migration，交付 node/edge/artifact/run-policy schema、role/route registry、static validator、named Tower routes、Tower-owned detached-task adapter 和 deterministic compiler；首版只支持静态 DAG。
- **P3.2 resumable runtime：** 交付 `.tower/runs/<run-id>/` snapshot/journal、run/node 状态机、幂等 pause/resume/cancel、crash/cold resume、dependency wake-up、条件 gate、bounded retry/redirect、fan-out/fan-in、受校验 dynamic expansion 和 usage/budget accounting。
- **P3.3 public contracts/TUI：** 交付 klient、SDK、REST/WS/transcript conformance、TUI template/validate/run/status/pause/resume/cancel 流程、旧 peer/degraded contract 和 `/tower` backward compatibility。
- **P3.4 visual editor/monitor：** A 在 `apps/kimi-web` 实现 template graph editor 和 live monitor source，E 冻结跨 surface interaction/accessibility contract，A 同时负责 canonical build、branding、schema v5 provenance 与 packaging；覆盖 preset overlay、keyboard/focus/screen reader/contrast、窄屏和 reconnect/catch-up。
- **P3.5 templates/evaluation/release：** 发布工程模板，D 在 flag 下提供 research-cycle，C 在 capability gate 后提供可选 AITP node。评估开始前必须提交 versioned manifest，固定 template/version、至少 12 个 pinned scenario（四类模板各至少 3 个）、每个 scenario 3 次重复、baseline、active preset/model catalog snapshot、seed、tool/provider version、硬件/网络条件、artifact rubric 和原始 event/usage 记录；工程 baseline 是当前固定 `/tower`，research baseline 是不使用 P3 orchestration 的同版本 D loop。

P3.5 default-on gate 同时满足才通过：所有 schema/scope/review/merge/recovery/security case 100% 通过且零重复 spawn/review/merge、零越界写入；至少 90% run 无计划外人工干预完成且不低于 baseline；同 preset 下 median wall-clock 不高于 baseline 115%、median token 不高于 120%，Git conflict rate 不高于 baseline；盲评 artifact rubric 均值不低于 baseline且无 critical evidence/provenance/falsifier 缺失，research-cycle 另需 D owner 明确签字。阈值如需调整，必须在运行 trial 前经平台评审修改 manifest，不能看结果后追认；任一 mandatory gate 未过则保持 experimental/default-off，并记录失败与下一轮假设。

P3 gate 证据还至少包括：versioned golden fixtures；compiler 对同一 template/params 产生逐字节稳定 plan；cycle、unknown role/route、artifact 缺失、scope overlap、raw model、任意 executable 和 `.tower/` 写入均 fail closed；真实 worktree 越界被 guard 拒绝；review/merge/dependency gate 不能被 prompt 绕过；run 控制和进程崩溃后不重复副作用；替换 preset 只改变允许变化的 binding 而图与 artifact contract 不变；AgentSwarm fan-out 稳定聚合；现有 `/tower` fixture 无回归；public projection 的 live/backfill/cold 收敛；Web provenance/accessibility 通过；`packages/agent-core/src` 无新 workflow runtime。

---

## 2. A 轨：Web

### 2.1 owner 与边界

Hakimi 在 `apps/kimi-web` 拥有唯一可编辑的 production Web source、页面和组件；`apps/kimi-code/dist-web` 与 `web-base.json` 是由 canonical command 生成并纳入 Git 的派生 package artifacts，不是第二个 source。A 同时负责 source、schema v5 provenance、branding、serving 和 packaging，但只消费 `/api/v1` REST/WS + transcript、klient/SDK、F 的 session/permission/config/workflow contract 及 D/E/C 的公开 projection，不 import v2 internals、AITP runtime 或 B 部署实现。Tower graph editor 和 live monitor 的 Web source 归 A；A 不实现 workflow validator、ready-set、preset resolver 或 merge gate。

### 2.2 阶段交付

- **A0 source/contract baseline（已完成）：** 以 `e7d5a0aee74e7f116cca0273c416ece9139a78a0` 恢复 in-repo source，冻结历史 REST/WS fixture，并验证 kap-server 的 health/meta/session/snapshot/legacy WS 基线。
- **A1 production Web shell（已完成）：** `apps/kimi-web` 可 build/test/dev，并已成为 production source；session、transcript 和公开 Goal/Research/config projection 通过公共 contract 接入，不复制业务 schema。
- **A2 provenance/packaging（已完成）：** `pnpm run build:web-assets` 在 clean staging 中构建、branding patch、生成并验证 schema v5 source/recipe/toolchain/bundle provenance，再原子替换 tracked `dist-web` 与 `web-base.json`；源码变更后必须整体重新生成并一并提交，`-- --check` 不写产物，验证 clean rebuild 的 bundle 字节与全部 source/recipe identity，仅允许两个 canonical 构建之间的实际 Node 版本不同。native snapshot 与 v4 receipt 继续验证并直接绑定 actual toolchain、同一 identity 与 binary sha256。
- **A3 product integration/parity（现有 production baseline 已完成）：** approval/question、reconnect、Goal/preset/provider usage、transcript v2 和 Research H0–H5 domain status 已接入；旧 peer、冷 session、缺失能力显示 degraded。
- **A4 release/cutover（已完成）：** production source 已切换到 `apps/kimi-web`。CI、release 与 native 先校验 tracked bundle 再生成；direct package build/prepack 与 Nix 从源码生成并验证 bundle 后交给后续 packaging。回滚从旧 canonical tag 恢复 source/recipe 后重建完整 bundle/provenance 与 native receipt，禁止只回退 `dist-web`。
- **A5 Tower visualization（planned，unavailable）：** 在 F/P3.3 typed projection 和 E 的 interaction contract 冻结后，在 `apps/kimi-web` 交付 workflow graph editor、template validation/result display、preset overlay 和 live execution timeline。编辑态只提交 versioned template draft，运行态只显示 authoritative projection，断线按 sequence/cursor catch-up。

### 2.3 依赖与验收

A 依赖 F0/F1/F2 的公开 contract、SDK/klient、transcript 和 release gate；消费 B 的 remote contract，但不消费部署内部实现。持续验收必须证明 clean source build 可从无生成物状态创建 `dist-web`/`web-base.json`，随后 clean rebuild 与 generated outputs 逐字节一致，native receipt identity 完整，Web live/backfill/cold transcript 与 degraded state 收敛，并通过 import-boundary/static check；source、recipe、bundle、provenance 或 receipt 任一不匹配都停止 packaging。

---

## 3. B 轨：手机远程

### 3.1 owner 与边界

B 拥有手机 viewport 的 responsive layout、PWA manifest/install shell、触摸交互、网络状态、远程 approval/question 和部署安全。Web source 由 A 的 `apps/kimi-web` 交付，并沿用同一 canonical production build 与 schema v5 provenance；source cutover 不表示手机远程或 standalone 部署已完成。B 负责 `kap-server` 生产 deployment boundary，包括 TLS、reverse proxy、认证授权、速率/来源限制、健康检查和安全日志。生产 client 只可用 `/api/v1` REST/WS + transcript；`/api/v1/debug/*` 即使保留也只能 loopback/dev-only。

### 3.2 阶段交付

- **B0 contract/threat model：** 冻结 auth、TLS、session authorization、approval/question、cursor/sequence 与 recovery；不以 `/api/v2`、debug reflection 或 daemon 为目标。
- **B1 responsive/PWA shell：** 交付窄屏、触摸、安装提示、网络状态和最小 session/transcript；手机不运行 engine，也不持有 canonical store。
- **B2 deployment security：** 验证 TLS、proxy、token/cookie 生命周期、origin/CSRF 或等价保护、限速、health check 和安全日志，默认拒绝未认证降级。
- **B3 approval/question：** 覆盖 approve/deny/answer、取消、超时、重复提交和恢复后的 pending；不产生 duplicate turn、不绕过 permission。
- **B4 reconnect/catch-up：** 按 transcript cursor 重放 journal 覆盖的 op batches；journal 不覆盖或 session cold 时使用 `GET /sessions/{id}/transcript/ops?since_seq=` 的 `complete: false` 回退 full refresh。
- **B5 试运行：** 在真实 reverse proxy/TLS/auth 下验证网络切换、后台唤醒、token 过期、恢复、审批和可观测性。

### 3.3 依赖与验收

B 依赖 F 的 session lifecycle、permission、auth、transcript sequencing、REST/WS/error contract 和 A 的可部署 bundle；D/C 只提供可选 projection。验收覆盖移动 viewport、PWA fallback、认证授权、安全边界、重复/过期交互、seq/cursor 去重和 cold/backfill 收敛，并证明生产手机路径不能访问 debug reflection、任意 dispatcher、未认证 session 或 daemon；不包含 native App 或手机本地执行。

---

## 4. C 轨：AITP 集成

### 4.1 当前 baseline 与 owner

C 只交付可选 AITP CLI + files adapter；未安装或未初始化 AITP 时，D 和 Hakimi 主路径必须正常运行并显示 degraded status。最后核验的 AITP HEAD 是 `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`（2026-08-23，逐命令核对 `--help`；committed HEAD 是 0.8.0——Skill-only amendment 已 commit）：M0/M0.5 complete；M0.6 implementation closed（缩小声明）；M1a、M1b-R1、M1c、M1d、M1e 均 done 且 deterministic gate passed（154 tests）。Hakimi adapter 的 H0–H4 已实现，H5 仅部分集成，受 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`（默认关闭）门控：支持 strict contract discovery、Python probe、`enter`/`list`/`show`/`check`、scoped `--workstream` 读取/check、`record`/`note prepare|save` write gate、Research state（Question/Line/Focus、三轴问题模型、revision-based human steering、pending checkpoint 与 save+show+check barrier、Goal complete guard）、mode/loop/Question/Focus/checkpoint 的单一完整 snapshot push、active step 的语义状态维护 guidance、protocol/node-sdk/kap-server/klient 公开表面，以及 TUI `/research` Board/manager 与 stale-hydrate 防护。这个 default-off flag 是 Hakimi 产品决策，不是 AITP 协议状态或 H6 可用性信号；`/research on` 只激活 capability 和 Board，不调度模型 turn；Goal 仍是跨 turn continuation 的唯一 owner。进入模式以及 active undo/cold restore 在 ready probe 后只读执行 `enter` → `check`，并从 `enter` 派生 Working Note freshness/current-state maintenance；不是 session-end automatic closeout。H5 只把 check finding code 作为 opaque string 投影，不暴露、不调用、不解析 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:`/`check-policy` 语义。官方 AITP 0.8.0 六个 golden fixture 只用于本地 parser/contract tests，不启动 live CLI subprocess，不等于 live CLI conformance。flag 关闭时（`=0` 或 `/experiments`）所有 AITP 工具、skill 和 Research Board 隐藏，零 AITP I/O；flag 开启但未进入模式时同样零 AITP I/O。不自动运行 `init`/`init --adopt`/`inventory`/`backfill --apply`；本轮不把 `backfill` 暴露为模型工具。typed AITP question/line registry、literature/compute/Portfolio、H6 native distillation orchestration 未实现。AITP 0.8 是 Skill-only amendment（已 commit），定义 `method-observation` marker 候选、保守 card/trial review、两步 human decision（approval + publication）和 platform tool/card/Skill 三层边界——不改 CLI/schema/transport。`record/note prepare|save` 是严格 shape 的未版本化 version-0 response contract，未知 `status` fail closed；第一个 versioned transport 是 M1a 的 `aitp/enter-0.2`。

| Hakimi gate | AITP gate | 状态 |
|---|---|---|
| H0 · 当前 CLI | M0/M0.6 | **已实现（实验性）。** Launcher adapter、Python ≥ 3.11 探测、严格 envelope 校验、`enter` lifecycle、prepare→fill→save、`not_initialized` 降级、flag gate。不自动运行 `init`、`init --adopt`、`inventory`。 |
| H1 · 检索 | M1a（gate passed） | **已实现（实验性）。** Feature-detect 并消费 `enter-0.2`、`list-0.1`、`show-0.1`；`enter` 派生 Working Note freshness。当前状态维护在 mode entry 与 active undo/cold restore 后只读执行 `enter` → `check`，不是 session-end automatic closeout；官方六个 0.8.0 golden fixture 只用于本地 parser/contract tests，不启动 live CLI subprocess。 |
| H2 · 关系与诊断 | M1b-R1（gate passed） | **已实现（实验性）。** 只消费 R1 实际发布的 `check-report-0.1`（exit 0/1 报告、exit 2 错误包）；`lite-entry-0.2` relation、`used_by`、`run-pointer-0.1` 均 deferred，不安排。 |
| H3 · 科研记忆 | M1c（gate passed）；M2–M4 后 | **已实现（实验性）。** 先整合 M1c scoped contracts（`enter-0.3`/`list-0.2`，仅单次 `--workstream`，严格 exact membership、relation 先全局计算）。typed question/line registry、reviewed artifacts、跨 Topic links 和 collaborator protocol 未实现。 |
| H4 · workstream 健康 | M1d（gate passed） | **已实现（实验性）。** 整合 scoped `check`（`check-report-0.2`，仅单次 `--workstream`，admitted in-scope 计数、`by_code`/`outside_scope`，scoped `clean` ≠ 全库健康，四行文本仅人阅）；无 flag 时 `check-report-0.1` 字节不变。 |
| H5 · evidence lifecycle | M1e（gate passed） | **部分集成（实验性）。** AITP upstream 已 shipped `backfill-0.1` 及其语义；Hakimi adapter 仅将 `check` finding code 作为 opaque string 投影，不暴露、不调用、不解析 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:`/`check-policy` 语义。 |
| H6 · native distillation | planned（adapter-contract extension 未冻结） | **planned，unavailable**。native method-distillation orchestration：Session-scope coordinator、candidate/proposal lifecycle、human question + decision write、crash/resume。详见 [`docs/aitp/method-distillation-orchestration.md`](docs/aitp/method-distillation-orchestration.md)。 |

当前持久化 `aitp/lite-entry-0.1` / `aitp/lite-note-0.1` 标识 AITP 文件，不是 CLI response envelope；读契约 `enter-0.2`/`list-0.1`/`show-0.1`/`check-report-0.1`、M1c 作用域契约 `enter-0.3`/`list-0.2`、M1d 作用域 check 契约 `check-report-0.2` 已 shipped，并由 Hakimi adapter feature-detect 消费；AITP upstream 的 M1e `backfill-0.1` 成功 envelope 也已 shipped，但不由 Hakimi adapter 暴露、调用或解析。不存在 `aitp/enter-0.1`、`aitp search`、`aitp --version`，`lineage` 仍 deferred。官方 AITP 0.8.0 六个 golden fixture 只用于本地 parser/contract tests，不启动 live CLI subprocess，不等于 live CLI conformance。AITP 0.8 Skill-only amendment（已 commit）定义 `method-observation` marker 和 method-card distillation 规则，但不改 CLI/schema/transport。详细矩阵见 [`docs/aitp/`](docs/aitp/)；native method-distillation orchestration 规划见 [`docs/aitp/method-distillation-orchestration.md`](docs/aitp/method-distillation-orchestration.md)。任何 status、command、schema、launcher 或 Skill discovery 变化都要先核验外部 AITP `--help`、schema、official fixtures 和双方 handoff，再更新本文件与双语 README；不得把规划写成 available。

### 4.2 边界与阶段

- **Owner/boundary：** C 的 adapter 由 Hakimi AITP adapter/domain owner 实现，首选 v2 Feature/config/command/service contribution seam，例如 `packages/agent-core-v2/src/features/aitpResearch/`；不得从 UI/server deep import。launcher 只调用外部 plugin 的 `scripts/aitp.py`，按 Skill 规则探测 Python ≥3.11。首个实验性纵切片已实现（`aitp_research_mode` flag，默认关闭；仅在显式开启后开放 `/research` 与 `EnterAITPMode`，进入模式仍需显式 `/research on` 或模型入口，inactive 零 AITP I/O），覆盖 H0–H4 adapter 与 H5 的部分集成。
- **C0/H0（已实现，实验性）：** version-0 envelope strict shape、`--help` capability、`enter` lifecycle、prepare→fill→save、`not_initialized` degrade、tree-hash zero-write 和 flag gate。
- **C1/H1（已实现，实验性）：** M1a 后 feature-detect 并消费 `enter/list/show` versioned contract 与 golden fixtures；`enter` 派生 Working Note freshness，并在 mode entry 与 active undo/cold restore 的 ready probe 后只读执行 `enter` → `check` current-state maintenance；不是 session-end automatic closeout。
- **C2/H2（已实现，实验性）：** M1b-R1 后只消费实际发布的 check report（`check-report-0.1`，exit 0/1 报告、exit 2 错误包）；relation、typed resolution、`used_by`、run pointer 均未发布（deferred），不纳入；所有 pointer projection 只读。
- **C3/H3（已实现，实验性）：** M1c 后先整合 scoped contracts（仅单次 `--workstream <slug>` 时 feature-detect `enter-0.3`/`list-0.2`，严格 exact membership、relation 先全局计算）；typed question/line registry、reviewed artifacts、cross-topic links 和 collaborator protocol 未实现；正式 compatibility 以 versioned JSON + official fixtures 为准。
- **C4/H4（已实现，实验性）：** M1d 后整合 scoped `check`（仅单次 `--workstream <slug>` 时 feature-detect `check-report-0.2`，admitted in-scope 计数、`by_code`/`outside_scope`，scoped `clean` ≠ 全库健康，四行文本仅人阅）；无 flag 时 `check-report-0.1` 字节不变。
- **C5/H5（部分集成，实验性）：** M1e upstream 已 shipped `backfill-0.1` 及其语义；Hakimi 只消费 `check` finding code 的 opaque projection，不暴露、不调用、不解析 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:`/`check-policy` 语义。
- **C6/H6（planned，unavailable）：** native method-distillation orchestration——Session-scope coordinator、candidate/proposal lifecycle、human question + decision write、crash/resume。前置：需要 reviewed adapter-contract extension，冻结 marker discovery/exact-card trial/decision receipt semantics，并明确 H5 partial 的 upstream/adapter 边界；当前 **planned，unavailable**，详见 [`docs/aitp/method-distillation-orchestration.md`](docs/aitp/method-distillation-orchestration.md)。
- **C7 maintenance：** 每次外部变化重跑 launcher、capability、shape、fixture、tree-hash 和 degraded tests。
- **C8 optional workflow nodes：** 只在 F/P3.1 node/artifact contract 和对应 AITP capability gate 冻结后，贡献 feature-detected 的 read、prepare、save adapter node；node 输入输出必须是 C 拥有的 versioned adapter contract，不能把 shell command、`.aitp` 路径写入或 ledger mutation 暴露给 workflow template。AITP absent/old/not_initialized 时返回声明的 degraded/blocked artifact，不阻断无 AITP workflow 分支。

C 依赖 F 的 flag、session、event、klient/SDK、P3 node contribution 和 release boundary；A/B/E 只消费 capability/status projection，D 先产生 ephemeral trace，只有用户显式启用且通过 prepare/save/write gate 才写入 AITP。C 永不写 `.aitp` canonical files、第二 index、private cache/transcript/CoT、Tower activity log 派生 memory 或第二 ledger；安装的 AITP 缺少对应命令（未安装或旧版本）时必须返回 absent/blocked，而不是模拟。

---

## 5. D 轨：内置 Hakimi Research Loop

### 5.1 owner 与边界

D 是研究层的主实现轨道（平台决策 2026-08-14：研究层留在 hakimi，DSH 仅作机制参考）。D 由 Hakimi research domain 拥有，首选 self-contained v2 Feature/domain；具体 Service scope、wire、tool/command contribution 先过 agent-core-v2 service-design gate。Research Frame、Research Question Board、checkpoint decision、perspective result、candidate explanation、evidence、falsifier 和 decision 都由 D 定义，不是 Goal、Todo 或 UI state 的别名。D 通过 v2 seams 和公开 klient/SDK contract 接入，不 import AITP 或界面内部。

Frame 至少包含 scientific question、objective、focus、blocker；Question Board 表达 unknown、当前重要性、needed evidence 和 `open | under_investigation | answered | blocked | deferred`。skeptical、literature、physics、numerical、code 视角接收受限 context packet，输出 challenge/evidence/uncertainty；flag 默认 off。

### 5.2 阶段交付

- **D0 contract：** 冻结 Frame、Board、checkpoint、perspective result、trace schema，以及 Goal/Todo/Research Question 的职责、null/clear、恢复、版本和降级语义。
- **D1 state：** 支持 question 的建立、更新、暂停、阻塞、回答、暂缓与可恢复 snapshot，不伪装成 Goal/Todo。
- **D2 bounded checkpoint：** 以 turn/token/wall-clock 或同等 hard ceiling 选择最大知识缺口和允许动作；到界限即暂停、询问或降级。
- **D3 independent insight：** 按问题类型选择五类视角，执行近似、量纲、对称/守恒、可解极限、收敛、跨方法和文献 benchmark 检查，并分离 challenge 与 evidence。
- **D4 research trace：** 以公开 wire/transcript projection 表达 frame、question、candidate、evidence、falsifier、perspective、checkpoint 和 decision，不展示 raw hidden chain-of-thought。
- **D5 evaluation：** 在大型科研代码库、快速数值检查和解析检查上验证同一 loop；flag 默认关闭，依据证据决定发布。
- **D6 research trajectory（科研过程轨迹）：** 以公开 wire/transcript projection 维护一条可重放的科研过程线——question → literature → hypothesis/derivation → numerics → evidence → decision——在 turn 边界折叠注入上下文，使模型清晰知道"已做了什么、处于哪个阶段、下一步缺口"；只有 C 轨可用、用户显式开启持久化且 adapter prepare/save/write gate 成功时，符合条件的轨迹节点才沉淀为 research memory；不展示 raw hidden chain-of-thought。
- **D7 research-cycle workflow template：** 在 F/P3.1 schema 与 D0 artifact contract 冻结后，贡献 question framing、literature、independent perspectives、derivation、numerics、evidence/falsifier、checkpoint 和 decision 的模板/领域 node definition。D 拥有这些 artifact 的科学语义，F 拥有 graph/runtime；template 只引用语义 role/route 和结构化 artifact，不写 model/provider，不把 Tower activity log、worker transcript 或 hidden chain-of-thought 当作 research trajectory。C node 是可选分支，缺失时 workflow 仍可完成并显示 degraded memory status。

D 消费 F 的 Goal/Todo/session/subagent/tool/permission/transcript 与 P3 workflow contract，不改变 Goal owner、不绕过 Todo、不复制 route/provider policy、DAG runtime 或 merge gate。A/B/E 消费公开 projection；C 是可选 persistence consumer。验收覆盖职责分离、hard ceiling、并发去重、五类视角、physics checks、live/backfill/cold replay、无 AITP、flag off、provider 不可用、超预算和 workflow crash/resume 的 degraded path；同一 research-cycle template 切换 preset 时科学 artifact contract 和 graph 必须不变。

---

## 6. E 轨：UI 与设置

### 6.1 owner 与边界

E 拥有 TUI、桌面/浏览器 Web 和 mobile 的 information architecture、settings navigation、form/presentation、validation display、loading/error/degraded state、双语和 accessibility behavior；也拥有 Tower workflow 的跨 surface authoring/inspection UX contract，包括 graph/navigation、node inspector、preset overlay、validation/gate diagnostics 和 live run presentation。E 不拥有 provider/model/subagent/research/AITP/remote/workflow 的业务 schema、DAG 状态机、ready-set、权限、merge gate 或持久化。domain owner 通过 v2 `ConfigSectionContribution`、wire/event 和公开 service contract 提供 schema、defaults、capability、validation 和 mutation，E 只通过 klient/SDK、REST/WS 和 typed events 消费。

TUI 遵守 `apps/kimi-code/src/tui` 的 coordinator/controller/component/reverse-rpc 边界；component 不直接调用 SDK 或读写 session/workflow state。Web source 与手机 responsive 行为分别由 A/B 负责，E 负责设置体验、workflow interaction contract 和跨 surface 语义。图编辑器可以维护未提交 draft，但 validate/run 后的 authoritative graph、node state、sequence、resolved binding 和 gate reason 一律来自 F projection。

### 6.2 阶段交付与依赖

- **E0 schema ownership matrix：** 为 provider、model、subagent preset、workflow template/run projection、research、AITP、remote status 固定 owner、scope、contract、mutation、event、default/degraded 和 consumer，删除或拒绝 dead/no-op fields。
- **E1 TUI settings：** 在现有 settings/dialog/selector/controller 中交付 provider、model、preset、实验 flag、权限、错误和 status 体验。
- **E2 Web/mobile settings：** A/B 消费同一 typed settings/status contract，只改变布局、输入方式和信息密度，不改变字段、默认值、校验或 wire semantics。
- **E3 domain status：** 展示 Research Frame/Board/checkpoint、AITP capability/not_initialized/gate、remote auth/connection/pending/catch-up，并可追溯到 event/REST/WS。
- **E4 parity/accessibility：** 验证 locale、keyboard/focus、screen reader、contrast、touch target、窄屏和错误/加载/空状态。
- **E5 Tower workflow UX：** P3.3 先交付 TUI template list/parameters/validate/run/status/pause/resume/cancel 与 compact node diagnostics；P3.4 再由 A 在 `apps/kimi-web` 交付 Web node/edge editor、scope/dependency/review/retry inspector、preset overlay、agent/branch/worktree、finding/review round、budget/usage 和 execution timeline。编辑和运行状态必须视觉区分，旧 peer、未知 node kind、缺失 route、断线/catch-up 和只读 mobile 均有明确 degraded UX。

E 依赖 F 的 config registry、manifest、klient/SDK、events、permission、transcript 和 P3 workflow projection，消费 A–D projection；UI 不能为业务 schema、默认值、校验、Goal/Research/AITP parser、workflow compiler/runtime、transcript reducer 或 reconnect state machine 建第二实现。验收包括 memory/IPC/REST/WS conformance、live/backfill/cold graph parity、import boundary、keyboard/screen-reader graph navigation，以及 C 未安装、D off、B 未连接、A artifact 缺失、F contract 旧版本时的明确 degraded state。

---

## 7. F 轨：持续吸收 Kimi Code 上游与基础功能建设

### 7.1 owner 与边界

F 是 platform/engine owner：`packages/agent-core-v2` 拥有当前 App/Session/Agent scopes、未来 Workspace scope 的架构演进、services、features、config/wire/tool/profile/command contributions，以及 Tower workflow 的 schema registry、validator/compiler、run state machine、worktree/review/merge protocol 和 public projection；`packages/agent-core` 冻结为 legacy compatibility/rollback source，不承载新 workflow runtime。`packages/transcript` 是 transcript contract、op-batch 和 reducer 的 sole owner；`packages/klient` 是 typed facade；`packages/node-sdk`、`packages/kap-server` 是 public transport；生产远程 surface 固定为 `/api/v1` REST/WS + transcript。

F 还拥有 CLI/TUI/native print 基础、upstream intake、release/CI、security/performance 和 shared gate，但不拥有 A 的 Web UI schema/state、B deployment config、C AITP runtime、D research semantics、领域 workflow artifact schema 或 E UI information architecture。每个 upstream window 要记录 base commit，并把变更分类为直接吸收、v2 adapter、legacy-only、overlay conflict 或拒绝；`upstream-base.json` 不替代 Web source/bundle provenance。外部或项目贡献的 workflow/role/node kind 必须经 F 的 version/capability/permission/import-boundary gate，不能通过 prompt 或 UI 注入运行时实现。

### 7.2 阶段交付

- **F0 upstream/contract intake：** 维护 `upstream/main=01c74e937` 架构基线、canonical matrix、冲突处理、fixture 更新和 rollback 说明，对应 §1.1。
- **F1 core correctness：** 按 §1.2 完成 prompt→Goal blocked、explicit profile 单一 ownership、`/prompts` dead fields 和 transcript consistency。
- **F2 public boundaries：** 按 §1.3 完成 klient、SDK/TUI/REST forwarding、resume、native print 和 dynamic tool exposure。
- **F3 overlay：** 按 §1.4 完成 P2.1–P2.4，并消费 A 的 P2.5 provenance；保持 provider/model/auth/tools/session/SDK/transcript/permission 的 v2 parity、legacy adapter 和 error/degraded semantics。
- **F4 Tower workflow runtime：** 按 §1.5 完成 P3.0–P3.5：先把当前行为提取为 planned `default` workflow fixture，再交付 versioned template、named routes、validator/compiler、可恢复 DAG、typed projection、TUI surface、Web 可视化 contract 和评估模板。P3.4 由 A 在 `apps/kimi-web` 实现 source，E 拥有 interaction/accessibility contract，A 拥有 canonical build/schema v5 provenance/packaging，F 只拥有 engine/public contract 与 release gate。
- **F5 continuous sync：** 每个窗口运行 contract/type/test/static import/security/performance checks，分类吸收 provider、auth、tools、session、transcript、permission、CLI/TUI、protocol 变化，避免重新引入 v1 default、raw escape hatch、no-op fields、第二 model router、第二 workflow owner 或重复 runtime。
- **F6 release/CI：** 维护 build、typecheck、unit/integration/e2e、bundle/native packaging、provenance、security scan、性能、observability、release 和 rollback；A–E/G artifact 以及 P3 compiler/recovery/projection/visualization evidence 必须进入可重放 evidence。
- **F7 final `GoalFeature` evaluation：** P0/P1/P2/P3 前 Goal 保持在 `packages/agent-core-v2/src/agent/goal/`；只有 Feature seams 能单一承载 contract、tool、wire/persistence、telemetry、permission、transcript 和 facade，且无第二 owner，才写迁移方案并单独评审。

F 消费 upstream 与其他轨道的 provenance、安全、compatibility、trace 和 accessibility evidence，向 A–E/G 提供 canonical contract、event、config contribution、facade、session/transcript、permission、workflow runtime 和 release boundary。验收必须证明 v2 是唯一默认语义源、没有 raw `engineAccessor`、重复 explicit producer、重复 transcript/workflow owner、第二 ledger/model router 或生产 debug/API v2/daemon 路径，并能在可选 node/role/preset/AITP/Web 能力缺失时构建且报告 degraded status。

---

## 8. G 轨：DeepSeek 专属适配与 DeepSeek Harness 吸收

### 8.1 owner 与边界

G 由 platform/engine owner 推进：专用 DeepSeek 适配器落在 `packages/kosong` provider 层（v2 对应 provider base），缓存纪律落在 v2 engine 的请求组装/压缩层。G 不拥有 AITP runtime、research semantics 或 UI schema；不改动 provider 抽象的核心 contract，DeepSeek 专属 wire 语义（`thinking:{type}`、`reasoning_effort`、CoT passback、`x-deepseek-*` 遥测）只存在于 adapter 层，不得回归 GPT/Kimi 路径。

DeepSeek Harness（deepseek-harness `main`）是参考上游，不是 merge upstream：不机械同步代码，只按机制移植，每项移植必须带 hakimi 自己的 contract/type/test 证据并过 F gate。intake 以 `docs/dsh-intake/` 跟踪（记录 DSH HEAD、评审过的机制、移植/延迟/拒绝决策），按 release 或周窗口 triage；先移植结构性稳定机制，延后 DSH 自己标 in-flux 的机制（如 epoch 字段定义）。

平台评审结论（2026-08-14）：**DSH 不作研究层承载方**（rc 级成熟度、declared breaking changes）。G 轨范围因此限定为机制移植——DSH 只提供机制参考（缓存纪律、请求组装、DeepSeek wire 语义），不产生任何 DSH 侧研究层建设；跨 harness 基准（G2）保留为机制吸收的测量仪器，不再是迁移决策。

### 8.2 阶段交付

- **G0 adapter：** 专用 DeepSeek 适配器——顶层 `thinking` 语义、官方 `reasoning_effort`（off/high/max）、按回合 CoT passback 省 token、空 content 用 `""` 非 `null`、模型目录（context window、per-model maxTokens）、DeepSeek 专属错误分类（quota/context-window/429）与遥测头、流空闲 watchdog、session-title 关 thinking。
- **G1 cache discipline：** epoch 请求头（system/tools/config 不可变纪元、变更显式记录）、请求从 session 日志派生并 deepFreeze、压缩后不重渲染 system prompt（KIMI_NOW 锚定）、动态内容追加尾部、确定性工具排序、`cacheReadTokens` 记账并在 TUI/telemetry 可见。
- **G2 verification：** 相邻请求前缀逐字节稳定单元测试；key-gated 真 API e2e（断言请求 2+ 全部 `cacheReadTokens > 0`，对齐 DSH `request-cache.e2e.ts`）；跨 harness 基准（同模型、同科研工作流对比 hakimi vs DSH 的命中率/TTFT）驱动 intake 决策。
- **G3 intake process：** `docs/dsh-intake/` 跟踪文档（HEAD、评审、决策）+ 周窗口 triage + 分类（移植/延迟/拒绝）+ 吸收面限定在 llm/session/agent-loop/compaction 的机制级变更。

### 8.3 依赖与验收

G 依赖 F 的 contract freeze 与公共边界、E 的 provider 设置面；以 DSH 文档（architecture、capability-seams、cookbook）为设计参考。验收：GPT/Kimi 路径 wire 字节不变（adapter 层作用域证明）、真 API 缓存命中 e2e 通过、`docs/dsh-intake/` 有 HEAD 与决策记录、无 deep import、无第二 provider 抽象。

---

## 9. 统一完成定义与停止规则

### 9.1 阶段完成定义

一条轨道只有在目标、owner、代码边界、依赖、公开 contract、版本/降级语义和 fixture 已冻结，并且实现、测试、typecheck、static boundary 及该阶段所需的 security/performance/accessibility 证据通过后，才能关闭阶段。mock/fake、设计文档或尚未过 gate 的外部能力不能标为 available；artifact、schema、source/provenance、fixture、版本和限制必须可追溯。跨轨集成必须经过 F gate，不得用 deep import 绕过。

### 9.2 全局停止规则

- 两个 domain 同时拥有 schema、状态机、transcript/workflow projection 或持久化时，停止集成并回到 F0，不用 merge 顺序或 UI adapter 掩盖冲突。
- gate 依赖不存在的 AITP command/schema、未提交或未测试的 Web source、不可获取的 external artifact、未冻结的远程协议或未核验的 upstream 行为时，停止该集成，保留 degraded/fake path，不猜测未来 contract。
- live/backfill/cold、resume、approval/question、reconnect、Goal 或 Tower run/node 状态不能收敛时，停止 release，先补 shared transcript/contract evidence。
- Tower 出现多个 control tower、workflow/template 内 raw model/provider secret/任意 executable、UI 或 `.tower/` 成为第二 runtime owner、或未经过 validator 的动态 node/edge 时，停止 P3 并回到 P3.1 contract gate。
- Tower scope/dependency/review/merge gate 可被 prompt 绕过、crash/resume 后重复 spawn/review/merge、preset 切换改变 graph/artifact contract、或 visual state 与 authoritative projection 不一致时，停止 P3 发布并补 compiler/recovery/conformance evidence。
- 安全边界依赖 debug reflection、generic `/api/v2`、daemon、未认证 proxy 或手机本地 canonical store 时，停止远程发布并回到 B0/F0。
- DeepSeek 专属 wire 语义泄漏进核心层、DSH 机制移植缺少 hakimi 自身测试、或 intake 未记录 DSH HEAD/决策时，停止吸收并回到 G0/F0。
- 发现 D 依赖 C、E 拥有业务 schema/workflow runtime、`dist-web` 被手工编辑/局部替换或 source/recipe/bundle/provenance/native receipt identity 不一致、任何轨道 deep import 或 `GOAL.md` 出现 diff 时，停止合并并修正边界。

### 9.3 最终不变量

七轨可以并行，但共享 contract/gate 与 Tower workflow runtime 不单独成轨；默认 runtime 是 v2，v1 仅 legacy compatibility/rollback；`[subagent]` preset 是唯一正式 model route 控制面，workflow 只引用语义 route；唯一 control tower 和 tool-enforced scope/review/merge gate 不可绕过；template 与 `.tower/` runtime state 分离；`apps/kimi-web` 是唯一 Web production source，`dist-web` 只能由 canonical command 生成并由 schema v5 source/recipe/bundle provenance 与 native receipt 绑定，回滚必须恢复整套 identity；手机首期只有 responsive Web/PWA；production source cutover 不表示手机远程或 standalone 部署已完成；生产远程只有 `/api/v1` REST/WS + transcript；AITP 只有可选 CLI + files adapter；D 不依赖 C；E 不拥有业务 schema 或 workflow runtime；Goal 能力保留，`GoalFeature` 只能在 P0–P3 后最后单独评估；DeepSeek 专属 wire 语义只在 adapter 层，GPT/Kimi 路径保持 dialect-free；**研究层实现以 hakimi v2 为唯一默认场，DSH 仅为机制参考上游、不承载研究资产，DSH 重新入选需走平台评审**。所有轨道都必须通过公开 contract、event、config contribution、klient/SDK、REST/WS 或明确 adapter 集成。
