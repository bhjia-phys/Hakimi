# Hakimi × AITP compatibility matrix and decisions

Baseline audited **2026-08-08** against AITP HEAD
`8658f6827288f4bb61e5c193a346f0f73ebbe3b2`。两侧（Hakimi 本目录与 AITP
`docs/hakimi/compatibility-matrix.md`）交叉核对一致；AITP HEAD 越过该基线后
需重新核对各行。本文件是 Hakimi 侧视角；AITP 侧证据细节见对方文档。

**当前 amendment（2026-08-23）：** 重新核验 AITP HEAD
`eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`（committed HEAD 是
0.8.0——Skill-only amendment 已 commit）并逐命令核对
`--help`。M0.6 以缩小声明关闭；M1a、M1b-R1、M1c、M1d、M1e 均 **done；
deterministic gate passed**（154 tests）。AITP 读契约
`enter-0.2`/`list-0.1`/`show-0.1`/`check-report-0.1`、M1c 作用域契约
`enter-0.3`/`list-0.2`、M1d 作用域 check 契约 `check-report-0.2`（均仅
单次 `--workstream`）已 shipped，可 feature-detect；M1e 增加 `backfill`
命令与 `sha256-once:` 可变观测 pin（无 transport schema 变化）。AITP 0.8
是 **Skill-only amendment**（已 commit）：定义 `method-observation`
marker 候选、保守 card/trial review、两步 human decision（approval +
publication）和 platform tool/card/Skill 三层边界——不改 CLI/schema/
transport。`lineage`/`lite-entry-0.2`/`run-pointer-0.1` 仍 deferred；
M2–M4 blocked。**Hakimi native adapter（H0–H5）首个实验性纵切片已实现**
（flag `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`，默认开启）：strict
contract discovery、Python probe、对 `enter`/`list`/`show`/`check` 全部已发布
read transport 与 version-0 prepare/save envelope 的严格 Zod 校验、与 0.8
契约一致的 record/Note argv、scoped `--workstream`、M1e finding-code 兼容、
Research state（Question/Line/Focus、三轴问题模型、revision steering、pending
checkpoint barrier、Goal complete guard）、mode/loop/Question/Focus/checkpoint
的单一完整 snapshot push、active step 的语义状态维护 guidance、
protocol/node-sdk/kap-server/klient 表面、TUI `/research` Board/manager 与
stale-hydrate 防护。`check` exit 0/1 都解析为报告；warning-only 不降级，
error finding 阻止 checkpoint cursor；exit 2 优先解析 stdout 的严格 AITP
错误包，argparse stderr-only misuse 只作为命令错误。`/research on` 只激活
capability 和 Board，不调度模型 turn；Goal 仍是跨 turn continuation 的
唯一 owner。
flag 开启时普通启动已开放 `/research` 与 `EnterAITPMode`，但仅开放
入口——进入模式仍需 `/research on` 或模型入口，inactive 状态零 AITP
I/O。flag off 时（`=0` 或 `/experiments`）所有 AITP 工具、skill 和
Board 隐藏，零 AITP I/O。不自动 init/adopt/inventory/backfill apply；
backfill 不作为模型工具暴露。typed question/line registry、
literature/compute/Portfolio、H6 未实现。H6/C6 native
method-distillation orchestration 是 **planned，unavailable**。
§1/§2/§3/§5/§6 已更新到当前状态；§4/§7 保留历史 baseline 证据。

## 1. Command matrix (Hakimi view)

