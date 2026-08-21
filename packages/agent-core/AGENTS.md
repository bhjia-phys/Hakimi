# agent-core Agent Guide

## Status and change policy

- `packages/agent-core` is the frozen legacy runtime and compatibility-contract source. New product features belong only in `packages/agent-core-v2`; do not maintain feature parity in v1.
- Change v1 only for security fixes, build fixes, data-migration fixes, or modifications strictly required to preserve the existing rollback runtime and configuration/contract compatibility. It may be consulted as implementation history, but it is not the source of truth for new Hakimi behavior.

## Hard rules

- The `Agent` class in `packages/agent-core/src/agent` must be usable on its own. The constructor must not force the caller to create a `Session` instance, nor require an `agentId` or `session`. It may accept an optional `sessionId` as a request-config hint — for example mapped to the provider's `prompt_cache_key` — but the instance must not hold `sessionId`, and must not depend on the Session lifecycle, metadata, or parent/child relationship logic.
