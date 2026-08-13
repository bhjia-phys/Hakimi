# Hakimi 七轨团队实施计划

状态：`active`。本文件是团队执行计划，不是产品路线图，也不是单个 package 的设计文档。根 `README.md` / `README.zh-CN.md` 描述产品方向；本文件描述 owner、边界、阶段、依赖和完成证据。`GOAL.md` 是 Goal mode 行为规格，保持原状，不在本计划中重写。

七条轨道固定如下；共享 contract/gate 由 F 推进，不单独成轨：

| 轨道 | 名称 | 主要 owner | 主要交付边界 |
|---|---|---|---|
| A | Web | 外部 code-app Web owner；Hakimi 负责 bundle 接收与 provenance | 桌面/浏览器 Web、`dist-web` 同步与来源证明 |
| B | 手机远程 | 远程产品与部署 owner | responsive Web/PWA 手机 shell、`kap-server` 远程部署、安全与恢复交互 |
| C | AITP 集成 | AITP adapter owner | CLI + files 的可选 adapter，以及 H0–H3 gate 兼容 |
| D | 内置 Hakimi Research Loop | Hakimi research domain owner | Research Frame、Research Question Board、bounded checkpoint、physics insight 与结构化 trace |
| E | UI 与设置 | UI/settings owner；业务 domain 仍拥有 schema | TUI、Web、mobile 的设置、状态展示、双语与可访问性 |
| F | 持续吸收 Kimi Code 上游与基础功能建设 | platform/engine owner | upstream intake、v2 canonical、共享 gate、release/CI 与基础能力；承接 P0/P1 |
| G | DeepSeek 专属适配与 DeepSeek Harness 吸收 | platform/engine owner | 专用 DeepSeek 适配器（kosong provider 层）；DSH intake（缓存纪律、请求组装、真 API 缓存 e2e）；`docs/dsh-intake/` 跟踪；不回归 GPT/Kimi |

---

## 0. 真实架构基线、边界与执行顺序

### 0.1 架构基线

- 默认 runtime 是 `agent-core-v2`：`packages/kap-server` 直接依赖 v2，CLI 默认通过 SDK/进程内 v2；只有显式 `KIMI_CODE_LEGACY_FLAG` 才走 v1。`packages/agent-core` 只保留 legacy compatibility，不是第二个默认 runtime。
- v2 Scope 固定为 `App → Workspace → Session → Agent`，定义在 `packages/agent-core-v2/src/app/scopes.ts`。App 没有 session lifecycle facade；按 id 查找 session 必须组合 `ISessionIndex → IWorkspaceLifecycleService.handlerFor → handler.ISessionLifecycleService`。
- Goal 仍由 `packages/agent-core-v2/src/agent/goal/` 的 Agent-scope `IAgentGoalService` 拥有；`src/features/plan/` 是现有 Feature 抽取，不代表 Goal 已迁到 `GoalFeature`。
- 调用路径是并列的：TUI → `packages/node-sdk` / 进程内 v2，native print → `apps/kimi-code/src/cli/v2/run-v2-print.ts` 直接使用 v2，Web → `packages/kap-server` REST/WS。`packages/transcript` 与 `packages/klient` 提供可复用 contract/facade，不构成强制线性层链。
- Web source 在外部 code-app 仓库；本仓只同步并提交 `apps/kimi-code/dist-web`。`apps/kimi-code/upstream-base.json` 只证明 CLI upstream commit，不证明 Web 来源。
- 手机首期是 responsive Web/PWA remote shell，不承诺 native app。生产远程只使用 `kap-server` `/api/v1` REST/WS + transcript；不得复活 generic `/api/v2` RPC、debug reflection 或 daemon。
- AITP 仍严格是 CLI + files。Hakimi 不复制 AITP runtime、parser、validator、canonical ledger 或 daemon，不创建 SDK/API/MCP server、vector service 或第二套 ledger；C 是可选 adapter，D 不依赖 C。
- DeepSeek Harness（deepseek-harness `main`）是参考上游，不是 merge upstream：只按机制移植（epoch 请求头、session 日志派生请求、缓存纪律、压缩设计、真 API 缓存 e2e），每项带 hakimi 自己的 contract/type/test 证据并过 F gate；DeepSeek 专属 wire 语义只存在于 kosong adapter/provider 层，核心与 GPT/Kimi 路径保持 dialect-free。
- **平台决策（2026-08-14 评审）：研究层（D/C 轨、研究循环、记忆集成）以 hakimi 为实现场；DSH 仅为机制参考上游。** DSH 曾作为研究层承载方评估并被否决——rc 级版本、README 明示 breaking changes、两月龄高频演进，尚不适合承载长期研究资产；可反转条件为 DSH 稳定 release 且 G2 跨 harness 基准给出明确优势（届时重新评审，不做默认迁移）。
- `apps/kimi-code` 通过 `@moonshot-ai/kimi-code-sdk` 消费 core 能力，不直接依赖 `@moonshot-ai/agent-core`。E 不拥有 provider、research、AITP、remote 等业务 schema。

