# NiO cRPA 单线真实科研验收

2026-09-09，进行中，不能作为完整科研或 Research Loop 验收通过的声明。
用户已取消旧 Goal，暂缓多线验收；本轮由 Hakimi 做科研，Codex 监督并修复
实际阻碍推进的 harness。不修改原会话，不以单测替代科研结果。

## 会话与运行版本

- 原会话：`session_4a3e95bc-8e0a-4fcf-aac9-2e052c3ac26e`（crpa）。
  原始用户消息要求非 dd 模型、NiO G0W0 能带、Panda/Jiang benchmark 的 J、
  U 解析延拓；后续明确要求不做额外 SHA/哈希审查，并授权实施、继续。
- 新会话：`session_eaf6e8aa-6770-48a1-b2a4-1040d1ffffa1`，仅 crpa 线，
  显式绑定已有 AITP crpa workstream，Research Mode ready。
- 使用隔离 localhost:58641 源码服务及 openai-relay/gpt-5.6-sol，
  不是用户安装版的验收；未重启用户 daemon。
- Hakimi HEAD `cdf5f1638430751d19f8e3bcde71d508a74e8739` 加当前 dirty changes；
  AITP HEAD `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`，插件 0.9.0，
  adapter contract 0.2，Python 3.12。版本号本身不证明源码已安装。

## 科研路线与完成条件

1. 恢复断点：以原会话、当前 AITP 记录和实际代码为依据，区分实现、作业完成、
   数值验证与物理结论。规划入口是 GW 工作区
   `crpa/plan/2026-09-08-nio-nao-panda-gw-benchmark-plan.md`。
2. 优先复用已有 16 点输出：检查精确本地归档，核实 pair-index 和共轭约定，
   提取两 Ni 的 J 矩阵及频率依赖；合成张量、对称性和单位检验通过后才接受
   后处理实现。已有 dd 数据保留 diagnostic 标签，不凭吻合或旧计划判定正确性。
3. 非 dd 联合测试：明确 dd、d-dp、dp-dp、eg-dp、eg-eg 中局域输出、构造窗口、
   排除跃迁的区别；先做最低成本区别性测试，再复用共同 KS/RI 输入。
   汇总准备和提交不等于保证一次作业能完成全部计算；实际资源边界先核实。
4. NiO G0W0：核实可共享输入及独立缺项，得到可比较的能带结果。不能把局域
   cRPA U 或约束屏蔽 Wr 当作完整 GW 所需 W。J 对照论文定义，不能混淆 U'。
5. U(omega)：虚频数据先检查可用性，再做延拓稳定性、频率区间与物理限制说明，
   输出曲线；最低正虚频值不是 U(0)。最后记录结果、依据、失败与改变原因，
   从新上下文验证 AITP 可找回。必要方法卡不是强制每轮产物。

## 已观察到的进展与问题

Hakimi 已从记录恢复 3267331 的 nfreq=16 张量与 checker 断点，定位本地
`.scratch/nio-nfreq16-orbital-report-20260907-r2/summary.json` 和相关 CSV。
历史记录中的 bare Ubar=23.380800 eV、最低正虚频 Ubar=7.232335 eV；
这是 Hakimi 读取的历史结果，不是本轮新计算或独立物理验收。

实际摩擦与处理：

- 普通 `git status --short --branch` 被无 ResearchAction 拒绝。已增加精确
  本地只读命令识别，仍交普通权限系统处理，不放开复合 Bash、远程 Git 或写入。
  policy 94 tests 通过，service 定向 1 test 通过（694 skipped），core typecheck
  通过；隔离服务重载后真实查询成功。仍有一次普通审批，不能称零审批。
- 全 `.scratch` 的两个递归 Glob 各超时 20 秒；读取完整 100KB CSV 被截断。
  已监督改为精确归档路径和定向数据处理；尚不能声称通用自动优化已实现。
