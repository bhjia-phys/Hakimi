# Hakimi

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

只有一项行动能够改变接下来应当相信什么或做什么时，问题才构成科研。这条闭环是工作方法，不是必须登记的 host 状态机：行动有边界，结果有证据和限制，下一步应能区分现存可能性。

## 研究支持

- **本地知识：** 用普通文件工具维护结论、假设、来源与开放问题，沿用项目既有索引。
- **长期记忆：** 通过官方 AITP Skills 与 CLI 保存值得记忆的进展；该架构已在本地实现并安装，正式发布和剩余验收缺口见下文记录。
- **科学优先：** 保留证据和不确定性，不把工具活动、轮次数量或保存记录等同于科学进展。
- **按需组织工作：** 普通 Goal、Plan、工具权限各司其职，不增加逐步科研审批或第二套推进引擎。

## 理论物理研究规程

可选的 `theory-physics` domain pack 提供理论物理方法指引：讨论未知、回读证据、检查推导与数值结果，并解释限制。它不要求为每一步创建 Line、Question、Action 或 Research Plan。需要长期记忆时，遵循外部 `using-aitp` 与 `distilling-methods` Skills，不在 Hakimi 复制第二套协议；回读既有记录不要求先有新结果。

普通的一次性物理问答不需要 Research Mode。这个 pack 提供的是规程而不是物理预言机：它不是文献库、物理正确性服务、调度器、第二套 runtime、账本或后台自主 loop。研究者仍然负责物理约定、重要性判断和最终的科学结论；AITP 仍是协议 authority。

## 先有证据，再谈确信

Hakimi 可以帮助构建论证、计算、代码、检索和测试，但这些都不能单独认证一个物理主张。Hakimi 不认证物理正确性、数值收敛性或正在运行的外部任务是否成功。

人工审阅和可复现验证是科研闭环的一部分，而不是最后装饰性的步骤。证据不足或彼此冲突时，诚实的结果应当是不确定性、被阻塞的问题，或一项更小的判别性检验。

## Research Mode 与 AITP

**已在本地实现并安装；不声称正式发布或完整端到端验收。** Research Mode 已采用本地知识层与研究长期记忆架构，不是把 Research Board 做小。普通项目文件回答**现在知道什么**，官方 AITP 记录保留**怎么走到这里**。沿用项目已有的 `AGENTS.md` 与 `README` 索引，不强制新的目录格式。

`/research on`、`/research off`、`/research status` 只控制或查看轻量模式和官方 AITP Skills 可见性，不安装或运行 CLI、不初始化存储、不写账本、不启动后台 loop。会话恢复和普通轮次边界也不自动执行 AITP maintenance。本地知识用普通文件工具；有新知识或值得记忆的进展时，才按需通过官方 Skills 与 CLI 保存。普通追问没有 delta，就不写知识文件或账本。当前 CLI wrapper 指向本工作区构建产物，因此**新启动**的 `hakimi` 进程会使用新实现；已在运行的进程要重新启动才会加载新代码。未强行重启任何用户会话。

