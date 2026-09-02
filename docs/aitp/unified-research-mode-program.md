# Hakimi × AITP unified Research Mode program

> Status: complete, 2026-09-01. This document defines one
> finite implementation program for Hakimi Research Mode. It was frozen
> against AITP 0.8 and now includes the reviewed S5.1 adapter-contract 0.2
> amendment in AITP 0.9.0. It is not an AITP canonical Entry or Note, does not change
> an AITP stage, and does not authorize a new AITP CLI, schema, ledger, or
> native method-distillation coordinator.

## Program outcome

The program completes when Hakimi Research Mode provides one coherent,
recoverable research workflow in which every main-agent research turn follows
the Research Loop, a Research Goal can authorize bounded autonomous
continuation, a Research Plan directs multiple loop iterations, a local Plan
organizes one bounded action, durable scientific deltas pass through the
existing AITP commit barrier, conditional method distillation follows the
external AITP Skill rules, and REST, WebSocket, SDK, klient, TUI, and Web show
one revision-consistent Research Board.

The program is finite. Its current implemented compatibility boundary is AITP
0.9.0, including only the S5.1 atomic-save amendment to the earlier 0.8
contract, plus the Skill-driven best-effort distillation path. It does not
require Hakimi H6b
native method-distillation orchestration, M2 reviewed artifacts, M3
cross-Topic links/catalog, M4 collaborator protocol, a formal post-M4 Hakimi
contract, a scheduler platform, an artifact database, a vector database, or a
new execution service. Those capabilities remain `planned / unavailable`
unless later natural-use evidence justifies a separately reviewed goal.

## Verified starting point

- Hakimi baseline: `2b2636fd6c2a6c84268e44edae2b66f7a7215e3c`, with the
  Goal-to-AITP-Program alignment amendment committed and the worktree clean at
  program creation.
- AITP baseline: `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`, plugin and
  contract version `0.8.0` / `aitp/adapter-contract-0.1`. The AITP worktree
  already contains user changes in `docs/hakimi/` plus untracked files; the
  program must not overwrite or absorb them.
- Current Research admission accepts only a typed Goal-owned continuation
  while Research Mode is active, ready, and running. Ordinary user turns do
  not receive Research guidance or turn-boundary maintenance.
- Current turn-end automation is read-only `enter` then `check`; canonical
  writes are explicit checkpoint operations using AITP prepare/save/show/check.
- Current `ResearchPlan` is a local plan for one bounded Research action. It
  is not yet the multi-loop research strategy required by this program.
- Current scope code contains `App -> Session -> Agent`. Some repository
  guidance still says four tiers; implementation must follow the live scope
  enum until a separate scope change actually lands.
- H6b native method-distillation orchestration remains planned and unavailable.

Every stage must refresh both repository HEADs and dirty state before work.
Documentation, old roadmaps, and this program never override live code,
contract, CLI help, fixtures, tests, or AITP Skills.

## Execution status

As of 2026-09-01, S0 through S10 are complete and verified. The reviewed S5.1
slice added AITP 0.9.0 adapter-contract 0.2 atomic Topic/exact-workstream save
preconditions and the Hakimi adapter now requires them for checkpoint-bound
save. S6 is release-adjudicated by
`.changeset/assess-research-durability.md`: the researcher explicitly authorized
an SDK major and CLI patch. All six Program-owned changesets now classify the
CLI contribution as patch and aggregate the SDK contribution to major. The
repository-wide `changeset status` still aggregates the CLI package to minor
because the committed baseline contains other pending CLI-minor changesets;
S10 preserves those unrelated release decisions.
S7 adds one stateless, same-turn external-Skill review after the first
successful checkpoint commit; `.changeset/distill-research-evidence.md`
records its CLI patch. S8 adds an optional, versioned observation of that
handoff to the existing Research snapshot and Board without adding semantic
distillation state. S9 closed with one bounded real ABACUS evidence audit,
one exact-workstream AITP commit, a conservative no-card review, and public
surface parity evidence. S1 introduced
transient `interactive_research` and `autonomous_research` turn leases while
keeping the generic Goal engine as the sole continuation owner. S2 introduced
the additive optional `hakimi/research-goal-0.1` snapshot projection across
the model injection, REST, WebSocket, Node SDK, klient, TUI, and Web, with the
legacy `goalSummary` retained as a compatibility fallback. The projection is
one-to-one with the current generic Goal and derives only state the current
contracts actually hold; `nonGoals` is therefore empty until a reviewed
structured input exists. Active Research completion and automatic
continuation now fail closed while the adapter is not ready, a checkpoint is
pending, a human gate is unresolved, or Program alignment blocks progress.