| Command | AITP stage | Status | Hakimi may call | Blocked on | Future feature-detect |
|---|---|---|---|---|---|
| `init` | M0 | available | no — human decision, blank dir only | — | `--help` presence |
| `init --adopt` | M0.6 | available | no — touches an existing tree, human decision | — | `--help` presence |
| `enter` | M0 | available | **yes** (session start/end) | — | no `schema` key; strict shape check；M1c（已 shipped；gate passed）：单次 `--workstream <slug>` 时 → `schema == "aitp/enter-0.3"` |
| `inventory <path> --name <n>` | M0.6 | available | no — operator-only, **writes** `.aitp/local/legacy/<name>-inventory.json` | — | — |
| `record prepare\|save` | M0 | available | yes (prepare → fill → save) | — | envelope shape + `status` enum；M1c（已 shipped；gate passed）：repeatable `--workstream` 只播种 draft frontmatter（重复 slug 拒绝），envelope 不变 |
| `note prepare\|save` | M0 | available | yes | — | envelope shape + `status` enum；M1c（已 shipped；gate passed）：repeatable `--workstream` 只播种 draft frontmatter（重复 slug 拒绝），envelope 不变 |
| `list` | M1a | **available** (read-only) | **yes** (feature-detect schema) | —；M1a deterministic gate passed | top-level `schema == "aitp/list-0.1"`；M1c（已 shipped；gate passed）：单次 `--workstream <slug>` 时 → `schema == "aitp/list-0.2"` |
| `show` | M1a | **available** (read-only) | **yes** (feature-detect schema) | —；M1a deterministic gate passed | top-level `schema == "aitp/show-0.1"`；malformed 记录 → exit 0 + `status:"malformed"` + `frontmatter:null` |
| `check` | M1b-R1 (selected 2026-08-12) | **available** (read-only, zero-write) | **yes** (feature-detect schema) | —；M1b-R1 deterministic gate passed 2026-08-12 | 解析 `aitp/check-report-0.1`（exit 0/1 均带报告；exit 2 是标准错误包）；M1d（已 shipped；gate passed）：单次 `--workstream <slug>` 时 → `aitp/check-report-0.2`（admitted in-scope 计数、`by_code`/`outside_scope`；四行文本仅人阅）；无 flag ⇒ `check-report-0.1` 字节不变 |
| `backfill` | M1e (2026-08-15) | **available** (dry-run default; `--apply` writes metadata only) | **yes** (feature-detect `aitp/backfill-0.1` success envelope) | —；M1e deterministic gate passed | `aitp backfill workstreams --mapping … --decision <human-entry> [--apply]`；dry-run-first，只 add/merge `workstreams`，需 human decision pin mapping |
| `lineage` | deferred candidate (Followup 2, 2026-08-12 再次 deferred) | **absent** | no | 新的 reviewed freeze revision 选中 + 自身 reviewed spec | `aitp/lineage-0.1` 仅在真正 shipped 后 |

## 2. Schema existence (as of baseline)

| Schema | Kind | Status | Notes |
|---|---|---|---|
| `aitp/lite-store-0.1` | file (`STORE.toml`) | exists | `workspace.py:100` |
| `aitp/lite-topic-0.1` | file (`TOPIC.md`) | exists | `workspace.py:88` |
| `aitp/lite-entry-0.1` | file | exists; only schema `validate_entry` accepts | `records.py:86,258` |
| `aitp/lite-note-0.1` | file | exists | `notes.py:61,110` |
| `aitp/legacy-inventory-0.1` | file | exists | `workspace.py:322` |
| `aitp/enter-0.1` | **transport** | **does not exist** | `enter --json` has no top-level `schema` (`state.py:121-147`; verified live) |
| `aitp/enter-0.2`, `aitp/list-0.1`, `aitp/show-0.1` | transport | **exists and available** | M1a deterministic gate passed；`docs/archive/m1a-spec.md`；`show-0.1` malformed 语义见 AITP 侧矩阵 |
| `aitp/enter-0.3`, `aitp/list-0.2` | transport | **shipped and gated（M1c）** | 仅当传入单次 `--workstream <slug>` 时发出：旧 payload + additive top-level singular `workstream` key；严格 exact membership（unscoped 排除）；relation 先全局计算再严格作用域投影；`warnings` 全局；无 flag ⇒ 字节不变的 `enter-0.2`/`list-0.1`。Frozen contract：`docs/archive/m1c-workstreams-spec.md` |
| `aitp/lite-entry-0.2` | file | candidate contract；blocked，未选中 | 2026-08-12 reviewed freeze revision 未选中（`docs/m1b-spec.md` §0.1） |
| `aitp/check-report-0.1` | transport | **shipped and gated（M1b-R1）** | v0.1-only、read-only、zero-write；exit 0/1 带报告、exit 2 错误包（`docs/archive/m1b-r1-spec.md` §Report） |
| `aitp/check-report-0.2` | transport | **shipped and gated（M1d）** | 仅当传入单次 `--workstream <slug>` 时发出：0.1 payload + additive top-level singular `workstream`、`counts.by_code`（per-level）、`counts.outside_scope`（global−scoped level delta）；scoped `counts.entries`/`notes` 是 admitted in-scope 计数，**不与 0.1 直接比较**；exit 0/1 在 scoped report 上评估（scoped `clean` ≠ 全库健康）；四行 scoped 文本仅人阅。Frozen contract：`docs/archive/m1d-workstream-health-spec.md` |
| `aitp/backfill-0.1` | transport | **shipped and gated（M1e）** | `aitp backfill workstreams` 成功 envelope；dry-run default，`--apply` 只 add/merge `workstreams` metadata，需 human decision Entry sha256-pin mapping。Frozen contract：`docs/archive/m1e-evidence-lifecycle-backfill-spec.md` |
| `aitp/run-pointer-0.1` | file | candidate contract；deferred，未选中 | 2026-08-12 freeze revision deferred（`docs/m1b-spec.md` §8 Remote evidence） |

