---
"@bhjia-phys/hakimi": patch
---

Fix the web UI's PDF preview and download buttons failing with an authorization error: both now fetch file bytes with the session credential, and failed open/reveal/download actions show an inline error instead of doing nothing.
