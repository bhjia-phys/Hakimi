# 研究模式

研究模式（Research Mode）是一项实验性功能，让 Hakimi 成为以 [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) 证据账本为支撑的联合研究伙伴。Agent 不再是回答一个问题就忘记，而是维护一个实时的研究问题看板，通过有界行动自主推进，并将持久检查点写入 AITP——同时你始终可以通过斜杠命令和研究面板完全掌控方向。

::: warning 实验性
研究模式由 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`（`aitp_research_mode`）实验性标志控制，**默认开启**。这个 default-on flag 是 Hakimi 的产品设置，不是 AITP 协议状态信号，也不是 H6 可用性信号。其界面、行为和工具名称可能在版本间变化。关于实验性标志的工作方式，参见[环境变量](../configuration/env-vars.md#runtime-switches)。
:::

## 前置条件

研究模式有三个硬性前置条件。任何一项不满足时，模式会进入降级状态（见下文），持久化操作将被阻止。

- **Python 3.11 或更高版本** — AITP 适配器通过 Python 启动 AITP CLI。进入模式时适配器会探测可用的 Python；如果未找到兼容版本，模式将降级。
- **已安装 AITP 插件** — 会话技能目录中必须能发现 `aitp-research-protocol` 插件。适配器会解析插件根目录，读取其 `aitp.contract.json` 和 `kimi.plugin.json`，并验证合约版本。插件缺失或版本不兼容将导致降级。
- **已初始化的 AITP workspace** — 当前工作目录必须已经是已初始化的 AITP workspace。适配器**不会**自动初始化、领养或运行 `init` / `init --adopt` / `inventory` / `backfill --apply`。未初始化的 workspace 将导致降级。

当三项条件全部满足时，适配器进入 `ready` 阶段，受支持的 AITP 读写工具面对 Agent 可用。适配器不暴露、不调用、不解析 upstream 的 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:` 或 `check-policy` 语义。

## 启用研究模式

`KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`（`aitp_research_mode`）标志默认开启，普通启动即可让 `/research` 命令和 `EnterAITPMode` 能力对 Agent 可用。这个 flag 只是 Hakimi 的产品决策，不报告 AITP 协议阶段，也不表示 H6 可用。标志只是开放入口——它**不会**进入研究模式、探测 AITP、显示研究面板或开放 AITP plugin skill 和研究工具。inactive 状态下零 AITP I/O，绝不自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`。你仍需显式进入模式（通过 `/research on` 或模型 `EnterAITPMode` 入口路径）才能激活 AITP 适配器，并让后续研究轮次使用这些科研能力。

```sh
hakimi
```

如需完全隐藏 Research 入口，启动前设置 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=0`，或在 TUI 中通过 `/experiments` 交互式关闭。标志关闭时，`/research` 命令不会出现在自动补全中，所有 AITP 工具和技能对模型不可见，且不会发生任何 AITP I/O。

## 启动与停止

使用 `/research on` 进入研究模式。Hakimi 会激活 AITP 适配器、探测 workspace 并显示研究面板。该命令本身不会创建研究问题，也不会调度模型轮次；进入后请提交研究问题、继续已有 Goal，或者让模型在处理科研请求时调用 `EnterAITPMode`。你也可以在进入时选择特定研究线：

```
/research on
/research on -- boundary-zero-mode
```

当从 `manual` 或 `yolo` 权限模式进入时，会弹出提示询问是否先切换到 `auto` 或 `yolo`。这只决定后续研究轮次的审批模式，不会启动独立的后台循环。你可以留在 `manual`，但研究轮次可能在风险操作前等待确认。跨轮次的自主 continuation 仍由已有 Goal 唯一负责。

退出研究模式：

```
/research off
```

退出时会撤销 AITP 工具授权并隐藏研究面板。已保存的 AITP 记录**不会**被删除——它们持久保留在账本中。

## 查看状态

随时查看当前研究快照：

```
/research status
```

会显示模式阶段、循环状态、当前研究线、焦点问题、AITP 适配器健康状态，以及（可用时）current-state maintenance 摘要。

## 当前状态维护（current-state maintenance）

适配器 probe 报告 `ready` 后，进入研究模式会执行一次只读 AITP 周期：先执行 `enter`，再执行 `check`。活跃模式下的会话撤销和冷恢复会在适配器 probe 后重复同一周期；如果指定了 workstream，周期会针对该 workstream 执行。

maintenance receipt 和上下文注入只暴露安全摘要：Working Note age、active state 是否更新、未解决 failure 数、next action、warning code，以及 check 的状态、计数和 finding code。完整 Research snapshot/API 响应或展开的 Board 仍可能包含 checkpoint、revision 和 adapter health 字段；这些 projection 不等同于 maintenance receipt 或上下文注入。

