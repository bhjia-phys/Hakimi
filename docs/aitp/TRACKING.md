# AITP 状态跟踪与交接清单

## 状态跟踪表

| 核对日期 | AITP HEAD | active stage | 备注 |
|---|---|---|---|
| 2026-08-08 | `8658f6827288f4bb61e5c193a346f0f73ebbe3b2` | M0.6（in progress） | M0/M0.5 done；M1a–M4 blocked。AITP 侧已拍板：prepare/save 按 version-0 契约（不版本化），`enter-0.2` 是第一个版本化契约点；**H0 无 AITP 前置阻塞，可立即实施** |
| 2026-08-14 | `9f9e873440b8d88bfbb2963d8b5717c83b9ef4cc` | M1c（done；deterministic gate passed） | 工作树 clean（除刻意未跟踪 `ref/`、`uv.lock`）。M0.6 以缩小声明关闭；M1a、M1b-R1、M1c 全部 done 且 deterministic gate passed（107 tests）。`list`/`show`/`check` 已 shipped 可 feature-detect；M1c 增加单次 `--workstream` 作用域投影（`enter-0.3`/`list-0.2`）与 repeatable prepare flag。`lineage` 仍 deferred；M2–M4 仍 blocked |
| 2026-08-21 | `2425845063b56852a04abb2fd2f8273b2f30d014` | M1e（done；deterministic gate passed） | committed HEAD/base 是 0.7.0；working tree 有 0.8 Skill-only 草稿（`distilling-methods/SKILL.md`），已把发布面 bump 到 0.8.0（未 commit——无 release commit，0.8.0 不是正式发布版本）。M1a、M1b-R1、M1c、M1d、M1e 全部 done 且 deterministic gate passed（154 tests，committed HEAD 0.7.0）。M1d 增加 scoped `check`（`check-report-0.2`，仅单次 `--workstream`）；M1e 增加 `backfill` 命令（`backfill-0.1`）、`sha256-once:` pin 与 check-policy.json。AITP 0.8 Skill-only amendment（未 release commit）定义 `method-observation` marker、两步 human decision、platform tool/card/Skill 三层——不改 CLI/schema。Hakimi native adapter（H0–H5）未实现；H6/C6 native distillation orchestration planned，unavailable。`lineage` 仍 deferred；M2–M4 仍 blocked |
| 2026-08-23 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（done；deterministic gate passed） | committed HEAD 是 0.8.0——Skill-only amendment 已 commit（`method-observation` marker、两步 human decision、platform tool/card/Skill 三层）。M1a、M1b-R1、M1c、M1d、M1e 全部 done 且 deterministic gate passed（154 tests）。**Hakimi native adapter（H0–H5）首个实验性纵切片已实现**，受 flag `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`（默认开启）门控：strict contract discovery、Python probe、`enter`/`list`/`show`/`check` 读侧消费、`record`/`note prepare|save` 写入门控、scoped `--workstream`、M1e finding-code 兼容、Research state（Question/Line/Focus、三轴问题模型、revision steering、pending checkpoint barrier、Goal complete guard）、mode/loop/Question/Focus/checkpoint 的单一完整 snapshot push、active step 的语义状态维护 guidance、protocol/node-sdk/kap-server/klient 表面、TUI `/research` Board/manager 与 stale-hydrate 防护。`/research on` 只激活 capability 和 Board，不调度模型 turn；Goal 仍是跨 turn continuation 的唯一 owner。flag 开启时仅开放 `/research` 与 `EnterAITPMode` 入口，进入模式仍需 `/research on` 或模型入口，inactive 零 AITP I/O。flag off 时（`=0` 或 `/experiments`）所有 AITP 工具、skill 和 Board 隐藏，零 AITP I/O。不自动 init/adopt/inventory/backfill apply；backfill 不作为模型工具暴露。typed question/line registry、literature/compute/Portfolio、H6 未实现。`lineage` 仍 deferred；M2–M4 仍 blocked |
| 2026-08-24 | `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` | M1e（done；Hakimi adapter contract correction） | 逐命令复核 managed 0.8 `aitp.contract.json` 与实际 `--help`，未修改 AITP 仓库。Hakimi adapter 修正为严格消费 `enter-0.2/0.3`、`list-0.1/0.2`、`show-0.1`、`check-report-0.1/0.2` 和 version-0 prepare/save envelope；`check` exit 1 作为 findings 报告而非工具失败，stdout exit-2 错误保留 `code/message`，argparse misuse 不再误称整个 adapter degraded；record/Note argv、合法 Entry kind 与 checkpoint error/warning 语义与官方契约对齐。Research guidance 同时禁止用直接 Markdown 读取模拟失败的 `show`，并明确 Research Line 与 AITP workstream 不做静默别名映射。 |

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
- [x] M1e：evidence lifecycle + reviewed backfill（`sha256-once:` pin、`backfill` 命令、check-policy.json）；deterministic gate passed（154 tests，committed HEAD 0.7.0）。
- [ ] M2–M4：各自 natural-demand 证据未出现，blocked 设计选项；`lineage`/`lite-entry-0.2`/`run-pointer` 保持 deferred。
- [ ] AITP 0.8 Skill-only amendment：`method-observation` marker、两步 human decision（approval + publication）、platform tool/card/Skill 三层。**已 commit**（HEAD `eae1bce5…`），不改 CLI/schema/transport。
- [ ] （已决策）prepare/save 不版本化；如未来硬化需 documented spec revision/addendum。

