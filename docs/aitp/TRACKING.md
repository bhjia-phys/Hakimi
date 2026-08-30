# AITP 状态跟踪与交接清单

## 状态跟踪表

| 核对日期 | AITP HEAD | active stage | 备注 |
|---|---|---|---|
| 2026-08-08 | `8658f6827288f4bb61e5c193a346f0f73ebbe3b2` | M0.6（in progress） | M0/M0.5 done；M1a–M4 blocked。AITP 侧已拍板：prepare/save 按 version-0 契约（不版本化），`enter-0.2` 是第一个版本化契约点；**H0 无 AITP 前置阻塞，可立即实施** |
| 2026-08-14 | `9f9e873440b8d88bfbb2963d8b5717c83b9ef4cc` | M1c（done；deterministic gate passed） | 工作树 clean（除刻意未跟踪 `ref/`、`uv.lock`）。M0.6 以缩小声明关闭；M1a、M1b-R1、M1c 全部 done 且 deterministic gate passed（107 tests）。`list`/`show`/`check` 已 shipped 可 feature-detect；M1c 增加单次 `--workstream` 作用域投影（`enter-0.3`/`list-0.2`）与 repeatable prepare flag。`lineage` 仍 deferred；M2–M4 仍 blocked |
| 2026-08-21 | `2425845063b56852a04abb2fd2f8273b2f30d014` | M1e（done；deterministic gate passed） | committed HEAD/base 是 0.7.0；working tree 有 0.8 Skill-only 草稿（`distilling-methods/SKILL.md`），已把发布面 bump 到 0.8.0（未 commit——无 release commit，0.8.0 不是正式发布版本）。M1a、M1b-R1、M1c、M1d、M1e 全部 done 且 deterministic gate passed（154 tests，committed HEAD 0.7.0）。M1d 增加 scoped `check`（`check-report-0.2`，仅单次 `--workstream`）；M1e 增加 `backfill` 命令（`backfill-0.1`）、`sha256-once:` pin 与 check-policy.json。AITP 0.8 Skill-only amendment（未 release commit）定义 `method-observation` marker、两步 human decision、platform tool/card/Skill 三层——不改 CLI/schema。Hakimi native adapter（H0–H5）未实现；H6/C6 native distillation orchestration planned，unavailable。`lineage` 仍 deferred；M2–M4 仍 blocked |
| 2026-08-23 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（done；deterministic gate passed） | committed HEAD 是 0.8.0——Skill-only amendment 已 commit（`method-observation` marker、两步 human decision、platform tool/card/Skill 三层）。M1a、M1b-R1、M1c、M1d、M1e 全部 done 且 deterministic gate passed（154 tests）。**Hakimi adapter 的 H0–H4 已实现，H5 仅部分集成**，受 flag `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`（默认关闭）门控：strict contract discovery、Python probe、`enter`/`list`/`show`/`check` 读侧消费、`record`/`note prepare|save` 写入门控、scoped `--workstream`、M1e check finding code opaque projection（不实现 backfill/sha256-once/check-policy 语义）、Research state（Question/Line/Focus、三轴问题模型、revision steering、pending checkpoint barrier、Goal complete guard）、mode/loop/Question/Focus/checkpoint 的单一完整 snapshot push、active step 的语义状态维护 guidance、protocol/node-sdk/kap-server/klient 表面、TUI `/research` Board/manager 与 stale-hydrate 防护。`/research on` 只激活 capability 和 Board，不调度模型 turn；Goal 仍是跨 turn continuation 的唯一 owner。设置 flag 开启后才开放 `/research` 与 `EnterAITPMode` 入口，进入模式仍需 `/research on` 或模型入口，inactive 零 AITP I/O。flag off 时（`=0` 或 `/experiments`）所有 AITP 工具、skill 和 Board 隐藏，零 AITP I/O。不自动 init/adopt/inventory/backfill apply；backfill 不作为模型工具暴露。typed question/line registry、literature/compute/Portfolio、H6 未实现。`lineage` 仍 deferred；M2–M4 仍 blocked |
| 2026-08-24 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（done；Hakimi adapter contract correction） | 逐命令复核 managed 0.8 `aitp.contract.json` 与实际 `--help`，未修改 AITP 仓库。Hakimi adapter 修正为严格消费 `enter-0.2/0.3`、`list-0.1/0.2`、`show-0.1`、`check-report-0.1/0.2` 和 version-0 prepare/save envelope；`check` exit 1 作为 findings 报告而非工具失败，stdout exit-2 错误保留 `code/message`，argparse misuse 不再误称整个 adapter degraded；record/Note argv、合法 Entry kind 与 checkpoint error/warning 语义与官方契约对齐。Research guidance 同时禁止用直接 Markdown 读取模拟失败的 `show`，并明确 Research Line 与 AITP workstream 不做静默别名映射；合法 findings（包括 error）不会把 current-state receipt 错报为 degraded。 |
| 2026-08-25 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（done；Hakimi current-state maintenance） | 未修改 AITP 仓库。Hakimi 在 adapter probe ready 后的 mode entry、active undo/cold restore 后，以及 active、admitted 的 Goal continuation turn 在 Research state 发生变化后的 turn end，只读执行 `enter` → `check`；这不是 session-end automatic closeout。maintenance receipt 和 context injection 只暴露安全摘要，完整 Research snapshot/API 或 expanded Board 仍可能包含 checkpoint、revision 和 adapter health 字段。合法的 check findings（包括 error finding）保持 ready；只有周期不可用或无效时显示 degraded。error finding 仍可按具体 checkpoint 的保存屏障阻止提交。不会自动 init/adopt/backfill，也不会自动写 semantic handoff、Entry 或 Note；该 coordinator 不实现 H6 native method-distillation。degraded active Research Mode 会阻止 AITP writes 和 Goal completion，未解决 human gate 也会阻止 Goal completion，但本地 Question/Line mutation 仍可能发生。 |
| 2026-08-27 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（done；Hakimi barrier/alert hardening） | 未修改 AITP 仓库。Hakimi checkpoint 现在保留具体 Entry ID、prepare/save receipt、pre-save baseline 与 post-save check；canonical `record prepare` 的 `existing` 命中按已保存 Entry 处理，draft 命中仍要求 `record save`。commit 前必须通过 active `show` 与 scoped `check`；旧 error 只记录为 pre-existing warning，新 error 或无法建立 baseline 时 fail closed。Research alerts 使用稳定 fingerprint 并保留 cleared history，区分 active blocker、historical unresolved、superseded retry 和 warning。官方六个 0.8.0 fixture 的 parser/contract tests 通过；Research public contract 现在同步 typed evidence review 与 action-bound run observation；仍没有 live AITP CLI subprocess conformance 证据。run observation 只记录外部 scheduler 观察，不提交、不轮询、不创建 campaign。 |

