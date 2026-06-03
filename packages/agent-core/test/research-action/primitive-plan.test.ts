import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESEARCH_ACTIONS,
  ResearchPrimitivePlanRegistry,
  buildPrimitivePlanForAction,
  registerDefaultResearchPrimitivePlanTemplates,
  type ResearchActionDefinition,
} from '../../src/research-action';

describe('research primitive plan templates', () => {
  it('builds auditable primitive plans for every default research action', () => {
    const registry = defaultRegistry();

    for (const action of DEFAULT_RESEARCH_ACTIONS) {
      const plan = buildPrimitivePlanForAction(action, registry);
      expect(plan.actionId).toBe(action.id);
      expect(plan.recording.actionId).toBe(action.id);
      expect(plan.toolNames).toContain('ResearchAction');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.recording.evidenceRefs.length).toBeGreaterThan(0);
    }
  });

  it('plans literature search through native search/fetch tools plus ledger attribution', () => {
    const plan = planFor('source.search_literature');

    expect(plan.primitiveToolPolicy).toBe('read-only');
    expect(plan.toolNames).toEqual(
      expect.arrayContaining(['WebSearch', 'FetchURL', 'ResearchLedger', 'ResearchAction']),
    );
    expect(plan.steps.map((step) => step.kind)).toEqual(['search', 'fetch', 'record']);
    expect(plan.recording.primitiveToolCallIdsRequired).toBe(true);
    expect(plan.followupActionIds).toContain('source.capture_source_excerpt');
  });

  it('plans scoped code patches through write-gated native edit tools', () => {
    const plan = planFor('code.prepare_patch');
    const editStep = plan.steps.find((step) => step.id === 'edit-patch');

    expect(plan.primitiveToolPolicy).toBe('write-gated');
    expect(plan.toolNames).toEqual(expect.arrayContaining(['Read', 'Grep', 'Edit', 'Write']));
    expect(editStep).toMatchObject({
      kind: 'edit',
      approval: 'write',
    });
    expect(plan.followupActionIds).toEqual(
      expect.arrayContaining(['code.capture_git_diff_observation', 'benchmark.run_minimal_case']),
    );
  });

  it('plans external job submission without letting ResearchAction execute the job', () => {
    const plan = planFor('benchmark.submit_external_job');
    const submitStep = plan.steps.find((step) => step.id === 'submit-job');
    const normalizeStep = plan.steps.find((step) => step.id === 'normalize-submission');

    expect(plan.primitiveToolPolicy).toBe('benchmark-gated');
    expect(plan.toolNames).toEqual(
      expect.arrayContaining(['Bash', 'ResearchAction', 'ResearchLedger']),
    );
    expect(submitStep).toMatchObject({
      kind: 'submit',
      approval: 'external',
    });
    expect(normalizeStep).toMatchObject({
      kind: 'record',
      toolNames: ['ResearchAction'],
    });
    expect(plan.recording.evidenceRefs).toContain('job_id');
    expect(plan.recording.evidenceRefs).toContain('adapter.external.job-submission');
  });

  it('falls back from primitiveToolPolicy for custom actions', () => {
    const action: ResearchActionDefinition = {
      id: 'custom.inspect_code',
      category: 'code',
      exposure: 'direct',
      title: 'Inspect custom code',
      description: 'Read code for a custom extension action.',
      primitiveToolPolicy: 'read-only',
    };

    const plan = buildPrimitivePlanForAction(action);

    expect(plan.id).toBe('primitive-plan.custom.inspect_code');
    expect(plan.toolNames).toEqual(
      expect.arrayContaining(['Read', 'Grep', 'ResearchLedger', 'ResearchAction']),
    );
    expect(plan.recording.primitiveToolCallIdsRequired).toBe(true);
  });
});

function planFor(actionId: string) {
  const action = DEFAULT_RESEARCH_ACTIONS.find((item) => item.id === actionId);
  if (action === undefined) throw new Error(`Missing default action ${actionId}`);
  return buildPrimitivePlanForAction(action, defaultRegistry());
}

function defaultRegistry(): ResearchPrimitivePlanRegistry {
  const registry = new ResearchPrimitivePlanRegistry();
  registerDefaultResearchPrimitivePlanTemplates(registry);
  return registry;
}
