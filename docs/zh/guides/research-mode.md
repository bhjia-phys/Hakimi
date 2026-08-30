# 研究模式

研究模式（Research Mode）让 Hakimi 成为以 [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) 证据账本为支撑的联合研究伙伴。Agent 不再是回答一个问题就忘记，而是维护一个实时的研究问题看板，通过有界行动自主推进，并将持久检查点写入 AITP——同时你始终可以通过 `/research`、TUI 与 Web 中的 Research Board 和 Research Manager 掌控方向。

::: warning 注意
研究模式默认可发现，但运行时初始为 `inactive`。只有显式进入后才会探测 AITP 或显示 Research Board。AITP 集成仍受 [AITP 交接文档](../../aitp/README.md) 中的兼容性边界约束，包括 H5 仅部分集成以及 H6b method distillation 的 planned/unavailable 状态。
:::

## 前置条件

研究模式有三个硬性前置条件。Hakimi 只会在显式进入后检查它们；任何一项不满足时，active 模式会进入降级状态（见下文），持久化操作将被阻止。

- **Python 3.11 或更高版本** — AITP 适配器通过 Python 启动 AITP CLI。进入模式时适配器会探测可用的 Python；如果未找到兼容版本，模式将降级。
- **已安装 AITP 插件** — 会话技能目录中必须能发现 `aitp-research-protocol` 插件。适配器会解析插件根目录，读取其 `aitp.contract.json` 和 `kimi.plugin.json`，并验证合约版本。插件缺失或版本不兼容将导致降级。
- **已初始化的 AITP workspace** — 当前工作目录必须已经是已初始化的 AITP workspace。适配器**不会**自动初始化、领养或运行 `init` / `init --adopt` / `inventory` / `backfill --apply`。未初始化的 workspace 将导致降级。

