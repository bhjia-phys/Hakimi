# Breaking changes

This page describes incompatible changes and how to migrate. Entries under **Unreleased** are not a published-version announcement.

## Unreleased

### Research Mode and SDK research APIs

**Affected**

Research Mode no longer manages Lines, Questions, Actions, Research Plans, checkpoints, or a Research Loop. The Research Manager and eight built-in `aitp_*` wrappers are retired. Existing integrations that read the old research snapshot or issue management commands must migrate; the public SDK changeset declares a major update.

`Session.getResearch()` and the `data` of `GET /api/v1/sessions/{session_id}/research` now return `ResearchModeSnapshot` with only `enabled` and `skillsAvailable`. Live notifications use `research_mode.updated` with that snapshot rather than the historical research-state events. `skillsAvailable` describes catalog availability, not CLI health, and can be `true` while the mode is off.

**Migration**

1. Replace phase, revision, Line, Question, and Action projections with the two mode fields. Handle `research_mode.updated` as a mode/catalog update, not a scientific workflow transition. Historical event types remain decodable but are not live state.
2. Use only `enter_mode` and `exit_mode` through `Session.commandResearch()`. Do not pass `lineSlug`. Read status through `getResearch()`; successful commands return `{ snapshot }`. For an existing SDK `session`:

   ```typescript
   const snapshot = await session.getResearch();
   const entered = await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
   await session.commandResearch({ kind: 'exit_mode' });
   ```

   REST clients send `{ "command": { "kind": "enter_mode", "actor": "user" } }` or `{ "command": { "kind": "exit_mode" } }` to `POST /api/v1/sessions/{session_id}/research/command`. Recognized retired commands reject with `research.retired`; REST reports this in the `msg` of a `40001` error envelope. Remove those calls instead of retrying them. The legacy v1 SDK engine still does not implement the research surface.
3. In the TUI and Web, use `/research on`, `/research off`, and `/research status`. Use ordinary file tools for project knowledge and official AITP skills plus CLI for long-term memory. Replace the retired `aitp_enter`, `aitp_list`, `aitp_show`, `aitp_check`, `aitp_record_prepare`, `aitp_record_save`, `aitp_note_prepare`, and `aitp_note_save` calls with the official workflow, not new host wrappers.
4. Read old Research records through raw session logs or session exports. They are not automatically resumed, migrated, deleted, or backfilled, and there is no structured Research history API. Conversation undo does not reverse the mode toggle or external CLI saves.

Mode toggles, status reads, and turn boundaries do not run AITP or write memory. Ordinary Goal, Plan, and permission behavior remains independent. See [Research Mode](../guides/research-mode.md) for setup, store-scope checks, and the distinction between the pinned upstream CLI and the separately tested local repository-boundary patch.