S3 added checkpointed `hakimi/research-plan-0.2` multi-loop plans without
reinterpreting the legacy bounded-action `ResearchPlan`: snapshots expose the
legacy record as both `researchPlan` and the additive `actionPlan` alias during
the compatibility period. A non-trivial action captures the exact active
Research Plan milestone and approved local Plan revision; a simple reversible
one-step action gets an explicit immutable minimal-plan binding. Start and
conclude fail closed on stale Goal, Program, milestone, Research Plan, local
Plan, Line, or Question context. Plan lifecycle changes are rejected while a
bound foreground action is live, and Plan completion has no Question, AITP, or
Goal side effect. The versioned plan, bindings, lifecycle commands, Board, and
Manager are aligned across REST, WebSocket, Node SDK, klient, TUI, and Web.

S4 added the checkpointed Hakimi-local `collaborative | dreaming` planning
policy. Collaborative planning routes only consequential Research Plan
unknowns through the existing `AskUserQuestion` broker; a dismissed, empty, or
ambiguous answer is a no-op. Dreaming chooses only reversible, low-cost,
in-scope defaults and records each one in the plan's `assumptions`. Neither
policy may cross an expensive or irreversible action, tool permission,
scientific-convention ambiguity, Goal/scope change, or AITP/human-decision
gate. Policy state, injection, revisioned commands, Board, and Manager controls
are aligned across REST, WebSocket, Node SDK, klient, TUI, and Web; changing the
policy has no AITP side effect.

S5 added a Hakimi-local, revisioned, explicit Research Line→AITP workstream
binding. A binding records a server-owned opaque confirmation identity, the
observed Topic and its Hakimi observation revision, plus explicit `user` or
`main_agent` confirmation; matching slugs,
text, paths, or IDs never imply membership. Unbound, unavailable, stale, or
conflicting Lines can continue low-risk local exploration but cannot create or
commit scoped durable checkpoints. Maintenance and checkpoint writes first
re-observe the unscoped Topic and then re-derive the exact binding; canonical
`show` verifies the captured Topic and exactly one captured workstream. A save result that races a
stale binding keeps its receipt and degrades with undo-based recovery, while a
reset/exit race remains explicitly indeterminate. Rebinding requires an explicit
clear first, and undo/cold restore re-evaluate rather than infer or repair it. REST,
WebSocket, Node SDK, klient, TUI, and Web consume the same snapshot projection.
No AITP CLI, schema, registry, alias catalog, or automatic backfill was added.

The strong S5 write-isolation claim is now satisfied by the reviewed S5.1
contract. AITP 0.9.0 `record save --expected-topic ... --exact-workstream ...`
compares the locked current Topic and exact singleton draft membership before
canonical persistence; failures create no canonical Entry. Hakimi supports
legacy adapter-contract 0.1 for non-checkpoint compatibility but requires 0.2
and derives both values from the captured confirmed binding for every
checkpoint-bound save. Canonical `show` and scoped `check` remain
defense-in-depth adoption barriers. This closes only S5; the subsequent S6
implementation consumes this unchanged barrier.

## Authority and ownership

| Concern | Authority | Consumer or projection |
| --- | --- | --- |
| Research Mode, Goal, Plan, Question, Line, Focus, Action, continuation | Hakimi | Research snapshot and Board |
| Entry, Note, refs, workstreams, relations, checkpoints, Method cards, trials, human decisions | AITP | Hakimi adapter through CLI/files contract |
| Commands, calculation inputs/outputs, logs, source trees, remote jobs | Existing Hakimi/workspace tools | Evidence packets and locally verifiable reports |
| Scientific synthesis, applicability, durable-delta judgment, card trigger judgment | Main agent with the active AITP Skills | Hakimi orchestration; never Python ledger logic |
| Final scientific direction, expensive actions, card approval and publication | Researcher | Human gates and AITP human decision Entries |
| Real-time display | Derived Hakimi Research snapshot | REST, WebSocket, Node SDK, klient, TUI, Web |

Hakimi must never parse or write canonical `.aitp` records itself. AITP must
never own Goal continuation, Research scheduling, tool execution, or Board
state. The Board is a projection and never becomes a second ledger.

## Target control model

Research Mode owns the Research Loop. Research Goal controls autonomous
continuation, not whether a turn is a Research turn.

```text
Research Mode active
  driver = interactive | autonomous
  planning policy = collaborative | dreaming

  recover and orient
    -> select or revise Research Plan milestone
    -> prepare local Action Plan
    -> BeginResearchAction
    -> execute real work
    -> evaluate evidence
    -> ConcludeResearchAction
    -> conditional AITP durable commit
    -> conditional method-distillation review
    -> publish one Research snapshot
    -> wait, continue, ask, block, or complete
```

An interactive lease admits a main-agent user turn whenever Research Mode is
active and the loop is running. It performs one Research Loop iteration but
never schedules another turn. An autonomous lease additionally requires an
active, aligned Research Goal and uses the existing generic Goal engine as the
sole continuation and budget owner. System, cron, and subagent turns do not
receive either main-loop lease.

