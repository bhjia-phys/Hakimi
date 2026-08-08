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
- 完整兼容矩阵、假设核对与决策：
  [`compatibility-matrix.md`](compatibility-matrix.md)。
- AITP 状态跟踪与开发前核对清单：
  [`TRACKING.md`](TRACKING.md)（Hakimi 侧补充，AITP 侧无对应文件）。

## 职责边界（双方已确认；使用前重新核对）

- AITP = 协议、持久化、证据权威。接口是 **CLI + files**；无 SDK、API server、
  MCP server、daemon、vector service。
- Hakimi = agent 编排、工具调用、web 检索、PDF 阅读、推理、私有缓存。
  私有缓存**永不写回** AITP。
- Hakimi 不复制 AITP runtime/parser/validator，不写 `.aitp` canonical 文件
  （`entries/`、`notes/`、`TOPIC.md`、`STORE.toml`），不绕过
  `record/note prepare|save`。

## 分阶段计划（Hakimi 侧；AITP 侧对应 roadmap gates）

| Phase | AITP 前置 | Hakimi 工作 |
|---|---|---|
| H0 | 现在（无 gate） | launcher adapter（argv-only、Python ≥ 3.11 探测）、未版本化 envelope 的严格 shape 校验、`--help` capability 探测、`enter` lifecycle、prepare→fill→save 流程、`not_initialized` 优雅降级、tree-hash 零写入测试 |
| H1 | M1a gate | 按 `aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1` 做 schema dispatch；closeout-first handoff；Note-age 信号；AITP golden-fixture 兼容测试 |
| H2 | M1b gate | `aitp check` exit 0/1/2；`aitp/lite-entry-0.2`（`based_on`、typed closures）；派生 `used_by`；pointer bundle（只读） |
| 正式 Hakimi contract | M4 后 | versioned `--json` + extended golden fixtures 作为任何 agent 集成的 pass gate |

Hakimi 的 research-loop 能力（web/PDF/推理/session UX/私有缓存）独立于所有
AITP gates，可随时并行推进。

## 维护契约（binding）

以下任一变化必须在**同一 change** 更新本目录：

- stage 状态翻转（M0.6 gate、M1a gate、M1b gate、M2–M4）；
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
4. AITP `docs/m1a-spec.md`、`docs/m1b-spec.md`、`docs/collaborator-design.md`；
5. 已安装插件的 `skills/using-aitp/SKILL.md`（Python 探测顺序、命令表）；
6. AITP runtime：`plugins/aitp-research-protocol/scripts/aitp.py` +
   `scripts/vendor/aitp/`；
7. 本仓库 `AGENTS.md` / `README.md` / 架构代码。