- 模型因没有原始张量 CSV 而建议访问远端，却刚读到 summary 的本地归档指针。
  已要求先检查 `raw/u-tensors-and-metadata.tar.gz`，不要从猜测的 README 缺失
  推断归档缺失。下一轮正在尝试真实 J 后处理，不再只做恢复计划。
- `GetResearchStatus` 遇到普通工具审批，已只批准该 crpa 查询；这是权限等待，
  不是科研或 AITP failure，尚未修改其默认审批策略。

## 第一次实际 J 后处理

Hakimi 创建并运行了新文件
`.scratch/nio-nfreq16-j-postprocess-20260909-r1/extract_j_from_archive.py`，
生成 `J_matrices.csv`、`diagnostics.json`。仅本地标准库后处理，无远端作业。
输出首末虚频平均值约 0.7767266059 / 0.9477171115 eV。

监督未接纳其首次 ConcludeResearchAction 的“索引/共轭验证通过”表述：
该合成测试是按同一索引赋值和读取，不独立证明索引对应物理 Hund J；
合成输入标称 Hermitian，却未检验该性质。已排队要求从实际 pair-density
代码和论文定义核对，并用独立复轨道/kernel 例子验证。上述数值仍为候选
诊断结果，不是最终 J benchmark；r1 文件保留，不覆盖。

随后 Hakimi 在 r2 新目录创建 `independent_complex_pair_test.py`，使用
独立复轨道和 Hermitian 正定 kernel 构造 pair densities，将直接交换积分
与生产张量约定的索引映射比较。实际执行通过，ordered-pair Hermiticity
最大差约 6.21e-17；没有覆盖 r1。此证据支持该有限模型中的代数映射，
不构成 NiO 响应、屏蔽或论文物理模型的整体验证。

这轮曾尝试再次 Begin，被已有 action 拒绝；之后模型自行沿用原 action
继续检验。未重置 phase 或伪造原 action 完成。另发现 theory-physics
Skill 的旧 Begin-before-read 提示与已放宽的普通 observation 路径不一致，
仍待定向整理，不能声称 prompt 去重与简化已经全部完成。

## J 结果的实际 AITP 闭环

新 Entry `entry-c30e6eb83090479896b3aaab7cee87f9` 已由 Hakimi 通过
`aitp_record_prepare → 编辑草稿 → aitp_record_save → aitp_show →
CommitResearchCheckpoint` 保存并读回。Checkpoint
`e6d79d2d-fe7b-4435-8f48-8038be4a564c` 返回 committed，原生回执确认
对比保存前基线的 scoped post-save check 已完成，不需要额外重复 enter/check。

保存前监督纠正了三条仍在开发源码的引用：改用已有 `sha256-once:` 语义，
沿用真实读取的 digest；r1/r2独立结果仍用严格 pin。未修改历史 canonical
记录。此轮也观察到五份证据逐次读取/审批/模型往返的成本，待简化提示和
正常只读许可体验；不能把这次人工监督的成功当作无人监督行为验收。

## 非 dd 推进中的监督发现

原实施计划在没有失败测试前拟引入 construction/response/target 三套字段。
监督要求先测试已有 dp parent-frame 选择路径，缺少字段名不是物理错误；
计划已修改并通过 review。尚未完成四模型数值验收。

随后现有 `test_crpa_projector_input` 因 MKL 动态库未找到而未启动，重建因
`icpx: not found` 未进入编译。模型拟把未跟踪源码与这两项环境错误记录为
durable failure 并要求用户接手；监督拒绝此过早结论，要求先加载已有 oneAPI
环境、运行原测试。未跟踪本身不禁止以当前内容为基线保留原文件、做精确局部
修改；真实冲突和并发变化才需停在受影响文件。没有伪造测试成功。

基于真实串行审批，源码默认低风险名单新增 `GetResearchStatus` 和
`ReadResearchCheckpointEvidence`。普通 deny/ask 仍优先，Research mutations
未加入。权限两文件 67 tests 通过，checkpoint production-executor 12 tests
通过（683 skipped），core typecheck 与 diff check 通过。最新修复尚未重载
或重装，不能把旧进程中的审批行为称为修复后实测。

