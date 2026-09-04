---
name: theory-physics
description: |
  Use this skill when starting or continuing sustained theoretical-physics
  research: decide whether Research Mode is warranted, align the question with
  the current Research Line and optional Goal, run bounded scientific actions, and route
  durable evidence or reusable methods to the authoritative AITP skills.
---

# Theory-physics research discipline

This is the single upper-layer handbook for sustained theoretical-physics
research in Hakimi. It supplies physics judgment and Research routing; it does
not create a second runtime, ledger, protocol implementation, or autonomous
background loop. The main agent remains responsible for interpreting evidence
and changing local Research state.

## Research admission

Do not enter Research Mode for an ordinary, one-off physics answer that can be
resolved in the current turn without repository evidence, durable state, or a
stage milestone. Enter it when the work is sustained across turns, needs
workspace or literature evidence, must preserve a research state, or advances
a Goal.

For sustained work, follow this order:

1. If Research Mode is inactive, call `EnterAITPMode`. Do not invent a recovery
   command or initialize, adopt, or backfill a workspace from this skill.
2. Call `GetResearchStatus` to read the authoritative Research snapshot. After
   `EnterAITPMode`, if the snapshot is still `probing`, wait for it to converge
   to `ready` or `degraded`; do not turn this into a repeated-call or busy-
   polling loop. While status is pending or unavailable, do not call AITP write
   tools or fall back to a bare CLI invocation outside the adapter. Report the
   real degraded boundary if probing cannot complete.
3. Align the request with the current Research Line, Question, and Focus. A
   Goal is optional: normal conversation can investigate and plan without one.
   When a Goal exists, it is a verifiable milestone, not a replacement for the
   topic. If Goal and Focus disagree, clarify the boundary before doing work.
4. Read only the current topic's state. For an unrelated line, consume only
   already-distilled reusable methods; do not inject the other topic's full
   state. Resume a line/workstream only from its current explicitly confirmed
   binding; identical slugs are not confirmation. Do not infer Goal–Program
   alignment or transfer a different line's conclusions into this one.
5. Use one bounded Research Action for the next scientific step, then close it
   before choosing another.

Goal alone owns automatic continuation, budgets, waits, and lifecycle. A paused
Goal stops automatic continuation, not ordinary conversation. Research Mode
provides research discipline with or without a Goal; it is not a second Goal
engine. A scientific loop may span several bounded Actions and turns.

Research Plan describes revisable milestone strategy under an aligned Goal.
Use it when the project needs that scale, not as a prerequisite for inquiry.
Plan mode prepares/reviews a local multi-step plan before a complex Action;
that local plan can exist without a Goal or Research Plan. Bind to a current
parent milestone when one exists. For a small reversible probe, begin a simple
bounded Action without a formal plan. TodoList tracks execution detail, not
scientific evidence. None of these overlays enters or resets Research Mode.

`collaborative` and `dreaming` guide how much to consult the researcher about
scientific uncertainty. Collaborative discussion should resolve consequential
choices, not interrupt every minor assumption. With a clear Goal, dreaming
continues within the agreed scope using explicit, revisable assumptions. Both
still stop for new authority or a consequential ambiguous decision. `auto`
controls tool approvals separately; it does not approve scientific claims,
Goal alignment, publication, or an expansion of the agreed scope.

## AITP delegation boundary

The external `aitp-research-protocol` plugin owns the protocol. Its `using-aitp`
and `distilling-methods` skills remain independent, active-only, and loaded on
demand. Delegate to `distilling-methods` only when that plugin is installed,
Research Mode is active, and the skill is currently visible. This skill names
the handoff boundary but does not reproduce their CLI commands, schemas,
method-card rules, trial rules, or approval rules.

| Situation | Route |
| --- | --- |
| Reads, calculations, probes, or turn progress without scientific durability | Keep it in local Research state; do not write AITP. |
| Prior evidence, a working Note, or a relevant Method card may answer the present uncertainty | Load `using-aitp` on demand and inspect only relevant records and their basis; no durable delta is required to read. |
| A verified derivation, result, failure, source, decision, run, or closeout has durable value | Delegate to `using-aitp`, then associate the resulting durable checkpoint through the normal barrier. |
| A method appears reusable across questions or lines, and the external plugin is installed, Research Mode is active, and `distilling-methods` is visible | Load `distilling-methods` on demand for protocol guidance; otherwise retain the candidate and evidence locally without claiming distillation or publication. |

