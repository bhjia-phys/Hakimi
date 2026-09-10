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
| The researcher asks how an existing calculation is progressing | Bounded query within its matching live Action, or a new bounded query Action when none is live | Current scheduler state, actual completed stage, first meaningful failure or missing result, next check |
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

## Existing-job progress and diagnosis

Use the saved job identity and original Line/Question scope. A short status
check needs neither a new Research Plan nor a build/provenance campaign. If no
matching Action is live, begin an ordinary bounded query and wait for success
before using work tools. Supply `observed_run_action_id` only when the snapshot
actually retains that same structured Run; an old submission Action or receipt
does not establish one. `ObserveResearchRun` records an observation, not a query.

For an existing failure, first follow the current Entry's named evidence to its
submission receipt or equivalent run record. Use its actual run, dataset and
source locations; they need not share a directory. Keep the execution host,
local workspace, source checkout and remote run roots distinct: a shell `cd`
does not change another tool's root, and local scheduler commands do not query
a remote cluster. Use absolute paths when crossing these scientific-file roots;
AITP-managed drafts instead keep the exact workspace-relative path returned by
prepare for Read/Edit/save. If a locator
is stale or missing, inspect the nearest known parent before widening discovery;
do not reconstruct unrelated Lines or the workspace's whole retry history.
Once the failing symbol and matching source are known, inspect that path and a
relevant check before widening the investigation.

For a localized code change, keep the inspected function and its tests as the
working context and apply a coherent patch. A successful small edit does not
by itself require rereading the whole file. Re-read the affected slice when
the edit result, a test failure or concurrent changes make that necessary;
review the final diff and run the focused test before drawing conclusions.

Resolve result paths from the actual input, launch script or existing receipt,
including a configured output subdirectory. A missing file at a guessed path is
not evidence that the calculation produced no result. Match the material, mesh,
frequency count and iteration before reusing a run; the newest directory need
not be the requested calculation. Preserve useful locators in the existing
run record or evidence, not a new registry. Leave old runs in place.

Read the scheduler result and the smallest useful log slice: the driver or
identified failing rank, the first causal error with surrounding lines, and
the iteration/observable summary. Start narrowly and expand if the cause is
still unclear. Avoid dumping every rank's identical error or a whole directory
listing. Keep full raw logs available for audit and preserve distinct errors;
do not remove contradictory evidence just to shorten a report. If a new result
needs durable recording, preserve its relevant raw observation in the workspace
within the live Action's authorized scope before concluding, following AITP's
evidence rules. An old submission receipt does not substantiate a new outcome;
if the new evidence cannot be preserved, state that limitation explicitly.

Report what actually ran, the first failing check with units and comparison,
what remains untested, and one next discriminating check. A small residual
over a limit is not permission to relax it or proof of rounding error. If the
available evidence cannot distinguish candidate causes, identify the specific
missing observable and close with that limitation; more historical searching
is useful only if it can supply that observable. This is a diagnostic strategy,
not a fixed tool-count limit. Reuse unchanged evidence; persist
only a real new result/failure, not every unchanged queue read. Querying grants
no authority to resubmit, cancel, rebuild or change inputs.

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
`distilling-methods` Skill. First assess that already-read Entry against the
Skill's eligibility and triggers; a handoff is not a request to harvest the
Topic. When that evidence supplies no eligible candidate, stop with a no-op
before additional enter/check or marker scans. Do not start another Action
solely to force such a review. Candidate harvesting, when actually warranted,
still follows the external Skill's checks in full. Duplicate commits or an
unavailable Skill are non-blocking no-ops. This is not the still-planned native H6b coordinator: it
has no durable scheduler, retry, or exactly-once recovery and owns none of the
Skill's semantic gates. Do not promote an engineering observation into a
scientific conclusion without a completed analyzer or an explicit physical
interpretation.

Conclude once; do not duplicate it with RecordResearchProgress. Let the host
perform its existing boundary reconciliation. A historical warning needs
context, not an invented resolution. A genuine pending write needs completion
or safe recovery; an unresolved scientific decision still needs the researcher.
Neither `auto` nor `dreaming` overrides those boundaries.