### 0.2 执行顺序与并行规则

顺序固定为：**contract freeze → 核心正确性 → 公共边界 → Hakimi overlay → 最后评估 `GoalFeature`**。

当前开工顺序（平台决策 2026-08-14 后）：**F P0（前缀正确性）→ G1 缓存纪律（压缩后不重渲染 + `KIMI_NOW` 锚定）→ C/H0 AITP adapter → D0–D6 research loop → G0 专用 DeepSeek adapter 按需**。

F 先冻结 canonical matrix；随后完成 P0 核心正确性，再完成 P1 klient/SDK/REST/TUI 等公共边界，最后承接 P2 overlay 并接入 A–E。A–E 可在 gate 之间使用 frozen fixture、fake adapter 和 mock event 并行开发，但跨轨集成与 release 必须等待对应 F gate。

跨轨只使用稳定 contract、wire/event、transcript operation、`ConfigSectionContribution`、klient/SDK facade 或 REST/WS；禁止 deep import，尤其是 UI 直接 import engine service、A/B 直接 import D/C 内部实现、C 直接 import AITP runtime。业务 schema、默认值、校验和持久化由 domain owner 注册，UI 只消费 typed contract、状态与事件。

需要跨进程、远程恢复或 UI 更新的事实必须有可重放 event/wire/transcript projection；live、backfill、cold 必须收敛，旧 peer、断线、冷 session、未初始化 AITP 和关闭的实验 flag 都必须有明确 degraded contract，不得静默成功。

AITP 的 `list`、`show`、`check` 现已 shipped（M1a/M1b-R1 gate passed），必须先 feature-detect 版本化 schema 再调用，绝不模拟或从文档推导；对未安装或旧版本 AITP 按不存在处理。不得自动运行 `init`、`init --adopt` 或 `inventory`，不得直接写 canonical `.aitp` 文件。生产手机路径不能依赖 debug surface、未认证 reverse proxy、本地 canonical store 或 native engine。上游变更必须分类吸收而非机械同步；`GoalFeature` 在所有 shared gate 通过且不会产生第二个 Goal owner 前不迁移。

---

## 1. F 轨共享 gate（不单独成轨）

F 负责推进以下 gate，其他轨道消费其公开结果。

### 1.1 F0：canonical contract 与架构冻结

冻结供 v1 adapter、v2 engine、transcript、klient、REST、SDK、TUI、Web 和 mobile 共用的 matrix，至少包括：

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

