# 轻量 Research harness：真实请求验收

## 本次有限 G1–G7 交付结论（2026-09-10）

实现/兼容处置、核心/协议/CLI/Web/SDK/IPC-memory、原子Entry/Note异常与并发、
有限真实恢复/记录/委派/压缩/历史追溯及配套安装均已完成对账。最新针对性结果：
Research四文件870通过、提示42通过、REST/WS32通过；此前ledger220、
完整SDK文件62、共享IPC-memory52以及Web/CLI记录按对应范围复用，不相加冒充
无重叠总测试数。最后历史追溯只读样本明确区分提案、来源修正和科学结论。
最新包main/worker/Web逐字节一致、PTY与新会话AITP0.10/contract0.3 ready通过；
06:50:41 UTC全部226日常会话idle。CLI/SDK patch changeset已通过status校验。
未commit/push，未改真实课题源码/ledger或提交远程作业。后续只改测试/文档，
无需为这些非运行文件再次重装。

失败样本和未测边界保留在下文；不是全仓测试、OS sandbox、长期召回保证或
理论物理课题完成声明。各阶段曾经的“待完成”以本节及最终对账表为现状入口。

## G7 明确历史问题的只读追溯通过（2026-09-10）

session_3d67fdf1-3e03-496e-865c-a477a95f76a4，prompt
msg_01M2512S87HKMQ0CNYV17Y7VHE 最终completed/busy=false。该新恢复会话已
读过最新note-700401ca…，本次仅1次Read补读其supersedes旧note-e45a636f…；
没有Write/Edit/保存/Goal/Action/远程操作。最终引用新旧完整ID及具体段落，
正确恢复纯幂律/有限尺寸修正候选、残差→留出尺寸检验、仅小尺寸支持时收缩结论。
明确指出旧frontmatter有basis_refs而正文写empty，新版只修正来源描述，不构成
新科学结果；候选及检验仍未验证。监督者对照新版10–45行与本次旧Note工具回执，
关系和修改原因一致。使用既有上下文不是第二次冷启动，但起点是此前独立新会话
恢复的真实记录，并未在此次问题提供预期答案。
这补齐有限的“明确询问时找回为何改变”验收，不掩盖先前自主矛盾识别失败，也不
证明数月跨度或所有资料必然可召回。该次首字等待约36.96s，本地request build1ms。

## REST/WS 夹具修正验收通过（2026-09-10）

旧运行在持续占用CPU且使用已知混用home/workspace夹具的情况下主动终止，
handle13436退出143；不是自然通过或超时自动恢复，不触碰其他测试及日常服务。
确认终态后以独立workDir/.git边界重跑，单worker/2048MB，32 passed / 14.78s。
包括真实REST/WS冷恢复、旧snapshot兼容、人类决定、Line绑定、历史checkpoint
discard和保留未归属结论。没有提高timeout、删断言或改产品扫描行为。
该对照支持夹具隔离修正有效，不把它当作生产Research性能基准。

## REST/WS 最终回归：夹具隔离检查（2026-09-10，未验收）

当前 research.test.ts 实测进程仍运行，尚无终态结果，不能计通过。源码发现已创建
workDir 却将 home 作为会话cwd，且未建立项目根标记；宿主 /tmp/.git 目录仍存在
（不是有效git仓库，rev-parse失败）。此前另一transport夹具已定位过同类工作区
发现扩散，本次尚无细分计时证据，故仅记为待验证因素，不断言相同根因。
夹具改为使用自身workDir并建立.git边界；不改产品扫描、超时或断言，不动宿主
/tmp/.git。旧运行尚未结束；后续重测须先确认其终态，不能并行重复大型测试。

## 最终回归增量（2026-09-10）

当前源码的 Research service/ops/execution-policy/golden-fixtures 四文件首次
867 passed / 3 failed；三处失败均为精简提示后的旧措辞断言。更新断言仍检查
canonical读取不等于验证/写权限、无变化零写、已有checkpoint恢复不重复保存、
蒸馏非每次观察以及不重复请求授权。无运行时代码回退。重跑870 passed / 5.59s。
双仓diff检查通过。双方handoff顶部同步06:38已安装版本；下方历史失败保留。

## G7 最新日常包交付通过（2026-09-10）

06:36:49 UTC 完整查询225会话均idle后，公开shutdown接口返回200；旧日常包
完整保留于 /tmp/hakimi-final-v2-aSitsO/previous-daily-package。离线安装新tgz
成功（5 packages / 2s），恢复同版本node-pty native build。新PID13917继续使用
原home/cwd及127.0.0.1:58629；06:37:56复查225会话均idle。
实际PTY输出pty-ok、exit0；main/worker及全部Web文件与隔离安装逐字节相同。
新合成会话 session_fb8775d0-5208-4b25-bf51-b0e9f4740d2f 仅进入Research Mode，
ready / plugin0.10.0 / contract0.3 / python3.12 / Goal=null，无模型科研调用。
两端AITP scripts（排除运行生成的__pycache__）及Skills与源一致；首次未排除
pycache的比较确有缓存差异，不能称缓存也相同。Codex新线程才加载已装新插件。
本节取代下方“尚未安装”的当时状态；完整Goal最终逐项审查尚未完成。

## G7 最新包已构建（2026-09-10）

最新 Plan 摘要修正后 core typecheck 退出0。标准 CLI prebuild/build 在
NODE_OPTIONS=--max-old-space-size=3072 下完成，main 20.12MB、worker 468.05kB，
Web 521 文件验证通过；Web 与构建前副本逐文件一致，web-base 也一致。
新包为 /tmp/hakimi-final-v2-aSitsO/bhjia-phys-hakimi-0.21.0.tgz，pack 成功，
使用已完成标准构建并禁重复 prepack。隔离安装检查尚进行中，未替换日常核心。
06:35:32 UTC 完整查询225个日常会话，has_more=false且全部busy=false；正式
替换前仍须重新查询。备份时误用 apps/kimi-code/generated 的失败保留，实际
生成路径 src/generated 构建后无tracked diff；旧dist/Web/web-base副本均已保留。

## G4 旧规划提示去重修正（2026-09-10，源码）

发现 Plan v2 指纹含 revision 却未直接包含摘要中的 objective/milestone evidence；
旧 Action plan 指纹还包含不显示的 resolution。现统一用各自已渲染摘要作比较，
Plan v2 提示移除版本号。完整模型及版本/审批/持久化状态不改，仍可通过状态接口
读取。新增回归证明仅 revision/updatedAt 变化零注入，目标、里程碑证据和停止条件
变化仍触发更新；researchInjectionPresenter 单 worker 42 passed / 7.68s。
此修正尚未安装，也不声称完全去除所有旧科研字段。旧 wire 记录未修改。

## G4 请求来源与去重复核（2026-09-10）

定向读取当前 llmRequesterService：context messages 经 toolSelect.shapeHistory、
projector、videoResolver 后，与单份 resolved systemPrompt/tools 进入实际请求。
recordRequest 保存消息数量、工具快照和 system 来源，不保存全部 HTTP 正文；
以下是源码路径加实际 wire 来源对账，不冒充抓包或全内容语义去重证明。

| 来源 | 当前行为与核验边界 |
|---|---|
| Goal | goalInjection 按目标/验收/状态/预算的 task disclosure 判断全文变化，后续仅 usage 增量；Research brief 不重述 objective/criterion |
| 普通 Plan Mode | planModeInjection 按 active/path 披露；未变化不重复发全文，退出一次提示，压缩丢失披露则恢复；不把 AITP 长期规划复制成强制 Plan |
| Todo | sessionTodoService 只给 main 注入共享列表，工具返回当前列表；staleReminder 对照保留历史，子任务不额外注入主列表 |
| AITP Skill 列表 | aitpSkillVisibilityInjection 比较当前列表与最后提示；变化才追加并注明取代旧提示，不等于重复加载 Skill 正文 |
| Research | presenter 按语义指纹去重，attention-only 用 delta；保留的历史 phase/action/plan 改变仍可能触发 brief，不可说已去掉全部历史控制面文字 |
| 压缩与子任务 | 真实 cabb 会话压缩后恢复已通过；累计 append 计数 main 为 visibility=2/research=12/goal=6，包含压缩前历史，不是单次请求重复数；agent-0/1/4/5 的 wire 均无上述注入 |

当前四个定向测试文件（researchInjectionPresenter、planModeInjection、goalInjection、
contextInjector）单 worker 95 passed / 12.18s。它们补证披露变化/恢复规则，不替代
真实模型验收。下一项须复核历史 Research plan/action 提示是否仍造成非必要全文
重发，再决定最小删减；不删除原 wire 证据或把历史记录次数直接当成提示重复。

## 当前验收增量：G3 Swarm 修正样本通过（2026-09-10）

同一合成 cabb 会话的 prompt msg_01M24ZSHZ72C2KRWGQGQ28RHD5 已终态
completed，busy=false。实际 wire 的 call_gpoQFyb9S3lNQeSXsZWIpjno
携带旧 Goal a0cc91b9…依赖，A1/A2 均返回 not_started / failed，理由为
依赖尚待人类决定；这不是上一样本的 items 数量错误。
call_FHq8QrhwfPFja1AILXHietAr 显式 goal_dependencies=[]，B1/B2 分别由
agent-4/agent-5 完成，仅返回标签。两次工具调用均为 AgentSwarm，未改科研文件、
AITP 记录或远程作业。独立读取 decision-state 确认旧 gate b3bc1e7b…仍未解决，
dependentGoalIds 不变，当前 Goal=null。拒绝分支可以留下未运行的代理元数据，
不宣称零创建或 OS 隔离。

因此 Agent、嵌套继承和 Swarm 的有限真实依赖场景已有成功证据；下方首次失败
及当时的 pending 描述保留为历史。最新委派源码尚未重新打包进日常安装。
当前剩余工作是最终上下文/跨端覆盖审查、文档现状对账和最新同字节包的安全交付，
不是重复本项模型试验，也不代表完整 G1–G7 已完成。

## G3 Swarm首个实测样本无效，保留失败（2026-09-10）

prompt msg_01M24ZJJQ8EM4QFMEB2847JG2M错误要求每组一个新item。两个实际
AgentSwarm调用均因至少两个items的既有约束拒绝（无resume_agent_ids）；
未触达goal dependency检查，不能算依赖拒绝成功或独立执行通过。
监督者已修正下一次样本为A1/A2与B1/B2，仍仅短标签、无工具/文件/科研操作；
截至此记录API busy=true，日志停在6.3最终上游请求，新样本尚未提交。
不取消该请求、不弱化Swarm规则、不用Agent替代该入口验收。
随后API确认completed/busy=false，才提交修正样本
msg_01M24ZSHZ72C2KRWGQGQ28RHD5；已接纳为running，尚无验收结论。

## G4 实际压缩与压缩后恢复通过（2026-09-10）

先前两次上游失败保留。r9在实际嵌套模型生成成功后，针对同一合成cabb会话
仅重试一次：full_compaction.begin=1789020990666，complete=1789021023549，
单次compaction请求53 messages，约32.9秒。apply_compaction记录52条压缩，
tokensBefore=52573、tokensAfter=33720、summaryOutputTokens=608，保留5条用户消息。
摘要保留未决b3bc…只关联旧a0cc…Goal、早先A选择只是合成输入、独立Goal已完成、
依赖任务拒绝、独立嵌套完成，未把模型摘要当独立孙任务回执。
随后prompt msg_01M24ZEQD6257SWM49CS025NC2明确要求只读回忆和独立概念问答；
实际一轮end_turn，无工具调用，正确回答上述差别以及反例与数值误差，未解决决定。
该请求5 messages；压缩后AITP visibility注入一次1226字符、Research brief一次
4152字符。并非完整HTTP payload去重证明；剩余基础profile/tools与保留用户消息
成本仍须对账。该次usage为7197 inputOther + 21888 cacheRead；first token9478ms、
stream29900ms、request build0ms，不以总耗时冒充本地harness时间。
API最终busy=false/completed，仍无Goal。完整G1–G7尚未完成。

## G3 新源码真实委派依赖验收（2026-09-10）

