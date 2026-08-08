# AITP 状态跟踪与交接清单

## 状态跟踪表

| 核对日期 | AITP HEAD | active stage | 备注 |
|---|---|---|---|
| 2026-08-08 | `8658f6827288f4bb61e5c193a346f0f73ebbe3b2` | M0.6（in progress） | M0/M0.5 done；M1a–M4 blocked。AITP 侧已拍板：prepare/save 按 version-0 契约（不版本化），`enter-0.2` 是第一个版本化契约点；**H0 无 AITP 前置阻塞，可立即实施** |

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

- [ ] M0.6 剩余 gate：两个 dogfood bootstrap measurements、paired scored suite runs、gate review。
- [ ] M1a implementation：`aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1` + golden fixtures 再生成。
- [ ] M1b：cap reconciliation → implementation spec → `check`/`lite-entry-0.2`。
- [ ] （已决策）prepare/save 不版本化；如未来硬化需 documented spec revision/addendum。

### Hakimi 侧

- [ ] **H0（无阻塞，可立即实施）**：`features/aitp/` adapter 骨架——launcher（argv-only、Python ≥ 3.11 探测）、version-0 严格 shape 校验、capability 探测、`enter` lifecycle、prepare→fill→save 流程、`not_initialized` 优雅降级、tree-hash 零写入测试；实验 flag 门控。
- [ ] M2 research loop foundation（Research Frame / Question Board / bounded checkpoints）——不依赖 AITP，可并行。
- [ ] H1（M1a gate 后）：`enter-0.2`/`list-0.1`/`show-0.1` schema dispatch + closeout-first 恢复 + golden fixtures 兼容测试。
- [ ] H2（M1b gate 后）：`lite-entry-0.2` 关系、typed resolution、派生 `used_by`、`check` exit 0/1/2、pointer bundle（只读）。

## 解阻链

`M0.6 gate` → `M1a implementation` → `M1a gate` → `M1b` → `M2–M4`。

- H0：**无 AITP 前置**（2026-08-08 AITP 决策确认，无需 AITP change）。
- H1：等 M1a gate。
- H2：等 M1b gate。
- 正式 Hakimi contract：等 M4 后 AITP versioned JSON + extended golden fixtures。
