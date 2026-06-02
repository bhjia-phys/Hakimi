import { describe, expect, it } from 'vitest';

import {
  WorkflowRecipeRegistry,
  parseWorkflowRecipeText,
  type WorkflowRecipe,
  type WorkflowRecipeRoot,
} from '../../src/workflow-recipe';

describe('workflow recipe registry', () => {
  it('parses action bindings from workflow recipe frontmatter', () => {
    const recipe = parseWorkflowRecipeText({
      path: '/tmp/librpa.md',
      source: 'project',
      text: [
        '---',
        'id: workflow.librpa.formula-code-mapping',
        'kind: workflow_recipe',
        'title: Formula-code mapping',
        'domain: librpa/head-wing',
        'status: raw',
        'source_refs:',
        '  - local:test',
        'action_bindings:',
        '  - id: binding.inspect',
        '    action_id: code.inspect_call_sites',
        '    domain_id: librpa/head-wing',
        '    workflow_id: workflow.librpa.formula-code-mapping',
        '    priority: blocking',
        '  - action_id: benchmark.run_minimal_case',
        '    adapter_id: adapter.librpa.head-wing-smoke',
        '    check_id: check.librpa-head-wing.benchmark',
        'required_tools:',
        '  - git',
        '---',
        'Workflow body.',
      ].join('\n'),
    });

    expect(recipe.metadata.actionBindings).toEqual([
      expect.objectContaining({
        id: 'binding.inspect',
        actionId: 'code.inspect_call_sites',
        domainId: 'librpa/head-wing',
        workflowId: 'workflow.librpa.formula-code-mapping',
        priority: 'blocking',
      }),
      expect.objectContaining({
        id: 'benchmark.run_minimal_case#2',
        actionId: 'benchmark.run_minimal_case',
        adapterId: 'adapter.librpa.head-wing-smoke',
        checkId: 'check.librpa-head-wing.benchmark',
      }),
    ]);
    expect(recipe.metadata.requiredTools).toEqual(['git']);
    expect(recipe.body).toBe('Workflow body.');
  });

  it('lists domains and filters recipes by domain', () => {
    const registry = new WorkflowRecipeRegistry();
    registry.register(recipe('workflow.fqhe', 'topological-order/fqhe-cs'));
    registry.register(recipe('workflow.librpa', 'librpa/head-wing'));

    expect(registry.listDomains()).toEqual(['librpa/head-wing', 'topological-order/fqhe-cs']);
    expect(registry.listRecipes({ domain: 'librpa/head-wing' }).map((item) => item.metadata.id))
      .toEqual(['workflow.librpa']);
  });

  it('keeps the first recipe for duplicate ids unless replace is requested', () => {
    const registry = new WorkflowRecipeRegistry();
    registry.register(recipe('same', 'first'));
    registry.register(recipe('same', 'second'));
    expect(registry.requireRecipe('same').metadata.domain).toBe('first');
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-workflow-recipe-id',
        recipeId: 'same',
      }),
    );

    registry.register(recipe('same', 'second'), { replace: true });
    expect(registry.requireRecipe('same').metadata.domain).toBe('second');
  });

  it('preserves root provenance and records scan warnings as registry diagnostics', async () => {
    const roots: readonly WorkflowRecipeRoot[] = [
      { path: '/project/.aitp/workflow-recipes', source: 'project' },
      { path: '/user/.aitp/workflow-recipes', source: 'user' },
      { path: '/project/.aitp/workflow-recipes', source: 'project' },
    ];
    const registry = new WorkflowRecipeRegistry({
      discover: async (input) => {
        input.onWarning?.('bad recipe', new Error('missing action bindings'));
        return [recipe('workflow.fqhe', 'topological-order/fqhe-cs')];
      },
    });

    await registry.loadRoots(roots);

    expect(registry.getRoots()).toEqual([
      { path: '/project/.aitp/workflow-recipes', source: 'project' },
      { path: '/user/.aitp/workflow-recipes', source: 'user' },
    ]);
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'scan-warning',
        message: 'bad recipe: missing action bindings',
      }),
    );
  });
});

function recipe(id: string, domain: string): WorkflowRecipe {
  return {
    path: `/tmp/${id}.md`,
    source: 'project',
    body: '',
    metadata: {
      id,
      kind: 'workflow_recipe',
      title: id,
      domain,
      status: 'raw',
      sourceRefs: ['local:test'],
      actionBindings: [],
      requiredCapsules: [],
      requiredTools: [],
      failureModes: [],
    },
  };
}
