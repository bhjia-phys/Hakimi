# AITP integration handoff

Cross-repository handoff 的单一入口：Hakimi（agent 编排、工具调用、交互体验）
与 AITP（协议、持久化、证据权威）。本目录是 Hakimi 侧基线；AITP 侧的对应
交接文档位于 AITP 仓库的 `docs/hakimi/`。任何 Hakimi 开发会话在构建或修改
AITP adapter 前应阅读两侧的交接文档；AITP stage/CLI/schema 状态变化时，
本目录必须同步更新。

- Baseline audit: **2026-08-08**，AITP HEAD
  `8658f6827288f4bb61e5c193a346f0f73ebbe3b2`。AITP 侧结论：**不需要 AITP
  plan change**——冻结的 M1a/M1b spec 已覆盖 Hakimi 全部集成需求；
  `record/note prepare|save` 按 version-0 契约处理（详见
  `compatibility-matrix.md` §3）。
- Current amendment: **2026-08-23**，重新核验 AITP HEAD
  `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`（committed HEAD 是
  0.8.0——Skill-only amendment 已 commit）。M0.6 以缩小
  声明关闭；M1a、M1b-R1、M1c、M1d、M1e 均 **done；deterministic gate
  passed**（154 tests）。Hakimi 可 feature-detect 读契约
  `enter-0.2`/`list-0.1`/`show-0.1`/`check-report-0.1`、M1c 作用域契约
  `enter-0.3`/`list-0.2`、M1d 作用域 check 契约 `check-report-0.2`（均仅
  单次 `--workstream`）；M1e 增加 `backfill` 命令与
  `sha256-once:` 可变观测 pin。AITP 0.8 是 **Skill-only amendment**（已
  commit），定义了 `method-observation` marker 候选、保守
  card/trial review、两步 human decision（approval + publication）和
  platform tool/card/Skill 三层边界——不改 CLI/schema/transport。**Hakimi adapter 的 H0–H4 已实现，H5 仅部分集成**；这反映 adapter 的实现边界，不是 Research Mode 入口的开关，也不是 H6b 可用性信号：strict contract discovery、Python probe、`enter`/`list`/`show`/`check` 读侧消费、
  `record`/`note prepare|save` 写入门控持久化、scoped `--workstream`
  读取/check、M1e check finding code 的 opaque projection（不实现 backfill/sha256-once/check-policy 语义）、Research state（Question/Line/Focus、
  三轴问题模型、revision-based human steering、pending checkpoint 与
  save+show+check barrier、Goal complete guard）、mode/loop/Question/Focus/
  checkpoint 的单一完整 snapshot push、active step 的语义状态维护 guidance、
  protocol/node-sdk/kap-server/klient 公开表面、TUI `/research` Board/manager
  与 stale-hydrate 防护均已实现。`/research` 与 `EnterAITPMode` 默认可发现；新 session 初始为 inactive，hydration 保留已持久化的 mode。inactive hydration/REST GET/SDK snapshot 读取只使用本地快照，不探测 AITP、不发生 AITP I/O，Board 和其他 Research/AITP 工具、plugin skill 保持隐藏；持久化为 active 的 session 在 cold restore 后仍保持 active，并重新 probe adapter、执行只读 `enter` → `check` maintenance。inactive session 只有显式 `/research on`、模型入口或 `enter_mode` 才会启动 probe；active undo/cold restore 也会重新 probe，ready probe 后只读执行 `enter` → `check`，不调度模型 turn；Goal 仍是跨 turn continuation 的唯一 owner。旧 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`、`[experimental].aitp_research_mode` 与 master flag 对该能力均 inert no-op；backfill 不作为模型工具暴露。
  当前状态维护也已接通：进入模式、active undo/cold restore（均在 ready probe 后），以及 active、admitted 的 Goal continuation turn 在 Research state 发生变化后的 turn end，都会只读执行 `enter` → `check`，不是 session-end automatic closeout。maintenance receipt 和 context injection 只暴露安全摘要；完整 Research snapshot/API 或 expanded Board 仍可能包含 checkpoint、revision 和 adapter health 字段。合法的 check findings（包括 error finding）保持 ready；只有周期不可用或无效时显示 degraded。error finding 仍可按具体 checkpoint 的保存屏障阻止提交；不会自动 init/adopt/backfill，也不会自动写 semantic handoff、Entry 或 Note。该 coordinator 不是 H6b native method-distillation orchestration。Checkpoint 还会保留 prepare/save/check receipt、具体 Entry ID 和 pre-save finding baseline；commit 前用 `show` + scoped `check` 验证，旧 error 只作为可审计 warning，新 error 才阻止提交。Research alerts 使用稳定 fingerprint，并区分 active blocker、historical unresolved、superseded retry 和 warning；清除记录保留在 snapshot 中但不再注入模型。Research Loop 还实现 typed child evidence packet 的 main-agent-only review（review 本身 zero-write）和绑定当前 action 的显式 run observation；正常有界行动路径是 `BeginResearchAction` → 科研工作 → `ConcludeResearchAction`，后者在一个 Research transition 中记录物理工作、结果、测试或推导、限制、主线影响和下一步，但不会自动更新问题 assessment 或写入 AITP。它不提交/轮询 HPC、不创建 campaign 实体，也不把 RUNNING 当作科学结论。完整的 scheduler observer、文献库和 method distillation 仍未实现。
  H6b/C6 native method-distillation orchestration 是 **planned，
  unavailable**。`lineage`/`lite-entry-0.2`/
  `run-pointer-0.1` 仍 deferred，M2–M4 blocked。
  alerts 和 generic human gate 已实现，但 candidate confirmation 不是 `SetResearchFocus` 的 runtime 强制 guard，`ResolveResearchDecision` 不会自动写入 AITP decision Entry。degraded active Research Mode 会阻止 AITP writes 和 Goal completion；未解决 human gate 也会阻止 Goal completion，但本地 Question/Line mutation 仍可能发生，当前没有 automatic session-closeout。
  Hakimi 的本地 parser/contract 测试使用已 commit 的官方 AITP 0.8.0 golden fixtures：`enter.json`、`enter-after-save.json`、`list.json`、`show.json`、`check.json`、`check-workstream.json`。此外，2026-08-29 已在一次性 scratch store 中用 managed AITP 0.8.0 CLI 完成真实子进程 smoke test，覆盖作用域 `enter`/`check`、`record` 与 `note` prepare/save、`show`/`list`、重复 prepare 复用和最终 clean check；完整跨平台及异常矩阵 conformance 仍待补齐。
- 完整兼容矩阵、假设核对与决策：
  [`compatibility-matrix.md`](compatibility-matrix.md)。
- AITP 状态跟踪与开发前核对清单：
  [`TRACKING.md`](TRACKING.md)（Hakimi 侧补充，AITP 侧无对应文件）。
- Native method-distillation orchestration 设计：
  [`method-distillation-orchestration.md`](method-distillation-orchestration.md)
  （基于真实 v2 scope/Feature seam 的分阶段规划，尚未实现）。

## 职责边界（双方已确认；使用前重新核对）

- AITP = 协议、持久化、证据权威。接口是 **CLI + files**；无 SDK、API server、
  MCP server、daemon、vector service。
- Hakimi = agent 编排、工具调用、web 检索、PDF 阅读、推理、私有缓存。理论物理领域规程通过可选的 `theory-physics` plugin 提供；它只约束通用 Research Loop 的行动路由、推导/数值证据检查和人类交互，不创建第二套 runtime、账本、文献库或 HPC observer。
  私有缓存**永不写回** AITP。
- Hakimi 不复制 AITP runtime/parser/validator，不写 `.aitp` canonical 文件
  （`entries/`、`notes/`、`TOPIC.md`、`STORE.toml`），不绕过
  `record/note prepare|save`。AITP 0.8 的 `method-observation` marker 和
  method-card distillation 规则属于 AITP Skill 语义，Hakimi native
  coordinator（H6b/C6）若实现也不复制这些语义，只做编排和交互。

## 分阶段计划（Hakimi 侧；AITP 侧对应 roadmap gates）

| Phase | AITP 前置 | Hakimi 工作 |
|---|---|---|
| H0 | 现在（无 gate） | launcher adapter（argv-only、Python ≥ 3.11 探测）、未版本化 envelope 的严格 shape 校验、`--help` capability 探测、`enter` lifecycle、prepare→fill→save 流程、`not_initialized` 优雅降级、tree-hash 零写入测试 — **implemented-in-code** |
| H1 | M1a gate（已通过） | feature-detect `aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1` 并做 schema dispatch；Note-age 信号；当前状态维护不等于 session-end closeout；官方 0.8.0 fixtures 的本地 parser/contract 兼容测试，以及 2026-08-29 managed CLI scratch-store smoke test — **implemented-in-code；完整跨平台及异常矩阵 conformance-pending** |
| H2 | M1b-R1 gate（已通过） | 只整合 R1 实际发布的 `aitp check`（解析 `check-report-0.1`，exit 0/1 报告、exit 2 错误包）；`aitp/lite-entry-0.2`（`based_on`、typed closures）、派生 `used_by`、pointer bundle 均未发布（deferred），不得安排 — **implemented-in-code** |
| H3 | M1c gate（已通过） | 整合 M1c scoped contracts：仅传入单次 `--workstream <slug>` 时 feature-detect `aitp/enter-0.3`/`aitp/list-0.2`（严格 exact membership、relation 先全局计算）；无 flag 时保持旧 schema — **implemented-in-code** |
| H4 | M1d gate（已通过） | 整合 M1d scoped `check`：仅传入单次 `--workstream <slug>` 时 feature-detect `aitp/check-report-0.2`（0.1 payload + additive `workstream`/`counts.by_code`/`counts.outside_scope`；admitted in-scope 计数，不与 0.1 直接比较；scoped `clean` ≠ 全库健康；四行文本仅人阅）；无 flag 时 `check-report-0.1` 字节不变 — **implemented-in-code** |
| H5 | M1e gate（已通过） | AITP upstream 已 shipped `backfill` 与 `aitp/backfill-0.1`、`sha256-once:`/policy 语义；Hakimi adapter 仅把 check finding code 作为 opaque string 投影，不暴露、不调用、不解析 backfill 成功 envelope，也不实现这些语义 — **部分集成；conformance-pending** |
| H6b | reviewed adapter-contract extension（planned，尚未冻结） | native method-distillation orchestration：Session-scope coordinator、candidate/proposal lifecycle、human question + decision write、crash/resume；当前 **planned，unavailable**。详见 [`method-distillation-orchestration.md`](method-distillation-orchestration.md)。前置：H0–H5 全部落地 + reviewed adapter-contract extension 冻结 marker discovery/exact-card trial/decision receipt |
| 正式 Hakimi contract | M4 后 | versioned `--json` + extended golden fixtures 作为任何 agent 集成的 pass gate |

Hakimi 的 research-loop 能力（web/PDF/推理/session UX/私有缓存）独立于所有
AITP gates，可随时并行推进。

## 维护契约（binding）

以下任一变化必须在**同一 change** 更新本目录：

- stage 状态翻转（M0.6 gate、M1a gate、M1b gate、M1c/M1d/M1e slice gates、M2–M4）；
- CLI 面变化（新增/移除命令或 flag；`--help` 输出）；
- schema 状态变化（新冻结 payload/文件 schema、版本 bump）；
- Hakimi 侧集成发现改变矩阵行或红线。

同时同步根 `README.md` / `README.zh-CN.md` 的兼容状态段落（简版）。AITP
side 的对应维护契约在 AITP 仓库 `docs/hakimi/README.md`。

## 阅读顺序

1. AITP 仓库 `AGENTS.md`、`README.md`、`docs/roadmap.md`（stage 表、M1a、
   M1b、Hakimi contract）；
2. AITP 仓库 `docs/hakimi/compatibility-matrix.md`（对方侧决策与假设核对）；
3. 本目录 `compatibility-matrix.md` 与 `TRACKING.md`；
4. 本目录 `theory-research-agent-design.md`（设计备忘录；H0–H4 已实现，H5 部分集成，H6b 未实现）；
5. AITP `docs/archive/m1a-spec.md`、`docs/m1b-spec.md`、
   `docs/archive/m1c-workstreams-spec.md`、
   `docs/archive/m1d-workstream-health-spec.md`、
   `docs/archive/m1e-evidence-lifecycle-backfill-spec.md`、
   `docs/archive/collaborator-design.md`；
6. 已安装插件的 `skills/using-aitp/SKILL.md`（Python 探测顺序、命令表）；
7. AITP runtime：`plugins/aitp-research-protocol/scripts/aitp.py` +
   `scripts/vendor/aitp/`；
8. 本仓库 `AGENTS.md` / `README.md` / 架构代码（`packages/agent-core-v2/src/features/aitpResearch/`）。