| 2026-08-28 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（AITP 外部事实未重验；Hakimi Web UI/cutover） | 本次未访问外部 AITP checkout，因此 HEAD、0.8.0、CLI/schema/gate 和 154 tests 原值不变，不形成新的 AITP 侧核验。Hakimi Web 已接通实验性 Research UI：TUI/Web `/research`；live Board 投影 scientific phase、latest progress、current action/run、effective next step、human gate 与 active alerts；line-first Manager 的 Science 区可 resolve decision、acknowledge alert、review evidence 和 observe run；stale refresh 与显式已有 AITP `entryId` checkpoint linking 保持 fail closed，Web 不写 AITP。`apps/kimi-web` production source cutover 已完成，schema v5 provenance 绑定 source、recipe files、实际 canonical Node/pnpm 与 bundle，v4 native receipt 再直接绑定 toolchain 和 binary hash。H5 仍仅部分集成，H6 仍 planned、unavailable。 |

2026-08-27 Hakimi Research Loop 收敛：模型正常行动路径改为 `BeginResearchAction` → 科研工作 → `ConcludeResearchAction`；后者由现有 Research service 在单一 transition 边界内记录 action completion 和科学 progress。`PlanResearchAction`、`CompleteResearchAction`、`SetResearchPhase` 保留为恢复/维护实现但不再进入 active tool overlay；没有新增 AITP schema、wire op、REST command 或自动 HPC 行为。相关 service/tool tests 通过；live AITP CLI subprocess conformance 仍 pending。