## 安装验证

当前源码 CLI build、Web 521 个资产验证及 bundle smoke 通过。
已打包并安装到 `/home/bhjia/.local`；`hakimi --version` 为 0.21.0、
`hakimi web --help` 成功，安装 main.mjs 与刚构建的 bundle 逐字节一致。
安装跳过生命周期脚本，旧 package 备份在临时安装目录。
未重启用户 daemon；原进程仍可能运行旧代码。隔离科研会话仍在源码服务上，
不能将其实际科研结果宣称为安装包进程的完整验收。

## 非 dd 的首个实际测试增量

加载现有 oneAPI 环境后，原测试成功重建并通过（CTest 1/1，0.40 秒）。
Hakimi 随后保留相关原文件副本，局部扩展
`driver/test/test_crpa_projector_input.cpp` 的实际 overlap-loader → Handler →
Dataset 路径，覆盖 dd 与四个非 dd 模式的选中列数、站点分组、model variant、
direct-response-check 开关及其状态重置。新增版本再次编译、链接并通过
CTest 1/1（0.35 秒）。这是同一个测试可执行文件中的多案例，不称为五个
生产计算通过；没有把 loader 配置检查当作完整响应/输出数值验收。

该测试增量已通过公开 AITP 流程保存为
`entry-47bd86bfe99843998ce2530e8af2e418`，checkpoint
`f2da3e83-133c-48ad-b603-838a04cf0f68` 已 committed。
此阶段生产接口未因抽象字段缺失被重构；四模型远端计算、G0W0 和解析延拓未完成。

## Ni–O 跨壳层实现：进行中，尚未验收

Hakimi 当前 action `44d61890-38d2-4669-9756-3c5223f6f4e1` 正在实现
Ni–O 25×9 ordered-pair 收缩和 dp-dp 输出，复用已有 kernel/vertex 路径。
首次编译因 map 迭代器类型不匹配失败；同一命令随后仍运行旧测试程序，
因此该次 CTest 不能证明新补丁正确。监督已要求 build 成功才执行测试。

监督同时指出：当前复数 fixture 采用普通共轭转置的跨壳层断言，必须从
实际带 bra-pair 反转的张量定义重新推导，不能仅调整数据让测试通过；
分布式实现还需验证反向原子块及 rank-local 异常的集体传播，避免其他
rank 卡在 Allreduce。已经向运行中的 Hakimi 发出修正指令，尚未取得
修复后编译/测试结果，不计为已修复或已验收。

后续实际反馈：Hakimi 在同一 action 内修复迭代器类型，采用
`U_RL(dc,ba)=conj(U_LR(ab,cd))` 检查反向指标关系，并在 block contraction
后调用既有集体错误传播。新测试调用了 distributed 矩形 API 的正向及
反向原子块路径。使用 `set -e` 加载 oneAPI、单 worker 构建两项测试后，
实际重新编译/链接成功，CTest 2/2 通过（0.77 秒）。此证据仅覆盖单 rank
合成收缩与既有 loader 回归；尚未证明多 rank 异常处理、实际 NiO 文件
输出或材料数值正确。此前失败记录保留，不将旧 binary 的运行计入验收。

本次新增结果已由 Hakimi 保存为 `entry-ba7615f87d944488bef55daff22c815f`，
checkpoint `14e40ef5-d618-41ba-ac76-bb94a427100c` 返回 committed，含
原生 show 与 baseline-scoped post-save 验证回执。四份开发源码使用
`sha256-once`，新输入包 README 使用严格 pin。没有再次执行全库检查。
这次保存仍出现五份证据的逐次模型调用与普通审批，说明只读默认许可及
上下文精简尚须在重载后的进程实测；不能把人工监督的记录成功当作自动
高效率已验收。后续已排队定向核实原 3267331 的 16 频率输入、共享 KS/RI
和实际资源，暂不提交作业或修改原远端工件。

