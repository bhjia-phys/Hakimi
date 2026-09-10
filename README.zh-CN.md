# Hakimi

当前增量（2026-09-10）：最新委派依赖源码已通过 Agent/嵌套/Swarm 有限真实
验收；压缩恢复在保留两次上游失败后已成功。旧 Plan 提示改为比较实际摘要内容，
不再因版本号单独变化重发；42 项定向测试通过。最新包已在确认225会话空闲后
重装并重启，新临时会话确认 AITP ready / 0.10.0 / contract 0.3、无 Goal。
核心/worker/Web 与验证包一致，PTY 实测通过。有限 G1–G7 验收及交付已完成，
包括明确询问时的新旧Note修改原因追溯；证据见
[验收记录](docs/aitp/lean-harness-live-acceptance.zh-CN.md)。
不宣称生产科研正确性、普遍召回或OS隔离；下方旧pending段落保留为历史。

Web 源码已修正 contract 0.3 被误报为 checkpoint 写入不可用的问题；未知版本
仍不宣称可写。规范构建及隔离浏览器复测已通过。Board/Manager 说明明确或未知的
Goal 依赖，已解决决定仍保留为历史；日常核心和 AITP 0.10.0 已配套安装，
临时新会话确认 ready / contract 0.3。完整验收尚未完成。

Research 提示精简重复的规划/记录说明，保留归属、无变化零写、恢复及明确人类答复
边界；本次提示更新已进入日常安装版本。
人类决定工具回执也不再要求独立工作通过新 Action 恢复。
CreateGoal/GetGoal 现返回既有 Goal ID，让模型能明确声明决定依赖而无需猜测；
隔离版本已通过明确依赖与独立 Goal 的实际模型验收。

Research 协作者的明确完成/失败状态现在可从既有事件日志冷恢复，复用日志打开时
的流式读取，不在每次 Board 刷新时全量扫描。历史未结束代理不会被复活为 running。
真实隔离双线嵌套会话已通过重启后的 REST/Web 恢复；最终安装及其余验收仍待完成。
开始/完成/失败事件增加既有 mirror runId，服务器投影据此拒绝复用 agent 后迟到的
旧执行结果。Web 实时事件也按 runId 匹配，重连从快照可选 run_id 恢复执行身份。
旧记录缺少执行身份时仍保留不确定性；隔离版本的真实复用及再次冷恢复已通过，日常安装待完成。

前台切线后，其他线保留 Action 的进展与最近变化不再混入当前摘要或下一步。
切回原线可再次看到原记录，底层历史不修改。

长期规划走 scoped AITP Note，不要求 Goal、Plan 激活或 Action 仪式。
直接 Note 草稿不因 Question 编辑失效，也不重读 Question 的全部证据。
AITP 仍验证草稿实际引用及原子 Topic/workstream 条件；旧 Plan v2 API
保留原兼容契约，不作为正常规划入口。

记忆刷新复用不足 30 秒且归属一致的 ready 视图，不再以本地 UI revision
变化触发重复读取。adapter 保存尝试会使缓存失效；已知外部变化仍需显式刷新。
这不是文件监听或原子保存检查的替代，最终安装会话验收仍待完成。

Research 组织状态不再充当普通工具执行许可证：读取、shell 命令和委派不要求
Action/phase lease。既有工具权限与工作区保护仍生效；Research Mode 不额外
授予 Git、文件或远程执行权限。

上下文效率修复：内置 coder/explore 不再因为交接少于 200 字符就自动
追加一轮模型调用要求扩写；自定义 profile 显式配置的 summary policy 保留。
隔离安装会话已测试嵌套 Research 委派，完整验收仍未完成。

恢复既有 Agent 不再要求新的 Research Action；Agent 工具保留父子归属、空闲及
不可改派检查，并通过既有 lifecycle 重放恢复已知、本人持有的冷代理。未知或
其他调用者的代理在恢复前拒绝；普通工具权限仍生效。

任务记录的可选父代理身份已传到 REST、WebSocket roster 快照与 Web 任务数据；
仅用于展示溯源，不授予权限。旧记录缺少父级时保持未知。快照新增可选
agent_relationships，从持久化元数据恢复父子关系，不推断历史任务运行状态；
Board 已将这些关系与当前会话任务组合为默认折叠的协作树；浏览研究线只筛选
展示，不改变执行归属。缺少当前任务状态时明确显示未知。组件级浅色/深色检查
通过，隔离安装版 Web 的双线／嵌套 agent 浏览实测也通过；不代表所有恢复、
写入场景已验收，也没有替换日常安装。

Klient 任务解析及 SDK 公开 agent 任务类型已补齐可选 taskScope/parentAgentId；
旧任务无需新增字段。这是归属信息，不是 AITP 绑定或执行权限。

2026-09-09 协作改动（仅源码）：Agent 工具新增可选 `task_scope` 归属标签；新建
agent 可继承调用者已保存标签，恢复时拒绝改派；任务记录、REST/WS 和 Web 数据
保留该标签。Agent 回执头说明运行归属和状态，子 agent 摘要说明发现；不要用摘要
中的身份说法覆盖回执，也不要把任务完成当作科学正确性认证。标签不授予权限、不等于 AITP
绑定。主 agent 可用 `research-line:<已有 slug>` 归属直接委派，无需新 Action；
未知 Line 拒绝，正常工具权限仍生效。嵌套跨方向校验、任务树投影和端到端验收仍在进行，见
[实施计划](docs/aitp/research-mode-lean-harness-plan.zh-CN.md)。

源码中的四个原生 AITP 只读工具采用现有低风险默认审批；显式 deny/ask、Research/adapter 校验仍优先，写入工具不在此列表。真实 GW 入口复测已消除错误 Bash 调用；隔离源码服务四工具读取零审批验证通过，发布安装与整体验收未完成，见[测试记录](docs/aitp/lean-harness-live-acceptance.zh-CN.md)。

