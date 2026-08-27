# AITP × Hakimi 理论物理科研 Agent 设计备忘录

> 状态：Hakimi adapter 的 H0–H4 已实现，H5 仅部分集成；`KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` 默认关闭。这个 Hakimi 产品 flag 不是 AITP 协议状态，也不是 H6 可用性信号；H6 native method-distillation orchestration 仍 planned/unavailable。
>
> 本文件是 Hakimi 侧的设计交接材料，不是 AITP canonical Entry 或 Note。当前 Hakimi 仓库没有初始化 `.aitp` store；不能自动 `init --adopt`，也不能绕过 AITP 的 `record/note prepare|save` 写入伪账本。待在已初始化的 AITP Topic workspace 中继续工作时，应把本备忘录压缩为真实的 `decision` 或 `working Note`，并按 AITP pin 规则保存。
>
> **已实现范围（实验性切片）：** Hakimi adapter 的 H0–H4（strict contract discovery、Python probe、`enter`/`list`/`show`/`check`、scoped `--workstream`、`record`/`note prepare|save` 写入门控持久化）以及 Research state（Question/Line/Focus、三轴问题模型、revision-based human steering、pending checkpoint 与 save+show+check barrier、Goal complete guard）、mode/loop/Question/Focus/checkpoint 的单一完整 snapshot push、active step 的语义状态维护 guidance、protocol/node-sdk/kap-server/klient 公开表面、TUI `/research` Board/manager 与 stale-hydrate 防护已实现。H5 仅部分集成：adapter 只把 check finding code 作为 opaque string 投影，不暴露、不调用、不解析 `backfill-0.1` 成功 envelope，也不实现 `sha256-once:`/`check-policy` 语义。`/research on` 只激活 capability 和 Board，不调度模型 turn；Goal 仍是跨 turn continuation 的唯一 owner。flag 关闭时所有 AITP 工具、skill 和 Research Board 隐藏，零 AITP I/O。不自动 init/adopt/inventory/backfill apply；backfill 不作为模型工具暴露。
>
> **未实现：** typed AITP question/line registry、literature/compute/Portfolio 支持、H6 native method-distillation orchestration。

## 1. 总决策

AITP 与 Hakimi 适合联合发展理论物理科研 Agent，但两者不应复制成一个 runtime。它们应作为一个**联合科研模式**共同开发：Research Loop 负责研究认知和行动选择，AITP 负责该 loop 的证据提交、恢复和审计边界。

- Hakimi 拥有主动研究、问题分解、假设生成、文献检索、推导、计算、反驳、下一步选择和子 Agent 编排。
- AITP 拥有 canonical evidence ledger、证据 pin、记录关系、健康检查、跨 session 交接和人类决策收据。
- 研究者拥有研究目标、物理约定、高成本动作授权、方向切换、最终科学判断和方法发布权。

目标不是让 Agent 每做一步都写 AITP，而是让每个**可靠的科研 checkpoint**都经过 AITP 的证据与恢复边界：当前知道什么、依赖什么、还缺什么、下一步为什么是这个、什么证据会改变结论，以及这些判断是否已经被安全地保存。

AITP 不是 Hakimi 的常驻行为，而是一个显式的、可恢复的科研 capability mode。普通软件开发、普通 session 创建、session 列表和非科研 Goal 不应主动扫描 `.aitp`、探测 AITP、调用 AITP CLI、加载 AITP Skill guidance 或写入记录。只有用户显式进入，或模型在高置信度判断当前任务确实是理论物理科研任务后调用 `EnterAITPMode`，并且该调用通过对应的 entry gate，联合科研模式才会激活。

这里需要区分“架构分离”和“科研可靠性分离”：Research Loop 与 AITP adapter 是两个可测试、可替换的内部服务，但完整的 `AITP Research Mode` 不允许把 AITP 当作可有可无的旁路。没有 AITP 时可以进行有限的 exploratory work，却不能把它称为完整可靠的研究模式，也不能关闭关键问题、宣布正式 result 或完成阶段交接。

需要区分两个开关：实验性 Feature flag 决定该能力是否可用，**默认关闭**（设置为 `=1` 或在 `/experiments` 中开启）；runtime mode 决定当前 main Agent 是否已经选择启用联合科研能力。permission `auto` 只决定模型发起的 mode-entry 工具是否免除一次用户确认，不能授予模型 human authority、改变研究目标或批准高风险动作。flag 开启仅开放 `/research` 与 `EnterAITPMode` 入口；进入模式仍需 `/research on` 或模型入口，inactive 状态零 AITP I/O，不自动 init/adopt/inventory/backfill。

## 2. 真相分层与边界

系统采用四层事实模型：

1. **Hakimi runtime state**：Research Frame、Question Board、最近 checkpoint、pending action、预算和子 Agent 结果。它可恢复，但不是科学证据。
2. **Evidence artifact**：文献摘录、推导、反例、数值输出、输入 manifest、远程 run pointer、代码和解析结果。每个 artifact 都应有来源、hash、locator 和验证状态。
3. **AITP canonical record**：只有跨 session、改变研究方向或构成正式证据的 observation、result、failure、decision、source、run、code-change、closeout 和 Note 才进入这里。
4. **Derived indexes**：PDF/text 缓存、全文索引、embedding、引用图和 API 响应缓存可删除并重建，不能成为第二本科学账本，也不能直接写回 AITP。

Hakimi 不复制 AITP parser、validator 或 ledger semantics，不直接写 `.aitp/topic/entries/`、`.aitp/topic/notes/`、`TOPIC.md` 和 `STORE.toml`。所有 canonical 写入仍走 AITP CLI 的 prepare/save，再用 `check`/`show` 验证。

