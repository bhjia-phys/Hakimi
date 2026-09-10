# Research Mode：轻量科研协作与上下文去重实施计划

## 有限交付完成（2026-09-10）

G1–G7 的本次有限范围完成。下面最终对账中的最后一项历史追溯已由
msg_01M2512S87HKMQ0CNYV17Y7VHE 的终态答案及新旧Note原文补齐；其余历史
pending段落是过程记录，不是未交付列表。最新日常包及两端AITP已验证，
06:50:41 UTC再次完整查询226会话均空闲，运行核心与构建产物一致。
新增CLI/SDK patch changeset，changeset status成功；没有commit/push。

完成范围仅为本文有限用例和实现。已知边界保留：Skill是建议而非科研正确性保证；
模型未自主发现旧Note矛盾的失败未抹去；数月长期召回、生产NiO/QSGW完成、
OS级隔离、自动人类决策、普遍速度优势均未实现或未测，不纳入完成主张。

## 最终逐项对账（2026-09-10，取代下方历史 pending 清单）

| Goal 要求 | 当前可定位证据 | 判定/边界 |
|---|---|---|
| G1 所有权和兼容迁移 | 本文字段表；agentResearchService 的普通工具 guard、Goal contributions；旧模型/replay 仍保留 | 已实现；未删旧 Action/Plan/Question API，不把兼容入口作为正常执行前提 |
| G2 自然执行与可修订规划 | 直接 Entry/Note 实际会话；无 Goal/Question/Action 保存及 supersedes；service 回归 | 已实现；路线放 Note，短期 Plan/Todo 仍可选；没有第二 continuation 引擎 |
| G3 人类决定及稳定归属 | delegation admission/metadata/shared run；实际 Agent、嵌套与 Swarm；Goal 独立/依赖/未知恢复；32 项 REST/WS | 有限场景通过；依赖由明确声明而非科学语义推断，未知旧决定未解决，不终止已有远程任务 |
| G4 上下文与维护 | 注入源码来源对账、95 项上下文回归及新增 Plan 摘要测试；真实压缩恢复；scoped receipt/写入失效竞争测试 | 审查完成；不是 HTTP 全文抓包或普遍语义去重，真实 Skill 主动加载和历史证据不删除；30秒视图不是外部实时监听 |
| G5 AITP 原子 Note | atomic-save spec/contract0.3、40 项 Entry/Note 针对性测试、220 项 ledger、跨进程 CLI 和异常回执记录 | 已实现及安装；无flag行为保留；合作写锁不等于 OS 隔离或 exactly-once |
| G6 Board/任务树/恢复 | 双线嵌套/复用及冷恢复实测，runId/迟到事件回归，Web 147 项与浏览器截图，TUI/SDK/IPC-memory记录 | 已实现并安装；任务完成不等于科学完成，浏览不改任务scope；不增加 scheduler |
| G7 有限记忆闭环 | GW改后召回、HS三方向只读、合成Entry写入/新会话恢复、Note修订/旧字节保留、多线嵌套、决定、压缩 | 最新Note恢复通过；新旧Note修改原因的定向历史追溯正在执行，仍待原记录支持的终态答案 |
| 同版本本地交付 | final-v2 包、main/worker/Web字节比对、PTY、225会话空闲重启、新合成会话ready；两端AITP文件一致 | 已交付；Codex需新线程加载；安装后改动仅测试夹具/断言及文档，不改变运行包 |

保留所有早期失败：过期召回、Note正文/refs矛盾未自主发现、上游压缩失败、
首次Swarm单item无效、REST夹具旧运行主动终止。它们不能被后续成功抹去。
本Goal不要求证明模型从不漏信息或行为优于裸文件；要求的有限历史追溯样本
仍须完成后才能关闭。生产NiO/QSGW等课题计算、OS隔离、自动科研正确性判断
均不是本次交付能力，不因测试通过而扩大声明。

## 2026-09-10 新 Goal：职责收束与兼容迁移基线

用户已重新授权完成整个有限开发、验收和本地交付周期，包含最小 Note 原子
作用域保存及人类决定的显式依赖。此前“等待上述两项授权”的状态由此取代；
不包含自动科学决策、生产科研执行、git commit/push 或未经确认的 SDK major。
下方旧 L0–L7 和逐次验收记录保留为历史，不能将旧方案或隔离安装当作当前交付。
最新版 AITP Skill 已在两端安装；2026-09-10 日常 Hakimi main/search-worker/Web
与当时验证的隔离安装包一致，新会话验证 AITP 0.10.0/contract 0.3 ready。
该包早于后续委派依赖补齐，不能称为本 Goal 最终包。最新源码的 Agent、嵌套继承、
Swarm 依赖拒绝/独立运行和压缩后恢复已取得有限真实证据，见验收文档顶部。
日常安装尚不包含这些最新委派改动；G4 最终请求来源审查和完整交付对账仍未关闭。

### G3 任务依赖补齐前的源码审查（2026-09-10）

本节按发生顺序保留实现前后事实，不作为当前未完成清单。审查开始时，不能以
Goal 依赖验收代替任务依赖：RequestResearchDecision 的输入当时
只有 dependent_goal_ids；agentResearchService 的关联判断接入 Goal completion
和 continuation。AgentTaskInfoBase 没有决定依赖，TaskService.registerTask 直接
注册 running 并调用 task.start；SubagentTask.start 包装已存在 handle 的 completion，
不是安全的委派前拦截位置。AgentTool 的 task_scope 只表达稳定归属，不能推断
该任务是否依赖某项人类答复，更不能当权限。

补齐原则：显式依赖必须在创建/恢复执行 handle 之前表达和检查，独立任务保持
可执行；缺少依赖信息不伪造“已无关”。不取消已提交远程作业，不追溯终止运行
任务，不给 TaskService 增加第二 Research scheduler，不以普通工具全局门禁替代。
必须覆盖 A 等待/B 独立、未知旧决定、恢复/迟到结果归属，并通过实际 Hakimi
合成委派验证后才关闭 G3。现有 Goal 和任务各自测试不足以证明这个交叉边界。

委派入口进一步核对：AgentTool.resolveExecution只建立execute闭包；launch才创建或
恢复handle。现有Research的onBeforeExecuteTool监听仅在main上处理普通Agent归属，
resume分支直接返回，不会为嵌套子代理提供决定依赖。因此不能仅在该监听增加一项
判断就宣称覆盖所有委派。实现应由通用委派域提供执行前参与接口，Research贡献
明确依赖判断；通用task域不反向导入Research。必须在真正启动前重新确认有效性，
并处理历史恢复时依赖信息缺失，不把预检通过当永久许可。

首个实现切片：delegationContribution.ts 提供通用同步参与集合；AgentTool 在真正
execute 阶段、runtime acquire/launch 之前读取稳定scope并折叠参与方，拒绝时
返回工具错误，不注册Task、不触发launch。空集合保持原行为。3项纯函数测试、
既有工具105项及core typecheck通过。Research参与方、异步launch准备后的最终
重检、跨scope/嵌套贡献可见性和实际拒绝不启动的集成测试仍待完成；不能把这些
纯函数测试算成完整委派保护。该切片仅在源码，尚未重新打包安装。

