# AITP 集成交接目录

本目录是 Hakimi ↔ AITP Research Protocol 跨仓库开发的功能交接点。任何涉及
AITP 集成的工作（实现、规划、兼容性变更）都应从这里开始，并把结论写回这里，
保证两个仓库的开发节奏可互相衔接、不依赖某一次会话的记忆。

## 两个仓库

| 角色 | 位置 | 权威性 |
|---|---|---|
| Hakimi（本仓库） | `bhjia-phys/Hakimi` | agent 编排、工具、交互体验 |
| AITP 开发仓库 | `bhjia-phys/AITP-Research-Protocol` | stage、CLI 命令、schema、golden fixtures 的 source of truth |
| AITP managed plugin 副本 | `~/.hakimi/plugins/managed/aitp-research-protocol` | 仅用于已安装行为验证，**不是权威**；不得直接修改 |

AITP 集成应遵循根 `AGENTS.md` 的 "AITP Compatibility Maintenance" 规则：
Hakimi 只通过 CLI + 文件消费 AITP，不复制 runtime/parser/validator，不直接写
`.aitp` canonical 文件，不增加第二套账本。

## 文件索引

- `COMPATIBILITY.md` — 兼容矩阵：命令/schema 的当前状态、blocked-on、双方动作、H0–H3 轨道。
- `TRACKING.md` — AITP 状态跟踪表、开发前核对 checklist、双方待办与解阻条件。

根 `README.md` / `README.zh-CN.md` 的 Roadmap 和兼容状态是与本目录同步的
简版；改变兼容性时两边必须同 change 更新。

## 使用方式

1. 开始任何 AITP 相关开发前，按 `TRACKING.md` 的 checklist 核对 AITP 仓库当前状态。
2. 完成后更新 `COMPATIBILITY.md` 对应行和 `TRACKING.md`，并同步双语 README。
3. 涉及 AITP 侧契约缺口时，把结论和最小提案写进 `TRACKING.md` 的待办，交给
   AITP 仓库的开发会话，而不是在 Hakimi 侧猜测或绕过。
