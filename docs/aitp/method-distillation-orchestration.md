# Native method-distillation orchestration (planned, unavailable)

> **Status: planned, unavailable.** This document describes a future Hakimi
> native Feature for orchestrating AITP method-distillation. No code exists;
> no directory is created. The committed AITP 0.8 Skill-only amendment defines
> the marker/card/trial/decision rules in the AITP Skill layer; this document
> describes how a future Hakimi native coordinator would
> schedule, interact, and recover around those rules. Nothing here is
> available, and no capability described here may be claimed as shipped.

## 1. Background and relationship to AITP 0.8

AITP 0.8 is a committed **Skill-only amendment** at release surface
`0.8.0`. It defines:

- `method-observation` marker (`> method-observation: <slug>`) as a low-trust
  candidate on eligible durable Entries;
- conservative card/trial review rules (candidate ≠ proof; pre-card Entries
  are `basis_refs` only; post-card trials must exact-`sha256:` pin the card
  revision; two qualifying trials trigger a proposal, not approval);
- two-step human decisions (approval, then publication choice) recorded as
  human `decision` Entries via `record prepare/save`;
- the platform tool/card/Skill three-layer boundary (Hakimi or external
  adapters own SSH/Slurm/rsync execution; AITP cards record stable procedure;
  published Skills route to deterministic tools).

These rules live entirely in the AITP Skill (`distilling-methods/SKILL.md`)
and its `using-aitp` fallback routing. They change no CLI command, flag,
file schema, transport schema, or exit code. A model running the Skill can
perform best-effort, explicitly guided harvest today; this is upstream Skill
behavior, not an automatic Hakimi session-closeout or a native H6 runtime.

This document describes what a **Hakimi native coordinator** would add on top:
session/turn checkpoint scheduling, single-flight scan, process lease
management, question interaction, crash/resume, and main-agent-only disclosure
— none of which the Skill-only fallback can guarantee.

### What the native coordinator does NOT own

- Procedure matching, independence judgment, generalization, or scientific
  correctness — these remain in the AITP Skill + model.
- Ledger semantics, marker grammar, card/trial/approval/publication rules —
  these remain in AITP.
- Canonical file writes — all writes still go through `record/note
  prepare|save`.
- A second ledger or durable state machine — the coordinator's derived phase
  is ephemeral and rebuildable from the canonical AITP ledger.

## 2. Current v2 scope topology (source of truth)

The current runtime scope topology is defined in
`packages/agent-core-v2/src/app/scopes.ts`:

```ts
export enum LifecycleScope {
  App = 'app',
  Session = 'session',
  Agent = 'agent',
}
```

There are **three tiers**: `App → Session → Agent`. There is no
`LifecycleScope.Workspace` in the code. The `agent-core-v2/AGENTS.md`
describes a four-tier `App / Workspace / Session / Agent` target architecture
and the `workspace/` domain exists as a service layer, but `Workspace` is
**not** a `LifecycleScope` enum member. This is a known general-doc/code drift;
this design does not assume a Workspace scope exists.

> **Drift note:** If a future F-track effort introduces
> `LifecycleScope.Workspace` into `scopes.ts`, the workspace-shared binding
> and capability snapshot described in §3.4 below may be revisited. Until then,
> cross-session recovery re-reads the AITP canonical ledger; no workspace
> singleton cache is used.

## 3. Planned Feature owner and scope boundaries

Future owner seam: `packages/agent-core-v2/src/features/aitp/`. This
directory does not exist today and is not created in this change.

### 3.1 App scope — Feature/capability layer

The App-scope Feature registration owns:

- Future H6 Feature recipe and experimental flag/config registration
  (`registerFlagDefinition` at import time; `IFlagService.enabled(id)` check;
  default off for that future native feature). This is separate from the current
  `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` product flag, which is default on
  and is neither an AITP protocol-state nor an H6-availability signal.
- AITP plugin/contract/Python capability detection (probe for installed
  plugin, `--help` surface, contract schema version, Python ≥ 3.11).
- Launcher factory: creates argv-only process spawners that call the external
  plugin's `scripts/aitp.py` with `shell: false`, cwd constrained to the
  workspace/store, stdout/stderr capped.
- **Does NOT maintain** `Map<workspaceId, card/trial/approval>` — no
  workspace-level state.

### 3.2 Session scope — adapter/coordinator

The Session-scope adapter (bound via `registerScopedService(
LifecycleScope.Session, …)`) owns:

- Binding to the session's workspace context (cwd, store path).
- Executing `enter`, `check`, `show`, `prepare`/`save` through the launcher.
- Single-flight scan: at most one in-flight marker/card/trial scan per
  session.