- **P2.1 subagent routing：** 冻结 engine-neutral `agent|swarm` route、model/thinking precedence、explicit model、unknown alias 与 capability display contract，统一 `packages/agent-core/src/config/subagent-models.ts`、v2 `session/subagent/configSection.ts`、node-sdk mapper 和 agent/swarm tools 的 resolver；fixture 覆盖四层 precedence，v1 只作 adapter。
- **P2.2 Codex OAuth flag：** 以 v2 `app/kosongConfig/flag.ts` 的 `openai-codex-oauth` 为 canonical flag，在 auth service、token adapter 和 provider resolution gate；CLI/TUI 只传递结果，测试 flag off/on 的 login、provision、resolution、status/logout，默认 off。
- **P2.3 local web-search policy：** 由 v2 `webSearchService.ts` 与 `providers/local-web-search.ts` 统一 explicit config → managed OAuth → local fallback、endpoint、result cap 和 abort；v1 provider 只作 adapter，fixture 覆盖 credentials、HTTP/error、abort 和 tool error。
- **P2.4 session mirror：** 分开验收 v2 同一 home 的 derived read-model（metadata → mirror、evict-before-delete、drain）与 v1 `~/.kimi-code` 文件/symlink compatibility mirror；若启用跨 engine sharing，只增加单一 lifecycle adapter，不把 mirror 当 canonical store。
- **P2.5 Web provenance：** A 固化 `sync:web → branding patch → provenance check → native manifest/checksum`，记录 source repository/commit、patch/version、文件清单和 sha256；`dist-web` 缺失或 provenance 不完整时 packaging 失败。

每项都要有 parity/negative fixture、typecheck、static boundary 和 release evidence；P2 不通过删除 Goal、复制 runtime 或引入第二套 owner 来解决冲突。

---

## 2. A 轨：Web

### 2.1 owner 与边界

外部 code-app 拥有 Web source、页面和组件；本仓只接收 `apps/kimi-code/dist-web`。Hakimi 负责 bundle provenance、branding patch、serving 和 packaging，边界文件包括 `scripts/check-web-assets.mjs`、native Web asset manifest 与 `scripts/patch-web-branding.mjs`。A 消费 `/api/v1` REST/WS + transcript、klient/SDK、F 的 session/permission/config contract 及 D/E/C 的公开 projection，不 import v2 internals、AITP runtime 或 B 部署实现。

### 2.2 阶段交付

- **A0 source/contract freeze：** 与 code-app owner 冻结 artifact 输入、branding patch、提交边界、REST/WS/transcript contract，以 fake server/fixture 作为验收基线。
- **A1 Web shell：** 交付桌面/浏览器 session 创建恢复、transcript 和公开 Goal/Research/config projection；不复制业务 schema。
- **A2 provenance/packaging：** 让 sync、patch、provenance、native manifest/checksum 可重放，缺 source commit、清单或 hash 时失败。
- **A3 product integration：** 接入 approval/question、reconnect 和可选 domain status；旧 peer、冷 session、缺失能力显示 degraded。
- **A4 release：** 归档 bundle provenance、contract parity、serving/security、native integrity 和 artifact evidence。

### 2.3 依赖与验收

A 依赖 F0/F1/F2 的公开 contract、SDK/klient、transcript 和 release gate；消费 B 的 remote contract，但不消费部署内部实现。验收必须证明 source 未复制进本仓、`dist-web` provenance 可重放、Web 能处理 live/backfill/cold transcript 与 degraded state，并通过 import-boundary/static check。

---

## 3. B 轨：手机远程

### 3.1 owner 与边界

B 拥有手机 viewport 的 responsive layout、PWA manifest/install shell、触摸交互、网络状态、远程 approval/question 和部署安全。Web source 仍由外部 code-app/A 交付；B 负责 `kap-server` 生产 deployment boundary，包括 TLS、reverse proxy、认证授权、速率/来源限制、健康检查和安全日志。生产 client 只可用 `/api/v1` REST/WS + transcript；`/api/v1/debug/*` 即使保留也只能 loopback/dev-only。

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

C 只交付可选 AITP CLI + files adapter；未安装或未初始化 AITP 时，D 和 Hakimi 主路径必须正常运行并显示 degraded status。最后核验的 AITP HEAD 是 `9f9e873440b8d88bfbb2963d8b5717c83b9ef4cc`（2026-08-14，逐命令核对 `--help`）：M0/M0.5 complete；M0.6 implementation closed（缩小声明）；M1a、M1b-R1、M1c 均 done 且 deterministic gate passed（107 tests）。H0 可实施；H1/H2/H3 的 AITP 前置 gate 已全部通过（读契约可 feature-detect），但 Hakimi native structured adapter 尚未实现。`record/note prepare|save` 是严格 shape 的未版本化 version-0 response contract，未知 `status` fail closed；第一个 versioned transport 是 M1a 的 `aitp/enter-0.2`。