跨scope修正：collection记录对兄弟节点不可见，而subagent是Session下的平级
Agent节点；因此Agent直接fold会遗漏main贡献。新增IDelegationAdmission在Session
层fold，再由Agent调用，既不复制决定状态，也不跨Session汇总。容器测试验证main
贡献对同Session兄弟可见、对另一Session不可见、provider撤销后消失；与原工具
测试共106项通过。此时仍没有Research参与方，不能声明任务决定依赖已经启用。

后续源码接入：Agent增加可选goal_dependencies，省略继承父任务、[]明确独立，
新代理标签保存声明；恢复不能更改，损坏/缺失历史标签仍unknown。main Research
贡献读取当前humanGate，不缓存第二份决定；无待决决定不限制委派，明确无关Goal
或独立任务放行，交集依赖等待，未知不猜测。launch前与异步准备结束/run之前再次
检查；拒绝不启动run，不取消已有任务。若准备后才拒绝，可能留下已创建但未运行
的代理元数据，不能声称该分支零创建。Research Mode关闭时不贡献阻塞。
此声明不是OS隔离、不是自动判断科学依赖，也不覆盖AgentSwarm等其他执行入口。
实际模型、完整Research DI集成、恢复/嵌套交叉测试和其他入口审查仍待完成。

恢复/继承执行补证：Agent接口新增4种创建声明测试（继承A、显式独立、显式B、
未知）和3种恢复拒绝改依赖测试，连同首次拒绝/准备后拒绝共9项通过。它们验证
真实Agent工具到生命周期stub的边界，不是实际模型验收。入口追踪确认Swarm的
spawnAttempt独立创建子代理并经SessionSubagentService.run执行，未使用Agent工具；
因此当前Agent接入不能被宣称为所有委派路径保护。需将共享运行检查接入已有
SessionSubagentService.run，并逐入口支持/保留明确依赖，不能增加工具名黑名单。

共享运行入口已接入：SessionSubagentService.run在读取目标持久标签后、调用
runAgentTurn前执行同一个会话级admission，prompt/retry依赖拒绝测试确认未访问
目标循环。Swarm新增goal_dependencies仅作用于新item代理；默认继承caller标签，
resume/retry保留目标标签。沿用既有batch scheduler，不创建Research scheduler。
目标测试共185项通过；曾有metadata字段名拼写typecheck失败，已修正，重验单列。
源码跟踪在session/swarm/tower目录内仅共享service调用runAgentTurn；这不是对所有
插件/外部入口的安全证明。真实Research DI、模型和日常新包验收仍未关闭。

### 当前交付对账（2026-09-10，优先于下方历史基线）

完整 G1–G7 Goal 保持 active。以下是实现/验收缺口，不再是新的授权请求；
已批准的 Note 原子保存和显式 Goal 决定依赖不应反复请求批准。

| 范围 | 已有实现与证据 | 必须补齐的交付证据 |
|---|---|---|
| G1/G2 职责与规划 | 普通执行无 Action 仪式；无 Goal 的 scoped working Note 已真实保存/修订/新会话读取；旧 Plan v2 保留兼容接口 | 最终文档去除相互矛盾的当前状态描述；跨端入口核对，不把旧 API 的 Goal 要求误称正常规划要求 |
| G3 人类决定与方向 | dependentGoalIds 的源码、协议和恢复测试；实际模型暴露 Goal ID 缺口已修复；明确依赖 held、独立对话、显式答复后完成、旧决定保留而独立 Goal 完成都有隔离会话证据 | 旧未知依赖与界面呈现最终核对；不把上述合成验收当作所有任务调度场景已覆盖 |
| G4 上下文与维护 | 新鲜 scoped receipt 复用、保存失效、无变化去重测试；短答不再强制扩写 | 对实际主/子代理请求及 compaction 恢复做来源核对，补遗留重复项，不能仅据单个 injector 测试算完成 |
| G5 AITP 写入 | source 0.10.0/contract-0.3、Note 原子 CLI/adapter、同身份重试与跨线真实 CLI 验证 | Entry/Note 的未知回执、磁盘失败和跨会话并发完整验收对账；最后两端同版本安装 |
| G6 任务与 Board | 真实 A/B 嵌套、浏览不切执行、父子与原 scope、同 agent 复用及重启 REST/Web 恢复已通过 | 最终客户端/旧未知数据/迟到结果的覆盖审计；不把 Task 完成当科学完成 |
| G7 真实验收与交付 | GW 只读恢复有保留失败及改后成功；HS 三方向概括已对照三份引用记录，区分 Krylov 建议与 Stage I 原约束；合成记忆往返、嵌套/复用已有样本 | 必要缺项短测、最终跨端回归和安全日常安装；旧模型恢复证据不是最新部署验收，原科学课题完成不在本 Goal |

最新真实复用会话为 session_ad3d8070-7ad8-443d-af94-301c1303549c，隔离端口58653。
其证据见 `lean-harness-live-acceptance.zh-CN.md` 的双线嵌套节。下一项先核验 G4
实际请求来源与恢复；不再重复启动已通过的三任务嵌套试验。

### G1 字段所有权及迁移处置（实现前基线，不是已完成迁移）

| 内容/现有字段 | 最终唯一职责来源 | 迁移处置及不能丢失的历史 |
|---|---|---|
| Topic Goal、约定、研究方向 | AITP Topic 与明确 workstreams | 保留人类原目标；不得把聊天 Goal 自动写成 Topic Goal |
| Line/Question assessment、latestProgress 科研叙述 | AITP Entry/Note；尚未保存的内容明确为本地草稿 | 不再要求两份同义状态；旧本地内容作为带来源的历史/未保存内容可读，不伪装成 AITP 已保存事实 |
| researchGoal、goalProgramBinding | 通用 Goal 的投影、显式历史归属 | 不建第二生命周期；不伪造旧关系，不让缺少关系阻止普通科研工具 |
| researchPlanV2 | AITP 中可修订长期路线，普通 Plan/Todo 为短期执行 | 停止要求独立 activate/complete 和 Goal alignment 仪式；旧 Plan 保留只读入口及修订历史，不因有内容就自动迁移成新 Note |
| phase/currentAction/currentRun/period | 既有任务事实与可选尝试说明；旧周期留作历史 | 普通科研不必维护 phase/Begin/Conclude；任务状态不反向证明科学正确性；不批量 conclude/abandon 旧动作 |
| currentLine/focus 与 Board 浏览 | 客户端浏览/执行上下文分别拥有 | 浏览不能移动任务归属；新任务显式捕获方向，旧未知归属保持未知 |
| task_scope、parentAgentId、任务结果 | 通用任务/agent 系统 | 跨线、嵌套、迟到结果保留原归属；子 agent 结果待主 agent 综合，不能直接升级为结论 |
| humanGate | 可追溯人类决定及明确依赖 | 只限制明确依赖的 Goal/任务；旧未知依赖保守提示，不自动解决、不根据浏览焦点猜无关 |
| pendingCheckpoint/localConclusion/Note I/O | 本地待保存事务与 AITP 提交事实分开 | 保留草稿/回执和捕获作用域；与普通执行解耦；未知回执先核实，不制造第二条事实 |
| committed cursor/history | AITP 外部事实投影 | conversation undo 不撤销真实保存；缓存不是 ledger，不能拿新焦点改旧保存归属 |
| alerts/maintenance receipt | 结构诊断及有新鲜度边界的只读视图 | 展示相关问题，不当科学失败；UI revision 不等于 ledger 变化；真实保存及不确定新鲜度仍核验 |

