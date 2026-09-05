# Bounded calculation delegation

Use the `calculation-operator` agent profile when a well-specified engineering
slice would distract from the physical question: checking a build or input,
running a small benchmark, parsing an observable, or reproducing a failure.
This is one optional specialist within the foreground Research Action, not a
new runner or a parallel scientific loop. A short direct check needs no child.

Before delegation, identify the question and discriminating test yourself.
Read relevant recorded evidence and applicable methods using the existing
AITP routes. The operator can inspect exact supplied card/Note files, but the
main agent remains responsible for canonical Entry retrieval and interpreting
the evidence. Supply:

- Current Action, Line and Question IDs, plus a unique packet ID for this task.
- The input dataset/code and relevant recorded evidence, including known
  counterevidence; exact Method-card paths and applicability, if available.
- The observable, conventions, baseline and numerical checks that matter.
- Allowed working/output paths, commands or task scope, resource/time bounds,
  authorized retries and the stop condition. Preserve existing user changes.
- The whole task's remaining time or deadline and an earlier child return
  deadline, leaving time for your artifact review, scientific assessment and
  any necessary durable closeout. Per-command timeouts do not cover model
  reasoning, script generation or reporting. Do not invent a deadline when
  none was given; choose a proportionate task bound within existing authority.

Prefer exact input locations and the checks needed for this question over
open-ended repository inspection or a general-purpose analysis framework.
Choose one delivery form: a saved existing-format packet with a short return
message, or an inline packet if no file is needed. Do not request both full
copies by default. If the remaining budget cannot cover delegation and review,
do a smaller authorized direct check or report the unfinished boundary; do not
extend the deadline, lower the acceptance criterion or claim unreviewed success.

Begin the Action successfully in an earlier tool batch with the `subagent`
capability (or the exact `Agent` grant). Then use the existing `Agent` tool
with `subagent_type: "calculation-operator"`, a short description and the
bounded prompt above. Keep `run_in_background: false` unless independent work
within the same Action genuinely benefits from background execution. Do not
conclude, switch Line or reinterpret the Action while its child still works;
collect or stop it through the existing task lifecycle first. Normal Goal
task waiting still belongs to Goal, not this profile.

The profile must appear in the tool's available agent types. If it is absent,
report that it is unavailable and do the same bounded task directly when your
Action grants the required tools; do not silently launch an unrelated role.
The profile is an installed role definition. `/preset` and `[subagent].presets`
select the model-routing pool separately; this pack neither changes that pool
nor pins a provider or model.

Review the returned existing Research evidence packet with
`ReviewResearchEvidence` at the current Research revision. For a file-backed
handoff, read the saved packet rather than asking the child to reproduce it.
Check the supplied scope IDs and actual artifacts before relying on the report.
Packet validation is structural and zero-write, not scientific acceptance.
A missing artifact does not establish the child's explanation for its absence: distinguish an
unattempted operation, an observed tool error and an unverified cause. Keep a
numerical result separate from a failed handoff; do not repeat a completed
calculation merely to recover its report. Discuss only the
observation, numerical quality, limitation and next test in the normal update;
retain commands, hashes and diagnostic logs in the evidence/audit detail.
Conclude once as the main agent. Use the normal durable checkpoint path only
if the actual evidence warrants a durable Entry, even when the calculation
failed. Reusability is a separate question for external `distilling-methods`;
do not copy its trigger, trial or human-decision rules here.

The parent `Agent` call is Action-policy checked. The child has a restricted
tool list and no Research/AITP mutation tools or further delegation. Its shell
and file tools still rely on task instructions and the existing tool-risk
policy; this is not inherited per-command Action enforcement or an OS-level
file/network sandbox. Never describe a prompt boundary as that stronger
guarantee. If stronger isolation is required, stop at the actual unavailable
boundary rather than claiming the profile provides it.