## 边界与未完成项

后续定向远端读取已确认：3267331 的 `result.json` 记录程序退出码 0，
失败理由为 `U metadata mismatch: n_frequency_nodes`，不是已证实的数值
崩溃。`evidence/job.sbatch` 指定 2 节点、8 MPI、每 MPI 12 线程、24 小时，
`sacct` 的 AllocCPUS=96 不得误称 96 MPI；实耗 16:51:02。producer 指向
`20260905-161000-nio-afm-full-dzp-k666-shrink-r8-07_NiO`，原 build 指向
`20260906-124229-librpa-nio-nao-login-r4`。这些是原 dd 运行证据，不是
新四模型资源已验证或新代码已部署的证据。新的实际输入/部署核实仍在继续。

J 虚频后处理、独立有限模型代数检验、非 dd loader 测试和三条 AITP 科学
记录已有实测证据；它们不等于论文基准或材料计算通过。Ni–O 新补丁、四模型
生产计算、G0W0、解析延拓以及新对话记忆恢复尚未验收。用户安装版已重装，
最新两项只读审批修复现已重新打包安装，运行中用户进程未重启。多线及嵌套验收暂停。
无 commit/push/清理；不覆盖原科研文件、历史作业或 unknown dirty changes。
真实日志留在隔离 home，不将配置、令牌、完整私人会话纳入版本控制。

## 最新只读许可修复的安装补验

随后以 Node 2 GiB 堆上限完成串行 CLI build、521 项 Web 资产检查和 bundle
smoke，打包重装到 `/home/bhjia/.local`。`hakimi --version` 返回 0.21.0，
安装后的 main.mjs 与本次构建逐字节一致。上一安装包保留在
`/tmp/hakimi-crpa-read-permission-DHWUp9oL/previous-installed-hakimi`。
没有重启用户 daemon 或仍在查询的隔离科研进程；因此低风险工具免重复审批
在新进程中的实际行为仍需验证，安装成功不能代替运行验证。

科学监督补充：已让 Hakimi继续原查询而非提前 Conclude；cRPA 目录缺少
G0W0 文件不代表 producer 没有这些产物。实际只读查询已找到 producer
`nscf_k666/OUT.20260905-161000-nio-afm-full-dzp-k666-shrink-r8_nscf_k666/vxc_out.dat`，
头部为 216 k 点、2 自旋、80 态；该导出根下未找到 `band_kpath_info`。
reader 兼容性与能带路线尚在核实，未据此宣称必须重跑 ABACUS。

全部隔离会话 idle 后，仅终止已确认监听 58641 的测试进程并重启同一
源码 launcher，用户 daemon 未动。原 cRPA 状态保留，继续真实课题时
`GetResearchStatus`（call_DUG6ZxKYQrvMxpJ4G2KuOolD）直接成功返回，无
审批等待，确认该项低风险许可修复已进入实际执行路径。证据读取工具的
免审批行为尚待下次真实 checkpoint 复测，不能由 status 工具结果代证。
同时观察到上一轮自然语言宣告查询结束但 Action 仍 in_progress，已要求
Hakimi 按真实 no-durable-delta 收尾；没有软件擅自标记科研 action 完成。

第 7 turn 的 step 1–4 日志进一步区分耗时来源：first-token latency 分别
约 75.8、72.9、19.4、80.1 秒，stream duration 约 1.4、15.4、9.2、11.7 秒。
这些观测表明该轮部分等待发生于模型/relay 返回首 token 之前，不能全部
归因于 Research guard 或审批。step 4 上下文约 129k input tokens（含 cache）。
step 4 创建 r2 目录的 Bash 因没有新的 in-progress action 被执行前拒绝；
旧只读 action 已结束，拒绝未造成文件修改。此处是未登记写入尝试，不是
普通只读误拦截；仍需观察模型恢复与减少额外往返，不能用放开任意 Bash 修复。

