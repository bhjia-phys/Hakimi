# AITP 状态跟踪与交接清单

## 状态跟踪表

| 核对日期 | AITP HEAD | active stage | 备注 |
|---|---|---|---|
| 2026-08-08 | `8658f6827288f4bb61e5c193a346f0f73ebbe3b2` | M0.6（in progress） | M0/M0.5 done；M1a–M4 blocked。AITP 侧已拍板：prepare/save 按 version-0 契约（不版本化），`enter-0.2` 是第一个版本化契约点；**H0 无 AITP 前置阻塞，可立即实施** |
| 2026-08-14 | `9f9e873440b8d88bfbb2963d8b5717c83b9ef4cc` | M1c（done；deterministic gate passed） | 工作树 clean（除刻意未跟踪 `ref/`、`uv.lock`）。M0.6 以缩小声明关闭；M1a、M1b-R1、M1c 全部 done 且 deterministic gate passed（107 tests）。`list`/`show`/`check` 已 shipped 可 feature-detect；M1c 增加单次 `--workstream` 作用域投影（`enter-0.3`/`list-0.2`）与 repeatable prepare flag。`lineage` 仍 deferred；M2–M4 仍 blocked |

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
- [ ] M2–M4：各自 natural-demand 证据未出现，blocked 设计选项；`lineage`/`lite-entry-0.2`/`run-pointer` 保持 deferred。
- [ ] （已决策）prepare/save 不版本化；如未来硬化需 documented spec revision/addendum。

### Hakimi 侧

- [ ] **H0（无阻塞，可立即实施）**：`features/aitp/` adapter 骨架——launcher（argv-only、Python ≥ 3.11 探测）、version-0 严格 shape 校验、capability 探测、`enter` lifecycle、prepare→fill→save 流程、`not_initialized` 优雅降级、tree-hash 零写入测试；实验 flag 门控。
- [ ] D 轨 research loop foundation（Research Frame / Question Board / bounded checkpoints）——不依赖 AITP，可并行。
- [ ] H1（M1a gate 已通过）：feature-detect 并消费 `enter-0.2`/`list-0.1`/`show-0.1` + closeout-first 恢复 + golden fixtures 兼容测试。
- [ ] H2（M1b-R1 gate 已通过）：只整合 R1 实际发布的 `check`（`check-report-0.1`，exit 0/1 报告、exit 2 错误包）；`lite-entry-0.2` 关系、typed resolution、派生 `used_by`、pointer bundle 均未发布（deferred），不得安排。
- [ ] H3（M1c gate 已通过）：整合 scoped contracts——仅传入单次 `--workstream <slug>` 时 feature-detect `enter-0.3`/`list-0.2`（additive `workstream` key、严格 exact membership、relation 先全局计算）；无 flag 时保持旧 schema。

## 解阻链

`M0.6（缩小声明关闭）` → `M1a gate（passed）` → `M1b-R1 gate（passed）` → `M1c gate（passed）` → `M2–M4（自然需求证据，blocked）`。

- H0：**无 AITP 前置**（无需 AITP change）。
- H1：M1a gate 已通过，可 feature-detect `enter-0.2`/`list-0.1`/`show-0.1`。
- H2：M1b-R1 gate 已通过，只可消费 `check-report-0.1`；其余 deferred。
- H3：M1c gate 已通过，可整合 scoped contracts（单次 `--workstream`）。
- 正式 Hakimi contract：等 M4 后 AITP versioned JSON + extended golden fixtures。