The planning policy is orthogonal to the driver. `collaborative` asks the
researcher about unresolved consequential choices until the Research Plan is
actionable. `dreaming` records assumptions and chooses reversible,
low-cost, in-scope defaults. Dreaming never bypasses tool permissions,
expensive or irreversible action review, scientific convention confirmation,
AITP human decisions, card approval, or publication.

## Goal and plan layering

Research Mode presents a domain-specific Research Goal. The generic Goal
engine remains an internal continuation, deadline, and budget mechanism; it
does not become scientific truth and no second scheduler is introduced.

The Research Goal must contain or project the objective, completion criterion,
scope, non-goals, budget, stop conditions, current status, terminal reason,
human gates, Program relation, and persistence guards. Its relation to the
AITP Topic Research Goal is explicit and revision-bound. Hakimi never imports,
rewrites, or text-matches the AITP Topic Goal.

Planning has two levels:

- `ResearchPlan v2` is the multi-loop strategy bound to the Research Goal and
  Program. It contains milestones, hypotheses or Lines, evidence requirements,
  decision points, assumptions, stop/replan conditions, current milestone,
  and optimistic revisions.
- `Plan`, represented internally by an Action Plan binding, is the short-lived
  TODO list for one bounded Research Action. It may be revised during that
  action, but it does not become an AITP record or a Research Question.

The current bounded-action `ResearchPlan` wire shape cannot silently acquire
the v2 meaning. The migration must be versioned or use an additive successor
plus an explicit compatibility period. Any required major package bump stops
for explicit researcher approval before changeset generation.

## Evidence and persistence boundary

The loop distinguishes three revisions:

- `working`: action selection, execution, observation, cancellation, or
  no-progress state visible immediately in Hakimi.
- `assessed`: the main agent has evaluated the new evidence and updated the
  proposed scientific state.
- `committed`: a durable boundary has passed AITP prepare, save, canonical
  show, and pre/post check, and the committed cursor is acknowledged.

`ConcludeResearchAction` remains the normal local action boundary and already
records progress. The same conclusion must not be duplicated through
`RecordResearchProgress`. After conclude, a durable delta creates one commit
candidate. No durable delta is a strict no-op. A failed or unknown save remains
pending or degraded; it blocks dependent closure and Research Goal completion,
and recovery reconciles before retrying.

Human information preserves provenance. A durable researcher statement or
direction is recorded as a human assertion or decision. Tool, literature,
derivation, or execution verification is recorded separately with agent/tool
provenance. A human statement is never promoted to verified scientific result
merely because it appears in the conversation.

## Method-distillation boundary

Method-card semantics remain entirely in the external AITP
`distilling-methods` Skill.

- Before an action that may use an existing procedure, retrieve applicable
  cards by the generic marker and inspect their pinned basis.
- A post-card execution can count as a trial only when its newly created Entry
  exact-`sha256` pins that exact card revision at creation time.
- If no card covers the procedure, an eligible newly created execution Entry
  may carry one low-trust method-observation marker.
- After a successful durable save, review only the touched Entry, relevant
  slug, new card, or exact-card trial. Do not scan on every phase or restatement.
- A plan, source, decision, closeout, standalone failure, or unverified human
  advice is not a method observation.
- Two markers only nominate review. Two exact post-card trials only create a
  proposal. Approval and publication remain two separate human decisions.

The first program version may provide native scheduling of a bounded Skill
handoff, but it must be described as best-effort while the AITP contract lacks
the reviewed H6b extension. It cannot claim exactly-once, automatic semantic
judgment, automatic approval, or automatic publication.

## Research snapshot and Board

One versioned Research snapshot is the public projection. It combines, without
merging ownership, Research Mode, driver, planning policy, Research Goal,
Program alignment, Research Plan, current Action Plan, Question/Line/Focus,
phase, working/assessed/committed state, AITP health and cursor, human gates,
distillation attention, effective next step, and a monotonic revision.

The Board updates immediately for working state and again after durable commit
or failure. REST hydration must not overwrite a newer WebSocket revision.
TUI and Web commands mutate the underlying Research models; neither surface
writes AITP or owns a parallel board model. Every public contract change lands
across protocol, kap-server, Node SDK, klient, TUI, Web, fixtures, docs, and
changesets in the same stage.

## Stage S0: freeze the implementation contract

Objective: turn this program into an implementation-level decision with no
runtime changes.

Completion criteria:

- Verify the live Goal, Research, Plan, AITP adapter, public surface, and Board
  shapes against both repositories.
- Freeze lease semantics, Goal layering, Plan layering, durability states,
  planning policies, public migration strategy, and the stage dependency graph.