当三项条件全部满足时，适配器进入 `ready` 阶段，受支持的 AITP 读写工具面对 Agent 可用。适配器不暴露、不调用、不解析 upstream 的 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:` 或 `check-policy` 语义。

对于理论物理研究，仓库内置的 `theory-physics` plugin 是可选的 domain pack，也是持续科研的唯一上层使用手册。即使 Research Mode 处于 inactive，它也可以被发现，并将持续请求路由为：进入 Research Mode、对齐当前 Line / Question / Focus 与阶段 Goal、执行一个有界 Research Action，再按需转交 AITP。普通的一次性物理问答不需要进入 Research Mode。

外部的 `aitp-research-protocol` plugin 仍是协议 authority。它的 `using-aitp` 与 `distilling-methods` skill 保持独立且仅在 active 时可用：durable scientific delta 转交 `using-aitp`；只有在该 plugin 已安装、Research Mode active 且该 Skill 当前可见时，才按需转交 `distilling-methods`。否则只保留 method candidate 与证据，不得声称已完成蒸馏或发布。Hakimi 不复制它们的 CLI、schema、method-card、trial 或 approval 规则；不会自动写 Topic Goal、`resolves` 或 method card。调用 `EnterAITPMode` 后使用 `GetResearchStatus`；如果仍为 `probing`，应等待其收敛为 `ready` 或 `degraded`，不得忙轮询或改用裸 CLI。

## 进入研究模式

Research Mode 不需要选择性启用开关。`/research` 命令和 `EnterAITPMode` 能力默认可发现。每个新建 session 初始都为 `inactive`，而 hydration 会保留已持久化的 mode。inactive 状态的恢复加载、`getResearch` 和 GET/快照读取只使用本地快照：不会发生 AITP I/O，不会探测 workspace，Research Board 也保持隐藏。持久化为 active 的 session 在 cold restore 后仍保持 active；cold restore 会重新探测适配器并执行只读的 `enter` → `check` 维护周期。其他 Research/AITP 工具以及 AITP plugin skill 仍仅在 active 状态下可见。

旧的 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` 环境变量、`[experimental].aitp_research_mode` 和 `KIMI_CODE_EXPERIMENTAL_FLAG` 对这个正式开放的能力均不生效，不会隐藏或启用入口；总开关对其他实验功能仍然有效。要从 inactive session 激活 AITP 支撑的能力，请用 `/research on` 显式进入、在 Web 中选择 **Research**，或让模型调用 `EnterAITPMode`。active conversation undo 和 cold restore 也会重新探测适配器，并在探测就绪后执行只读的 `enter` → `check` 维护周期。Research Mode 绝不自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`。

## 启动与停止

在 Web 中，打开 composer 的 **Modes** 菜单并选择 **Research**。共享快照处于 inactive 时，该入口会显式进入 Research Mode 并显示 Research Board；快照进入 `probing`、`ready` 或 `degraded` 后，同一行会保持 active，并打开 Research Manager。该按钮不会创建问题，也不会调度模型轮次。

你也可以在 TUI 或 Web composer 中使用 `/research on`。Web 会把手工输入的 `/research` 路由到 Research command endpoint，而不是作为模型提示词发送。Hakimi 激活 AITP adapter 后会在检查 workspace 时进入 `probing`，随后通过 live Research Board 显示 `ready` 或 `degraded` 结果。进入后请提交研究问题、继续已有 Goal，或者让模型在处理科研请求时调用 `EnterAITPMode`。你也可以在进入时选择特定研究线：

```text
/research on
/research on -- boundary-zero-mode
```

仅 TUI 在从 `manual` 或 `yolo` 权限模式进入时显示键盘提示，询问是否切换到 `auto` 或 `yolo`。Web 使用 session 当前的权限模式；如需更改，请先通过 Web 控件设置。两个 surface 都不会启动独立后台循环，在 `manual` 下研究轮次仍可能等待审批；跨轮次的自主 continuation 只由已有 Goal 负责。

### Web 手动检查

1. 从 inactive 且 session 空闲的状态打开 **Modes** 并选择 **Research**。确认 Board 出现并先进入 `probing`，随后进入 `ready` 或 `degraded`，且没有调度模型响应。
2. 再次打开 **Modes**，点击 active 的 **Research** 行或 **管理**。确认打开 Research Manager，而不是退出研究模式。
3. 运行 `/research off`。确认 Board 和 **Research** tag 消失，**Modes** 中的 Research 行恢复为启动操作。
4. 从 inactive session 发送一条使模型调用 `EnterAITPMode` 的科研请求。确认同一个 Board 和 active **Research** 入口自动出现。
5. 重启 Hakimi。确认 **Research** 行和 `/research` 斜杠菜单入口仍默认可发现，而新 session 初始为 inactive，显式进入前不会发生 AITP I/O。

退出研究模式：

```text
/research off
```

退出时会撤销 AITP 工具授权，并在两个 surface 中隐藏 Research Board。已保存的 AITP 记录**不会**被删除——它们持久保留在账本中。

## 查看状态

随时查看当前研究快照：

```
/research status
```

在 TUI 中，该命令会显示模式阶段、循环状态、当前研究线、焦点问题、AITP adapter 健康状态，以及（可用时）current-state maintenance 摘要；在 Web 中，它会刷新 authoritative session snapshot，并展开 live Board。

## 当前状态维护（current-state maintenance）

适配器 probe 报告 `ready` 后，进入研究模式会执行一次只读 AITP 周期：先执行 `enter`，再执行 `check`。活跃模式下的会话撤销和冷恢复会在适配器 probe 后重复同一周期；如果指定了 workstream，周期会针对该 workstream 执行。

maintenance receipt 和上下文注入只暴露安全摘要：Working Note age、active state 是否更新、未解决 failure 数、next action、warning code，以及 check 的状态、计数和 finding code。完整 Research snapshot/API 响应或展开的 Board 仍可能包含 checkpoint、revision 和 adapter health 字段；这些 projection 不等同于 maintenance receipt 或上下文注入。

合法的 check findings（包括 error finding）会保持模式为 `ready`；只有 `enter`/`check` 周期不可用或无效时才会显示 `degraded`。error finding 仍可按照具体 checkpoint 的保存屏障阻止该 checkpoint 提交。这项维护是只读的：不会自动运行 `init`、adopt 或执行 backfill，也不会自动写入 semantic handoff、Entry 或 Note。它会在进入模式、active undo/cold restore 后，以及 active、admitted 的 Goal continuation turn 在 turn end 发生 Research state 变化时运行，不是 session-end automatic closeout。

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

研究模式激活后，**研究面板**（Research Board）会同时出现在 TUI 和 Web 的输入区上方。默认紧凑 Board 采用 **science-first** 叙事：先讲清科研进展，再展示辅助任务状态。它突出显示：

- 当前 scientific phase 和最近一次 state transition
- latest progress，包括已完成的物理工作及其 insight 或 result
- 这些结果对 mainline 的影响和当前 uncertainty
- 当前有界行动与已记录的 external-run observation
- effective next step，以及 unresolved human gate 或 active alert

phase badge 会显示 `probing`、`ready` 或 `degraded`。模式、循环、问题、焦点和检查点变化会向两个 surface 发布一个完整快照。TUI 会拒绝 stale cold hydration；Web 会串行处理同一 session 的 mutation，并阻止较旧的 HTTP response 覆盖更新的 live WebSocket update。

面板跟踪的是语义化科研状态，而不是原始活动日志。普通工具调用和 AITP `list` / `show` / `check` 读取本身不会改变面板。研究模式激活后，Agent 会优先选择足够简单的解释或实验，并先获取成本最低但有决定性的证据，再升级到远程、长时间运行或多分支工作。只有简单 probe 无法判定问题时，才升级到远程、长时间运行或多分支工作。实质性工作前先创建 Question，设置焦点，用 `BeginResearchAction` 开始一个有界行动，并在完成后用 `ConcludeResearchAction` 说明实际物理工作、结果、测试或推导、限制、对主线的影响和下一步。`ConcludeResearchAction` 不提交或轮询 HPC 任务、不写入 AITP，也不会自动改变问题的 assessment。`PlanResearchAction`、`CompleteResearchAction`、`SetResearchPhase` 和 `RecordResearchProgress` 保留为较低层的恢复或维护工具，不是正常行动路径。只有在新证据、失败或持续无进展改变判断或下一动作时才调用 `UpdateResearchQuestion`。这是语义 guidance，不保证 candidate confirmation 会在 runtime guard 中保护每一次 focus 调用。如果没有发生这类语义转换，面板保持不变是预期行为。

TUI 还会把当前 session 的 `TodoList` 投影为 Board 中的 **Actions**。Todo 状态仍与 Research Question 和 AITP ledger 分离：完成一个 action 不会改变 epistemic 状态，也不会创建 AITP Entry。在 TUI 中按 `Ctrl-O` 可展开 derivation、tests、sources、问题计数、checkpoint、alerts、scheduler observation 和 Actions；`Ctrl-T` 仍是非研究模式下的 Todo 快捷键。在 Web 中点击 Board 上的 **Expand** 或 **Collapse**；Web 使用按钮和表单，不使用这些 TUI 键盘快捷键。

对于子代理工作，主代理可以审查严格类型的 evidence packet，其中包含 claim、evidence、assumptions、tests、sources、artifacts、limitations 和 confidence。审查 packet 本身是 zero-write：不会修改 assessment、epistemic state 或 AITP。主代理仍必须解释物理含义，并显式记录由此产生的 progress 或 question 变化。

对于 HPC 工作，loop 可以记录绑定当前 Research Action 的显式 observation：campaign、job ID、stage、scheduler state、观测时间、下次检查时间和 artifact 引用。这不是 scheduler 集成：Hakimi 不提交或轮询任务，不创建 campaign 实体，也不把 `RUNNING` observation 当作科研成功。终态 observation 必须显式携带 terminal state。

Agent 提出候选问题供你确认时，可以先把它们登记为开放 working state，使其出现在 Board 上。预期行为是在确认前不把候选设为 Focus、不持久化为 AITP decision，但 candidate confirmation 不是 `SetResearchFocus` 的 runtime 强制 guard。alerts 和 generic human gate 已实现；`ResolveResearchDecision` 只解析 runtime state，不会自动写入 AITP `decision` Entry。Hakimi Research Line 与 AITP workstream 属于不同命名空间：如果两者 slug 不同，Agent 可以读取已有 workstream，但不得静默创建 alias，也不得直接用 Research Line slug 进行持久化。

Board 为只读。变更请使用 `/research manage` 或直接 `/research` 子命令。两个 Manager 都以研究线为第一层，但控件不同。如果存在 unresolved gate 或 active alert，TUI 会先打开 **Attention view**：按 `R` 输入 resolution 并选择要恢复的 phase，按 `A` acknowledge alert，按 `L` 返回 lines；这里的 `R` 表示 resolution，不是 reopen。清除 attention 项目后，TUI 先选择 Research Line，再用键盘命令打开问题。Web 在可点击研究线列表旁提供 Line、Question、Science 和 Checkpoint 区；**Science** 可用显式 next phase 解决当前 human decision、acknowledge active alert、review typed evidence packet，或记录当前 external run 的 observation。这些控件通过 Research endpoint 更新 Hakimi Research working state，不写入 AITP ledger。

## 研究方向引导

研究模式对带 revision 的 mutation 使用乐观并发：这类命令会携带草稿捕获的 snapshot 或 entity `revision` 作为 `expectedRevision`，stale revision 会失败且不应用变更。checkpoint proposal 使用用户编辑表单时捕获的 Research snapshot revision，因此后续状态变化不能基于更新后的状态创建 pending checkpoint。其他 mutation 依赖捕获的 target 或 pending-checkpoint identity，以及服务端状态约束。TUI 会刷新 Board 以供重试；Web 会重新读取同一 session 的 authoritative snapshot。若 Web 表单处于 dirty 状态时收到更新的 live revision，Manager 会保留草稿、显示 stale warning，并要求刷新后重试，不会静默覆盖表单。

### 研究管理器

在任一 surface 中打开 Manager：

```
/research manage
```

在 TUI 中用 `↑` / `↓` 和 `Enter` 进行 line-first 导航；用 `F` 设置焦点，`E` 编辑措辞，`D` 延后，`B` 阻塞，`C` 关闭，`R` 重新打开，`Esc` 返回或取消。只有 Attention view 将 `R` 用作 resolution。在 Web 中点击选择研究线和问题，通过表单编辑字段，并使用带标签的按钮设置焦点、执行 workflow transition、暂停/恢复和保存。

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

`EnterAITPMode` 始终默认可发现，是显式进入模式的工具。进入后使用 `GetResearchStatus` 读取 authoritative snapshot；如果仍为 `probing`，应等待其收敛为 `ready` 或 `degraded`，不得重复调用、忙轮询或改用裸 CLI。模式 active 后，其余 Research 和 AITP 工具再按适配器健康状态分层开放。`theory-physics` skill 不会持久化普通 turn progress：只有 durable delta 才转交外部 AITP skill，只有在外部 plugin 已安装、Research Mode active 且 `distilling-methods` 当前可见时，才按需加载蒸馏指导。否则只保留 method candidate 与证据，不得声称已完成蒸馏或发布。当前只读取所选 Line / Question 的状态；无关研究线只贡献已蒸馏的方法。

- **读工具**（`aitp_enter`、`aitp_list`、`aitp_show`、`aitp_check`）— 适配器为 `ready` **或** `degraded` 时可用。降级模式下 Agent 仍可浏览账本和运行健康检查。
- **写工具**（`aitp_record_prepare`、`aitp_record_save`、`aitp_note_prepare`、`aitp_note_save`）— **仅**在适配器为 `ready` 时可用。写操作使用单飞保护：当前变更未完成前，并发的变更请求会被拒绝。

这一屏障意味着 AITP 不健康时 Agent 无法静默持久化证据。适配器会按照已安装的 AITP 契约，校验每个有版本的读响应和未版本化的 prepare/save 响应；未知 schema、未知 status 或额外 transport 字段都会 fail closed，不会被接纳为科研状态。`aitp_record_prepare` 只接受 `observation`、`result`、`failure`、`decision`、`source`、`code_change`、`run` 或 `closeout`；Note prepare 使用 `working` 或 `theory` 模式，save 只接受 prepare 返回的 draft path。

Web Manager 的 Checkpoint 表单保留这一边界。**Propose** 只创建 pending Research working state。只有存在 pending checkpoint 且你显式填写已有 AITP ledger `entryId` 时，**Commit** 才可用；该 ID 必须来自 Agent 或官方 AITP CLI 完成 canonical save flow 后的 Entry。Web 只把该 ID 发送给 Research command endpoint 以关联 checkpoint；它不会调用 `record`/`note`、写 `.aitp` 文件或创建 canonical Entry。填写 ID 也不能绕过 save → show → check 屏障。

`aitp_check` 把退出码 0 视为 clean，把退出码 1 视为成功返回 findings。findings 会保留展示，但不会使适配器降级。新增的 error finding 会让相关 checkpoint 保持 pending；已有的 error 会作为可审计的 receipt warning 保留。finding code 只作为 opaque string 投影；适配器不实现 AITP 的 `sha256-once:` 或 `check-policy` 语义。在进入或恢复时的维护周期中，合法的 error finding 仍保持 Research Mode receipt 为 `ready`；只有维护周期不可用或无效时才是 `degraded`。退出码 2 表示命令失败：有效的 AITP JSON 错误或无效的 check transport 会使适配器降级，参数解析错误则只报告为工具错误，不会污染整个会话。全文 `Grep` 可以定位候选记录，但完整的 canonical Entry 必须通过 `aitp_show` 读取；`aitp_show` 失败后，绝不能改用直接解析 Markdown 来模拟成功。

## 降级模式

以下任一条件满足时，适配器进入 `degraded`：

- 未找到 Python 3.11+
- AITP 插件缺失或合约版本不兼容
- workspace 未初始化（`not_initialized`）
- `aitp_check` 无法运行并返回有效的 AITP 错误，或其成功 payload 未通过契约校验

降级模式下：

- **读工具**仍可用——Agent 仍可列出和查看 AITP 条目。
- **写工具和 checkpoint commit** 被阻止——`record_save`、`note_save` 和 pending checkpoint commit 均无法执行。
- **AITP writes 和 active Research Mode 的 Goal 完成被阻止**——未解决的 human gate 也会阻止 Goal 完成。本地 Question/Line mutation 仍可能发生，但不是持久化的 AITP write。
- 研究模式不会执行 automatic session-closeout。它**不会**自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`，适配器也不暴露、不调用、不解析 upstream 的 `backfill-0.1` 成功 envelope。用户必须手动初始化 workspace 或解决 AITP 健康问题。

