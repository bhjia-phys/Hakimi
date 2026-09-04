# Theory-physics routing reference

Use this reference to admit sustained work, align it with the current topic,
and choose one bounded Research Action rather than attempting a whole project
in one turn.

| Research signal | Route | Evidence to request |
|---|---|---|
| Sustained theoretical-physics work needs cross-turn state or a milestone | `EnterAITPMode`, then `GetResearchStatus` | Current Line, Question, Focus, and optional Goal; if `probing`, wait for `ready` or `degraded` without busy polling |
| The physical question or candidate is not yet clear | Discuss uncertainty; begin bounded literature/derivation work if investigation is needed | Competing explanations, explicit conventions, useful benchmark; no fabricated hypothesis or mandatory Goal |
| A remembered result or method might apply | On-demand `using-aitp`, exact recorded-evidence inspection | Current Topic/workstream applicability, basis and limitations; no global full-content scan |
| A convention, prior result, or method is uncertain | Bounded `literature_review` action | Primary/authoritative source, exact supported claim, assumptions |
| The question is algebraic or conceptual | Bounded `derivation` action | Definitions, intermediate relation, dimensional and limiting checks |
| A prediction can distinguish hypotheses | Bounded `simulation` or `data_analysis` action | Input pin, observable, tolerance, baseline, comparison |
| A result depends on implementation behavior | Bounded `other` or `data_analysis` action | Reproduction command, test output, artifact reference, physical relevance |
| A remote calculation is still running | `ObserveResearchRun` against the current action | Action-bound observation, stage, scheduler state, next check |
| The researcher offers a formula, workaround, or interpretation | Attribute the suggestion and choose a bounded validation if it will be relied on | Source, derivation, or test that supports or contradicts the suggestion; no automatic promotion to fact |
| A verified result or failure has durable scientific value | Delegate to external `using-aitp` skill | Durable delta and its relation to the current checkpoint |
| A method candidate may transfer across questions or lines, with the external plugin installed, Research active, and `distilling-methods` visible | Load external `distilling-methods` on demand | Otherwise retain the candidate and evidence; do not claim distillation or publication |
| Knowledge belongs to an unrelated line | Consume only distilled reusable methods | The distilled method and its applicability, not full topic state |

`Goal` is optional and is the sole automatic-continuation owner. Research Plan
is milestone strategy under an aligned Goal, revised when evidence changes
the route. Plan mode reviews a local multi-step plan before a complex Action;
it does not require a Goal or parent Research Plan. A simple reversible Action
needs no formal plan. When a current parent plan exists, retain its explicit
bindings instead of bypassing it. A large question remains owned by the
Research Line/Question/AITP context. Never infer a line/workstream alias from
an identical slug.

## Recorded-knowledge inspection

Load the external `using-aitp` Skill for retrieval judgment. AITP Entry reads
use `aitp_show`; Note/Method-card reads use the exact workspace-relative
`.aitp/topic/notes/note-<id>.md` with `Read`. For generic marker discovery,
`Grep` accepts `pattern: "^> method-card:"`, `path: ".aitp/topic/notes/"`,
`output_mode: "files_with_matches"`; for observations use
`pattern: "^> method-observation:"`, `path: ".aitp/topic/entries/"`.
Both markers can also be discovered under `.aitp/topic/`. Inspect returned
records through the appropriate canonical read path and verify the ones relied
on. Marker presence or count does not establish reuse, validation, or a trial.

These narrow reads work without a live Action, including after checkpoint
commit and during a paused Goal/loop. The mode must be ready. They do not grant
arbitrary `Read`, `Grep`, `Bash`, web access, or canonical writes. This is
executor-enforced tool policy, not OS-level filesystem/network isolation.
Do not perform a marker scan just to satisfy every loop node; retrieve only
when the current uncertainty or the external Skill's real trigger warrants it.

## Example: from tentative idea to a useful test

A researcher asks whether a small-chain conserved quantity extends beyond a
restricted operator ansatz. No Goal is needed to discuss that question.
Inspect the existing Note and its Entry evidence: a null result in one ansatz
does not prove a full no-go. Begin a literature or derivation Action to clarify
the algebra, convention, and meaning of the benchmark. Conclude with the
narrowed alternatives and missing evidence.

Next, inspect a relevant existing numerical Method card and verify that its
assumptions fit. Choose a small-chain residual/leakage test, not a large
optimization run. If multi-step, review a local plan before beginning that
Action; use a Goal and revisable milestone plan only when continuing
automatically across the broader investigation is requested. Return measured
residuals, tolerance justification, and what the test can and cannot rule out.
This is an illustrative workflow, not an asserted result from a real run.

If a long calculation is already owned by the live Action, use supported
task waits. Reflect on existing evidence while waiting; do not start an
unrelated tool investigation without resolving foreground ownership. If two
attempts provide no new discriminating evidence, explicitly reconsider the
assumption, test, or scope instead of repeating them for the sake of progress.
This is research judgment, not a runtime counter or an automatic stop rule.

## Durable closeout and recovery

After `EnterAITPMode`, use `GetResearchStatus` for the authoritative snapshot.
If it is `probing`, wait for `ready` or `degraded` without repeated calls or busy
polling. Do not write AITP or bypass the adapter with a bare CLI command.
Transient progress stays in local Research state. A meaningful negative or
inconclusive result can be durable if it narrows the search or preserves a
reproducible limitation; failure is not synonymous with no delta. After the
first successful commit of a new checkpoint, Hakimi may make
one same-turn, best-effort handoff of only the touched Entry to the external
`distilling-methods` Skill; duplicate commits or an unavailable Skill are
non-blocking no-ops. This is not the still-planned native H6b coordinator: it
has no durable scheduler, retry, or exactly-once recovery and owns none of the
Skill's semantic gates. Do not promote an engineering observation into a
scientific conclusion without a completed analyzer or an explicit physical
interpretation.

Conclude once; do not duplicate it with RecordResearchProgress. Let the host
perform its existing boundary reconciliation. A historical warning needs
context, not an invented resolution. A genuine pending write needs completion
or safe recovery; an unresolved scientific decision still needs the researcher.
Neither `auto` nor `dreaming` overrides those boundaries.