Do not automatically write a Topic Goal, add `resolves`, publish a method card,
or turn a local Goal into an AITP record. Durable delta is the threshold for
new research records, not for retrieving existing knowledge. Reusable-method
candidacy warrants consulting `distilling-methods`, whose own triggers decide
whether to do anything. After the first successful commit of a new checkpoint,
Hakimi can make one same-turn, best-effort handoff of only the touched Entry to
that external Skill; duplicate commits or an unavailable Skill are non-blocking
no-ops. This bounded handoff owns no trigger, card, trial, approval, publication,
retry, scheduler, or exactly-once state. A full native H6b coordinator with
durable scheduling and recovery remains planned/unavailable. A resolved human
gate alone is not a handoff.

## The scientific loop and bounded Actions

Start from the physical uncertainty, not from a phase checklist. Before a
candidate explanation is clear, discuss the question, inspect relevant AITP
records, or run an owned literature/derivation Action to identify conventions,
alternatives, and a useful benchmark. Its expected evidence can be a narrowed
question or a falsifiable candidate; do not invent a hypothesis in advance.

Once candidates are clear, choose the smallest discriminating test, consult
applicable existing methods, and plan to the complexity of that test. Evaluate
support, counterevidence, and limitations before deciding to refine the
candidate, ask the researcher, wait, or close the milestone. Negative evidence
can advance the project. Several Actions may serve one scientific loop.

For each substantive work slice, keep the boundary explicit:

1. State the uncertainty being reduced and the expected discriminating evidence
   or useful clarification. If there is a Goal, relate the slice to it.
2. Choose one bounded action: literature review, derivation, numerical test,
   data analysis, or code investigation. State the expected evidence and stop
   condition with `BeginResearchAction`.
3. Begin must succeed before work, in an earlier tool batch. If refused, read
   the reported blocker and recover it; do not continue through generic tools.
   Do only that action. Use `WebSearch`/`FetchURL` for literature, `Read` for
   local evidence, and `Bash` for reproducible calculations or tests. Delegate
   independent checks to subagents only when their output can return as a
   typed evidence packet.
4. Check assumptions, dimensions, conventions, limiting cases, numerical
   tolerances, and provenance. A running process or a passing software test is
   not a physical result.
5. Call `ConcludeResearchAction` with the physical work performed, result,
   tests or derivation, limitations, impact on the mainline, and one next
   step. Change the Question only when evidence, failure, or sustained
   no-progress changes its assessment or next bounded action.

Do not repeat the same conclusion with `RecordResearchProgress` after Conclude.
`state_updated` is a conclusion boundary, not a card trigger or a demand to
write. Preserve a meaningful negative result, verified human guidance, or a
reproducible failure when it changes what the next researcher should do;
success/failure and durable/no-delta are separate judgments. Treat a human's
technical suggestion as attributed guidance until a source, derivation, or
test verifies it; the speaker's confidence is not validation.

For a long external task, use action-bound observations with
`ObserveResearchRun`. When a healthy detached background task is the only
dependency, call `UpdateGoal` with `status: active` and
`waitFor: { taskIds, policy }`. The runtime resumes the Goal when the selected
policy is satisfied and the task reaches a terminal state. Do not repeatedly
call `TaskOutput` to poll. Running is never scientific success. One completed
action is not a reason to invent a new persistence record: delegate only when
the result has durable scientific value.

There is currently one foreground Action/run per session. Waiting does not
authorize a second independent Action: reflection or recorded-knowledge
inspection may continue, but new searches, edits, or calculations must belong
to the live Action's purpose and capabilities. Do not disguise unrelated work
as monitoring. If another inquiry is needed, first resolve the foreground
ownership through the supported lifecycle; parallel scientific loops remain
unavailable.

Do not call a tool merely to make the Board look busy. A read, search, or test
is research evidence only after the main agent explains what it means for the
Question.

## Literature decisions

Search literature when a claim depends on a convention, established result,
known method, material parameter, prior negative result, or a competing
explanation that cannot be settled from the current workspace. Search before
committing to a supposedly standard formula when the convention matters.
Use primary papers or authoritative sources for claims, and record the exact
source and what it supports. Distinguish published evidence, preprints,
review articles, and the agent's inference. If a search only identifies a
candidate source, do not present it as verification; fetch and inspect the
source before relying on it.

A literature search should answer a named question. Capture the useful result,
not a bibliography dump: what was compared, which assumptions apply, and what
would falsify the transfer to the current system.

