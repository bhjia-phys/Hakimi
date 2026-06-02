# Upstream Sync 2026-06-02

## Upstream

- Remote: https://github.com/MoonshotAI/kimi-code
- Local remote name: `upstream`
- Last known upstream `main` from the planning check: `7a47045af2790eba0e68d5406c670ac759b21755`
- Local base before this sync attempt: `50b4cbc`

## Summary

The `upstream` remote was configured locally so future Kimi Code sync work has a stable target.

Fetching upstream was attempted twice through Git:

```powershell
git -C F:\AI_Workspace\repos\aitp-agent fetch upstream main
git ls-remote https://github.com/MoonshotAI/kimi-code HEAD refs/heads/main
```

Both attempts failed because the local environment could not reach GitHub over HTTPS:

```text
fatal: unable to access 'https://github.com/MoonshotAI/kimi-code/': Failed to connect to github.com port 443
```

No upstream merge was performed in this slice.

## AITP Feature-Flag Interaction

No Kimi source changes were merged, so there were no conflicts in:

- `packages/agent-core/src/session/index.ts`
- `packages/agent-core/src/agent/index.ts`
- `packages/agent-core/src/agent/turn/index.ts`
- `packages/agent-core/src/agent/tool/index.ts`

AITP feature flags remain unchanged.

## Verification

Verification for the concurrent ActionBinding slice passed:

- focused tests: 7 files passed, 26 tests passed;
- `@moonshot-ai/agent-core` typecheck: passed;
- focused oxlint: 0 warnings, 0 errors.
- full `@moonshot-ai/agent-core` suite: 183 test files passed, 1 skipped; 2319 tests passed, 7 skipped, 1 todo.
- root `corepack pnpm --config.engine-strict=false run build`: passed.
- `corepack pnpm --config.engine-strict=false run dev:cli -- --help`: passed.
- `node apps/kimi-code/dist/main.mjs --help`: passed.

The local Node version remains `v24.14.0`, while package metadata requests `>=24.15.0`; commands used `--config.engine-strict=false`.

## Follow-Ups

- Retry `git fetch upstream main` when GitHub connectivity is available.
- Create a dedicated `upstream-sync/<date>` branch before merging upstream.
- Run full `@moonshot-ai/agent-core` tests before and after the upstream merge.