- In-flight question management: one pending human-gate question at a time.
- Process lease lifecycle: acquire, abort, dispose.
- Derived review phase: `candidate → card_saved → proposal_due →
  awaiting_decision → approved → awaiting_publish_choice`. This phase is
  **ephemeral** — discardable, rebuildable from the AITP canonical ledger, not
  a durable second state machine.

The adapter result and temporary review phase serve the current session's UX
only. They are not a second ledger; canonical truth is always the AITP
`.aitp/` files read through `show`/`list`/`check`.

### 3.3 Agent scope — main-only reminder bridge

Using `IAgentContextInjectorService` (from
`src/agent/contextInjector/contextInjector.ts`), the coordinator injects a
prepared snapshot into the main agent's context at every step head and after
compaction/undo. The provider is registered only when
`IAgentScopeContext.agentId === MAIN_AGENT_ID`, where `IAgentScopeContext`
comes from `src/agent/scopeContext/scopeContext.ts` and `MAIN_AGENT_ID`
from `src/session/agentLifecycle/agentLifecycle.ts`.

- `IAgentContextInjectorService.register(name, provider)` returns an
  `IDisposable`; `reconcileWhenIdle(name)` re-emits after idle.
- The provider receives `ContextInjectionContext<D>` (`injectedPositions`,
  `lastInjectedAt`, `lastInjection`, `lastDisclosure`, `isNewTurn`) and
  returns `ContextInjectionContent | ContextInjectionResult<D> | undefined`.
- The provider **does not** run CLI commands, scan the ledger, write records,
  or ask questions. It only injects a snapshot the Session-scope coordinator
  has already prepared.
- **Subagents are never injected** with human-gate reminders. Subagents may
  return candidate/review results to the main agent, but cannot post
  approval/publication questions, cannot answer them, and cannot bypass
  existing preset/profile routing.

### 3.4 Workspace scope — does not exist

`LifecycleScope.Workspace` is not in `scopes.ts`. This design does not
contribute services to a non-existent scope. Cross-session recovery re-reads
the AITP canonical ledger. If a future F-track effort adds Workspace scope,
workspace-shared singleton binding may be revisited at that time.

## 4. Runtime lease and argv launcher

The launcher reuses existing v2 process and runtime infrastructure:

- `IHostProcessService` (`src/os/interface/hostProcess.ts`, App scope) is the
  process-spawning primitive: `spawn(command, args, options)` returns
  `IHostProcess` with `pid`, `stdin`/`stdout`/`stderr`, `wait()`, `kill()`,
  `dispose()`.
- `HostProcessOptions` includes `cwd`, `env`, `shell`, `detached`,
  `windowsHide`, `mergeStderr`, and `timeout`.
- **`HostProcessOptions.timeout` is currently NOT implemented** in the Node
  backend (`src/os/backends/node-local/hostProcessService.ts` does not read
  the `timeout` field). The future AITP launcher must implement its own
  timeout, `SIGTERM` grace period, `SIGKILL`, `wait`/`finally` cleanup.
- `IRuntimeResolver` (`src/workspace/workspaceInstance/workspaceInstanceManager.ts`)
  provides `inspect(binding)` and `acquire(binding, required?)` →
  `RuntimeLease` for runtime capability resolution.

Launcher constraints:

- Command/args separation: `command` is the Python executable, `args` is the
  argv array; `shell` is `false` (never shell-interpolated).
- `cwd` is constrained to the session workspace or AITP store root.
- `env` is explicit (no full `process.env` passthrough).
- stdout/stderr are capped to prevent unbounded memory growth.
- Explicit `timeout` (self-implemented), `SIGTERM` grace, `SIGKILL` if needed.
- `wait()` in `finally` to ensure process exit before lease release.
- Exit codes: `0` clean, `1` findings, `2` cannot run (AITPError); spawn
  error, malformed output, and unknown contract schema all return explicit
  degraded status.
- AITP absent/old/not_initialized: never simulate success; return
  `absent`/`not_initialized`/`blocked`.

## 5. Native lifecycle checkpoints

Future native coordinator bounded checkpoints (all Session-scope, all
ephemeral unless written to AITP canonical ledger) are planned only. The
current Hakimi adapter performs read-only `enter` → `check` on mode entry and
active undo/cold restore after a ready probe; it does not perform automatic
session-end closeout, method scanning, or H6 orchestration:

1. **Session start/resume:** probe plugin/contract/Python; run `enter` and
   `check --json` (exit 2 = unknown state, fail closed; exit 1 = read
   findings, block draft if malformed/duplicate/missing/hash error on
   candidate Entries/cards/pins); scan current Topic markers/cards via `rg`
   discovery then `aitp show <id> --json` canonical read; generate read-only
   snapshot.
2. **After adapter successfully saves an AITP Entry/Note:** refresh only the
   touched record and related candidate/trial; do NOT full-scan every step.
   If mutation completion is unknown, read/reconcile first; never blindly
   retry.
3. **Turn end/idle:** consume D-track or agent candidate signal; execute
   bounded review. **Not inside the context provider** — the provider only
   injects the prepared snapshot; the coordinator runs at turn end or
   `reconcileWhenIdle`.
4. **State change:** `IAgentContextInjectorService.reconcileWhenIdle(name)`
   updates the main-agent disclosure snapshot.
5. **Session dispose:** cancel pending work, terminate process leases, release
   question subscriptions.
6. **Crash/cold resume:** discard ephemeral phase; re-read AITP canonical
   ledger. Pending Promises are not approvals; only canonical human `decision`
   Entries are approval/publish receipts.

Derived phase may represent
`candidate → card_saved → proposal_due → awaiting_decision → approved →
awaiting_publish_choice`, but it must be discardable and rebuildable from the
ledger. It is not a durable second state machine or append-only history.

## 6. Human decision interaction

The first native version reuses the existing Session-scope generic question
broker (`ISessionQuestionService`, `src/session/question/question.ts`), not a
new AITP-specific UI kind. This whole section is planned H6 behavior, not current
Hakimi adapter behavior. Alerts and the generic human gate are shipped, but
candidate confirmation is not a runtime-enforced guard on `SetResearchFocus`,
and `ResolveResearchDecision` does not automatically write an AITP decision
Entry.

- `ISessionQuestionService` is bound at Session scope
  (`registerScopedService(LifecycleScope.Session, …)`).
- `QuestionItem` carries `options: readonly QuestionOption[]` and optional
  `otherLabel`/`otherDescription` — meaning the UI currently offers an
  "Other" free-text path.
- `request(req, options?)` accepts `{ signal?: AbortSignal; agentId?:
  string }`; the coordinator (not the model-facing `AskUserQuestionTool`)
  posts the foreground question with `agentId: MAIN_AGENT_ID`.
- Fixed recommended options (e.g., `Approve` / `Defer` / `Reject` for the
  first question; `Publish now` / `Keep local` for the second). `Other` /
  free-text answers map to a result only when unambiguous; otherwise
  zero-write and re-ask.
- **Main agent only** — auto mode must not decide for the user.
- UI answers are **not** durable approval. They must go through AITP human
  `decision` `record prepare`/`save`/`check` to become canonical.

### 6.1 First question: card decision

When the proposal gate is reached (≥ 2 qualifying post-card trials exact-
pinning the same card revision), the main agent assembles a proposal packet
(card Note ID, path, SHA; trial IDs and exact pins; applicability,
limitations, contradictions; planned Skill routing boundary and its
tool/adapter dependency), then posts `Approve` / `Defer` / `Reject`.

On an unambiguous answer, the agent itself executes:

```sh
aitp record prepare --kind decision --authority human \
  --created-by researcher --idempotency-key <card-revision-approval-outcome>
```

fills the decision body, exact-`sha256:` pins the card revision, saves, and
runs `check`/`enter` to verify. The user does not run commands, edit drafts,
or fill YAML.

Semantics:

- Only an Entry whose content is explicitly approve, authority is human, pin
  is the current exact revision, and post-save verification succeeds,
  satisfies the approval gate. The card Note remains `agent_draft`.
- `Defer` and `Reject` are also recorded as human decisions (avoiding repeat
  prompts) but do not constitute approval.
- `Defer` re-prompts only on new qualifying evidence, explicit researcher
  request, or new revision. `Reject` re-prompts only on new revision or
  explicit reopen.
- Save/check failure, changed hash, or ambiguous selection: do not proceed to
  the second question.

### 6.2 Second question: publication choice

Only after the first approval decision is saved and verified, the coordinator
posts `Publish now` / `Keep local` as a separate human `decision` Entry with
an independent stable idempotency key, exact-pinning the same card revision:

- `Keep local`: record the choice and stop; do not re-prompt until researcher
  explicitly reopens or a new revision appears.
- `Publish now`: this Entry is the durable, recoverable explicit human publish
  request. Only after verification succeeds does it authorize the main agent
  to create/update `SKILL.md` in the AITP protocol/plugin repository through
  the normal code-change flow (with tests, provenance, and review). This is a
  separate reviewed repository task, not a native coordinator file-write side
  effect.