源码锚点：agentResearchService 的 guardToolExecution、assertLineSwitchSafe、
currentResearchPlanV2Binding、guardGoalCompletion/decideGoalContinuation；
aitpResearchOps 的 ResearchWorkingState；researchLoopCoordinator 的
onTurnEnded/refreshTurnEndMaintenance。当前仍有单一 foreground Action/Run/gate、
Plan 必须绑定 Goal、任意 gate 全局 hold、revision 变化 force refresh。
迁移时必须逐一消除这些与目标冲突的依赖，不能只更换提示文字。

### 有限验收清单（每项保留首败与修复证据）

1. 普通状态查询不创建 Action/Note，不重复完整记忆恢复；正常权限拒绝仍生效。
2. 无 Goal 可讨论/修订科学路线；长期计划不依赖独立 Plan 激活。
3. 决定明确属于 A 时 B 可继续；A 仍等待；旧未知决定不被自动解决。
4. A 工作时浏览 B，迟到输出、嵌套子任务、冷恢复均保持 A 归属。
5. 本地 UI 变化不触发全量 check；实际保存/证据变化/并发或未知新鲜度会刷新。
6. 无变化不重复提示；重要决定/待保存变化、compaction/undo 恢复不丢信息。
7. Note 原子作用域保存：成功、错误作用域、双线并发、重试、写入失败、未知回执。
8. 新认识只做必要记录；新会话找回条件、反例、解释收缩及原证据，查询零写。
9. GW 与理论课题各做真实只读恢复；临时 fixture 做一次双线/嵌套及隔离写入。
10. 同一最终构建的跨端显示、运行及安装验证；日常环境交付与隔离验收分别记录。

AITP Note 契约设计见伴随仓库 docs/hakimi-note-atomic-save-spec.md。
该设计先于代码；契约、adapter、异常恢复、跨端以及统一安装全通过前，G5/G7
均不算完成。当前执行顺序先补共享写入原语，再解耦其调用方与旧科研控制面。

2026-09-09计划；2026-09-10状态更新：L1–L6部分实现及相关回归已验证，已在独立
临时home安装并启动测试实例，未替换用户日常安装。L7已有只读cRPA恢复、临时
记忆新会话召回、双线嵌套委派与实际Web Board浏览证据，完整验收仍未完成。
逐次失败、修复及限制见 `lean-harness-live-acceptance.zh-CN.md`；下方基线保持
最初观测，不代表当前实现。此计划不是已实现能力清单。
本文件服务于当前有限开发 Goal，不替代 `GOAL.md`、AITP 规范或源码。
细节可依据真实证据调整；不得删去未完成验收项后宣称完成。

## 目标与边界

把 Research Mode 从科研阶段控制面调整为记忆驱动的协作层：问题、思考、
判别性检验、评价、关键记录仍构成 Research Loop，但不要求每个工具调用
取得 action/phase 许可证。AITP 保存认识与证据，Hakimi 负责执行和协作。
Goal 仍是唯一 continuation、budget、生命周期 owner。

最终体验：普通查询直接完成；研究中按需读记忆、重要变化才写；长期目标
持续推进；多方向执行不串线；Board 显示课题关系、最新认识和实际任务。
上下文审核必须覆盖模型最终收到的请求，不能只按 Markdown 长度验收。

不做：完成实际科学课题、恢复原科研 Goal、新远程作业、无限并行、新 scheduler、
AITP schema/registry/vector 服务、自动科学认证或人类决定、批量清空 warnings。
没有 commit/push/merge/rebase/reset/clean/restore/stash 授权。

## 基线与已知事实

- 实际开发 checkout：`hakimi/.tmp/pr-9-auto-subagent-preset-merge`。
- Hakimi HEAD：`cdf5f1638430751d19f8e3bcde71d508a74e8739`；CLI package 0.21.0，
  SDK 0.18.0，core-v2 0.4.0。两仓已有大量 dirty，须在编辑前保存私有基线并逐块比较。
- AITP HEAD：`eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`；0.9.0 / contract-0.2。
  最新 Skill 加载与手动 hash 精简尚未安装；其 194 项 ledger 测试通过不等于本 Goal 验收。
- `agentResearchService.ts` 的 actionScopeBlocker 仍约束工具执行的 phase、action、
  lease、Line/Question/Plan revision 与 capabilities；存在专门的 AITP inspection 例外。
- 同文件的 assertLineSwitchSafe 与 decideGoalContinuation 仍把部分待记录、
  当前任务及 human gate 状态作为全局条件。不能用注释或旧 prompt 代替这些代码事实。
- `researchLoopCoordinator.ts` 在 admitted turn 边界维护状态；Research 状态变化后
  force refresh，不代表每次都发生了 AITP 数据变化。
- `researchInjectionPresenter.ts` 已有语义 fingerprint 去重，但新 turn 返回 brief。
  `goalInjection.ts` 也在新 turn 输出目标提醒；是否语义重复必须检查最终请求。
- `contextInjectorService.ts` 是既有注入通道，支持 compaction rearm。
  不新增第三条 reminder 通道，不把全部历史消息重传当作新增重复注入。
- 子 agent / MCP / 工作区隔离能力仅列为待审计的复用点，尚未证明全部满足本计划。

## 职责与放置

```text
AITP public CLI/files
  └─ canonical 认识、依据、历史、Note、Method card、人类决定
Hakimi workspace/session 既有设施
  ├─ 工具权限、MCP、工作目录、任务与子 agent 生命周期
  ├─ adapter 读取与保存（不复制 AITP parser/ledger）
  └─ task/run 的稳定归属；UI 浏览焦点不改变其身份
Hakimi main agent
  ├─ Goal：续行、预算、暂停与停止
  ├─ Research Plan：可修订路线、依赖、优先级
  ├─ 当前尝试：科研问题与边界，不是工具许可证
  └─ 已有 contextInjector / systemReminder：相关上下文与事件提示
客户端 Board
  └─ AITP 科研摘要 + Hakimi 任务树 + 需要人类决定/保存状态
```

尽量复用现有接口；不为图形对称新建 Service。新增接口前依照 agent-core-dev
画实际依赖树并说明数据 owner。科研相关性判断在模型/Skill，不放进 TS 分类器。

## 分步实施与完成条件