隔离端口58653的7个会话均idle后重启为r9源码，未重启日常服务。
session_cabb17de-50c1-4ee3-bb4d-c7f8eb01d615，prompt
msg_01M24Z5TFATRBX5MFP7G17ADFR，开始06:13:13 UTC，最终busy=false/completed。
main的call_CDOymyMVWn5WrqNjgZfJ5n5j携带旧Goal a0cc91b9…依赖，工具返回
明确等待错误；其后只有独立agent-0与孙agent-1创建，无依赖代理。
call_quwaz0jDH76fhmSg8OoIjHoC携带goal_dependencies=[]完成；agent-0的
call_1CgEkFKhAg7NumXkEDFW9BQr省略依赖仍成功，state.json中两个代理的
goalDependencies均为[]，孙代理labels.parentAgentId=agent-0。task_scope各自保留。
三者只做合成一句解释，所有工具调用均为Agent，没有文件/AITP/网络/计算调用。
gate b3bc1e7b…及其唯一旧Goal依赖未变，无resolvedAt，当前Goal=null。
这证明实际Research贡献、跨Agent可见性和继承路径；不证明任意科学依赖判断准确。
agent-0最终答复一次上游stream约64,972ms，本地request build为0ms；总延迟不能
归因于Research门禁。main首请求含42,925 inputOther，旧历史未成功压缩仍是负担。
证据位于/tmp/hakimi-note-live-0hsgIJ对应session的agents/*/wire.jsonl及state.json；
失败压缩样本仍保留。Swarm实际模型和本轮新包日常交付尚待完成。

## G7 日常核心已安装，插件配套仍待交付（2026-09-10）

05:46:07 UTC再次完整检查224个会话均busy=false后，POST /shutdown返回200；
离线全局安装已验证tgz成功（5 packages / 3s）。旧包完整保留在
/tmp/hakimi-final-package-LizRza/previous-daily-package，安装前diff -qr无差异。
新服务PID31055使用原HAKIMI_HOME、GW_librpa cwd及127.0.0.1:58629，
无自动打开浏览器、无恢复Goal、未改科研记录；05:46:45再次枚举224会话均空闲。
安装后main.mjs、search-worker.mjs及整个dist-web与隔离验证包一致；版本0.21.0。
ignore-scripts导致node-pty缺native模块的首次检查失败已保留：从旧安装恢复同版本
node-pty/build后，实际PTY执行/bin/sh输出pty-ok、退出0。首次worker检查误用.js
文件名也已纠正为实际.mjs，不能把那次失败说成包文件丢失。
AITP插件尚未配套重装；本项仅证明日常核心交付，不代表完整G7或Goal完成。
上游压缩失败、最终上下文/任务依赖审查与新插件新会话加载验证仍未关闭。

## G7 安装包校验与日常启动检查（2026-09-10）

/tmp/hakimi-final-package-LizRza/runtime 使用离线、ignore-scripts、omit optional
安装最新tgz成功（1 package / 5s）；main/search-worker逐字节一致，全部dist-web
diff -qr一致，安装版--version为0.21.0。此临时安装省略optional，尚不证明PTY可用。
日常命令仍指向/home/bhjia/.local/lib/node_modules/@bhjia-phys/hakimi/dist/main.mjs。
05:39:57 UTC完整枚举224会话（has_more=false）逐一查询busy，均false。
端口58629由PID3705持有，无TTY、stdin=/dev/null，stdout在旧安装临时目录server.log；
不是用户前台终端。用户systemd bus不可用，不能假设service重启方式。
源码提供POST /shutdown优雅退出接口；尚未调用，亦未覆盖日常包或插件。
下一步再次检查idle并安排有回退副本的核心/插件配套安装与启动验证。

## G1/G7 配套安装准备（2026-09-10）

已确认日常命令指向 /home/bhjia/.local/lib/node_modules/@bhjia-phys/hakimi/dist/main.mjs；
hakimi 没有 plugin CLI 子命令，不能编造安装命令。AITP contract-0.3 必须与新
adapter 配套交付，尚未覆盖日常旧bundle。两个插件manifest清理未实现愿景及旧Entry-only
描述；分发/版本/adapter定向16 passed / 4.32s，bundle validator通过。
当前Hakimi标准完整构建已启动，堆上限3072MB；旧dist/generated已保留于
/tmp/hakimi-final-package-LizRza/previous-{dist,generated}，构建前这几处无tracked diff。
标准构建已退出0：main 20.11MB、search worker 468.05kB、Web521文件验证通过。
禁重复prepack的pnpm pack已成功产出
/tmp/hakimi-final-package-LizRza/bhjia-phys-hakimi-0.21.0.tgz。
尚未安装或重启日常daemon；压缩恢复实测缺口仍保留。

## G4 压缩失败原因确认（2026-09-10）

session_cabb17de… 的 session-local logs/kimi-code.log 证明首次压缩
05:27:49–05:30:08 UTC 四次 upstream_error 后最后一次 HTTP 503。
fullCompactionService 的失败清理调用 cancelActive，故 wire cancel 不等于用户
主动取消或 Research gate 拒绝；本例没有成功压缩或恢复证据。没有调整 preset、
模型或重试上限。确认 busy=false 后仅发起一次有限手动重试；该次也在
1789018437443 cancel，期间502/503/upstream_error，API busy=false。
不再连续重跑；压缩成功恢复仍缺真实验收，不能以结构测试替代。用户科研会话未受影响。

安装前 plugin-creator bundle validator 通过（仓库 .venv；独立python3.12
缺PyYAML的首次校验失败保留，未改全局环境）。新增Entry故障测试后的完整
AITP tests/ledger：220 passed / 67.18s。尚未更新日常Codex/Hakimi安装。

## G5 Entry 异常回执补证（2026-09-10）

AITP test_atomic_record_save 新增与 Note 对称的故障注入：atomic_write 前
OSError 保持零 canonical Entry、草稿不变；真实写入后抛出模拟丢回执异常，
同身份重试返回 already_saved、仅一条 Entry；错 workstream 重试仍拒绝，
已保存字节与原草稿均不变。Entry/Note 原子保存定向测试合计40 passed / 11.25s。
这是真实写入函数加注入异常的确定性测试，不宣称真实磁盘故障或网络 exactly-once。
已有 Note 独立 CLI 并发/跨线写入和 Hakimi record/note 未知回执失效测试保留，
不以该新增测试替代模型端恢复或最终安装。

G4 同一 compact 请求观察到五次 llm.request 后在1789018208491出现
full_compaction.cancel，API随后busy=false。不是成功恢复证据，原因尚待追踪；
未重复发起。此前gate b3bc1e7b… 与dependentGoalIds=[a0cc91b9…]保持未解决，
current Goal 为null。取消事件本身没有reason字段，不能猜成Research决定阻塞。

## G3 Manager 只读浏览器复核与 G4 压缩启动（2026-09-10）

两个既有合成会话在 light/dark 系统偏好下打开 Manager → Science，明确/未知
依赖文字四例均可见、无 pageerror；截图 manager-{explicit,unknown}-{light,dark}.png
位于 /tmp/hakimi-note-live-0hsgIJ，explicit-dark 和 unknown-light 已人工查看。
没有提交任何决定。探针两次定位失败分别因 Science 是 tab 而非 button、Dialog
未关联标题作为 accessible name；改为标题内容定位后通过，未为测试改变产品状态。

随后对 idle 的 session_cabb17de-50c1-4ee3-bb4d-c7f8eb01d615 发起一次手动 compact，
API 接纳，wire full_compaction.begin 后出现真实 compaction llm.request（47 messages），
API busy=true。此时尚未证明压缩结束或恢复正确；下一步只观察同一调用，不重复发起。
限定临时合成会话，无真实科研文件/ledger/作业操作。

## G3/G6 Board 决定归属接入与浏览器验证（2026-09-10）

DesignSystemView 分段读至 EOF（补读被截断的 sidebar 部分），随后在既有
Board 紧凑提示、展开决定说明及 Manager 决定区接入只读依赖投影，中英文同步，
无新控件或 CSS。明确依赖列出 Goal IDs；旧未知依赖明确保留未知；已解决决定
显示历史语义。未修改任何真实或合成决定。

Web typecheck 通过；check:style 仍是 baseline 28 findings、退出 0，无新增项。
规范 build:web-assets 与 --check 均通过，521 文件；source bd06300c446d2ec4dd2c3bf492d976402fa0d3700727953340962573032c0f54。
隔离 r8 两个既有会话在 light/dark 浏览器系统偏好下均通过依赖文字、无旧契约
误报和 pageerror 断言；Research observatory 按现有产品规则始终使用深色皮肤，
不把这宣称为浅色 Board 视觉验收。Collapse hover/focus 已执行。最终两张
dependency 区域截图已人工查看，无文字溢出，旧未知决定仍 unresolved。
截图 /tmp/hakimi-note-live-0hsgIJ/decision-{explicit,unknown}-{light,dark}.png。
一次截图滚动误选隐藏的 compact 元素而超时；探针改为 visible 元素后四例通过，
未修改产品状态。Manager 已类型检查，交互浏览器复核仍待补齐；日常安装未进行。

## G3 Web 决定依赖字段与只读投影（2026-09-10）

服务端及公共 protocol 的 human gate 已声明 dependentGoalIds；Web 的
ResearchHumanGate / WireResearchHumanGate 本地类型遗漏该字段，现已补齐。
新增 presentResearchDecisionDependency，只投影 pending/resolved、explicit/unknown、
当前 Goal dependent/independent/unknown；不从 prompt 推断，不修改原决定，
不替代服务端 continuation。空旧依赖仍按 unknown；已解决决定仍是历史。
147 项 lib-logic 测试通过（1.21s）。组件尚未接入该 helper，因此不能宣称
Board 已实际展示依赖；下一步是组件接入及浏览器验收。

## G6 新契约 pending checkpoint 呈现回归（2026-09-10）

新增同一 pending checkpoint 在 contract 0.2/0.3 下呈现完全相同的
attention 回归；未知 0.4 必须额外保留不可写警告，不能通过消除所有警告
掩盖未知契约。当前 lib-logic 144 passed（1.35s），Web typecheck 通过。
check:style 退出 0，但 baseline mode 报告 28 项，不能称样式零告警；
本次仅增加测试，没有修改这些组件或样式。发布资产及浏览器验证仍未完成。

## G3/G6 决定 Board 实测缺口（2026-09-10）

Playwright 打开 r8 的明确依赖与旧未知依赖两个合成会话，无 pageerror。
截图 decision-explicit.png / decision-unknown.png 和探针 decision-board.mjs
位于 /tmp/hakimi-note-live-0hsgIJ。界面保留决定，但未显示 dependentGoalIds
或未知依赖说明；不能称用户已能看清等待归属。另发现 Web helper 仅识别
contract 0.2，实际 ready/0.3 被误报 checkpoint write unavailable。

已修正纯呈现 helper 的版本判断及中英文提示，明确接受 0.2/0.3、拒绝
未知版本，不改变 adapter 权限。lib-logic 143 passed / 1.31s。尚未修改
Vue 组件、重建发布资产或做修复后浏览器验证；决定依赖的显示仍待补齐。
Web AGENTS 已完整读取，DesignSystemView 初次读取被截断，组件修改前
仍须分段读完，不能把截断输出当成完成设计规范阅读。

## G3 实际决定依赖样本与 G5 异常覆盖复核（2026-09-10）

隔离会话 `session_082c99a8-9eca-4d71-9d43-abe9c011a0fd` 使用当前
源码与 AITP 0.10.0/contract-0.3，要求创建仅等待合成 A/B 人类选择的
Goal、设置两 turn 预算、声明该 Goal 的决定依赖；没有授权代选路线或
科研文件写入。04:44:32–04:48:20 UTC 连续七次模型请求报告
`response.failed: upstream_error: Upstream service temporarily unavailable`。
期间 API busy=true、Goal=null、无决定、无工具结果；不能把这些等待时间
归因于 Research gate，也不能算作决定依赖测试通过。

没有重启或重复提交 prompt。原请求恢复后提出 CreateGoal；监督者检查
精确审批内容与原合成测试授权一致，于 04:49:50 UTC 批准该创建操作。
此批准不代表选择 A/B。独立问题、依赖 hold 和显式选择后的恢复仍待实测。

后续真实失败：模型额外 GetGoal 后仍未填写 dependent_goal_ids，创建的决定
e35129b6-5f09-45bb-985a-38589917c801 为未知依赖。源码确认
goal/tools/serialize.ts 从 CreateGoal/GetGoal 回执删除 goalId，故模型无法
取得所要求的真实 ID；不是用更多 prompt 即可修复的问题。现保留既有 ID，
未增加第二身份或生命周期；真实工具回执回归 28 passed / 6.23s（现有 DI
fixture 警告保留）。该修复尚未装入运行中的 r7 进程。04:52:49 UTC
原会话空闲后仅发送一次独立问题 msg_01M24TJM499AV8FH178QRYBM6Q，
不提供 A/B 选择；本样本转为未知依赖保留与独立对话验证，不能冒充显式
Goal 依赖成功案例。

Goal ID 修复后，新增测试最初遗漏 ToolExecution 错误分支的类型收窄；
补齐后 core typecheck 通过。Goal tools + injection 最终源码回归共
51 passed / 7.04s，导入边界检查通过（1301 files），既有 DI fixture
警告未隐藏。README 中残留的“Note 原子保存待授权”已按当前实现纠正，
仍明确区分源码、隔离服务与未完成的日常安装。独立问题首次三次请求
在 04:53:21–04:54:27 UTC 仍为同类 upstream_error，未出现科研工具
执行；保留原请求，尚不将此样本计为独立对话通过。

随后同一请求正常回答必要条件/充分条件，无新增工具、无代答 A/B；旧 gate
身份与未解决状态保留。该 Goal 两轮预算耗尽后由 engine 标为 blocked，
terminalReason 明确为预算耗尽；不能据此验证持续 decision hold。新样本
用四轮预算分离此混杂因素。确认六个隔离会话 busy=false 后，TERM 停止
58653 listener PID12277，保留原日志，以同一 home 启动 r8（handle54796，
启动 PID23049）；日常服务未动。新会话 session_cabb17de-50c1-4ee3-bb4d-c7f8eb01d615
于 04:57:18 UTC 提交 msg_01M24TTTJMVSZ4XBM5SDZEEJ1V，真实 CreateGoal
回执已包含 a0cc91b9-c2a9-4f5a-bf87-408dc84219f9，并设置四轮预算。
显式依赖及其后续结果尚待验收，不能仅凭 ID 可见声称全流程成功。

r8 后续：RequestResearchDecision 实际携带上述精确 Goal ID，保存 gate
6967f023-3f5f-48de-be8c-22ccdf23e282，未选择 A/B。轮次结束后 API
busy=false，Goal active、turnsUsed=1/4，continuation=held，owner=
aitpResearch，reason 明确为该 Goal 的显式决定依赖。没有把等待标成
Goal blocked/complete。随后在同一会话发送独立问题一次，后续回答与
决定保持情况仍需核验；另一独立 Goal 与旧未知依赖的覆盖不能由此推定。

r8 同会话独立问题已正确回答必要/充分条件，无工具调用；原 gate 未解决、
Goal active/held、预算 2/4。随后监督者明确输入仅用于测试的选择 A
（msg_01M24V1CWEXT6EW7FWE9XAHGQV），模型 GetResearchStatus 后调用
ResolveResearchDecision，准确记录 synthetic supervisor selection，未写
AITP/文件、未创建 Action/Question。UpdateGoal 回执确认 completed，
3 turns / 3m57s / 390 tokens，API current Goal=null、gate resolved、
Research idle/ok。该结束只代表合成测试，不是任何科研 Goal 完成。

05:02:30 UTC 在同会话提交 msg_01M24V4ANCMBW0ZH0RDNDJKXTT：保留仅依赖
旧 Goal 的合成附录决定，同时创建独立的可证伪性解释 Goal（两轮预算），
要求新 Goal 完成但旧决定不被回答/解决/改派。此反向隔离样本正在运行，
尚不能算作通过；没有启动真实科研或新的远程任务。

反向隔离最终通过：旧附录 gate b3bc1e7b-4a95-47f7-abd2-bde15fe8ccdf 仅依赖
a0cc91b9-c2a9-4f5a-bf87-408dc84219f9；新 Goal
62e8b87b-b358-48d3-9cbc-5803e1825b9f 创建、设两轮预算、UpdateGoal complete
均成功。最终答案正确区分可证伪与已被证伪，旧 gate 无 resolvedAt/resolution、
依赖 ID 未变；API busy=false、current Goal=null。回执 0 turns / 3m50s /
69 tokens，是当前 turn 中新建并完成的 Goal 计数，不代表没发生模型调用。
05:04:09–05:06:29 UTC 五次 upstream_error 原样保留，不将延迟归于 Research。
普通对话、匹配依赖等待、明确答复结束、无关 Goal 完成四项已有实际证据；
尚不覆盖未知归属的界面澄清、所有并发任务或最终日常安装。

安装准备只读核验：plugin-creator 更新指引和安装引用已完整读取；名称验证
得到 aitp-protocol，codex plugin list 确认现有插件 enabled，版本
0.9.0+codex.20260910023532，来源为 AITP 仓库的本地 bundle。尚未执行
cachebuster 或 plugin add，不把入口核验当成安装完成。

当前 AITP 完整 ledger 回归：219 passed / 46.87s（单 pytest 进程，
并发测试内部仅启动契约所需的两个临时 CLI writer）。无真实科研记录写入。

本轮定向复核 `test_atomic_note_save.py` 与 `test_atomic_record_save.py`：
39 passed / 6.98s；覆盖锁内 Topic/精确 workstream、相同草稿重试、冲突
零写、Note 写前失败/写后响应丢失和两个 CLI writer。Hakimi service
定向选择 single-flight、save memory invalidation、atomic precondition：
7 passed / 723 skipped / 1.51s。后者的未知回执采用 scripted transport，
只证明拒绝与刷新边界，不证明真实模型已正确恢复未知保存结果，也不构成
exactly-once 或整个 G5/G7 已完成的证据。

## G6 外线进展投影修复（2026-09-10）

实际 Web/REST 复测：确认58653所有4个模型会话 busy=false 后，优雅停止
旧测试进程21952（handle40794正常退出），以相同临时home重启当前源码
（新handle20510，启动PID8108）。日常daemon与58652未动。首次重启因独占
日志已存在退出，改用server-r2.log保留旧日志后成功；未删除日志。

合成会话 session_ad3d8070-7ad8-443d-af94-301c1303549c 通过公开API建立
A线保留run/progress、B线空前台。B的REST projection不含外线字段。
Playwright实际页面展开B不含A进展/下一步；API切回A后WebSocket更新页面，
原进展/下一步可见，pageerror为空。截图board-a.png/board-b.png及探针
位于/tmp/hakimi-note-live-0hsgIJ，已查看B截图。浏览器初次缺cache环境、
再次被欢迎弹窗阻挡，复用原依赖并修正探针等待后通过；不算产品失败。
未改Web组件或重新生成资产，本次验证现有界面消费最新后端投影；不代表
所有G6布局/客户端/嵌套Agent验收完成。

源码发现 foreign Action 虽已隐藏，其 latestProgress/recentStateChange 仍
进入 effectiveNextStep，recentStateChange 还作为全局快照字段展示。
现统一隔离这些前台投影，保留 raw 历史并在切回原线后恢复展示。
新增双线回切测试、更新恢复 fixture 断言；service 730 passed（3.47秒），
typecheck 与 diff check passed。未安装该最新修改。

Note 专项最新恢复会话 session_3d67fdf1-3e03-496e-865c-a477a95f76a4 已
completed，读取最新 note-700401ca... 而非旧 Note，正确恢复路线及无结果
边界；总5次工具（含一次额外 GetResearchStatus）。没有写入工具。
未主动讲解 supersession 历史，故不将此答案视为完整历史因果追溯验收。

## G7 无 Goal 规划 Note：实时样本（进行中）

2026-09-10 新隔离源码进程 localhost:58653，监督脚本与临时 home/workspace
位于 `/tmp/hakimi-note-live-0hsgIJ`。不替换日常 daemon；旧 58652 实例未动。
source server 进程启动 PID 21922，终端 handle 40794。
会话 `session_65aff78c-cb97-4c5e-b9a7-a3b9341531a9` 使用
openai-relay/gpt-5.6-sol；接口核验 AITP 0.10.0 / contract-0.3 / python3.12。
监督者绑定临时 Topic provisional-route、workstream/Line route-a。

任务仅将无数据的有限尺寸拟合候选与判别计划存成 working Note，明确禁止
伪造结果、创建 Goal/PlanV2/Action/Question/checkpoint 或操作真实课题。
已观察 Skill→recording reference→note_prepare→读模板→编辑草稿；普通
note_prepare 审批由监督者批准，未出现 Research 门禁。最后查询 busy=true、
无 pending approval，保存和新会话恢复尚未完成，不计通过。

首轮终态 completed，但 Note save 返回 missing_refs（working Note 必须有
非空 basis_refs），canonical Note 不存在。模型正确保留草稿并报告失败，
没有伪造结果。这证明“直接 Note 路径可调用”，不证明空来源规划能保存。
03:46:07Z、03:46:39Z 两次 provider upstream_error 带来重试等待。

监督者在确认首轮终态后发出同草稿恢复指令：将明确给出的合成规划原文
保存到临时 theory/proposal-source.md，作为未验证提案来源加入 basis_refs，
再重试原 draft。只授权该临时来源，不制造物理结果或新 Entry。
恢复 prompt msg_01M24PVV6HWQSM75BECQSEDV2D 正在执行；仍待验证。

恢复写入现已 completed；原 Note ID 成功保存，未另建 Note/Entry/Action。
前言 basis_refs 引用 theory/proposal-source.md，明确是未验证提案而非数据。
发现语义缺陷：正文 Scope And Basis 仍写“basis_refs is empty”，与 frontmatter
不一致。不得将保存成功算成内容质量验收完成，也不原地修 canonical。
恢复首字等待 38,953 ms（turnStep1.1）；实际工具审批另计。

新只读会话 session_592a3f05-0c51-4c5d-92c2-551a1ff73ae3 已于03:50:10Z
启动，从相同 route-a 记忆恢复问题、候选、判别与限制，不提供旧聊天内容。
该恢复尚在运行，后续需要观察能否正确区分提案和结果及识别文本不一致。

只读恢复已 completed：Skill、scoped enter、定向读取 Note 与提案文件共
4 次工具调用，无写入工具、无额外审批、无 Goal/Action。正确恢复问题、
A/B 候选、残差→留出预测、收缩条件、无数据及未验证提案身份。
但模型将前言有 refs 与正文无依据解释为不同语义，未明确指出正文原句
“basis_refs is empty”的过期错误。基础找回通过，语义矛盾识别未通过；
下一步需改进写前/修复后的简短内容一致性提醒，而不是增加状态门禁。

2026-09-10 Skill follow-up：AITP recording 参考新增提案来源和修复正文/refs
一致性说明；主 Skill 增加两行，要求报告明确矛盾而不是善意解释过期文字。
未改 schema、runtime 或科研状态机。Skill validator passed；AITP adapter/
research-memory/method-card 定向测试 43 passed（14 秒）。仅隔离58653
插件重装，先确认原两个会话 idle；日常 Codex/Hakimi 未重装。
新会话 session_6aa6a8f7-c47c-4ca7-9fe1-4cfc1d99c559 使用同一无答案提示的
只读恢复任务复测，03:53:37Z 启动，已观察加载 using-aitp，结果待定。

复测 completed：仍为4次工具调用，正确恢复科研路线与无结果边界，无写入；
但没有主动指出正文“basis_refs is empty”的矛盾。这个单样本不支持
“新增提醒改善了矛盾识别”的主张。保留失败，不继续堆叠提示词或假称修复。
写作侧提醒尚未通过新写入样本验证；已保存样本的正文修正仍需新Note supersession。

已在确认新会话 completed 后，向同一 session_6aa6a8f7-c47c-4ca7-9fe1-4cfc1d99c559
发出显式修正任务（prompt msg_01M24Q9EQNDFAJAVK98SJX6XVA）：新 working Note
supersedes 原 Note，保留提案/结果边界、原检验顺序及修正原因，不编辑原记录。
这是受指导修复验收，不是模型自主发现错误的证据。原 Note 修正前摘要为
78b1ba0b28817208e7efe8ad5066eff4a2714277af49061ce239ee67d55e7852，
仅用于本次“旧记录字节不变”的验收，不是日常召回增加 hash 审计。
新 draft prepare 已获临时写入审批；保存/关系与新会话追溯待核验。

修正会话现已 completed。新 Note note-700401ca775f48b4b54c22f56957e176
已 canonical 保存，supersedes 指向原 Note，正文明确说明原来的空 refs
说法错误、此次仅修正来源描述，并保留无数据/结果和原研究路线。
旧 Note 保存前后摘要同为78b1ba0b…5e7852，未被改写。
这证明受指导修正及历史保留，不证明模型会自主发现所有矛盾。

## G2 直接 Note 与 Question 解耦（2026-09-10）

直接 Note 仅捕获原 Topic/workstream、draft path 和会话内资格。
不再将 Question evidenceRefs/falsifierRefs 自动当作 Note basis，也不再
因 Question revision 改变撤销草稿。需要哪些文献、推导及反例由 Note
内容表达，实际 refs 的确定性验证由 AITP save 执行。

新增规划 Note 测试：当前 Question 含不可读取的无关历史 Entry，写草稿
期间修改 assessment，仍可保存同 scope Note，show 调用为零，不创建
ResearchPlanV2/Action/checkpoint。保留 scope 漂移、冷恢复、undo、失败
及未知结果测试。首次运行有 13 个旧耦合断言失败；按新职责改写后
service 729 passed（3.26 秒）。真实模型验收未由这些 stub 测试替代。

## G4 实际请求证据边界复核（2026-09-10）

同一真实双线/复用 session_ad3d… 主代理 wire 263551 bytes，两个用户 prompt、
三个实际 tool.call/tool.result、12 条 llm.request 与5条成功 step.end。
初次委派前 messageCount 连续3次为3；复用前连续6次为9，最后为11。
这表明模型请求次数不能等同新增工具步骤或注入次数；没有证据把全部耗时算作
Research harness 开销。亦不能仅凭重复 messageCount 断言请求正文完全相同。
`llm.request` 只保存 systemPromptHash/toolsHash/messageCount/step 等元数据，
不包含完整输入。因此这份 wire 足以检查工具执行和请求次数，但不足以单独完成
system/Skill/Goal/Plan/Todo/Research/AITP/压缩输入的完整来源去重验收。
下一步需结合实际 context 构造/注入路径或受控请求捕获，不新增科学任务来猜测。

进一步读取实际 wire 的 origin：main 两个 user、一次 aitp_skill_visibility
（序列化 content 1226字符）、一次 aitp_research（5365字符）；未观察到第二个
Research 提醒追加。三个子代理只有 system_trigger，未复制 main 的 Research
提醒；每个 profile 的 systemPrompt 为21313字符，属于请求基座而非每次追加。
这些字符数包含序列化标记，不是 token 数或全请求体去重证明。
源码 contextInjector 在每步按 retained disclosure 判断，compaction splice 后重注入；
Goal injector 已只在任务语义改变时重发正文，Research 提醒不重发 Goal 正文。

静态指导中重复的直接执行/规划/记忆段落已精简，保留 native/fallback 所有权、
正确 workstream、无变化零写、checkpoint 恢复而非重复写、Notes/蒸馏入口与人类权限。
同时将“resolve pending gates”改为只记录 explicit human answer，避免误读为自动决策。
第一次 presenter 回归38/41：两项要求旧Action短语，一项要求native/fallback所有权
短语。第二轮39/41提示仍需明确“never invent human approval”；保留此边界后
最终41/41通过（4.98s），包括实际注入链的连续 turn 去重和缺失 disclosure 恢复。
没有删测试或削弱恢复要求。测试有既有DI缺依赖警告；新源码尚未重载实测。

## G4 其余上下文来源核对（2026-09-10）

PlanModeInjection 按 active/path disclosure 去重，模式退出发一次退出提醒；它不
自动复制 AITP Note 正文。TodoListReminder 只在有未完成项且满足10轮陈旧条件时
提醒，保留的相同正文不会再发。SkillVisibility 只决定可见目录，不等于加载正文；
显式 Skill 激活由 skillService 写入带 skill_activation 来源的用户/steer 消息，
不能为了去重吞掉用户主动重载或变参调用。
compactionHandoff 保留真实用户输入，丢弃旧 injection；被丢的提醒由各 provider
在下一请求前根据状态重建。模型总结是否保存全部科学细节仍需真实恢复验证，
不由此结构代码证明。Plan/Todo/SkillVisibility 三文件24 passed（6.39s），含
实际请求中单份提醒及压缩恢复的测试；既有DI警告保留。

G3 工具回执审查发现 RequestResearchDecision 仍指导
“then resume with RecordResearchProgress or a new action”。已替换为只等待依赖工作、
独立工作按正常权限继续、显式人类答复通过 ResolveResearchDecision 记录，不为恢复
制造新 Action。此处不改人类决定状态，也不自动回答。新增回执边界断言。

## G4 刷新去重源码验证（2026-09-10）

已将 turn-end 刷新条件由 Research revision/action 变化改成 scoped receipt
缺失、过期或归属不符。ready 视图最多复用 30 秒；未来时间戳和 degraded
视图不复用。未绑定工作线仍复用零 I/O 的 unavailable 结果。
Entry/Note adapter save 尝试开始和结束均通知 session coordinator 失效，
包括失败或回执未知；不以此声称外部写入有实时监听。

本次 service/ops 827 tests passed（单 worker，3.80 秒）。新增覆盖本地 revision
改变不额外读库、无本地变化但缓存失效仍刷新，以及时间边界。
后续新增 adapter 成功/未知回执通知测试，以及通过 DI 实例化真实 coordinator
的竞争测试：保存开始、结束两次失效后，之前和期间发起的迟到读取均返回
stale_generation，不发出更新、不填回缓存；保存后新读可恢复 ready。
真实模型和最终安装尚未验收。

G2 定向追踪确认旧 `prepareResearchPlanV2` API 仍要求 Goal/Program alignment，
但当前 `researchTools.ts` 已不提供该模型工具。不能把“移除模型工具”说成
“旧 API 可创建无 Goal 计划”；长期路线的 Note 路径与旧 API 的兼容处置仍需核验。

2026-09-09，进行中。不是完成报告，不以本页替代 L0–L7 验收。

## 隔离与版本

- 源码 checkout：`.tmp/pr-9-auto-subagent-preset-merge`，基线 HEAD
  `cdf5f1638430751d19f8e3bcde71d508a74e8739` 加当前未提交修改。
- 用户 daemon 58629 启动于 2026-09-07，本次不重启、不用于证明新代码。
- 本次通过 `tsx` 的开发入口加载源码，独立 localhost:58641、独立 home 和令牌，
  路径 `/tmp/hakimi-lean-live-DMlkiR`。这是源码运行，不是发布包重装验收。
- 临时配置从现有配置复制，保留 gpt_relay preset，仅临时副本的 default_model
  改为 openai-relay/gpt-5.6-sol。原配置默认 managed OAuth 在隔离 home 中没有
  凭据，首次 prompt 提交被拒绝；未复制 OAuth、未改用户配置或全局权限。
- AITP 与 theory-physics 加载当前源码插件路径；Research adapter 实测 ready，
  contract 0.2、plugin 0.9.0、Python python3.12。

## R0：最小真实模型通路

Session：`session_24454fbf-8aef-41be-a35b-636ec23439c5`。
Prompt：不使用工具、不创建 Goal，只回答 `relay ready`。

- 完成，准确返回指定文本，1 个模型 step，0 工具调用。
- provider usage：inputOther 25311、output 6；first-token 8610 ms，stream 295 ms。
- wire 中 profile.bind 的 systemPrompt 为 21654 字符；llm.tools_snapshot 共
  30 个工具，JSON.stringify 长度 79065 字符。字符不是精确 token。
- 最大工具快照项：Agent 7663、CronCreate 6730、Bash 6386、Grep 4370 字符。
  这些包括必要工具契约，不能统称冗余；仍需识别重复说明及可按需加载内容。
- wire 的 request 记录含模型/工具标识、messageCount 等，并非完整网络请求体。
  上述快照与 provider usage 不足以证明完整请求去重或网络延迟归因。

## R1：Research Mode 中 GW 只读恢复（已返回，未整体通过）

Session：`session_c35a25b1-15a5-44b6-80d7-03f485410a88`。
工作区 `/home/bhjia/physics/GW_librpa`，问题限于显式 `qsgw-headwing` 线。
只要求最近记录支持的结论、关键未知、实际读过的记录位置，约 400 字；禁止
SSH、计算、文件/记录写入、Goal、action 创建/结束、切线/确认绑定和子 agent。

新隔离会话通过公开 API 进入 Research Mode 后 ready/idle；未恢复原会话。
首模型 step 成功加载 using-aitp，inputOther 43191、output 124，首 token
30829 ms。最终报告、读取调用与零写核验待收集，不能计为通过。

实测失败路径（保留，不以之后成功抹去）：

1. 模型选 Bash 执行 enter/list，并猜错 launcher 为仓库根 `scripts/aitp.py`。
   两个命令均被 `no in-progress ResearchAction owns this work` 拒绝，未执行。
   Grep 同批成功，说明普通读取豁免生效，但 AITP 入口引导仍不顺畅。
2. 模型随后改用原生 aitp_enter，需正常审批；监督仅批准指定 qsgw-headwing
   只读操作及随后 exact Entry ID 的 aitp_show，没有提高 permission mode。
3. 第二模型 step 首 token 104257 ms，stream 12437 ms；明显等待在工具结果前
   已发生，不能全归因于 Research 状态检查。审批时间另算，不假称模型思考耗时。

下一修复应优先统一原生 adapter 与外部 Skill 的读取入口提示，不增加第二套
CLI parser，不为绕过错误命令放开任意 Bash；还需评估正常只读审批体验。

原始 wire 保留在临时 home 的 sessions/<workspace>/<session>/agents/main/。
临时目录含私人配置和会话数据，不纳入 Git，不发布其凭据或全文。

最终返回：约 460778 ms，5 个模型 step、11 个工具调用，2 个 Bash 拒绝。
实际调用：Skill、Bash×2、Grep、aitp_enter、Read、aitp_show×5；无执行
写入/远端/Goal/action 工具。未预存完整文件基线，所以不把无写工具轨迹声称为
科学目录逐字节零变化证明。所有原会话未触及。
first-token 合计 168015 ms，stream 合计 30326 ms；provider inputOther 合计
189927，cacheRead 35328。后续累计输入含历史重传，不等于新增重复 token。
多条原生读取逐次审批；剩余耗时不能在未提取审批时戳前全部归为审批。

答案正确区分历史 nfreq=6 HR 导出失败和目标 nfreq=16、定向回归与生产物理
验证、构建完成与 consumer pending 的历史快照。引用最新 Note 与五条 Entry，
没有声称已做实时查询。独立逐项核实科学表述仍待完成，不计全部真实验收通过。

根据失败轨迹修改 AITP kimi.plugin.json 的既有 Skill wrapper：优先原生读取，
不重复 CLI；后备 launcher 从加载 Skill 的 dir 解析，拒绝不授权 Bash 绕过。
同步 contract 描述与双方 handoff，9 项 adapter contract 测试通过。
这是源文件变化；运行进程可能持有旧插件内容，需新加载后复测，不能以同会话
原结果证明修复有效。

## R2：新加载入口的同题复测

Session：`session_4565c82e-3ad9-4e3c-b0b3-19293791cbac`。只重启确认 idle 的
隔离 58641 服务，未动用户 daemon。相同 prompt、模型、研究工作区。

- 新 wrapper 已在实际 `context.append_message` 的 loaded Skill 中核实。
- completed，75956 ms，5 个模型 step、11 工具调用，0 错误。
- Skill → aitp_list → aitp_show×4 → Grep/Read×4；没有 Bash、action、Goal、
  写入或远端操作。五次读取审批均由有限只读匹配器批准，等待各约 0.4–1 秒。
- provider inputOther 61198、cacheRead 148480；first-token 合计 44504 ms，
  stream 合计 24248 ms。与 R1 缓存、模型延迟和审批响应均不同，不作因果速度
  优势声明；模型往返和工具总数并未减少，主要确认错误入口不再出现。
- .aitp 下 1439 个文件的路径、大小、mtime、ctime 前后相同；不是字节哈希
  审计，也不是全科研目录快照。无写入调用的实际轨迹一并保留。
- 回答保留 nfreq=6/16 区别、HR imaginary residual 非 Hermiticity residual、
  历史 pending 非实时状态、回归非生产验收等限制。仍比约 400 字请求偏长。

之后的源码审批修复尚不属于 R2：四个原生只读工具加入现有默认低风险列表，
显式 deny/ask 优先，写入和未知 MCP 不加入。60 项政策测试通过；真实无审批
验收须重载后单独进行，不能回填为 R2 的效果。

## R3：原生读取免重复审批

重启已 idle 的隔离源码服务后，新建
`session_472109a2-2457-4a42-bf40-d2cd36fe9999`。这是定向工具许可测试，
明确要求 enter/list/show/check 各一次，不是普通科研每轮的推荐清单。

- 27226 ms，2 模型 step，4 工具调用，零错误、零 wire approval 事件。
  本次没有运行监督审批命令，没有设置 auto/yolo 或用户规则。
- 最终 mode ready、phase orienting，Goal/action/checkpoint 均无，pending
  approvals 0；1439 个 AITP 文件的路径、大小、mtime、ctime 仍与 R2 前一致。
- 原生 check 返回 findings，模型没有把它当命令失败，也没有修 pins 或清理
  警告；正确描述所问 Entry 为历史 pending 非实时状态。
- 回答将另一 Entry 的 pin mismatch 描述成“限制账本整体可信度”略宽泛，
  后续应更精确限定受影响证据；不能因此声称全库科学结论不可信。
- first-token 合计 20036 ms。这是窄许可测试，不与 R1/R2 的完整回忆耗时
  作直接速度比较。权限单测另覆盖显式 deny/ask 优先和写入/MCP 不获此豁免。

## R4：HS 三方向只读协作，嵌套未通过

隔离会话 `session_b19d7385-60d8-48d9-bb1b-f51c08d3b7de`，新建三条本地
Research Line：hs-otoc、hs-krylov、hs-algebra；不确认 AITP binding、不创建
Goal/action、不写科学记录。实际三个子代理分别保存 research-line 对应归属，
同一 batch 的三次 foreground Agent 成功启动，实际子模型为 relay Terra。
最终 busy=false、mode ready、phase orienting，Goal/action/checkpoint 均为空，
pending approvals=0。9880 个 AITP 文件的路径、大小、mtime、ctime 前后一致；
不是全目录字节级或科学有效性审计。

OTOC/Krylov/代数三线均返回来源、关键未知和最小检验建议，未执行数值验证。
主代理没有混同三条任务标签，但独立逐条核验这些科学概括仍待完成。

2026-09-10 定向复核补证：重读上述真实 wire 的可见回答，并仅对照它们
引用的 TOPIC.md、note-bb2d5c574c01483d95c85e7db173ce95 和
entry-b92152ac285b48bb804f4afe1f46d6bf；未写原课题、未复算数据或哈希。

- OTOC：Note 59–65、73、80–90 行直接支持固定 S/family 的有限尺寸谱描述、
  Node F 无 OTOC archive、不能由谱图推出混沌/可积，以及先小尺寸 anchor
  再三路线对账。摘要未把该方向建议说成已经运行。
- Krylov：Entry 25、40、48 行支持投影掉精确/慢代数、记忆输运与统计独立
  区分、预复现时间窗及随 L/operator order 收敛。回答所提“至少三个 L>=6”
  来自 TOPIC 的 Stage I 趋势要求（75–76 行），不是此 Entry 明定的 Krylov
  验收合同；只能算代理的下一步建议，不能当作检索出的专属冻结要求。
- 代数：TOPIC 69–83 行支持 L=4,5,6 的 RTT/Serre 与 B1 锚记录，以及 L=4,5
  的退化限制。回答已声明未查 HDF5/原始审计，故这里只验证记忆恢复忠实度，
  不独立证明所述数值正确性，也不凭旧 Stage 0/Stages I–VI 文本判定整个
  项目今天的进度。

这是补齐 R4 科学概括来源检查，不是新科研结果或最新部署版模型复测。
有限尺寸结论、建议和真正已执行证据仍须在最终汇报中分开。

本次必须保留的失败：

- 试验要求 coder 再委派 explore，但内置 CODER_TOOLS 不含 Agent。实际无
  孙代理，不能把主代理三方向并行当作嵌套验收。
- main 首次补派 resume 漏 description，schema 拒绝；补齐后仍未带 task_scope，
  Research guard 未按目标已保存归属处理，报 no in-progress ResearchAction。
- coder 与 OTOC 的初始短答引发额外摘要扩写。源码 DEFAULT_SUMMARY_POLICY
  的 minChars=200、retries=1 与本次中文短答要求冲突；扩写不是新的科研进展。
- Krylov 使用 `.aitp/topic/**/*` 宽 Glob；测试提示自身指向整个 topic，因此
  暂不能单独归因于内置提示。后续按需读取入口和真实请求体还需继续审计。

根据这次轨迹，源码删除内置 coder/explore 的默认字数重试，保留自定义 profile
显式 summaryPolicy；新增短答只调用一次模型的测试和两 profile 无重试断言。
9 项定向测试通过。没有修改叶子工具权限，没有伪造嵌套成功；新代码尚未重载
实测或安装到用户运行环境。R4 只证明明确归属的一级委派可行，不证明 L5 完成。

## R5：同一子代理冷恢复及短答验证

沿用 R4 的 session/agent-2，不建立替代科学任务。仅在全部隔离会话 idle 后
重启源码服务，用户正常 daemon 未动。首轮已越过旧 Action 门禁，但实际报
`Agent instance "agent-2" does not exist`：Agent tool 只调用 lifecycle.get，
没有恢复持久化元数据中仍存在的代理。该失败保留于 turn 1。

修复：在 live handle 缺失时先核实已保存 subagent/parent 身份，再调用现有
lifecycle.create({agentId, labels, forkedFrom}) 的 wire.restore 路径，随后重验
idle/ownership；不为缺失元数据或其他 parent 的 ID 创建代理。task_scope 仍取
原元数据，显式改派继续拒绝。工具回执 resume 示例同时补齐必填 description。

第二次重载后的 turn 2，模型未调用工具而沿用旧错误；不能当作接口失败或
恢复通过。明确告知测试服务已更新后，turn 3 实际 Agent(resume="agent-2")
成功，回执保留 coder、research-line:hs-algebra，完成短答，未调用子工具：

> 代数恒等式不保证与H对易；近守恒不决定谱统计；GOE/Poisson亦不证明代数结构。未做新检验。

该子代理新 turn 2 仅一个模型 step，inputOther 1845、cacheRead 17920、output
42，first-token 8962 ms、stream 947 ms；没有再为短答追加扩写 turn。最终
session completed，Goal/action/checkpoint 为空、审批为零，9880 个 AITP 文件
元数据仍不变。不是新科学结论或整套嵌套协作验收。

确定性结果：Research service 694 项；Agent 恢复/归属相关 30 项（包含缺失、
其他 parent、非 subagent 的冷恢复负例）；typecheck、lint:imports（1301 个
源文件）和 diff check 通过。测试安装仍为隔离源码服务，非用户本地重装。

## R6：复用现有 profile 的两层只读委派

R4 的 coder 是叶子工具集，不为让测试通过而给它增加 Agent。改用已经允许
Agent 的通用 `agent` profile 做协调层，其实际工具权限未扩展；这里的只读
任务边界是给模型的约束，不声称 OS sandbox 或所有暴露工具均已移除。

同一 HS 隔离会话于 07:25:04 UTC 开始一次有限测试：main 只委派 agent-3，
task_scope=research-line:hs-algebra；agent-3 只委派一个 explore agent-4，省略
task_scope。持久化元数据实际为：

```text
main
└─ agent-3  parent=main     scope=research-line:hs-algebra
   └─ agent-4  parent=agent-3  scope=research-line:hs-algebra
