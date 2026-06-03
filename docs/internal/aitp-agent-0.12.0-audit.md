# AITP Agent 0.12.0 Audit

## Scope

This audit covers the file-backed DomainPack runtime slice.

Implemented:

- added `domain-pack` with `compileDomainPackManifest`;
- `DomainPackManifest` summarizes the active domain's profiles, workflows, physics capsules, bridge capsules, eval cases, action bindings, action ids, required tools, context tags, and registry diagnostics;
- `ResearchContextPack` now carries an optional `domainPack` manifest for new compilations while remaining compatible with older restored packs;
- `ResearchContextManager` passes the already-loaded `ResearchEvalCaseRegistry` into context compilation, so eval fixtures are part of the runtime context snapshot;
- context reminders and `ResearchAction` context rendering expose the DomainPack manifest;
- runtime tool exposure no longer treats `pack.domain === 'librpa'` as a code-tool switch;
- code-capable native tools now activate from file-backed workflow `requiredTools`, DomainPack action ids, or universal ResearchAction primitive plans.

## Runtime Behavior

The intended topic flow is now:

```text
Session loads .aitp/domain-profiles, .aitp/workflow-recipes, .aitp/physics-memory, .aitp/evals
-> WorkFrame selects a domain/topic
-> ResearchContextPack compiles bounded context plus DomainPackManifest
-> model-facing reminder and ResearchAction render the manifest
-> runtime tool exposure reads required tools and action ids, not domain nouns
-> FQHE/CS and LibRPA sessions keep capsules, evals, and tool overlays separate
```

This keeps AITP inside the native Kimi Code turn loop. It is not an outer orchestration layer: the manifest is produced during `ResearchContextPack` compilation, recorded in `research_context.context_compiled`, rendered to the model-facing research context, and used by runtime tool exposure.

## Domain Isolation

The slice keeps a conservative bridge distinction:

- ordinary FQHE/CS context packs do not import LibRPA formula, code-mapping, benchmark, or eval entries;
- ordinary LibRPA context packs do not import FQHE capsules or eval entries;
- explicit FQHE bridge capsules can still appear as FQHE-domain bridge metadata, without turning LibRPA code workflows into default FQHE obligations.

This means the file-backed domain system can support cross-domain comparison while preserving session-local and topic-local execution semantics.

## Compatibility Boundary

The old FQHE/CS and LibRPA vertical modules still exist as compatibility exports and early proof-of-shape tests. The runtime path repaired here is the ContextPack/tool-exposure path: it no longer depends on hard-coded LibRPA domain-name logic for code tool activation.

## Covered Cases

The focused tests prove:

- `compileDomainPackManifest` builds a domain inventory from file-backed registries;
- cross-domain workflow references from a domain profile are rejected with diagnostics;
- ContextPack compilation embeds a DomainPack manifest and includes eval case ids;
- a LibRPA domain name alone no longer exposes `Bash`, `Write`, or `Edit`;
- DomainPack action ids can still activate primitive plan tools when the file-backed pack asks for code work;
- real LibRPA `.aitp` fixtures expose code tools through workflow requirements and action bindings;
- real FQHE/CS `.aitp` fixtures remain theory-oriented and keep code tools closed;
- FQHE/CS and LibRPA manifests keep eval/capsule inventories isolated except for explicit bridge metadata.

## Verification

Focused DomainPack, ContextPack, tool-exposure, and vertical tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/domain-pack/compiler.test.ts packages/agent-core/test/research-context/compiler.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
```

Result:

- 5 test files passed.
- 18 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/domain-pack packages/agent-core/src/research-context/compiler.ts packages/agent-core/src/research-context/types.ts packages/agent-core/src/agent/research-context/index.ts packages/agent-core/src/agent/tool-exposure/index.ts packages/agent-core/src/agent/workframe/context-pack.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/domain-pack/compiler.test.ts packages/agent-core/test/research-context/compiler.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
```

Result: 0 warnings, 0 errors.

Diff check:

```powershell
git diff --check
```

Result: no whitespace errors. Git reported the usual Windows LF-to-CRLF working-copy warnings.

Environment note: pnpm commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

The next useful slice is to make domain-pack diagnostics visible through a small model-facing inspection action or admin command. That would let the model ask why a domain did or did not expose a workflow, eval, capsule, or primitive tool without expanding the default reminder.
