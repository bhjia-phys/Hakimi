# AITP Agent 0.12.4 Curated Theory RAG Audit

## Scope

This audit covers the first lecture-guided object-discovery slice for
Hakimi+AITP.

Implemented:

- AITP's default curated RAG fixture now includes open theoretical-physics
  lecture/review orientation chunks.
- Hakimi's theoretical-physics defaults include the
  `lecture_guided_object_discovery` lens and process capsule.
- Automatic curated RAG queries now add physics hints for object discovery,
  open lecture notes, AdS/CFT, cutoff walls, massive matter, boundary sinks,
  survival probability, hitting time, energy flux, and spectral diagnostics as
  auxiliary.
- The ResearchContext compiler action-binding budget was raised from 40 to 48
  so the extra default bindings do not evict existing general research actions.

## Runtime Behavior

For a new theoretical-physics WorkFrame, Hakimi should now do this:

```text
user asks a conceptual/new-topic theory question
-> WorkFrame opens or reuses theoretical-physics/general
-> ContextPack compiles built-in theory workflow/capsules/lenses
-> curated RAG moment detector adds physics_hints to the AITP query
-> AITP searchCuratedRagCorpus returns heuristic_context only
-> ContextPack renders chunk ids, summaries, hashes, and promotion boundary
-> model uses the chunks to choose objects, regimes, observables, and checks
```

The RAG result is not allowed to become evidence, validation, final-gate
satisfaction, or claim-trust input. If a retrieved chunk becomes claim-relevant,
the next step is a read-only promotion draft followed by explicit AITP
source/evidence/validation writes.

## Why This Matters

The failure mode seen in the AdS random-boundary regression was not only missing
tool calls. It was choosing the wrong physical object: normal modes became the
center even though the research question was about massive matter moving near a
randomly absorbing cutoff wall.

This slice trains the runtime to ask a better first question:

- What is moving?
- What layer describes it: particle trajectory, field wavepacket, kinetic
  ensemble, or open-system effective sink?
- What is the wall or boundary condition?
- Which observables are primary: survival, hitting time, current, energy flux,
  absorption rate?
- Which spectral objects are only auxiliary diagnostics?

## Boundary With AITP

AITP remains the typed truth source. Hakimi owns the runtime projection:

- WorkFrame state;
- ContextPack injection;
- ResearchAction suggestions and call traces;
- tool exposure and harness audit.

AITP owns:

- curated RAG catalog and chunk identity;
- promotion draft contract;
- source assets and reference locations;
- evidence, validation, trust preflight, and final trust state.

Hakimi may pass the current cwd as AITP `base` and consume `.aitp/curated_rag`
when available. It should not mirror the corpus into a parallel Hakimi truth
store.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false exec vitest run `
  packages/agent-core/test/aitp/process-graph-slice.test.ts `
  packages/agent-core/test/session/domain-workflow.test.ts `
  packages/agent-core/test/physics-direction/lens.test.ts `
  packages/agent-core/test/agent/research-context.test.ts
```

Result:

- 4 test files passed.
- 38 tests passed.

Context compiler focused test:

```powershell
corepack pnpm --config.engine-strict=false exec vitest run `
  packages/agent-core/test/research-context/compiler.test.ts
```

Result:

- 1 test file passed.
- 12 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core run typecheck
```

Result: passed with the known local Node engine warning (`v24.14.0` vs package
request `>=24.15.0`).

## Real-Session Eval Target

The AdS regression should remain blind with respect to the scoring rubric. The
prompt may name the problem, but the model should not see the hidden rubric.
The expected harness evidence is:

- WorkFrame opened;
- ContextPack compiled;
- curated RAG search actually called;
- ContextPack includes `heuristic_context`, `orientation_only`, and
  `lecture_guided_object_discovery`;
- output centers massive matter, cutoff wall, survival, hitting time, and energy
  flux;
- normal modes are auxiliary only;
- RAG chunks are not treated as evidence or trust support.

## Follow-Ups

- Add a file-backed eval case for lecture-guided object discovery on a fresh
  non-AdS topic so the feature is not tuned only to the AdS regression.
- Add a harness assertion for "rubric hidden from prompt" and "payload only,
  no answer leakage."
- Add optional hybrid index metadata once AITP's source-shelf manifest is
  versioned.