随后模型将旧 `minimal:<actionId>` 错填入新 action 的 `research_plan_id`。
监督纠正后，新 action `0ae2cfc6-2b1e-4253-88ea-3a6599859adb` 成功启动，
新 r2 目录已创建。源码已为三个 parent-plan 字段补充模型可见说明，明确
省略绑定与真实 Research Plan/milestone 的区别；未更改 schema 接受范围。
对应模型输入测试 2 passed / 693 skipped，core typecheck、定向 diff check
通过。补充 CLI patch changeset；此说明修正尚未重新打包/重载，不能声称
当前模型恢复是新工具说明带来的效果。

实际 r2 目录已有四个 `nfreq=16` 模型输入、暂存脚本、batch 脚本与 G0W0
准备说明。初稿仍将四模型串在 24h allocation 内，且用 `dirname "$0"`
找模板，不能保证 Slurm spool 执行时找到输入。监督要求改为一次提交的
四元素 array（并发上限 1、各自资源上限），显式传入包路径，并用本地
假执行程序从模拟 spool 位置验证四模型调度和输入/输出隔离。修正及该
dry-run 尚未返回，不将文件已写出视为可提交或科研计算已完成。

随后 r2 脚本修正为 `--array=0-3%1`，显式接收 PACKAGE_ROOT 与 STAGE_ROOT。
2026-09-09 11:22 UTC，Hakimi 的实际 Bash 调用
`call_jrQWOUJFWh7aXFb2hpTuE9se` 完成语法检查、16 频率检查和
`test_array_dry_run.sh`：四个模型均从模拟 Slurm spool 脚本执行，产生
各自输出，且共享输入链接正确。该测试使用假 MPI launcher 与假程序，
只验证本地脚本路由，不验证真实 MPI 环境、完整 producer、内存、数值或物理。
尚未提交远端任务。

部署前已再次读取 GW 的 AGENTS：新源码须从 exact commit 生成 archive，
当前 Goal 明确禁止 commit，故新二进制部署仍需要精确文件集合及用户授权，
不能换成无约束 dirty archive。已向 Hakimi 说明该边界，并要求收尾后
准备精确提交范围；独立的本地 U 解析延拓和稳定性诊断可以继续，不以该
部署权限问题为理由把全部科研标为 blocked。

该 preparation checkpoint 为 `5c15d62f-257c-449b-8ee4-5e876c89231e`。
prepare 已创建 `entry-a349cfa0e7dc46f193d7cd954d3f1781` 草稿；此时尚不能
把 checkpoint 内的 committedEntryId 字段当成 save 已完成，receipt 只有
prepare。模型随后以 `Grep target:|at:` 搜索整个 `.aitp/local/drafts`，
输出混入历史 Bi2Se3 等记录。这是引用格式已在当前模板给出后的多余检索，
尚无证据证明发生了错误写入。监督已纠正为读取本次 preparation 证据，
不把旧草稿当证据、不追加工程检查；该行为需列入后续效率/上下文回归，
不能仅靠更宽的工具封锁宣称解决。

随后三份 `ReadResearchCheckpointEvidence` 在同一批次成功返回，无逐项
审批：`call_P1EF1Ncbn1UTcuhC1M7wob5Q`、`call_Turj4kFSVMfUEIfDVQc2A3Gz`、
`call_KeeacCR8HEGICeNapsNGzB9f`，均绑定当前 checkpoint/revision 42。
低风险默认审批修复因此获得真实证据读取路径的复测。

发现并复现另一问题：`Write` 使用同一草稿的工作区绝对路径，被
checkpointDraftAccess 与 prepare 相对路径的字符串比较误拒绝。已指导
模型沿用 prepare 原路径继续；源码改为基于 Session workspace root 比较
等价路径，未放行其他草稿写入或改变 AITP save CLI。4 项定向回归通过，
涵盖当前草稿、外部/同名前缀目录、其他草稿及 Note lease 恢复边界。
普通只读观察规则未收紧。该源码修复尚未重装，当前真实会话的恢复不能
冒充新源码的运行验证。

