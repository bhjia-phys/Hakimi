---
"@bhjia-phys/hakimi": minor
---

Add the GetProviderUsage and SetSubagentPreset builtin tools for the main agent to query Kimi plan usage and activate a `[subagent]` routing preset for subsequent subagent spawns. Call GetProviderUsage before spawning many subagents, then SetSubagentPreset to switch the active preset.