### 6.3 Subagent and preset boundaries

- Both questions are posted by the main agent only. Subagents may return
  candidate/review results but cannot post approval/publication questions or
  answer them.
- No hardcoded model or new preset for this feature. If a future independent
  reviewer is needed, it must go through the existing semantic
  route/profile/preset system, and the main agent still bears human
  interaction.

Only if real usage proves the generic question broker insufficient will a
domain-neutral `allowOther: false` or typed review contract be designed. This
design does not pre-expand the protocol/klient/server/TUI surface.

## 7. C/D/F/E owner boundaries

| Track | Owns in this design | Does NOT own |
|---|---|---|
| **C (AITP Feature)** | adapter, contract detection, CLI/files transport, degraded state, review scheduling, write coordination | scientific procedure matching |
| **D (Research Loop)** | ephemeral candidate signal and execution context from Research Frame/trajectory; runs without C/AITP | trial/approval state, direct `.aitp` writes |
| **Model + `distilling-methods` Skill** | reads canonical evidence; does generalization/independence/applicability judgment | runtime orchestration |
| **F (platform/engine)** | Feature/DI/lifecycle/process/question/wire/public contract | C must not self-build runtime |
| **E (UI)** | question/status/degraded projection display | AITP semantics |

The first native version does not create an AITP-specific subagent/preset. If
a future independent reviewer is needed, it must go through the existing
semantic route/profile/preset, must not hardcode a model, and the main agent
still bears human interaction.

## 8. Platform tool / method card / Skill three-layer boundary

This design encodes the three-layer separation from the AITP 0.8 Skill:

- **Tool/adapter execution:** Hakimi or external platform adapters own
  SSH/Slurm/rsync/job polling, argv, security cwd/env, timeout, remote
  status, and error classification. AITP Python does not implement these
  platform mechanisms.
- **Method card records stable procedure:** AITP cards summarize dependency
  order, preconditions, resource limits, verification anchors, stop
  conditions, and failure maps from recorded real execution evidence. Cards
  do not schedule tools.
- **Skill routes:** published Skills determine when to use a procedure and
  call existing deterministic tools/adapters. Skills do not duplicate
  scheduler/SSH/rsync implementation.

Remote evidence continues to be expressed through local immutable
pointer/report + pins; a bare `host:path` is never accepted as local
verification evidence. Host/session Goal belongs to Hakimi Goal/Research
Frame; AITP does not auto-import or override Topic Research Goal. Only
researcher-confirmed durable research goal/decision enters the AITP canonical
path.

## 9. Implementation gate sequence

Future C6/H6 code must follow this order; no step may be skipped:

1. **H0:** launcher, version-0 envelope, degraded, tree-hash.
2. **H1:** versioned `enter`/`list`/`show`.
3. **H2:** `check` (H2 scope).
4. **H3:** scoped read (M1c `enter-0.3`/`list-0.2`).
5. **H4:** scoped `check` (M1d `check-report-0.2`).
6. **H5 boundary:** AITP upstream ships `backfill-0.1` plus `sha256-once:`/policy semantics, but Hakimi's current adapter is only partial: it projects check finding codes as opaque strings and does not expose, call, or parse backfill. Any native H6 integration would require a separately reviewed adapter-contract extension.
7. **Reviewed adapter-contract extension:** freeze marker discovery,
   exact-card trial, decision/publish receipt, and degraded semantics
   (preferred: new schema version, not in-place mutation of
   `aitp/adapter-contract-0.1`). Until this extension is frozen, Hakimi docs
   can only write "planned."
8. **Session-scoped candidate/review prototype.**
9. **Human question + decision write/reconcile.**
10. **Crash/resume/main-agent-only/evaluation gate.**
11. **Workspace scope** (only if a future F-track effort adds
    `LifecycleScope.Workspace` to `scopes.ts`; then migrate workspace
    binding/capability snapshot).

Until all steps are complete, Hakimi docs write "planned/unavailable." The
AITP 0.8 Skill-only fallback can be used independently today (best-effort,
not exactly-once, not a runtime callback).

## 10. What this design does NOT claim

- No runtime auto-discovery of method observations (the Skill does
  best-effort; the native coordinator would schedule, not replace).
- No exactly-once guarantee (crash/resume may duplicate proposals; only
  canonical human `decision` Entries are authoritative).
- No scientific correctness or behavior-superiority claim over plain files.
- No auto-publish, no cross-Topic propagation, no `workstreams` inference,
  no resolving a failure on a card's authority.
- No Python-summarized distillation; provenance is preserved through
  canonical Entries/Notes/decisions.