### 2.1 AITP mode 的状态边界

AITP mode 是 Agent-scope 的 main-agent capability state，采用可回放、可随 conversation undo 恢复的 mode op；AITP launcher、workspace/store binding、single-flight 和 mutation drain 是 Session-scope adapter。当前真实 scope 只有 `App → Session → Agent`，不假定尚未存在的 Workspace tier。

- inactive：只暴露 `EnterAITPMode`；不运行 AITP I/O，不加载 AITP Skill guidance，不暴露 `aitp_*` 或 Research Loop mutation tools。
- active/probing：已请求联合科研模式，但还没有通过 AITP `enter/check`；只能进行入口准备和低风险 exploratory work，不能提交可靠 checkpoint。
- active/ready：Research Loop 和 AITP adapter 同时可用，进入完整可靠的科研模式；关键阶段转换必须经过 AITP commit barrier。
- active/degraded：Research Loop 可以保留当前问题、继续本地 Question/Line mutation 和生成临时 artifact，但不得把持久化失败伪装成成功。AITP writes 与 active Research Mode 的 Goal completion 被阻止；未解决 human gate 也阻止 Goal completion。需要 durable checkpoint 或可靠 closure 时应 pause/blocked，直到 AITP 恢复或研究者明确选择降级处理；当前没有 automatic session-closeout。
- explicit user entry：通过 `/aitp on`、typed facade 或等价用户入口直接进入，不重复询问。
- model entry：模型只能调用 `EnterAITPMode`；`auto` permission 可自动通过 entry gate，其他 permission posture 要求用户确认。这里的确认是 capability entry review，不等同于 AITP `authority: human` decision。
- mode exit：撤销新 AITP 操作 admission、回收动态工具和 Research activation lease，不删除已经保存的 AITP 记录，也不自动取消或完成 Goal。
- restore/undo：inactive restore 必须零 AITP I/O；active restore 不重复询问，但重新探测 adapter 并重建工具。conversation undo 只回滚 Hakimi mode/Research state，不回滚外部 AITP Entry/Note。

AITP mode 不自动创建 Goal，也不自动创建 Research Frame，但它激活的是**AITP-backed Research capability**，而不是一组彼此无关的工具。交互式研究可以没有 Goal；需要跨 turn 自治 continuation 时才绑定现有 Goal。普通软件 turn 即使 mode 仍 active，也应让 Research Loop abstain，不把代码变更或普通 tool call 自动写入 AITP。

Skill visibility 必须和 tool visibility 一致：普通模式不能通过 `SkillTool` 间接调用 AITP Skill；显式 `/skill:aitp` 应解释为用户主动进入联合科研模式，而不是绕过 mode gate。

## 3. 嵌套科研 loop

### L0：Agent 执行 loop

现有 `IAgentLoopService` 负责 step、turn、tool call、retry、compaction、cancel 和 continuation。它是执行泵，不选择科研问题。

### L1：Goal 外环

Goal 负责 objective、completion criterion、总预算、pause/resume/cancel 和跨 turn continuation。Goal 应是唯一的 continuation owner；Research domain、AITP coordinator 和子 Agent 不得各自 enqueue 独立的自治主循环。

### L2：Research loop

完整的可靠科研轮次必须把 AITP 的证据提交和恢复纳入 loop，而不是在 loop 外部事后补记：

```text
读取 AITP handoff/check
  → 更新问题状态
  → 找出最大知识缺口
  → 选择一个 bounded action
  → 执行动作
  → 产生新 artifact 或明确 no-progress
  → 评价是否改变结论、优先级或停止判断
  → 形成 CheckpointDecision
  → 在 durable boundary 通过 AITP prepare/save/check 提交
  → 更新 committed cursor
  → continue / ask / pause / complete / blocked
```

以下 commit-barrier 列表是联合 Research Loop 的设计目标，不是当前 Hakimi adapter 已自动提供的生命周期：Research Loop 不需要每个 step 都写 AITP，但在关闭或回答一个主问题、改变研究阶段、接受或放弃核心假设、记录重要文献判断、完成重要 run、形成阶段性结论、Goal complete、计划中的 session closeout，以及任何需要下一 session 依赖的事实时，都应完成 AITP 提交并验证。当前状态维护只在 mode entry 与 active undo/cold restore 后只读执行 `enter` → `check`，没有 session-end automatic closeout。提交未知或验证失败时，不能继续宣称该边界已经完成；应进入 `pause`/`blocked` 或明确的 `uncommitted exploratory` 状态。

如果新证据不能改变下一动作、问题优先级或停止判断，当前过程只是 workflow 或日志，不是真正的科研 loop。反过来，如果状态改变了却没有经过 AITP commit barrier，当前结果只能算临时探索，不能算可靠的科研阶段结论。

### L3：Perspective operators

skeptical、literature、physics、numerical、code/repro 是按需调用的评价算子，不应每轮强制全部运行。只有当结果能够 reopen question、降低结论可信度、生成 child question 或改变 next action 时，才算参与科研 loop。重要 perspective 结果必须在对应的 CheckpointDecision 中留下来源和限制，并在 durable boundary 通过 AITP 保存。

### L4：AITP commit/recovery loop

```text
AITP enter/check
  → 读取 canonical handoff 与相关 Entries/Notes
  → Research Loop 生成 artifact
  → AITP prepare/save
  → check/show 验证 pin、关系和可达性
  → 更新 Hakimi committed snapshot
  → crash/cold resume 时重新读取 AITP
```