| Hakimi gate | AITP gate | 状态与计划 |
|---|---|---|
| H0 · 当前 CLI | M0/M0.6 | Skill 可手动调用 `init`、`enter`、`inventory`、`record/note prepare|save`；adapter 可开始实施，但不自动运行 `init`、`init --adopt` 或 `inventory`。 |
| H1 · 检索 | M1a（gate passed） | feature-detect 并消费 `enter-0.2`、`list-0.1`、`show-0.1` 官方 golden fixtures；AITP 侧已 shipped，adapter 待实现。 |
| H2 · 关系与诊断 | M1b-R1（gate passed） | 只消费 R1 实际发布的 `check-report-0.1`（exit 0/1 报告、exit 2 错误包）；`lite-entry-0.2` relation、`used_by`、`run-pointer-0.1` 均 deferred，不安排。 |
| H3 · 科研记忆 | M1c（gate passed）；M2–M4 后 | 先整合 M1c scoped contracts（`enter-0.3`/`list-0.2`，仅单次 `--workstream`）；M2–M4 后消费 reviewed artifacts、跨 Topic links 和 collaborator protocol。 |

当前持久化 `aitp/lite-entry-0.1` / `aitp/lite-note-0.1` 标识 AITP 文件，不是 CLI response envelope；读契约 `enter-0.2`/`list-0.1`/`show-0.1`/`check-report-0.1` 与 M1c 作用域契约 `enter-0.3`/`list-0.2` 已 shipped，可 feature-detect；不存在 `aitp/enter-0.1`、`aitp search`、`aitp --version`，`lineage` 仍 deferred。详细矩阵见 [`docs/aitp/`](docs/aitp/)。任何 status、command、schema、launcher 或 Skill discovery 变化都要先核验外部 AITP `--help`、schema、official fixtures 和双方 handoff，再更新本文件与双语 README；不得把规划写成 available。

### 4.2 边界与阶段

- **Owner/boundary：** C 的 adapter 由 AITP domain owner 实现，首选 v2 Feature/config/command/service contribution seam，例如 `packages/agent-core-v2/src/features/aitp/`；不得从 UI/server deep import。launcher 只调用外部 plugin 的 `scripts/aitp.py`，按 Skill 规则探测 Python ≥3.11。
- **C0/H0：** version-0 envelope strict shape、`--help` capability、`enter` lifecycle、prepare→fill→save、`not_initialized` degrade、tree-hash zero-write 和 flag gate。
- **C1/H1：** M1a 后 feature-detect 并消费 `enter/list/show` versioned contract 与 golden fixtures，提供 closeout-first recovery 和 Note-age signal；gate 前不调用或模拟。
- **C2/H2：** M1b-R1 后只消费实际发布的 check report（`check-report-0.1`，exit 0/1 报告、exit 2 错误包）；relation、typed resolution、`used_by`、run pointer 均未发布（deferred），不纳入；所有 pointer projection 只读。
- **C3/H3：** M1c 后先整合 scoped contracts（仅单次 `--workstream <slug>` 时 feature-detect `enter-0.3`/`list-0.2`，严格 exact membership、relation 先全局计算）；M2–M4 后按 gate 顺序消费 reviewed artifacts、cross-topic links 和 Skill collaborator protocol；正式 compatibility 以 versioned JSON + official fixtures 为准。
- **C4 maintenance：** 每次外部变化重跑 launcher、capability、shape、fixture、tree-hash 和 degraded tests。

C 依赖 F 的 flag、session、event、klient/SDK 和 release boundary；A/B/E 只消费 capability/status projection，D 先产生 ephemeral trace，只有用户显式启用且通过 prepare/save/write gate 才写入 AITP。C 永不写 `.aitp` canonical files、第二 index、private cache/transcript/CoT 或第二 ledger；安装的 AITP 缺少对应命令（未安装或旧版本）时必须返回 absent/blocked，而不是模拟。

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
- **D6 research trajectory（科研过程轨迹）：** 以公开 wire/transcript projection 维护一条可重放的科研过程线——question → literature → hypothesis/derivation → numerics → evidence → decision——在 turn 边界折叠注入上下文，使模型清晰知道"已做了什么、处于哪个阶段、下一步缺口"；C 轨启用时轨迹节点与 `record`/`note prepare|save` 一一映射，沉淀为 research memory；不展示 raw hidden chain-of-thought。