## 排除与限制

研究模式有以下硬性排除：

- **Plan overlay**：研究模式是长生命周期的科研上下文。Plan 模式是短生命周期、可嵌套的 overlay，可以与研究模式同时 active；进入或退出 Plan 模式不会退出或重置研究模式。Plan 不是第二个 Goal，也不负责 continuation。
- **Research 层级**：大课题属于 Research Line / Question / AITP 上下文。Goal 是当前阶段的 milestone 和跨 turn continuation owner；Plan 只是一个 Research Action 内的短期 overlay。
- **仅限主 Agent**：AITP 和 Research 变更工具仅在主 Agent 上可用。子 Agent 无法使用——必须通过类型化数据包将结果返回给主 Agent。
- **不提供自动恢复或 coordinator**：Hakimi 尚未实现 core auto-recovery、workspace auto-init/adopt/backfill、`/research goal` 命令或 native H6b coordinator；H6b method distillation 仍为 planned/unavailable。theory-physics skill 不增加这些行为或后台 loop。
- **会话撤销**：研究工作状态（问题、焦点、研究线）通过检查点模型跟随会话撤销。已提交的 AITP 游标**不**跟随——一旦检查点提交到 AITP，会话撤销无法撤回这一外部事实。

## 下一步

- [斜杠命令参考](../reference/slash-commands.md#research-mode) — 完整的 `/research` 命令语法
- [会话与上下文](./sessions.md) — 会话撤销如何与研究状态交互
- [使用目标模式](./goals.md) — 另一种特殊模式；存在 pending Research checkpoint 时，Goal 完成会被阻止