AITP 不可用、旧版本、未初始化或 `check` exit 2 时，Agent 可以做有限的低风险 exploratory work，也可能继续本地 Question/Line mutation，但不能把它们误称为已持久化。AITP writes 与 active Research Mode 的 Goal completion 被阻止；未解决 human gate 也阻止 Goal completion。完整的 `AITP Research Mode` 在这种状态下必须显示 `degraded` 并在下一个 durable boundary pause/blocked；当前没有 automatic session-closeout，不能把“本地状态还在”误认为“研究已经可靠保存”。

### L5：Method distillation loop

方法蒸馏是研究之上的元循环：

```text
真实执行观察
  → method-observation candidate
  → card/trial review
  → qualifying trials
  → proposal
  → human approval
  → publication choice
  → Skill/tool routing
```

H6/C6 只负责编排和人机交互，不拥有 procedure matching、科学正确性、ledger semantics 或自动发布权。当前 H6 仍 planned/unavailable。

## 4. 最小领域 contract

第一版不应先做通用 DAG 或完整 workflow DSL，而应冻结四个最小对象：

- `ResearchFrame`：`id`、`revision`、scientific question、objective、completion criterion、assumptions/conventions、active question、status、budget。
- `ResearchQuestion`：`id`、`parentId`、unknown、priority、needed evidence、evidence refs、falsifier refs、status、attempts、next bounded action。必须允许 reopen、分叉、子问题和废弃，不能只有单一 `currentStage`。
- `ResearchArtifact`：`id`、kind、input cursor、observation、claim/challenge、assumptions、refs、locator、validation、contradictions、limitations、next-test。
- `CheckpointDecision`：consumed cursor、产生的 artifact、当前 question、assessment、`continue|ask|pause|complete|blocked`、next action、stop reason、usage/budget 和 idempotency key。

`trajectory` 只应由 checkpoint/wire ops 重放得到，不再建立第三套 append-only research database。

## 5. Agent 自主策略

### 5.1 查文献

主动查文献的触发条件：新术语或模型、需要声称 known/first/standard、关键公式或定理依赖来源、推导与已知结果冲突、需要可解极限或 benchmark、需要寻找反例、结论即将进入 AITP result/decision/theory Note，或准备提炼可复用方法。

纯局部代数、已有精确 pinned source 的重复使用、明确标记为 provisional 的低风险假设和低成本内部检查可以不查文献，但不能把模型记忆写成已证实事实。结论应区分 `source-backed`、`derived-under-assumptions`、`heuristic`、`unverified` 和 `contradicted`。

### 5.2 AITP 读写

当前实现只在联合 AITP Research Mode active、ready probe 通过后的 mode entry，以及 active undo/cold restore 后运行只读 `enter` → `check`；这不是 session-end automatic closeout。inactive session 必须 zero-write、zero-probe。`check` exit 0/1 解析报告，exit 2 fail closed。`show` 用于精确打开依赖记录，`list` 用于类型/时间/workstream 投影，不能把它们当作语义搜索。

可靠模式的设计目标是让 AITP 成为研究状态的 commit barrier：真实 run、重要 result、failure/反例、source assessment、decision、阶段切换、问题关闭或 reopen、Goal complete 和计划中的 closeout 都应经过 prepare/save/check 验证。当前 Hakimi adapter 只提供已实现的显式 write gate 与 entry/restore 只读维护，不提供 session-end automatic closeout；普通 tool call、每个子 Agent 的中间意见、重复检查和没有改变状态的重述保持零写入。adapter 暂时不可用时可以保留低风险临时 artifact，但不得把未提交状态宣传为 durable result。

四条以上相互依赖的 durable Entries 形成结论链、当前 working Note 已落后、研究阶段发生切换或下一 session 需要重建复杂推理时，写 working Note。只有假设、推导、检查和开放缺口已经相对稳定时，才写 theory Note。

### 5.3 必须与研究者交互

以下情况必须暂停并交互：物理 convention 有歧义；昂贵、不可逆或会消耗共享资源的动作；低成本验证后仍存在无法消解的证据冲突；改变研究目标、完成标准或方向；初始化/adopt/inventory 或 AITP upstream 的 operator-only `backfill --apply`；AITP human decision；method card approval/publication。

UI answer 只是意图，不是 durable approval。alerts 和 generic human gate 已实现，但 candidate confirmation 不是 `SetResearchFocus` 的 runtime 强制 guard；当前 `ResolveResearchDecision` 只解析 runtime decision，不会自动写入 AITP `decision` Entry。只有经 AITP `record prepare/save/check` 验证的 human `decision` Entry 才是权威收据。

以下情况不应打扰研究者：低成本局部推导、已确认约定下的检查、精确重读已 pinned source、常规 metadata 解析、预算内的小型候选比较和恢复已有 snapshot。

## 6. 子 Agent 编排

采用一个 main research Agent 加受限 specialist，而不是多个自由写入账本的 Agent：

- **Literature Agent**：检索、身份/版本解析、原文获取、精确 locator 和元数据冲突；只返回 `LiteratureEvidencePacket`。
- **Derivation verifier**：独立重推、符号/边界项/零模/近似阶数/特殊极限检查；不宣布最终科学结论。
- **Skeptical/falsifier Agent**：找反例、隐藏假设、相反文献和最小破坏实验。
- **Numerical Agent**：定义 observable、RunSpec、有限尺寸/cutoff/收敛/误差检查和解释边界。
- **Repro/code Agent**：管理代码、环境、输入输出 manifest、hash 和测试。
- **Main research Agent**：拥有 Frame/Board、next action、Goal continuation、人类交互、最终综合和 AITP durable write gate。

