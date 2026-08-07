---
"@moonshot-ai/kimi-code": patch
---

Hide the `model` parameter on the Agent and AgentSwarm tools while the secondary-model experiment is disabled, so subagent routing follows the active preset. An explicit `"secondary"` request without a configured secondary model now fails with a clear error instead of silently running on the main model.