选定的上游源码是 [AITP commit `3bebd4cc0fe786ea30420ab45692d8968cc0990b`](https://github.com/bhjia-phys/AITP-Research-Protocol/tree/3bebd4cc0fe786ea30420ab45692d8968cc0990b)：版本 0.10.0、`aitp/adapter-contract-0.3`，支持 Entry 与 Note 的原子作用域保存。它来自源码归档，不是 Git checkout，也不是 release tag。官方 `using-aitp`、`distilling-methods` Skills 仍是协议依据；Hakimi 不复制协议，也不自动批准或发布方法。0.10.0 插件已作为 managed plugin 安装到本地 Hakimi home；实际安装的是下面的本地派生版。

实际安装的是**本地派生版 `0.10.0+repo.1`**，不是上游 release。其 base 仍是 commit `3bebd4cc0fe786ea30420ab45692d8968cc0990b`，`aitp/adapter-contract-0.3` 不变。派生只增加一处 AITP 自身的仓库边界修复：`resolve_root` 现在在最近的 Git 根停下（`.git` 文件，或含 `HEAD` 的 `.git` 目录），不再跨过它去找父 store。因此没有 local store 的 Git 仓库 `enter`/`check` 会报 `not_initialized`，不借用上层 memory；显式 `init --adopt` 可在仓库根创建 store。已有 store 与仓库内子目录行为照旧；无 Git、或 `.git` 目录为空/损坏时，仍保留原祖先继承。不新增 CLI flags、registry、host hook 或数据库，也不是 OS 级隔离。一研究线对应一个 Git 仓库：知识正文与其 `.aitp/` store 都在该仓库内，全局研究索引只作可选导航，各仓库沿用自己的目录名，不强制固定 `knowledge/` 布局。

已实现的后端生产依赖图不再挂载 host ResearchService、Line/Question/Action 管理、Research Plan、checkpoint/loop/maintenance/distillation 机制、Research Goal veto、native adapter 或八个 `aitp_*` wrappers。历史记录通过原始会话日志或会话 export 只读查阅，不再提供结构化 Research history API 或 Manager。旧研究管理及推进 mutation 不再支持，不提供第二套 legacy 执行模式。已有 AITP 记录保留，不自动迁移或 backfill。

普通 Goal、Plan 和权限行为不变。取消 host Research veto 后，普通文件工具没有额外保证阻止直接访问 AITP 正式记录文件：官方 CLI 校验只约束它自己的操作，不覆盖所有文件写入，也不是 OS 级隔离。默认模型的一次只读 smoke 已跨进程恢复来源固定的记忆，知识与 ledger 零变化，未启动 Goal、Plan 或 subagent；这是单个 fixture，不是科学结果，也不代表普遍模型适配。使用方式和剩余收口项见[研究模式指南](docs/zh/guides/research-mode.md)与[部署记录](docs/aitp/TRACKING.md#research-memory-lite-20260913)。

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

在交互式会话中，用保留的基本命令打开、查看或关闭 Research Mode；轻量版行为仍待部署验收：

```text
/research on
/research status
/research off
```

使用 `/login` 配置可用的 provider。配置 DeepSeek 时运行 `hakimi provider deepseek`。登录必须显式触发，Hakimi 不会在启动时自动开始 OAuth 登录。配置、session、日志和缓存默认保存在 `~/.hakimi`；设置 `HAKIMI_HOME` 可使用其他数据目录。

Windows 用户首次启动前请安装 [Git for Windows](https://gitforwindows.org/)。Hakimi 使用其附带的 Git Bash shell；如果 Git Bash 安装在其他位置，请将 `KIMI_SHELL_PATH` 设置为 `bash.exe` 的绝对路径。

## 当前状态

- Hakimi 是可从源码构建的开发版本。
- Research Mode 的知识与记忆工作流已在本地实现、安装，并在本工作区内完成全套测试；运行中的 Hakimi 进程需重新启动才能加载。尚未声称正式发布或完整 server+browser 端到端通过。可选的 `theory-physics` pack 仍可能变化。
- 当前没有公开 npm 包或 release installer；请使用上面的源码构建路径。
- Hakimi 不取代专家判断、人工审阅或可复现的科学验证。

## 文档

- [快速开始](docs/zh/guides/getting-started.md)
- [配置](docs/zh/configuration/config-files.md)
- [Research Mode](docs/zh/guides/research-mode.md)
- [历史理论物理合作者规划与验收记录](docs/aitp/theory-physics-collaborator-program.md)
- [历史理论物理合作者与 Research Loop 设计](docs/aitp/theory-research-agent-design.md)
- [AITP 本次兼容性说明与历史记录](docs/aitp/compatibility-matrix.md#research-memory-lite-20260913)
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

使用 Node.js 24.15.0+ 并安装工作区依赖后，一条命令即可打开源码开发版 Web UI：

```sh
./dev
# 在仓库根目录也可以：pnpm dev
# 在父目录可以直接：./Hakimi/dev
```

命令会启动源码后端和 Vite 前端，按实际端口自动连接并打开浏览器。端口占用时自动顺延，不影响已有实例。修改前端会热更新；修改后端后重新运行命令。Ctrl+C 只停止本次开发实例。加 `--no-open` 仅打印访问链接、不打开浏览器，`--help` 查看端口选项。Windows 下使用 `node dev` 代替 `./dev`。

开发实例沿用正常的 Hakimi 数据目录和配置（包括已有会话），并非隔离测试环境。需要隔离时，把 `HAKIMI_HOME` 设为单独目录。普通 `hakimi` 命令和 `pnpm dev:cli` 保持不变；后者启动源码 TUI，不启动 Vite 前端。

CLI 位于 `apps/kimi-code`；其他 package 提供应用使用的 SDK、模型/provider 集成和 agent runtime。

## 许可证

MIT。详见 [LICENSE](LICENSE)。Hakimi 保留 Moonshot AI Kimi Code 工作所需的上游署名。