子 Agent 返回 typed packets，不直接写 AITP、不向研究者提问、不发布 Skill、不推进主研究状态。AgentSwarm 只用于受限的独立 fan-out，例如参数扫描或多假设比较；默认不强制启动五个视角。

## 7. 文献库与 AITP

文献库采用私有、可重建的分层：

```text
raw → normalized metadata → pdf → tei/text → chunks → citations/annotations
```

HEP 优先 INSPIRE，天体物理/宇宙学优先 ADS；arXiv 负责预印本版本和全文，Crossref 负责 DOI 正式元数据，OpenAlex/Semantic Scholar 做跨学科和语义补充，Zotero 作为研究者私有收藏与 citation key 管理层。

第一阶段优先 SQLite FTS 或 MiniDb 的倒排索引、章节/公式附近文本、citation graph 和 locator；embedding 检索要等 identity/version、精确定位和关键词检索稳定后再评估。

重要文献结论的持久化路径是：

```text
外部 API
  → raw response snapshot
  → normalized record
  → PDF/text/TEI cache
  → 具体 evidence + locator
  → workspace immutable snapshot
  → AITP Entry/Note refs pin
```

特定 arXiv 版本、PDF、文本快照和不可变报告使用 `sha256:`；时间点 metadata 观察可使用 `sha256-once:`。这里描述的是 AITP/Skill 层的证据语义，不表示当前 Hakimi adapter 已实现它；当前 adapter 不实现 `sha256-once:` 或 `check-policy`。完整文献库、embedding 和缓存不写回 AITP。GROBID 的 TEI 只能作为抽取结果，关键公式和引用必须回到 PDF 页码或坐标核验。

## 8. 计算节点与证据

领域无关的计算接口应先定义为：

```text
ComputeBackend:
  inspect()
  submit(runSpec)
  status(runId)
  cancel(runId)
  fetch(runId, artifact)
  reconcile(runId)
```

`RunSpec` 至少包含 input manifest、executable/notebook、arguments、environment、resources、timeout、expected outputs 和 idempotency key。`RunReceipt` 保存 backend、host、scheduler job id、input hash 和 binary hash；`RunResult` 保存 scheduler state、exit code、output manifest、output hashes 和 verification status。

本地执行先保证 argv 分离、cwd 隔离、显式环境、timeout 和 manifest；随后再接 SSH，再接 Slurm。Slurm 的 `COMPLETED` 不能直接等价于科学成功，必须同时满足 exit code、expected outputs、manifest 和 post-run verification。远程证据先生成本地 immutable pointer/report，再由 AITP pin，不能记录裸 `host:path`。

## 9. 当前 AITP 目录与科研目标图的映射

当前 AITP 是单 Topic、flat append-oriented ledger：

```text
.aitp/
├── STORE.toml
├── topic/
│   ├── TOPIC.md
│   ├── entries/
│   └── notes/
└── local/
    ├── config.toml
    ├── drafts/
    ├── locks/
    └── scratch/
```

不应把它重构为 `.aitp/programs/<id>/lines/<id>/questions/`：科研 artifact 经常跨支线，层级目录会迫使单一归属、制造移动/迁移和重复证据，并破坏现有 flat scan、global relation、append history 与兼容性。目录继续按对象类型平铺，层级和关系由稳定 ID、frontmatter 与只读投影表达。

推荐映射：

- 一个独立、长期、具有自身 completion criterion 的 `ResearchProgram` 对应一个 AITP Topic；`STORE.toml`/`TOPIC.md` 保持 Topic identity 和大方向研究目标。
- 同一 Topic 内的 `ResearchLine` 对应显式 workstream；跨线 artifact 在同一 Entry/Note 上列出多个 `workstreams`。
- `ResearchQuestion` 不能长期只存在于 Hakimi wire、working Note 的自由文本或把 `failure` 伪装成 question；它需要 AITP 的 typed open-item contract，至少支持稳定 question ID、workstream membership、结构化 closure 和 reopen。
- `ResearchFocus`/bounded action 是短期调度状态，保留在 Hakimi；只有其结果、失败、决策和 commit checkpoint 进入 AITP。
- 多个独立但相关的 Program 使用多个 sibling Topic store；workspace-level `topics.toml` 只保存 portable Topic identity，machine-local root mapping 与跨 Topic links 另行处理。不能在一个祖先 store 下嵌套第二个 store。
- Research Portfolio、跨 Program priority、资源调度和 current focus 保留在 Hakimi；AITP 只保存被研究者确认的大方向、跨 Topic 关系和每个 Topic 的 durable evidence。

### 9.1 建议的最小 AITP 协议增量

客观按最终效果，现有 workstreams 仅是无 registry 的 membership tag，不足以恢复多支线科研状态；现有 Entry kinds 也没有 `question`。建议修改 AITP，但保持增量最小：

1. **Research-line descriptor**：增加一个 versioned、plain-text canonical descriptor surface，为每个 workstream 保存 slug、title、objective、status、parent Topic、dependencies、completion criterion 和创建/确认 provenance。优先采用 `.aitp/topic/lines/<slug>.md` 或语义等价的 append/revision-safe descriptor，不把调度、priority score、current focus 写入 AITP。旧 store 无 `lines/` 时保持兼容；record membership 仍以 frontmatter `workstreams` 为准。
2. **Typed question/open-item**：基于重新评审后的 `aitp/lite-entry-0.2` 或更小独立 slice，加入 `question` kind、单目标 typed `resolution`、`answered|cancelled|invalidated` closure 和 resolver supersession 后 reopen。必要时再加入 `based_on`；不要一次引入完整通用 research graph。
3. **Line-aware projections**：`enter/list/check --workstream` 除现有证据投影外，返回该 line descriptor、active questions、line handoff 和 commit health。旧 schema 不原地修改，使用新 transport version。
4. **Workspace portfolio convention**：先落实已设计但尚无 runtime 的 `topics.toml` + machine-local roots mapping，供 Hakimi发现多个 sibling Topics。跨 Topic link 只在出现真实跨课题检索/关系失败后启用 M3 式 human-confirmed link records。
5. **Adapter contract 同步**：任何上述 CLI/schema/Skill 变化必须同步 `aitp.contract.json`、官方 fixtures、两侧 handoff 和 Hakimi adapter；未知 contract fail closed。

