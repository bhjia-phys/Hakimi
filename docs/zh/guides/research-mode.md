# 研究模式

研究模式（Research Mode）让 Hakimi 成为以 [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) 证据账本为支撑的联合研究伙伴。Agent 不再是回答一个问题就忘记，而是维护一个实时的研究问题看板，通过有界行动自主推进，并将持久检查点写入 AITP——同时你始终可以通过 `/research`、TUI 与 Web 中的 Research Board 和 Research Manager 掌控方向。

::: warning 注意
研究模式默认可发现，但运行时初始为 `inactive`。只有显式进入后才会探测 AITP 或显示 Research Board。AITP 集成仍受 [AITP 交接文档](../../aitp/README.md) 中的兼容性边界约束，包括 H5 仅部分集成以及 native H6b coordinator 的 planned/unavailable 状态。已经实现的 S7 handoff 只是在新 checkpoint commit 后同一轮做一次 best-effort Skill review；S8 只增加最新精确 checkpoint/Entry 的观察 receipt，它不是 H6b，也不提供 exactly-once recovery。
:::

## 前置条件

研究模式有三个硬性前置条件。Hakimi 只会在显式进入后检查它们；任何一项不满足时，active 模式会进入降级状态（见下文），持久化操作将被阻止。

- **Python 3.11 或更高版本** — AITP 适配器通过 Python 启动 AITP CLI。进入模式时适配器会探测可用的 Python；如果未找到兼容版本，模式将降级。
- **已安装 AITP 插件** — 会话技能目录中必须能发现 `aitp-research-protocol` 插件。适配器会解析插件根目录，读取其 `aitp.contract.json` 和 `kimi.plugin.json`，并验证合约版本。插件缺失或版本不兼容将导致降级。
- **已初始化的 AITP workspace** — 当前工作目录必须已经是已初始化的 AITP workspace。适配器**不会**自动初始化、领养或运行 `init` / `init --adopt` / `inventory` / `backfill --apply`。未初始化的 workspace 将导致降级。