| 步骤 | 修改范围与交付 | 必须通过的验收 |
|---|---|---|
| L0 事实/基线 | 规则、dirty、安装、接口、真实请求来源与场景清单 | 每个拟删检查明确其实际保护；私有基线可区分已有改动 |
| L1 上下文 | system/Goal/Plan/Todo/Research/AITP/Skill/回执/压缩/子任务输入 | 无变化不追加重复科研摘要；变化可见；undo/compaction/cold restore 不丢重要信息 |
| L2 执行解耦 | researchExecutionPolicy、guardToolExecution、action tools 与相关提示 | 普通工作无 Begin/Conclude 仪式；真实权限、危险操作、作用域和取消保护不弱化 |
| L3 归属解耦 | 当前浏览焦点、稳定任务身份、旧记录恢复和相关协议投影 | A 工作时可看 B，A 的输出仍属 A；迟到结果、恢复、跨会话不串线 |
| L4 记忆闭环 | adapter/coordinator、localConclusion/checkpoint、Note/蒸馏提示、Goal hold | 无 delta 零写；真正保存后校验；失败内容保留；安全独立工作可继续 |
| L5 研究协作 | 既有 Goal/Plan、task/subagent、必要 preset/Skill | 主 agent 三方向并行和一个有界嵌套委派；权限/预算不扩大、文件隔离、结果综合 |
| L6 展示/一致性 | 简洁 Board、REST/WS/SDK/klient/TUI/Web | 同源含义一致；目标/科研认识/运行状态/保存状态不混用；详情不塞进主视图或 prompt |
| L7 真实验收 | 短测、重装/测试启动、before-after 报告 | 全部固定场景完成，原始答案与负例保留；新会话恢复正确，无未完成项冒充完成 |

顺序是 L0 → L1/L2 → L3 → L4 → L5/L6 → L7。可以提前写 fixture，但不能并行
运行大型测试或先搭建完整并行科研平台。每步更新本文件的结果，不覆盖旧失败。

### L1：上下文逐来源审查

| 来源 | 核查与目标 |
|---|---|
| system、workspace instructions、profile | 同一规则唯一 owner；不可把用户内容提升成 system 权威 |
| Goal 与 Research Goal 投影 | 通用 Goal owner 保留预算/停止；Research 不再整段重复目标 |
| Research Plan / plan-mode / Todo | 长期路线、讨论模式与执行清单分开；不重复注入整份计划 |
| Research snapshot / AITP enter / Note | 定位重复字段；已有摘要与新工具结果不再被大段复述为提醒 |
| Skills | 已加载且仍在上下文中不重复；仅按需加载；压缩后按需要重取 |
| 工具结果/回执/告警 | 同事件不多渠道重复提醒；可读完整原报告，默认只注入相关变化 |
| compaction / undo / cold restore | 去重状态跟随实际可见上下文，不用进程内“读过”永久跳过 |
| 子 agent / 孙 agent | 任务、约定、相关证据、权限必需；不复制整份主会话、全部 Skill 或无关线 |
| Board | 人类视图不是模型输入模板；私有诊断不进入遥测 |

指标分别记录：请求字节/字符（有 tokenizer 才称精确 token）、来源、新增重复块、
正常历史携带、必要恢复重注入、工具/模型往返、审批等待、端到端时间。
不把 API cached input 算成已删除；不按字符串相同合并不同来源、版本或权威的事实。
不以总 token 下降覆盖科学答案退步。基线与优化后使用相同有限场景和正确性题目。

### L2–L4：状态简化的具体规则

- 保留 action 的问题/目的/证据/限制作为当前尝试；旧 action 可读、可解释，
  不批量 completed/abandoned。旧 API 不轻率删除，破坏性 SDK 变更先请求批准。
- 未知 MCP、Bash 仍遵守原工具信任/审批/访问规则；删除 Research 特有许可证
  不等于放开执行权限。不能把“只读”标签当 OS 安全证明。
- 浏览/选择另一条线不转移任务归属；写入使用任务捕获的明确 Topic/workstream，
  不能使用界面当前 Line。跨线语义变化需要真实确认，不能按 slug 自动绑定。
- Goal active 不代表会话此刻正在计算；paused 不取消用户明确请求；等待不等于 blocked。
  用户决定只阻断依赖它的任务，不能由模型自动 resolve。
- Pending 科研记录保留且标清未保存。保存可能已成功但回执不明时先核实，不重试制造
  第二条事实；无关读工作可继续，但不得报告依赖它的交接/验收已完成。
- AITP 改变才刷新受影响视图；本地 UI revision 改变不是必然整库 check 的理由。
  遵守 AITP Skill 的 freshness 和保存校验；不发明不受支持的增量 check。
- 普通读取不加逐文件 hash；写 pin 复用同目标已验证且未变化的 digest。
  新知识卡只在触发成立后审查，human approval/publication 不变。

### L5：有限多方向协作

HS 案例仅作已有证据的只读研究试验：OTOC、K 复杂度、代数/对称算符是待分配
方向，不预填结论或假定每个方向已存在独立 workstream。先确认已有记录与共用约定。
父任务给问题、交付物、相关依据和边界；一个子任务可进一步委派独立小检查。
主负责人综合结果和冲突；真实 workspace 不因测试写入虚构科研结果。
并行写代码用隔离 fixture/worktree 证明文件所有权；纯读无需创建分支。
不默认复制父权限；验证继承/限制规则，无相关工具的子任务必须明确不可用。

### L3/L5 下一实施切片：任务归属先于任务树

2026-09-09 定向代码审查：`subagentMetadata.ts` 的通用 labels 保存 parentAgentId
和可选 swarmItem；`AgentTaskInfoBase` 没有 Research Line 字段；普通 `Agent`
创建调用只传 parent label。`ConversationPane` 已收到 tasks，但 ResearchBoardPanel
目前只接 snapshot。因此，现有父子关系不能当成已有科研方向绑定的证据。

这一切片仍为 planned，不因为界面可浏览多条线就标记完成：

1. 在现有委派路径内捕获明确的研究归属，不增加独立 Begin/Conclude 仪式。
   三个子任务可显式选择三条已存在的 Line；没有明确选择时，只能继承已捕获的
   父任务归属，不能读取用户临时浏览的 Line，更不能按标题猜。
2. 归属包含足以区分 workspace/session/agent/task 的身份及 Line，Question 可选。
   已确认的 Topic/workstream 关联作为来源快照，不是永久写许可；合并记录时仍由
   主负责人通过当前 AITP contract 核验。尚未绑定 workstream 不阻止独立只读研究。
3. 归属在工作开始前可恢复地保存。不能用执行完成后的 UI 焦点补写，也不能靠
   进程内 Map 留存。复用既有 metadata/wire/store；具体字段与承载点在编程前
   对照恢复和公开协议测试确定，不在此文档宣称接口已存在。
4. 同一子 agent 被用于另一独立方向时，新建任务身份或显式的新分配记录；不得
   覆盖旧任务归属。嵌套委派默认沿用父任务的明确归属；越方向需显式指定。
5. Board 从任务事实投影父子树，执行状态来自任务系统，科研认识来自 AITP。
   没有归属的历史任务显示“未归属”；迟到结果显示原方向；浏览 B 不重标 A。
6. 子任务结果只是待综合输入。主负责人核实冲突、依据、限制后再记科研结论；
   不把完成通知自动变成 Entry，不扩大子 agent 的工具权限或 AITP 写权限。