不建议在 AITP 中增加 Portfolio scheduler、Goal、subagent 状态、token budget、动态 priority、计算队列、向量数据库或事件总线。这些属于 Hakimi；AITP 继续只做 validate、persist、project、diagnose 和 evidence authority。

### 9.2 过渡实现

在 AITP 新 contract shipped 前，Hakimi 可以用现有 Topic + workstreams + Entries/Notes 做兼容纵切片，但必须诚实标记限制：

- Topic = 一个 Program；workstream slug = 一个 provisional Line identity。
- line objective/status 暂由一条 human `decision` Entry和 scoped working Note保存，Hakimi从明确的 canonical IDs 恢复，不从任意 prose 猜测。
- open question 暂存为 scoped working Note 的 `Open Questions`，但不能获得稳定 question lifecycle、typed resolution 或精确 reopen，因此不作为最终 contract。
- current focus 只在 Hakimi wire；每次 durable line switch 写 decision/closeout，并以 workstream scoped `enter/check` 验证。
- 多 Program 使用 sibling stores和手工 `topics.toml`；在 M3 未 shipped 前，只用普通 pinned citations，不伪造 cross-topic link runtime。

这条过渡路径用于验证真实需求和 UI/loop 语义，不应固化为对 Markdown body 的 ad-hoc parser。

### 9.3 CLI 科研状态展示

科研状态内部可以是 `Portfolio → Program → Line → Question → Focus` 的图，但默认 CLI 不能展示整棵图。采用渐进式披露：常驻状态行只回答“现在在哪里、是否可靠、是否需要处理异常”，默认命令展示当前研究切片，完整对象和历史只在按需展开时显示。

常驻状态行建议控制为一行：

```text
Research · zero-modes/edge-response · active · AITP clean · 3 turns left
```

它组合展示但不合并两类独立状态：

- scientific state：当前 Program/Line、Question/Focus 和 next action；
- trust/execution state：Goal status/budget、AITP health 和 checkpoint 是否 committed。

`/research status` 默认返回约 8–12 行的 `Current Research Snapshot`，只包含：

```text
Research:  active
Path:      QHE › edge-response › zero-mode
Question:  Does the boundary zero mode change the response coefficient?
Focus:     Verify the regulator-dependent boundary term
Goal:      active · 3 turns left
Evidence:  checkpoint committed · 2 sources · 1 derivation
AITP:      clean · contract 0.x · synced now
Other:     2 active · 1 waiting · 1 blocked
Attention: blocked line `finite-T` has contradictory evidence
```

默认不列出整个 Portfolio、所有 Entries、完整 Note 正文或每个子 Agent。面包屑只显示 current path，过长时从中间截断；其他支线只显示计数，只有 blocked、关键新证据、contradiction、question reopen 或 commit 异常主动浮出。

CLI 保持一个 `/research` 主入口，而不是增加大量平级 slash commands：

- `/research status [--full]`：当前 Focus 的紧凑快照；`--full` 展开 assumptions、dependencies、latest checkpoint 和 next alternatives。
- `/research lines`：当前 Program 的支线列表，每条一行显示状态、开放问题数、最近 commit 和异常。
- `/research questions [line]`：所选 Line 的问题列表及 `open|investigating|answered|blocked|reopened` 状态。
- `/research portfolio`：多个 Program 的摘要和资源/优先级，不展示证据正文。
- `/research show <id>`：展开一个 Program、Line、Question、Focus 或 artifact。
- `/research history [id]`：调用 AITP 投影查看 durable checkpoint/history；不能从 runtime snapshot 伪造历史。
- `/aitp status`：只展示 adapter、store、contract、commit cursor 和 health，不混入科学内容。

TUI 可以提供一个默认折叠的 Research panel：collapsed 状态等价于常驻状态行，compact 状态等价于 `/research status`，expanded 状态再显示当前 Question Board 和异常支线。普通 Focus 切换只更新 panel，不打断用户；仅在需要人类 authority 或可靠性受损时 push 通知，包括 commit failed、AITP degraded/exit 2、关键 question reopen、跨线 contradiction 和预算即将耗尽。

当前 adapter 的 maintenance receipt 和 context injection 只暴露安全摘要；完整 Research snapshot/API 与 expanded Board 可以按需包含 checkpoint、revision、adapter health 等状态字段。给 main Agent 注入的设计仍应是 versioned、只读压缩投影，而不是完整 Portfolio 或全部 AITP Entries：

```text
ResearchStatusSnapshot:
  currentPath
  questionSummary
  focusAndNextAction
  assumptionsInForce
  latestCommittedCheckpoint
  lineCountsAndAlerts
  goalStatusAndBudget
  aitpHealthAndCommitState
```

完整领域对象仍由 Research domain 和 AITP projection 按 ID 读取。Goal 与 Research 状态在 UI 中组合展示，但内部不合并为单一 status；这样既保持科研层级和可恢复性，也让默认 CLI 只呈现当前决策真正需要的信息。