单线实测后续：`GetResearchStatus` 和 `ReadResearchCheckpointEvidence` 使用低风险默认审批，保留显式 deny/ask、checkpoint 新鲜度与路径约束；已本地安装，并在隔离服务重载后验证状态读取及三文件证据批量读取免审批，用户原会话未重启。Research mutation 仍走正常权限。后续修正澄清简单尝试不得将旧 Action 自动生成的 minimal plan 当成 Research Plan 引用，并修正同一 prepared draft 的工作区绝对路径误拒绝，其他草稿写入仍拒绝；这两项已安装并在隔离服务重载，新简单尝试已成功启动，绝对草稿路径仍待真实复测。见[单线验收](docs/aitp/crpa-single-line-live-acceptance.zh-CN.md)。

源码中的共享 Todo 自动提醒只发给主 agent，不再灌入委派子 agent；空清单、全完成或已提醒且无变化的清单不重复提示。显式 Todo 访问与权限不变。

源码中的 Plan 提醒改为随模式/路径变化和上下文丢失更新，不再周期性重复完整规则；实际请求测试覆盖连续对话与压缩恢复，规划执行/审批约束不变。尚未安装。

源码维护优化：仅自动进入 orienting 不再触发 AITP 刷新。提交后蒸馏通常只发送简短的相关性提示，完整外部 Skill 按需加载；同名遮蔽时仍精确加载插件版本。不会自动批准或发布知识卡，真实验收待完成。

源码中的 `GetResearchStatus({line_slug: "已有研究线"})` 提供只读跨线概览，不切换执行焦点、不移动任务/checkpoint 归属。Web Board 已加入本地只读浏览入口和外线进展过滤；隔离浏览器交互及两主题检查、521 文件发布资产重建校验通过。其他客户端适配和真实任务验收尚未完成，未安装。

Research Mode 轻量化与实际请求上下文去重：[详细实施与验收计划](docs/aitp/research-mode-lean-harness-plan.zh-CN.md)。已授权开发中，尚未完成。

原生 AITP 读取提示已改为复用新鲜报告、明确 workstream，不再要求每轮开头结尾必查。错误限制相关证据的使用，不阻止独立科研；保存后验证及 exit 2 的不确定性保留。本次仅描述修复，尚未安装；原始大报告及真实 relay 重试仍在调查。

后续源码呈现调整：enter/check 的已有概要字段排在大数组之前，完整字段仍保存在现有溢出报告文件中，不改 schema、不删 findings。真实报告离线重放确认计数和最新工作笔记指针可进入 2,000 字符预览；报告总体积不变，尚未安装或证明真实效率提升。

最新源码改造取代下文仅限查询的范围：Research action 和 capability 标签不再为普通工具授权，正常权限检查保留；Entry/Note 草稿准备不再要求 Action。提示改为按任务复杂度规划、有持久变化才记录，记忆不可用仅影响相关保存而非自动停止 Goal。已授权的 AITP 0.10.0/contract-0.3 原子 Note Topic/workstream 保存已实现，草稿归属、重试与异常回执的定向测试通过；隔离源码服务可用，日常安装与完整端到端验收仍未完成。不能把当前源码当成已交付版本。

当前源码已对无变化的 Research 提醒做跨 turn 去重，并将完整 Goal 指导与简短用量更新分开；Research 上下文保留归属和续行信息，不重复 Goal 目标正文。这一小部分已有请求链和恢复测试，尚未重装或完成整体验收。

待保存证据提醒现在会在候选出现、更换身份或移除时刷新，不因单纯 revision 变化重复注入。这项最新源码修复已有定向测试，安装后验收仍待完成；提醒更新不会新增执行门禁或自动解决人类决策。

当前可见的人类决定文本和解决结果变化也会刷新，不依赖 Goal 或 phase 切换；无关 Action 的决定不混入当前上下文。这只同步提醒，不改变 Goal 依赖或审批语义。

适配器 degraded 警告现在只说明受影响的保存，不再宣称独立工作或通用 Goal 续行／完成被禁用。未保存内容和明确的工作线归属仍需正确恢复，真实人类决策语义不变。

没有活跃工作或未处理归属时，选择研究线不再要求 phase 必须为 idle。待保存内容、活跃 Action／运行和未解决人类决定的保护仍在；不应仅为 phase 标签而编造或结束 Action。这项最新源码修复仍待安装回放。

TUI 后续修正（仅源码）：紧凑看板的科研 Next 不再强制要求接纳本地结论或恢复旧 Action/phase；记录维护单独提醒，展开详情保留原始来源。这不会替用户解决人类决策或更改正在运行的 Goal。

源码中的普通文件/文献读取及已有任务状态/输出查询不再要求 Research action 或特定 phase；单条明确的调度器查询、日志读取（可通过 SSH）也有快捷路径。正常工具权限继续生效；一般 Bash 脚本、写入、未知 MCP 工具和 canonical 持久化不因此获得查询权限。这不是 OS 隔离，真实验收尚未完成。

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi 终端欢迎界面，像素风猫耳探索飞船" />
</p>

<p align="center">
  <strong>以追求真理为唯一目标的理论物理科研 Agent。</strong><br />
  <span>真理是目标，证据是边界，可复现性是检验。</span>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">仓库</a> |
  <a href="docs/zh/guides/getting-started.md">使用手册</a> |
  <a href="LICENSE">许可证</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## 为什么是 Hakimi

Hakimi 不是一次性回答机器。它以有界的工作追问一个理论物理问题：明确假设，寻找可推翻的证据，区分结果与不确定性，并选择能够判别问题的下一项检验。

