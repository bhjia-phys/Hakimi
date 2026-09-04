# 会话与上下文

Hakimi 把每次对话持久化为一个「会话」，保留消息历史和元数据，可以随时关闭终端后再回来继续。本页介绍如何恢复会话、管理上下文，以及导出和派生会话。

## 会话存储

所有会话保存在 `$KIMI_CODE_HOME/sessions/` 下（默认 `~/.hakimi/sessions/`），按工作目录分组存放：

```text
~/.hakimi/
├── config.toml
├── session_index.jsonl
└── sessions/
    └── <workDirKey>/
        └── <sessionId>/
            ├── state.json
            └── agents/
                ├── main/
                │   └── wire.jsonl
                └── <subagentId>/
                    └── wire.jsonl
```

- `state.json`：会话标题、创建时间等元数据。
- `agents/*/wire.jsonl`：Agent 事件流，用于会话恢复和回放；同时记录发给模型的请求轨迹（工具 schema、请求参数、MCP 工具清单），便于调试。

::: warning 注意
`sessions/` 目录下的文件请勿手动编辑，否则可能导致会话无法正常恢复。
:::

## 启动与恢复会话

每次直接运行 `hakimi` 都会创建新会话。以下方式可以恢复历史会话：

**继续当前目录最近的会话：**

```sh
hakimi --continue
```

**恢复指定会话（通过 ID）：**

```sh
hakimi --session abc123
```

**交互式浏览历史会话并选择：**

```sh
hakimi --session
```

::: warning 注意
`--continue` 与 `--session` 互斥。
:::

在桌面 Web UI 中，对话页标题栏会在会话标题旁汇总当前 Git 工作树：分支或 detached HEAD 状态、改动文件数、ahead/behind 数、增删行数和 pull request 状态。点击工作树摘要可打开改动详情，点击 pull request 状态徽标可打开对应的 pull request。非 Git 仓库不显示该卡片；对话列变窄时，它会按优先级逐步隐藏次要指标。

## 在 TUI 中切换会话

不离开当前终端也可以管理会话，以下斜杠命令仅在 Agent 空闲时可用：

- **`/new`**（别名 `/clear`）：切换到新会话，丢弃当前上下文。
- **`/sessions`**（别名 `/resume`）：浏览并恢复历史会话。
- **`/fork`**：派生当前会话（详见下文）。
- **`/title <text>`**（别名 `/rename`）：设置会话标题方便识别；不带参数时显示当前标题。

## 从其他设备远程控制

Web 远程控制可以让手机或另一台电脑通过互联网使用 Hakimi Web。当前电脑仍是服务器：Hakimi 在 `127.0.0.1` 上打开一个经过鉴权的完整 Web listener，再由 `cloudflared` 通过临时 Cloudflare Quick Tunnel 暴露它。不需要 VPS、Tailscale、Cloudflare 账号或公网入站端口。

Hakimi Web 默认提供这个功能：

