# AITP 状态跟踪与交接清单

## 状态跟踪表

| 核对日期 | AITP HEAD | active stage | 备注 |
|---|---|---|---|
| 2026-08-08 | `8658f6827288f4bb61e5c193a346f0f73ebbe3b2` | M0.6（in progress） | M0/M0.5 done；M1a–M4 blocked；CLI JSON 无版本化 envelope；Hakimi native adapter 未启用 |

每次核对后：追加一行，并更新 `COMPATIBILITY.md` 中变化的行与双语 README。

## 开发前核对 checklist（每次 AITP 相关开发必做）

1. [ ] AITP 开发仓库 `git rev-parse HEAD` 与 `git status --short`（注意既有未跟踪文件，勿触碰）。
2. [ ] `aitp --help` 确认实际 CLI 面；对照 `docs/roadmap.md` stage 状态表。
3. [ ] 确认涉及的命令/schema 是否 available；blocked 的一律不调用、不写 available。
4. [ ] 核对官方 fixtures 位置（`tests/ledger/fixtures/`、`suite/`）；需要 golden 时优先用官方，不用 planning examples。
5. [ ] 确认 FROZEN v6 约束是否仍生效（M0.6 scored run 前不得改冻结输入）。
6. [ ] 改动影响兼容性时：同 change 更新 `COMPATIBILITY.md` + 双语 README。

## 双方待办

### AITP 侧（交给 AITP 仓库的开发会话）

- [ ] M0.6 剩余 gate：两个 dogfood bootstrap measurements、paired scored suite runs、gate review。
- [ ] **决策**：`record/note prepare|save` 的 response envelope 是否随 M1a 一起版本化（Hakimi 集成的前置依赖）。
- [ ] M1a 落地后提供：`aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1` + official synthetic golden fixtures。
- [ ] 明确 synthetic fixtures 的存放位置与消费方式（Hakimi 需要可复制的、无真实研究数据的 fixtures）。

### Hakimi 侧

- [ ] M2 research loop foundation（Research Frame / Question Board / bounded checkpoints）——不依赖 AITP，可并行。
- [ ] AITP 版本化 envelope 出现后：实施 `features/aitp/` native adapter（见 `COMPATIBILITY.md` 落点），启用实验 flag。
- [ ] AITP M1a gate 通过后：H1 检索集成（enter-0.2/list/show + closeout-first 恢复）。
- [ ] AITP M1b gate 通过后：H2 关系与诊断集成（lite-entry-0.2/check/run-pointer）。

## 解阻条件（Hakimi native adapter 的前置）

1. AITP 提供版本化 JSON response envelope（`enter` 至少 M1a 的 `aitp/enter-0.2`；prepare/save 需明确归属）。
2. AITP 提供可消费的 official synthetic golden fixtures。
3. 两个条件满足后，Hakimi 按 `COMPATIBILITY.md` 落点实现，未知 schema 一律 fail closed。