| 2026-08-28 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（done；Research contract/domain pack fusion） | Hakimi 将 Goal completion/continuation 通过通用 contribution seam 与 Research Loop 解耦，Research context 改为 Brief/Delta，committed AITP fact 通过 facade 隔离；抽出协议无关的 Research 类型、evidence packet 和 transition authority，并新增可选 `theory-physics` domain pack。Research 是长生命周期科研上下文，Plan 是可嵌套的短生命周期 overlay；二者可以同时 active，Plan 不会退出或重置 Research。该 pack 只提供理论物理行动路由、推导/数值证据检查和 science-first reporting，不改变 AITP schema，不提供文献库、scheduler observer 或 method distillation。
| 2026-08-29 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（live CLI smoke verified） | 使用真实 managed AITP 0.8.0 CLI 在一次性 scratch store 验证 `enter`/`check`（scoped，check exit 1 findings）、`record prepare`/`record save`、`note prepare`/`note save`、`show`/`list`、重复 idempotency prepare（`existing`）和最终 clean check。此前 fixture-only 证据已补充为实际 CLI 子进程证据；完整跨平台及异常矩阵仍 pending。 |
| 2026-08-29 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | Hakimi capability graduation（未修改 AITP 仓库） | Codex OAuth 与 AITP Research Mode 的入口默认可发现；旧两个 experimental env/config keys 与 master flag 对它们均 inert no-op，`--enable-experimental` 为 deprecated no-op。新 session 初始为 inactive；hydration 保留已持久化的 mode，inactive hydration/GET/SDK read 不做 AITP I/O；持久化为 active 的 session 在 cold restore 后仍保持 active，并重新 probe/maintenance。显式 `enter_mode`/`/research on` 才 probe；active、admitted 的 Goal continuation turn 在 Research state 发生变化后的 turn end 也执行只读 maintenance。Wire/REST/SDK/AITP transport schema 与 checkpoint barrier 未改变。H0–H4 为 implemented-in-code，H5 仍 partial，H6b method distillation 为 planned/unavailable，完整跨平台及异常矩阵 conformance-pending。 |

每次核对后：追加一行，并更新 `compatibility-matrix.md` 中变化的行与双语 README。

## 开发前核对 checklist（每次 AITP 相关开发必做）

1. [ ] AITP 开发仓库 `git rev-parse HEAD` 与 `git status --short`（注意既有未跟踪 `ref/`、`uv.lock`，勿触碰）。
2. [ ] `aitp --help` 确认实际 CLI 面；对照 `docs/roadmap.md` stage 状态表。
3. [ ] 核对 AITP `docs/hakimi/`（对方交接文档）是否有新决策或矩阵变化。
4. [ ] 确认涉及的命令/schema 是否 available；blocked 的一律不调用、不写 available。
5. [ ] 核对官方 fixtures 位置（`tests/ledger/fixtures/`、`suite/`）；需要 golden 时优先用官方，不用 planning examples。
6. [ ] 确认 FROZEN v6 约束是否仍生效（M0.6 scored run 前不得改冻结输入）。
7. [ ] 改动影响兼容性时：同 change 更新 `docs/aitp/`（本目录）+ 双语 README。

## 双方待办

### AITP 侧（状态见 AITP `docs/hakimi/`）

- [x] M0.6：以 2026-08-10 缩小声明关闭（原始 bootstrap/评分证据未测量，deferred，不计入）。
- [x] M1a：`aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1` + golden fixtures；deterministic gate passed。
- [x] M1b-R1：`check` v0.1-only + compact `enter` 文本；deterministic gate passed；B/C–E/Followup 2/6 deferred。
- [x] M1c：workstreams（作用域投影 + repeatable prepare flag）；deterministic gate passed（107 tests）。
- [x] M1d：scoped `check` workstream health（`check-report-0.2`，单次 `--workstream`，admitted in-scope 计数、`by_code`/`outside_scope`）；deterministic gate passed。
- [x] M1e：evidence lifecycle + reviewed backfill（`sha256-once:` pin、`backfill` 命令、check-policy.json）；deterministic gate passed（154 tests，committed HEAD 0.8.0）。
- [ ] M2–M4：各自 natural-demand 证据未出现，blocked 设计选项；`lineage`/`lite-entry-0.2`/`run-pointer` 保持 deferred。
- [x] AITP 0.8 Skill-only amendment：`method-observation` marker、两步 human decision（approval + publication）、platform tool/card/Skill 三层。**已 commit**（HEAD `eae1bce5…`），不改 CLI/schema/transport。
- [ ] （已决策）prepare/save 不版本化；如未来硬化需 documented spec revision/addendum。

### Hakimi 侧