D 消费 F 的 Goal/Todo/session/subagent/tool/permission/transcript contract，不改变 Goal owner、不绕过 Todo、不复制 route/provider policy。A/B/E 消费公开 projection；C 是可选 persistence consumer。验收覆盖职责分离、hard ceiling、并发去重、五类视角、physics checks、live/backfill/cold replay、无 AITP、flag off、provider 不可用和超预算的 degraded path。

---

## 6. E 轨：UI 与设置

### 6.1 owner 与边界

E 拥有 TUI、桌面/浏览器 Web 和 mobile 的 information architecture、settings navigation、form/presentation、validation display、loading/error/degraded state、双语和 accessibility behavior；不拥有 provider/model/subagent/research/AITP/remote 的 schema、状态机、权限或持久化。domain owner 通过 v2 `ConfigSectionContribution`、wire/event 和公开 service contract 提供 schema、defaults、capability、validation 和 mutation，E 只通过 klient/SDK、REST/WS 和 typed events 消费。

TUI 遵守 `apps/kimi-code/src/tui` 的 coordinator/controller/component/reverse-rpc 边界；component 不直接调用 SDK 或读写 session state。Web source 与手机 responsive 行为分别由 A/B 负责，E 负责设置体验 contract 和跨 surface 语义。

### 6.2 阶段交付与依赖

- **E0 schema ownership matrix：** 为 provider、model、subagent preset、research、AITP、remote status 固定 owner、scope、contract、mutation、event、default/degraded 和 consumer，删除或拒绝 dead/no-op fields。
- **E1 TUI settings：** 在现有 settings/dialog/selector/controller 中交付 provider、model、preset、实验 flag、权限、错误和 status 体验。
- **E2 Web/mobile settings：** A/B 消费同一 typed settings/status contract，只改变布局、输入方式和信息密度，不改变字段、默认值、校验或 wire semantics。
- **E3 domain status：** 展示 Research Frame/Board/checkpoint、AITP capability/not_initialized/gate、remote auth/connection/pending/catch-up，并可追溯到 event/REST/WS。
- **E4 parity/accessibility：** 验证 locale、keyboard/focus、screen reader、contrast、touch target、窄屏和错误/加载/空状态。

E 依赖 F 的 config registry、manifest、klient/SDK、events、permission 和 transcript 基础，消费 A–D projection；UI 不能为业务 schema、默认值、校验、Goal/Research/AITP parser、transcript reducer 或 reconnect state machine 建第二实现。验收包括 memory/IPC/REST/WS conformance、import boundary 和 C 未安装、D off、B 未连接、A artifact 缺失、F contract 旧版本时的明确 degraded state。

---

## 7. F 轨：持续吸收 Kimi Code 上游与基础功能建设

### 7.1 owner 与边界

F 是 platform/engine owner：`packages/agent-core-v2` 拥有 App/Workspace/Session/Agent scopes、services、features、config/wire/tool/profile/command contributions；`packages/agent-core` 仅作 legacy adapter。`packages/transcript` 是 transcript contract、op-batch 和 reducer 的 sole owner；`packages/klient` 是 typed facade；`packages/node-sdk`、`packages/kap-server` 是 public transport；生产远程 surface 固定为 `/api/v1` REST/WS + transcript。

F 还拥有 CLI/TUI/native print 基础、upstream intake、release/CI、security/performance 和 shared gate，但不拥有外部 Web source、B deployment config、C AITP runtime、D research semantics 或 E UI schema。每个 upstream window 要记录 base commit，并把变更分类为直接吸收、v2 adapter、legacy-only、overlay conflict 或拒绝；`upstream-base.json` 不替代 Web provenance。

