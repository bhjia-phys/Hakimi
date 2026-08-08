# Hakimi × AITP 兼容矩阵

最后核对：AITP HEAD `8658f6827288f4bb61e5c193a346f0f73ebbe3b2`（2026-08-08）。
每次核对后更新 `TRACKING.md`，不要单独依赖本文件的日期。

## 当前 CLI 面（真实存在，已由 `--help` 验证）

```
aitp init --topic <slug> --title <title> [--adopt] [--dry-run] [--json]
aitp enter [--recent N] [--json]
aitp inventory <path> --name <slug> [--json]
aitp record prepare --kind <kind> [--authority] [--created-by] [--idempotency-key] [--json]
aitp record save <draft> [--json]
aitp note prepare --mode working|theory --title <title> [--created-by] [--json]
aitp note save <draft> [--json]
```

- Python 要求：≥ 3.11；官方 Skill 按 `python3.13 → python3.12 → python3.11 → python3` 探测。
- 无 `--version`、无 `aitp search`（查询路径是 `rg`）、无 `list`/`show`/`check`。
- 退出码：成功 0；`AITPError` 与 argparse 错误 2。`--json` 错误形状：
  `{"status":"error","code":"...","message":"..."}`。

## 命令/schema 兼容矩阵

| AITP stage | 能力 / schema | 状态 | Hakimi 可否调用 | 启用条件 / blocked-on |
|---|---|---|---|---|
| M0/M0.6 | `init` | available | 不自动调用；仅用户经 Skill 显式使用 | 绝不自动 init |
| M0.6 | `init --adopt` | available | 仅用户显式请求 | 绝不自动 adopt |
| M0 | `enter` | available；JSON envelope **无 schema** | native adapter 不启用；Skill 可手动调用 | M1a `aitp/enter-0.2` + golden fixtures |
| M0.6 | `inventory` / `aitp/legacy-inventory-0.1` | available，operator-only，写 `.aitp/local` | 不进入 routine session flow | — |
| M0 | `record prepare` | available；response 无版本化 envelope | native tool blocked | AITP 提供版本化 prepare response envelope |
| M0 | `record save` | available；response 无版本化 envelope | native tool blocked | 同上 |
| M0 | `note prepare` | available；response 无版本化 envelope | native tool blocked | 同上 |
| M0 | `note save` | available；response 无版本化 envelope | native tool blocked | 同上 |
| M0 | `aitp/lite-entry-0.1` | AITP 持久化文件 schema | Hakimi 不解析/校验 | 只经 AITP CLI 产生 |
| M0 | `aitp/lite-note-0.1` | AITP 持久化文件 schema | Hakimi 不解析/校验 | 只经 AITP CLI 产生 |
| M0（假设） | `aitp/enter-0.1` | **不存在** | 不支持 | 不得伪造 |
| M1a | `aitp/enter-0.2` / `list-0.1` / `show-0.1` | specification only，blocked | 不支持 | M0.6 gate + M1a implementation/golden |
| M1b | `aitp/lite-entry-0.2` | pre-spec only，blocked | 不支持 | M1a gate + M1b implementation/gate |
| M1b | `check` / `aitp/check-report-0.1` | pre-spec only，blocked | 不支持 | M1b gate；exit 0/1/2 语义 |
| M1b | `aitp/run-pointer-0.1` | pre-spec only，blocked | 不创建 bundle | M1b gate；bundle 由运行工具产生，AITP 只 pin/read |
| M2 | reviewed artifacts | design only，blocked | 不支持 | M1b gate + M2 gate |
| M3 | cross-topic links | design only，blocked | 不支持 | ≥3 real Topics + M2 gate |
| M4 | collaborator protocol | design complete，Skill-only，blocked | 不支持正式契约 | M1b pilot evidence + suite thresholds |
| M4 后 | 正式 Hakimi contract | not an AITP stage | 未建立 | AITP versioned JSON + extended golden fixtures |

## 当前阻塞（2026-08-08 审计结论）

**CLI 的 `--json` response 没有版本化 transport envelope**：

- `plugins/.../vendor/aitp/cli.py:21-23` 直接序列化返回 dict；
- `enter --json` payload（`state.py:121-147`）无顶层 `schema`；
- `record/note prepare|save` 的 response 也没有版本字段；
- `aitp/lite-entry-0.1`、`aitp/lite-note-0.1` 是持久化文件 schema，不能充当
  transport envelope 版本；
- M1a 计划为 `enter` 增加 `aitp/enter-0.2`（`docs/m1a-spec.md:253-304`），但
  `record/note prepare|save` 的 response 版本化没有明确归属。

因此 Hakimi 原生 structured adapter 必须 fail closed（不按字段相似猜测），
在版本化 envelope 出现前不启用。解阻需要 AITP 在 gate 允许的独立 change 中
明确：prepare/save response 是否随 M1a 版本化，以及 synthetic golden fixtures
的位置与格式。

## 红线

- 不复制 AITP runtime/parser/validator；不直接写 `.aitp/topic/**`；
- 不绕过 `prepare → edit → save` 制造记录；
- 不自动 init/adopt/inventory；未采用 AITP 的 workspace 正常降级；
- 不调用 `list`/`show`/`check`（当前不存在）；
- 不把 planned/blocked 能力写成 available；
- 不修改 AITP 仓库；不触碰真实 dogfood entry/note（如 `GW_librpa`）；
- Hakimi 私有缓存、transcript、chain-of-thought 永不写回 AITP。

## Hakimi 未来 native adapter 落点

```text
packages/agent-core-v2/src/features/aitp/
  flag.ts                # 'aitp' experimental flag，default off
  aitpFeature.ts         # Feature 注册
  sessionAitpService.ts  # plugin root 发现（IPluginService）+ Python 探测
                         # + 严格 schema dispatch + 错误分类
  agentAitpContextService.ts  # main-agent-only，ephemeral context injection
  cli/                   # transport envelope types / strict dispatch
  tools/record/ tools/note/   # prepare → Edit → save 薄桥
```

- 进程调用：`ISessionProcessRunner` argv-only，不拼 shell 字符串，cwd = workspace。
- 插件发现：`IPluginService.getPluginInfo({ id: 'aitp-research-protocol' })`，
  不要求全局 `aitp` executable。
- 生命周期：session 创建时只读 `enter`；AITP 不可用则静默降级，不阻塞会话。
- 测试：`test/features/aitp/`；cross-repo 集成用 AITP 权威 checkout 的 bundled
  CLI + 临时 workspace；read-only 命令前后做 `.aitp` tree hash 对比。