- Record all observed documentation/code conflicts. Do not silently choose a
  new AITP behavior.
- Keep AITP runtime, CLI, contract, schema, fixtures, and Skills unchanged.

Allowed files: this document and, only when their existing content is not part
of another dirty change, Hakimi engineering docs under `docs/aitp/`. AITP is
read-only during S0.

Verification: `git diff --check`, link/path checks, current HEAD/status, live
CLI/help/contract/fixture comparison, and a read-only review of the existing
Research test matrix.

Stop if the target requires a new AITP command/schema, changes human-decision
semantics, or conflicts with protected dirty files.

## Stage S1: admit interactive Research turns

Objective: make Research Mode, rather than Goal continuation, own Research
turn admission.

Completion criteria:

- Add explicit `interactive_research` and `autonomous_research` lease
  semantics without persisting the transient lease.
- Main-agent user turns in active, ready, running Research Mode receive the
  interactive lease and Research context injection.
- Goal-owned continuation receives the autonomous lease only when all current
  Research Goal/Program continuation guards pass.
- System, cron, subagent, inactive, paused, probing, and unsafe degraded turns
  abstain or receive only an explicit degraded projection.
- Interactive turns never enqueue continuation; the generic Goal engine remains
  the sole continuation owner.
- Loop-count semantics are explicit and tests distinguish interactive from
  autonomous iterations.

Primary Hakimi scope: `researchTurnAdmission.ts`,
`researchLoopCoordinator.ts`, Research injection, existing agent-core-v2 tests,
and current-state docs. AITP remains read-only.

Verification: focused admission/coordinator/injection tests, agent-core-v2
typecheck, Goal continuation regression tests, inactive zero-I/O tests, and
existing AITP golden tests.

Stop if admission requires a new external wire schema before internal semantics
are proven, or if an ordinary turn can accidentally schedule autonomous work.

## Stage S2: specialize Research Goal

Objective: expose a Research-specific Goal contract while retaining one
internal continuation engine.

Completion criteria:

- Define the Research Goal projection and its one-to-one internal Goal binding.
- Include objective, completion criterion, scope, non-goals, budget, stop
  conditions, Program relation, human gates, and persistence guards.
- Retain explicit Goal-to-Program alignment and optimistic revision checks.
- Active Research Mode blocks autonomous continuation and completion on stale,
  confirmation-required, conflict, pending checkpoint, degraded AITP, or
  unresolved human gate states.
- Interactive Research works without a Research Goal.
- REST, WebSocket, SDK, klient, TUI, and Web use the same snapshot semantics.

AITP observes only its own Topic Goal; no AITP runtime or schema change is
allowed. Sync cross-repository handoff docs only after Hakimi behavior passes.

Verification: Goal service and contribution tests, Research service tests,
protocol/schema tests, kap-server/SDK/klient tests, TUI/Web tests and typechecks,
plus Goal pause/resume/budget/complete regression coverage.

Stop for a required major version bump, automatic Topic Goal mutation, or a
second continuation scheduler.

## Stage S3: introduce Research Plan v2 and Action Plan binding

Objective: let a multi-loop Research Plan choose work while a local Plan makes
one action executable.

Completion criteria:

- Add a versioned or additive Research Plan v2 with Goal/Program binding,
  milestones, evidence requirements, decision points, assumptions, current
  milestone, and stop/replan conditions.
- Preserve compatibility for the current bounded-action ResearchPlan or migrate
  it explicitly to an Action Plan binding.
- Bind each non-trivial Research Action to the relevant Research Plan and local
  Plan revision; stale plans cannot start or conclude a new action silently.
- A simple one-step action may use a minimal Action Plan, but must still state
  purpose, expected evidence, and stop condition.
- Plan completion does not close a Question, commit AITP evidence, or complete a
  Research Goal by itself.

Primary Hakimi scope: protocol-independent Research types, checkpointed Plan
ops, Research tools/services, protocol/kap-server/SDK/klient, TUI/Web Board and
manager, fixtures, docs, and changeset.

Verification: schema compatibility, stale revision, undo/cold restore, Plan
finalize/discard, action binding, public-surface parity, Board rendering, and
package typechecks.

Stop before a breaking contract or major bump without explicit approval.

## Stage S4: add collaborative and dreaming planning policies

Objective: make uncertainty handling explicit and recoverable.

Completion criteria:

- Persist a Hakimi-local `collaborative | dreaming` planning policy.
- Collaborative planning uses the existing question broker to resolve only
  consequential unknowns needed to finalize or revise the Research Plan.
- Dreaming records assumptions and autonomously selects reversible, low-cost,
  in-scope defaults.
- Both policies stop for expensive/irreversible actions, tool permission,
  scientific convention ambiguity, Goal/scope changes, and AITP human gates.
- Changing policy does not itself write AITP; a resulting durable direction
  change uses the ordinary human-decision path.