只有 warning 的 check findings 会保持模式为 `ready`；error finding 或 `enter`/`check` 周期不可用时会显示 `degraded`。这项维护是只读的：不会自动运行 `init`、adopt 或执行 backfill，也不会自动写入 semantic handoff、Entry 或 Note。它只在进入模式以及 active undo/cold restore 后运行，不是 session-end automatic closeout。

## 暂停与恢复

暂停 Research Loop 但不退出 AITP 模式：

```
/research pause
```

暂停状态会进入后续模型步骤所读取的研究快照，因此恢复前 Agent 不应继续推进研究循环：

```
/research resume
```

## 研究面板

研究模式激活后，**研究面板**（Research Board）会出现在 live chrome 区域（输入框上方的持久 UI 区域）。默认的紧凑 Board 采用 **science-first** 叙事：先讲清科研进展，再展示任务清单。它突出显示：

- 当前 Research phase 和 progress headline
- 已完成的物理工作及其 insight 或 result
- 这些结果对 mainline 的影响
- 当前 uncertainty 或未解决的问题
- 下一个有界行动，以及 human gate 或 active alert

Todo **Actions** 保留为辅助信息，不再是紧凑 Board 的主叙事。模式、循环、问题、焦点和检查点发生变化时，core 会向 TUI 推送一个完整快照，因此面板无需轮询即可立即更新；冷会话读取也不能覆盖更新的实时快照。

面板跟踪的是语义化科研状态，而不是原始活动日志。普通工具调用和 AITP `list` / `show` / `check` 读取本身不会改变面板。研究模式激活后，Agent 会在每个步骤收到状态维护规则：实质性工作前先创建 Question，用 `SetResearchFocus` 声明有界行动，并且只在新证据、失败或持续无进展改变判断或下一动作时调用 `UpdateResearchQuestion`。这是语义 guidance，不保证 candidate confirmation 会在 runtime guard 每一次 `SetResearchFocus` 调用。如果没有发生这类语义转换，面板保持不变是预期行为。

Research Mode 会把当前会话的 `TodoList` 投影为面板中的 **Actions**。Todo 状态仍与 Research Question 和 AITP 账本分离：完成一个 action 本身不会改变 epistemic 状态，也不会自动创建 AITP Entry。按 `Ctrl-O` 可以在原位置展开 Board；展开视图会补充 derivation、tests、sources 和 checkpoint 细节，同时保留当前研究线摘要、assessment、alerts 和有界 Actions 列表，再按一次 `Ctrl-O` 折叠。普通非研究模式下，`Ctrl-T` 仍用于展开独立的 Todo 面板。

Agent 提出候选问题供你确认时，可以先把它们登记为开放的 working state，使其出现在面板上。预期行为是在确认前不把候选设为 Focus、不持久化为 AITP decision，但 candidate confirmation 不是 `SetResearchFocus` 的 runtime 强制 guard。alerts 和 generic human gate 已实现；`ResolveResearchDecision` 只解析 runtime state，不会自动写入 AITP `decision` Entry。Hakimi Research Line 与 AITP workstream 属于不同命名空间：如果两者 slug 不同，Agent 可以读取已有 workstream，但不得静默创建 alias，也不得直接用 Research Line slug 进行持久化。

面板为只读。所有人类编辑通过 `/research manage` 或各个 `/research` 子命令完成。如果存在 unresolved gate 或 active alert，`/research manage` 会先进入 **Attention view**，而不是直接进入普通列表。在 Attention view 中，按 `R` 输入 resolution 并选择要恢复的 phase，按 `A` acknowledge alert，按 `L` 返回 lines。Attention view 中的 `R` 表示 resolution，不是普通 question view 中原有的 reopen 语义。清除 attention 项目后，普通管理器仍以研究线为第一层：选择 Research Line 后按 `Enter` 查看该线的问题，按 `Esc` 返回研究线列表。研究线视图显示状态、问题计数和 assessment；问题视图支持设置焦点、编辑、延后、阻塞、关闭和重新打开。

## 研究方向引导

研究模式使用乐观并发：每条变更命令都携带最新快照的 `revision` 作为 `expectedRevision`。如果 Agent 在你上次查看面板后修改了问题，命令会返回 `research_stale_revision` 错误，面板刷新后你可以用当前 revision 重试。

### 研究管理器

打开交互式管理器浏览和编辑问题：

```
/research manage
```

在普通研究线和问题视图中，按 `↑` / `↓` 浏览，`F` 设置焦点，`E` 编辑措辞，`D` 延后，`B` 阻塞，`C` 关闭，`R` 重新打开，`Esc` 取消。这些快捷键保持不变；只有 Attention view 将 `R` 用作 resolution。

### 直接引导命令

