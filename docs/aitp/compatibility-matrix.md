# Hakimi × AITP compatibility matrix and decisions

Baseline audited **2026-08-08** against AITP HEAD
`8658f6827288f4bb61e5c193a346f0f73ebbe3b2`。两侧（Hakimi 本目录与 AITP
`docs/hakimi/compatibility-matrix.md`）交叉核对一致；AITP HEAD 越过该基线后
需重新核对各行。本文件是 Hakimi 侧视角；AITP 侧证据细节见对方文档。

## 1. Command matrix (Hakimi view)

| Command | AITP stage | Status | Hakimi may call | Blocked on | Future feature-detect |
|---|---|---|---|---|---|
| `init` | M0 | available | no — human decision, blank dir only | — | `--help` presence |
| `init --adopt` | M0.6 | available | no — touches an existing tree, human decision | — | `--help` presence |
| `enter` | M0 | available | **yes** (session start/end) | — | no `schema` key; strict shape check |
| `inventory <path> --name <n>` | M0.6 | available | no — operator-only, **writes** `.aitp/local/legacy/<name>-inventory.json` | — | — |
| `record prepare\|save` | M0 | available | yes (prepare → fill → save) | — | envelope shape + `status` enum |
| `note prepare\|save` | M0 | available | yes | — | envelope shape + `status` enum |
| `list` | M1a | **absent** (argparse invalid choice, exit 2) | no | M0.6 gate | top-level `schema == "aitp/list-0.1"` |
| `show` | M1a | **absent** | no | M0.6 gate | top-level `schema == "aitp/show-0.1"` |
| `check` | M1b | **absent** | no | M1a gate + cap reconciliation | exit 0/1/2 + `aitp/check-report-0.1` |

## 2. Schema existence (as of baseline)

| Schema | Kind | Status | Notes |
|---|---|---|---|
| `aitp/lite-store-0.1` | file (`STORE.toml`) | exists | `workspace.py:100` |
| `aitp/lite-topic-0.1` | file (`TOPIC.md`) | exists | `workspace.py:88` |
| `aitp/lite-entry-0.1` | file | exists; only schema `validate_entry` accepts | `records.py:86,258` |
| `aitp/lite-note-0.1` | file | exists | `notes.py:61,110` |
| `aitp/legacy-inventory-0.1` | file | exists | `workspace.py:322` |
| `aitp/enter-0.1` | **transport** | **does not exist** | `enter --json` has no top-level `schema` (`state.py:121-147`; verified live) |
| `aitp/enter-0.2`, `aitp/list-0.1`, `aitp/show-0.1` | transport | blocked (spec frozen) | `docs/m1a-spec.md` §payloads |
| `aitp/lite-entry-0.2` | file | blocked (pre-spec frozen) | `docs/m1b-spec.md:32` |
| `aitp/check-report-0.1` | transport | blocked (pre-spec frozen) | `docs/m1b-spec.md:226` |
| `aitp/run-pointer-0.1` | file | blocked (pre-spec frozen) | `docs/m1b-spec.md:288` |

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
  （`docs/m1a-spec.md:253-288`）。该 gate 之前不得假定任何 schema 存在。
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

1. 绝不调用 `list`/`show`/`check`（gate 前不存在，今天 exit 2）。绝不用
   `rg` 或临时 Markdown 解析模拟它们。
2. 绝不自动运行 `init` / `init --adopt` / `inventory`——都需要人工决策；
   `inventory` 会写文件。
3. 绝不假定 `aitp/enter-0.1` 或任何 transport schema 存在。契约点只在
   gate 后存在：`enter-0.2`/`list-0.1`/`show-0.1`（M1a）、
   `check-report-0.1`/`run-pointer-0.1`（M1b）。
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

## 6. Next steps and blocking

阻塞链：`M0.6 gate` → `M1a implementation` → `M1a gate` → `M1b` → `M2–M4`。
Hakimi H0 和 research loop 对该链零依赖。

Hakimi 侧（并行）：

- H0 now：adapter 骨架、launcher、严格 envelope 校验、capability 探测、
  `enter` lifecycle、prepare→save 流程、降级、tree-hash 测试、双语 README
  兼容矩阵。
- H1 在 M1a gate 后；H2 在 M1b gate 后；正式 Hakimi contract 在 M4 后。
- Research-loop 能力（web/PDF/推理/UX/私有缓存）独立于所有 AITP gates。

AITP 侧（by gate）：M0.6 剩余 gate 证据 → M1a implementation（含 golden
regeneration）→ M1b（cap reconciliation → implementation spec → check/
lite-entry-0.2）。详见 AITP `docs/hakimi/compatibility-matrix.md` §6。

## 7. Audit method (baseline evidence)

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