依赖边界（现有接口；不预造新 Service）：

```text
Research feature / 主负责人
  ├─ 使用任务与 agent 元数据，解释科研归属
  ├─ IAgentTaskService @Agent：任务输出与生命周期（不理解物理课题）
  ├─ IAgentLifecycleService @Session：创建和查找 agent（保持 flat registry）
  └─ adapter：主负责人合并后的公开 AITP 读写
Web / 其他客户端
  └─ 读取归属投影与任务状态；浏览焦点仅用于展示
```

最小验收顺序：两个 fixture 方向交错完成与迟到结果 → cold restore/undo 不串线
→ 三方向加一个嵌套只读任务 → 主负责人综合 → 隔离 AITP 保存及新会话找回。
负例必须包含无归属、未知 Line、重用 agent 跨方向、绑定变更、写入失败与权限拒绝。
这些测试未通过前，不接入真实科研写入，不声称 L3/L5 完成。

### L6：默认 Board

```text
AITP 大目标与当前认识（注明来源与新鲜度）
主 agent 的当前重点
├─ 方向 A：问题 / 负责人 / 执行或等待
├─ 方向 B：问题 / 负责人 / 执行或等待
└─ 方向 C：问题 / 负责人 / 执行或等待
最近重要变化 · 关键未知 · 需要研究者决定
记录：已保存 / 待保存 / 保存失败
展开：证据、历史版本、作业、诊断
```

无权威科研摘要时显示缺失或过期，不能从任务完成数推断物理进度。
Board 展开/收起、跨会话导航与后台任务身份独立。运行/等待来自执行设施；
科学认识来自带来源的综合；保存来自回执。禁止一个 blocked 覆盖全部语义。

## 固定验收场景

1. GW 已有结果查询：不创建科研 action、不制造记录、不重复 unchanged hash。
2. GW 历史认识恢复：当前/旧结论、改变原因、局限正确；不混材料/实体/研究线。
3. 隔离 AITP 正向写入：新证据 → Entry/Note → 新会话找回变化原因；无伪造真课题数据。
4. 保存失败/不明回执：草稿保留、幂等不重复；无关查询可做，依赖交接不假通过。
5. A/B 两线任务交错与迟到结果：切视图后输出/写入归属不变。
6. Goal active/paused/waiting 与用户追问：不空转、不擅自恢复、不吞新指令。
7. 无变化连续 turn 与 compaction/undo/cold restore：少重复，必要上下文重新提供。
8. HS 主任务三方向及有界嵌套：相关约定完整、无无关上下文灌入、综合保留冲突。
9. 执行负例：未授权副作用、未知工具/权限不匹配、越权子任务、重复提交仍被正确处理。
10. UI/transport：相同任务、保存、科研摘要在相关客户端一致；旧导出可恢复。

实际科研文件只读；现有作业检查优先保存的终态证据，需实时远程访问先核实本轮授权。
真实会话使用当前核实后的 preset/model，不硬编码旧 relay 配置；不注入参考答案。
每场景一轮基线、一轮改后，失败只补必要复测；环境/provider 失败单列，不反复空跑。

## 测试命令与执行纪律

以下在实际 checkout 执行，后续新增命中文件后补精确列表：

```sh
pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run test/agent/contextInjector/contextInjector.test.ts test/agent/goal/injection/goalInjection.test.ts test/features/aitpResearch/researchInjectionPresenter.test.ts --maxWorkers=1
pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run test/features/aitpResearch/aitpResearchService.test.ts test/agent/toolExecutor/toolExecutor.test.ts --maxWorkers=1
pnpm --filter @moonshot-ai/agent-core-v2 typecheck
pnpm --filter @moonshot-ai/agent-core-v2 lint:imports
git diff --check
```

公开字段改变时逐包执行 protocol、kap-server、node-sdk、klient、CLI/Web 对应
typecheck 与文件级测试，不先跑 CLI 会隐式全包 build 的通用 test script。
Web 源改变时按仓库规则 `pnpm run build:web-assets` 后 `pnpm run build:web-assets -- --check`。
AITP Skill/contract 变化用该仓库 `.venv/bin/python -m pytest -q` 和 Skill validator。
大型测试串行；遵守各目录 AGENTS 和 agent-core-dev 的阶段指引。

## 安装、退出条件与交付

验收用受控测试启动或本地安装，先确认版本和活跃会话，不中断用户会话或覆盖其配置。
不得把源码修改说成已安装，也不得把旧进程说成已经加载新代码。
新 AITP schema、无法安全区分 dirty、缺少归属/授权、未批准 SDK major 等情况停受影响
工作并报告。可独立的安全任务继续；遵守 Goal blocked 的真实阈值。

交付：源码与兼容文档、上下文来源/去重清单、固定场景 before-after 证据、测试与
安装结果、剩余边界。所有 L1–L7 必需验收达成后才完成 Goal；没有无限监控阶段。

## 执行记录

### 历史 Goal 对账（2026-09-10，后被页首新授权及当前对账取代）

下表按当前完整目标核对，不将目标缩成已经通过的测试。安装与失败详情见
`lean-harness-live-acceptance.zh-CN.md`；源码 HEAD 为 cdf5f163（大量未提交改动），
AITP HEAD 为 eae1bce5（同样 dirty），不能只按 HEAD 推断功能。

| 要求 | 当前证据 | 仍缺什么 |
|---|---|---|
| 1 普通执行与科研状态解耦 | 服务回归及安装后的查询/委派/独立读取已有证据；phase-only 切线失败已源码修复并在原隔离会话回放成功 | 最终统一版本的权限负例与跨端总验收仍须收束，不用文字回答替代执行证明 |
| 2 Goal 唯一生命周期 owner | checkpoint/action/alignment 不再全局持有 Goal；degraded 旧警告已在安装旧会话更新 | guardGoalCompletion/decideGoalContinuation 仍忽略 goalId，对任意未解决 humanGate deny/hold；显式依赖及旧未知归属处理待授权 |
| 3 按需科研记忆 | direct Entry 原生写入、新会话召回、validator 拒绝后独立读取和同身份修复保存均有安装证据 | Note 无原子 scope save；未知回执/磁盘失败/跨会话并发不能由 validator 拒绝样本代替；这些验收仍不完整 |
| 4 上下文精简与规划 | Goal 正文不重复、无变化 turn 去重、决定提醒与 pending 提醒已分层测试；安装回问 reminder 数保持不变 | Research Plan v2 仍要求 current Goal/Program/alignment，不能宣称无Goal规划已实现；完整上下文来源对账尚需最终复核 |
| 5 Board/UI | 隔离 Web 展开/收起、双线筛选、嵌套关系及未知状态已有实测；保留研究会话入口 | 科学摘要必须来自记录，现有任务树通过不等于各客户端实时科学摘要总验收；最终同版本跨端验证未完成 |
| 6 多线/嵌套协作 | 安装中的不同Line并行、嵌套继承、回执归属和两个代码目录写入有界fixture通过 | 软目录归属不等于OS隔离或worktree合并；跨会话同时写入与迟到结果的完整隔离证据仍不足 |
| 7 分场景真实验收 | GW恢复及HS方向读取、临时写入/召回、旧会话恢复、多线嵌套均保留首败与复测 | 不声称真实NiO计算或完整理论研究完成；按本节固定10场景补缺而非重跑全部已通过样本 |
| 8 安装交付 | 最新隔离包 /tmp/hakimi-line-package-E81pLw/runtime，原会话回放通过，日常daemon未动 | 最终完整回归/changesets/交付仍未完成；当前只安装隔离实例，不声称日常环境已升级 |