终端、代码、搜索、测试和 subagent 是它的科研工具，而不是产品身份。Hakimi 不以忙碌或工程复杂度为目标；它从最简单的有用模型开始，优先选择最小、最有判别力的检验，而非更大却更含混的构造。

## 科研闭环

```text
问题
  → 有界行动
  → 证据
  → 结果与不确定性
  → 下一项判别性行动
```

只有一项行动能够改变接下来应当相信什么或做什么时，问题才构成科研。Hakimi 将这条闭环显式化：每项行动都有边界，每个结果都记录其限制，每一步都根据区分现存可能性的能力来选择。

## 目前已经具备

- **科研界面：** TUI 和 Web 提供 Research Board 与 Research Manager，用于追踪和引导进行中的工作。
- **科研结构：** Research Line、Question 和 Focus 让当前未知、假设与优先级可见。
- **有界行动：** `BeginResearchAction` 与 `ConcludeResearchAction` 以结果、限制、下一步和一次显式 durability assessment 框定科研工作。没有 durable delta 时不做账本持久化；已绑定的 durable delta 只生成一个 typed pending candidate，并复用现有 AITP commit barrier。未绑定的结果会关闭 Action 并保留为本地结论，不冒充 AITP 记录，等待研究者明确确认归属。通过 `ProposeResearchCheckpoint` 显式恢复时，必须同时提供该保留结论 ID、`confirmed_by=user` 和刚从 Research 状态读取的当前 revision；普通 checkpoint proposal 的行为不变。
- **科学优先的进展：** 进展围绕证据与不确定性组织，而非工具活动或 transcript 数量。
- **审阅与人工控制：** human gate 与 alert 支持明确判断，类型化的子 Agent 证据审阅使委派工作可检查。
- **外部计算观察：** Hakimi 可以记录外部 HPC 工作的结构化观察，同时严格区分 scheduler 状态与科学证据。它不调度任务、不轮询至结束，也不认证成功。Goal 是跨 turn continuation 的唯一 owner。

## 理论物理研究规程

可选的 `theory-physics` domain pack 是持续理论物理研究的上层使用手册。它支持先讨论未知、回读相关记录，再通过有归属的文献或推导工作形成候选。一个科学 loop 可以跨多个 bounded Action 和 turn；Goal 可选，reviewed local plan 服务复杂 Action，Research Plan 指导里程碑策略。读取既有 AITP 知识不要求先产生 durable delta。持久记录与条件性方法 review 仍遵循外部 `using-aitp` 和 `distilling-methods` skill，不在 Hakimi 复制第二套协议。

Theory Physics 0.2.5 已本地安装：将已有作业查询与新计算/构建审计分开，区分提交回执和结构化 Run。失败诊断先沿保存的证据定位，保留首错和实际数值，再按需要扩大检索；无法区分原因时明确缺失的 observable。蒸馏先判断本次 Entry 是否适用，不适用就不另做 harvesting。插件安装/发现和文件一致性核验通过。一次真实未变化作业查询没有写账本或额外扫描；受监督的 Si 证据纠正完成了 scoped save/commit 和 Question 更新，没有新计算或 Method card。纠正仍需要草稿修复且模型响应耗时，尚不声称提速、自主行为或五课题全部验收通过。不新增门禁、工具、scheduler 或 AITP 规则。

普通的一次性物理问答不需要 Research Mode。这个 pack 提供的是规程而不是物理预言机：它不是文献库、物理正确性服务、调度器、第二套 runtime、账本或后台自主 loop。研究者仍然负责物理约定、重要性判断和最终的科学结论；AITP 仍是协议 authority。

## 先有证据，再谈确信

Hakimi 可以帮助构建论证、计算、代码、检索和测试，但这些都不能单独认证一个物理主张。Hakimi 不认证物理正确性、数值收敛性或正在运行的外部任务是否成功。

人工审阅和可复现验证是科研闭环的一部分，而不是最后装饰性的步骤。证据不足或彼此冲突时，诚实的结果应当是不确定性、被阻塞的问题，或一项更小的判别性检验。

## Research Mode 与 AITP