### 7.2 阶段交付

- **F0 upstream/contract intake：** 维护 `upstream/main=01c74e937` 架构基线、canonical matrix、冲突处理、fixture 更新和 rollback 说明，对应 §1.1。
- **F1 core correctness：** 按 §1.2 完成 prompt→Goal blocked、explicit profile 单一 ownership、`/prompts` dead fields 和 transcript consistency。
- **F2 public boundaries：** 按 §1.3 完成 klient、SDK/TUI/REST forwarding、resume、native print 和 dynamic tool exposure。
- **F3 overlay：** 按 §1.4 完成 P2.1–P2.4，并消费 A 的 P2.5 provenance；保持 provider/model/auth/tools/session/SDK/transcript/permission 的 v2 parity、legacy adapter 和 error/degraded semantics。
- **F4 continuous sync：** 每个窗口运行 contract/type/test/static import/security/performance checks，分类吸收 provider、auth、tools、session、transcript、permission、CLI/TUI、protocol 变化，避免重新引入 v1 default、raw escape hatch、no-op fields 或重复 owner。
- **F5 release/CI：** 维护 build、typecheck、unit/integration/e2e、bundle/native packaging、provenance、security scan、性能、observability、release 和 rollback；A–E artifact 必须进入可重放 evidence。
- **F6 final `GoalFeature` evaluation：** P0/P1/P2 前 Goal 保持在 `packages/agent-core-v2/src/agent/goal/`；只有 Feature seams 能单一承载 contract、tool、wire/persistence、telemetry、permission、transcript 和 facade，且无第二 owner，才写迁移方案并单独评审。

F 消费 upstream 与其他轨道的 provenance、安全、compatibility、trace 和 accessibility evidence，向 A–E 提供 canonical contract、event、config contribution、facade、session/transcript、permission 和 release boundary。验收必须证明 v2 是唯一默认语义源、没有 raw `engineAccessor`、重复 explicit producer、重复 transcript owner、第二 ledger 或生产 debug/API v2/daemon 路径，并能在可选能力缺失时构建且报告 degraded status。

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

- 两个 domain 同时拥有 schema、状态机、transcript projection 或持久化时，停止集成并回到 F0，不用 merge 顺序或 UI adapter 掩盖冲突。
- gate 依赖不存在的 AITP command/schema、未提交的 code-app source、未冻结的远程协议或未核验的 upstream 行为时，停止该集成，保留 degraded/fake path，不猜测未来 contract。
- live/backfill/cold、resume、approval/question、reconnect 或 Goal 状态不能收敛时，停止 release，先补 shared transcript/contract evidence。
- 安全边界依赖 debug reflection、generic `/api/v2`、daemon、未认证 proxy 或手机本地 canonical store 时，停止远程发布并回到 B0/F0。
- DeepSeek 专属 wire 语义泄漏进核心层、DSH 机制移植缺少 hakimi 自身测试、或 intake 未记录 DSH HEAD/决策时，停止吸收并回到 G0/F0。
- 发现 D 依赖 C、E 拥有业务 schema、A 搬回 Web source、任何轨道 deep import 或 `GOAL.md` 出现 diff 时，停止合并并修正边界。

### 9.3 最终不变量

七轨可以并行，但共享 contract/gate 不单独成轨；默认 runtime 是 v2，v1 仅 legacy；Web source 留在外部 code-app，本仓只提交带 provenance 的 `dist-web`；手机首期只有 responsive Web/PWA；生产远程只有 `/api/v1` REST/WS + transcript；AITP 只有可选 CLI + files adapter；D 不依赖 C；E 不拥有业务 schema；Goal 能力保留，`GoalFeature` 只能在最后单独评估；DeepSeek 专属 wire 语义只在 adapter 层，GPT/Kimi 路径保持 dialect-free；**研究层实现以 hakimi v2 为唯一默认场，DSH 仅为机制参考上游、不承载研究资产，DSH 重新入选需走平台评审**。所有轨道都必须通过公开 contract、event、config contribution、klient/SDK、REST/WS 或明确 adapter 集成。