当时尚待明确批准的实现边界（现在已由页首授权取代）：

1. Research Plan 可不绑定 Goal 的跨端表示，不伪造占位Goal/Program关系。
2. AITP Note 保存的原子 Topic/exact-workstream 扩展及对应contract/CLI/tests同步。
3. human gate 显式Goal依赖；只限制真正依赖该决定的工作，旧归属未知gate保守保留，
   不自动resolve、不凭浏览Line推断无关。这不是已经获得批准的schema。

这三项不因自动Goal续轮而视为授权。可独立的只读审查和已批准回归仍可进行，
但不得用继续微调文案回避最终必须解决的协议与语义缺口。旧NiO完整科学目标仍后续规划。

- 2026-09-09，L6 Board 协作树接线：Web 会话 store 保存各自的 relationship
  snapshot，结合当前会话 live tasks，经 App/ConversationPane/Panel 传入 Board。
  默认折叠，按浏览 Line 精确筛选，不修改任务归属。缺失状态显示 unknown，
  父级循环/缺失或冲突显示不确定；冲突 scope 的任务输出不归入当前节点。
  浅色/深色真实 Board 组件浏览器检查通过（展开、收起、hover/focus、切线无
  API 调用、原 snapshot 不变）。这不是完整 App 冷恢复端到端验收，也不是
  跨 Line 写入隔离证明。roster 定向 11 项通过；用户安装尚未更新。

- 2026-09-09，L6 冷关系快照：现有 session snapshot 添加可选 agent_relationships，
  仅投影持久化 agent ID、parent ID、task scope，不复制完整 metadata、不赋予
  历史代理 running/completed 状态。真实 server restart 测试恢复两层和未知父级
  legacy 节点，snapshot 7 项通过；Web API 保留该可选字段。REST/live 父级冲突
  不合并；快照与旧行 scope/parent/session 冲突时不继承旧输出。UI store 和树形
  展示尚未接入，不能用快照字段存在宣称 Board 完成。

- 2026-09-09，L6 父级身份传递：SubagentHandle/TaskInfo 保存 caller parentAgentId，
  REST task optional parent_agent_id、WS task info 及 roster snapshot 保留，Web
  mapper/projector/reducer/merge/TaskItem 接收该身份和 agentId。旧记录无父级
  不猜测，AITP schema 不变。core task replay 7 项、server 23 项、protocol
  27 项、Web 236 项通过。完整冷代理列表、树形 UI 和跨 Line 嵌套负例仍未完成。
  core/server/protocol/Web typecheck 通过；Web 资产已重新生成（521 文件）。
  父级相互冲突的 REST/WS 合并负例仍需补充，不能仅以字段传递测试代替隔离证明。

- 2026-09-09，L5 真实 R6 嵌套通过：复用已有 agent profile 做协调层，委派
  explore 一次，main→agent-3→agent-4 实际发生；第二层省略 scope，持久化
  自动继承 hs-algebra。只读 TOPIC 一次，无新 Action/Goal/科学写入。并未改变
  coder 的叶子权限。嵌套跨线负例、完整请求来源审计、任务树 UI 尚未完成。
  L6 下一切片须先补任务父级身份和冷刷新投影，再把 tasks 接入 Board；当前
  主代理 REST task 列表不是完整子代理树，不能仅按标题拼装假树。

- 2026-09-09，L2/L3 既有任务恢复：非空 Agent.resume 不再受新 Action 守卫
  限制，身份及不可改派由 Agent 工具单一负责，独立权限仍可拒绝。恢复示例补齐
  必填 description。真实重载首先暴露 live registry 缺代理：新增先核实持久化
  parent 身份、再复用 lifecycle.create(agentId) 的 wire.restore 路径，保留
  labels 与 forkedFrom，不把陌生 ID 新建成任务。Research service 694 项、Agent
  恢复/归属相关 30 项通过；真实 R5 冷恢复复测通过，保留原 coder 和
  hs-algebra 归属，短答仅一个模型 step，无科研写入。typecheck/lint 通过。
  嵌套任务、跨 Line 子任务校验和完整 Board 仍待验收。

- 2026-09-09，L1/L5 真实 HS 三方向试验完成但嵌套失败：三条显式 Line 的
  foreground Agent 同 batch 启动成功，无 Action、Goal、审批或 AITP 写入。
  coder 工具集不包含 Agent，嵌套未发生；main 的省略 task_scope resume 仍被旧
  action guard 拒绝。下一步须按保存的任务身份处理 resume，并验证真正具备
  委派能力的 profile，不得通过冒充已完成或扩大叶子 agent 权限补齐验收。
  同次发现 coder/explore 默认 200 字符摘要下限造成两次自动扩写，已删除内置
  profile 的默认长度重试及相应提示；自定义 policy 机制保留。两文件 9 项测试
  通过，真实新加载复测未做。详细失败证据见 live acceptance 的 R4。

- 2026-09-09，L2/L5 无 Action 委派：主 agent 在 Research Mode 中使用
  `Agent(task_scope="research-line:<已有 slug>")` 时，Research guard 核实 Line
  存在后 abstain，由正常工具权限决定能否执行；不创建 Action、切焦点或自动确认
  workstream。不存在/原型属性名的 Line 拒绝，独立 permission veto 仍可阻止委派。
  Research brief 增加委派语义说明，任务结果仍须主负责人综合。Research service
  与 injection presenter 完整两文件 730 项通过，typecheck/lint:imports 通过。
  这是主 agent 的显式归属路径；未声明科研归属的旧调用仍走旧规则。嵌套跨方向
  校验、Board 分组及真实三方向试验仍待完成，不宣称完整 L2/L5 已验收。

- 2026-09-09，L3/L6 对外归属传递：REST Task 使用可选 task_scope，任务 WS
  payload 使用 taskScope，前台 roster snapshot 接收注册任务的归属；Web mapper、
  reducer、任务视图数据和 REST/live 合并保留字段。未知旧字段仍为空，不猜当前线。
  显式归属冲突的 REST/live 两条记录不静默折叠，跨会话 roster 不串身份。
  server tasks/roster 23 项、protocol events/task 27 项、Web projector/mapper/merge
  236 项通过；三个包 typecheck 通过。没有修改可视组件或 AITP contract/schema。
  Board 分组显示、Research Line 合法性及 SDK/klient/TUI 边界审查仍未完成，
  不把 transport 测试当成完整多方向真实验收。