无需打开管理器即可精确控制：

| 命令 | 说明 |
| --- | --- |
| `/research edit <questionId> -- <新措辞>` | 替换问题的措辞 |
| `/research focus <questionId> -- <有界行动>` | 设置焦点问题及其下一个有界行动 |
| `/research defer <questionId> [-- <原因>]` | 延后一个问题（原因可选） |
| `/research block <questionId> [-- <原因>]` | 阻塞一个问题 |
| `/research close <questionId> [-- <原因>]` | 关闭一个问题 |
| `/research reopen <questionId> [-- <原因>]` | 重新打开已关闭的问题 |
| `/research line <slug>` | 切换当前研究线 |

示例：

```
/research focus q-17 -- 用小晶格扫描探测边界零模
```

## 保存、查看与检查屏障

Agent 可用的 AITP 工具面按适配器健康状态分为两层：

- **读工具**（`aitp_enter`、`aitp_list`、`aitp_show`、`aitp_check`）— 适配器为 `ready` **或** `degraded` 时可用。降级模式下 Agent 仍可浏览账本和运行健康检查。
- **写工具**（`aitp_record_prepare`、`aitp_record_save`、`aitp_note_prepare`、`aitp_note_save`）— **仅**在适配器为 `ready` 时可用。写操作使用单飞保护：当前变更未完成前，并发的变更请求会被拒绝。

这一屏障意味着 AITP 不健康时 Agent 无法静默持久化证据。适配器会按照已安装的 AITP 契约，校验每个有版本的读响应和未版本化的 prepare/save 响应；未知 schema、未知 status 或额外 transport 字段都会 fail closed，不会被接纳为科研状态。`aitp_record_prepare` 只接受 `observation`、`result`、`failure`、`decision`、`source`、`code_change`、`run` 或 `closeout`；Note prepare 使用 `working` 或 `theory` 模式，save 只接受 prepare 返回的 draft path。

`aitp_check` 把退出码 0 视为 clean，把退出码 1 视为成功返回 findings。只有 warning 的 findings 会保留展示，但不会使适配器降级，也不会阻止 checkpoint cursor；error finding 会让该 checkpoint 保持 pending。finding code 只作为 opaque string 投影；适配器不实现 AITP 的 `sha256-once:` 或 `check-policy` 语义。在进入或恢复时的维护周期中，error finding 还会让 Research Mode receipt 显示为 `degraded`。退出码 2 表示命令失败：有效的 AITP JSON 错误或无效的 check transport 会使适配器降级，参数解析错误则只报告为工具错误，不会污染整个会话。全文 `Grep` 可以定位候选记录，但完整的 canonical Entry 必须通过 `aitp_show` 读取；`aitp_show` 失败后，绝不能改用直接解析 Markdown 来模拟成功。

## 降级模式

以下任一条件满足时，适配器进入 `degraded`：

- 未找到 Python 3.11+
- AITP 插件缺失或合约版本不兼容
- workspace 未初始化（`not_initialized`）
- `aitp_check` 无法运行并返回有效的 AITP 错误，或其成功 payload 未通过契约校验

降级模式下：

- **读工具**仍可用——Agent 仍可列出和查看 AITP 条目。
- **写工具**被阻止——`record_save` 或 `note_save` 无法执行。
- **AITP writes 和 active Research Mode 的 Goal 完成被阻止**——未解决的 human gate 也会阻止 Goal 完成。本地 Question/Line mutation 仍可能发生，但不是持久化的 AITP write。
- 研究模式不会执行 automatic session-closeout。它**不会**自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`，适配器也不暴露、不调用、不解析 upstream 的 `backfill-0.1` 成功 envelope。用户必须手动初始化 workspace 或解决 AITP 健康问题。

适配器降级时你可以显式选择在不持久化的情况下继续，但该操作会跳过账本写入。

## 排除与限制

研究模式有以下硬性排除：

- **Plan 模式冲突**：Plan 模式与研究模式互斥。进入一个前必须退出另一个。
- **仅限主 Agent**：AITP 和 Research 变更工具仅在主 Agent 上可用。子 Agent 无法使用——必须通过类型化数据包将结果返回给主 Agent。
- **会话撤销**：研究工作状态（问题、焦点、研究线）通过检查点模型跟随会话撤销。已提交的 AITP 游标**不**跟随——一旦检查点提交到 AITP，会话撤销无法撤回这一外部事实。

## 下一步

- [斜杠命令参考](../reference/slash-commands.md#experimental-research-mode) — 完整的 `/research` 命令语法
- [会话与上下文](./sessions.md) — 会话撤销如何与研究状态交互
- [使用目标模式](./goals.md) — 另一种特殊模式；研究模式降级时 Goal 完成会被阻止
