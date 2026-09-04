# Evidence reporting checklist

A useful Research progress report answers these questions in order:

1. What exact physical question or sub-question was tested?
2. What action was performed, with which assumptions and conventions?
3. What observation, derivation, test, or source supports the result?
4. Which checks passed, and which are still missing?
5. Does the evidence support, contradict, or leave unchanged the question?
6. What is the smallest next action that can reduce the uncertainty?

Keep scheduler state, file existence, software test status, and physical
observables as separate statements. Use cautious language for partial evidence:
"the job reached the analyzer stage" is not "the predicted symmetry is
confirmed".

## Separate four judgments

| Judgment | What to establish |
| --- | --- |
| Execution | Did the declared procedure actually run, with the stated inputs and scope? |
| Scientific meaning | Does the observation discriminate candidates, expose a limitation, or require a better test? |
| Durability | Will the next researcher need this result, failure, verified guidance, or reproducible boundary? |
| Reusability | Is there a genuine method candidate for the external `distilling-methods` Skill to assess? |

A successful process can produce no useful result. A failed calculation can
produce durable evidence. A durable Entry need not justify a Method card.
Two mentions, two markers, or two checks of the same execution are not
independent validation. A human suggestion should retain its attribution and
the actual validation result, including a contradiction or an untested limit.

Keep the normal update compact: current question, what changed, key evidence
and limitation, one next step. Put detailed provenance and tool output in the
evidence packet/audit view. The main agent must review those checks, but need
not repeat hashes in every message or manually rerun unchanged checks.

At a meaningful milestone, consider a stage Note that connects the question,
derivation, numerical evidence, negative results, limitations, and next route.
Paper materials should draw on those records and separate established claims
from interpretation. Use only the exposed AITP Note workflow; writing a Note
is not publishing a paper or promoting a Method card. If that workflow is not
available for the current state, preserve the candidate and report the exact
gap rather than editing canonical files or pretending it was saved.

## Stage Notes and interrupted review

Use the existing post-commit review only while its captured ownership remains
valid. Otherwise, when a stage synthesis or interrupted review is still useful,
use a bounded Note Action; do not manufacture a new scientific result or repeat
a checkpoint commit merely to unlock writing.

Read the selected canonical Entries with `aitp_show` and applicable Notes with
the exact Note `Read` path. Before beginning the Action, keep the current
Question's `evidenceRefs` and `falsifierRefs` accurate: the Note route verifies
those Entry IDs, including counterevidence, in the explicitly bound workstream.
Do not discard inconvenient evidence to make a write pass. If the intended
basis is stale or from a different scope, reassess the synthesis first.

Begin one Question-bound Action (`kind: other`) describing the synthesis and
its limits, granting `tool:aitp_note_prepare` and `tool:aitp_note_save` in
`allowed_tool_kinds`, plus only any additional work capabilities it actually
needs. Begin must succeed in an earlier tool batch. Use `aitp_note_prepare`
with the exact current workstream, fill only its returned local draft under
the external `using-aitp` guidance, then use `aitp_note_save`. The host rereads
only the selected Entries before prepare and save; it does not assess whether
their physics or your synthesis is correct. Note content and pins remain the
external Skill's responsibility. A Method card additionally requires the
external `distilling-methods` trigger and decisions; Note permission never
supplies them.

After undo or cold restore, inspect state and any reported saved artifact;
never blindly repeat a save. A fresh, still-valid Action can prepare a new
draft after verifying its source Entries. The old draft's permission does not
return. Conclude once with what was actually saved, its limitations and next
step; distinguish organizing already-recorded facts from a genuinely new
finding requiring the normal durable Entry path. Do not claim that saving a
Note completed review, resolved a failure, or published anything.
