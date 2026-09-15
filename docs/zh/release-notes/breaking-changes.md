# 不兼容变更

本页说明不兼容变更及其迁移方法。**未发布**部分不代表已经发布了新版本。

## 未发布

### Research Mode 与 SDK 研究接口

**影响范围**

Research Mode 不再管理 Line、Question、Action、Research Plan、checkpoint 或 Research Loop。Research Manager 与八个内置 `aitp_*` wrappers 已退役。读取旧研究快照或调用管理命令的集成需要迁移；公共 SDK changeset 声明 major 更新。

`Session.getResearch()` 和 `GET /api/v1/sessions/{session_id}/research` 的 `data` 现在只返回含 `enabled`、`skillsAvailable` 的 `ResearchModeSnapshot`。实时通知改为携带该快照的 `research_mode.updated`，不再使用历史研究状态事件。`skillsAvailable` 说明目录可用性，不代表 CLI 健康；模式关闭时它也可以为 `true`。

**迁移方法**

1. 将 phase、revision、Line、Question、Action 展示替换为两个模式字段。把 `research_mode.updated` 视为模式或目录更新，不是科学工作流程转换。历史事件类型仍可解码，但不代表实时状态。
2. 通过 `Session.commandResearch()` 只调用 `enter_mode` 与 `exit_mode`，不要传 `lineSlug`。用 `getResearch()` 读取状态；成功的命令返回 `{ snapshot }`。对于已有 SDK `session`：

   ```typescript
   const snapshot = await session.getResearch();
   const entered = await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
   await session.commandResearch({ kind: 'exit_mode' });
   ```

   REST 客户端向 `POST /api/v1/sessions/{session_id}/research/command` 发送 `{ "command": { "kind": "enter_mode", "actor": "user" } }` 或 `{ "command": { "kind": "exit_mode" } }`。已识别的退役命令以 `research.retired` 拒绝执行；REST 在 `40001` 错误封装的 `msg` 中报告它。应移除这些调用，而不是重试。旧 v1 SDK 引擎仍不实现研究接口。
3. TUI 和 Web 使用 `/research on`、`/research off`、`/research status`。项目知识使用普通文件工具，长期记忆使用官方 AITP Skills 与 CLI。将退役的 `aitp_enter`、`aitp_list`、`aitp_show`、`aitp_check`、`aitp_record_prepare`、`aitp_record_save`、`aitp_note_prepare`、`aitp_note_save` 调用改为官方工作流程，而不是新增宿主 wrapper。
4. 通过原始会话日志或会话导出读取旧 Research 记录。它们不会自动恢复、迁移、删除或 backfill，也不再提供结构化 Research history API。会话撤销不会回退模式开关或外部 CLI 保存。

模式开关、状态读取与轮次边界不会运行 AITP 或写入记忆。普通 Goal、Plan 与权限行为保持独立。安装、store 作用域检查，以及固定上游 CLI 与另行测试的本地仓库边界补丁之间的区别，见[研究模式](../guides/research-mode.md)。
