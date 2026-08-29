# Repository-level Agent Guide

Reply in the same language as the user.

This is a TypeScript monorepo built for agent-assisted development. Keep the root `AGENTS.md` limited to hot-path rules: the project map, hard constraints, and workflow requirements — things every task needs to know.

## Working Principles

- Think from first principles. Start from real requirements, code facts, and verification results; if the goal is unclear, discuss it with the user first.
- Treat code, not documentation, as the source of truth. Unless the user explicitly says otherwise, do not read ordinary Markdown just to understand the implementation.
- Before making code changes, read the relevant code and the most recent constraints, and follow the nearest `AGENTS.md` in the directory tree.
- Keep changes focused. Do not slip in unrelated refactors along the way.
- Treat upstream Kimi Code as a source of selectively adopted general-purpose improvements, not as a product-parity target. Absorb upstream changes only when they advance Hakimi's goals; do not import upstream product-specific behavior by default.
- After every upstream Kimi Code review, append a check record to `apps/kimi-code/upstream-audit.json` with the actual remote tip; never substitute a potentially stale local `upstream/main`.
- When committing, do not add any co-author attribution, and do not reveal the identity of the agent in commit messages, PR descriptions, or any explanatory text.

## Project Map

- `apps/kimi-code`: the CLI / TUI application. It consumes core capabilities through `@bhjia-phys/hakimi-sdk` and must not depend directly on `@moonshot-ai/agent-core`. When writing or modifying its terminal UI, use the `write-tui` skill (`.agents/skills/write-tui/SKILL.md`).
- `apps/kimi-web` is the browser Web UI and the only editable production source for the tracked derived outputs `apps/kimi-code/dist-web` and `apps/kimi-code/web-base.json`; develop it with `pnpm dev:server` plus `KIMI_SERVER_URL=http://127.0.0.1:58627 pnpm dev:web`. After source changes, regenerate both package assets with `pnpm run build:web-assets`, commit them together, then verify a clean rebuild with `pnpm run build:web-assets -- --check` — never hand-edit or partially replace the outputs; CI, native, release, direct package build/prepack, and Nix all enforce the canonical toolchain, provenance schema v5 binds source/recipe files plus the actual canonical Node/pnpm and bundle identities, the v4 native receipt directly binds that toolchain and the final binary hash, and rollback restores source/recipe from a canonical tag before regeneration.
- `apps/vis`, `apps/vis/server`, `apps/vis/web`: visual debugging tools for sessions and replays.
- `apps/kimi-inspect`: web inspector for the kap-server `/api/v1/debug` RPC surface — workspace/session browser, per-session transcript chat, per-scope Service panels, and the DI unit inspection view. See `apps/kimi-inspect/AGENTS.md`.
- `packages/agent-core`: the frozen v1 legacy runtime and compatibility-contract source, retained for the existing rollback path and config/data compatibility. New product features belong only in `packages/agent-core-v2`; see `packages/agent-core/AGENTS.md` for its maintenance-only policy.
- `packages/agent-core-v2`: the DI × Scope agent engine (the v2 port behind kap-server). Four `LifecycleScope` tiers — `App` / `Workspace` / `Session` / `Agent` (`app/scopes.ts`) — plus the L3 unit layer (`Service`/`Fiber` units, collection contribution points, the Feature seam in `src/features/`); there is no App-level session lifecycle facade — callers compose `ISessionIndex` → `IWorkspaceLifecycleService.handlerFor` → the handler. See `packages/agent-core-v2/AGENTS.md` and use the `agent-core-dev` skill (`.agents/skills/agent-core-dev/SKILL.md`) when developing here.
- `packages/node-sdk`: the public TypeScript SDK and harness.
- `packages/kosong`: the LLM / provider abstraction layer.
- `packages/kaos`: the execution environment and file/process abstractions.
- `packages/oauth`: Kimi OAuth and managed auth utilities.
- `packages/telemetry`: shared client-side telemetry infrastructure.
- `packages/transcript`: the isomorphic transcript rendering data layer — L1 agent-granular store, L2 idempotent operations, L3 `off/turn/block/delta` subscription granularity, L4 framework-free view registry, plus turn-cursor pagination. Pure TypeScript (browser-safe, no engine imports); the sole owner of the transcript contract types (`src/contract/`) and the op-batch sequencing contract. See `packages/transcript/AGENTS.md`.
- `packages/kap-server`: the Kimi Code server, backed by `@moonshot-ai/agent-core-v2`; exposes sessions over REST + WebSocket (`/api/v1` + `/api/v1/ws`), plus the `/api/v1/debug/*` reflection RPC surface (`--debug-endpoints`, loopback bind + bearer auth). See `packages/kap-server/AGENTS.md`.
- `packages/klient`: the client SDK — a contract-driven facade over agent-core-v2 (`global.*` / `session(id).*` / `agent(id).*`, zod-validated); transport via subpath entry (`@moonshot-ai/klient/ipc|memory`, both return the same `Klient`); also hosts the e2e suites. See `packages/klient/AGENTS.md`.
- `packages/tree-sitter-bash`: a pure-TypeScript bash parser (no runtime deps, no wasm); `parse(source, { timeoutMs, maxNodes })` runs under a deterministic budget and returns a discriminated `ParseResult` — callers must treat aborted/hasError trees as "cannot analyze" and degrade. Parser only, no safety judgments; see the package README's "Known differences" section.
- `packages/minidb`: the embedded JSON document store (`MiniDb`) behind kap-server's search index — snapshot + WAL persistence with an exclusive write lock, a larger-than-RAM full-text layer, and persistent index generations. See `packages/minidb/AGENTS.md`.