- TUI/Web expose consistent status and controls without creating a second
  question protocol.

Verification: question broker behavior, dismiss/ambiguous answer no-op,
compaction/recovery, planning policy injection, permission regressions, public
surfaces, localization, and Web asset regeneration when source changes.

Stop if the implementation would auto-answer a human gate or hardcode a model,
preset, or domain-specific question list.

## Stage S5: bind Research Line to AITP workstream explicitly

Objective: remove the unsafe assumption that a current Line slug is
automatically an AITP workstream.

Completion criteria:

- Store a Hakimi-local, revisioned, explicit Line-to-workstream binding.
- Require an observed Topic and explicit user/main-agent-confirmed membership;
  never infer it from text, paths, IDs, or matching slugs.
- Unbound or stale Lines may continue low-risk local exploration but cannot make
  scoped durable claims.
- Maintenance and checkpoint calls use only the confirmed binding.
- No automatic workstream backfill or AITP registry is introduced.

S5.1 acceptance: AITP 0.9.0 adapter-contract 0.2 adds the paired atomic
expected-Topic/exact-workstream save preconditions. Hakimi supplies them only
from the captured explicit binding; it does not expose caller-controlled
precondition fields. Mismatch is a zero-canonical-write error, same-draft retry
remains idempotent, and post-save `show`/scoped `check` remain defense in depth.
The S5 strong durable-claim gate is passed; this does not start S6.

Verification: binding/stale/conflict tests, line switching, scoped empty store,
legacy unscoped records, outside-scope findings, undo/cold restore, and all six
official cross-repository fixtures.

Stop if implementation needs typed AITP Question/Line records, automatic
backfill, or a new workstream schema.

## Stage S6: automate conditional durable commit after conclude

Objective: make AITP persistence a normal Research Loop boundary without
turning every action into a ledger write.

Completion criteria:

- `BeginResearchAction -> real work -> ConcludeResearchAction` remains the
  normal sequence.
- Conclude emits one assessed commit candidate and explicitly prevents duplicate
  `RecordResearchProgress` for the same conclusion.
- No durable delta produces no AITP command and no blocking review.
- A verified durable delta uses the existing prepare/fill/save/show/checkpoint
  barrier in the same turn when possible.
- Human assertions/decisions and agent verification remain separate evidence.
- Stable idempotency, same-checkpoint retry, unknown-save reconciliation,
  mutation single-flight, stale revision, undo, cold resume, and degraded state
  preserve current fail-closed behavior.
- Goal completion and dependent formal closure wait for committed durability.

Primary Hakimi scope: Research action/conclude guidance and service behavior,
durable commit/checkpoint integration, injection, adapter tools, tests, docs and
public projections only when necessary. AITP runtime remains unchanged.

Verification: action/conclude/progress regressions, checkpoint prepare/save/
show/check tests, baseline/new-error behavior, idempotency and recovery tests,
adapter golden fixtures, process cap/timeout tests, and AITP adapter-contract
tests.

Stop if semantic durability would be decided in deterministic Python, canonical
files would be written directly, or the required evidence cannot be represented
by the current Entry/Note contract.

S6 implementation freeze: `ConcludeResearchAction` requires one main-agent
durability assessment. `no_durable_delta` records the existing Research
progress boundary and schedules zero S6 persistence or distillation I/O; the
pre-existing session-boundary `enter`/`check` maintenance read remains an
independent lifecycle responsibility. `durable_delta` names the existing
AITP Entry kind, authority, provenance class, and rationale; Hakimi validates
only their provenance consistency, then atomically records the conclusion and
one optional `commitCandidate` on the pending checkpoint. The candidate is an
additive Hakimi projection so undo and cold resume retain the exact prepare
intent; legacy and manually proposed checkpoints may omit it. It never makes a
scientific judgment or becomes an AITP schema.

The normal positive path continues immediately with the existing
`aitp_record_prepare` (candidate-exact kind/authority and captured workstream),
model-authored draft fill, `aitp_record_save`, canonical `show`, scoped
pre/post `check`, and `CommitResearchCheckpoint` barrier. A mismatched prepare
is rejected before adapter I/O. An identical conclude retry returns the same
pending candidate; a different retry fails closed. `RecordResearchProgress`
is rejected when it would duplicate the current concluded action. Question,
Line, Research Plan, and Goal completion that depends on the result remains
blocked while its checkpoint is pending. Human assertions and decisions use
human provenance in their own candidate/Entry; they are never merged with an
agent/tool/source verification candidate. This stage performs no Method-card
review and does not start S7.

