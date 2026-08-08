# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi 终端欢迎界面，像素风猫耳探索飞船" />
</p>

<p align="center">
  <strong>从 Kimi Code fork 演进而来的理论物理思维链科研 agent。</strong><br />
  <span>沿用上游工程基础——由 Hakimi 负责科研编排、分阶段 AITP 记忆集成和独立产品体验。</span>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">仓库</a> |
  <a href="https://moonshotai.github.io/kimi-code/zh/">上游 Kimi Code 文档</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Hakimi 是什么

Hakimi 是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 fork，紧跟上游 `main`。当前 `main` 提供稳定的 Hakimi 产品外壳，科研层则按明确里程碑逐步建设：Hakimi 负责 research loop、agent 编排、工具和交互体验；独立的 [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) 负责持久研究记忆和证据权威。

底层终端循环、工具、session、Skills、MCP、子代理、权限和 OAuth 继续来自上游 Kimi Code。历史上的深度内嵌科研原型保留在 [`aitp-research`](https://github.com/bhjia-phys/Hakimi/tree/aitp-research) 分支用于归档；它不是当前产品线的集成路径。

## 与上游的差异

- **品牌**：`hakimi` 命令、`Hakimi` 产品名、像素风猫耳飞船欢迎图标。本包**只**安装 `hakimi` 可执行文件——不会覆盖独立安装的 Kimi Code 的 `kimi` 命令。
- **独立主目录**：配置、session、日志、缓存都在 `~/.hakimi`（可用 `HAKIMI_HOME` 覆盖），与 Kimi Code 的 `~/.kimi-code` 互不干扰。
- **双向 session 共享**：`hakimi -r` 和 `/sessions` 选择器可以列出并恢复 `~/.kimi-code` 里的 Kimi Code session；新建的 Hakimi session 也会镜像进 `~/.kimi-code`（软链 + 索引行），未修改的 `kimi` CLI 同样可以恢复它们。共享仅在默认 `~/.hakimi` 主目录下启用。
- **独立发布通道**：更新检查和提示横幅都解析自 [`bhjia-phys/Hakimi` releases](https://github.com/bhjia-phys/Hakimi/releases)——包括 prerelease（`releases/latest` 永远匹配不到的那类）——而不是上游 Kimi Code 构建。Hakimi 使用独立的 semver 版本线（当前 `0.21.x`），有意不跟随上游 tag。
- **DeepSeek provider**：内置 `provider add deepseek` 一键配置及合理默认值，外加无鉴权的本地网页搜索兜底（DuckDuckGo/Bing HTML），没有配置 Moonshot token 时 `WebSearch` 依然可用。
- **子代理 preset**：`config.toml` 里的 `[subagent.agents.<类型>]` 和 `[subagent.presets.<名称>]` 可以固定各类子代理的模型与思维强度（oh-my-opencode-slim 风格），运行时用 `/preset <名称>` 切换。
- **传输身份**：provider 请求以 `kimi-code-cli/<版本> (hakimi)` 标识自身，Kimi for Coding OAuth 流程不受影响。

除此之外——功能、flag、配置 schema、行为——全部与上游 Kimi Code 一致。完整参考见[上游文档](https://moonshotai.github.io/kimi-code/zh/)；`[subagent]` preset 字段见 `docs/zh/configuration/config-files.md`。

## Roadmap（路线图）

**定位**：Hakimi 正在被建设为面向 DeepSeek、Kimi 等 reasoning 模型的理论物理科研 agent。它既要开发科研软件，也要在研究全过程中提出正确的问题、检验互相竞争的解释，并通过 AITP 保存有证据支撑的结果，而不是把 transcript 或原始思维链当成研究记忆。

### 已完成 · 产品外壳基线

品牌与欢迎 logo、独立 `~/.hakimi` 主目录、双向 session 共享、独立发布通道、DeepSeek provider、ChatGPT/OpenAI Codex OAuth（实验性）、子代理 presets。

### M1 · 产品外壳稳固化（进行中）

- 上游同步节奏制度化；完善发布与 CI 自动化。
- 延续 DeepSeek 模式，为更多模型提供一键配置。

### M2 · Hakimi research loop 基础

这一里程碑由 Hakimi 自己负责，不需要等待 AITP：

- 类似 Goal 的 **Research Frame** 保存当前科学问题、目标、焦点和阻塞。
- 类似 Todo 的 **Research Question Board** 追踪尚不知道什么、为什么现在重要、需要什么证据，以及问题处于开放、调查中、已回答、阻塞还是暂缓状态。
- 有边界的 research checkpoint 找出当前最大的认知缺口，只调用相关的独立子代理视角，并决定 Hakimi 应该检查代码、阅读文献、运行 benchmark，还是询问研究者。
- Goal 回答“要追求什么结果”，Todo 追踪“要执行什么动作”，research loop 则追问“下一步必须弄清或挑战什么”。
- 同一套循环在不同规模的课题上验证——从大型科研代码库到快速数值或解析检验；规模改变证据与行动，不改变方法论。

### M3 · 分阶段 AITP 记忆集成

[AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) 负责 `.aitp` schema、校验、持久化、provenance 和未来的图关系语义；Hakimi 负责编排、web/PDF 检索、推理、工具、UX 和临时私有缓存。集成边界始终是 CLI + 文件——不复制 runtime，不增加 SDK、API server、MCP server、daemon 或第二套账本。

**当前兼容状态**——最后核对的 AITP HEAD 为 `8658f6827288f4bb61e5c193a346f0f73ebbe3b2`：M0/M0.5 已完成，M0.6 进行中，后续阶段仍被 gate 阻塞。安装插件后，`/skill:aitp` 可以用 Python 3.11 或更高版本手动调用当前 CLI。Hakimi 原生结构化 adapter **尚未启用**：包括 `enter --json` 在内的当前命令响应没有携带版本化 transport schema，因此 adapter 必须 fail closed，不能根据“字段看起来相似”猜测兼容。

| Hakimi 轨道 | AITP gate | 集成状态 |
| --- | --- | --- |
| **H0 · 当前 CLI** | 当前 M0/M0.6 | 通过已安装的 AITP Skill 可用：`init`、`enter`、`inventory`、`record prepare/save`、`note prepare/save`。在 response envelope 版本化之前不启用原生结构化 adapter。Hakimi 绝不自动运行 `init`、`init --adopt` 或 `inventory`。 |
| **H1 · 检索** | M1a gate 后 | 消费 `aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1` 官方 golden fixtures；增加 closeout-first 恢复和 Note age 投影。`list`、`show` 当前不存在。 |
| **H2 · 关系与诊断** | M1b gate 后 | 增加 `aitp/lite-entry-0.2` 关系、typed resolution、派生 `used_by`、`aitp/check-report-0.1` 和 `aitp/run-pointer-0.1`。`check` 当前不存在；不迁移 0.1，也不维护第二个索引。 |
| **H3 · 科研记忆** | AITP M2–M4 gate 后 | 按 gate 顺序增加 reviewed artifacts、跨 Topic links 和 Skill-driven collaborator protocol。 |
| **正式契约** | M4 后 | 用 AITP versioned JSON 和扩展官方 golden fixtures 固化 Hakimi 兼容性。AITP 仍是 CLI + 文件；Hakimi 私有缓存永不写回。 |

当前持久化 schema 包括 `aitp/lite-entry-0.1` 和 `aitp/lite-note-0.1`，但它们标识的是 AITP 文件，不是未版本化的 CLI response envelope。当前不存在 `aitp/enter-0.1`、`aitp list`、`aitp show`、`aitp check`、`aitp search` 或 `aitp --version`。未采用 AITP 的 workspace 必须以明确的降级状态正常运行；没有用户请求时，Hakimi 绝不能擅自初始化或 adopt。

当前手动使用方式是安装插件并 reload：

```text
/plugins install /path/to/AITP-Research-Protocol/plugins/aitp-research-protocol
/reload
```

随后调用 `/skill:aitp`。Skill 会相对已安装 plugin root 定位自带的 `scripts/aitp.py`，并选择兼容的 Python 解释器，不要求系统中存在全局 `aitp` 命令。

**兼容维护规则**：任何关于 AITP command/schema 支持、launcher 发现、session lifecycle、Skill discovery 或 stage 状态的改动，都必须在同一 change 更新本 Roadmap 和 `README.md`。升级 AITP 后先核对 `--help`、版本化 schema 和官方 fixtures；绝不能把规划中的能力描述为当前可用。

### M4 · 物理推理与 insight

- 深度适配 DeepSeek / Kimi reasoning 模型：有边界的 thinking 管理、预算、中断和结构化呈现。
- Research checkpoint 根据阶段询问问题本身、已有工作、当前进度、最终目标、当前困境、眼下步骤是否成立以及是否存在 benchmark。
- 在高成本或影响重大的行动前，由相互独立的反驳、文献、物理一致性、数值和代码视角挑战当前主线。
- 物理检查覆盖近似、量纲、对称性与守恒约束、可解极限、收敛性、跨方法比较和文献 benchmark。
- 用户看到的是结构化 research trace——frame、问题、候选解释、证据、证伪条件和决策——而不是原始隐藏思维链。

### M5 · Web 与手机端

- web 界面展示结构化研究状态、检索研究记忆，并承载研究者决策 checkpoint。
- 手机远程操控：web 移动端 + 带强化认证的远程部署 hakimi server，包括批准 run、暂停/恢复、检查结果和反馈研究方向。

### M6 · 品牌与社区

双语文档、科研用例、评估与教程。

## 安装

预编译二进制和安装脚本发布在 [releases 页面](https://github.com/bhjia-phys/Hakimi/releases)：

```sh
curl -fsSL https://github.com/bhjia-phys/Hakimi/releases/latest/download/install.sh | bash
```

已有安装在终端里运行 `hakimi upgrade` 即可更新。

## 从源码构建

需要 Node.js 和 pnpm（经 corepack）：

```sh
git clone https://github.com/bhjia-phys/Hakimi.git
cd Hakimi
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code build
node apps/kimi-code/dist/main.mjs --version
```

打包可安装的 tarball：

```sh
mkdir -p dist-pack
corepack pnpm --config.engine-strict=false -C apps/kimi-code pack --pack-destination ../../dist-pack
npm install -g ./dist-pack/bhjia-phys-hakimi-0.21.0.tgz
```

> Windows 上首次启动前请安装 [Git for Windows](https://gitforwindows.org/)，Hakimi 使用自带的 Git Bash 作为 shell 环境。Git Bash 装在自定义位置时，把 `KIMI_SHELL_PATH` 设为 `bash.exe` 的绝对路径。

## 开发

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

目录布局与上游一致：CLI 在 `apps/kimi-code`；当前 kap-server 运行时在 `packages/agent-core-v2`，`packages/agent-core` 保留为 legacy engine；模型 provider 在 `packages/kosong`，SDK 在 `packages/node-sdk`。

## 许可证

MIT。上游 Kimi Code © Moonshot AI，见 [LICENSE](LICENSE)。