当三项条件全部满足时，适配器进入 `ready` 阶段，受支持的 AITP 读写工具面对 Agent 可用。适配器不暴露、不调用、不解析 upstream 的 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:` 或 `check-policy` 语义。

对于理论物理研究，仓库内置的 `theory-physics` plugin 是可选的 domain pack，也是持续科研的唯一上层使用手册。即使 Research Mode 处于 inactive，它也可以被发现，并将持续请求路由为：进入 Research Mode、处理当前 Line / Question / Focus、在需要时显式确认 Goal↔Program 关系、执行一个有界 Research Action，再按需转交 AITP。普通的一次性物理问答不需要进入 Research Mode。

外部的 `aitp-research-protocol` plugin 仍是协议 authority。它的 `using-aitp` 与 `distilling-methods` skill 保持独立且仅在 active 时可用：durable scientific delta 转交 `using-aitp`；只有在该 plugin 已安装、Research Mode active 且该 Skill 当前可见时，才按需转交 `distilling-methods`。一个新 checkpoint 首次成功 commit 后，Hakimi 会加载该 plugin 的精确 Skill，对且只对 touched Entry 做一次有界 review；重复 commit、Skill 缺失或隐藏都是非阻塞 no-op。可选的 `hakimi/research-distillation-attention-0.1` snapshot receipt 只会为最新精确 committed checkpoint/Entry 显示 `review_requested` 或 `handoff_unavailable`；它不表示 Skill 发现 trigger、创建 card/trial、完成 review、批准或发布。否则只保留 method candidate 与证据，不得声称已完成蒸馏或发布。Hakimi 不复制它们的 CLI、schema、marker、method-card、trial、trigger 或 approval 规则；不会自动写 Topic Goal、`resolves` 或 method card。调用 `EnterAITPMode` 后使用 `GetResearchStatus`；如果仍为 `probing`，应等待其收敛为 `ready` 或 `degraded`，不得忙轮询或改用裸 CLI。

提交后的 Note 写入绑定成功 checkpoint commit 捕获的精确 Line/Topic/workstream confirmation。executor 检查准入，Note 工具在真正执行时再次核验归属，并在 Note I/O 前重新观测 Topic；只有 prepare 返回的精确本地 Note draft 可以编辑和保存。Note I/O 未返回时暂不允许本地切线或重新绑定；undo、restore、失去 ready、新 committed cursor 或 confirmation 改变都会撤销旧权限，迟到结果不能恢复权限。如果归属变化后 adapter 报告已经保存，错误仍保留报告的产物路径，应检查该产物而不是假定已回滚或盲目重试；在归属未变时，验证失败保留原 draft 供修正重试。

review context 是临时的：恢复出的 attention、重读证据或重复 commit 都不能恢复旧 draft 权限。确有价值的中断 review 或阶段综合可以开始新的 Question-bound Action，将所选 canonical Entry IDs 放在 `evidenceRefs`/`falsifierRefs` 中，并同时授予 `tool:aitp_note_prepare`、`tool:aitp_note_save`。host 在 prepare 和 save 前只通过 `aitp_show` 核验这些 Entry：必须在 captured Topic 中 active，且显式属于当前 workstream；Action、Question、Line 和已有 plan binding 必须仍 fresh，Note prepare 只指向该 workstream。冷恢复后需要重新 prepare，不能沿用旧草稿权限，也不要求先伪造新的科研 delta。已记录知识仍可读取，不可用的蒸馏不是 Goal continuation gate；这些本地核验不判断综合内容，也不提供持久化 review 调度。AITP 0.9 的原子 Topic/exact-workstream save 只适用于 Entry，不适用于 Note；Hakimi 不解析 Note frontmatter、不提供 Note membership 的原子保证或 OS-level sandbox，仍须遵守 AITP Skill 的验证和 human decision 规则。

对已经明确的工程小步骤，可选 Theory Physics 插件提供 `calculation-operator` profile。让主 agent 委派这个有界检验；它必须先建立带 subagent capability 的 Action。operator 返回 typed evidence packet；只有主 agent 解释证据、结束 Action 并通过 AITP 记录。`/preset` 单独选择模型路由。这是受限工具的角色提示，不是新 runner、继承的逐命令 Action policy 或 OS sandbox；真实计算/retry 验收仍在合作者计划中单独跟踪。

## 进入研究模式

Research Mode 不需要选择性启用开关。`/research` 命令和 `EnterAITPMode` 能力默认可发现。每个新建 session 初始都为 `inactive`，而 hydration 会保留已持久化的 mode。inactive 状态的恢复加载、`getResearch` 和 GET/快照读取只使用本地快照：不会发生 AITP I/O，不会探测 workspace，Research Board 也保持隐藏。持久化为 active 的 session 在 cold restore 后仍保持 active；cold restore 会重新探测适配器并执行只读的 `enter` → `check` 维护周期。其他 Research/AITP 工具以及 AITP plugin skill 仍仅在 active 状态下可见。

旧的 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` 环境变量、`[experimental].aitp_research_mode` 和 `KIMI_CODE_EXPERIMENTAL_FLAG` 对这个正式开放的能力均不生效，不会隐藏或启用入口；总开关对其他实验功能仍然有效。要从 inactive session 激活 AITP 支撑的能力，请直接用 `/research` 切换、在 Web 中选择 **Research**，或让模型调用 `EnterAITPMode`。active conversation undo 和 cold restore 也会重新探测适配器，并在探测就绪后执行只读的 `enter` → `check` 维护周期。Research Mode 绝不自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`。

## 启动与停止

在 Web 中，打开 composer 的 **Modes** 菜单并选择 **Research**。共享快照处于 inactive 时，该入口会显式进入 Research Mode 并显示 Research Board；快照进入 `probing`、`ready` 或 `degraded` 后，同一行会保持 active，并打开 Research Manager。该按钮不会创建问题，也不会调度模型轮次。

你可以在 TUI 或 Web composer 中使用 `/research` 直接切换模式。Web 会把这个命令路由到 Research command endpoint，而不是作为模型提示词发送。Hakimi 激活 AITP adapter 后会在检查 workspace 时进入 `probing`，随后通过 live Research Board 显示 `ready` 或 `degraded` 结果。进入后请提交研究问题、继续已有 Goal，或者让模型在处理科研请求时调用 `EnterAITPMode`。显式的 `on`/`off` 形式继续兼容，`on --` 仍可在进入时选择特定研究线：

```text
/research
/research on -- boundary-zero-mode
```

仅 TUI 在从 `manual` 或 `yolo` 权限模式进入时显示键盘提示，询问是否切换到 `auto` 或 `yolo`。Web 使用 session 当前的权限模式；如需更改，请先通过 Web 控件设置。两个 surface 都不会启动独立后台循环，在 `manual` 下研究轮次仍可能等待审批；跨轮次的自主 continuation 只由已有 Goal 负责。

当 Research Mode 为 active 且未暂停时，每个经过 typed ingress 的 main-agent 用户 prompt 在 `ready` 或 `degraded` 下都会获得 transient `interactive_research` lease，携带 Research context 进入一次 Research turn；degraded 探索属于临时工作，不表示 AITP 状态已重新核验或保存，也不会 enqueue 下一轮。只有在 `ready` 且现有 Research continuation guards 放行后，由 Goal engine 排入的 Goal-owned continuation 才获得独立的 `autonomous_research` lease；自主回合中途发生 degraded 时，后续 Action 工作也被 hold。system、cron、subagent、unclassified、inactive、probing 和 paused turn 仍 abstain。两类 lease 都只存在于 runtime，不持久化，也不加入公开 wire schema。

在 `auto` 下，模型发起的有界 Research Action 不会另行创建常规执行审批 gate：`requires_human_approval` 会被关闭，普通工具风险提示也可能被抑制。但 `auto` 不替人做科学判断。真正不可委托的科学或协议选择仍使用 `RequestResearchDecision`，它在所有权限模式下都会创建 durable human gate。恢复 session 或切换到 `auto` 时，只有在 Research Loop active 的前提下，Hakimi 才把与当前 planned action 绑定的 unresolved approval 视为已有的 auto 执行授权并启动该 action；历史 review、无 action 的 approval 和 scientific-decision gate 永远不会被自动解决。

### Web 手动检查

模型在 typed 用户回合内打开 Research Mode 时，入口收敛后即可准入，无需用户再发一条消息。同一回合只做一次本地 Research boundary，adapter readiness 变化不会重复计数；退出或暂停会撤销准入，下一次正常 step-head injection 读取当前状态。mode update 不会创建或恢复 Goal continuation lease。

1. 从 inactive 且 session 空闲的状态打开 **Modes** 并选择 **Research**。确认 Board 出现并先进入 `probing`，随后进入 `ready` 或 `degraded`，且没有调度模型响应。
2. 再次打开 **Modes**，点击 active 的 **Research** 行或 **管理**。确认打开 Research Manager，而不是退出研究模式。
3. 再运行一次 `/research`。确认 Board 和 **Research** tag 消失，**Modes** 中的 Research 行恢复为启动操作。
4. 从 inactive session 发送一条使模型调用 `EnterAITPMode` 的科研请求。确认同一个 Board 和 active **Research** 入口自动出现。
5. 重启 Hakimi。确认 **Research** 行和 `/research` 斜杠菜单入口仍默认可发现，而新 session 初始为 inactive，显式进入前不会发生 AITP I/O。

退出研究模式：

```text
/research
```

退出时会撤销 AITP 工具授权，并在两个 surface 中隐藏 Research Board。已保存的 AITP 记录**不会**被删除——它们持久保留在账本中。

## 查看状态

随时查看当前研究快照：

```
/research status
```

在 TUI 中，该命令会显示模式阶段、循环状态、当前研究线、焦点问题、AITP adapter 健康状态，以及（可用时）current-state maintenance 摘要；在 Web 中，它会刷新 authoritative session snapshot，并展开 live Board。

## 当前状态维护（current-state maintenance）

适配器 probe 报告 `ready` 后，Hakimi 先执行一次无作用域的 `enter`，只观测当前 Topic identity 和 revision，不采纳全局 handoff 或 evidence set。只有当前 Research Line 已为该 Topic revision 建立精确的 confirmed binding 时，Hakimi 才会对其 workstream 执行只读的 scoped `enter` → `check` maintenance。没有这条 binding 时，会清除旧 maintenance scope，不作任何 scoped maintenance 声明。

maintenance receipt 和上下文注入只暴露安全摘要：Working Note age、active state 是否更新、未解决 failure 数、next action、warning code，以及 check 的状态、计数和 finding code。完整 Research snapshot/API 响应或展开的 Board 仍可能包含 checkpoint、revision 和 adapter health 字段；这些 projection 不等同于 maintenance receipt 或上下文注入。

合法的 check findings（包括 error finding）会保持模式为 `ready`；只有 scoped `enter`/`check` 周期不可用或无效时才会显示 `degraded`。error finding 仍可按照具体 checkpoint 的保存屏障阻止该 checkpoint 提交。这项维护是只读的：不会自动运行 `init`、adopt 或执行 backfill，也不会自动写入 semantic handoff、Entry 或 Note。它会在进入模式、active undo/cold restore 后，以及 admitted interactive 或 autonomous Research turn 在 turn end 发生 Research state 变化时运行，但只能使用当前精确确认的 Line→workstream binding 作为 scope。这不是 session-end automatic closeout。

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

Research Mode 与 Goal 相互关联，但不拥有同一套生命周期：

| 层级 | 负责 | 不负责 |
| --- | --- | --- |
| generic Goal engine | objective 状态、completion、budget、waiting，以及跨 turn 自动 continuation | 科研 phase、Line、Question、evidence 或 AITP records |
| Hakimi Research Goal | 当前 generic Goal 的一对一科研投影，包括 Research scope 与 persistence guards | 第二套生命周期、预算、scheduler 或 continuation queue |
| Research Mode | interactive Research turn 的准入与长期 Research working state | 自动创建 Goal 或自动产生 autonomous turn |
| Research Plan v2 | 绑定 Goal 与 Program 的多轮 milestones 和证据策略 | Goal completion 或 turn continuation |
| local Action Plan | 单个 bounded Research Action 的细节 TODO 与 reviewed choices | 多轮 strategy 或 scientific truth |
| Research Loop / Action | 一次 admitted turn 及其正常的 `BeginResearchAction → 实际工作 → ConcludeResearchAction` 单元 | canonical AITP persistence |
| AITP Program 与 ledger | observed Topic goal、canonical Entry/Note evidence、workstreams 与 human decisions | Hakimi Goal 生命周期、工具执行或 Board 状态 |

因此，Research Mode 只要 active、ready 或 degraded 且未暂停，即使没有 Goal，也会
让用户的交互 turn 进入 Research Loop。只有跨 turn 自动 continuation 才
要求 Goal。存在 Goal 时，Research Goal 只是它的科研投影而不是替代品；
Goal–Program alignment 约束自动续跑和完成，但不能遮住当前 bounded
action 的恢复工作。

研究模式激活后，**研究面板**（Research Board）会同时出现在 TUI 和 Web 的输入区上方。默认紧凑 Board 只保留一眼就需要判断的信息：

- **Project**：存在 Goal 时显示其 lifecycle/continuation；没有 Goal 时明确显示交互式 Research；当前 Research Plan 里程碑、Line 和焦点 Question 的 workflow/epistemic 状态都只在这里出现
- **Current cycle**：显示一个仅用于呈现的科研节点（`问题框定 / 假设`、`检验 / 行动`、`评估`、`记录` 或 `下一步 / 就绪`）、当前 action/run/progress 摘要、Research mode、规划策略，并把旧字段 `period.loopCount` 准确标为 **Research turn 数**，不再称作已完成的科学循环数
- **Attention**：依次显示精确的 Goal continuation hold、未解决人工门禁、action/phase 恢复要求、pending checkpoint、active Goal–Program 或 Line–workstream 阻塞、method-review handoff 不可用、当前 Line 的 alert、维护问题或适配器错误；健康的 AITP、alignment、workstream 和 provenance 默认折叠，其他 Line 的 alert 绝不冒充当前 attention
- **Next**：只显示一个带来源的 effective next step；缺失时明确提示尚未记录

Project 中的 **Hakimi Research Goal** 是唯一负责跨轮次 continuation 的 generic Goal 的 additive `hakimi/research-goal-0.1` 投影，不是第二套 scheduler，也不是 AITP Topic Goal。展开 Board 仍是完整审计面：显示完整 Goal 与 observed AITP Program goal、Program/Line/Question scope、两层计划、证据、checkpoint 和 provenance；旧 `goalSummary` 继续作为兼容 fallback。紧凑态的长叙事会按终端可用宽度或 Web 两行截断；展开 Board 后会恢复完整文本。

Goal lifecycle 与 continuation 是两个维度。`active` 表示 objective 仍可
推进，不代表另一个模型 turn 已经运行或进入队列。可选的 continuation 投影
区分 `idle`、`deciding`、`enqueued`、`running`、`held` 和 task
`waiting`。被 hold 的 Goal 显示为 `active · continuation held`，展开 Board
和 Attention 行同时给出 participant owner 与精确 reason，不能改写成
`paused`。该字段是 runtime 派生状态；显式 retry、用户新 turn、生命周期
变化、waiting、cancel、replay 与 resume 都会清除或重新计算 stale hold。

紧凑 header 会分开显示 **mode** readiness、**workflow** health、仅用于
呈现的科研节点和当前 Line。adapter/AITP 健康只在需要 Attention 时或展开
审计面中显示。因此 `mode ready · workflow blocked` 是一致状态：Research
Mode 能工作，但当前 Research state 必须先恢复。effective Next 与 Attention 使用同一优先级：未解决
human gate、失配 live action、状态一致的 run/action、pending
checkpoint、Goal–Program alignment，最后才是普通 question 或 maintenance
指引。Next 的文字、source、freshness、timestamp 与 provenance 属于同一
条原子投影；TUI 和 Web 不再把本地覆盖的文字与另一条 Next 的 metadata
拼在一起。

每个被准入的 Research turn 都会在模型上下文注入前，由共享 coordinator
执行一次确定性的本地对账。它只能修复可机械判定的 Line、Action/phase、
period、已提交 cursor 和 alert 结构；不会额外运行一次 AITP maintenance、
推断科研结论、完成或放弃 Action，也不会替用户处理 checkpoint。若 pending
checkpoint 捕获的 Question revision 或 Program / Line binding 已可证明过期，Board 会把它标为历史提案并明确禁止作为当前证据提交。只有同时不存在 `committedEntryId`、save receipt 和 committed cursor/history 痕迹时，reconciliation 才会自动 discard；`/research discard-checkpoint <id>` 暴露同一套守卫供显式恢复。只要有迹象表明 save 边界可能已经跨过，提案就会 fail closed 保留供检查。紧凑 Board 对同一阻塞原因只计数一次，完整记录仍保留在展开态
各自所属的区域中。展开态 adapter health 还会把读取就绪与
adapter-contract-0.2 的 scoped checkpoint 写入能力分开显示。

模式、循环、问题、焦点和检查点变化会向两个 surface 发布一个完整快照。TUI 会拒绝 stale cold hydration；Web 会串行处理同一 session 的 mutation，并阻止较旧的 HTTP response 覆盖更新的 live WebSocket update。

切换 Line 是显式的 cycle boundary。存在 foreground Action/Run、pending
checkpoint、未解决 human gate 或非 `idle` scientific phase 时，Hakimi 会
拒绝切线并只给出一条恢复指令；cycle 解决后，旧 period 会先归档焦点 Question
和最新 progress 摘要，再打开新 Line。Hakimi 只会 reconcile 可确定、保持语义
不变的本地引用和 receipt；不会猜测 AITP workstream membership、写 AITP
状态或自动修补科学含义。

cold replay 也遵守同一边界。旧的单 Line snapshot 可以缺少可选的 Goal
continuation 字段；Board 会把它标为 unavailable，而不是臆造 `held`、
`running` 或完成状态。在多 Line snapshot 中，只有当前选中的 Line 可以提供紧凑
Question、Action、Run、gate、alert、continuation attention 与 Next 状态。如果
replay 发现 live Action 脱离了它唯一可确定的所属 phase，Hakimi 会幂等恢复该
phase，同时保留 Action 和已经记录的 human resolution；随后阻止 Goal completion、
hold autonomous continuation，并把下一次 interactive Research turn 定向到检查
已有证据以及完成或放弃同一个 Action。Hakimi 绝不会仅从 UI 结构推断
`completed` 或 `abandoned`，也不会只为修复记账而询问用户；真实的科学或授权
歧义仍可进入 human decision。

面板跟踪的是语义化科研状态，而不是原始活动日志。普通工具调用和 AITP `list` / `show` / `check` 读取本身不会改变面板。研究模式激活后，Agent 会优先选择足够简单的解释或实验，并先获取成本最低但有决定性的证据，再升级到远程、长时间运行或多分支工作。一旦简单 probe 证明更大的 action 确有必要，就应当继续执行；如果当前权限模式已经授权，不应再虚构一道额外的 human approval。Agent 必须在实质性工作前先创建 Question，设置焦点，用 `BeginResearchAction` 开始一个有界行动，并在完成后用 `ConcludeResearchAction` 说明实际物理工作、结果、测试或推导、限制、对主线的影响、下一步和一次显式 durability assessment。`no_durable_delta` 只记录一次 Research progress 边界，不安排 S6 persistence 或 distillation I/O；独立的 session-boundary `enter` / `check` maintenance 仍可运行。`durable_delta` 只生成一个 typed pending commit candidate，并在同一轮路由到现有 `record prepare` → 模型填写 draft → atomic `record save` → canonical `show` → scoped `check` → checkpoint commit barrier。首次成功 commit 随后返回一个 same-turn steer，只包含精确的外部 `distilling-methods` Skill 与 touched Entry/checkpoint 上下文。Skill 可以 no-op；重复 commit 或 handoff 不可用不会重复执行，也不会回滚已成功的 durable commit。`ConcludeResearchAction` 本身不提交或轮询 HPC 任务、不直接写 canonical `.aitp` 文件，也不会自动改变问题的 assessment。不得再用 `RecordResearchProgress` 重复同一结论。human assertion/decision 必须使用独立的 human-attributed candidate 与 Entry，不得与 agent/tool/source verification 合并。`PlanResearchAction`、`CompleteResearchAction`、`SetResearchPhase`、`RecordResearchProgress` 和手工 checkpoint proposal 保留为较低层的恢复或维护工具，不是正常行动路径。当 action 仍为 planned 或 in progress 时，独立 phase/progress mutation 会被拒绝，避免 live action 离开所属阶段后被卡死；若旧版本已经留下 phase 漂移的 in-progress action，只要没有未解决 human gate 占有暂停状态，仍可 complete 或 conclude 以恢复循环。只有在新证据、失败或持续无进展改变判断或下一动作时才调用 `UpdateResearchQuestion`。这是语义 guidance，不保证 candidate confirmation 会在 runtime guard 中保护每一次 focus 调用。如果没有发生这类语义转换，面板保持不变是预期行为。

展开后的 Board 会把完整科研记录分为研究方向、当前工作、研究地图、证据与不确定性，以及操作或持久化信息。它会保留完整的 period、多轮 Research Plan、有界 Action Plan 和 status projection；所有可用的 Research Line、Question、alert、证据引用、不确定性、checkpoint、run 详情、AITP 维护项目和最新 method-review handoff receipt 也都会完整展示，不会静默用「另有若干项」取代剩余集合。

规划有两个显式层级。additive `hakimi/research-plan-0.2` 是绑定 Goal 与 observed Program 的多轮 strategy，记录 milestones、evidence requirements、decision points、assumptions、current milestone 与 stop/replan conditions。旧 bounded `ResearchPlan` 保持 reviewed local Action Plan 的原义，并在兼容期同时以 `actionPlan` 投影。非 trivial action 必须同时捕获 active Research Plan milestone revision 与 approved local Plan revision；reversible one-step action 也会获得 explicit minimal Action Plan binding。任一层或其 Goal/Program/Line/Question context stale 时，action 不能 start 或 conclude。完成 plan 不会关闭 Question、写 AITP 或完成 Goal。

checkpointed planning policy 与这两个层级正交。默认 `collaborative` 只有在 consequential unknown 无法从 active Goal、当前 Research state、此前明确的人类指导或已检验证据中解决，并且答案会实质改变 Research Plan 时，才把它交给既有 `AskUserQuestion` UI。如果 `auto` 抑制了 `AskUserQuestion`，Agent 必须继续收集不承诺路线的证据，或对真正不可委托的选择使用 `RequestResearchDecision`，不能直接猜测。Agent 不得要求用户重述或重新批准已经存在的 Goal、completion criterion、scope、已确认 Program relation 或 Plan decision；dismiss、空答或含糊答复都保持 Plan 不变。`dreaming` 是 Goal 驱动的自主规划策略：Goal、scope 与 completion criterion 明确后，它会在 Goal-owned Research turns 中持续选择下一个 reversible、low-cost、in-scope 步骤，不逐步征求确认，并把每项默认判断记录进 Plan 的 `assumptions`。无论哪种策略，昂贵或不可逆动作、科学约定歧义、Goal/scope 变化以及 AITP/human-decision gate 都不能被自动回答或绕过。工具权限模式保持独立：`auto` 可以消除常规执行提示，但不能产生 Research capability 或替人回答 `RequestResearchDecision`。切换 planning policy 是带 revision 的 Hakimi state mutation，不写 AITP；Manager 的 Plan 视图负责切换，展开 Board 负责显示。

TUI 还会把当前 session 的 `TodoList` 投影到展开态的 **External Todo actions** 中。Todo 状态仍与 Research Question 和 AITP ledger 分离：完成一个 action 不会改变 epistemic 状态，也不会创建 AITP Entry。在 TUI 中按 `Ctrl-O` 可展开或折叠 Board；`Ctrl-T` 仍是非研究模式下的 Todo 快捷键。在 Web 中点击 Board 上的 **Expand** 或 **Collapse**；Web 使用按钮和表单，不使用这些 TUI 键盘快捷键。

对于子代理工作，主代理可以审查严格类型的 evidence packet，其中包含 claim、evidence、assumptions、tests、sources、artifacts、limitations 和 confidence。审查 packet 本身是 zero-write：不会修改 assessment、epistemic state 或 AITP。主代理仍必须解释物理含义，并显式记录由此产生的 progress 或 question 变化。

对于 HPC 工作，loop 可以记录绑定当前 Research Action 的显式 observation：campaign、job ID、stage、scheduler state、观测时间、下次检查时间和 artifact 引用。这不是 scheduler 集成：Hakimi 不提交或轮询任务，不创建 campaign 实体，也不把 `RUNNING` observation 当作科研成功。终态 observation 必须显式携带 terminal state。

`ObserveResearchRun` 也可以更新已完成或放弃的 Action 保留的既有作业。必须使用原 Action/campaign/job 身份和当前 Research revision；省略 source/binary pins 时保留原值，身份或终态冲突则拒绝。这个窄恢复路径在 loop 暂停时仍可用，但不会恢复 loop、解决人类决策、更新原结论、写 AITP 或授予通用工具权限。观察须来自已经授权的来源，该操作本身不轮询作业，也不允许新 Action 替换仍在运行的前景作业。收到终态观察后，下一 Action 仍须满足待处理记录和人类决定等既有条件。

Agent 提出候选问题供你确认时，可以先把它们登记为开放 working state，使其出现在 Board 上。预期行为是在确认前不把候选设为 Focus、不持久化为 AITP decision，但 candidate confirmation 不是 `SetResearchFocus` 的 runtime 强制 guard。alerts 和 generic human gate 已实现；`ResolveResearchDecision` 只解析 runtime state，不会自动写入 AITP `decision` Entry。

Board 为只读。变更请使用 `/research manage` 或直接 `/research` 子命令。两个 Manager 都以研究线为第一层，但控件不同。如果存在 unresolved gate 或 active alert，TUI 会先打开 **Attention view**：按 `R` 输入 resolution 并选择要恢复的 phase，按 `A` acknowledge alert，按 `L` 返回 lines；这里的 `R` 表示 resolution，不是 reopen。清除 attention 项目后，TUI 先选择 Research Line，再用键盘命令打开问题；按 `W` 确认 AITP workstream binding，按 `X` 清除已有 binding，按 `V` 查看 multi-loop plan，按 `P` 切换 planning policy。携带 exact revision 的 `A`、`C`、`D` 会在合法状态下 activate、complete 或 discard plan。Web 在可点击研究线列表旁提供 Line、Question、Science、Checkpoint 和 Research Plan 区。Line 区显示 observed Topic、binding status 与 provenance，并提供显式 confirm/clear 控件；Plan 区暴露相同的合法 transition 与 policy 选择。plan 内容由 agent 的 `PrepareResearchPlanV2` tool prepare/revise，不增加第二个无版本 UI editor。**Science** 可用显式 next phase 解决当前 human decision、acknowledge active alert、review typed evidence packet，或记录当前 external run 的 observation。这些控件通过 Research endpoint 更新 Hakimi Research working state，不写入 AITP ledger。

## Line–workstream 绑定

Hakimi Research Line 是本地 orchestration state，AITP workstream 是 canonical record 上的显式 membership tag；两者属于不同命名空间。无作用域的 `enter` 观测到当前 Topic 后，用户或 main agent 可以确认一条带 revision 的本地 Line→workstream binding。Hakimi 绝不从相同 slug、prose、path、record ID 或其他相似性推断该 binding；确认操作也绝不写 AITP。

共享 Research snapshot 通过 REST、WebSocket、Node SDK、klient、TUI 和 Web 投影 confirmed binding records 与当前 Line 的派生状态。每条记录还带有 server-generated opaque `confirmationId`；clear 必须回传同一 snapshot 中看到的精确 identity 与 public Research revision：

| 状态 | 含义 |
| --- | --- |
| `unbound` | 该 Line 没有显式确认。 |
| `unavailable` | 已保存 binding，但当前没有观测到 AITP Topic。 |
| `bound` | 已保存的 Topic ID 与 observed revision 精确匹配当前 Topic observation。 |
| `stale` | Topic 相同，但 observed revision 已变化；需要重新确认 membership。 |
| `conflict` | 已保存 binding 属于另一个 Topic。 |

`unbound`、`unavailable`、`stale` 或 `conflict` 的 Line 仍可继续低风险本地探索，但不能 propose 或 commit scoped durable checkpoint，Hakimi 也不会为它运行 scoped maintenance。在 turn-end、Line switch maintenance 以及 checkpoint prepare/save 前，Hakimi 会先重新做一次无作用域 Topic observation，再重算精确 binding；Topic 已变化时 scoped I/O 为零。checkpoint 会捕获精确 binding tuple，并在 prepare、canonical `show`、scoped `check` 和 commit 各阶段重新校验；`show` 返回的 Entry 必须精确匹配 captured Topic，且只能包含唯一一个 captured workstream。切换 Research Line 时，只有目标 Line 已有自己的精确 confirmed binding 才会切换 maintenance scope。

Binding 是 immutable confirmation。重新绑定前必须显式清除旧 binding；stale revision 或 confirmation identity 必须刷新后重试。live action 或 pending checkpoint 存在时不能修改 binding。checkpoint-bound save 要求 AITP 0.9.0 adapter-contract 0.2，Hakimi 自动把 captured Topic 与 exact singleton workstream 传给 atomic `record save`；mismatch 不产生 canonical Entry，post-save `show` 与 scoped `check` 继续作为 defense in depth。如果 canonical save 成功时本地 binding 同时变 stale，Hakimi 会保留 save receipt、进入 degraded，并要求先 undo pending checkpoint proposal 再重新绑定。reset/exit 与 mutation 竞态仍可能 indeterminate：必须先检查 canonical state，并只用相同 recovery identity 重试。undo 和 cold restore 会重放已保存的 binding，再与新观测的 Topic 比较；不会推断、修复或 backfill membership。

AITP 0.9.0 仍没有 workstream registry，因此 confirmation 不能证明该 workstream 已有 records。空的 scoped result 是合法的；legacy unscoped records 仍在 scope 之外，`counts.outside_scope` 是 global−scoped 的计数差，不是 finding 或 membership 证明。Hakimi 不新增 registry、alias catalog、automatic backfill 或 AITP schema。

## Goal–Program 对齐

Hakimi Goal、observed AITP Program 和 Local Research Loop 是彼此独立的记录。Program 的顶层 AITP Research Goal 只通过 `enter` 观测；Hakimi 从不写 AITP Topic 或 `TOPIC.md`。

存在 generic Goal 时，Research snapshot 会把它一对一投影为 Hakimi Research Goal，包括 objective、completion criterion、当前 Research scope、完整 budget、派生 stop conditions、Program relation、human gates、persistence guards 和 Research revision。interactive Research 不要求 Goal。当前 generic Goal contract 没有结构化 non-goals 或单独声明的 stop-condition 输入，因此投影诚实返回空 `nonGoals`，并只从已知 runtime budget 和 guards 派生 stop conditions；不会解析 Goal prose 来猜结构。

active Research Goal 要完成或自动继续前，必须显式确认它与 observed Program 的关系。该 binding 只在 Hakimi 中 checkpointed，绝不根据文本相似度推断：

| 关系 | 含义 |
| --- | --- |
| `same_program_goal` | Hakimi Goal 与 observed Program 表达同一目标。 |
| `goal_parent_of_program` | Hakimi Goal 更宽泛，observed Program 是其子项之一。 |
| `goal_milestone_in_program` | Hakimi Goal 是 observed Program 内的一个 milestone。 |
| `unrelated` | Goal 与 observed Program 被显式确认为无关；这是唯一的明确 conflict。 |

没有 binding 时状态为 `confirmation_required`。如果 active Goal 尚未观测到 AITP Program，状态为 `unavailable`；在再次观测到 Program 前，这同样会阻止 Goal completion 与 automatic continuation。Hakimi Goal、AITP Topic 或 observed Program revision 变更时，已有 binding 变为 `stale`；只有 `unrelated` 会形成 `conflict`。在 active Research Mode 中，`unavailable`、`confirmation_required`、`stale` 和 `conflict` 都会阻止 Goal completion 与 automatic continuation；adapter 仍在 probing 或已经 degraded、存在 pending Research checkpoint、或有 unresolved human gate 时也会同时阻止两条路径。inactive Goal 不受影响。

该命令要求当前同时存在 Hakimi Goal 和 observed AITP Program。它使用捕获的 Research snapshot revision 实现乐观并发，因此 stale snapshot 必须刷新后再试。TUI 和 Web Board 都可以确认或清除 binding；这两种操作都绝不写入 AITP。

## 研究方向引导

研究模式对带 revision 的 mutation 使用乐观并发。public Research snapshot revision 是 world-time publication token：它不随 conversation undo 回退，每个不同的完整 snapshot 都获得严格更新的 token。这类命令会携带草稿捕获的 snapshot 或 entity `revision` 作为 `expectedRevision`，stale revision 会失败且不应用变更；binding clear 还携带精确的 server-owned confirmation identity。checkpoint proposal 使用用户编辑表单时捕获的 Research snapshot revision，因此后续状态变化不能基于更新后的状态创建 pending checkpoint。其他 mutation 依赖捕获的 target 或 pending-checkpoint identity，以及服务端状态约束。TUI 会刷新 Board 以供重试；Web 会重新读取同一 session 的 authoritative snapshot。若 Web 表单处于 dirty 状态时收到更新的 live revision，Manager 会保留草稿、显示 stale warning，并要求刷新后重试，不会静默覆盖表单。

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
| `/research discard-checkpoint <checkpointId>` | 只丢弃可证明已过期且从未提交的 checkpoint 提案 |
| `/research align same_program_goal\|goal_parent_of_program\|goal_milestone_in_program\|unrelated` | 显式确认本地 Goal–Program 关系 |
| `/research align clear` | 清除本地 Goal–Program binding |

示例：

```
/research focus q-17 -- 用小晶格扫描探测边界零模
```

## 保存、查看与检查屏障

### Action 作用域工具强制

Research Mode active 时，Research Action 归属直接成为 admitted Research turn 上由统一 Tool Executor 强制的策略，不需要实验开关。

启用后，状态/控制工具和严格限定的恢复工具可以在没有 active Action 时运行。新的科研工作则必须具有处于 `action_executing` 的 `in_progress` Action、fresh 的 Line/Question/Plan binding、没有 unresolved human gate，并取得与 `allowed_tool_kinds` 匹配的 capability。已知 capability 为 `workspace_read`、`workspace_write`、`web_search`、`web_fetch`、`shell`、`task`、`subagent` 和 `scheduler`；其他未知 plugin/MCP 工具必须取得精确的 `tool:<小写工具名>` 授权，否则默认拒绝。同一个 tool-call batch 中的 `BeginResearchAction` 与工作工具会被拒绝，避免 Begin 失败时未归属的工作先行执行。

回读已有知识是一项严格限定的只读例外，不是开展新的 Action 工作。模式为 `ready` 时，`Read` 可以读取一个精确的 workspace-relative `.aitp/topic/notes/note-<id>.md`；AITP `show` 只支持 Entry，不支持 Note。`Grep` 可以在 `.aitp/topic/notes/` 下发现通用 `^> method-card:` 标记，或在 `.aitp/topic/entries/` 下发现 `^> method-observation:`；两者也可在 `.aitp/topic/` 下检索，但仅允许 `files_with_matches` 输出。这些读取无需 live Action，包括 commit 后以及 Goal/loop 暂停时。它们不授予一般搜索、跨工作区的绝对 Note 路径、Entry 文件读取、shell 或写权限。适用性和依据仍由 Skill 检查；标记数量不是证据，runtime 不会主动扫描。

已绑定的 Action 以 durable delta 结束后，checkpoint 持久化使用另一条只绑定 pending checkpoint、精确 AITP Topic/workstream 与精确 draft path 的窄 lease。未绑定的本地结论不授予 draft 或 canonical-write 权限。Note/Method-card 持久化同样只使用成功 `note prepare` 返回的精确 draft path，并在 save、退出模式、undo 或 cold restore 后撤销。其他直接访问 canonical `.aitp/topic` 文件仍被拒绝；canonical write 仍只能经过 AITP adapter 与 CLI contract。

这属于 Tool Executor policy，不是操作系统级 sandbox。获准的 `shell` capability 本身仍很宽，host 的常规 command approval 和文件系统/网络隔离才是更底层的安全边界。该策略阻止标准模型工具调用绕过 Research Action 归属，但不声称能够隔离已被攻陷的 subprocess 或外部程序。

`EnterAITPMode` 始终默认可发现，是显式进入模式的工具。进入后使用 `GetResearchStatus` 读取 authoritative snapshot；如果仍为 `probing`，应等待其收敛为 `ready` 或 `degraded`，不得重复调用、忙轮询或改用裸 CLI。模式 active 后，其余 Research 和 AITP 工具再按适配器健康状态分层开放。`theory-physics` skill 不会持久化普通 turn progress：只有 durable delta 才转交外部 AITP skill。填写可能可复用的执行证据之前，Agent 会检索相关 card 并遵循 `distilling-methods`，使 Entry 在创建时带上该 Skill 要求的 exact card pin 或 observation marker。首次 commit 后，Hakimi 再为 touched Entry 加载一次精确的 AITP plugin Skill 做有界 review；是否满足 trigger 只由 Skill 判断。否则只保留 method candidate 与证据，不得声称已完成蒸馏或发布。当前只读取所选 Line / Question 的状态；无关研究线只贡献已蒸馏的方法。

- **读工具**（`aitp_enter`、`aitp_list`、`aitp_show`、`aitp_check`）— 适配器为 `ready` **或** `degraded` 时可用。降级模式下 Agent 仍可浏览账本和运行健康检查。
- **写工具**（`aitp_record_prepare`、`aitp_record_save`、`aitp_note_prepare`、`aitp_note_save`）— **仅**在适配器为 `ready` 时可用。写操作使用单飞保护：当前变更未完成前，并发的变更请求会被拒绝。

这一屏障意味着 AITP 不健康时 Agent 无法静默持久化证据。适配器会按照已安装的 AITP 契约，校验每个有版本的读响应和未版本化的 prepare/save 响应；未知 schema、未知 status 或额外 transport 字段都会 fail closed，不会被接纳为科研状态。`aitp_record_prepare` 只接受 `observation`、`result`、`failure`、`decision`、`source`、`code_change`、`run` 或 `closeout`；Note prepare 使用 `working` 或 `theory` 模式，save 只接受 prepare 返回的 draft path。

Web Manager 的 Checkpoint 表单保留这一边界。**Propose** 只创建 pending Research working state，且要求当前 Line 具有精确的 `bound` workstream confirmation。只有存在 pending checkpoint 且你显式填写已有 AITP ledger `entryId` 时，**Commit** 才可用；该 ID 必须来自 Agent 或官方 AITP CLI 完成 canonical save flow 后的 Entry。Web 只把该 ID 发送给 Research command endpoint 以关联 checkpoint；它不会调用 `record`/`note`、写 `.aitp` 文件或创建 canonical Entry。Entry 与 scoped check 仍必须匹配 pending checkpoint 捕获的 binding，因此填写 ID 也不能绕过 save → show → check 屏障。

`aitp_check` 把退出码 0 视为 clean，把退出码 1 视为成功返回 findings。findings 会保留展示，但不会使适配器降级。新增的 error finding 会让相关 checkpoint 保持 pending；已有的 error 会作为可审计的 receipt warning 保留。finding code 只作为 opaque string 投影；适配器不实现 AITP 的 `sha256-once:` 或 `check-policy` 语义。在进入或恢复时的维护周期中，合法的 error finding 仍保持 Research Mode receipt 为 `ready`；只有维护周期不可用或无效时才是 `degraded`。退出码 2 表示命令失败：有效的 AITP JSON 错误或无效的 check transport 会使适配器降级，参数解析错误则只报告为工具错误，不会污染整个会话。全文 `Grep` 可以定位候选记录，但完整的 canonical Entry 必须通过 `aitp_show` 读取；`aitp_show` 失败后，绝不能改用直接解析 Markdown 来模拟成功。

### 保留的本地结论

一次已完成的检验可能先得到证据，之后才能明确记录归属。如果 Action 本身仍 fresh，但没有 Line 或该 Line 尚未绑定，`ConcludeResearchAction` 会关闭 Action，并在本地 Research working state 保留完整结果、证据细节、限制与 durability assessment。Board 显示真实结果并请求确认归属。这不是 AITP Entry，也不是 pending checkpoint，不能改称 no durable delta，更不能再用 `RecordResearchProgress` 重复记录。

要保存该结果，先在 Research Manager 选择已有目标 Line，明确确认其 AITP workstream；再到 Web 的 Checkpoint 区检查原结论，选择确认归属并准备 checkpoint。终端中可在 Manager 用 `W` 确认绑定后，执行 `/research adopt-conclusion <localConclusionId> <lineSlug> [questionId]`。该操作保留原结果，只生成现有 scoped checkpoint；它不会保存 Entry、批准科学结论，也不会确认 Goal–Program alignment。

请求必须携带精确的当前 snapshot revision。已经属于某条 Line 的结果不能转移到其他 Line；Question、Program 或 reviewed Plan 的上下文真正变化时，请求会被拒绝，原证据仍保留。首次确认 Line 绑定本身不算科研内容变化。本地结论可从冷启动恢复，也跟随 conversation undo，但不会恢复工具或 draft 权限。归属确认前，新 Action 不能覆盖它，Goal continuation/completion 保持 held；普通讨论和状态查看仍可继续。

## 降级模式

以下任一条件满足时，适配器进入 `degraded`：

- 未找到 Python 3.11+
- AITP 插件缺失或合约版本不兼容
- workspace 未初始化（`not_initialized`）
- `aitp_check` 无法运行并返回有效的 AITP 错误，或其成功 payload 未通过契约校验

降级模式下：

- **用户指导的临时探索**可在一个 fresh bounded Action 内使用其已授予工具，仍受普通权限、人类决策、pending checkpoint、scope/plan freshness 和单一 live Action 约束。普通 adapter warning 不再表示所有科研都被阻断。
- **读工具**仍可用——Agent 仍可列出和查看 AITP 条目。
- **写工具和 checkpoint commit** 被阻止——`record_save`、`note_save` 和 pending checkpoint commit 均无法执行。
- **AITP 写入、自动 Goal 工作和完成仍被阻止**。无新证据的结论只更新本地 progress；真实新结果或失败在已有明确 Line/workstream binding 时可保留为 pending durable candidate，恢复后继续同一 candidate，不能改写成 `no_durable_delta` 来绕过保存。缺少有效 binding 时，durable Conclude 会拒绝且不完成 Action；应把证据保留在对话/工作区，明确记录归属后再重试。当前没有未绑定结果的自动持久化，也不推断 binding。
- 研究模式不会执行 automatic session-closeout。它**不会**自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`，适配器也不暴露、不调用、不解析 upstream 的 `backfill-0.1` 成功 envelope。用户必须手动初始化 workspace 或解决 AITP 健康问题。