### Hakimi 侧

- [x] **H0（已实现，实验性，flag 门控，默认开启）**：`features/aitpResearch/` adapter 骨架——launcher（argv-only、Python ≥ 3.11 探测）、version-0 严格 shape 校验、capability 探测、`enter` lifecycle、prepare→save 流程、`not_initialized` 优雅降级、tree-hash 零写入测试；实验 flag 门控（默认开启，`=0` 可关闭）。
- [x] D 轨 research loop foundation（Research Frame / Question Board / bounded checkpoints）——不依赖 AITP，可并行。
- [x] H1（M1a gate 已通过）：feature-detect 并消费 `enter-0.2`/`list-0.1`/`show-0.1` + closeout-first 恢复 + golden fixtures 兼容测试。
- [x] H2（M1b-R1 gate 已通过）：只整合 R1 实际发布的 `check`（`check-report-0.1`，exit 0/1 报告、exit 2 错误包）；`lite-entry-0.2` 关系、typed resolution、派生 `used_by`、pointer bundle 均未发布（deferred），不得安排。
- [x] H3（M1c gate 已通过）：整合 scoped contracts——仅传入单次 `--workstream <slug>` 时 feature-detect `enter-0.3`/`list-0.2`（additive `workstream` key、严格 exact membership、relation 先全局计算）；无 flag 时保持旧 schema。
- [x] H4（M1d gate 已通过）：整合 scoped `check`——仅传入单次 `--workstream <slug>` 时 feature-detect `check-report-0.2`（admitted in-scope 计数、`by_code`/`outside_scope`，四行文本仅人阅）；无 flag 时 `check-report-0.1` 字节不变。
- [x] H5（M1e gate 已通过）：读取 `backfill-0.1` 成功 envelope 与 `sha256-once:`/policy finding codes（无 transport schema 变化）；`backfill` 不作为模型工具暴露，不自动 `--apply`。
- [ ] H6（planned，unavailable）：native method-distillation orchestration——Session-scope coordinator、candidate/proposal lifecycle、human question + decision write、crash/resume。前置：H0–H5 全部落地 + reviewed adapter-contract extension。详见 [`method-distillation-orchestration.md`](method-distillation-orchestration.md)。

## 解阻链

`M0.6（缩小声明关闭）` → `M1a gate（passed）` → `M1b-R1 gate（passed）` → `M1c gate（passed）` → `M1d gate（passed）` → `M1e gate（passed）` → `M2–M4（自然需求证据，blocked）`。

- H0：**无 AITP 前置**（无需 AITP change）。**已实现（实验性，flag 门控，默认开启）**。
- H1：M1a gate 已通过，feature-detect `enter-0.2`/`list-0.1`/`show-0.1`。**已实现（实验性）**。
- H2：M1b-R1 gate 已通过，只可消费 `check-report-0.1`；其余 deferred。**已实现（实验性）**。
- H3：M1c gate 已通过，可整合 scoped contracts（单次 `--workstream`）。**已实现（实验性）**。
- H4：M1d gate 已通过，可整合 scoped `check`（`check-report-0.2`）。**已实现（实验性）**。
- H5：M1e gate 已通过，可读取 `backfill-0.1` envelope 与 `sha256-once:`/policy codes。**已实现（实验性，`backfill` 不作为模型工具暴露）**。
- H6：**planned，unavailable**。前置：H0–H5 全部落地 + reviewed
  adapter-contract extension 冻结 marker discovery/exact-card trial/
  decision receipt semantics。
- 正式 Hakimi contract：等 M4 后 AITP versioned JSON + extended golden fixtures。
