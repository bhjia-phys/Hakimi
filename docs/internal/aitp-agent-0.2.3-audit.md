# AITP Agent 0.2.3 Audit

## Scope

This audit covers the first file-backed `DomainProfile` and `WorkflowRecipe` registry slice.

Implemented areas:

- `packages/agent-core/src/domain-profile/*`
  - typed `DomainProfile` records;
  - frontmatter parser;
  - recursive scanner for `.aitp/domain-profiles`;
  - registry with duplicate diagnostics and domain filtering.
- `packages/agent-core/src/workflow-recipe/*`
  - typed `WorkflowRecipe` records;
  - frontmatter parser;
  - recursive scanner for `.aitp/workflow-recipes`;
  - registry with duplicate diagnostics and domain filtering;
  - structured `ResearchActionBinding` parsing.
- feature flags:
  - `KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE`;
  - `KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE`.
- `Session` loading:
  - project roots: `.aitp/domain-profiles`, `.aitp/workflow-recipes`;
  - user roots: `~/.aitp/domain-profiles`, `~/.aitp/workflow-recipes`;
  - explicit and extra dirs through session options.
- `Agent` exposure:
  - `agent.domainProfiles`;
  - `agent.workflowRecipes`.

## Runtime Behavior

When flags are off, existing Kimi behavior is unchanged:

```text
agent.domainProfiles === null
agent.workflowRecipes === null
```

When flags are on, session startup loads file-backed domain profiles and workflow recipes before creating agents:

```text
.aitp/domain-profiles/**/*.md
~/.aitp/domain-profiles/**/*.md
.aitp/workflow-recipes/**/*.md
~/.aitp/workflow-recipes/**/*.md
```

This gives later WorkFrame/ContextPack orchestration a file-backed layer for domain-specific lenses, conventions, workflow recipes, and action bindings without polluting universal research actions.

## Example Workflow Binding

```yaml
id: workflow.librpa.formula-code-mapping
kind: workflow_recipe
title: Formula-code mapping
domain: librpa/head-wing
status: raw
source_refs:
  - local:test
action_bindings:
  - action_id: code.inspect_call_sites
    domain_id: librpa/head-wing
    workflow_id: workflow.librpa.formula-code-mapping
    priority: blocking
  - action_id: benchmark.run_minimal_case
    adapter_id: adapter.librpa.head-wing-smoke
    check_id: check.librpa-head-wing.benchmark
```

## Boundaries

This slice intentionally does not yet implement:

- a model-visible `DomainProfile` tool;
- a model-visible `WorkflowRecipe` tool;
- automatic ContextPack selection from profiles and recipes;
- automatic bridge enforcement;
- promotion of profiles or recipes into trusted physics memory.

Those belong to WorkFrame orchestration and memory compiler slices.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/domain-profile packages/agent-core/test/workflow-recipe packages/agent-core/test/session/domain-workflow.test.ts packages/agent-core/test/flags/resolver.test.ts
```

Result:

- 4 test files passed.
- 20 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/domain-profile packages/agent-core/src/workflow-recipe packages/agent-core/src/session/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/flags/registry.ts packages/agent-core/src/index.ts packages/agent-core/test/domain-profile packages/agent-core/test/workflow-recipe packages/agent-core/test/session/domain-workflow.test.ts
```

Result:

- 0 warnings.
- 0 errors.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in earlier audits.