AITP 科研记忆指导（2026-09-08；已本地安装并 reload）：外部 `using-aitp`
Skill 新增按需读取指南，结合当前线的综合与尚未覆盖的证据，区分 Entry、Note
和零写入，并保留理解演化。Note 模板提示与现有 contract 描述同步更新，runtime、
CLI 和 schema 不变。原 Si 会话已实际读取新指南，恢复同线证据并保存一份
Working Note；旧记录与其他研究线不变。验收仍有说明读取门禁、revision 混淆
和 Entry 引用不足，relay 故障阻断了待执行补正；未修改 harness，也不声称
自主遵循或科研效率提升。交付边界见
[handoff](docs/aitp/README.md#research-memory-guidance)。

定向 Note 读取修正（2026-09-07；已本地安装，冷读通过）：需要读笔记而没有 scoped
定位时，现有 Research 指引使用已确认 workstream 做一次 `aitp_enter`，再读其
返回的精确 Working Note 路径；不能用文件排序判断研究归属。不新增健康检查轮次、
写入触发或公共 schema。五会话冷读保持科研状态与归属；真实上下文交付通过，
不等于自主选取验收。另一次明确请求的 Si 阶段综合已复用现有证据保存 scoped
Working Note，没有改动其他课题或把 failure 宣布为解决。
随后受监督反驳复核保存了一条归属正确的诊断结论；合成检验没有复现 Si 失败。
针对提交后的重复检查，成功提交回包现明确 native 核验已完成，仍保留必要的
证据读取及 Note/候选复核检查。定向回归、本地 CLI/Web/PTY 交付和五会话冷读通过；
实际模型是否停止重复检查仍待真实行为验收。
详见[交接说明](docs/aitp/README.md#scoped-note-retrieval)。

Focus 展示后续修复（2026-09-07；已本地安装并通过只读模型回访）：默认 `GetResearchStatus`
摘要保留所选 Question 和 Focus revision，但省略可能描述旧任务的 captured
`boundedAction`；当前指引仍以 `effectiveNextStep` 为准。完整诊断和公共快照
保留原 Focus，不重写意图、不比较无关 revision、不改变科研状态或恢复 Goal。
五会话冷读和一次真实状态问答保持归属与记录不变，不保证其他场景的模型行为。
详见[交接说明](docs/aitp/README.md#focus-intent-disclosure)。

切线焦点恢复（2026-09-07；已本地安装并真实回访）：返回已结束的研究线时，
仅在历史 period 保存的 Topic observation 与当前完全相同时，恢复该线最后的
open/active/blocked Question，使用问题当前的下一步，不复活旧 action。
未知/变化归属、已关闭/取消/延期的问题或最近一次无焦点时不恢复。
不写 AITP、不确认绑定、不恢复 Goal，公共快照格式不变。

状态读取精简（2026-09-07；已本地安装并回放）：`GetResearchStatus` 默认将重复检查回执
改为计数，`detail="full"` 仍返回完整诊断。科研字段、阻塞、恢复身份及公共
Research 快照不变。同一真实快照从 234,426 降到 45,577 字符；这是输出体积测量，
不是速度或科研质量的提升证明。真实工具已返回完整摘要；受监督的后续综合已把
原证据及剩余缺口写入 Question，没有再次保存或恢复 Goal，不保证自动综合。

非 agent 记录接纳修正（2026-09-07；已本地安装并真实回放）：prepare 省略 creator 时，
Hakimi 改为核对 AITP 实际写入的 `agent:unknown`，不再错误要求必填字段不存在。
15 项 provenance/prepare 测试通过，不改变 authority 或放宽其他身份校验；
真实 NiO 原 observation 已重试接纳，没有再次保存、新建 Action 或恢复 paused Goal。
这证明持久化恢复，不代表 NiO 计算完成或物理有效性通过。

暂停 Goal 指引（2026-09-07；已本地安装）：有界的问题、进度查询或恢复请求可以正常处理，不必恢复 Goal 自动续行；只有明确要求恢复自主推进才应激活 Goal。一个真实理论审计已完成 Action、证据记录和 Question 更新，Goal 保持 paused；这是模型指引，不是 runtime 意图分类器或普遍行为保证。

记录后 review 修正（已本地安装）：既有外部 Skill handoff 明确先判断本轮证据，再决定是否检索候选。不适用就结束，不额外扫描或检查；真正 harvesting 仍遵循 AITP Skill 全部规则。3 项 handoff 测试及 CLI/Web/PTY 交付检查通过；一次受监督 NiO 恢复已直接 no-op，不是普遍行为保证。状态输出过大、Question 综合落后仍待改进，见 [handoff](docs/aitp/README.md)。

记录提示修复（2026-09-07 已本地安装）：待保存时，证据读取指引提供精确的当前 checkpoint/revision，不再让模型从旧对话找数值。状态变化仍须刷新，普通科研不增加 revision-only 上下文更新。安装版同时解释如何查询没有结构化 Run 的旧提交，不伪造关联、不改变权限或身份校验。真实科研验收尚未完成，见[handoff](docs/aitp/README.md)。

恢复修复（2026-09-07；已本地安装）：已结束的结论在原始归属明确确认且上下文未变时，即使人类决定让对话返回规划、评价或空闲，也能继续原有 checkpoint 流程。不再重复接纳或重复写结论；人类决定、科学证据和选定的返回阶段不变。真实会话冷恢复已接回原归属的 pending checkpoint；canonical 保存与科研验收单独记录，见[当前 handoff](docs/aitp/README.md)。

后续修复已本地重装（2026-09-06，源码尚未提交）：顶部始终保留独立的 **Research 开关**，
不再藏在输入框的 Mode 菜单里。会话选择框直接展示其他已加载会话（包括
状态未读取的会话），明确标注当前会话。开关失败会显示错误并保留真实状态；
忙碌、连接和 Plan 冲突检查不变。新增完整 App 浏览器测试验证实际客户端跳转，
不只验证单个面板的模拟选择。
包版本仍为 `0.21.0`；安装后的 Web 资源、独立 Web 启动和 PTY 已验证。
请在空闲时重启已有 Web 进程并刷新浏览器；本次未提交或推送。

Web 开启 Research 后进入深空研究工作台：临时深蓝配色、静态星点、线框行星、
轨道罗盘标识与仪器式边框；Dreaming 使用淡紫色变体，不加入持续运动的背景或
虚构读数。普通侧栏自动收起；退出后恢复原主题和侧栏偏好。右侧看板可收起，保留课题、
当前循环、需要注意和下一步；收起时仍显示循环阶段。后续修复已从工作树本地安装（2026-09-06，版本仍为 0.21.0）：
会话列表增加已运行会话的轻量 Research 模式／Line 信息，无需先打开对话即可发现
多个已开启的研究会话；全局活动事件刷新对应会话概览，完整对话订阅仍限四个。
未载入的旧会话保持未知，不会因发现会话而被恢复，也不会启动或暂停其他 Goal。
顶部「研究会话」可以跨
会话和工作区跳转，仅切换查看，不启动、暂停或恢复科研。此前已安装版本只展示本浏览器
已经观察到的 Research 状态，其他会话明确标为「状态未读取」，旧会话可通过
「浏览全部会话」找到；这还不是完整的全局活跃课题索引。现有 Research GET 会
恢复 Agent，因此导航不会在后台逐个探查历史会话。Collaborative／Dreaming
在空闲时通过现有带 revision 的命令切换，不改变 Goal 续行、工具权限或人工决策。
Escape 关闭选择框不会中断后台工作。已从 `d23654b61` 本地重装（包版本仍为
`0.21.0`，未发布 npm 新版本）；请在空闲时重启已有 Web 进程并刷新浏览器。
安装后的 Web 资源和 PTY 启动均已验证；不改变 AITP、SDK 或传输契约。

Goal 的纯用量更新保持 Research revision 不变，同时继续刷新 Board。读取状态与确认 workstream 之间的 token 记账不再使确认请求过期；Goal 控制状态变化和实际 Research 修改仍使旧请求失效，不会自动推断或确认绑定。已从 `172875fa2` 本地安装，运行中的 Hakimi 需重启加载；不会自动恢复 Goal。见[集成交接](docs/aitp/README.md)。

Goal 恢复前会先检查剩余预算。已耗尽时保持 blocked，明确告诉模型“未恢复”，不短暂切到 active，也不让立即到期的定时器取消收尾说明。原用量、预算和已有阻塞原因保留。源码验证与安装状态见[有界恢复修复](docs/aitp/theory-physics-collaborator-program.md#goal-budget-resume-preflight)。

原生会话和 print mode 与 Hakimi SDK 使用同一 home：显式 `homeDir` → `HAKIMI_HOME` → 兼容的 `KIMI_CODE_HOME` → `~/.hakimi`。这修复了真实科研验收中原生引擎误用旧 Kimi home、找不到已安装 AITP contract 的问题。不会迁移或合并任何旧配置、插件或会话；旧目录中的会话需显式选择原 home 恢复。真实课题验收与剩余限制见[合作者规划](docs/aitp/theory-physics-collaborator-program.md#1911-g7-首次真实运行与启动目录修复)。

Print mode 退出时会先暂停 active Goal 并刷出日志，再释放运行时，包括 SIGINT、SIGTERM 和 SIGHUP。已经停止的 Goal 不变；中断不会完成科研工作或写入 AITP 记录。原有有界清理不能保证 SIGKILL 或存储写入卡住时的持久化。详见[非交互执行](docs/zh/reference/kimi-command.md#非交互执行)。

干净构建安装版已通过独立进程信号测试和真实 PTY 验证。这证明退出持久化，不代表跨 turn 科研验收完成；详见[交付证据](docs/aitp/theory-physics-collaborator-program.md#print-goal-shutdown)。

交互式 TUI 收到 SIGTERM 后，会保留信号监听直至 Session 清理完成，避免信号辅助库在 active turn 的取消和 Goal 暂停保存前终止进程。重复 SIGTERM 不会跳过清理。SIGHUP／终端失效的紧急退出以及 SIGKILL 不在此保证范围；详见 [TUI 退出验证与交付状态](docs/aitp/theory-physics-collaborator-program.md#tui-sigterm-shutdown)。

冷恢复时，AITP discovery 会等待会话 Skill catalog 就绪。退出或 reset 会取消等待，迟到结果不能恢复旧权限；插件缺失、不兼容或 catalog 初始化失败仍如实显示不可用，不额外添加 maintenance 重试。

委派的 operator 不拥有共享 AITP 生命周期：子 agent 的恢复或 undo 不能 reset 主研究者的 adapter 或 maintenance 状态。进入或恢复 active Research Mode 时，也会为旧 tool allowlist 补齐已有的 evidence review、run observation 和 historical checkpoint discard 工具；这些修复不批准证据、不改变 checkpoint 或 human decision 语义。

上一动作已经收束后，新的显式 `BeginResearchAction` 可以直接从 `state_updated` 开始，不再要求改 phase、改 Focus 或重复写进度。pending checkpoint、live action/run、未决 human gate 和过期计划仍阻止替换。这修复的是动作衔接，不替代科学判断，也不另行调度 Goal。

未绑定的结果会在 Board 显示真实结论，不再把已结束的工作标成运行中。原始归属仍 fresh 的 agent 结论，在首次明确确认 Line/workstream 后自动生成 pending checkpoint；有歧义的归属仍须显式恢复。记录阶段可用 `ReadResearchCheckpointEvidence` 读取一个指定证据文件，不必借用 Bash 校验指纹。持久化后，新观察 Action 可通过 `observed_run_action_id` 显式沿用同一 Run，保留原提交来源。AITP 保存、人类科学决策、普通工具权限和 Goal 生命周期保持独立。这些恢复改动已本地安装为 CLI 0.21.0，真实 Si 会话已完成提交记录保存并执行新的 bounded 查询；结构化 Run 沿用由回归测试验证，不能拿该仅有提交回执的会话代替真实验收。不新增 scheduler 或自动重提作业。详见 [恢复说明](docs/zh/guides/research-mode.md#保留的本地结论)。

该恢复修复已从 commit `06b8524102df` 安装，并在真实 Heisenberg 旧会话中完成既有 Action 的收尾与冷恢复，没有重算。这尚不代表已绑定 AITP 持久化或 Goal 自动科研通过；[验收记录](docs/aitp/theory-physics-collaborator-program.md#1923-本地结论交付与原会话恢复验收)区分了这些未完成项及一处模型归因错误。

作业观察恢复修复已交付并本地安装：已关闭的 Action 可以登记其既有外部作业的新观察，不重开 Action，也不改写原结论。这不授予轮询或新科研权限。[有界恢复切片](docs/aitp/theory-physics-collaborator-program.md#retained-run-recovery) 记录了安装版 CLI 重启与 WebSocket 检查；这些是 fixture 测试，不是科学或 Goal 续行验收。

Research Mode 默认可发现，但每个新 session 都从 inactive 开始。对于持续工作，`theory-physics` 可以指导模型调用 `EnterAITPMode`、等待 authoritative probe status，并执行有界行动；inactive session 的 AITP I/O 为零。Research Board 和模型上下文会明确区分 Hakimi Goal、observed AITP Program（含其顶层 **Research goal**）和 Local Research Loop。Hakimi 只通过 AITP `enter` 观测该顶层目标，从不写 `TOPIC.md` 或 AITP Topic。Goal↔Program alignment 是仅在本地 checkpointed、由用户显式确认的 binding，不会根据文本相似度推断。当前轻量化源码中，缺少 binding、binding stale 或明确 conflict 只限制相关记忆操作，不阻断独立 Goal completion 和 continuation；真实未解决的人类决定仍受保护。进入 Research Mode 不会调度模型轮次，跨 turn continuation 仅由 Goal 负责，Plan 只是行动内短期 overlay；没有 Goal 时交互式 Research 仍可正常工作。TUI/Web 的紧凑 Board 统一为 Project、Current cycle、Attention、Next 四个位置，并把旧 period counter 准确标为 Research turn 数；健康 AITP 与 provenance 折叠到展开详情。已收尾的 `state_updated` cycle 可以直接切换 Line，归档旧 period 并回到 `idle`，不额外写入 AITP；未完成工作、待持久化内容、未解决 human gate 和其他非 idle phase 仍阻止切线。其他 Line 的 alert 也不会冒充当前 attention。默认 Goal engine 还会公开派生的 `idle`/`deciding`/`enqueued`/`running`/`held`/`waiting` continuation 状态，因此被 Research policy hold 的 active Goal 会显示为 `active · continuation held` 及其 owner/reason，而不会与 paused Goal 混淆。缺少该可选字段的旧 snapshot 会标为 unavailable，多 Line Board 状态则始终按当前选中 Line 隔离。每个 admitted Research turn 都会在注入模型上下文前执行一次确定性本地 reconciliation，因此可机械判定的 Line/Action/phase/period/cursor 漂移会在回答前修复；这不会额外跑一轮 AITP maintenance，也不推断科学结果。historical checkpoint 只有在 Hakimi 能够证明它没有 save receipt、committed Entry 或 committed-history 痕迹，且其捕获的 Question 或 Program binding 已 stale 时才会自动丢弃；任何含糊状态都保持 blocked，等待显式恢复。replay 只修复可确定的 Action/phase 结构：同一个 Action 保持 live、阻止 Goal completion，并在下一次 interactive Research turn 中根据证据解决，不会被自动完成或自动放弃。

上段的 “Plan” 特指短期 Action-local Plan/Todo；带 revision 的 Research Plan 是跨多轮、可随证据演化的科学策略，但同样不拥有 continuation，也不能完成 Goal。经审阅的 local Action Plan 可以独立执行，不强制创建 Goal 或完整 Research Plan；如果已有 draft/active Research Plan，planned action 仍须同时绑定其 active milestone 和经审阅的小计划，缺项或过期 binding 继续拒绝执行。simple 小检验也可以显式关联当前 active milestone，不必再写详细的小计划；省略关联仍合法，系统不会自动推断归属。该修复已从干净 commit 安装，安装版 CLI 的 REST/WS 和进程重启复测通过；软件 fixture 不代替真实模型科研验收，见[里程碑关联验收](docs/aitp/theory-physics-collaborator-program.md#simple-action-milestone)。

紧凑 Board 优先显示当前研究线、科学目标或里程碑，以及正在做的工作。live Action 的目的与其运行中的作业同时可见；明确属于其他 Line 的 Action/run 不混入当前研究线，旧单 Line 视图也一样。turn 计数和明确分类的历史失败保留在展开审计中，不冒充科学进展或当前阻塞。Action 结论没有待保存 checkpoint 时显示“下一步／就绪”，Goal 明确等待时显示“等待”。Research 上下文不再仅因预算计数或内部 revision 变化重复整段提示，但范围、完成条件、续跑和预算上限等实质变化仍会刷新。这些显示修复只是[合作者总体规划](docs/aitp/theory-physics-collaborator-program.md)的一部分，不代表整个科研工作流已经验收。

Research 协作策略与工具权限模式相互正交。`collaborative` 只在会改变 Research Plan 的关键不确定性上询问研究者。`dreaming` 表示一旦 Goal、scope 和 completion criterion 已明确，Hakimi 就记录 reversible、low-cost、in-scope 的默认假设，并让 Goal 拥有的 continuation 在不逐步确认的情况下继续推进课题。两者在改变 Goal/scope、会影响结论的科学约定歧义、昂贵或不可逆操作，以及 AITP/其他 human decision 处都仍会停下。`auto` 只决定常规工具风险确认；因此 Goal + `dreaming` + `auto` 可以在已约定的科学与操作边界内自动推进，但不会获得新的科学决策权。

Research Mode 一旦 active，Action 归属就由 Tool Executor 强制执行，不需要实验开关。由模型发起的科研工具必须属于一个 fresh、in-progress 的 bounded Action，并且拥有显式授权的 capability；control/recovery 和精确 checkpoint draft 持久化另有更窄的 lease。被拒绝的 `BeginResearchAction` 不能再被 Web、workspace、shell、subagent、scheduler 或未知 plugin/MCP 工具绕过，而创建 Action 与执行科研工具不能放在同一批次。这是 executor-enforced policy，不是 OS-level isolation：被授权的 shell capability 仍很宽，仍受通用 permission system 和 host sandbox 约束。

Research Line 与 AITP workstream 也是两个不同的 identity。Hakimi 观测到当前 Topic 后，必须由用户或 main agent 显式确认一条带 revision 的本地 Line→workstream binding；slug、文本、路径或 ID 相同都不表示 membership。每次确认都有 server-owned opaque identity，clear 必须同时比较该 identity 与不随 undo 回退的 public Research revision。`unbound`、`unavailable`、`stale` 或 `conflict` 的 Line 仍可做低风险本地探索，但 scoped maintenance 和 Hakimi checkpoint adoption 必须使用精确的 confirmed binding。Hakimi 会在 scoped maintenance 与 checkpoint write 前重新做无作用域 Topic observation，post-save commit barrier 同时校验 captured Topic 与唯一一个 captured workstream。checkpoint-bound save 要求 AITP 0.9.0 adapter-contract 0.2：Hakimi 会把 captured Topic 与 exact singleton workstream 传给 atomic `record save`，因此 mismatch 不产生 canonical Entry；post-save `show` 和 scoped `check` 继续作为 defense in depth。重新绑定前必须先显式清除；undo 或 cold restore 会重新校验已保存的 Topic 与 observed revision，不会自动修复 binding。REST、WebSocket、Node SDK、klient、TUI 和 Web 投影同一个 binding status 与 typed durable-candidate state。

[AITP](docs/aitp/) 是可选的外部持久证据账本，通过其 CLI 与文件使用；它不是 Hakimi 的第二套 runtime 或数据库。`ConcludeResearchAction` 之后，Hakimi 可以把一个 assessed durable delta 路由到现有 prepare/fill/save/show/checkpoint 路径；no-delta 结论不会安排 persistence 或 distillation，human assertion/decision 也始终与 agent/tool/source verification 分开。一个新 checkpoint 首次成功 commit 后，Hakimi 会在同一轮把且只把本次 touched Entry best-effort 交给精确的外部 `distilling-methods` Skill 做一次有界 review。重复 commit 或 Skill 不可用是非阻塞 no-op；是否满足既有 trigger 只由外部 Skill 判断。Research snapshot 只会显示最新精确 handoff 已请求或不可用，不会声称 trigger、card、trial、review 完成、批准或发布。Hakimi 不自行解析 marker、创建或 revision card、approval 或 publish，也不会自动初始化/adopt/backfill workspace，不增加 `/research goal` 或 workstream registry，并且仍没有计划中的 native H6b coordinator。Hakimi 本地的 Goal–Program 与 Line–workstream binding 绝不写入 AITP。AITP 不可用时，Research Mode 会明确显示 degraded，并阻止 durable write、checkpoint 和 active Research Goal completion。详细兼容性与运行边界见 [AITP 文档](docs/aitp/)。

提交后 Note review 保留经过验证的来源 Line/Topic/workstream confirmation，并在 Note 工具真正执行时再次核验。切线、重新绑定、失去 ready、undo 或 restore 都不能沿用旧 draft 的写权限；只有恢复出的 review marker 时仍只读。阶段综合或中断的 review 可以通过新的 bounded Note Action 继续：host 在准备和保存新草稿前，通过 canonical Entry 回读核验所选 Question 的证据，不要求伪造新的科研 delta。这是本地归属保护，不等同于 AITP Entry 的原子 compare-and-save，也不新增自动卡片批准、发布或蒸馏协调器。

AITP degraded 时，用户指导的 Research 回合仍可在 fresh bounded Action 内做临时探索，正常 scope 和权限检查不变；自动 Goal 工作、AITP 写入和 Goal 完成仍被 hold。已确认记录归属的新结果或失败保留为本地 pending candidate 等待恢复，不会悄悄改成 no-delta。这修复了“允许创建本地科研行动，却拒绝其全部工作工具”的冲突。

同一用户回合内打开 Research Mode 后，入口收敛即开始 Research context 和一次本地 boundary，无需再发提示。暂停或退出会撤销准入，模式恢复不会赋予自动 Goal continuation。

证据保存并不等于科学 Question 已更新。持久结果的收尾指引先完成捕获的 checkpoint；首次提交成功后，再提示模型有条件地综合仍属当前上下文的 Question：评价、相关证据、剩余未知和下一步。重复提交或上下文已变化时不重复该定向提示。综合仍由模型通过现有 Question 工具完成；receipt 不会自动提升科学可信度或关闭 Question。

当前问题优先尊重显式 Focus；没有 Focus 时，可使用前台 Action 明确引用且属于当前 Line 的 Question，不设置 Focus，也不猜测归属。更高优先级的行动、作业、决定和持久化事项处理完后，Question 明确保存的下一步优先于历史 progress。Snapshot、status 和提交后的指引共用该上下文。详见 [Question 上下文修复与验证状态](docs/aitp/theory-physics-collaborator-program.md#question-context-projection)。

从既有证据整理阶段 Note 时，模型应先确定 Question 的 canonical evidence refs，再开始捕获该 revision 的 Note Action。现有上下文也会在 Topic 与已确认绑定匹配时标明原生 scoped maintenance 已完成；仅加载 Skill 不要求再做一次 `enter/check`。证据回读、真正过期后的刷新及必要的保存验证仍须执行。这是指引修正，不是新增阶段或自动科学判断。

可选 Theory Physics 插件包含 `calculation-operator` agent profile，用于限定范围的编译、输入、数值计算和后处理。主 agent 给出科学检验与范围，审查现有 typed evidence packet，并独占 Research/AITP mutation。这个角色不同于 `/preset` 的模型路由池；不安装 runner 或 scheduler，也不提供 OS 级隔离。真实科研验收单独记录在合作者计划中。

Theory Physics 0.2.3 将委派要点直接放进主研究者可见的 agent 类型说明：传递整项任务的剩余时间并预留父侧审阅和收尾，要求一份保存的 packet 加简短交接，或一份 inline packet。助手的详细指引仍独立保留；调用者不必先读取助手的完整 prompt 才能看到这些要点。受托 packet 保存和有依据的失败报告仍然必要：未尝试写入不能证明工具缺失，交接失败也不抹去实际数值结果。这是指导，不是 runtime 截止时间机制，也不保证模型必然遵守。

checkpoint 屏障还会在接纳前将已保存 Entry 的 kind、authority 和 creator 与已结束 Action 的候选对照。不一致时保留实际记录和 receipt 供审查，checkpoint 保持 pending，不触发提交后的蒸馏 handoff。这是保存后的身份核对，不是内容语义验证，也不是保存前 authority 的原子保证。2026-09-07 的后续修复还会复用同一次 canonical `show`，将已保存幂等键与 checkpoint 对照；不允许通过重存或改写 canonical 元数据绕过不匹配。本项已通过回归并作为 CLI 0.21.0 本地安装；五个真实会话冷读后归属和提交历史不变，没有重存记录。不改变 AITP 的原子 Topic/workstream 契约或人类决定，也不代表科学目标完成。

## 从源码安装

Hakimi 当前从源码安装。请使用 Node.js 24.15.0 或更高版本，以及 pnpm 10.33.0：

```sh
git clone https://github.com/bhjia-phys/Hakimi.git
cd Hakimi
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm build:packages
pnpm -C apps/kimi-code build
mkdir -p .tmp/dist-pack
pnpm -C apps/kimi-code pack --pack-destination ../../.tmp/dist-pack
npm install -g "$(ls -t ./.tmp/dist-pack/*.tgz | head -n 1)"
hakimi --version
```

`pnpm pack` 会打印实际创建的 tarball 文件名；上述命令会选择 `.tmp/dist-pack` 中最新的 tarball。更新源码安装时，拉取目标 revision 后重复构建、打包和安装步骤即可。

启动交互式会话、执行一次 prompt，或继续上一次会话：

```sh
hakimi
hakimi -p "Summarize the test failures in this repository."
hakimi -c
```

在交互式会话中，当工作需要时直接切换 Research Mode：

```text
/research
```

使用 `/login` 配置可用的 provider。配置 DeepSeek 时运行 `hakimi provider deepseek`。登录必须显式触发，Hakimi 不会在启动时自动开始 OAuth 登录。配置、session、日志和缓存默认保存在 `~/.hakimi`；设置 `HAKIMI_HOME` 可使用其他数据目录。

Windows 用户首次启动前请安装 [Git for Windows](https://gitforwindows.org/)。Hakimi 使用其附带的 Git Bash shell；如果 Git Bash 安装在其他位置，请将 `KIMI_SHELL_PATH` 设置为 `bash.exe` 的绝对路径。

## 当前状态

- Hakimi 是可从源码构建的开发版本。
- Research Loop 和可选的 `theory-physics` pack 仍是实验性功能，可能继续变化。
- 当前没有公开 npm 包或 release installer；请使用上面的源码构建路径。
- Hakimi 不取代专家判断、人工审阅或可复现的科学验证。

## 文档

- [快速开始](docs/zh/guides/getting-started.md)
- [配置](docs/zh/configuration/config-files.md)
- [Research Mode](docs/zh/guides/research-mode.md)
- [理论物理合作者总体规划](docs/aitp/theory-physics-collaborator-program.md)
- [理论物理合作者与 Research Loop 设计](docs/aitp/theory-research-agent-design.md)
- [AITP 文档与兼容性记录](docs/aitp/)
- [实现说明](IMPLEMENTATION.md)

## 项目背景

Hakimi 是拥有独立 `hakimi` 命令、`~/.hakimi` 数据目录、semver 发布线和科研方向的独立仓库。它选择性地建立在 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的工程基础之上，但不是追求产品 parity 的 fork，也不会自动采用上游行为。

历史源代码与署名背景保存在 [`bhjia-phys/Hakimi-upstream-archive`](https://github.com/bhjia-phys/Hakimi-upstream-archive)。所需署名见 [MIT 许可证](LICENSE)。

## 开发

在仓库根目录执行：

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

CLI 位于 `apps/kimi-code`；其他 package 提供应用使用的 SDK、模型/provider 集成和 agent runtime。

## 许可证

MIT。详见 [LICENSE](LICENSE)。Hakimi 保留 Moonshot AI Kimi Code 工作所需的上游署名。
# AITP Note 原子保存接入（源码更新）

未写入 AITP 的 local conclusion 不再锁住切线；原结论、依据及归属在切线和恢复时
保留，不会因为浏览另一方向就自动接纳到新 workstream。尚未安装。

切线现保留 live action 和已有 run，不要求完成或取消；前台 action/run 展示按研究线
隔离，迟到结果保留原身份。本次仍为源码更新，非最终多线/安装验收。

pending checkpoint 不再单独锁住前台切线；捕获归属或旧未知归属保持不变，
旧线迟到的观察不会替新线准备记录。live action/run 与在途 Note 切线仍在梳理。

未决的人类决定不再单独阻止切换研究线；切线保留决定及其依赖，不自动解决旧的
未知归属。在途写入与旧 live action 的切线限制仍待进一步解耦。

人类决定现可显式列出依赖它的 Goal ID，只阻塞这些 Goal；旧决定没有依赖字段时
仍保守保留为未知，不自动解决，也不放宽工具权限。任务级依赖和 Board 提示仍在
完善，本次源码尚未安装。

Board 的 Goal 停止条件已复用同一依赖判断：其他 Goal 的决定仍可见，但不再
把当前独立 Goal 显示为停止；真实 Web 渲染和最终安装验收仍待完成。

adapter 已支持 contract-0.3，Note 保存使用捕获的 Topic/workstream；旧契约
仍可读取，但不会静默降级执行 scoped Note 写入。最终跨进程验收和安装尚未完成。