S6 closure status, 2026-09-01: the frozen behavior is implemented in
Hakimi and the focused Research/adapter/public-surface tests plus Agent Core,
TUI, Web, typecheck, Web-asset, and unchanged AITP gates pass. Full package
suites additionally reproduce unrelated pre-existing workspace-Skill discovery,
prompt-abort, and MCP trust fixture failures. The researcher explicitly approved
the incompatible public SDK/REST input as an SDK major and the bundled CLI
behavior as a patch; `.changeset/assess-research-durability.md` records that
decision and `pnpm changeset status` passes. The S6 release gate is closed; S7
may now start.

## Stage S7: add bounded conditional distillation handoff

Objective: return an immediate, low-noise distillation outcome for verified,
reusable evidence created by the current loop.

Completion criteria:

- Retrieve relevant cards before executing a potentially covered method.
- After a successful durable save, hand off only the touched new evidence for
  one bounded review under the external `distilling-methods` Skill.
- Existing-card executions exact-pin the card at Entry creation; new eligible
  procedures use only the Skill-defined observation marker.
- Explicit researcher requests, two distinct execution chains, and repeated
  failure-plus-workaround are judged exactly by the Skill; marker count never
  drafts automatically.
- No durable delta, no eligible execution, existing coverage, or absent trigger
  is a strict no-op.
- Human advice becomes card basis only with preserved human provenance and
  separate verification evidence.
- Card draft, revision, trials, approval, and publication use current AITP
  Notes/Entries and the two human gates.
- Status and docs call this Skill-driven best-effort orchestration, not native
  H6b, a runtime hook, or exactly-once behavior.

Verification: static guidance tests, touched-entry routing, no-op/duplicate
guards, human provenance cases, basis-versus-trial fixtures, contradictory
trial stop, two-step question behavior, and AITP Skill/adapter contract checks.

Stop for a native marker parser/scanner, new card schema, registry/catalog,
automatic approval/publication, cross-Topic propagation, or a required H6b
adapter-contract extension.

S7 implementation freeze: `CommitResearchCheckpoint` distinguishes the first
successful commit from an idempotent duplicate. Only the first successful
commit asks an Agent-scope, stateless handoff service to resolve the exact
`aitp-research-protocol:distilling-methods` plugin Skill and return one
same-turn steer containing only the touched Entry ID and checkpoint ID. A
workspace or project Skill with the same name cannot shadow that exact plugin
selection. Missing, hidden, non-model-invocable, or failed Skill loading is a
successful-commit plus non-blocking `unavailable` result; an idempotent
duplicate schedules nothing. Before potentially reusable evidence is filled,
the Research guidance also requires retrieval of applicable Method cards and
delegates exact-card pins versus observation markers to the external Skill.

The handoff persists no scheduler state, retry ledger, trigger decision, or
public Research snapshot field. A crash after canonical commit but before the
steer may miss the review. Therefore this slice is Skill-driven best-effort
orchestration, not H6b, a runtime hook, recovery, or exactly-once delivery. It
does not parse markers, scan the ledger, create/revise a card by itself,
approve/publish, or change AITP runtime, CLI, schemas, adapter contract,
fixtures, or human-decision semantics.

S7 closure status, 2026-09-01: exact plugin selection, touched-Entry routing,
same-turn delivery, first-commit/duplicate behavior, missing/hidden/
model-disabled Skill no-op, pre-fill guidance, and injection guidance are
covered by the Agent Core suites. Focused Skill/Research tests pass 401/401;
the second serial full Agent Core run passes 5,838 tests with 1 skip across 339
files; typecheck, build, and the 1,288-file import-boundary guard pass. The
first serial full run had one unrelated temporary-directory cleanup race
(`ENOTEMPTY`) that passed both its isolated 12-test rerun and the full rerun.
The unchanged AITP 0.9.0 suite passes 181/181. The S7 CLI patch is recorded in
`.changeset/distill-research-evidence.md`, and `pnpm changeset status` accepts
the cumulative release intent. S7 is closed; S8 may now start.

## Stage S8: converge Research status and Board

Objective: make the whole loop observable through one revision-consistent
snapshot on every supported surface.

Completion criteria:

- The snapshot exposes driver, planning policy, Research Goal, Program
  alignment, Research Plan, Action Plan summary, Question/Line/Focus, phase,
  durability, AITP health/cursor, gates, distillation attention, next step and
  monotonic revision.
- Working updates appear immediately; assessed, pending, committed, degraded,
  and blocked updates are distinguishable.
- REST hydration cannot overwrite a newer WebSocket state.
- Node SDK, klient, TUI and Web agree with protocol/kap-server.
- Board controls mutate underlying Research state and never AITP or a parallel
  Board store.
- Unavailable capabilities remain labeled `planned / unavailable`.

Verification: protocol fixtures, REST/WS event tests, stale response tests,
SDK/klient facade tests, TUI Board/manager tests, Web Board/command tests,
localization, typechecks, and canonical Web asset regeneration/check.

