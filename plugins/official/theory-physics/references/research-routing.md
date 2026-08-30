# Theory-physics routing reference

Use this reference to admit sustained work, align it with the current topic,
and choose one bounded Research Action rather than attempting a whole project
in one turn.

| Research signal | Route | Evidence to request |
|---|---|---|
| Sustained theoretical-physics work needs cross-turn state or a milestone | `EnterAITPMode`, then `GetResearchStatus` | Current Line, Question, Focus, and stage Goal; if `probing`, wait for `ready` or `degraded` without busy polling |
| A convention, prior result, or method is uncertain | Bounded `literature_review` action | Primary/authoritative source, exact supported claim, assumptions |
| The question is algebraic or conceptual | Bounded `derivation` action | Definitions, intermediate relation, dimensional and limiting checks |
| A prediction can distinguish hypotheses | Bounded `simulation` or `data_analysis` action | Input pin, observable, tolerance, baseline, comparison |
| A result depends on implementation behavior | Bounded `other` or `data_analysis` action | Reproduction command, test output, artifact reference, physical relevance |
| A remote calculation is still running | `ObserveResearchRun` against the current action | Action-bound observation, stage, scheduler state, next check |
| A verified result or failure has durable scientific value | Delegate to external `using-aitp` skill | Durable delta and its relation to the current checkpoint |
| A method candidate may transfer across questions or lines, with the external plugin installed, Research active, and `distilling-methods` visible | Load external `distilling-methods` on demand | Otherwise retain the candidate and evidence; do not claim distillation or publication |
| Knowledge belongs to an unrelated line | Consume only distilled reusable methods | The distilled method and its applicability, not full topic state |

`Goal` is the current verifiable milestone and cross-turn continuation owner;
`Plan` is only a short-lived overlay inside a complex Research Action. A large
question remains owned by the Research Line/Question/AITP context. Do not
silently infer a line/workstream alias.

After `EnterAITPMode`, use `GetResearchStatus` for the authoritative snapshot.
If it is `probing`, wait for `ready` or `degraded` without repeated calls or busy
polling. Do not write AITP or bypass the adapter with a bare CLI command.
Ordinary reads, probes, and inconclusive turn progress stay in local Research
state. Native H6b method-distillation coordination remains planned/unavailable;
this route does not implement it. Do not promote an engineering observation into
a scientific conclusion without a completed analyzer or an explicit physical
interpretation.