### 9.4 科研状态的更新时机

状态更新采用**语义事件驱动**，不能按 token、普通 tool call 或固定时间间隔机械刷新。一个科研动作结束并不自动等于科学状态改变；必须先判断新证据是否改变了问题判断、下一动作、优先级或停止条件。

每次更新分为三层：

1. **working revision**：bounded action 被选择、开始、结束、取消或返回 no-progress 时，立即更新 runtime 的 Focus/action 状态；UI 可以显示 `running`、`evaluating` 或 `pending review`，但这不是科学结论。
2. **assessed revision**：main Agent 消费并验证文献、推导、反驳、数值或 compute packet 后，通过单线程 reducer 生成 proposed checkpoint；此时更新 Question 的 evidence、confidence/limitations、next action，并重新计算 Line 汇总。
3. **committed revision**：如果 proposed checkpoint 跨越 durable boundary，则先标记 `pending commit`，通过 AITP prepare/save/check 后才推进 canonical question/line/program 状态和 committed cursor。提交失败时保留 working state，保持 checkpoint pending，并明确显示 commit barrier failure；只有 AITP transport 或维护周期不可用时才将 adapter 标为 degraded，不能把 answer candidate 展示为已可靠回答。

各层级的更新触发条件不同：

- **Focus/action**：每个 bounded action 的 `planned → running → evaluating → done|no-progress|cancelled` 转换，以及 current Focus 切换时更新；不因内部每个 tool call 更新。
- **Question**：可信新证据改变 needed evidence、falsifier、置信判断、next action，或进入 `investigating|blocked|answered|cancelled|invalidated|reopened` 时更新。创建、closure、reopen 和改变关键判断属于 durable boundary。
- **Line**：其 Question 生命周期改变、跨 Line 切换 Focus、依赖变化、出现 contradiction，或 Line 被 block/resume/complete 时更新。开放问题计数等聚合可立即重算；objective、completion criterion 和正式状态变化必须提交 AITP。
- **Program**：创建/归档 Line、到达研究里程碑、阶段切换、修改 Program objective/completion criterion 或形成阶段总结时更新；方向性变化通常需要研究者确认和 AITP decision/Note。
- **Portfolio**：增加/归档 Program、改变跨 Program 优先级、资源分配或关系时才更新；不跟随普通研究 turn 波动，原则上由研究者确认。
- **Goal**：每个 autonomous goal turn 结算预算、进度和 continuation decision；在 active Research Mode 中，AITP writes 被阻止、checkpoint pending/degraded 或 unresolved human gate 时不得 `complete`。本地 Question/Line mutation 仍可能发生；Goal 的 turn 状态不自动写入 AITP。
- **AITP health/commit state**：当前在 mode entry 与 active undo/cold restore 后的只读 `enter` → `check`、contract probe、canonical mutation 前后和 reconcile 时更新；这不是 session-end automatic closeout。失败立即反映在 UI，不等待科学状态刷新。

子 Agent、文献 provider 和计算节点只能发布 typed result/event，不能直接修改 Question、Line 或 Program。main Agent 的 Research coordinator 按 input cursor 串行消费，去重后决定 `no semantic change`、`working update` 或 `durable checkpoint`。compute job 的 queued/running/completed 可以立即更新运行状态，但只有 expected outputs、hash、误差/收敛和科学解释验证完成后，才能影响 Question。

跨 Line 的后台结果到达时，先把相关对象标记为 `review required` 或产生 alert，不应异步改写当前主线结论。main Agent 在下一个安全 checkpoint 统一吸收；若证据可能推翻当前结论，则立即暂停 closure/complete 并把 contradiction 浮到 CLI。

每个 Goal turn 结束都应生成一个轻量 runtime checkpoint，记录 current path、next action、预算和 consumed cursor，便于 crash/compaction 恢复；只有发生 durable boundary 才写 AITP。阶段切换、长期 Line 切换、四条以上相互依赖的记录、working Note 明显落后、计划中的 session closeout 或 Goal complete 时再形成阶段性 Note/summary，而不是按固定 turn 数强制总结；当前没有 automatic session-closeout。

所有 revision 都带 object revision、input/committed cursor 和 idempotency key。允许 Question reopen，但必须给出触发证据和 superseded checkpoint，避免旧的后台结果或重试让状态来回振荡。

### 9.5 人类实时修正与方向控制

Question、Line、Program 和 Focus 必须支持研究者实时修改；这不是对 Agent 状态的旁路篡改，而是一等的 `HumanSteeringCommand`。人类编辑一经接受立即成为最高优先级的 runtime control event，触发 revision 增长、snapshot 重算和下一动作重规划，不应等到下一个自动总结，也不能被 Agent 的旧 checkpoint 静默覆盖。

为避免把“是否继续研究”和“科学上是否成立”混成一个可随意改写的字段，Question contract 应拆为三个正交维度；现有 `answered|blocked|reopened` 等可作为 UI shorthand，但不能成为唯一存储字段：

- **workflow disposition**：`open|active|deferred|blocked|closed|cancelled`，研究者可实时修改；
- **epistemic assessment**：`unknown|candidate|supported|contradicted|inconclusive`，Agent 可基于证据提议，研究者可以 override，但必须保留理由、provenance 和相反证据；
- **persistence state**：`working|pending_commit|committed|degraded`，只能由 AITP adapter/commit protocol 推进，任何人都不能在 UI 中手工伪造为 committed。