```

实际工具：main Agent 一次；agent-3 Agent 一次；agent-4 Read TOPIC.md 一次。
无其他子工具、科研写入或 Action/Goal。agent-3 和 agent-4 各两模型 step，
没有默认短摘要扩写；主代理最终返回两个 ID 及相同归属。9880 个 AITP 文件
元数据仍不变。该结果补足一例真实嵌套继承，不证明未知 Line 拒绝、嵌套改派
或并发写入安全，也不证明 Board 可显示整棵树。

模型测量：agent-3 首 step inputOther 17867，第二 step 1145/cacheRead 16896；
first-token 分别 5084/7206 ms。agent-4 两 step inputOther 6808/9663，各
cacheRead 3584，first-token 3577/2412 ms。不能把总输入当新增重复量：其中
包括工具定义、历史及 TOPIC 内容。协调层首次输入仍较大，需继续按来源审计。

展示链路定向审查：ConversationPane 未给 ResearchBoardPanel 传 tasks，后者
仅接 snapshot；TaskItem 有 taskScope 但缺 agentId/parentAgentId；REST tasks
读取主代理 IAgentTaskService。因此当前不能由 Board 中方向标题推断嵌套树已
实现。下一步需要真实任务身份及父级投影、冷刷新保留，然后接入 Board 展示。

### R6 后续：Board 展示投影验证（不计作新科研实验）

已接通 persisted agent relationships 与当前会话任务 → Web store → Board。
默认折叠的协作树按父级缩进，浏览其他 Line 仅筛选显示。历史关系不带任务
状态时显示 unknown；不能把 agent 存在解释为运行中或科学问题已完成。

浏览器直接挂载生产 ResearchBoard 组件，在浅色、深色测试三代理/两方向
fixture：切至另一 Line 不出现原 Line 节点；返回执行总览显示嵌套节点；
展开/收起及 hover/focus 正常，原 snapshot 不变，零 API 修改调用。截图经
人工视觉检查，页面无 JS error。测试脚本与截图保留于隔离临时目录；不含
真实研究数据或凭据。该检查不代替完整 App 实际服务的冷恢复验证。

## R7：真实会话冷恢复到完整打包 Web

确认隔离服务五个会话均 busy=false 后，仅重启该服务。HS 真实测试会话的
snapshot 返回五个 agent_relationships，包含 main→agent-3→agent-4；OTOC、
Krylov、algebra 标签均保留，subagents 为空（无当前任务状态）。

用本次 canonical build 的完整 App 打开该会话，经过首次偏好引导并点击
Research board 入口：五节点显示、孙代理缩进、未知任务状态、algebra 浏览
排除 OTOC/Krylov、页面 reload 后恢复均通过，无页面 JS error。
未向模型发送新 prompt，Goal/action/checkpoint 仍为空、审批为零；9880 个
AITP 文件元数据与基线一致。未重装用户环境，未触碰正常 daemon。

保留测试失败：首轮忘记打开默认收起的面板，第二轮首次偏好对话框拦截点击；
均是测试入口遗漏。补上真实 UI 操作后通过，没有强制点击或移除产品遮罩。
视觉审查仍发现：缺任务描述时 ID 重复显示，当前循环可能露出内部
turn.started auto-advance。后续展示需精简，不能把本次通过当作 L6 全完成。

R7 展示修复：compact cycle 不再拿 recentStateChange 摘要充当科学进展；
无 run/action/progress/question 时退到当前 Line，无 Line 则留空。结构迁移
仍保留在展开详情，不通过字符串黑名单猜科学语义。任务描述退为 agent ID
时，下方身份行不再重复同一个 ID。152 项定向测试及 Web typecheck 通过。
组件浅色/深色与完整打包 App 冷恢复复测通过；521 个 Web 资产重建一致。

L6 后续边界审查发现：Klient agentTaskInfoSchema 的 agent 分支尚缺
taskScope/parentAgentId；SDK listBackgroundTasks 走该 facade，公开类型仍
re-export 旧 core BackgroundTaskInfo。不能以 REST/Web 已显示归属推断这两条
客户端链路完整，需补充字段保留测试及兼容的公开类型。

已补 Klient 两字段，12 项契约测试通过（包括 JSON 往返、旧任务、错误类型）；
Klient typecheck 与 examples typecheck 通过。SDK 扩展旧 agent 任务类型的
可选字段，不修改旧 core runtime；6 项 background-task 测试通过。尚不能把
这些 schema/type 测试称作 IPC 与 memory 两种 transport 的端到端保留证明。

## Lightweight redesign: Board browser verification (2026-09-10)

源码移除 action/phase 对通用工具的执行许可后，Board 不再自行把 local conclusion
或 stranded action 改写成必须先操作 Manager 的下一步。记忆提醒仍保留，不自动
提交、删除记录或替人作决定。本次源码服务及提示回归、Web 逻辑回归与 UI fixture
不是原科研会话的端到端科学验收。

- Research feature 目录回归：990 passed；Web 全量：1118 passed。
- Web typecheck 与 diff check 通过。规范构建后，521 个资产二次重建一致。
- 原有发布资产逐文件核对清单后完整备份到 `/tmp/hakimi-web-before-lean-DxdU8G`；
  未清理其他 dirty changes，未 commit/push，未安装或重启用户服务。
- 浏览器首轮因默认缓存没有 Chromium 启动失败；改用已有隔离 browser/runtime libs
  后通过，未下载浏览器。复测并非首次即成功。
- `test/browser/research-panel/check.mjs`：展开/收起、Escape 焦点、无 composer 位移、
  更新、滚动、预览共存、会话切换清空旧面板、移动布局通过。截图及报告：
  `/tmp/hakimi-research-panel-q9ptdg`。人工查看桌面与移动截图，科研下一步和本地
  记忆提醒并列。Research 深空主题仍覆盖普通 light/dark 背景；不能称两套外观。
- `test/browser/research-panel/app.mjs`：完整 App fixture 的六会话发现、跳转、模式
  开关、失败保持原状态、输入保留和移动入口通过；报告 `/tmp/hakimi-research-app-uLwpaz`。
  请求限制在 localhost fixture，科研后端被屏蔽，没有新增远端作业。
- 未完成：真实安装产物的模型科研读写/召回、多线嵌套协作验收；Note 保存尚缺原子
  expected Topic/exact workstream 契约，该协议扩展待用户授权，不宣称可发布。

## Lightweight redesign: generic Goal integration (2026-09-10)

- `test/agent/goal`：245 passed、0 failed、0 pending，单 worker、Node heap 上限
  2048 MB；报告 `/tmp/hakimi-light-generic-goal-r3.json`。
- 初次回归 241 passed / 4 failed，均为旧 Research 全局 hold 语义断言；第二次
  244 passed / 1 failed，剩余为 Program 缺失投影的旧 `blocked` 断言。
  最终测试明确验证 Program 缺失仍可 continuation/completion、Research loop 暂停
  不暂停 Goal、loop 恢复及重复 ready 通知不重复启动 continuation。
- 真实 unresolved human gate 与 Plan Mode 的既有限制测试保留并通过。
  此结果不证明历史 human gate 的跨线归属处理完整，相关审查仍待完成。
- 本轮修改仅 Goal 集成测试与本验收记录；未安装、未提交、未运行生产科研。

## Lightweight redesign: remove obsolete capability machinery (2026-09-10)

- 定向引用审查确认旧 `isResearchShellObservation`、`researchCapabilityGranted`、
  recorded-knowledge inspection 与 observation 分类函数已无生产调用；删除这些
  有限 Bash 白名单及 capability/alias 映射，普通工具仅保留 work 路由类别。
  Research 的控制操作与记录/Note 保存路由保留，正常权限系统不变。
- Research 目录 914 passed / 0 failed / 0 pending；报告
  `/tmp/hakimi-light-no-capabilities-r1.json`。旧 990 项中的失效白名单测试已替换，
  不把减少的计数称作新增覆盖；实际 executor 服务测试仍验证普通工作不依赖 action。
- human gate 审查发现：Board 有当前线筛选，但 Goal 使用会话级未解决 gate，且
  gate 没有显式 Goal 归属。仅凭 UI 当前线不同不足以证明与总体 Goal 无关，故本轮
  不自动丢弃、解决或豁免该人类决定；归属设计仍需继续审查。
- 未安装或操作真实生产会话；Note 原子 scope 保存缺口仍待协议授权。

## Lightweight redesign: Plan completion and memory independence (2026-09-10)

- 移除 Research Plan v2 完成操作对 pending checkpoint 的全局拒绝。回归明确验证
  plan 完成后 pending checkpoint 和 Question 原样保留，Goal 仍 active；不意味着
  AITP 保存成功，也不丢弃未保存内容。
- 服务测试 701 passed / 0 failed / 0 pending：
  `/tmp/hakimi-light-plan-memory-r1.json`。中英文 README 的 alignment/Goal 说明
  同步当前源码语义；安装与真实验收仍未完成。
- 规划审查仍有缺口：Research Plan v2 schema 必填 Goal/Program/relation，不能靠
  填入虚构身份让无 Goal 对话生成这种规划；live action 绑定也仍限制更新。
  后续需完整协调规划数据模型及跨端兼容，不把本次移除单个拒绝称作规划重构完成。

## Lightweight redesign: editable plans with historical attempt attribution (2026-09-10)

- 移除 live action 对 Research Plan v2 修订、状态变更的冻结。旧 action 捕获的
  plan revision 原样保留，不自动绑定新里程碑或宣布 action 完成。
- Conclude 的 no_durable_delta 路径可以总结旧规划下的尝试；durable_delta 仍检查
  captured plan/context freshness，防止将旧证据假冒为当前规划的结果。
- 服务回归 702 passed / 0 failed / 0 pending：
  `/tmp/hakimi-light-plan-revision-r2.json`。包括实际 prepare API 修订 in-progress
  action 的规划、保留原绑定、显式无新增证据放弃，以及 stale durable claim 拒绝。
- 不改变人类决定或记录 scope 契约。无 Goal/Program 的规划数据模型仍未完成；
  未安装、未提交、未发生产科研任务。

## Lightweight redesign: cross-client regression and coverage audit (2026-09-10)

- 串行单 worker 复测：kap-server `test/research.test.ts` 32 passed；protocol
  `src/__tests__/research.test.ts` 46 passed；Klient `test/contract.test.ts`
  结果见 `/tmp/hakimi-light-klient-contract-r1.json`。前两报告分别为
  `/tmp/hakimi-light-server-research-r1.json`、`/tmp/hakimi-light-protocol-research-r1.json`。
- 服务端覆盖 Research REST 命令分发、旧 snapshot、WS schema 与 run 冷恢复；
  不能由这些结果推断全部模型科研任务通过。SDK background-task 测试中的归属用例
  只证明可选字段类型，不证明真实 Agent 结果在 IPC/memory transport 中保留归属。
  该端到端缺口仍需补证，未算多线真实验收完成。
- 已请求 Research Plan 非绑定结构及 AITP Note 原子 scope 保存的协议授权，尚无
  明确回复；本轮不修改两项协议、不安装，不向旧科研会话发送任务。

## Lightweight redesign: task list truncation found through SDK (2026-09-10)

- 新增真实 v2 engine/task service → Klient memory → SDK 测试，登记两个有不同
  taskScope/parentAgentId 的确定性 fixture 任务，不调用模型或科研计算。
- 首轮默认 5 秒超时；30 秒诊断运行实际在约 5.2 秒失败：第二条任务缺失。
  原因是 facade 将缺省 limit 放进参数数组，JSON 将 undefined 变为 null，
  task service 的数量比较因此在第一项就提前返回。
- 修复 facade：不提供 limit 时省略第二个参数。复测通过（任务执行约 4.6 秒，
  总计含导入约 13.8 秒；该引擎集成用例显式 15 秒上限）。验证两条归属、各自输出、
  activeOnly 过滤及显式 limit=1；不是首次成功，也不证明模型实际嵌套委派正确。
- facade/contract 66 passed：`/tmp/hakimi-light-task-facade-r2.json`；首轮新增
  facade 用例因 FakeChannel 缺返回值失败，补空数组后复测通过。SDK 其余 61 个
  文件级用例本次未运行，IPC transport 仍待验收。
- 修改 Klient facade、facade 测试、SDK v2 集成测试与本记录；未改 AITP、未安装。

## Lightweight redesign: shared IPC/memory task conformance (2026-09-10)

- 新增同一共享用例，经真实引擎任务服务和两种 transport 验证双任务列表、
  taskScope/parentAgentId、对应输出、显式 limit、activeOnly。定向两项通过：
  `/tmp/hakimi-light-task-transports-r1.json`，其余 50 项未在定向运行中执行。
- 首次完整运行 46 passed / 6 failed；新增用例使用 process.cwd() 提前物化 workspace
  干扰后续名称断言，已改独立临时目录。第二次完整运行 48 passed / 4 failed：
  `/tmp/hakimi-light-transports-full-r2.json`，单 worker、15 秒单例上限。
- 仍失败：两种 transport 的 workspace Skill 发现及 local conclusion 往返。
  后者单独 memory 运行约 4.9 秒通过，但整套 15 秒上限仍失败，不能简单归为默认
  timeout，更不能宣称全绿。共享状态/资源干扰待诊断；不修改无关 Skill 断言凑数。
- 本轮只修改共享 conformance 测试和本记录，未修改协议、未安装、未运行模型科研。

## Transport-suite failure localization (2026-09-10)

- 普通 reporter 确认完整 memory 的 local conclusion 失败为 15 秒 timeout，非
  结论结构断言；Skill 仍为 conf-skill 不在列表中，未修改其期望值。
- 缩小顺序复现：commands + local conclusion 两项通过，后者约 4.4 秒；
  provider/config 更新 + local conclusion 四项通过，后者约 4.3 秒。
- task ownership + Skill + local conclusion 三项组合中，任务约 4.4 秒通过，
  Skill 约 8.0 秒后失败，local conclusion 约 11.9 秒通过。与独立运行及完整套件
  比较提示共享引擎/会话数量相关的累积延迟，但尚未定位具体耗时函数，不能宣称根因。
- 下一步定向计时 session 创建、mode enter/probe、结论往返与 session close，
  区分引擎生命周期开销与 AITP 调用；不再把提高 timeout 当修复。

## Research entry timing localization (2026-09-10)

- 为 local-conclusion conformance 用例加入只含阶段/transport/耗时的结构化计时。
  整套 memory 观察 session-create 653 ms、mode-enter 18068 ms，未到 action 即超时。
- 三用例组合再次细分：session-create 409 ms、main-agent-ready 275 ms、mode-enter
  12819 ms、action-start 3 ms、conclude 3 ms、roundtrip 6 ms、close 3 ms。
  由此将慢路径定位到 Research entry 而非结论保存/往返，尚未定位到具体子调用。
- `SessionAitpAdapterService.resolveIdentityFromCatalog` 首先等待 skillCatalog.ready；
  `SessionSkillCatalogService.ready` 来自 workspace seed data.ready。后续沿该等待链
  检查，不预判 Python/ledger 导致慢。Skill 发现失败仍未修复，完整验收不通过。

## Resolved: temporary workspace inherited host /tmp repository (2026-09-10)

- 再细分计时证明 skillCatalog.ready 耗时 12839 ms，随后 mode-enter 11 ms。
  临时来源计时定位 WorkspaceRootSkillSource.load：约 4.9/9.0/13.3 秒；Plugin
  0–1 ms、User 数十 ms。临时来源 spies 已移除，保留用例阶段计时。
- 实机 `/tmp/.git` 存在（目录，Aug 31）；`.git` 向上查找令无自身标记的临时
  workspace 继承 /tmp，贡献 roots=[]，无法发现 fixture Skill，并扩大监听范围。
  没有删除/改动宿主 /tmp/.git。三个 Skill-sensitive 测试目录及 SDK 任务目录
  明确建立自己的 .git 标记，仅作为隔离 fixture，不改变产品根目录语义。
- 默认 timeout、单 worker 完整 IPC/memory 回归 52 passed / 0 failed / 0 pending：
  `/tmp/hakimi-light-transports-isolated-r1.json`。Research entry 分别约 63/59 ms；
  Skill 原断言通过，未弱化验证。此前“共享引擎累积延迟”推测由该具体环境原因取代。
- 这证明隔离 fixture 的 transport/Research 操作正常，不是生产性能基准或完整模型
  科研验收。协议授权、安装及真实科研验收仍待完成。

## Full Research regression and description audit (2026-09-10)

- 当前 Research feature 回归：915 passed / 0 failed / 0 pending，单 worker、
  Node heap 上限 2048 MB；结果 `/tmp/hakimi-light-research-full-r4.json`。
  第一次命令用了当前 Vitest 4 不支持的 `--minWorkers`，测试未启动；移除该参数后
  使用 `--maxWorkers=1` 完整执行。此次结果包含最近的 Plan revision 改动，
  不代表完整跨端或真实模型科研验收。
- 提示审查发现 `aitp_record_save` 描述只解释 checkpoint 路径，而执行代码在
  无 checkpoint_id 时也读取 direct draft 的 captured scope。这是直接记录路径的
  文档缺口，后续应同步模型描述及 adapter contract，而非重新要求 Begin/Conclude。
- 尚未改动 AITP runtime/schema；未安装、提交或推送。无 Goal/Program 的 Plan
  表示与 Note 原子 scoped save 仍待明确协议授权。

## Direct recording prompt synchronized (2026-09-10)

- Hakimi `aitp_record_save` 明确直接记录无需 Research Action/checkpoint、使用准备
  草稿时捕获的 Topic/单一 workstream；仅 checkpoint 路径额外保留其 baseline/receipt。
  不为每次中间查询生成记录。实际保存分支与此描述一致。
- AITP contract、README、Hakimi compatibility handoff 同步解释既有 paired flags
  同样适用于直接 Entry，没有新增 CLI/schema/runtime；Note 原子保存能力仍未实现。
  保留这几个文件原有 dirty 内容，仅作定向补充。
- Hakimi 直接记录测试 1 passed / 701 未选中：
  `/tmp/hakimi-direct-description-r1.json`；验证无 action/checkpoint 的成功保存、
  错误 workstream、未准备草稿、undo 后拒绝保存和重新准备，以及新增提示断言。
- AITP adapter contract 9 passed；完整 `tests/ledger` 195 passed in 40.24s。
  首次通用 Python 3.12 缺 pytest，随后使用现有 `.venv/bin/python`，未安装依赖。
  两仓库 `git diff --check` 通过。尚未重新安装，不代表模型真实科研验收。

## Late direct prepare after undo (2026-09-10)

- 发现并先复现：capture scope → undo → late prepare reply 的研究线/绑定值可以
  完全相同；仅清空已登记 drafts 不足，旧响应能够重新登记。新增断言在修复前
  确实失败（expected function to throw），证据 `/tmp/hakimi-direct-prepare-undo-before.json`。
- 增加进程内弱引用 capture 身份集合，exit/restore/undo 清空登记并替换身份集合；
  remember 同时验证捕获身份及现有绑定。无公共 schema 改动，不影响普通工具，
  不删除草稿，不撤回已存 AITP 事实；新 prepare 可重新登记。
- 修复后完整 Research service 702 passed / 0 failed / 0 pending：
  `/tmp/hakimi-direct-prepare-undo-after.json`；typecheck、lint:imports (1301 files)
  及 diff check 通过。该测试直接覆盖 undo 间隙；exit/restore 使用同一清理函数，
  但不能据此声称已完成真实进程恢复或全部并发保存验收。

## Async tool regression and TUI next step (2026-09-10)

- 通过 DI tool resolveExecution 路径挂起 adapter.recordPrepare，确认已进入等待后
  发布 undo，再释放结果：prepare 返回错误、旧 draft 不触发 save，重新 prepare/save
  可恢复。定向用例 1 passed / 701 未选中：`/tmp/hakimi-direct-prepare-tool-r1.json`。
  这是 stub adapter 的真实工具路径回归，不是实际 CLI/模型会话。
- TUI 五个 Research suites 原有 198/198 通过，却仍有测试要求 localConclusion
  覆盖科学下一步为 `/research adopt-conclusion`。移除该 UI 强制覆盖，并更新断言为
  显示已记录的科学下一步；Manager、记录归属提示及真实 Goal held 状态不变。
- 修改后同五套 198 passed / 0 failed：`/tmp/hakimi-lean-tui-research-r2.json`。
  未据此宣称 TUI 全部旧流程投影已清除：action/phase recovery 的本地优先投影与
  compact attention 仍需要继续审查。未安装或干扰用户 daemon。
- CLI 全包 typecheck 使用 2048 MB heap 在约 31 秒报告 V8 OOM，未通过；OOM 后
  PID 23953 仍占约 2.2 GB，宿主可用约 6.9 GB、swap 基本满。仅对这个已确认由本轮
  启动的检查进程发送 TERM，未启动并行重试、未提高内存上限。此失败与通过的 TUI
  测试分别记录，不能将包类型检查标绿。
- TERM 后同 PID 仍存活；再次确认身份后 KILL，工具句柄返回 exit 137，确认已退出。

## TUI legacy recovery is not the scientific next step (2026-09-10)

- compact 不再从旧 action/phase 冲突自行生成强制 recovery 下一步；旧 action 的
  blocked 投影不覆盖当前科学问题的 next。显示 Recorded action state 提醒，展开
  详情保留原始 effectiveNextStep/provenance，未删除历史、未自动完成或放弃 action。
- Board 93/93 通过：`/tmp/hakimi-lean-tui-board-r3.json`；包括旧状态与跨 Line
  过滤用例。真实 Goal held/人类 gate 的 UI 处理未在此次被改写。
- 确认上一 typecheck 进程终止、主机可用约 8 GB 后，无并行大任务地使用 3072 MB
  heap 重跑 CLI 全包 typecheck，通过（exit 0）。2 GB 的首次 OOM 仍保留记录。
  diff check 通过；未安装、未把单测当真实科研验收。

## TUI current-Line progress isolation (2026-09-10)

- TUI 的 compact current/next 及 expanded progress/evidence 原先直接读取全局
  latestProgress；localConclusion attention 也不检查归属。现在按可验证的 action
  归属筛选；多 Line 且旧进展缺归属时不将其冒充当前线，单线旧记录继续兼容。
  本地结论同时检查显式 Line 与已知 Question，冲突或多线无归属时不归入当前线。
- 新增 foreign-line / unscoped 两种 fixture，均覆盖 compact 与 expanded；保留
  科学 next，并排除其他线 headline、uncertainty、next 与错误的接纳提醒。
- 首次 Board 回归 94 passed / 1 failed：原“selected scientific detail”夹具含
  八条线、当前线不在列表内且 action 无归属；补为明确选中的 line-0，不弱化内容断言。
  随后五套 TUI Research 200/200：`/tmp/hakimi-tui-crossline-r2.json`。diff check 通过。
- 不宣称消除全部历史归属歧义：latestProgress schema 本身缺独立 Line 身份，当前
  采用保守展示；Web localConclusion 的同类旧条件还需同步审查。未改协议或科研数据。
- 此次修改后的 CLI 全包 typecheck 单独以 3072 MB heap 执行，通过（exit 0）。

## Web local-conclusion ownership parity (2026-09-10)

- Web current/actionStatus/attention 统一使用明确归属的 localConclusion；foreign Line、
  多线无归属、Line/Question 冲突不进入当前线科学摘要。不改变 canonical 记录或人类决策。
- 全 Web 逻辑测试 1120/1120：`/tmp/hakimi-web-local-scope-r4.json`；typecheck 通过。
  check:style exit 0 但 baseline 模式仍报告 28 项既有问题，所在组件本轮未改，非零告警。
- 旧 521 文件产物与 web-base.json 备份 `/tmp/hakimi-web-before-scope-zd4gva`，
  diff/cmp 确认复制一致。canonical build 与 --check 通过：521 files，source
  `65f9dadca20b64b7f9fe1fe5b8fc040e6a32e42cfb8cc2dafc7efac17091f6fd`；存在 >500kB chunk 警告。
- 浏览器首次和诊断重试均因旧相对测试模块路径返回 HTML 而 30s 超时；确认隔离
  Vite 实际 fixture root 后改用 /@fs 精确模块路径，浅/深色两场景通过，零 pageerror。
  `/tmp/hakimi-board-scope-RViNIB/report.json` 与 light/dark.png；已查看截图，当前
  科学 next 保留、没有 FOREIGN headline 或错误接纳提醒。仅本地 fixture，不是模型科研。
- 尚未安装或重启用户 daemon；协议扩展与完整真实会话验收仍未完成。

## Full SDK file verified (2026-09-10)

- 单 worker、2048 MB heap 完整 `packages/node-sdk/test/sdk-rpc-client-v2.test.ts`
  62 passed / 0 failed / 0 pending，exit 0：`/tmp/hakimi-sdk-full-lean-r1.json`。
  包含 task ownership、Research commands、checkpoint discard、Plan binding、human
  decision、Skill discovery 与 workspace MCP trust 等现有用例；不是整个 SDK 套件。
- 当前源码中的 Skill/MCP 用例已经使用 makeProjectRoot（自有 .git），本轮未修改它们。
  不再沿用此前这两个用例必失败的旧结论，也不将该通过归因于本轮产品修复。
- 最慢数项约 4.7 秒/用例，完整文件包含反复建会话；未作生产性能推断。测试过程
  句柄确认 exit 0，未因观察等待而重启测试。真实模型与安全隔离安装仍待完成。

## Isolated package installation (2026-09-10)

- 构建前备份 CLI dist/native/generated 与已有 vis dist-single 到
  `/tmp/hakimi-before-package-F1aFtn`；标准 `pnpm run build`（含 prebuild、Web、main、
  search worker、native copy、Web verification）单独以 3072 MB heap 执行，exit 0。
  generated/native 未产生额外 tracked diff，未触碰用户 daemon。
- 打包首次 `pnpm --ignore-scripts pack` 被 parser 拒绝，未产包；改用明确配置
  `pnpm --config.ignore-scripts=true pack`，因刚完成标准 build 不重复 prepack。
  包：`/tmp/hakimi-lean-installed-qL0BwM/bhjia-phys-hakimi-0.21.0.tgz`。
- 离线、非全局、禁 lifecycle、omit optional 安装到
  `/tmp/hakimi-lean-installed-qL0BwM/runtime`，npm exit 0。未改 PATH/日常安装，
  不执行旧 shim 迁移；缺可选 PTY 依赖，不据此宣称 PTY 验收。
- 安装版 main `--version`=0.21.0、`web --help` exit 0；cmp 主程序/search worker、
  diff -qr 全 Web 产物均一致。隔离 HAKIMI_HOME 为同根 `/home`。
  此为安装启动证据，尚非 daemon/model/科学验收；协议授权仍待明确回复。

## Installed daemon and relay smoke (2026-09-10)

- 新建隔离 home（权限 700、config 600），仅复制先前隔离实例配置及 plugin registry；
  未复制科研会话或更改全局配置。安装版 loopback daemon PID 5687、port 58649，
  独立进程句柄 89675；认证 token 仅由本地探针读取，未打印。API meta backend=v2。
- 测试 session `session_09bad3ef-744e-4590-99d3-503a087c2d90` 位于安装测试根；
  openai-relay/gpt-5.6-sol 仅一次无工具连通请求，prompt
  `msg_01M23RJM48Y6C3GDKZ9JHFFN1T`。先观察 busy=true，随后权威 session 状态
  busy=false / last_turn_reason=completed，文本恰为 `relay ready`。
- 新进程使用已安装 main.mjs，不是旧源码服务。此结果证明真实模型生成可达，
  不证明 Research Mode 或 AITP 科研闭环；后续在隔离测试会话验证，不追加原生产任务。

## Installed single-Line recall in progress (2026-09-10)

- 隔离实例改为 manual，显式 deny Bash/Write/Edit/Agent 与四种 AITP prepare/save，
  不影响日常配置。新 session `session_42d1825a-701f-4f24-a9ec-9732e4e930a4` 指向
  真实 GW_librpa，只读恢复 cRPA；未修改原会话、创建 Goal 或追加生产任务。
- enter_mode 实测 ready，AITP contract0.2/plugin0.9.0/Python3.12。540 个 Topic
  文件的大小/mtime/ctime 基线存于隔离测试目录，非内容摘要或科研证据验证。
- 一次 prompt `msg_01M23RRABANZN4695BNDXKCM34`（2026-09-09T19:01:44.938Z）：
  500 字以内恢复 dd/非dd、J、U(omega) 断点，只读、无 Action/Goal/写入/远端/委派。
- 首轮 Skill 后模型调用全局 enter(recent=12)、check、GetResearchStatus、method-card
  Grep 和较宽关键词 Grep；未按用户问题立即缩到 cRPA。五项工具约两秒内返回，
  结果事件约 2.8/2.5/2.8/0.2/6.4 KB，随后进入模型下一 step。暂无审批、Action、写入。
- 本轮末权威 API 仍 busy=true，结果尚未完成。保留首次原始行为，未补提醒或重发。
  不能将后续等待归因于门禁/远端作业，也尚不能确定模型延迟根因；继续观察同一请求。

## Single-Line recall: report expansion and repeated requests (2026-09-10)

- 同一 session 的权威 API 仍 busy=true，pending approvals=[]；未重发 prompt。
  Topic 540 文件的大小/mtime/ctime 与基线一致。尚未产生最终科研恢复回答。
- 更正上节体积解释：2.8/2.5 KB 是截断后的 tool.result 事件，不是原始报告。
  wire 的截断元数据明确显示 enter=84,996 字符、86,715 bytes；
  check=110,420 字符/bytes，均超过通用 50,000 字符阈值并转存本地结果文件。
  不能据小 preview 认定 AITP 返回本身很精简。
- wire 记录 turnStep 0.3、0.4、0.5、0.6 的 llm.request，messageCount 均为 12，
  间隔约 122–124 秒，没有中间 tool.call 或新增回答。可确认重复模型请求，
  不能仅凭间隔认定具体 HTTP 错误、超时来源或大报告是重试原因。
- 定向源码发现原生 AitpEnterTool.description 仍要求 start and end 调用；
  AitpCheckTool.description 仍要求 investigate errors before continuing，且使用
  ok(result) 完整 JSON 序列化。它们与轻量按需读取、局部错误处理目标存在提示偏差；
  本轮仅确认位置，尚未修复或宣称性能提升。
- 诊断时误读隔离 server.log 的启动横幅，输出过 loopback 测试 token；不再重复
  展示或读取该横幅。本事件只涉及隔离测试实例，不涉及 relay 凭据。后续测试实例
  关闭/换代时需要作废该 token；不能再笼统声称整个测试过程中 token 从未输出。

## Native read guidance correction (2026-09-10)

- AitpEnterTool 改为新鲜报告复用、明确 workstream、小 recent window 与针对性证据读取；
  不再要求 start/end 仪式。AitpCheckTool 保留保存后验证和 exit-2 不可验证语义，
  明确相关 findings 限制相应证据，非全局科研停止。未改变参数、CLI、JSON 返回或权限。
- 双方 README、AITP contract 描述及 compatibility matrix 同步；不改 AITP runtime。
- DI 解析的描述回归及 pending checkpoint 下 prepare/check 独立执行用例：
  2 passed / 0 failed / 701 unselected，`/tmp/hakimi-read-guidance-r1.json`。
  AITP adapter contract 文件 10 passed；双方 git diff --check 通过。
- 此描述增量未重新构建安装，原真实只读请求未重发；大报告呈现、延迟根因及
  完整闭环/多线真实验收仍未解决，不将文案测试视为效率或物理正确性证据。

## Relay retry cause verified (2026-09-10)

- 原 session 的 server/events 持久事件日志补足 wire 未包含的错误字段：
  seq 34/36/38/40/42 的 turn.step.retrying 均为 ChatProviderError，
  `OpenAI Responses response.failed: upstream_error: Upstream service temporarily unavailable`；
  seq 44 为 APITimeoutError / `Request timed out.`。
- failedAttempt 1–6、maxAttempts=10；前五次请求等待约两分钟后收到失败，
  退避仅约 0.5/1/2.3/4.5/9 秒，第六次退避约 17.6 秒。
  因此当前延迟的已证原因是 provider failure/retry，不是审批或 Research action gate。
  不能由该事件判断上游内部为何失败，也不能证明报告大小与故障存在因果关系。
- 源码 stepRetryService 只对 retryable provider errors 重新排入同一 driver，
  每次发布 turn.step.retrying 并消耗 step budget；本轮未改重试机制或运行中请求。
  后续效率对比须单列上游失败等待与正常工具/推理成本，不能混成科研流程耗时。
- 对溢出文件仅作 JSON 字段计数：enter 的 31 条 unresolved_failures 占压紧 JSON
  48,811 字符，12 条 recent_entries 16,310，12 条 recent_notes 6,915；check 的
  277 条 findings 占 98,567 字符。主要体积不是重复序列化同一报告，而是全局历史
  内容。下一步应优先明确范围和有完整文件可追溯的概要呈现，不能只去掉空格或
  截断 findings 后仍宣称已完整检查。以上是报告结构测量，不是科研内容审计。

## Lossless summary-first JSON presentation (2026-09-10)

- 原生 enter/check 工具仅重排 JSON 字段，将元信息/计数/最新工作笔记指针置于
  大数组之前。没有新增返回字段、变更 CLI/schema、删减 finding 或改通用截断服务。
  超长报告仍由原服务完整落盘，预览明确 truncated，并给原报告读取路径。
- DI 工具执行测试验证 JSON.parse 后与 adapter 原报告完全相等及概要顺序；
  连同两个已有读提示/独立执行用例，`/tmp/hakimi-read-order-r1.json` 通过。
- 对本次真实溢出报告离线按相同重排方法测量：check counts 位于第 108 字符；
  enter latest_working_note 位于第 1,145、counts 第 1,352 字符，均进入 2,000
  字符预览。报告总长度仍是 110,420 / 84,996，不宣称压缩、延迟修复或完整预览。
- 该增量未安装，原模型请求仍观察中；真实验收仍需安装后重测，不隐去首次故障。

## First installed recall terminal result and new package (2026-09-10)

- 首次 session_42d1825a… 权威 API 终态 busy=false / completed，未追加提醒或重发。
  全程 1,089.316 秒、30 次工具调用、1 次 Read 路径抄错；最终回答 885 字符，
  没有遵守 500 中文字以内的简洁目标。上游失败等待与这部分检索成本须分开。
- 最终答复区分 dd 输出自洽与物理有效性、非dd准备与真实执行、J/U延拓限制和
  历史状态与当前队列；引用条目在 aitp_show 调用中出现。这是记录恢复观察，
  尚非独立科学验证，也未完成逐项引用与时效审计，不能宣称科研验收通过。
- trace 无 Action/Goal/prepare/save/Bash/Agent 调用；540 Topic 文件元数据与基线
  一致。未查远端、未写科研记录。保留全局宽搜索、错误路径和长答复为首次失败。
- 后续 read-order 源码完整 Research 服务+截断测试 708 passed / 0 failed，
  `/tmp/hakimi-read-full-r1.json`；此前 core typecheck 通过。
- 备份 dist 到 `/tmp/hakimi-before-read-order-FidKyq` 后增量构建 main/search-worker、
  copy native、检查已有 521 Web 资产全部成功。未改 Web 源码，未重复重建它。
  pack exit 0；新包离线安装到 `/tmp/hakimi-read-order-install-TqxZac/runtime`，
  --version=0.21.0、cmp main/search-worker 与构建产物一致。尚未启动新版真实验收。
- 确认旧隔离请求 completed 后，核对 PID 文件及 /proc/5687/cwd，再 SIGTERM 停止
  旧隔离服务；不触碰用户 daemon。旧 home/token 不再用于后续测试，保留诊断文件。

## Updated installed recall launched (2026-09-10)

- 新安装根 `/tmp/hakimi-read-order-install-TqxZac` 下创建独立 home（700），仅复制
  config 与 plugin registry，不复制 token/旧会话。服务 PID 21604，loopback 58650，
  handle 48199，启动日志私有保存不打印；用户 daemon 未重载。
- 新 session `session_3a7eaf48-2d78-4a5c-81bd-b73f057d9e32`，原 GW workspace 只读，
  inherited manual + Bash/Write/Edit/Agent/AITP prepare/save deny。
  Research ready / contract0.2/plugin0.9.0/Python3.12；Topic 元数据基线 540 文件。
- 同一原文 prompt `msg_01M23SYD1QJ7NGFWNQX9AV6KWT`，
  2026-09-09T19:22:32.887Z，未添加正确路径、scope slug 或缩短检索的提示。
  此为修改后的新会话比较，不声称首次原始行为已成功。启动后 busy=true / approvals=[]。
- 该运行用于核验新增原生工具描述及概要字段排序；并非全量闭环、多线或物理验收。
- 安装版实际 aitp_check 溢出预览现明确包含 status=findings、schema、counts：
  entries516 / notes23 / errors73 / warnings204，然后才是 findings 数组；完整报告
  仍110,420字符，持久文件路径可见。这验证了新呈现真正进入模型输出，不仅是离线排序。
  模型尚在执行：Skill、status、check 后继续宽 Grep，无审批；最终质量仍待观察。

## Updated recall failed freshness acceptance (2026-09-10)

- 终态 completed / busy=false / approvals=[]；69.834 秒、12 次工具调用。
  调用为 Skill/status/check、3次Grep、4次show、2次Note局部Read；无写入或Action。
  此与旧运行的18分钟不能直接作速度因果比较，旧运行包含大量上游故障等待。
- 准确性未通过：最终说 dp-dp 尚缺 Ni–O intershell tensor，但未读取更新记录
  entry-ba7615f87d944488bef55daff22c815f（2026-09-09T10:25:13.960431Z，显式 crpa），
  该记录明确已实现25×9矩形收缩/输出路径、合成测试2/2通过，尚未真实NiO消费者验收。
  Codex只读核对该记录，没有验证源码或将合成测试升级成物理结果。
- 模型命中旧 entry-47bd86…后缺少同线后续变化核对；既未 scoped enter 也未list最新记录。
  停止宣称恢复验收通过，不改真实科研记录来迎合答案。下一修复针对读取新鲜度提醒，
  而不是增加Action/phase门禁。首次错误保留，不用后续纠正冒充首次成功。

## Current-gap Skill correction and fresh trial (2026-09-10)

- using-aitp 用简短的 current-gap 指引替换原泛化证据段：关键词命中只是定位；
  对当前进展核对明确 workstream 内后续变化；未知覆盖写成截至记录，不武断说仍缺。
  区分实现、合成测试、真实运行、物理验收，不给不变作业查询增加重建要求。
  skill-creator 的最小相关指导原则用于避免新增普遍流程；无新schema/CLI/执行门禁。
- AITP README/handoff/contract 同步；Skill validator通过，adapter contract10通过，
  diff检查通过。这不证明行为改善，仍需要真实试验。
- 新 session `session_8b923c19-2722-4187-89b9-f164c97adc77`，prompt
  `msg_01M23T54W5YPF6X8VCM0FYFEY2`，2026-09-09T19:26:13.893Z；同一原始问题，
  未提供漏读记录ID/正确结论，独立于此前两会话。原安装二进制不变，local-path
  AITP Skill从当前仓库加载；需核验实际加载和最终输出，不把修改源文件等同已生效。
- wire turn.steer 确认实际加载新段落；终态 completed，67.754秒、18次工具调用、
  1次缩写Entry ID失败（随后用完整ID恢复），最终534字符，540文件元数据未变。
  无Action/写/远端/委派。尚未证明速度提升，工具调用反而比上一轮12次多。
- 此次实际show读取 entry-a349…、entry-47bd…、entry-ba761…，回答正确区分
  dp-dp 25×9已合成验证与四模型未有真实消费者结果，并限定截至记录日期。
  上轮的具体过时缺口已不再出现；这只是一例改后成功，不是普遍召回保证、物理验收
  或完整Goal通过。保留缩写ID失败与宽检索成本，后续转入其他必需场景而非反复刷此例。

## Synthetic direct Entry write live trial (2026-09-10)

- 公共CLI在全新 `/tmp/hakimi-memory-roundtrip-HabPOL` 初始化 lean-memory-test；
  自有.git阻止继承/tmp/.git。data/memory-fixture.txt明确为收到的合成测试报告，
  不是执行/物理结果；监督端为必需新pin计算一次digest，不对真实课题重复hash。
- 安装版新 session `session_241a152d-20fe-4e77-a039-81ca984422b7`；测试监督端用
  公共Research API创建并明确绑定/选择 contraction-test，不改真实课题归属。
  首次监督脚本switch_line漏expectedRevision被拒绝；补读取revision后成功，
  这是测试脚本错误，不归为产品缺陷。未创建Question/Goal/Action。
- 隔离home移除此前四项临时deny（Write/Edit/record prepare/save），保留manual普通
  审批及Bash/Agent/Note写入deny。无其他运行中的测试请求；非用户配置。
- prompt `msg_01M23TCQDQ2SSAD9RVGFW1X3ZE`，2026-09-09T19:30:22.263Z。
  模型Read fixture → 原生record prepare → Read draft → 填draft → record save。
  prepare和save各经监督端确认一次具体请求，未添加session级永久允许。
- Entry `entry-f4adc972a98647f0bb0be8fe5a1958a2` 已出现于临时账本；内容明确
  received report、没有独立执行/真实材料/MPI/物理验证，scope与pin正确。
  监督端公共 scoped check确认entries1/notes0/errors0/warnings0，outside_scope
  warnings1，不能说全库无warning。模型最终保存后校验与新会话召回尚待验收。

## Fresh-session recall started; post-save provider retry (2026-09-10)

- 已保存Entry后，写入会话step8在2026-09-09T19:34:26.473Z收到
  `ChatProviderError: OpenAI Responses response.failed: server_error`，随后重试。
  不能把等待称为保存失败，也不能以监督端check代替模型自己的保存后检查。
- 新 session `session_d9ef6f6d-e8c8-440f-ad5e-b56b6912de4b`，同一临时账本，
  Research ready但没有复制原session研究线/Goal/Action/对话。prompt
  `msg_01M23TMC7KP3E3RZ4D2RJ9N543`（2026-09-09T19:34:32.947Z）仅给工作线与
  查结论/证据/未验证部分/下一步的问题，没有Entry ID或预期答案。禁止写入/新计算。
  这是新会话召回，不是冷daemon重启或几个月后的长期召回证明。
- 两个请求分别观察，不重发或用后来的会话覆盖早先失败；完整验收仍待实际回答。
- 新会话wire确认已用原生enter/list读到唯一保存的observation及其下一步，随后进入
  模型step3；所以记录可发现这一层已达到，但完整show/证据阅读、最终正确回答和
  零写终态尚未确认。原写入会话再次server_error（failedAttempt2），不重复保存。
- 本轮补跑core lint:imports：1301文件通过。直接save返回现有AITP回执，未偷偷执行
  自动科学判断；保存后模型检查仍为待验收项，不以监督端验证补齐该行为证据。

## Next multi-Line acceptance inputs prepared (2026-09-10)

- 临时账本旁新增独立 symmetry-fixture.txt（非canonical记录），仅提出复矩阵
  transpose/conjugate-transpose候选检验，明确未执行；不能借contraction线2×3
  报告把它升级为已验证。这构造了不同线、不同证据成熟度的可辨别反例。
- 下一安装版试验拟用既有Agent task_scope=research-line:<existing slug>：
  两个已存在测试Line各自只读输入，父agent综合；一个子任务嵌套独立读检查。
  观察真实task/parent元数据和Board投影，不以回复自称归属替代任务事实。
  目前仅准备输入，未创建多线任务或取消Agent deny；先完成单线记忆往返观察。

## Fresh-session recall reached a correct final answer (2026-09-10)

- session_d9ef6f6d…权威终态completed。最终引用完整Entry ID，找回收到2×3报告、
  fixture证据路径/pin、未独立执行/无材料MPI物理验证、独立检查转置共轭的下一步。
  没有把报告转换为亲自测试或物理结论。
- 工具4次：GetResearchStatus(line_slug=contraction-test)因本会话未建该Line失败；
  随后自行用scoped aitp_enter/list及完整ID aitp_show成功。没有人工纠正、Action、
  记录写入或本地Line创建。这个失败必须保留，但不应靠自动伪造本地Line来掩盖。
- 因此已证明本fixture的直接保存→新会话按workstream召回可行；未证明长期、多线、
  daemon冷恢复或失败重试写入安全。原写入会话自己的保存后检查仍未完成观察。

## Installed two-Line and nested delegation executed (2026-09-10)

- 新session `session_72d22e1c-9f63-435e-9c26-631501f2926c` 使用临时账本；创建
  contraction-test/symmetry-test两条本地线，不推断AITP绑定。仅移除隔离配置的
  Agent临时deny，普通权限保持。prompt `msg_01M23TYDT1236BJJD6ATD5KWS7`，
  2026-09-09T19:40:02.241Z；明确只读、独立输入、嵌套复核、不写科研记忆。
- 真实spawn事件：agent-0 explore/relay-terra与agent-1 agent/relay-sol于
  19:40:20并行开始；agent-1于19:40:33派生agent-2 agent/relay-sol，19:40:41结束。
  agent-0仅Read memory-fixture；agent-1 Read symmetry-fixture并委派；agent-2仅Read
  symmetry-fixture。主agent最终正确分开收到的报告和拟做的检验，未代做假冒委派。
- 权威session snapshot.agent_relationships记录main→agent-0/contraction，
  main→agent-1/symmetry，agent-1→agent-2/symmetry；subagents三项均completed。
  `/tasks`为空是前台委派与后台任务列表的区别，不是没有执行。尚需Web实际渲染
  接入该snapshot的验证，不把元数据正确等同Board已经验收。
- 该fixture证明实际并行及显式同线嵌套归属，不证明省略task_scope时自动继承、
  多线并发写入、代码目录隔离或真实多科研方向结论正确；这些仍单列未验收。

## Installed Web Board tree and browse acceptance (2026-09-10)

- 使用同一隔离安装实例58650及真实完成的session_72d22e1c…，Playwright打开实际
  Web，而非mock组件。最初脚本点击自动收起的侧栏标题超时；属于脚本定位错误，
  不算产品通过或失败。修正为关闭首次欢迎弹窗并用Research board按钮打开看板。
- 实际DOM与截图确认3项completed协作者：agent-0/contraction-test、
  agent-1/symmetry-test、agent-2/symmetry-test；嵌套agent-2缩进深度1，另两项0。
  查看安装截图 `/tmp/hakimi-read-order-install-TqxZac/installed-tree.png` 后确认。
- 下拉浏览contraction-test仅显示agent-0；浏览symmetry-test仅显示agent-1/2。
  浏览前后公共research API均revision6/currentLineSlug=null，未切换实际执行线，
  未创建Goal/Action或写AITP。脚本有行数、完整scope及revision/line不变断言，失败
  使用非零退出；本次全部通过。脚本位于
  `/tmp/hakimi-board-browser.y69NTU/installed-tree.mjs`。
- 此处证明真实委派结果能在安装版Board呈现及按线浏览隔离，不证明并发写入、
  代码目录隔离、长任务状态恢复或物理研究完成。没有结构化研究进展的fixture仍
  显示“No current work recorded”，不把agent完成冒充科研结论。
- 原直接写入会话session_241a152d…本轮API仍busy=true；未重发请求或取消。
  新会话召回通过不能替代该写入会话自己的保存后校验。GW原账本540个文件的
  size/mtime/ctime基线仍一致；未做新增哈希扫描或生产任务。

## Direct-write wait localized to provider retries (2026-09-10)

- session_241a152d…实时API仍busy=true、pending approvals=[]。wire中实际7次
  工具调用，仅1次record save；最后回执明确status=saved，路径为上述f4adc972 Entry。
- 会话自己的日志记录19:34:26至19:48:49 UTC连续9次OpenAI Responses
  response.failed/server_error，turnStep0.8–0.16；期间没有第二次save或后续工具。
  所以这是保存后的模型生成失败重试，不是AITP save失败、审批待决或Research门禁。
- 定向源码核验：AgentStepRetryService通过通用loop错误处理器重试provider错误；
  `_base/utils/retry.ts`默认总尝试数10。隔离config的loop_control只有上下文配置，
  没有覆盖该次数。本轮不修改全局重试语义，不取消或重发当前请求。
- 保存事实已证实；原会话模型的保存后check仍未发生。须保留此未完成行为，不能
  用已成功的新会话召回或监督端check把本次端到端写入验收改写为成功。

## Omitted nested scope: runtime pass, reporting failure (2026-09-10)

- 原直接写入session_241a152d…本轮实时API变为busy=false/reason=failed，保存后
  provider重试已终止，不能继续称运行中。未补发保存；原记录仍是已保存事实。
- 两线测试会话新prompt `msg_01M23VQ7V7HY956K80DQ1AGZSM` 于19:53:35.335Z
  请求新的symmetry父agent，嵌套Agent调用省略task_scope。未resume旧agent或改Line。
- 实际agent-3调用Agent/explore确实没有task_scope参数；agent-4只Read指定fixture。
  snapshot关系main→agent-3→agent-4两项scope均research-line:symmetry-test。
  父agent的工具回执头明确包含`task_scope: research-line:symmetry-test`及completed。
  因此继承机制及scope回执在安装版工作，不仅是源码推断。
- 但最终回答错误地称最内层回执未显示scope，不能确认继承；这是把孙agent对其
  自己Read回执的叙述，混同父agent收到的Agent回执。保留为汇总准确性失败，不把
  runtime通过升级为端到端全通过。下一修复应澄清工具回执元数据与子agent文本
  报告的证据层次，不新增执行门禁或额外Agent调用来查询已在回执中的身份。
- 已有ownership/resume定向回归6 passed/0 failed（98未选择），单worker2GB；
  `/tmp/hakimi-ownership-confirm-r1.json`。未改测试断言掩盖本次模型汇总失败。

## Receipt-versus-summary prompt clarification (2026-09-10)

- Agent描述原有结果汇总条目现在区分：identity/task_scope/status取自工具回执头，
  不是[summary]内部说法；子agent看不到调用者的回执；completed不认证科学正确。
  复用同一工具描述，无新增提醒通道、查询工具、schema或执行门禁。
- 新增描述回归并更新受影响的工具描述快照，保留原结果可见性要求及已有dirty修改。
  首轮103passed/2failed（旧文案断言、描述快照），调整后不带update完整重跑
  105passed/0failed/0pending：`/tmp/hakimi-agent-receipt-r3.json`，单worker2GB。
  双语README同步；git diff --check通过。
- 这是源码提示修正，尚未重装复测；此前实际会话的汇总失败仍保留，不因静态测试
  通过就声称模型行为已修复。

## Isolated receipt-prompt build and rerun (2026-09-10)

- 原dist先备份至`/tmp/hakimi-before-receipt-build-FJmU4c`，主程序/worker构建、
  native复制及Web521资产校验通过；不重新生成未变化的Web资产。
- 新tarball离线安装至`/tmp/hakimi-receipt-install-eyT63S/runtime`，省略optional
  依赖、不执行install脚本。安装main与构建main逐字节相同，CLI0.21.0，包含新的
  receipt提示；没有更改用户日常安装或旧测试实例。
- 新私有home仅复制测试配置/plugin路径，不复制旧token或会话。隔离服务58651，
  API backend=v2，AITP ready/contract0.2/plugin0.9.0/python3.12。
- 新session `session_1b73ee19-584f-42d0-b683-0f0e1ca9c47b`，本地两条fixture线，
  不推断绑定；19:59:46.062Z发出与之前相同的省略嵌套scope提示，prompt
  `msg_01M23W2HWEDYDXMC3949733PBA`。运行中，不把已安装算作行为复测通过。
- 后续权威终态completed/busy=false：agent-0实际嵌套Agent args省略task_scope，
  agent-1继承symmetry-test；父回执与snapshot一致。主agent最终正确引用父/子
  回执归属，区分fixture proposed与已执行结果及未交叉验证限制。仅两次Agent和
  最内层一次Read，无新增科研记录或工具门禁。这是新会话针对性复测成功，不是
  原失败会话首次成功，也不是所有模型/多线场景的一般性保证。

## Direct Entry failure/retry isolation regression (2026-09-10)

- 新增实际DI工具路径回归：adapter第一次recordSave抛出存储异常，直接Entry的
  捕获scope与draft Edit权限保留；无关Read不被阻断。相同草稿重试仍携带exact
  Topic=t1/workstream=aitp-main。之后切另一Line，旧draft保存被拒且没有adapter
  save调用，无关Read仍允许，无Action/checkpoint产生。
- 首次fixture错误地期待异常变为isError返回，实际execute抛出原异常；修正为
  rejects断言后定向通过。没有修改生产异常/权限行为以迎合测试。
- 完整Research服务文件重跑报告`/tmp/hakimi-direct-entry-service-r3.json`，本轮
  无runtime/CLI/schema改动。这是stub存储异常的回归，不代表安装版真实失败恢复
  或并发写入已验收；后续应在临时账本验证，不修改真实GW记录。

## Installed validation-failure scenario started (2026-09-10)

- 服务58651中新session `session_dde834e9-78a9-4680-82f7-159da287c7a7`，临时
  Topic lean-memory-test，监督端明确绑定并选择contraction-test；没有Goal/Action。
  初始canonical仅保留之前f4adc972 Entry。
- prompt `msg_01M23WBK2Y74M22P30BYJQ7TM6`（20:04:42.206Z）指定唯一测试key
  invalid-draft-recovery-fixture-v1：prepare后故意不填draft，让公共save拒绝，再
  Read独立symmetry fixture。禁止绕过validator/改canonical/另写失败Entry。
- 本轮API仍busy=true，未出现工具调用或pending审批，因此尚不能证明save拒绝
  或读取成功。继续观察同一请求，不重发。core typecheck本轮通过；协议无改动。
- 后续prepare审批d6aaf658于20:06:17.051Z一次性通过；save审批7fea3943于
  20:08:14.684Z一次性通过，未增加session永久允许规则。实际save回执isError=true，
  `Entry summary must not be empty (code: missing_summary)`；草稿
  entry-198b762fbcc1480fa16a1365bbf7d6d7.md存在，对应canonical路径不存在。
  因此已验证真实公共validator拒绝不完整Entry且保留草稿。后续Read与修复重试
  尚未发生，本轮API仍busy=true，不把保存拒绝这一层当完整恢复验收。
- 后续wire确实出现Read(data/symmetry-fixture.txt)，返回7行完整内容且无错误；
  API终态completed，最终回复如实报告missing_summary及读取成功。无Action/新记录。
  此阶段证明实际validation拒绝不锁住独立读取，不证明磁盘故障或并发安全。
- 为恢复阶段新增临时只读证据data/validation-recovery-fixture.txt，记录实际拒绝、
  草稿保留及读取成功，明确非物理结果与验证边界；新pin计算一次，未扫描旧记录。
  同session于20:11:09.950Z发送prompt `msg_01M23WQDQY22MAH3G0J8271YRZ`，要求
  填写原draft、原id/key/scope保存并check/enter，不重prepare。该阶段刚启动，
  不能把上一阶段completed用作这次保存恢复完成的证据。
- 恢复阶段后续wire显示批量Read报告/原draft，再Edit原draft；idempotency_key和
  contraction-test单一workstream保持不变，未重新prepare。保存尚未执行/无待审批。
  监督未代填草稿或改canonical。README双语入口同时移除已过期的逐命令Research
  捷径描述，明确普通工具权限独立；隔离安装/Board已有实测与整体未完成分开。
- 恢复step1.3在20:15:21.087Z出现provider server_error，通用重试后继续；没有
  重新prepare。save审批531e0d07于20:16:57.570Z一次性通过，回执status=saved。
  canonical确认同一entry-198b762…、原key invalid-draft-recovery-fixture-v1、
  唯一contraction-test membership。模型保存后check/enter仍待发生。

## Independent code-path ownership fixture started (2026-09-10)

- 临时workspace下新增code-isolation/contraction/input.txt与symmetry/input.txt，
  分别指定各自目录result.py及不同label字符串。不是生产代码、物理计算或Git隔离。
- 已完成会话session_1b73ee19…于20:16:17.402Z接收新prompt
  `msg_01M23X0SZTJTZJZZBF7Q6ETNK4`：两个新coder明确各自research-line，只读本线
  input并写本目录result.py，禁止Bash/运行程序/修改另一目录/AITP/Goal/Action。
  这是检验软任务边界是否正确执行，不能称作OS沙箱或独立worktree证明。
- 启动后尚无子任务结果；不代写输出，不提前宣称文件隔离验收成功。
- 后续实际agent-2/contraction和agent-3/symmetry并行运行并completed；每个只有
  Read自己input、Write自己result.py两次调用。实际文件分别返回contraction-only
  与symmetry-only，路径及内容没有混用。主agent终态completed，按实际回执正确
  分开路径，并声明未运行测试。没有Bash、跨目录访问、AITP写入或父agent代写。
  此结果只支持指定fixture软文件归属行为，不证明强制隔离、worktree合并或物理正确。
- 同时原恢复写入会话已实际调用scoped enter(recent=1)，返回enter-0.3、
  contraction-test、active=2/malformed=0/omitted_active=1。模型已说明将check，
  但截至本次检查尚未观察到check调用，故完整保存后验证仍待定。

## Remaining Goal/human-decision coupling confirmed (2026-09-10)

- 当前agentResearchService.guardGoalCompletion与decideGoalContinuation仍忽略
  输入goalId；mode active且存在任意未解决humanGate时分别deny/hold。已移除的
  checkpoint/action/alignment全局条件不等于所有独立Goal依赖已解耦。
- ResearchHumanGate只有gateId/kind/actionId/questionId/prompt/resolution/times，
  没有显式Goal依赖。不能因UI浏览到另一Line就推断gate无关，也不能自动resolve。
  这仍是完成条件2的缺口，不能因普通工具/委派测试通过而隐藏。
- 待人类授权的协议方向应覆盖显式依赖及旧无归属gate的处理；与已报告的无Goal
  Research Plan表示、Note原子scope保存一起单列，不借自动Goal续轮推定批准。
  本轮只做源码审计，未修改human decision语义。

## Installed validation-recovery terminal verification (2026-09-10)

- 重新查询session_dde834e9-78a9-4680-82f7-159da287c7a7，API明确返回
  busy=false、reason=completed；不再将此请求列为provider重试中的等待项。
- 实际wire含修复后原生record_save、scoped enter及scoped check，均返回成功。
  check回执为aitp/check-report-0.2、workstream=contraction-test、status=clean，
  entries=2、notes=0、errors=0、warnings=0、findings=[]；outside_scope.warnings=1。
  因此只能说该scope检查通过，不能说全库无警告。模型最终回复正确报告原Entry ID。
- 本次安装产物的“validator拒绝保留草稿 → 独立读取 → 原身份修复保存 → 模型写后检查”
  已完成。监督显式提供了恢复提示和固定观测报告，并一次性处理普通审批；不是无人干预
  首次成功。先前provider重试和首次不完整草稿拒绝仍保留在上文，不从耗时中排除。
- 该证据不覆盖磁盘故障、未知save回执、并发写入、Note原子保存或物理结果。
  全Goal仍未完成；无Goal规划表示、Note原子scope契约及human gate的Goal依赖语义
  仍待明确授权，不能由自动续轮推定同意。

## Pending-evidence reminder freshness (2026-09-10)

- 定向审查发现attention fingerprint未包含pending checkpoint candidate；其他状态不变时，
  候选出现、更换或移除不会产生提醒。先加入回归断言，得到37 passed / 2 failed，
  失败为期望delta却返回undefined，非provider或fixture失败。
- 修复仅纳入实际展示的candidate身份和类型/authority/provenance，不纳入snapshot revision；
  delta明确替换旧attention摘要，移除的保存提醒不再冒充当前待办，不自动resolve人类决策。
- 修复后同一文件39 passed，单worker、Node堆上限2GB，约6秒；保留测试harness既有
  agentLoopService/eventBus未注册stderr。首次命令使用不支持的minWorkers选项，未运行测试；
  更正为maxWorkers=1后获得上述红/绿结果。不改变AITP协议或工具执行权限。
- 最新源码尚未重新打包安装；前述隔离安装实测不作为这项新修复的安装证据。

## Visible human-decision reminder synchronization (2026-09-10)

- 无Goal且phase不变时，humanGate的prompt/resolution变化没有进入提示去重判断。
  新回归先得到40 passed / 1 failed（应刷新却返回undefined）；无关Action归属测试通过。
- 仅使用已有currentLineHumanGate投影的实际显示文本作为内部disclosure指纹，覆盖
  文本改变、解决和移除；不改public schema、决策状态、归属规则或Goal guard。
- 修复后同一文件41 passed，约6秒、单worker、2GB堆上限；lint:imports通过1301文件。
  安装后的提醒验证仍待完成，不能使用此前构建产物作为本修复的验收证据。

## Reminder-fix isolated installation (2026-09-10)

- 构建前dist备份到/tmp/hakimi-before-reminder-build-vWlxLv/dist；未清理既有Web改动。
  main以2GB Node堆构建成功，search-worker构建及native资源复制成功；Web资源检查
  通过521文件。本轮未修改Web源码，未重新生成Web资源，也不将资源检查称作重建验收。
- 新包离线安装到/tmp/hakimi-reminder-install-JQjMmi/runtime，版本0.21.0；安装main
  与刚构建main逐字节相同。忽略安装脚本并省略optional依赖，不声称PTY验收。
- 只在新临时home复制测试配置，未复制旧session或server token；新实例端口58652、
  PID10080，GET /api/v1/sessions返回HTTP200/code0。日常安装及daemon未动。
- 上述仅证明新产物安装和API启动；两项提醒修复的安装后行为测试仍待执行。

## Installed human-decision reminder flow (2026-09-10)

- 新session_a754015d-e9d8-4be6-9526-2cd8f80ac700在58652运行。测试home遗漏
  plugins/installed.json，enter_mode返回degraded；此为安装测试配置遗漏，不能算ready验收。
  后补复制原测试实例的本地路径登记，未重启运行中请求，未假定现有catalog已刷新。
- msg_01M23Y83ZGA2EP028C549QTMJG于20:37:45.584Z要求一次合成RequestResearchDecision；
  普通审批146fe01c在20:38:31.817Z一次通过。会话completed，生成gate236f4b3b，
  wire提示从无决定变成Pending human gate；模型正确表示等待监督者，不自己选择。
- 监督通过现有resolve_decision接口明确选择临时fixture的A，仅属合成测试，不冒充真实
  科研决策。20:39:24.043Z发只读回问msg_01M23YB44BFMRCTR02GJYWK555，不向模型复述选择。
  新wire提示含Resolved gate及SYNTHETIC_SUPERVISOR_SELECTED_A，不含Pending human gate。
  API终态completed，模型正确回答“已解决，仅此临时fixture使用A”，没有新增工具调用。
- 此为安装后的自然生命周期同步，因phase也改变，不单独证明同phase回归；同phase
  与无关Action隔离由41项源码测试覆盖。pending-evidence安装场景仍未验收。
- 实测额外发现degraded alert仍声称AITP不可用会阻止Goal continuation/completion，
  来源agentResearchService的3433/3606附近两处旧文案；与新Goal语义冲突，待修复。

## Degraded alert wording correction (2026-09-10)

- 两个真实服务路径（commit失败与degraded turn boundary）的新断言先均失败，确认
  旧文案仍称Goal continuation/completion不可用。随后改用同一提示常量，明确保存
  不可用需保留未保存内容，但正常权限下的独立工作仍可进行，记忆可用性本身不阻塞Goal。
  未绑定workstream的文案也仅约束保存归属，不把普通探索叫作无效工作。
- 未改变mode状态、alert分类、human gate、工具权限、Goal guard或AITP协议。
  reconcileAlerts已有message比较并upsert当前投影；旧消息可由原有协调路径更新，
  不删除历史wire记录。本轮尚未另做旧会话安装回放，不宣称该层验收通过。
- 完整aitpResearchService与researchInjectionPresenter测试746 passed，9.13秒、
  单worker、2GB堆上限。既有未注册依赖stderr仍存在；没有修改这些警告来制造全绿。
  当前58652安装早于此文案修复，不能把它当作新文案的安装证据。

## Installed old-alert recovery (2026-09-10)

- 确认58652唯一会话busy=false、main_turn_active=false、pending_interaction=none、
  last_turn_reason=completed后，仅TERM测试PID10080，退出0。未停止日常daemon。
- dist备份/tmp/hakimi-before-alert-build-J02H0x；新main/worker构建成功，521个Web资源
  校验通过，离线包安装到/tmp/hakimi-alert-package-ooDGvl/runtime；main逐字节一致。
  新测试PID16253复用原临时home及同一会话，保存旧历史，不复制真实科研会话。
- 恢复后的GET research返回mode=ready、revision=7；原degraded警告保留原createdAt，
  文案已更新为独立工作可继续，state=cleared。此前漏装的插件登记在重启后生效；
  合成人类决定的明确选择A保持不变。既有协调路径确实更新了旧警告，未改其历史wire。
- msg_01M23YMWW0RX2SBP0B7ZDK2NJJ于20:44:44.288Z只读询问当前提醒的权限边界，
  API终态completed。模型正确说明当前未称AITP不可用、独立工作可在常规权限下继续，
  无当前Goal不能被解释成通用Goal被禁用；明确未查科研结果，没有新工具调用。
- 此证明旧警告投影和提示恢复，不是运行中Goal continuation或pending checkpoint提醒
  场景的额外验收；这些边界不能从一次文字回答推导出来。

## Installed phase-only Line-switch failure and source fix (2026-09-10)

- 为pending-reminder验收，监督通过公开API在原临时会话创建reminder-test研究线，
  明确绑定临时Topic的已有contraction-test workstream。随后switch_line被gap_analysis
  phase拒绝；无live Action、pending checkpoint或未解决humanGate。创建和绑定已生效，
  未执行后续begin/conclude，不能重跑整个setup而创建重复对象。
- 定向源码确认assertLineSwitchSafe最后单独限制phase=idle/state_updated；前面已经检查
  pending/localConclusion、Note保存中、live Action/run和未解决humanGate。移除最后的
  phase-only拒绝，保留这些真实归属保护和revision校验。既有reducer负责切线工作视图重置，
  不生成科学结论、不写canonical AITP。
- 测试首轮因遗漏researchSetPhase import失败，修正后orienting/gap_analysis复现相同拒绝。
  最初evaluating fixture并未成功进入该phase，故移除此无效样本，并增加切线前phase断言；
  不将其计入覆盖。修复后完整服务707 passed/0 failed/0 pending，报告
  /tmp/hakimi-unowned-line-switch-r3.json；对应原安装失败场景尚待重装回放。

## Installed Line replay and pending-reminder reuse (2026-09-10)

- main/worker重建，521个Web资源校验通过；dist备份/tmp/hakimi-before-line-build-5te4ud。
  离线安装/tmp/hakimi-line-package-E81pLw/runtime，安装main与构建main逐字节一致。
  确认原测试会话completed后仅停止测试PID16253（退出0），新测试PID21278复用同一home
  和会话/端口58652，未动日常daemon、真实课题或既有canonical记录。
- 不重做上一轮已成功的create_line/binding，不手动改phase。公开switch_line从
  gap_analysis/revision10成功；随后begin/conclude仅捕获已实际观察的合成提醒测试，
  生成本地checkpoint404594f2-216c-4e9b-8944-b6ea00a0dff0，Topic lean-memory-test、
  Line reminder-test、workstream contraction-test沿用原明确绑定，未save AITP。
- msg_01M23Z0QGTC5GQYF3FRCT7KBCH（20:51:12.026Z）要求只读当前提醒，两句回答，
  不调用工具。wire新提醒含确切pending ID、Durable commit candidate及独立工作指引；
  API completed，模型正确区分本地候选与已保存事实，说明独立读取无需等保存。
- 无状态变化再问msg_01M23Z1WSP6WYPMTAD5QD945RS（20:51:50.198Z），同样completed，
  答案正确；Research reminder总数前后均为5，没有重复注入。这一对安装回问没有工具调用。
- 此为候选出现及稳定时复用的安装验证；候选替换/移除的同phase路径仍由源码回归覆盖，
  不伪造安装覆盖。候选保留在隔离会话，未丢弃或宣称已保存；整个Goal仍未完成。

## Shared executor/context regression closeout (2026-09-10)

- 当前源码重新运行toolExecutor、contextInjector、goalInjection三个完整测试文件，
  单worker、2GB堆上限；/tmp/hakimi-lean-executor-final-r1.json记录84 passed、
  0 failed、0 pending，分别41/20/23项。
- executor覆盖实际接口执行、policy拒绝不调用execute、未知工具/参数错误、veto、
  冲突排队取消及结果配对；这验证普通执行设施未因Research简化被一起去掉。
  它不是所有插件/OS安全或真实科研权限的穷尽证明。
- 上轮完整Goal对账中的协议缺口仍在；自动续轮不是Plan/Note/humanGate变更授权。
  本轮没有追加生产科研任务、改协议、提交或推送，也没有把84项测试计作整体验收完成。
## 2026-09-10：原子 Note adapter 源码接入

AITP 0.10.0/contract-0.3 的 Note 原子保存已接入现有 Session adapter、launcher
和 Research Note 路径。保存归属来自捕获的 context，不信任调用者覆盖；旧 0.1/0.2
拒绝 scoped Note save，Entry 原子保存仍支持 0.2/0.3，未知契约仍拒绝。

单 worker、Node 2 GiB 上限：Research service 711/711（3.19s），typecheck、
lint:imports、git diff --check 通过。首轮 710/711：旧未知契约样例用了新支持的
0.3，改为未知 99.0 后通过。此处仅为源码/模拟进程验证，不替代真实 CLI
跨进程验收、异常恢复全链路与最终安装；整体 G1–G7 仍未完成。
## 2026-09-10：真实 AITP CLI 的 Note 跨进程验证

使用当前 Hakimi `AitpLauncher` + `HostProcessService` 启动真实 AITP 0.10.0
Python CLI，而非返回模拟 JSON。探针：`/tmp/hakimi-note-cross-cli-IHbKNC/probe.mts`；
最终临时工作区：`/tmp/hakimi-note-cross-cli-IHbKNC/workspace-s7uJCE`。

- working/line-a 与 theory/line-b 各 prepare、填充合成依据、保存成功。
- 错 Topic、错 workstream 被拒绝，canonical Notes 目录无新增文件。
- 原样重试返回 already_saved，路径不变，canonical ID 等于 prepare ID。
- 改变同 ID 草稿内容后保存被拒绝，canonical 内容不变。
- 两条线 scoped check 的 errors 均为 0；归属按 canonical frontmatter 核验。
- 最终 Note：`note-010c53054f6d427db553a1462c7df819`、
  `note-ea33837992f846eda5b09f3c884fbc76`。

失败样本保留：首版探针错误假设 save 返回 id 并交给 show，得到 invalid_id；
save 实际仅返回 status/path，show 仅支持 Entry。已改为核验返回路径与 prepare ID，
并按现有契约读取 Note 文件；不是产品保存失败。中间一次通过缺少有效 ID 断言，
不以该次证明身份一致性，以上采用修正后的最终运行。

范围：真实 CLI/launcher 跨进程、合成证据，不是真实模型科研验收，不证明
未知回执端到端恢复或安装完成。未修改真实科研工作区；未 commit/push/reinstall。
## 2026-09-10：人类决定的显式 Goal 依赖

新增可选 dependentGoalIds（工具参数 dependent_goal_ids），随 Research op、snapshot
及 protocol/server/klient schema 保留。completion/continuation 按 Goal ID 判断，
明确 A 依赖不阻塞 B；缺字段的旧决定仍未知并保守 hold，不自动确认或解决。
模型提示不再声称整个 loop 都暂停。空列表不作为解除全部阻塞的开关。

验证：core service 713/713；追加 wire.restore 后依赖保留的定向测试 1/1；
Ops + presenter 145/145；protocol 48/48；core typecheck、lint:imports、diff check
通过。测试经现有 DI harness 取 service，测试保存/恢复与两类 Goal advice。
未声称真实多 Goal 调度、任务依赖、旧决定归属澄清 UI、最终 Board 呈现或安装完成。
## 2026-09-10：Goal 与 Board 决定依赖投影一致

Board 的 Research Goal stopConditions 改为复用实际 Goal advice 的依赖判断，
不再把其他 Goal 的决定标为当前 Goal 已触发的停止条件；保留决定原文与未知归属。
Goal 投影读取原始决定而非仅按浏览 Line 过滤，以免切换浏览隐藏实际阻塞。
独立 Goal 下局部未决事项降为 attention，next-step 不再被无关决定占据。

core service 713/713、import-boundary 与 diff check 通过。回归检查涵盖 stopConditions、
status 和 next-step；先前“提示包含 paused”的断言被改为未知依赖与普通独立工作
仍可用的准确语义。未完成真实 Web 渲染、多任务依赖或最终安装验收。
## 2026-09-10：决定保留与切线、委派

定向代码审查确认通用 Agent/task 路径无 Research humanGate 总锁；未添加新的
任务门禁。production executor 配合 fixture delegate，覆盖显式与未知决定下独立
方向委派，未知 Line 拒绝、通用 permission veto 仍生效。不是实际模型子任务验收。

真正的残留阻塞是 assertLineSwitchSafe 的全局 human gate 拒绝，且 switch op 会
清空 gate。现移除该拒绝并保留 gate；切线后 Goal A 仍等待，B 不受影响。
缺依赖字段的 legacy gate 切线和 wire.restore 后仍保留且保守 hold。
service/Ops 818 项通过，另追加 legacy-switch 定向测试；typecheck/import/diff 检查通过。
pending record/local conclusion/live action/run/Note I/O 的切线解耦仍未完成。
## 2026-09-10：双线嵌套委派实测与展示验收

隔离会话 `session_ad3d8070-7ad8-443d-af94-301c1303549c` 的真实模型调用已
终态 completed（busy=false）。主 agent 的两个 Agent 工具结果分别返回
`agent-0 / research-line:board-a` 和 `agent-2 / research-line:board-b`，均 completed；
A 返回了叶子反例提醒，磁盘同时存在 agent-0、agent-1、agent-2 的执行记录。
这是纯文本合成任务，不构成物理结果，也没有授权真实科研写入或计算。

不能仅凭模型口述认定整个任务树验收通过：此时公开 `/sessions/{id}/tasks`
返回空 items。下一步需核验同步 Agent 的关系/完成状态如何进入 Board，以及 A 叶子
的实际父身份和稳定 scope；同步委派是否应出现在该 tasks 接口仍需代码追踪，
当时未把空列表直接判作任务丢失，也未以单元测试替代此项真实展示验收。

后续已追踪并实测闭合该疑问：`routes/snapshot.ts` 从 metadata 输出
`agent_relationships`，从 broadcaster 输出同步委派 `subagents`；后台 tasks
列表不是同步委派的唯一事实来源。公开 snapshot 确认 main→agent-0→agent-1
均属于 board-a，main→agent-2 属于 board-b，三个 subagent 均 completed。
真实 Playwright 页面显示三行 “Task completed”，A 叶子缩进 16px，两个顶层为
0px。选择 A 只显示 A 父子两行，选择 B 只显示 B 一行；浏览 B 后 REST 执行前台
仍为 board-a，没有发生隐式切线。无 pageerror。脚本
`/tmp/hakimi-note-live-0hsgIJ/tree.mjs`，截图同目录 `tree.png`。
首次浏览测试未展开默认折叠的 collaborators details 而超时，修正测试操作后通过，
没有为通过测试修改产品组件。此项证明当前热进程的真实委派及页面归属；
进程重启后的 cold restore、迟到结果以及最终日常安装仍需各自证据。

实际 cold restore 已执行并发现缺口：公开 idle 查询确认隔离环境五个会话均不忙，
仅终止 58653 的测试进程 PID 8145（正常 exit 0），以同一 home/源码重新启动。
同一 session snapshot 保留三个准确的 parent/scope，但 `subagents: []`。
源码原因明确：`SessionEventBroadcaster.createState()` 创建空
`SubagentRosterTracker`，没有从历史重建；tracker 原本是仅用于本次 turn 的实时
roster，下一 main turn 会清空。Research Board 却将它与 metadata 关系合并来表达
跨 turn 的协作树，所以热态通过不代表持久完成状态通过。

修复边界：保留实时 roster 的既有聊天语义；给 Board 使用的历史执行投影补上可靠
来源，不能以 agent 存在或进程空闲推断 completed，更不能复活历史 running。
需覆盖旧完成/失败、未知或中断、后续 turn、嵌套及跨线，并复用这次同一真实会话
再次冷恢复验收。不要增加每次快照全历史数组扫描或新的研究状态机。

本次实现 `SubagentHistory`：复用 journal.open 的既有流式扫描建立可丢弃投影，
随后同一 dispatch queue 增量更新。只显示明确 terminal，缺少 spawn、跨 session、
malformed/volatile 事件不补造事实；新 spawn 撤销旧完成投影，detached 交回 tasks。
实时 roster 覆盖同 agent 的历史结果，原聊天实时 roster 生命周期未改变。
四个定向文件 28 tests passed（9.49s），kap-server typecheck 通过；包含实际日志
close/open 重建测试。只重启确认空闲的隔离 58653，原真实合成会话公开 snapshot
恢复三个 completed 及原时间，Playwright 再次确认三行、A 叶子 16px 缩进、A/B
浏览隔离及执行前台不变，无 pageerror。没有再次调用模型或修改 AITP。
这不是整个 G1–G7 完成证明；更广的晚到/复用 agent 和压缩恢复仍需后续验收审计。

晚到审查发现旧 `subagent.completed/failed` 事件只有 agent ID，无 execution ID。
历史投影已保守拒绝第二次 spawn 后无法归属的 terminal，避免旧完成覆盖新执行；
新增同 agent 再 spawn→旧 completed 的断言，4 项 history 测试通过（171ms）。
这只是防止误报，不代表复用任务恢复完整：仍需将已有 execution/run 身份贯通到
历史投影及实时 roster，允许明确的新执行结果正常恢复。不得把永久 unknown 当作
该需求完成，也不得从时间戳或文本猜测结果属于哪次执行。

后续源码已将 mirror 既有 UUID runId 作为可选字段附到 started/completed/failed，
不复制内部指标或新增任务生命周期。SubagentHistory 和实时 roster 将 terminal
与最新 started 身份比较；新 spawn 到 started 的窗口也不接受带旧 runId 的结果。
旧首次运行仍兼容无 ID 事件，旧复用且无 ID 的记录不猜测。
服务器定向 24 passed（9.23s），core mirror 11 passed（370ms），kap typecheck
及 diff 检查通过。原 mirror 测试明确断言 UI 事件不含 runId，已针对本次新增身份
契约改为断言 started/terminal 与既有内部 runId 相同，保留隐私指标断言。
Web WS reducer 尚未核验，真实复用测试尚未执行；隔离运行进程也尚未 reload 本次字段。

Web 后续已接通执行身份：可选 snapshot `run_id`→AppTask.subagentRunId，projector
在 snapshot watermark 后 seed roster（含 main turn 为 null 的分支），started
记录身份，completed/failed 在更新 taskCreated/taskCompleted 前拒绝不匹配 ID。
Web 54 passed/typecheck 通过；server 24 passed（8.75s）。canonical Web build
521 files 通过（source `7b85066614f966440926b72480180b207a6db54e4cdc84a1a7db7310a88765c1`），
本次 check 模式复核及最终安装尚未完成。仅确认空闲后重启隔离 58653 到 server-r5；
已发起同一个合成会话恢复 agent-0 的单句任务，不新建 agent、不做科研 IO。
结果需继续查询该会话，不能将请求提交等同完成，也不能重复提交。

该复用请求已终态 completed：原 agent-0 / board-a 返回“反例提醒不是实际反例”，
未新建代理。run_id `15f698fb-73b1-46b3-9266-c42a6ed2b35a`，started
04:31:40.800Z、completed 04:31:44.378Z（约3.6s；不含主模型调度时间）。
warm snapshot 与 Playwright 均显示新说明，原 agent-1 / A 叶子和 agent-2 / B
保留；随后确认所有测试会话 idle，仅重启隔离 daemon 至 server-r6，再次公开
snapshot 与页面得到同一 run_id、时间、结果和父子/跨线关系，browse B 不改执行 A。
没有再次调用模型。apiSurface 3 passed；build:web-assets -- --check 验证521文件一致。
这闭合了真实复用与cold restore的正向案例；人为注入迟到事件仅有分层测试证据，
不能声称已在真实模型网络中制造迟到。日常安装及其余 G1–G7 验收仍未完成。

Web 歧义树回归共 157 passed，typecheck 通过，style 检查通过但仍有既有 28 项
baseline findings。canonical build 和 `build:web-assets -- --check` 均通过：
521 files，source `48c39c9b7783e216903b7b30ad94befaa46cf9bb4fb4f6131be8eee1b3b7f5e3`。
此结果只证明当前源码构建一致，不代表日常安装已完成。

## 2026-09-10：pending checkpoint 与前台选择解耦

待保存 checkpoint 本身不再阻止切线；切线保留完整 checkpoint（包括未捕获归属的
旧记录），不会把新前台当成其保存目标。自动 foreground 修复不再仅因 checkpoint
或人类决定而覆盖有效前台选择；缺失/无效前台仍修复，live action 的旧约束暂保留。

core service 717/717 通过（单 worker 3.23s）。覆盖 captured/legacy checkpoint
往返切线不变、零 save、观察在途切线后旧 prepare 不执行、重复选择不重复切线。
真实 mode 下首次切线正常触发新线观察（enter 总计 2 次，非反复阻塞/重试）。
迟到旧观察不会把当前新线降级；原始失败样本帮助定位自动切回行为。
在途 Note I/O、local conclusion、live action/run 的切线约束仍未整体解耦；
此处不代表捕获写入在任意浏览状态都已可执行，也不代表最终安装验收完成。
## 2026-09-10：保留 action/run，前台投影按 Line

切线保留 live action 以及已有 run（包括在别线浏览期间到达的终态），不完成、
放弃或取消；保留其原始 action ID/line/job 身份。有效前台不再被旧 action 自动拉回。
snapshot 的 currentAction/currentRun/phase 按前台 Line 投影，旧对象仍在 working state。
Goal scope 不再混合新 Line 和旧 focus question ID。

service + Ops 822/822（3.65s）、import/diff 检查通过；核心 typecheck 通过于
projection 修改后、末次追加 run-preservation 测试前。覆盖 planned action 往返切线、
真实旧双线 fixture 冷恢复不改用户选择、run 迟到终态保留且不在别线显示。
初始新增 run 测试遗漏原 Line 创建，修正为明确 run-origin 后验证，不冒充旧未知归属验收。
local conclusion、在途 Note、未知历史归属展示及最终 UI/安装仍未完成。
## 2026-09-10：local conclusion 不锁住前台

移除仅用于切线的 localConclusion 拒绝，switch op 保留结论及其 action/progress。
自动 checkpoint 提案仍要求原始 Line/绑定适用，浏览别线不构成 adoption 或保存授权。
service/Ops 824/824（3.67s），新增 scoped/unscoped 两类结论切线与 restore 原样保留、
零 prepare/save、无自动 checkpoint；import/diff 检查通过。

G4 定向检查：ResearchLoopCoordinator 仍按本地 revision/action ID 差异强制 turn-end
refresh；Session coordinator 的非 force 缓存无时效上限。不能简单改 force=false，
否则可能长期复用陈旧证据。下一步需把实际保存/未知回执的失效路径与刷新复用一起
处理，再减掉 UI-only 刷新，保留外部变化/未知新鲜度的复核。