`lite-*` schemas 是持久化文件 schema，**不是** CLI transport envelope。
Transport envelope 在 M1a 之前保持未版本化。

## 3. Versioned transport envelope — AITP decision (2026-08-08)

- **`record/note prepare|save` responses 在 M1a 和 M1b 均不版本化。**
  依据：M1a implementation map 只给 `records.py` 增加 +3 行（hash_mismatch
  message 而已）、`notes.py` +0（`docs/m1a-spec.md:453-469`）；M1b 只增加
  `check-report-0.1`/`run-pointer-0.1` 并 bump enter/show
  （`docs/m1b-spec.md`）。
- **过渡策略：Hakimi 把 prepare/save envelope 视为 version-0 契约**——
  严格 shape 校验（精确 key 集），未知 `status` 值 fail closed。基线 live
  shapes：
  - `record prepare` → `{"status":"prepared","id","path","save_command"}`；
    幂等命中 → `{"status":"existing","path","idempotency_key"}`；
  - `record save` / `note save` → `{"status":"saved","path"}`（或
    `{"status":"already_saved","path"}`）；
  - `note prepare` → 与 `record prepare` 相同 shape。
- **不需要 AITP change。** 若将来要硬化，最小可选方案是在成功 envelope 上
  增加 `schema` 字段，作为 documented M1a spec revision 或 M1b addendum——
  绝不是静默添加。
- **Hakimi 的第一个版本化契约点是 M1a 的 `aitp/enter-0.2`**
  （`docs/archive/m1a-spec.md`）。M1a gate 已通过：
  `enter-0.2`/`list-0.1`/`show-0.1` 可 feature-detect；M1b-R1 增加
  `check-report-0.1`；M1c 增加 `enter-0.3`/`list-0.2`（仅单次
  `--workstream`）；M1d 增加 `check-report-0.2`（仅单次
  `--workstream`，admitted in-scope 计数）；M1e 增加 `backfill-0.1` 成功
  envelope与 `sha256-once:` pin/policy finding codes（无 transport schema
  变化）。对未安装或旧版本 AITP 仍按 fail closed，不得假定任何
  schema 存在。
- **Golden fixtures**：M1a 时在 `tests/ledger/fixtures/golden/` 刻意再生成
  （`enter.json`、`enter-after-save.json`、新 `list.json`、`show.json`）；
  `root` 归一化为 `<golden-store>`；只有 synthetic `nio` store——无真实研究
  数据（`docs/m1a-spec.md:518-544`）。Hakimi 可将它们作为官方协议 fixtures
  消费。

## 4. Hakimi integration assumptions — check results（双方核对一致）

| # | Assumption | Result | Evidence |
|---|---|---|---|
| 1 | Manifest 发现 `skills/` 相对 plugin root | PASS | `kimi.plugin.json:5` 与 `.codex-plugin/plugin.json:18`：`"skills": "./skills/"`；均带 `version`（0.1.0 / 0.1.0+codex.20260729110858） |
| 2 | Launcher 按 `python3.13 → 3.12 → 3.11 → python3` 探测并验证 ≥ 3.11 | PASS | `skills/using-aitp/SKILL.md:8-19`；launcher 硬门 `sys.version_info < (3,11)` → exit 2（`scripts/aitp.py:11-13`）。实测系统 `python3` = 3.10.12 被拒 |
| 3 | `--cwd` 语义 | PASS（两个 caveat） | 默认 `.`，相对/绝对均可（`cli.py`）；`resolve_root` = 最近的 `.aitp/STORE.toml` 祖先优先，否则 git root，否则 cwd（`workspace.py:42-50`）。Caveat 1：祖先 store 优先 ⇒ workspace 内嵌套的第二个 store 无法打开（M1a pre-list 已知设计项）。Caveat 2：无 store 目录下，父级 git root 会成为 workspace root |
| 4 | 退出码 0/2；未来 `check` 0/1/2 | PASS | 成功 0；`AITPError` → 2（`cli.py:124-130`）；argparse 错误 → 2；`check` 契约见 `docs/m1b-spec.md:193-202` |
| 5 | 错误 payload `{"status":"error","code","message"}` | PASS（一个细节） | `cli.py:124-130`。细节：`--json` 模式错误走 **stdout**；text 模式错误只走 stderr（stdout 为空） |
| 6 | `record/note save` 的 draft 必须在 `.aitp/local/drafts` 下 | PASS | `records.py:300-308`、`notes.py:84-92`（`invalid_draft`）；实测外部绝对路径被拒，exit 2 |
| 7 | 只读命令零写入 | PASS | 实测：在 `suite/seeds/S1` 的字节副本上跑两次 `enter --json`（root + 子目录 `--cwd`），tree sha256 不变。代码上 `enter` 从不调用 `atomic_write`/`store_lock`；lock 仅 save path（`records.py:312`）。**`inventory` 是写命令——绝不当作只读** |