研究者可直接修改 current Focus、Question wording/priority/workflow disposition、needed evidence、Line membership、Line priority/status，以及 reopen/defer/cancel 一个问题；也可以把某项证据标为 rejected/superseded 并给出理由。修改 Program objective/completion criterion、关闭 Program、跨 Program 资源分配或接受关键物理 convention 属于高影响 steering，UI 应展示 diff/effect preview，并形成明确的 human authority event。

不能通过 status editor 改写已经发生的 tool/run 输出、source snapshot/hash、历史 AITP Entry、adapter health 或 committed cursor。研究者可以追加“该证据解释无效”或 superseding decision，但不能抹掉原证据和历史；科研自主性必须建立在可纠错历史上，而不是可重写历史上。

交互格式应参照现有 `/goal`，复用“无参数查看状态、首 token 为确定性控制子命令、管理面板完成结构化编辑、`--` 分隔自由文本、错误输入可恢复”的范式，而不是发明通用 `/research set ...` DSL：

```text
/research                         # 等价于 /research status
/research status
/research pause                   # 暂停整个 Research Loop，不退出 AITP mode
/research resume
/research manage [line-id]        # 打开 Line/Question 管理面板
/research edit <id>               # 直接打开所选对象的编辑面板
/research focus <question-or-line-id>
/research defer <id> -- <reason>
/research block <id> -- <reason>
/research close <id> -- <reason>
/research reopen <id> -- <reason>
/research replace <id> -- <new wording-or-objective>
```

`pause/resume` 无 ID 时只控制整个 Research Loop；Question/Line 的 lifecycle 使用 `defer/block/close/reopen`，避免与全局 pause 混淆。`cancel` 对 Research 对象只表示保留历史的 workflow disposition，绝不能像删除临时队列项一样删除 canonical evidence。自由文本以 `--` 开始，使 reason 或新 wording 可以以保留字开头，解析规则与 `/goal -- <objective>` 一致。

`/research manage` 参照 `/goal next manage`：列表中用方向键导航、`Space` 设为 Focus、`E` 打开 edit dialog、`Esc` 退出；高影响或带历史后果的 close/reopen/cancel 不绑定无预览的单键动作。edit dialog 直接展示并编辑 workflow、assessment、priority、wording、needed evidence、reason 和影响预览，提交后立即生成 `HumanSteeringCommand`。

TUI expanded panel 也可复用同一个 edit dialog，不建立第二套修改路径；每次编辑显示 `changed by human`、reason、revision 和 `working|pending commit|committed`。显式 slash action或 dialog submit 本身是人类 steering intent，不需要 Agent 再追问相同决定；高影响 edit 仍应在应用前显示将取消/暂停哪些 Focus、Goal continuation、subagent 或 compute admission。

实时修改采用 optimistic concurrency：命令携带 `expectedRevision`。应用后，所有基于旧 revision 的 Agent checkpoint 均被拒绝或要求 rebase；不兼容的当前 Focus 立即 pause/cancel，停止接纳新的子任务。已经运行的远程计算必须进入 cancel/reconcile 流程，不能仅因 UI status 改变就假定已终止；已返回的旧 packet 仍可作为 evidence 保存，但标记为 stale，不得自动推进新方向。

低风险 steering 先立即作用于 runtime，再通过同一个 AITP write gate 持久化；在 typed question transition contract 尚未 shipped 前，使用 human `decision` Entry 加 scoped working Note 作为过渡，不直接编辑 canonical 文件。AITP 保存成功后标记 committed；失败时人类方向仍立即生效，但显示 `human override · pending commit/degraded`，并阻止依赖该修改的正式 closure、Goal complete 和 closeout，直到 reconcile。

Agent 如果认为人类修改与已有证据冲突，只能把 contradiction 和具体 evidence refs 浮出，请研究者决定是否再次修正；不能在后台把 status 改回去。这样人类具有实时方向控制权，同时 Agent 仍保留提出异议、保存反证和维护科研可审计性的能力。

### 9.6 Research Board：科研 loop 风格的 Todo

Research Board 应复用现有 TodoPanel 的视觉密度和信息筛选思想，而不能复用它的线性 `pending|in_progress|done` 数据模型。它是 `ResearchStatusSnapshot` 的只读投影，不是另一份需要 Agent 手工同步的列表；所有编辑仍作用于 Question/Line/Focus，随后自动重算 board。

默认 board 放在输入区前的 live chrome 区域，只在 AITP Research Mode active 时出现，最多展示约五个 Question，并优先回答“正在验证什么、什么阻碍结论、下一步是什么、刚刚可靠完成了什么”：

```text
────────────────────────────────────────────────────
  Research · edge-response                 AITP clean
  ● Q-17 Boundary zero mode                active · candidate
    ↳ Verify the Ward identity             evaluating
  ! Q-12 Regulator independence            blocked · contradicted
  ↺ Q-08 Finite-temperature limit          reopened · high
  ○ Q-19 Corner contribution               open · next
  ✓ Q-05 Bulk coefficient                  closed · supported
  … +3 questions · 2 other lines
```

标记必须同时配文字状态，不能只靠颜色：`●` 表示 current Focus，`○` 表示开放候选，`!` 表示 blocked/contradiction/commit attention，`↺` 表示 reopened，`✓` 表示已关闭且有可靠 checkpoint。Research 的 closed result 仍是有效证据且允许 reopen，因此不要像普通 Todo 的 done item 一样加删除线；cancelled/deferred 使用 dim 文本和明确 label，不伪装成完成。

折叠态的可见项选择参照 TodoPanel 的“所有 in progress、最早 pending、最近 done”，但替换为科研优先级：