- [x] **H0（implemented-in-code）**：`features/aitpResearch/` adapter 骨架——launcher（argv-only、Python ≥ 3.11 探测）、version-0 严格 shape 校验、capability 探测、`enter` lifecycle、prepare→save 流程、`not_initialized` 优雅降级、tree-hash 零写入测试。
- [x] D 轨 research loop foundation（Research Frame / Question Board / bounded checkpoints）——不依赖 AITP，可并行。
- [x] H1（M1a gate 已通过，implemented-in-code）：feature-detect 并消费 `enter-0.2`/`list-0.1`/`show-0.1`；当前状态维护不是 closeout-first，也不是 session-end closeout。官方 0.8.0 六个 golden fixtures 仅用于本地 parser/contract 兼容测试，不启动 live CLI subprocess。
- [x] H2（M1b-R1 gate 已通过，implemented-in-code）：只整合 R1 实际发布的 `check`（`check-report-0.1`，exit 0/1 报告、exit 2 错误包）；`lite-entry-0.2` 关系、typed resolution、派生 `used_by`、pointer bundle 均未发布（deferred），不得安排。
- [x] H3（M1c gate 已通过，implemented-in-code）：整合 scoped contracts——仅传入单次 `--workstream <slug>` 时 feature-detect `enter-0.3`/`list-0.2`（additive `workstream` key、严格 exact membership、relation 先全局计算）；无 flag 时保持旧 schema。
- [x] H4（M1d gate 已通过，implemented-in-code）：整合 scoped `check`——仅传入单次 `--workstream <slug>` 时 feature-detect `check-report-0.2`（admitted in-scope 计数、`by_code`/`outside_scope`，四行文本仅人阅）；无 flag 时 `check-report-0.1` 字节不变。
- H5（M1e gate 已通过，部分集成）：AITP upstream 已 shipped `backfill-0.1`、`sha256-once:` 与 policy 语义；Hakimi adapter 只把 check finding code 作为 opaque string 投影，不暴露、不调用、不解析 backfill 成功 envelope，也不实现这些语义；完整 conformance 仍 pending。
- [x] Web UI：`/research`、live Board、line-first 表单 Manager、`probing`/`degraded`、stale refresh 与显式已有 AITP `entryId` checkpoint linking 已接通；Web 不调用 AITP write CLI，也不写 canonical files。
- [ ] H6b（planned，unavailable）：native method-distillation orchestration——Session-scope coordinator、candidate/proposal lifecycle、human question + decision write、crash/resume。前置：H0–H5 全部落地 + reviewed adapter-contract extension。详见 [`method-distillation-orchestration.md`](method-distillation-orchestration.md)。

## 解阻链

`M0.6（缩小声明关闭）` → `M1a gate（passed）` → `M1b-R1 gate（passed）` → `M1c gate（passed）` → `M1d gate（passed）` → `M1e gate（passed）` → `M2–M4（自然需求证据，blocked）`。

- H0：**implemented-in-code**，无 AITP 前置（无需 AITP change）。
- H1：M1a gate 已通过，feature-detect `enter-0.2`/`list-0.1`/`show-0.1`。**implemented-in-code**。
- H2：M1b-R1 gate 已通过，只可消费 `check-report-0.1`；其余 deferred。**implemented-in-code**。
- H3：M1c gate 已通过，可整合 scoped contracts（单次 `--workstream`）。**implemented-in-code**。
- H4：M1d gate 已通过，可整合 scoped `check`（`check-report-0.2`）。**implemented-in-code**。
- H5：M1e gate 已通过，但 Hakimi 仅部分集成：只投影 check finding code 的 opaque string，不暴露、不调用、不解析 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:`/policy 语义；完整 conformance 仍 pending。
- H6b：**planned，unavailable**。前置：H0–H5 全部落地 + reviewed
  adapter-contract extension 冻结 marker discovery/exact-card trial/
  decision receipt semantics。
- 正式 Hakimi contract：等 M4 后 AITP versioned JSON + extended golden fixtures。

2026-08-30 audit：重新核对 AITP HEAD `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`；其工作树已有用户未提交变化，本次在其基础上最小同步并完整保留。双方 handoff 已按 Hakimi 2026-08-29 状态对齐；未改 AITP CLI/schema/stage，M2–M4 仍为 blocked 设计选项，Method card 的 Skill/Note 层与 Hakimi/external adapter 的平台执行边界保持不变。

2026-08-30 Research/Goal continuation 修正：Board 和模型注入现在区分 AITP Topic `Research goal` 与当前 `Goal milestone`；`auto` 下的常规 scope 内 Research Action 不再创建独立 approval gate，旧 action-linked approval 在恢复时以 standing auto authorization 记录并继续，review/decision gate 不自动解决；默认 v2 引擎上的 `/goal resume` 直接唤醒 Goal driver，不再注入合成 User 消息，legacy rollback 保留原兼容路径。本次未改 AITP CLI/schema/stage/H5/H6b 状态。