- 2026-09-09，L3/L5 任务回执延伸：`SubagentHandle` / `SubagentTaskInfo` 携带
  捕获的 taskScope，前台成功/失败及后台启动回执显示 task_scope（无标签旧任务
  不增此行）。任务记录使用既有 TaskModel/任务文档保存，不引用当前浏览线。
  定向工具测试 7 项及冷读交错完成测试通过，完整 task persistence/timeout 两文件
  28 项通过（含 wire resume 对照），typecheck 通过。首测发现误把字段放在 spawn
  event 而未放入返回 handle，4 项回执断言失败；已修正并复测。尚不能据此声称
  Web/API 可见：`kap-server/routes/tasks.ts` 当前白名单投影会丢弃此字段，
  后续必须同步 Task schema、mapper 和客户端投影。Research Line 校验、真实三方向
  委派及完整请求快照差异仍未完成。

- 2026-09-09，L3/L5 归属基础：普通 Agent 工具增加可选 `task_scope`，创建时
  写入既有 agent metadata labels；省略时继承调用者已保存标签，恢复时保持原标签，
  显式改派（包括给历史无标签 agent 补派）返回错误且不启动子任务。标签不授予权限，
  不自动绑定 AITP。按 agent-core-dev 的依赖边界复用现有 metadata，不让通用
  lifecycle 引用 Research，也不新增 Service。8 项定向创建/恢复/元数据保存测试
  通过，typecheck 与 lint:imports 通过。完整 tool 文件初测 98 passed / 1 failed：
  请求快照出现新增工具字段及其他提示差异，尚未批量更新。Research Line 校验、
  任务/API/Board 投影、cold restore 和三方向真实委派仍未完成；源码未安装。

- 2026-09-09：创建计划与 active Goal；核实部分 policy、loop、contextInjector、
  Goal injection 代码及版本/dirty；完整上下文基线与实现尚未完成。
- 2026-09-09，L1 首个小改动：两仓 tracked diff 与 untracked 文件已保存私有基线。
  移除 Research presenter 仅因新 turn 就重复输出 brief 的分支；保留上下文中
  disclosure 缺失及语义变化时重新输出。新增/调整测试先出现 2 个预期失败，
  修改后 presenter 与 contextInjector 两文件合计 56 项通过（单 worker）。
  这尚不是实际模型请求级验收：旧会话的 llm.request 事件只保存请求元数据，
  不能据此计算重复 prompt 或声称速度提升。下一步用真实注入链与请求捕获测试
  核实跨 turn、compaction、undo/cold restore；L2–L7 尚未完成，未重装。
- 2026-09-09，L1 请求链补证：在现有 presenter 测试中通过 DI 挂接真实
  AitpResearchInjection 与完整测试 agent 的 injector / prompt / loop / requester；
  捕获 provider generate 边界的实际请求内容，而非只看渲染字符串。
  连续无变化 user turn 的请求中 Research 摘要仍为一份；planning policy 变化后
  增加一次更新；持久化 wire 恢复保留一份；compaction、undo、clear 后必要摘要
  重新提供。两文件 57 项通过；Goal injection 既有 22 项单独通过。
  mode / research snapshot / admission 是受控测试替身，因此本证据不证明完整
  Research admission 或科学状态恢复，也不证明其他 prompt 来源已经去重。
  最初把测试工具的前后对照快照误当单次请求计数，已改为直接检查 llmCalls
  当前调用；该测试最终不以摘要长度或请求元数据替代实际模型输入。
- 2026-09-09，L1 Goal/Research 去重：Goal 首次/身份/目标/完成条件/生命周期/
  预算上限改变时输出完整提醒，后续 turn 仅在用量变化时给简短用量和预算提示。
  Research 不再重复 Goal objective/completion criterion，保留归属与 continuation。
  完整 agent 请求测试确认两个 provider 同时存在时目标/验收文本各一份；
  compaction 后恢复完整 Goal；暂停提示及预算临界提醒仍在。相关三文件 745 项通过。
  本项未安装；其他上下文来源、L2–L7 及真实场景验收仍未完成。
- 2026-09-09，L2 首步：Read/ReadMediaFile/Glob/Grep/WebSearch/FetchURL、
  TaskList/TaskOutput/TowerStatus/CronList 不再依赖 Research Action、phase、
  Research lease 或 AITP ready。Research guard 仅 abstain，不强制 allow；
  原有执行权限仍处理实际调用。pending checkpoint / paused loop / degraded
  不阻挡独立观察，亦不因观察而修改科研状态或接受证据。真实 executor callback
  测试包含独立 veto 仍阻止 Read，及未知 MCP、Bash、写入仍不获新授权。
  对旧测试中“所有读取必须有 action”的断言逐项更新；科学结论、写入、新任务
  的 freshness 与授权反例保留。Bash 远程只读查询路径尚未简化，L2 未完成；
  无新远程操作，无安装。
- 2026-09-09，L2 shell 查询首步：增加有限的 literal observation 形式，支持
  单条 squeue/sacct（显式 job ID）、scontrol show job、cat/head/tail 日志读取，
  以及显式 SSH host + 单引号远端命令。拒绝串联、重定向、替换、后台执行、
  任意 SSH 参数及提交作业；不新增 runner 或一般 shell parser。
  这是 Research guard 的 abstain 条件，不是权限 allow，也不是 OS sandbox；
  PATH、alias、SSH config 等仍属正常执行环境与权限边界。
  production executor 测试确认 degraded/no-action 查询可运行、提交/混合命令不
  获豁免、独立 shell veto 有效，科研状态零变化。相关 771 项测试、typecheck、
  lint:imports 通过。未访问实际远端或重装；任意查询脚本不在快捷形式中。
- 2026-09-09，L3 首步：代码确认 research.switch_line reducer 清空前台
  action/run/progress，不能把移除 service guard 当成安全的“浏览切换”。
  GetResearchStatus 新增可选 line_slug，只读投影返回查看线与执行线、该线
  questions、显式归属的 action/run/checkpoint/alerts；未归属及会话级项目不冒充
  当前线内容。recorded binding 不是刷新后的写入授权。未知 Line 返回错误零修改。
  live run + pending checkpoint 下跨线浏览测试通过，原执行 focus 与状态不变；
  detail=full 不扩大 scoped view。无参原 snapshot/summary 行为保留。
  模型工具 schema 是 additive，未改 AITP 或公开 Research snapshot schema。
  Board/REST/WS/SDK/klient/TUI 浏览入口与多任务归属恢复仍未完成，未改 Web 资产。
- 2026-09-09，L4 无变化维护首步：Research turn 的 revision 比较基线移到
  自动 idle → orienting 之后；单纯进入阶段不再被误认为新增科研记录而触发
  turn-end AITP refresh。真实科研状态变化仍走原维护路径，没有放宽 save 校验
  或改变 coordinator 缓存。新增普通查询零刷新回归，并更新失败 turn 的对应
  断言；service 文件 691 项通过。完整蒸馏按需加载和写入缓存失效仍待验收。