## Environment Requirements

- **Node.js**: `>=24.15.0` (from the root `package.json` `engines`; `.nvmrc` is `24.15.0`, used by nvm / fnm / mise to pick the minimum recommended version).
- **pnpm**: `10.33.0` (from the root `package.json` `packageManager`).
- `pnpm install` will fail when the Node version is not satisfied, because `.npmrc` sets `engine-strict=true`.

## Monorepo Workspace Maintenance

- `pnpm-workspace.yaml` is the source of truth for workspace membership, but `flake.nix` also contains **hardcoded** `workspacePaths` and `workspaceNames` lists.
- **Whenever you add or remove a workspace package, you MUST update both `pnpm-workspace.yaml` and `flake.nix` — for every package, including leaf / test / e2e packages that nothing depends on.**
  - `pnpm-workspace.yaml` uses globs (`packages/*`, `apps/*`), so most packages land there automatically; `flake.nix` is fully manual and is where omissions happen.
  - Missing a path in `flake.nix`'s `workspacePaths` will silently drop files from the Nix build's `src` fileset.
  - Missing a name in `flake.nix`'s `workspaceNames` will break `pnpmConfigHook` because dependencies for that workspace will not be fetched.
- The automated "Check flake.nix workspace sync" (`scripts/check-nix-workspace.mjs`) only validates the transitive dependency **closure of `@moonshot-ai/kimi-code`**. A leaf package outside that closure (e.g. an e2e package nobody imports) slips through even when it is missing from `flake.nix`. A green check is therefore NOT proof that `flake.nix` is fully in sync — keep it updated by hand on every add/remove, do not rely on the check to catch omissions.

## General Coding Rules

- For optional object properties, pass `undefined` directly instead of using conditional spread.
  - YES: `{ user }`
  - NO: `{ ...(user ? { user } : undefined) }`
- Optional object properties do not need to additionally allow `undefined` in the type.
  - YES: `interface Options { user?: User }`
  - NO: `interface Options { user?: User | undefined }`
- Internal methods with only a single parameter should not be turned into options objects just for stylistic uniformity.
- Except for a package's `index.ts`, other `index.ts` files should prefer `export * from './module';`.
- Do not add too many new test files. Prefer adding tests to the existing test file of the corresponding component or module.
- When a test fails because of a user modification, default to fixing the test first; do not change the implementation to satisfy an old test unless the implementation truly has a bug.
- Do not sacrifice code quality for external compatibility unless the user explicitly asks for it. Breaking changes go through changesets and a `major` bump, gated by the rule below.

## Experimental Features