## 5. Red lines（Hakimi，现在与未来）

1. `list`/`show`/`check`/`backfill` 已 shipped（M1a/M1b-R1/M1c/M1d/M1e
   gate passed）：先 feature-detect versioned schema 再消费。绝不用 `rg` 或临时 Markdown
   解析模拟 `show`。`check` 解析 exit 0/1 报告、exit 2 作错误包；
   compact `enter` **文本**仅面向人阅读，绝不解析。`check` 无 flag 时是
   `check-report-0.1`，有单次 `--workstream` 时是 `check-report-0.2`
   （admitted in-scope 计数，不与 0.1 比较，scoped `clean` ≠ 全库健康，
   四行文本仅人阅）。`backfill` 默认 dry-run，`--apply` 需 human
   decision pin。`lineage` 仍 deferred。
2. 绝不自动运行 `init` / `init --adopt` / `inventory`——都需要人工决策；
   `inventory` 会写文件。
3. 绝不假定 `aitp/enter-0.1`（不存在）。当前契约点：`enter-0.2`/
   `list-0.1`/`show-0.1`（M1a，passed）、`check-report-0.1`
   （M1b-R1，passed）、`enter-0.3`/`list-0.2`（M1c，passed，仅单次
   `--workstream`）、`check-report-0.2`（M1d，passed，仅单次
   `--workstream`）、`backfill-0.1`（M1e，passed，dry-run default）。
   `lineage-0.1`/`run-pointer-0.1` 仍 deferred。
4. 绝不写 `.aitp/topic/entries/`、`.aitp/topic/notes/`、`TOPIC.md`、
   `STORE.toml`；绝不绕过 `record/note prepare|save`；绝不复制
   runtime/parser/validator；绝不维护第二套账本；无 MCP/daemon/vector
   service。
5. 未初始化 workspace = 优雅降级（`not_initialized`，exit 2），绝不自动
   adopt。
6. 私有缓存永不写回；不存 transcript/CoT；context packet 是 ephemeral
   （`docs/collaborator-design.md:11-16`）。
7. 远端证据：`target: host:/path` 今天被 `ref_escape` 拒绝
   （`records.py:125-133`）；`sha256:` 只验证本地文件。远端证据边界是 M1b
   pointer bundle——不要绕过它。
8. Python ≥ 3.11 由 launcher 强制；探测顺序按 Skill，绝不自行发明。
9. M1c workstreams（shipped；deterministic gate passed）：仅当调用传入单次
   `--workstream <slug>` 时才 feature-detect `enter-0.3`/`list-0.2`；
   无 flag 时 payload 保持 `enter-0.2`/`list-0.1` 字节不变。scoped
   payload 成员是严格 exact membership（unscoped 记录不在 scope）；
   superseded/resolved 集合先在整个 store 上计算，再严格作用域投影（含
   handoff）；`warnings` 全局；scoped `workstream:` 文本行仅面向人阅
   读，绝不解析。没有 workstream registry 文件或命令，不要发明。
10. M1d scoped `check`（shipped；deterministic gate passed）：仅当调用传入
    单次 `--workstream <slug>` 时才 feature-detect `check-report-0.2`；
    无 flag 时 `check-report-0.1` 字节不变。attribution 是 admitted
    in-scope 记录的严格 exact membership（malformed/duplicate-ID/
    unscoped/out-of-scope/TOPIC.md findings 不 scoped，只出现在
    `outside_scope`）；scoped `counts.entries`/`counts.notes` 是 admitted
    in-scope 计数，**不与 `check-report-0.1` 直接比较**；exit 0/1 在
    scoped report 上评估（scoped `clean` ≠ 全库健康）；四行 scoped
    文本仅人阅，绝不解析。
