# 研究模式

研究模式（Research Mode）只保留两件对持续研究有用的事：**本地知识层——现在知道什么**，以及**研究长期记忆——怎么走到这里**。它不管控每一步科学工作，也不要求先建研究看板才能开始。

::: warning 注意
该架构**已在本地实现、安装，并在本工作区内完成验证**。Research Mode 使用官方 [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) 0.10.0 Skills 与 CLI，固定源码 commit `3bebd4cc0fe786ea30420ab45692d8968cc0990b`，对应 `aitp/adapter-contract-0.3`。这是源码归档，不是 Git checkout，也不是 release tag。**新启动**的 `hakimi` 进程使用本工作区构建产物，该产物当前链接为 CLI wrapper；已在运行的进程需重新启动才能加载新代码。未强行重启任何用户会话。CLI、core 与 Web 测试已在本工作区全部通过，默认模型只读 smoke 恢复记忆时知识与 ledger 零变化。尚未声称正式发布或完整 server+browser 端到端通过。见[本次兼容性说明](../../aitp/compatibility-matrix.md#research-memory-lite-20260913)。
:::

## 本地知识层与长期记忆

这两层回答不同的问题，不在 Hakimi 中再建一套研究数据库。

- **本地知识层**说明当前理解：结论、假设、开放问题、来源与适用边界。Agent 用 `Read`、`Grep`、`Glob`、`Edit`、`Write` 读写普通项目文件。
- **长期记忆**保留值得记住的进展：结果的证据、走不通的路线、认识的变化、重要决定和可复用方法。官方 AITP Skills 指导 Agent 通过官方 CLI 维护 Entry/Note 记录。

从已有项目的 `AGENTS.md` 和 `README` 索引开始，沿用它的文件命名与组织方式。Research Mode 不强制新目录模板，也不在父级工作区另建知识库。每条研究线可以是一个独立 Git 仓库：知识正文与其 `.aitp/` store 都在该仓库内，全局研究索引只作可选导航，不是需要依赖的父级 store。各仓库沿用自己的目录名，不强制固定 `knowledge/` 布局。即使 AITP 不可用或模式关闭，既有项目知识仍可正常使用。

整理摘要时保留来源和工件链接，区分证据与解释，并说明仍有哪些不确定性。保存了记录或写出了简明知识页，都不等于科学结论已经正确。

## 打开与关闭研究模式

开关只控制轻量研究指引和官方 AITP Skills 的可见性，不决定是否允许开展普通科研工作。

| 命令 | 用途 |
| --- | --- |
| `/research on` | 启用轻量模式，让已发现的官方 AITP Skills 可见 |
| `/research off` | 关闭模式并隐藏这些 Skills；保留已有知识和记忆 |
| `/research status` | 读取本地模式状态，不运行 AITP CLI |

新会话默认关闭 Research Mode。打开模式不会安装 AITP、初始化存储、探测 CLI、写账本或调度下一轮模型响应。状态读取、会话恢复和普通轮次边界也不触发 CLI 维护或账本写入。on/off 状态不是 AITP 已安装或健康的证明。

不再有独立的研究管理或推进命令流程。旧 Line、Question、Action、alignment、checkpoint 命令不再支持；历史记录不会开启第二套 legacy 执行模式。其他接口细节需以实际后端实现为准，不能从旧命令列表推断。

## 怎样使用知识与记忆

正常开展工作，只在有用记录发生变化时保存。检索、计算、讨论或编辑文件之前，不要求登记 Line/Question、走 Action 生命周期或建立 host checkpoint。

1. 按项目既有索引读取相关知识。需要回答历史依据时，按需回读 AITP 证据；读取不要求先有新结果。
2. 用普通工具完成任务，遵守现有权限规则。保留足以解释结果及其边界的来源和工件引用。
3. 出现新知识或值得记忆的进展时，更新对应项目摘要；需要持久记录时使用官方 AITP Skill。明确目标项目与记录作用域，不凭名称或路径相似就猜归属。
4. 说明实际保存了什么、保存在哪里、还有什么未经验证。保存失败时保留有用的本地证据，并明确长期记忆尚未保存；不编造回执，也不悄悄换作用域重试。

普通追问、换一种说法、询问状态或重复解释，**没有实质增量（delta）就不写知识文件，也不写账本**。打开模式、加载 Skill、结束一轮或完成 Goal，本身都不是保存理由。阶段综合或可复用经验可能在没有新计算时仍值得记忆，但不要为了完成汇报仪式而制造记录。

例如，追问某个近似为何成立，通常只需读取和解释；发现它在特定范围内失效，才可能需要修正知识页，并在 AITP 记录反例、假设和适用限制。判断依据是有用的新信息，不是工具次数或对话长度。

## 官方 AITP Skills 与 CLI

AITP 是外部协议的权威来源，不是 Hakimi 内置服务。官方 `using-aitp` 与 `distilling-methods` Skills 分别提供记录和可复用方法的指导；Hakimi 不复制它们的完整内容，也不增加保存后自动蒸馏协调器。

要使用长期记忆，部署环境需要在会话[技能目录](../customization/skills.md)中提供官方 Skills、可运行的官方 CLI，以及目标项目已经初始化的 AITP 存储。安装与具体命令语法遵循[固定源码版本的上游说明](https://github.com/bhjia-phys/AITP-Research-Protocol/tree/3bebd4cc0fe786ea30420ab45692d8968cc0990b)。Research Mode 不自动安装、初始化、adopt、inventory 或 backfill 项目。固定的上游 CLI 可以从祖先目录解析 store，Git 边界本身不保证隔离。另行测试的本地派生版 `0.10.0+repo.1` 才增加最近 Git 根边界，并在没有本地 store 时报告 `not_initialized`，而不是借用父级 store。链接中的上游基线不包含该补丁，模式开关也不提供它。无论使用哪种构建，读取或保存记忆前都要确认实际解析的 store 与目标作用域。运行官方 `init` 前先确认目标仓库，需要在仓库根创建 store 时用显式 `init --adopt`。不凭名称或路径相似推断归属。缺少 AITP 不阻止本地知识工作，也不能把未完成的记忆保存说成成功。

选定的 0.10.0 / contract-0.3 基线支持 **Entry 和 Note 两类记录的原子作用域保存**。遵循官方 Skill 与 CLI 的作用域前置条件、草稿和保存流程、校验及重试规则。这项原子保证属于带这些前置条件的官方 CLI 操作，不覆盖所有文件写入或整个科研会话。人工决定、方法批准与发布仍遵循官方协议，不由 Hakimi 自动代办。

## Goal、Plan 与权限

Research Mode 与普通 [Goal](./goals.md)、[Plan 模式](../reference/tools.md#plan-模式)、工具权限系统相互独立。Goal 继续负责跨轮次推进、预算与完成，Plan 继续按原规则组织工作。打开或关闭 Research Mode 不会创建或恢复 Goal，不改权限，也不增加 Research 专属的完成或续行否决。

旧 host 的 Action 归属校验与 canonical 文件 veto（额外访问否决）退役后，普通文件工具**没有额外的 Research 专属保证来阻止直接访问 AITP 正式记录文件**。维护这些记录应使用官方 CLI，但这条协议规则不是工具执行屏障，更不是操作系统级隔离。既有文件访问策略、工具审批以及实际配置的 sandbox 才是宿主的安全边界；关闭模式也不是安全隔离。

可选的 `theory-physics` 领域指引仍可帮助检查假设、推导、数值结果和证据表达。它不是第二套运行时，也不要求登记每一步科学工作。科学判断仍由研究者负责。

## 历史记录与退役控制层

这次改变的是架构，不是把 Research Board 做小。生产路径不再挂载 host ResearchService、Line/Question/Action 管理、Research Plan、checkpoint 机制、Research Loop、自动 maintenance、distillation 编排、Research Goal veto 或 native AITP adapter。

八个内置 wrapper——`aitp_enter`、`aitp_list`、`aitp_show`、`aitp_check`、`aitp_record_prepare`、`aitp_record_save`、`aitp_note_prepare`、`aitp_note_save`——全部退役。项目知识改用普通文件工具，长期记忆使用官方 AITP Skills 与 CLI。

SDK 快照、事件与命令的变化见[迁移指南](../release-notes/breaking-changes.md#research-mode-与-sdk-研究接口)。旧 Research 状态和记录通过原始会话日志或会话 export 只读查阅，不再提供结构化 Research history API 或 Manager。它们不再恢复为 live Action、pending checkpoint、binding 或并行的 legacy 工作流；旧 mutation 不再支持。已有 AITP 记录不删除、不迁移、不自动 backfill。会话撤销既不会回退新的模式开关，也不会撤回外部 CLI 保存。

## 本地安装与剩余核验

[本次跟踪说明](../../aitp/TRACKING.md#research-memory-lite-20260913)记录了已完成的测试与 review、本地构建、managed AITP 0.10.0 安装、built SDK 进程 smoke，以及最终默认模型只读记忆 smoke。实现已本地安装：CLI wrapper 指向本工作区构建产物，新启动的 `hakimi` 进程会使用它；已在运行的进程需重新启动，未强行重启任何会话。尚未执行 version、tag、publish 或正式发布，完整 server+browser 端到端也尚无独立实测。这些剩余边界不表示用户可见的 Research Mode 工作流未交付，也不认证任何科学结论。