## Derivation checks

For a derivation, expose the starting definitions, conventions, and scope.
Check dimensions and units, signs, indices, symmetry constraints, limiting
cases, and whether every approximation is used consistently. Test a special
case or an independent formulation whenever practical. Separate an algebraic
identity from a physical assumption and a conjectural interpretation. If two
conventions are possible, state both and choose one explicitly rather than
silently mixing them.

A derivation is not established because the symbolic steps look plausible. The
report must say which checks passed, which remain untested, and what observation
would distinguish the result from a competing derivation.

## Numerical and HPC evidence

Before a calculation, pin the input model, code revision, relevant parameters,
convergence criteria, and expected observable. Prefer a small reproducible
probe before an expensive scheduler job. For a long job, record observations
with `ObserveResearchRun` against the current action, including the stage and
scheduler state; never treat `RUNNING` as scientific success.

Interpret results only after the required gates complete. Check convergence,
finite-size or discretization effects, symmetry and conservation constraints,
error bars or tolerances, and comparison against a baseline. Report scheduler
success, artifact existence, analyzer checks, and physical observables as
separate facts. If the evidence is incomplete, conclude the action as
inconclusive or bounded by the missing gate rather than upgrading the Question
prematurely.

For domain-specific calculations, the relevant analyzer should emit structured
observables when possible: name, value, units, tolerance, comparison, pass or
fail, and input references. Keep the free-form scientific explanation beside
that machine-readable evidence.

## Subagents and human gates

Subagents are independent critics or specialists, not owners of Research
state. Ask them for a bounded claim, evidence, assumptions, tests, sources,
artifacts, limitations, and confidence. Review their typed packet as the main
agent; packet review is zero-write until the physical meaning is understood.
Delegate a bounded engineering task when it genuinely saves the main agent's
attention, with exact input/method references and an expected observation.
Tools perform provenance checks; the main agent evaluates their scientific
meaning. Do not delegate away a failed verification or pretend a dedicated
calculation-operator profile is installed before it actually appears in the
available agent types. For a bounded compilation, input, calculation or
postprocessing delegation, read `../../references/calculation-delegation.md`.
The optional `calculation-operator` role in this pack uses existing tools and
returns the existing evidence packet; it owns neither a ledger nor a Goal.

Ask the human when the choice changes the research question, selects between
competing physical interpretations, commits an expensive or irreversible
external action, adopts a convention that affects the mainline, or would turn
an ambiguous result into a durable conclusion. Resolve the gate explicitly and
explain the physical decision in the next progress report. Do not invent an
AITP handoff or write an Entry/Note just because a gate was resolved.

## Reporting standard

Human-facing updates should be science-first and progressively detailed:
what physical Question was addressed, what was done, what was learned, how it
changes the mainline, what remains uncertain, and the next bounded action.
Keep receipt ids, hashes, paths, and transport details in the Board's expanded
or audit view unless they are needed to reproduce a result. Never claim that a
file, job, test, or derivation proves more than its evidence supports.

Use AITP only through the exposed adapter and the delegated external skills.
`aitp_show` remains the canonical route for an exact Entry when `using-aitp`
requires it; do not substitute direct Markdown parsing. AITP `show` does not
read Notes: use `Read` on the exact workspace-relative
`.aitp/topic/notes/note-<id>.md`. Generic `Grep` discovery of
`^> method-card:` or `^> method-observation:` under `.aitp/topic/`, with file
names as output, is also read-only recorded-knowledge inspection; neither
requires a live Action. General searches, workspace reads/writes, and shell
work still do. Canonical writes always use AITP save, never Edit/Write/Bash.

Retrieve because a present question needs the material, not at every phase.
The host already owns turn-boundary reconciliation and scoped maintenance;
do not add a second enter/check loop, repeated scans, or mandatory Notes. Keep
historical warnings in context; resolve safe structural drift without making
scientific decisions. Report an actual blocking condition once with its next
recovery step, rather than making the researcher maintain the Board.

Within an owned Action, consult `../../references/research-routing.md` for
scenario guidance and `../../references/evidence-reporting.md` for closeout.
Stage Notes and paper materials should synthesize recorded evidence rather
than replace it. For a stage Note or a useful review interrupted by session
restore, follow the bounded Note Action route in the evidence-reporting
reference. A restored review marker does not restore old draft permission;
neither it nor a completed phase demands a Note. Ordinary progress stays local
until it has durable value.