11. M1e evidence lifecycle（shipped；deterministic gate passed）：
    `backfill workstreams` 默认 dry-run，`--apply` 只 add/merge
    `workstreams` metadata，必须由 human decision Entry sha256-pin
    mapping；`sha256-once:` 是可变观测 pin（check 报告 drift/missing 为
    historical 警告而非 error，在 mutable patterns 匹配时）；`.aitp/local/
    check-policy.json` 是 reviewed store policy（mutable patterns 降级
    legacy strict drift/missing 为 historical 警告，immutable/unmatched
    仍 error，无 policy ⇒ 字节不变的 check）。不自动 backfill、不推断
    workstreams。

## 6. Next steps and blocking

阻塞链：`M0.6（缩小声明关闭）` → `M1a gate（passed）` → `M1b-R1 gate（passed）` → `M1c gate（passed）` → `M1d gate（passed）` → `M1e gate（passed）` → `M2–M4（自然需求证据，blocked）`。
Hakimi H0–H5 的首个实验性纵切片已实现（flag 门控，默认开启）；H6 和正式
contract 仍 blocked。

Hakimi 侧（并行）：

- H0 **已实现（实验性，flag 门控）**：adapter 骨架、launcher、严格 envelope 校验、
  capability 探测、`enter` lifecycle、prepare→save 流程、降级、tree-hash 测试、
  双语 README 兼容矩阵。
- H1 **已实现（实验性）**：feature-detect 并消费 `enter-0.2`/`list-0.1`/
  `show-0.1` 并消费官方 golden fixtures。
- H2 **已实现（实验性）**：整合 `check-report-0.1`；`lite-entry-0.2`/
  `used_by`/pointer bundle 未发布（deferred），不得安排。
- H3 **已实现（实验性）**：整合 scoped contracts（单次 `--workstream` →
  `enter-0.3`/`list-0.2`）。
- H4 **已实现（实验性）**：整合 scoped `check`（单次 `--workstream` →
  `check-report-0.2`，admitted in-scope 计数、`by_code`/`outside_scope`，
  四行文本仅人阅，无 flag 时 `check-report-0.1` 字节不变）。
- H5 **已实现（实验性）**：读取 `backfill-0.1` 成功
  envelope 和 `sha256-once:`/policy finding codes（无 transport schema
  变化）；`backfill` 不作为模型工具暴露，不自动 `--apply`。
- H6：**planned，unavailable**。native method-distillation orchestration：
  Session-scope coordinator、candidate/proposal lifecycle、human question +
  decision write、crash/resume。前置：H0–H5 全部落地 + reviewed
  adapter-contract extension 冻结 marker discovery/exact-card trial/
  decision receipt。详见
  [`method-distillation-orchestration.md`](method-distillation-orchestration.md)。
- 正式 Hakimi contract 在 M4 后。
- Research-loop 能力（web/PDF/推理/UX/私有缓存）独立于所有 AITP gates。

AITP 侧（by gate）：M0.6 缩小声明关闭 → M1a/M1b-R1/M1c/M1d/M1e 全部 done
且 deterministic gate passed → M2–M4 保持 blocked 设计选项（各自自然需求）。
AITP 0.8 是 Skill-only amendment（已 commit），不改 CLI/schema。
详见 AITP `docs/hakimi/compatibility-matrix.md` §6。

## 7. Audit method (baseline evidence)

以下为历史 **2026-08-08** baseline 证据，保留原审计观察，不代表当前状态；
当前 amendment 见本文件头部。当前 M1c gate 证据在 AITP
`docs/m1c-stage-notes.md`（107 passed、1,519 非空行、benchmark PASS、
real-store 无 flag 旧 runtime parity、零写入）。M1d gate 证据在
`docs/m1d-stage-notes.md`；M1e gate 证据在 `docs/m1e-stage-notes.md`
（154 tests；committed HEAD 现为 0.8.0）。

- AITP `git rev-parse HEAD` = `8658f682…`；`git status --porcelain` =
  `?? ref/`、`?? uv.lock`（均为刻意未跟踪）。
- AITP baseline：`uv run --python 3.12 --with pytest python -m pytest -q` →
  **26 passed**（Hakimi 侧用隔离 `.venv` 复核：`PYTHONDONTWRITEBYTECODE=1
  .venv/bin/python -m pytest -p no:cacheprovider -q` → 26 passed）。
- Runtime 非空行 = **1082**（9 模块，均 < 400）。
- CLI 面来自每个命令的 `--help`；`list/show/check` → argparse invalid
  choice，exit 2。
- 实测：`suite/seeds/S1` 字节副本上的 live payload/exit-code/零写入检查，
  S1 窗口计数与 `suite/FROZEN.md` v6 §4 完全一致。