1. current Focus Question 永远可见，并附一行 current bounded action；
2. contradiction、blocked、reopened、pending/degraded commit 等 attention items；
3. 当前 Line 中最高优先级的 next open Questions；
4. 最近一个 `closed + committed` Question，提供阶段进展感；
5. 其余只显示按 workflow/attention 分类的 hidden counts 和 other-line counts。

同一 bucket 内保持稳定的 Line order/priority/revision 排序，避免每个 packet 到达时列表无意义地跳动。当 attention items 超过容量时，current Focus 仍占一席，其余按 severity 和 revision 选择，并显示隐藏告警数。

Board 默认只显示 current Line；其他 active/waiting/blocked Lines 用摘要计数，跨线 contradiction 则提升为 attention row。展开态或 `/research manage` 才显示完整当前 Program，可按 Line 分组查看 Question、assessment、latest checkpoint 和 next action。

普通模式继续显示现有 TodoPanel。Research Mode 下为避免同时堆叠两块近似列表，live chrome 的主工作区显示 Research Board；如果 Agent 在某个 bounded action 内使用普通 TodoList，其步骤只作为展开态的 `Focus steps` 子区展示，不能升级为 Question，也不能成为 Research canonical state。Research Board 不随 `/clear` 清空；它从 Research runtime/AITP projection 恢复，退出 Research Mode 后隐藏而不是删除。

紧凑 board 保持只读，避免抢占 editor 键盘；交互统一进入 `/research manage`/`edit`。manager 遵循 TUI list dialog 规范，复用 `SearchableList`、`SELECT_POINTER` 和 `CURRENT_MARK`，显示 `← current`，由 `Space` 设置 Focus、`E` 打开同一个 edit dialog。人类修改提交后 board 立即响应新 revision；旧 Agent result 只能显示为 stale/attention，不能覆盖修改。

实现时不要把更多状态塞入现有 `TodoItem` union；建立独立的 `ResearchBoardView` 和 focused component，先复用布局习惯，只有出现稳定的真正公共逻辑后再抽取 shared list renderer。测试至少覆盖 collapsed selection priority、hidden counts、current Focus/action 双行、human revision 更新、reopen/contradiction、AITP degraded、窄终端截断，以及普通模式不出现 Research Board。

## 10. 实施顺序

1. **P0 contract freeze**：冻结联合 AITP Research Mode、entry/exit/degraded 语义、Research Frame、Question、Artifact、Checkpoint、AITP commit barrier、stop predicates、D↔C persistence bridge 和 main-agent human gate。
2. **P1 mode shell**：实现 experimental flag、`AITPModeModel`、`EnterAITPMode`/`ExitAITPMode`、permission entry gate、Plan 冲突、restore/undo、context disclosure；本阶段验证 inactive 路径完全不做 AITP I/O。
3. **P2 read-only adapter + visibility**：接入 contract probe、`enter/check/list/show`、active-only Research/AITP tools、Skill visibility gate、dynamic registration/disposal、stale generation guard；mode 进入后先完成 AITP health gate，再开放完整 Research Loop。
4. **P3 Research Loop core**：实现 Frame、Question、Artifact、Checkpoint、bounded action、typed specialist packets、Goal linkage 和 cold/undo replay；每个 durable boundary 都产生 AITP commit request，不允许无账本地推进正式阶段。
5. **P4 canonical write gate**：接入 `record/note prepare/save`、idempotency/reconcile、mutation single-flight、exit drain 与 H4 的 scoped check；H5 的 backfill/`sha256-once:`/policy 语义仍属于 AITP upstream，当前 Hakimi 只做 finding-code opaque projection，不暴露或调用 backfill；严格禁止 direct canonical file write。
6. **P5 理论与文献 workflow**：arXiv/INSPIRE/Crossref provider、本地 raw/metadata/FTS、PDF/TEI provenance、LiteratureEvidencePacket、derivation verification 和 Note/Entry 写入门。
7. **P6 Compute backend**：local → SSH → Slurm；每层都要求 manifest、reconcile、幂等和 cold resume，并在 run/result durable boundary 接入 AITP。
8. **P7 真实使用评估**：对比普通 Goal-only、无 AITP 的 exploratory loop 和完整 AITP Research Mode，测量 evidence-driven next action、falsifier coverage、重复动作、premature complete、blind retry、恢复收敛和不必要提问。
9. **P8 H6 method distillation**：只有 H0–H4 已稳定、H5 adapter contract extension 完成且真实使用证明 native coordinator 有必要后才实现；当前 H6 仍 planned/unavailable。

## 11. 开放问题

- 当前 v2 真实 scope 是 `App → Session → Agent`，不能假定尚未存在的 Workspace tier。
- `packages/kaos` 的 SSH 抽象与 v2 Runtime 尚未完全接通，需要在实现前决定适配层，而不是再造第三套 process/filesystem abstraction。
- `HostProcessOptions.timeout` 在 Node backend 尚未实现，长任务必须先有显式 timeout/kill/reconcile 实现。
- 需要冻结 D↔C bridge 的 versioned envelope，以及 AITP absent/old/not_initialized/check-exit-2 的 degraded contract。
- 需要用真实理论物理任务建立评估集，验证 Agent 是否真的根据新证据改变行动，而不是只增加日志、turn 或子 Agent 数量。
- 需要冻结普通模式与 AITP mode 的 Skill visibility seam；仅隐藏静态 `aitp_*` tools 不足以阻止 `SkillTool` 间接触发 AITP 维护。
- 需要明确非 `auto` permission 下的 mode-entry review 与普通 tool approval 的交互方式；当前 `EnterPlanMode` 在代码中是默认自动批准的，不能直接把它当作“必然询问用户”的实现样例。