Stop on any surface inconsistency, stale overwrite, direct AITP write, or
unresolved generated-asset provenance failure.

S8 implementation freeze, 2026-09-01: the additive optional
`hakimi/research-distillation-attention-0.1` field reports only
`review_requested` or `handoff_unavailable`. It binds the receipt to the exact
latest committed checkpoint/Entry and records a monotonic non-checkpointed
commit revision; a newer commit hides an older receipt, and a stale result
cannot overwrite a newer receipt. `review_requested` means only that the
same-turn external-Skill steer was prepared — it does not claim a trigger,
card, trial, completed review, approval, or publication. An unavailable
handoff contributes generic Board attention; a requested review appears only
as expanded provenance. The receipt adds no public mutation, retry ledger,
scheduler, scan, or H6b recovery state. Protocol, REST/WS, Node SDK, klient,
TUI, Web, stale-response handling, typechecks, manifests, and generated Web
assets use the same optional projection. S8 is closed; S9 may now start.

## Stage S9: validate with real ABACUS or LibRPA research evidence

Objective: demonstrate the integrated workflow with real research work rather
than only synthetic state tests.

Completion criteria:

- Use one initialized AITP research workspace and one bounded, reproducible
  ABACUS or LibRPA action that existing tools can execute safely.
- Capture real commands, inputs, outputs, versions, errors, limitations and
  locally verifiable evidence; a job or output file alone is not a pass.
- Demonstrate at least one human assertion or instruction followed by separate
  agent/tool verification and an honest durable outcome.
- Demonstrate no-delta no-op, successful committed delta, and one degraded or
  failure/recovery path without fabricating resolution.
- Exercise a relevant existing card trial or record an eligible observation;
  do not manufacture repetition solely to force a card.
- Verify Board and all public clients represent the same loop state.
- Record limitations precisely; do not claim physical validation beyond the
  actual convergence, provenance, MPI, and scientific checks performed.

Allowed repositories and workspaces must be named and re-verified when this
stage begins. Expensive compute, remote mutation, and human decisions require
fresh authorization. AITP records are written only in the selected initialized
research workspace, never in either protocol implementation repository.

Stop if no safe real workspace exists, evidence cannot be pinned locally,
physical conventions are ambiguous, or the run would require a new scheduler,
runner, artifact schema, or platform service.

### S9 closure evidence (2026-09-01)

S9 used the initialized `/home/bhjia/physics/GW_librpa` workspace and the
existing immutable ABACUS job-1097 packet. The source checkout was re-verified
at dirty HEAD `f20aeb9e562ac66dcd59617ea4ceb07cffabe8b2`; no source file,
remote host, scheduler, MPI process, or ABACUS executable was mutated or run.
The bounded local verifier checked all nine `MANIFEST.sha256` members and
independently reproduced the 313-row union counts: 203 `PASS_ALL`, 59
`MERGE_PASS_PARENT_NONPASS`, 28 `INHERITED_BOTH`, 16 `INHERITED_SOC`, and 7
`ENVIRONMENT_REPRODUCED_ALL`, with 22 manual-evidence rows and zero blocking
classes. This revalidates only the local packet and does not transfer evidence
from checkpoint `7ef8506a8` to current HEAD or strengthen physical claims.

The researcher's instruction that reusable knowledge require real validation
was kept separate from the agent/tool result. A wrong expected checkpoint
exited 2 and wrote no result; the correct run created a deterministic report;
the identical retry returned `unchanged`. AITP scoped pre-check was clean with
71 errors and 201 warnings explicitly outside scope. Atomic 0.9.0 save under
Topic `gw-librpa` and exact workstream `hakimi-s9-abacus-union-audit` created
`entry-a071eb42792548f685520d4492615a63`; canonical `show` and scoped
post-check passed, and the identical save retry returned `already_saved`.

The Entry carries one low-trust
`method-observation: manifest-verified-union-gate`. The touched-evidence review
found exactly one such observation and no existing card, so the external Skill
correctly no-oped: no trigger, card, trial, decision, approval, or publication
was manufactured. A real-derived contract fixture then preserved the exact
revision, binding, checkpoint, Entry, and observational handoff through
protocol, kap-server REST/WS, Node SDK, klient, TUI, and Web. The official TUI
Board harness passed 60/60; the parity retry was byte-identical.

The public maintenance receipt consistently reports the exact scoped check,
but its current shape does not expose `check-report-0.2.counts.outside_scope`
as a separate Board field. That additive public-schema question is documented
as `planned / unavailable` for a separately reviewed goal, not implemented in
S9. The global AITP findings and the combined nspin4 + SOC + magnetic symmetry
+ active split-Ewald + converged non-trivial-magnetization contract remain
unresolved/`UNVALIDATED`. S9 is closed; S10 proceeded without expanding the
scientific claim.

## Stage S10: close the program and adjudicate native H6b

