# 斜杠命令

斜杠命令是 Hakimi 在交互式 TUI 中提供的内置控制命令，涵盖账号配置、会话管理、模式切换、信息查询等操作。在输入框中输入 `/` 即可触发命令补全，候选列表随后续字符实时过滤；命令的别名也会一并参与匹配。

输入完整命令名后按 `Enter` 执行。如果输入的 `/` 开头内容不匹配任何内置或 Skill 命令，则按普通消息发送给 Agent。

::: tip 提示
部分命令仅在空闲（idle）状态下可用。会话正在流式输出或压缩上下文时执行这些命令会被拦截，需先按 `Esc` 或 `Ctrl-C` 中断。下表「随时可用」列标注了流式输出期间也可用的命令。
:::

## 账号与配置

| 命令 | 别名 | 说明 | 随时可用 |
| --- | --- | --- | --- |
| `/login` | — | 选择账号或平台并登录：Kimi Code 使用 OAuth，Kimi Platform 使用 API 密钥；在 `/experiments` 中启用 `openai-codex-oauth` 后还会显示实验性的 ChatGPT OAuth | 否 |
| `/logout` | — | 清除当前所选账号的凭据 | 否 |
| `/provider` | — | 打开交互式供应商管理器，查看、添加和删除已配置的供应商。详见[平台与模型 — `/provider` 与供应商管理](../configuration/providers.md#provider-—-交互式供应商管理) | 是 |
| `/model` | — | 切换当前会话使用的 LLM 模型 | 是 |
| `/preset` | — | 通过 `[subagent]` 配置并激活 canonical 的 `main`、Agent、AgentSwarm 和 Tower 模型路由 | 否 |
| `/secondary-model` | `/subagent-model` | 已废弃的兼容命令。它不会出现在补全和帮助中；输入后只显示迁移提示。请改用 `/preset` | 是 |
| `/settings` | `/config` | 打开 TUI 内的设置面板 | 是 |
| `/experiments` | `/experimental` | 打开实验功能面板 | 是 |
| `/permission` | — | 选择权限模式 | 是 |
| `/editor` | — | 配置 `Ctrl-G` 调起的外部编辑器 | 是 |
| `/theme` | — | 切换终端 UI 配色主题 | 是 |

## 会话管理

| 命令 | 别名 | 说明 | 随时可用 |
| --- | --- | --- | --- |
| `/new` | `/clear` | 开启全新会话，丢弃当前上下文 | 否 |
| `/sessions` | `/resume` | 浏览历史会话并切换/恢复 | 否 |
| `/tasks` | `/task` | 浏览后台任务列表 | 是 |
| `/fork` | — | 基于当前会话 fork 一份新会话，保留完整对话历史；fork 后仍停留在当前会话 | 否 |
| `/title [<text>]` | `/rename` | 不带参数时显示当前会话标题；带参数时设置为新标题（最长 200 字符） | 是 |
| `/compact [<instruction>]` | — | 压缩当前对话上下文，释放 token 占用；可附带自定义指令，提示模型压缩时保留哪些信息 | 否 |
| `/undo [<count>]` | — | 从当前上下文撤销最近的提示词。不带数量时打开选择器；带数量时撤销对应条数。最后一次上下文压缩之前的提示词不能撤销。撤销会一并回滚这些提示词产生的 todo 列表和计划模式状态（不回滚代码改动） | 否 |
| `/reload` | — | 重载当前会话并应用最新 `config.toml` 设置（供应商、模型等）和 `tui.toml` UI 偏好，无需重启 CLI | 否 |
| `/reload-tui` | — | 仅重载 `tui.toml` UI 偏好（主题、编辑器、通知等），不重建会话 | 是 |
| `/init` | — | 分析当前代码库并生成 `AGENTS.md` | 否 |
| `/export-md [<path>]` | `/export` | 将当前会话导出为 Markdown 文件 | 否 |
| `/export-debug-zip` | — | 将当前会话导出为调试用 ZIP 压缩包（与 [`hakimi export`](./kimi-command.md#hakimi-export) 行为一致） | 否 |
| `/copy` | — | 将最后一条 AI 回复复制到剪贴板 | 否 |
| `/add-dir [<path>]` | — | 为当前会话添加额外的工作目录。不带路径（或传入 `list`）运行时列出已配置的目录。添加时可选择是否将目录记入项目的 `.kimi-code/local.toml` | 否 |
| `/web` | — | 在 web UI 中打开当前会话：选择一个运行中的实例进行连接，或在 TUI 退出后新开一个前台服务器。参见 [`hakimi web`](./kimi-command.md#hakimi-web) | 是 |

## 模式与运行控制

| 命令 | 别名 | 说明 | 随时可用 |
| --- | --- | --- | --- |
| `/yolo [on\|off]` | `/yes` | 切换 YOLO 模式。不带参数时翻转；显式传 `on`/`off` 时强制设置。开启后跳过普通工具调用审批；Plan 模式的退出审批不受影响 | 是 |
| `/auto [on\|off]` | — | 切换 auto 权限模式。开启后工具审批自动处理，Agent 不会向用户提问 | 是 |
| `/plan [on\|off]` | — | 切换 Plan 模式。不带参数时翻转；显式传 `on`/`off` 时强制设置。单纯切换不会创建空计划文件 | 是 |
| `/plan clear` | — | 清除当前 plan 方案 | 否 |
| `/swarm on\|off` | — | 开启或关闭 swarm mode，但不发送提示词。 | 是 |
| `/swarm <task>` | — | 先开启 swarm mode，再把 `<task>` 作为普通提示词发送。如果该轮次正常完成，swarm mode 会自动关闭。若当前是 `manual` 权限模式，启动前会提示是否切换到 `auto` 或 `yolo`。 | 否 |
| `/goal [...]` | — | 开始或管理目标模式 | 见下文 |
| `/research [...]` | — | 控制实验性 AITP Research Mode（`aitp_research_mode` flag，默认关闭） | 见下文 |

::: warning 注意
`/yolo` 会跳过普通工具调用的审批确认，使用前请确保了解可能的风险。Plan 模式的退出审批不会被 `/yolo` 跳过；Plan 模式下的 `Bash` 也按 `/yolo` 的普通放行规则处理。
:::

## 目标模式

`/goal` 用于开始或管理目标模式：Hakimi 会在自动续跑的轮次中持续朝一个持久目标工作。使用指导和示例见[使用目标模式](../guides/goals.md)。

```sh
/goal 更新 checkout 文档，运行 docs build，如果 20 轮后仍被阻塞就停止
```

| 命令 | 作用 | 可用性 |
| --- | --- | --- |
| `/goal` 或 `/goal status` | 显示当前目标及其状态、已用时间、轮次数、token 数 | 随时可用 |
| `/goal pause` | 暂停当前的目标，但不删除 | 随时可用 |
| `/goal resume` | 继续被暂停或被阻塞的目标 | 仅空闲时 |
| `/goal cancel` | 移除当前目标 | 随时可用 |
| `/goal replace <objective>` | 用新目标替换已保存的目标 | 仅空闲时 |
| `/goal next <objective>` | 为当前会话安排一个后续目标。如果当前没有目标，则立即开始它。当前目标完成前，Agent 不会看到已排队的目标 | 随时可用 |
| `/goal next manage` | 打开后续目标管理器。用 <kbd>↑</kbd> / <kbd>↓</kbd> 浏览，<kbd>Space</kbd> 选择一个目标以便移动，选中后用 <kbd>↑</kbd> / <kbd>↓</kbd> 调整顺序，<kbd>E</kbd> 编辑，<kbd>D</kbd> 删除，<kbd>Esc</kbd> 取消。编辑输入框中，用 <kbd>Shift-Enter</kbd> 或 <kbd>Ctrl-J</kbd> 添加新行，用 <kbd>Enter</kbd> 保存 | 随时可用 |

`status`、`pause`、`resume`、`cancel`、`replace` 和 `next` 只有作为 `/goal` 后的第一个词时才是子命令。如果你的目标需要以这些词开头，请在目标前加 `--`：

```sh
/goal -- cancel 函数需要在订单失败时返回可重试错误，并补充测试
```

如果后续目标需要以 `manage` 开头，请在 `next` 后加 `--`：

```sh
/goal next -- manage 发布检查清单
```

在非交互式 prompt 模式中，只有创建形式会启动目标模式：

```sh
hakimi -p "/goal 修复 checkout 测试失败"
```

Prompt 模式在目标完成时以退出码 `0` 退出，在目标阻塞时以 `3` 退出，在目标暂停时以 `6` 退出。其它 `/goal` 子命令，包括 `next`，都是 TUI 控制命令，不由 `hakimi -p` 处理。

## 实验性 Research Mode

`/research` 在 TUI 和 Web 中控制实验性 AITP Research Mode。它受 `aitp_research_mode` 实验 flag 门控（环境变量 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`，默认关闭；启动前设置为 `1`）。flag 开启只会开放 `/research`、Web **Modes** 入口和 `EnterAITPMode`；在 `/research on`、Web 入口或模型入口成功前，模式保持 inactive 且零 AITP I/O。将该 flag 设为 `0` 会在两个 surface 中隐藏该功能。TUI 还可以通过 `/experiments` 切换，Web 遵循 server 的 flag 状态。

::: warning 注意
Research Mode 是实验性功能。`/research on` 只激活 adapter 与 Board，不会调度模型轮次或启动独立的多轮循环。跨轮次 continuation 只由 Goal 负责，`manual` 权限模式下的研究轮次仍可能等待审批。
:::

TUI 与 Web 使用相同语法：保留子命令仅作为第一个 token 时生效，`--` 用于分隔参数和自由文本。Web 会把手工输入的 `/research` 路由到 Research endpoint，而不是作为模型提示词发送。

| 命令 | 作用 | Surface / 可用性 |
| --- | --- | --- |
| `/research` 或 `/research status` | 刷新当前 snapshot。TUI 显示模式、循环、研究线、焦点和 AITP 健康；Web 展开刷新后的 Board | TUI 与 Web；随时可用 |
| `/research on` | 进入 Research Mode。TUI 从 `manual` 或 `yolo` 进入时提示选择权限模式；Web 使用当前 session 权限模式 | TUI 与 Web；仅空闲时 |
| `/research on -- <line slug>` | 进入 Research Mode 并切换到指定研究线 | TUI 与 Web；仅空闲时 |
| `/research off` | 退出 Research Mode、回收 AITP 工具权限并隐藏 Board；已保存的 AITP 记录保留 | TUI 与 Web；仅空闲时 |
| `/research pause` | 暂停研究循环，不退出 AITP 模式 | TUI 与 Web；随时可用 |
| `/research resume` | 恢复已暂停的研究循环 | TUI 与 Web；随时可用 |
| `/research manage` | 打开 line-first Manager。TUI 使用键盘导航和动作键；Web 使用可点击研究线列表，以及 Line、Question 和 Checkpoint 表单 | TUI 与 Web；仅空闲时 |
| `/research edit <questionId> -- <新表述>` | 使用当前 snapshot revision 替换问题表述 | TUI 与 Web；仅空闲时 |
| `/research focus <questionId> -- <bounded action>` | 设置当前焦点问题及下一个有界动作 | TUI 与 Web；仅空闲时 |
| `/research defer <questionId> [-- <原因>]` | 暂缓问题（workflow 变更，原因可选） | TUI 与 Web；仅空闲时 |
| `/research block <questionId> [-- <原因>]` | 阻塞问题 | TUI 与 Web；仅空闲时 |
| `/research close <questionId> [-- <原因>]` | 关闭问题 | TUI 与 Web；仅空闲时 |
| `/research reopen <questionId> [-- <原因>]` | 重新打开已关闭的问题 | TUI 与 Web；仅空闲时 |
| `/research line <slug>` | 切换当前研究线 | TUI 与 Web；仅空闲时 |

子命令（`on`、`off`、`pause`、`resume`、`manage`、`status`、`edit`、`focus`、`defer`、`block`、`close`、`reopen`、`line`）仅作为第一个 token 时生效。如果文本需要以这些词开头，请加 `--`：

```sh
/research focus q-17 -- on the boundary zero mode
```

主轮次或上下文压缩运行期间，两个 surface 都只接受 `/research status`、`/research pause` 和 `/research resume`；Web 在当前操作结束前不会打开 Manager，也不会接受 Manager mutation。

mutation command 会携带最新 snapshot 的 `revision` 作为 `expectedRevision`。stale revision 会失败且不应用变更。TUI 会刷新 Board；Web 会重新读取同一 session 的 authoritative snapshot，并在表单 dirty 时保留草稿、显示 stale warning，供你刷新后重试。

只读 Research Board 会在两个 surface 的输入区上方显示 `probing`、`ready` 或 `degraded` 健康状态，以及当前研究线与焦点、问题计数、alerts 和 checkpoint。TUI 还会投影 Todo Actions，并用 `Ctrl-O` 展开或折叠 Board。Web 使用 **Expand**、**Collapse** 和 **Manage** 按钮及表单；TUI 快捷键不适用于 Web。

Web 的 checkpoint 控件不写 AITP。只有存在 pending checkpoint 且显式填写已有 AITP `entryId` 时，**Commit** 才可用；Web 只通过 Research endpoint 关联该 ID，不会调用 `record`/`note` 或写 canonical ledger 文件。

AITP 缺失、未初始化或其 `check` 返回 exit 2 时，两个 surface 都会显示 `degraded`。读工具仍可用，但 AITP 写工具、checkpoint commit 和 active Research Mode 的 Goal 完成会被阻止；未解决的 human-gate decision 也会阻止 Goal 完成。本地 Question/Line mutation 仍可能发生，但不是持久化的 AITP write。Research Mode 不执行 automatic session closeout，也绝不自动运行 `init`、`init --adopt`、`inventory` 或 `backfill --apply`；本轮不把 `backfill` 暴露为模型工具。

## 信息与状态

| 命令 | 别名 | 说明 | 随时可用 |
| --- | --- | --- | --- |
| `/help` | `/h`、`/?` | 显示快捷键和所有可用命令 | 是 |
| `/btw [问题]` | — | 在 fork 出的 subagent 中打开旁路对话，不改变当前 main agent 轮次；不带问题时会先打开面板等待输入 | 是 |
| `/usage` | — | 显示 token 用量、上下文占用以及配额信息 | 是 |
| `/status` | — | 显示当前会话运行时状态：版本、模型、工作目录、权限模式等 | 是 |
| `/mcp` | — | 列出当前会话中的 MCP server 及连接状态 | 是 |
| `/plugins` | — | 打开交互式 plugin 管理器 | 是 |
| `/version` | — | 显示 Hakimi 版本号 | 是 |
| `/feedback` | `/bug` | 提交反馈，可附加诊断日志和代码库上下文 | 是 |

## 退出

| 命令 | 别名 | 说明 | 随时可用 |
| --- | --- | --- | --- |
| `/exit` | `/quit`、`/q` | 退出 Hakimi | 否 |

## 内置 Skill 命令

Hakimi 随包内置了一组 Skill，直接以 `/<name>` 形式出现在斜杠命令面板中。与外部 Skill 不同，它们不需要 `skill:` 前缀，开箱即用。

| 命令 | 说明 |
| --- | --- |
| `/mcp-config` | 配置 MCP server 并处理 MCP OAuth 登录。详见 [MCP](../customization/mcp.md) |
| `/custom-theme [<text>]` | 创建或编辑自定义 TUI 配色主题。详见 [主题](../customization/themes.md) |
| `/update-config` | 查看或编辑 `config.toml`（模型、供应商、权限、hooks）和 `tui.toml`（主题、编辑器、通知、自动更新） |
| `/check-hakimi-docs` | 依据官方 Hakimi 文档回答 Hakimi 产品问题（CLI 用法、配置、技能、MCP、hooks、服务 API、错误码）。`/check-kimi-code-docs` 是 default v2 兼容别名（disableModelInvocation，模型不会自动调用）——仅在涉及 Kimi 平台问题（账号、会员、配额、平台错误码）时显式使用。legacy v1 引擎只暴露 `/check-kimi-code-docs` |
| `/import-from-cc-codex` | 从 Claude Code 和 Codex 导入 instructions、skills 和 MCP 设置 |
| `/sub-skill` | 发现并将本地 skill 库存重组为分层子 skill 包。包含 `/sub-skill.review`（只读提案）和 `/sub-skill.consolidate`（执行重组） |

所有内置 Skill 命令仅在空闲状态下可用。

## Skill 动态命令

已激活的外部 Skill 会自动注册为斜杠命令。普通外部 Skill 以 `skill:` 作为命名空间前缀：

```
/skill:<name> [附加文本]
```

例如 `/skill:code-style` 加载名为 `code-style` 的 Skill 并发送给 Agent；命令后附带的文本拼接到 Skill 提示词之后。

外部子 Skill 会直接以点分名称出现在斜杠命令面板中：

```
/<parent-skill>.<sub-skill> [附加文本]
```

例如，父 Skill 名为 `code-style`，其中子 Skill 的本地名称为 `review`，面板中显示为 `/code-style.review`。点分命令名由层级自动生成，子 Skill 的 `SKILL.md` 可以保留本地 `name`。

为方便输入，外部 Skill 命令同时支持省略 `skill:` 前缀的简写形式 `/<name>`，前提是该名称未被系统斜杠命令占用——即 `/code-style` 会回退匹配到 `/skill:code-style`。

Hakimi 随包内置的 Skill 会直接以 `/<name>` 形式出现在斜杠命令面板中。例如，`/mcp-config` 用于配置 MCP server 和处理 MCP OAuth 登录，`/custom-theme [附加文本]` 用于进入自定义主题流程，创建或编辑 TUI 主题。

::: info 说明
所有 Skill 命令仅在空闲状态下可用。`flow` 类型的 Skill 同样通过 `/skill:<name>` 暴露，没有独立的 `/flow:` 命名空间。
:::

Skill 的安装与编写详见 [Agent Skills](../customization/skills.md)。

## 下一步

- [键盘快捷键](./keyboard.md) — TUI 键盘操作速查
- [内置工具](./tools.md) — Agent 可调用的工具完整参考
