---
"@bhjia-phys/hakimi": minor
---

Replace the `hakimi server` command tree with `hakimi web`: the server runs in the foreground (the background daemon and OS-service lifecycle commands are removed), and multiple servers can now share one home directory, each taking the next free port. Manage instances with `hakimi web kill [server-id|all]`, `hakimi web ps`, and `hakimi web rotate-token`; any `hakimi server …` invocation prints a deprecation notice and exits 1.
