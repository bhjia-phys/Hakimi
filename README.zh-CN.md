# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi 终端欢迎界面，像素风猫耳探索飞船" />
</p>

<p align="center">
  <strong>Kimi Code 的产品外壳 fork，拥有自己的身份。</strong><br />
  <span>同一个 agent 运行时——Hakimi 品牌、共享 session、独立的发布通道，以及少量额外的便利功能。</span>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">仓库</a> |
  <a href="https://moonshotai.github.io/kimi-code/zh/">上游 Kimi Code 文档</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Hakimi 是什么

Hakimi 是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 fork，紧跟上游 `main`，在其上叠加一层刻意保持精简的非科研"产品外壳"。agent 运行时——终端循环、工具、session、技能、MCP、子代理、权限、OAuth——就是上游 Kimi Code；Hakimi 改变的是产品的外观、数据存放位置和更新方式。

> 曾经在 `main` 上的 AITP 理论物理科研运行时现在位于 [`aitp-research`](https://github.com/bhjia-phys/Hakimi/tree/aitp-research) 分支，不属于这条产品线。

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

**定位**：Hakimi 是面向理论物理科研的 agent，针对思维链（CoT）模型深度适配。它既开发物理算法代码，也通过基于 [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) 研究记忆账本的类人科研工作流获得物理洞察。

### 已完成 · 产品外壳基线

品牌与欢迎 logo、独立 `~/.hakimi` 主目录、双向 session 共享、独立发布通道、DeepSeek provider、ChatGPT/OpenAI Codex OAuth（实验性）、子代理 presets。

### M1 · 产品外壳稳固化（进行中）

- 上游同步节奏制度化；完善发布与 CI 自动化。
- 延续 DeepSeek 模式，为更多模型提供一键配置。

### M2 · 科研记忆集成（依赖 AITP M0.6 → M4）

- 采纳 AITP「Hakimi contract」：CLI + 文件接口——Hakimi 负责 web 检索、PDF 阅读、推理与私有缓存；AITP 负责研究账本。
- 通过进程边界的薄桥（`aitp enter/record/note` 工具）与 AITP 方法论 Skills 集成——绝不在 Hakimi 内部重写 AITP。
- 安装脚本捆绑交付 AITP；集成先置于实验 flag 之后，成熟后再默认开启。
- 冻结并归档旧 `aitp-research` 分支；科研线基于新 AITP 重建。

### M3 · 思维链深度适配

- DeepSeek / Kimi reasoning 模型深度适配：thinking 管理、预算与展示。
- 物理推导专用 CoT harness：结构化的假设 → 推导 → 验证链。结论与证据经 AITP 契约落账；原始推理链不进账本。

### M4 · 统一科研工作流

一套方法论——假设 → 推导 → 验证 → 记录——在各类规模的课题上验证，从大型代码库（librpa 级）到快速数值检验。物理洞察方式保持一致；课题规模只改变记录内容，不改变工作流结构。

### M5 · Web 与手机端

- web 界面中的思考过程可视化与研究知识检索。
- 手机远程操控：web 移动端 + 带强化认证的远程部署 hakimi server。

### M6 · 品牌与社区

双语文档、科研用例与教程。

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

目录布局与上游一致：CLI 在 `apps/kimi-code`，agent 运行时在 `packages/agent-core`，模型 provider 在 `packages/kosong`，SDK 在 `packages/node-sdk`。

## 许可证

MIT。上游 Kimi Code © Moonshot AI，见 [LICENSE](LICENSE)。
