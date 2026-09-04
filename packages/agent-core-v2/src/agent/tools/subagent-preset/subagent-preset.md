Activate a configured `[subagent]` routing preset so the next `Agent` / `AgentSwarm`
spawn uses its model routes immediately.

Pass the preset name from `[subagent].presets`. The tool validates that the preset
exists and that every route model it references resolves, then persists and manually
locks the active preset. Automatic selection will not replace that choice until the
user resumes it from Hakimi Web or runs `/preset auto` in the TUI. The tool never
touches the main or default model or thinking configuration, never reloads the session,
and reports `main_model_changed: false` on success. Before
spawning many subagents, use `GetProviderUsage` for every supported provider and
compare the lowest remaining percentage across its reported windows. Pick a preset
whose routes fit the task without spending a depleted provider when a healthy route
is available. Treat failed usage queries as unknown and keep the current preset
unless the reported data supports a change.