1. 安装官方 [`cloudflared` 二进制文件](https://developers.cloudflare.com/tunnel/downloads/)。Hakimi 不会自动下载或更新它。
2. 启动本地 Web server：

   ```sh
   hakimi web
   ```

3. 打开任意会话，直接点击对话标题栏中始终可见的**远程控制**按钮；在移动端 Web 中，点击顶部栏的 globe 按钮。
4. 需要临时分享时，保持选中**临时分享**，选择 30 分钟、1 小时、8 小时或 24 小时，再点击**开始远程控制**。
5. 需要 Linux 长期访问时，切换到**长期运行**，即可在同一对话框中启动或停止后台服务，并查看当前 health、URL 和二维码。

链接会先打开本地 Web UI 中选中的会话，随后提供与本地 Web 相同的工作区和会话导航。在窄屏手机上，顶部栏及其会话切换和设置 Bottom Sheet 会提供会话操作、subagent preset、Git 和 PR 信息，以及后台 Agent、Bash 和任务输出，不需要桌面宽度的多栏布局。

共享期间，对话标题栏会显示**远程**徽标，点击即可重新打开对话框。点击**停止远程控制**会立即关闭 tunnel；TTL 到期、`cloudflared` 退出或本地 Web server 停止时也会自动关闭。远程页面不会显示创建另一个 tunnel 的控件。

临时分享不会直接暴露主 listener。Hakimi 会创建第二个回环 listener：它复用当前 runtime，只接受临时凭据，并提供完整的鉴权 Web 数据面。

对于 Linux 上的长期个人访问，Hakimi 可以通过 `systemd --user` 服务保持一个独立的 Quick Tunnel 运行。该流程没有 TTL，也不要求 `hakimi web` 一直开启：

```sh
hakimi remote start
hakimi remote status
hakimi remote stop
```

`hakimi remote start` 会安装并启用用户服务，启动一个完整的全会话 Web listener，并打印 URL 和二维码。`hakimi remote status` 会再次打印当前 URL，并报告本地服务是否健康。`hakimi remote stop` 会禁用并停止服务，但保留 `~/.hakimi/remote/` 下的私有配置和控制 token，供下次启动复用。该服务会随 Linux 用户会话启动，并在进程意外退出后自动重启。

后台服务会在重启后继续使用同一个控制 token，但 Quick Tunnel 不提供固定 hostname。同一个 `cloudflared` 进程持续运行时，`*.trycloudflare.com` 地址通常保持不变；重启 `cloudflared`、重启服务或重启电脑都会产生新地址。请在宿主电脑上运行 `hakimi remote status` 获取替换后的链接。

TUI 仍保留从所选会话 handoff 的流程。打开会话并等待 Agent 空闲，然后直接运行 `/remote`，无需设置环境变量。前台远程 server 接管前，TUI 会关闭会话并退出，因此不会有两个 runtime 同时写入同一会话。链接会先打开该会话，但随后可在 Web UI 中访问所有工作区和会话。在原终端按 `Ctrl-C` 可以停止它。`/remote` 是面向用户的命令，接管用的底层子命令仍保持内部隐藏。

Web 和 TUI 分享的默认 TTL 是 8 小时，最大为 24 小时。Web 提供固定选项；TUI 还接受自定义正时长，例如 `/remote --ttl 30m` 或 `/remote --ttl 1d`。如果 `cloudflared` 不在 `PATH` 中，请在启动 Hakimi 前设置 `KIMI_CODE_CLOUDFLARED_PATH`；在 TUI 中也可以传入 `/remote --cloudflared /absolute/path/to/cloudflared`。

::: danger 警告
生成的 URL 在 fragment 中包含控制 token。任何拿到完整 URL 或二维码的人都能完整访问这台电脑上的 Hakimi Web，因此请把它当作密码，不要粘贴到聊天、日志或 issue 中。Web 与 TUI 的分享使用临时 token；后台服务会有意跨重启复用 token，直到你删除它的私有配置。
:::

通过鉴权后，远程 Web 可以新建、重命名、归档、切换和控制会话；修改配置、模型、供应商、OAuth 和 plugins；上传、浏览和下载文件；并显示媒体、本地路径、工具输入、审批细节以及完整的 Agent、Bash 和任务输出。Tunnel listener 仍不会注册 PTY 终端、debug、server shutdown 或嵌套远程控制路由。

Cloudflare 明确说明，[Quick Tunnels 不提供 SLA 或 uptime 保证，仅用于测试与开发](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。该模式适合短时间个人使用或少量可信用户，不适合生产可用性要求。如果需要稳定域名、访问策略、审计控制或 uptime 承诺，请使用托管 tunnel 或其他部署服务。

## 上下文压缩

对话变长时，Hakimi 会在上下文接近窗口上限时自动压缩历史消息，释放 token 空间。也可以随时手动触发：

```
/compact
```

压缩时可以附带指引，告诉模型优先保留哪些信息：

```
/compact 保留与数据库迁移相关的讨论
```

## 派生会话

想在不破坏当前对话的前提下尝试新思路，使用 `/fork`：

```
/fork
```

fork 后你仍停留在原会话，对话不受影响、可以直接继续；派生出的副本与原会话彼此独立，可以随时通过 `/sessions` 切换过去。已保存的 `/goal` 不会复制到派生会话。如果你想在派生会话中进行自主 goal 工作，需要在那里开始一个新 goal。

fork 完成后，CLI 会打印一条可直接运行的 `hakimi --resume` 命令（并自动复制到剪贴板），方便你在新终端进程中直接进入派生会话。

## 导出会话

用 `hakimi export` 把会话打包为 ZIP，适合分享、归档或提交问题反馈：

```sh
hakimi export <sessionId>
```

不传 `sessionId` 时导出当前目录最近的会话（有交互式确认，加 `-y` 跳过）。用 `-o` 指定输出路径：

```sh
hakimi export <sessionId> -o ~/Desktop/my-session.zip
```

导出包含会话目录下的所有文件，包括诊断日志。全局诊断日志（`~/.hakimi/logs/kimi-code.log`）默认也会打包；如不需要，加 `--no-include-global-log` 排除。

也可以在 TUI 内导出，无需离开交互界面：

- **`/export-debug-zip`**：产生与 `hakimi export` 相同的调试 ZIP。
- **`/export-md`**（别名 `/export`）：导出为人类可读的 Markdown 对话记录，适合分享或存档。可选接收路径参数；不带参数时写入工作目录下的 `kimi-export-<short-id>-<timestamp>.md`。

在 web UI 中，`/export` 会把当前会话下载为诊断 ZIP。压缩包包含持久化的会话数据、诊断日志，以及记录浏览器关键事件且大小有上限、只含元数据的 `logs/kimi-web.jsonl`；提示词正文、WebSocket 内容和 console 参数不会写入这份浏览器日志。这里的 web 命令与上面的 TUI `/export` 别名行为不同。

::: tip 提示
导出文件可能包含代码、命令输出和路径等敏感信息，分享前请先确认内容。
:::

## 下一步

- [数据路径](../configuration/data-locations.md) — 会话文件的完整目录结构说明
- [hakimi 命令](../reference/kimi-command.md) — `--continue`、`--session`、`export` 等命令的完整参数参考