Objective: close the finite program honestly and decide whether a separate
native-coordinator goal is justified.

Completion criteria:

- Re-run the full relevant Hakimi test/typecheck/build matrix and the unchanged
  AITP ledger suite.
- Re-verify CLI help, adapter contract, schemas, fixtures, package versions,
  handoff docs, generated assets, and both repository statuses.
- Sync Hakimi and AITP handoff documentation only where protected dirty changes
  can be safely separated.
- Report real-use evidence for or against native H6b needs such as missed
  reviews, duplicate proposals, cold-resume loss, unresolved question recovery,
  or mutation reconciliation gaps.
- If no reviewed contract change is justified, keep H6b explicitly planned and
  unavailable and complete this program with the Skill fallback boundary.
- If a new adapter contract, CLI, schema, or human-decision semantic is required,
  block this program at the boundary and request a separate reviewed goal; do
  not implement it under this program.

M2, M3, M4, formal post-M4 Hakimi contract, typed canonical Question/Line,
`lineage`, structured prepare, pointer bundle, scheduler lifecycle, artifact
database, vector database, daemon, and auto-publication remain outside scope.

### S10 closure evidence (2026-09-01)

S10 reran the complete relevant validation matrix against Hakimi HEAD
`2b2636fd6c2a6c84268e44edae2b66f7a7215e3c` and protected AITP HEAD
`eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`. Agent Core passed 5,839 tests
with one skip, TUI passed 3,152 with two skips, Web passed 914, protocol passed
577, and the unchanged AITP ledger suite passed 181. All seven affected-package
typechecks and builds passed; the 1,288-file import boundary, 14-test generated
manifest gate, 521-file reproducible Web asset check, AITP adapter-contract
subset, CLI help/version, runtime budget, and both repository diff checks also
passed.

Full kap-server, klient, and Node SDK runs were attempted and reproduced only
the known non-Research workspace-Skill, prompt-abort, and MCP-trust baseline
failures; the two long-running suites retained open handles until the outer
timeout. Research wire tests shown in those runs passed, and the Research-only
SDK RPC subset passed 13/13. These failures remain non-green and were not
silently converted into Program evidence.

The immutable S10 summary is
`/home/bhjia/physics/GW_librpa/.scratch/hakimi-s10-unified-research-mode-20260901/S10_VERIFICATION.md`.
No ABACUS, MPI, SSH, scheduler, or remote action ran. No AITP runtime, CLI,
schema, contract, fixture, Skill rule, or human-decision semantic changed in
S10. The Program-owned changesets now express CLI patch and SDK major exactly;
the whole-repository pending release remains CLI minor because unrelated
baseline changesets are still present, and `changeset version` was not run.

The one real S9 evidence chain did not demonstrate duplicate proposals, but it
also did not exercise a live crash/cold-resume replay or reconciliation path.
That evidence is insufficient to justify a native recovery contract and cannot
support an exactly-once claim. H6b therefore remains explicitly
`planned / unavailable`, with the bounded external-Skill handoff as the current
implemented fallback. A public `counts.outside_scope` projection likewise
remains a separately reviewed option. The finite S0-S10 Program is closed.

## Global verification matrix

Use the narrowest live package scripts first, then the cross-package gate
proportional to the changed surface. Representative commands are:

```sh
pnpm exec vitest run packages/agent-core-v2/test/features/aitpResearch
pnpm exec vitest run packages/agent-core-v2/test/agent/goal
pnpm exec vitest run packages/kap-server/test/research.test.ts
pnpm exec vitest run packages/klient/test/facade.test.ts
pnpm -C apps/kimi-web typecheck
pnpm run build:web-assets -- --check
git diff --check
```

For AITP, after refreshing the live environment and preserving its dirty tree:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -q
git diff --check
```

Every contract-affecting stage also verifies CLI help, live JSON schema names,
the adapter contract, official fixtures, REST/WS/SDK/klient parity, and
`planned / unavailable` labels. A green build is implementation evidence, not
scientific validation.

## Goal operation rules

- Execute stages in order. At the beginning of a stage, restate its objective,
  completion criteria, scope, non-goals, allowed files, tests, and stop
  conditions in the active working plan.
- Complete and verify one stage before starting the next. Do not mix changesets
  from unrelated stages.
- Protect existing dirty changes. Stop when authorship or overlap cannot be
  distinguished safely.
- Do not commit, push, reset, rebase, clean, restore, delete, or overwrite files
  without current explicit authorization.
- A stage may end in a documented no-op when its trigger is absent. It may not
  turn an unavailable capability into a fabricated completion.
- Mark the overall Goal complete only after S0-S10 completion criteria are met
  and no required work in the program remains. If a hard stop repeats and no
  in-scope progress remains, mark the Goal blocked and report the exact boundary.