core typecheck、lint:imports（1301 files）与 diff check 随后通过。
真实会话 `call_mVBCjDgrFc7ZPaYzMHho21Mg` 使用 prepare 的相对路径后
成功编辑原草稿，未重建 checkpoint，也未将拒绝记为科学失败。记录正文
与 save/Commit 仍待完成，不将草稿修改等同 canonical 保存。

2026-09-09 11:40 UTC，`call_964uIgOIgGVFgzWOVo9b7Acs` 返回 saved，
正式记录为 `entry-a349cfa0e7dc46f193d7cd954d3f1781`；仍等待模型执行
CommitResearchCheckpoint，不能将 save 回执代替宿主 cursor 已提交。
随后将 parent-plan 说明与草稿路径修复构建重装：CLI build、521 项 Web
资产检查、bundle smoke 通过；安装包/旧安装备份位于
`/tmp/hakimi-crpa-draft-path-HUmnieFo/`，安装版本 0.21.0，安装 main.mjs
与构建结果逐字节一致。运行中的测试进程和用户进程未重启，最新两项
修复尚未获得重载后的真实运行验证。

11:44 UTC，`call_1RdN8VLiYsuyDpOsCsxuXG92` 成功执行
CommitResearchCheckpoint；pending checkpoint 清除。宿主通过 show 和
captured baseline 对照的 scoped post-save check 验证记录，明确返回复用
receipt、不要仅因提交再跑 enter/check 的提示。本次准备结果至此完成
AITP 持久化闭环，不代表四模型远端计算、物理检验或全 Topic 健康。

所有六个隔离会话 idle、无 pending checkpoint 后，仅终止监听 58641 的
测试进程 PID 1851 并通过同一 launcher 重启，新 listener PID 19997；
用户 daemon 未动。cRPA 状态恢复为 ready，已开始 turn 8 的真实 U 延拓
尝试（`call_TYcLwhqPBu44oslnpX3dn47m`），新 Begin 使用 simple planning，
没有旧 minimal plan 误绑定。该成功受新版说明与监督提示共同影响，不能
作单独因果归因。绝对 draft 写入修复仍待下一真实 checkpoint 覆盖。

U 延拓初稿 `continue_u.py` 的监督审阅发现：未使用的二维数组进行三轴
transpose；synthetic 没有经过实际 fit_poles，只验证已知极点的线性回归；
虚轴数据与实轴曲线叠绘；名为 grid_eV 的字段实际保存实部 Ha；裸张量
高频极限未用，展宽只有一档。这些是模型生成的分析代码/验证问题，不是
Research 门禁错误。已在执行前拒绝该旧 Bash 请求并发送具体修正要求，
保持同一 action 继续，不将其宣告为已验证延拓或科学失败。要求对同一
实际拟合流程做独立合成/留出检验，分开虚轴与实轴图，显式单位、高频
裸值及节点/阶数/展宽稳定性，并保留原数据非被动的物理有效性限制。

实际运行 `call_l6NE6KhtcnvrUYzjgrfkOaq6` 后，r1 固定几何极点 ansatz
在独立合成数据上给出 holdout RMS 4.443459797 Ha、实轴最大误差
31.378544449 Ha，拟合 Uinf 23.454757099 Ha（真值 8.4 Ha），因此方法
未验证通过。已要求保留 r1 输出、在新 r2 目录复用或实现有依据的延拓
方法，先通过同流程独立合成检验，再给真实数据 Re/Im 曲线及稳定性；
不把方法失败归因于 NiO，不用文件生成替代科学交付，不关闭重开同一
研究问题的 action。真实 bare Ubar 约 0.859228556 Ha、bare J 约
0.0348557375 Ha，虚轴标量虚部上限分别约 1.87e-14/6.00e-17 Ha；这些
是该归档提取值，不能替代响应物理有效性验证。

