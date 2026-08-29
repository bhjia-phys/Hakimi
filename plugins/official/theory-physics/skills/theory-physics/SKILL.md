---
name: theory-physics
description: |
  Use this skill when Research Mode is being used for theoretical-physics work:
  formulate and narrow questions, decide when to search literature, check
  derivations, design numerical tests, interpret HPC evidence, and report
  scientific progress without confusing engineering evidence with a physical
  conclusion.
---

# Theory-physics research discipline

This skill is a domain pack for Hakimi's generic Research Loop. It supplies
physics-specific judgment and routing; it does not create a second research
runtime, a second ledger, or an autonomous background loop. The main agent
remains responsible for interpreting evidence and changing Research state.

## The loop

For each substantive slice, keep the boundary explicit:

1. State the current physical question and the falsifier or discriminating
   observation.
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
   step. Change the Research Question only when the evidence changes its
   assessment or next bounded action.

Do not call a tool merely to make the board look busy. A read, search, or test
is research evidence only after the main agent explains what it means for the
question.

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
inconclusive or bounded by the missing gate rather than upgrading the question
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
AITP handoff or write an Entry/Note just because a gate was resolved; use the
normal checkpoint barrier when a durable milestone has actually been reached.

## Reporting standard

Human-facing updates should be science-first and progressively detailed:
what physical question was addressed, what was done, what was learned, how it
changes the mainline, what remains uncertain, and the next bounded action.
Keep receipt ids, hashes, paths, and transport details in the Board's expanded
or audit view unless they are needed to reproduce a result. Never claim that a
file, job, test, or derivation proves more than its evidence supports.

Use AITP only through its exposed adapter tools. `aitp_show` is the canonical
way to inspect an Entry; do not substitute direct Markdown parsing. Durable
milestones go through `ProposeResearchCheckpoint` and
`CommitResearchCheckpoint`, while ordinary turn progress stays in the local
Research state until it has scientific durability worth recording.