- 2026-09-09，L4 蒸馏交接按需加载：正常无同名遮蔽时，post-commit 只发送
  外部 Skill description + touched-entry 提示；相关或不确定才由模型调用完整
  Skill，不在无候选时先灌入全文。隐藏/model-disabled/non-inline 不绕过；
  同名工作区 Skill 遮蔽时保留原精确插件加载路径。review_requested 仍是提醒
  请求，不是完成蒸馏，不伪造 Skill activation。新增无全文/无激活回归，保留
  shadow、隐藏和禁用负例；service 692 项通过，实际耗时与模型行为待 L7 测量。
- 2026-09-09，L1 Plan 请求去重：PlanModeInjection 原先遇 user message 重发
  full、每 2/5 个 assistant message 重发 sparse/full。改为按已披露的 active/path
  比较，不因聊天或工具步骤数重复规则；进入、退出、路径改变、disclosure 丢失
  仍更新。完整测试 agent 捕获实际模型请求，连续对话 full 仅一份，compaction
  后重建一份；clear/路径改变和恢复一致性测试通过。11 项 injection 测试与
  28 项 Plan guard 测试通过；测试支持层仍报告缺失依赖警告，不计为完整生产
  接线验收。未改审批语义；保留已有组合构造签名，未扩大此项到 DI 重构。
  Todo 当前是每 10 个 assistant message 的 stale reminder，不是每轮注入；
  尚需核实请求体、Research/Todo 交叉重复及子 agent 继承，L1 仍未完成。
- 2026-09-09，L1/L5 Todo 提醒归属：session-shared Todo 来自主 agent wire，
  但旧自动 stale reminder 注册到每个 child。改为只给 main coordinator 自动
  提醒；子任务的工具权限不变，不宣称新增 per-agent Todo 隔离。无未完成事项
  不提醒，历史中最新同内容提醒仍在时不重发；清单变更或上下文丢失后保留
  原 10-message stale 判断。精确比较正常 system-reminder 包装，避免子串
  匹配将删除清单尾部误当无变化。18 项测试通过，变更的绑定测试经 DI 解析
  service 并覆盖 main 与四个 child ID；不替代真实子 agent 嵌套或请求体验收。
- 2026-09-09，L1 请求/继承补证：Todo pure provider 挂接完整测试 agent 的真实
  injector/requester，超过提醒间隔仍在实际模型请求中仅出现一份唯一清单；
  compaction 后重新达到 stale 条件时恢复。该文件 8 项通过；此测试不声称
  验证 session lifecycle 注册（该部分由前述 DI 测试覆盖）。
  定向追踪：普通 Agent 委派使用 lifecycle.create + profile prompt prefix，
  继承模型绑定/permission mode/user tools，不调用 fork 复制父历史；显式
  lifecycle.fork 则一次性复制 sourceMessages。这两类不可混称“每轮重复输入”。
  taskService 的完成通知已有 task/status notification key 去重及 output 引用，
  SwarmInjection 已按 active/inactive disclosure 去重，不为统一形式重写它们。
  多层子 agent 实际请求与跨 Line 迟到结果验收仍待完成。
- 2026-09-09，L3/L6 Web 数据投影修复：currentAction/currentRun 已按 Line 过滤，
  但 cycle/next 的 fallback 直接读取全局 latestProgress，可能借用另一线结果。
  增加 currentProgress 归属检查；存在 foreign action 时不展示其进展，无 action
  的多线快照也不猜归属。仅数据投影，不清除底层进展、不改 ledger 或任务身份。
  现有 foreign-action 测试没有保留 latestProgress；新增保留外线 headline/next
  的负例与零修改断言。该文件 10 项通过。Web 布局尚未改；设计系统大文件读取
  有截断，组件修改前仍须补齐；浏览器验证与 canonical assets 生成/校验待完成。
- 2026-09-09，L3/L6 Web 浏览入口：补读设计系统后增加本地 Select，查看另一条
  Line 的 questions 和已记录 binding，同时明示实际执行线。只读浏览不发切线
  命令，不改 snapshot、任务或 checkpoint；返回执行概览保留原有保存/决策信息。
  selector 纯函数测试覆盖跨线、未知线和零修改，相关文件 11 项通过，Web
  typecheck 通过。check:style 仍为已有 28 项 baseline finding，本次无新增样式。
  尚未做组件交互及 light/dark/focus 浏览器验收；未生成发布资产、未重装，不计
  L3/L6 完成。多个方向的执行任务树与迟到结果归属仍需独立验收。
- 2026-09-09，Web 浏览器补证：隔离 Vite + Chromium 加载真实 Board 组件，
  light/dark 下浏览 CRPA、返回 GW、hover/focus、外部强制展开均通过；未发
  API 请求，原 snapshot 字节不变。发现 forceExpanded 未清理只读浏览选择，
  修复为返回执行详情后展开。已查看两主题截图。脚本与截图保留于
  `/tmp/hakimi-lean-board-ujjxt5/`，不依赖真实科研会话。
  初次测试因预览 cwd 导致图标解析失败，第二次因测试入口引入第二份 Vue
  runtime 失败；改为 Web cwd 和统一 vue import 后通过，未改生产依赖。
  本次 canonical Web 资产生成 521 文件，重建 `--check` 一致性通过，包含
  chunk-size warning；未安装。临时预览服务已停止，不影响用户 daemon。
- 2026-09-09，L7 源码真实请求开始：隔离 home/daemon 58641 使用 gpt_relay，
  没有重启用户 58629。短请求成功；GW 新会话 Research ready，首次只读恢复
  暴露 Bash AITP 路由仍被 action guard 拦截及猜错 launcher 路径，之后改用
  原生读取。保留原始失败，不计验收通过。详细数据和定位见
  [真实请求验收](lean-harness-live-acceptance.zh-CN.md)。基础工具定义体积与
  provider latency 已测，仍不能把全部体积当冗余或把等待全归因于 harness。
- 2026-09-09，R1 已返回：460778 ms、5 模型 step、11 工具调用（2 失败），
  未执行写入/远端/Goal/action 工具。原生读取恢复了记录，但交互仍慢；不计
  完整验收通过。修正 AITP 插件既有 Skill wrapper 的 native/CLI 路由与相对
  launcher 解释，未新增提示通道、权限或 parser。195 项 ledger 测试通过
  （46.11s），原始失败与待复测项保留在真实验收报告；未重装。
- 2026-09-09，R2 新加载同题复测：75956 ms、5 step、11 调用、零错误，
  无 Bash；核实新版 Skill wrapper 进入上下文，1439 个 AITP 文件元数据不变。
  缓存和审批响应不同，不声称全部提速由修复造成。随后把四个原生只读工具
  纳入现有 default-tool-approve 风险策略；不使用 event.allow，不改变 Research
  guard；60 项政策测试覆盖默认读取、显式 deny/ask 及写入/MCP 排除，typecheck
  通过。该审批变化尚未重载实测，完整 L2/L7 仍未完成。
- 2026-09-09，R3 重载后定向验证：四个原生读取、2 step、27226 ms，零错误
  零审批事件；manual posture 未改，Goal/action/checkpoint 均无，AITP 元数据
  不变。模型未将历史 pending 说成实时状态；pin finding 的影响措辞仍可精确。
  不把窄许可测试与完整回忆作直接耗时比较，发布安装和多线任务验收仍待完成。