Padé r2 在修正路径及玻色合成测试后，由 Hakimi 实际执行
`call_M0nu54Pwosnx8qTdcu4ves3i`：16 个训练点、4 个独立留出点，留出
RMS 4.11679081e-13 Ha、实轴最大误差 5.17162336e-10 Ha，合成高频值
8.399999999996107 Ha（真值 8.4）。真实数据的未约束完整 U/J Padé
却表现出高频趋零而非 bare 常数；全训练情形输出 NaN holdout 也不应
作为有效 JSON/已测误差。因此尚不验收真实谱，已要求新 r3 在实际函数
中处理已知 bare 渐近值（例如延拓 U-Ubare 后加回），验证同流程合成
及真实敏感性，保留 r1/r2，补 Re/Im 图和 CSV，不把诊断包装成物理结论。

r3 的真实调用 `call_ccHG7eFm1a0vjQRfn8Payimb` 完成 U-Ubare 延拓并加回
裸值：合成 holdout 9.14435651e-15 Ha、实轴误差 8.74731788e-11 Ha，
高频回到 8.4 Ha。真实 site0 Ubar n8 的 holdout 仍为 0.4156813234 Ha，
J 为 1.51854379e-5 Ha；全16点训练的 holdout 正确为 null。已人工查看
`pade-real-axis.png`，节点子集曲线差异明显，不能宣称真实物理谱稳定。
要求补 Im/低能窗口/精简诊断后结束此次尝试，转回响应物理有效性缺口，
不无限调拟合。JSON/CSV 留存完整曲线，原拟打印多组千点数组的 Bash
已被监督改为摘要输出；这是行为纠偏，不是已实现新的自动输出压缩功能。

截至 turn8 前30个结束步骤，wire usage 为 inputOther 961581、cacheRead
4940800、output 16373 tokens；首token等待累计468786ms，工具计数
Begin 1、Read 14、Edit 11、Write 3、Bash 7、Grep 3、Glob 2。该局部
观测包含模型反复修正和监督提示，不是完整会话成本或自动能力得分，
不能从单Action持续运行推断科研效率验收已通过。

### 2026-09-09 后续：诊断保存与新对话召回

U 延拓 r3 已补生成 `pade-low-energy-panel.png`（site0，0–30 eV，
eta=0.20 eV，all-8/12/16 节点数量比较）。Re/Im 最大节点差异：
J 约 0.168336/0.180569 eV，Ubar 约 15.685399/23.092662 eV。
这些是现有诊断曲线的敏感性，不是物理谱验收。收尾过程中出现 JSON
键 `0.20`/`0.2` 不一致和已成功使用 python3 后又调用不存在的 python；
均为模型操作失误，不归因于 Research 状态门禁。

`entry-01dedb49f1c64cca9834863e515bcc49` 经公开 record save 返回 saved；
checkpoint `6a051401-5eec-44fa-a104-7d28a0dd1ecc` 提交后 pending 清除。
本次草稿使用相对路径，不能算绝对 draft 写入修复的真实覆盖。

新建只读 Research Mode 会话
`session_239c5881-e04d-43cd-a613-ed03dd2986f9`，仅绑定 crpa，未提供答案
或 Entry ID，要求恢复近期非dd/J/U工作、有效性与缺口。首次调用 Skill 1、
GetResearchStatus 1、list 8、show 11；无 ResearchAction、无待批查询。
首次回答正确区分本地准备与远端物理结果，也未观察到跨线混淆，但遗漏
最新 J 提取和 r3 延拓诊断，因此完整召回不通过。

原始 result-list 输出共16条、10595字符，最前两条正是上述 r3 结果和
`entry-c30e6eb83090479896b3aaab7cee87f9`（J索引/提取验证）。两条并未
丢失或被工具截断；首次模型未 show 它们。提示回看已取得列表最前两条后，
模型仅 show 2 次即准确补回公式、数值及限制。此为提醒后恢复，不是首次
成功，也不是长期召回或提示优越性的统计证明。候选改善方向是问题各项
与较新相关证据的覆盖检查，不新增状态门禁、索引或逐条哈希校验。

