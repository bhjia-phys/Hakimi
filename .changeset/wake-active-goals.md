---
"@bhjia-phys/hakimi": patch
"@bhjia-phys/hakimi-sdk": patch
---

Fix explicit Goal resume requests so v2 can wake an already-active but idle goal without adding a synthetic user message, while preserving the legacy fallback.
