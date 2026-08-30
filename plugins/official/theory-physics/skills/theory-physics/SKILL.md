---
name: theory-physics
description: |
  Use this skill when starting or continuing sustained theoretical-physics
  research: decide whether Research Mode is warranted, align the question with
  the current Research Line and Goal, run bounded scientific actions, and route
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
3. Align the request with the current Research Line, Question, Focus, and
   stage Goal. A large topic belongs to the Line/Question/AITP context; a Goal
   is the current verifiable milestone, not a replacement for the topic.
   If Goal and Focus disagree, narrow the boundary before doing work.
4. Read only the current topic's state. For an unrelated line, consume only
   already-distilled reusable methods; do not inject the other topic's full
   state. Resume an existing line/workstream only from a persisted binding or
   an exact match, never from a guessed semantic alias.
5. Use one bounded Research Action for the next scientific step, then close it
   before choosing another.

Goal owns continuation across turns. Plan mode is a short-lived overlay inside
one complex Research Action; entering or leaving Plan mode does not enter,
exit, or reset Research Mode.

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
| An exact canonical Entry is needed | Delegate to `using-aitp`. |
| A verified derivation, result, failure, source, decision, run, or closeout has durable value | Delegate to `using-aitp`, then associate the resulting durable checkpoint through the normal barrier. |
| A method appears reusable across questions or lines, and the external plugin is installed, Research Mode is active, and `distilling-methods` is visible | Load `distilling-methods` on demand for protocol guidance; otherwise retain the candidate and evidence locally without claiming distillation or publication. |

Do not automatically write a Topic Goal, add `resolves`, publish a method card,
or turn a local Goal into an AITP record. Durable delta is the threshold for
`using-aitp`; reusable-method candidacy is the threshold for
`distilling-methods`. Native H6b method-distillation coordination remains
planned/unavailable. A resolved human gate alone is not a handoff.

## The bounded Research Action loop

For each substantive slice, keep the boundary explicit:

1. State the current physical Question, its Focus, and the falsifier or
   discriminating observation. Confirm that the action advances the stage Goal.
2. Choose one bounded action: literature review, derivation, numerical test,
   data analysis, or code investigation. State the expected evidence and stop
   condition with `BeginResearchAction`.
3. Do only that action. Use `WebSearch`/`FetchURL` for literature, `Read` for
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

For a long external task, use action-bound observations with
`ObserveResearchRun`. When a healthy detached background task is the only
dependency, call `UpdateGoal` with `status: active` and
`waitFor: { taskIds, policy }`. The runtime resumes the Goal when the selected
policy is satisfied and the task reaches a terminal state. Do not repeatedly
call `TaskOutput` to poll. Running is never scientific success. One completed
action is not a reason to invent a new persistence record: delegate only when
the result has durable scientific value.

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
requires it; do not substitute direct Markdown parsing. Ordinary progress stays
local until it crosses the durable-delta boundary.