- Gate a not-yet-public feature behind an experimental flag. Flags are env-driven and default off: `KIMI_CODE_EXPERIMENTAL_<NAME>` toggles one, `KIMI_CODE_EXPERIMENTAL_FLAG` enables all. Release by flipping the entry's `default` to `true`.
  - `packages/agent-core` (v1) is frozen: do not add new feature flags or product behavior there. Touch its existing flag registry only when required by the maintenance-only compatibility policy in `packages/agent-core/AGENTS.md`.
  - `packages/agent-core-v2` and kap-server modules: there is no central catalog — declare the flag in the owning domain via `registerFlagDefinition` at import time (see `packages/agent-core-v2/docs/flag.md`), then check it with `IFlagService.enabled(id)`. Current search-index-separation flags: `persistence_minidb_readmodel` (session read model, default on) and `search_worker` (global search worker host, default on).

## AITP Compatibility Maintenance

- [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) is the source of truth for its stages, CLI commands, schemas, and golden fixtures. Hakimi orchestrates the agent and consumes AITP through CLI + files; it must not copy AITP's runtime, parser, validator, or canonical ledger writes.
- Any change to Hakimi's AITP command/schema support, launcher resolution, session lifecycle, Skill discovery, or compatibility status must update both `README.md` and `README.zh-CN.md` in the same change. Re-check the current AITP stage and official fixtures first, and never describe a planned or blocked capability as available.
- Before implementing or modifying any AITP integration, re-verify the AITP repository's current state (`git rev-parse HEAD` + `git status --short` in the AITP checkout, plus `aitp --help` for the actual CLI surface). Never build against a stale snapshot of AITP stages, commands, or schemas, and do not rely on the managed plugin copy as a source of truth.
- Cross-repo handoff material lives in `docs/aitp/` on this side and in `docs/hakimi/` in the AITP checkout (`compatibility-matrix.md` + `TRACKING.md` here; `README.md` + `compatibility-matrix.md` there). Start AITP-related work by reading both sides' handoff docs, and update them in the same change.

## Where to Update Instructions

- Hard rules that affect almost every task: update the root `AGENTS.md`.
- Rules that only affect a specific directory: update the nearest sub-directory `AGENTS.md`.
- Project-map entries stay at 1–2 sentences; deep package docs live in the package's own `AGENTS.md`.
- Keep instruction updates focused and supported by code facts.

## Workflow Requirements

- Prefer `rg` / `rg --files` when reading code.
- When designing changes, follow existing boundaries and local patterns first.
- In public text and test data, replace real internal identifiers with neutral placeholders such as `example.com`, `example.test`, and `YOUR_API_KEY`. Before opening a PR, ask a read-only agent to audit the diff for context-specific internal identifiers.
- When creating a PR, the PR title must follow Conventional Commit style, e.g. `chore: remove legacy format commands`.
- When an AI agent opens or updates a PR, fill in `.github/pull_request_template.md` — link the related issue or explain the problem, then describe what changed. Do not leave placeholder text or submit a generic summary of the diff.
- Do not submit vague AI-generated PR text. The human author must understand the change well enough to explain the code, edge cases, and why the approach fits this repository.
- After finishing a task and before submitting a PR, you must run the `gen-changesets` skill (see `.agents/skills/gen-changesets/SKILL.md`) and generate a changeset under `.changeset/` according to its rules.
- When generating a changeset, **never** decide on a `major` bump on your own — stop, explain, and get explicit user confirmation first; default to `minor`, fall back to `patch`. See `.agents/skills/gen-changesets/SKILL.md`.
- Prefer importing via `import ... from '#/...'`, which serves the same purpose as `import ... from '@/...'`.
- Do not commit throwaway scratch or exploratory files. Never stage:
  - Agent working notes or handoff/summary documents (e.g. `HANDOVER-*.md`, `HANDOFF-*.md`, `handoff.md`).
  - Throwaway UI/UX prototypes or design mockups (e.g. `*-designs.html`, `*-mockup.html`, `*-demo(s).html`) at the repo root or under a `design/` folder. The only tracked `.html` files should be Vite `index.html` entrypoints.
  Before committing or opening a PR, run `git status` and `git diff --staged --stat` and remove anything matching these patterns. Put scratch work under `.tmp/` (gitignored) instead of the repo root or the source tree.
