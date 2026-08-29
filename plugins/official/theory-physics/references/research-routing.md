# Theory-physics routing reference

Use this table to choose a bounded Research action rather than attempting a
whole project in one turn.

| Signal | First action | Evidence to request |
|---|---|---|
| A convention, prior result, or method is uncertain | `literature_review` | Primary/authoritative source, exact supported claim, assumptions |
| The question is algebraic or conceptual | `derivation` | Definitions, intermediate relation, dimensional and limiting checks |
| A prediction can distinguish hypotheses | `simulation` or `data_analysis` | Input pin, observable, tolerance, baseline, comparison |
| A result depends on implementation behavior | `other` or `data_analysis` | Reproduction command, test output, artifact reference, physical relevance |
| A remote calculation is still running | `simulation` | Action-bound run observation, stage, scheduler state, next check |

Do not promote an engineering observation into a scientific conclusion without a
completed analyzer or an explicit physical interpretation.