部署只读调查确认：remediation checkout 有47个已跟踪修改及未跟踪
cRPA核心源码；CMake同时引用这些核心文件与已修改父模块。本会话五个
文件不足以代表可重建的完整变更。没有安全确定历史改动归属，未提交、
未部署；查询以 no_durable_delta 结束，未为普通查询新增科研记录。
需用户确认历史cRPA源码保留范围，随后才能确定部署来源；非dd真实远端
计算、G0W0能带、可靠物理U谱、首次完整召回仍未验收。

### 历史基线纠正与本地比较误拦截

后续已找到旧 dd nfreq16 运行对应的干净 r4 源码快照，因而上文
“需用户确认整个历史源码保留范围”不再是下一步前置条件。应让 Hakimi
对真实运行基线做定向增量比较，再确定依赖完整的修改和提交授权范围；
不能重启全脏树审计，也不能假定本次五个文件已包含全部依赖。

真实比较调用被 Research action policy 拦截：已有只读例外未覆盖
`git diff --no-index`。新增有限命令形状：
`git diff --no-index --no-ext-diff --no-textconv [--stat|--name-only] -- <path> <path>`。
两条路径限无 shell 展开的绝对路径或 `./` 路径。脚本包装、重定向、
配置覆盖、外部 diff、textconv 和远端 diff 不享受此例外，普通执行权限
仍生效；退出码 1 表示发现差异，无须包装为退出码 0。
这不是 OS sandbox，也不代表科学结果通过。策略测试 107/107 通过；
安装、私有实例重载和真实比较复测尚待完成。

后续私有源码实例已在会话空闲时重载。turn 12 的首个上述限定 diff
通过 Research policy，进入正常 Bash 审批；监督核对两个指定路径后批准，
实际输出头文件新增 21 行。没有新建 action 或 checkpoint。Bash 仍将
diff 的正常差异退出码 1 展示为 `isError`，已向模型解释，尚未修改通用
Bash 错误语义。此证据证明源码实例的单次比较可执行，不代表全局安装已
更新、整个增量已核对或已实现零审批。另跑既有 Git-status service 测试
1 passed / 694 skipped；typecheck、lint:imports（1301 files）通过。

后续完成 CLI build、521-file Web 资源校验、bundle smoke、打包和本地
0.21.0 重装；已安装 main.mjs 与构建输出逐字节一致。npm 首次阻止
node-pty 安装脚本，实际 PTY 测试失败；仅允许 node-pty 的一次性 global
rebuild 后，PTY 执行 echo 成功（exit 0）。旧安装保留于临时备份目录，
未重启用户服务。源码隔离实例独立运行。

turn 12 科研监督仍发现证据不足：模型只 diff 头文件后，按开发树 CMake
推断旧基线缺少父实现。该推断不被接纳；下一轮明确要求先逐项比较旧
快照与候选的 CMake/driver，再比较本次四个其余文件，不能把相对旧 Git
HEAD 的 dirty 状态当作相对实际 dd 快照的新增。逐命令 Bash 审批仍有
往返成本；本次修复不等于零审批或完整科研效率验收。

turn 13 的九次实际 stat 比较纠正了上述错误：两个主 CMake、overlap
reader、crpa task 与 r4 相同；projector loader 为 +130/-52，pair cpp
为 +92，U API 为 +84/-7，loader test 为 +91/-10，pair test 为 +73。
加上先前 header +21，已确认六个差异候选。模型随后给内容 diff 添加
`--unified=3`，四次被有限形状规则拒绝；监督要求省略此默认选项继续，
未重启服务或制造 action。这是命令形状规则脆弱性的真实失败证据，
不能算整体只读流程顺畅。内容级解释和隔离编译仍待完成。