## 排除与限制

研究模式有以下硬性排除：

- **Plan layers**：Research Mode 是长生命周期的科研上下文。Research Plan v2 指导多次 loop iteration；local Plan mode 是短生命周期、可嵌套的 Action Plan overlay。进入或退出 local Plan 不会退出或重置 Research Mode；两类 plan 都不是第二个 Goal，也不负责 continuation。
- **Research 层级**：大课题属于 Research Line / Question / AITP 上下文。Goal 是当前有界 autonomous objective 和跨 turn continuation owner；Research Plan v2 跨 loop 选择 milestone，local Plan 让一个 Research Action 可执行。
- **仅限主 Agent**：AITP 和 Research 变更工具仅在主 Agent 上可用。子 Agent 无法使用——必须通过类型化数据包将结果返回给主 Agent。
- **不提供自动恢复或 native coordinator**：Hakimi 尚未实现 core auto-recovery、workspace auto-init/adopt/backfill、`/research goal` 命令或 native H6b coordinator；H6b 仍为 planned/unavailable。S7 只增加首次成功 commit 后的 same-turn Skill handoff，S8 只记录其最新观察 receipt；commit 与 handoff 之间崩溃仍可能漏掉该 review，也不存在 retry ledger、后台 loop、exactly-once 保证、自动 approval 或 publication。
- **会话撤销**：研究工作状态（问题、焦点、研究线）通过检查点模型跟随会话撤销。已提交的 AITP 游标**不**跟随——一旦检查点提交到 AITP，会话撤销无法撤回这一外部事实。

## 下一步

- [斜杠命令参考](../reference/slash-commands.md#research-mode) — 完整的 `/research` 命令语法
- [会话与上下文](./sessions.md) — 会话撤销如何与研究状态交互
- [使用目标模式](./goals.md) — 另一种特殊模式；存在 pending Research checkpoint 时，Goal 完成会被阻止
