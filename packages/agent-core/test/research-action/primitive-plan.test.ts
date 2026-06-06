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

  it('plans AITP write-bridge records through explicit ResearchAction calls', () => {
    const exploration = planFor('aitp.record_exploratory_record');
    const artifact = planFor('aitp.attach_artifact');
    const codeState = planFor('aitp.capture_code_state_auto');
    const sourceAsset = planFor('aitp.register_source_asset');
    const referenceLocation = planFor('aitp.record_reference_location');
    const evidence = planFor('aitp.record_evidence');
    const toolRun = planFor('aitp.record_tool_run');
    const obligation = planFor('aitp.create_open_obligation');
    const validationContract = planFor('aitp.create_validation_contract');
    const validationResult = planFor('aitp.record_validation_result');
    const sourceReviewResult = planFor('aitp.record_source_reconstruction_review_result');

    expect(exploration.steps.map((step) => step.id)).toEqual([
      'execute-aitp-exploration-write',
    ]);
    expect(artifact.steps.map((step) => step.id)).toEqual([
      'execute-aitp-artifact-attach',
    ]);
    expect(codeState.steps.map((step) => step.id)).toEqual([
      'inspect-worktree-state',
      'execute-aitp-code-state-auto',
    ]);
    expect(sourceAsset.steps.map((step) => step.id)).toEqual([
      'execute-aitp-source-asset-write',
    ]);
    expect(referenceLocation.steps.map((step) => step.id)).toEqual([
      'execute-aitp-reference-location-write',
    ]);
    expect(evidence.steps.map((step) => step.id)).toEqual([
      'execute-aitp-evidence-write',
    ]);
    expect(toolRun.steps.map((step) => step.id)).toEqual([
      'execute-aitp-tool-run-write',
    ]);
    expect(obligation.steps.map((step) => step.id)).toEqual([
      'execute-aitp-obligation-write',
    ]);
    expect(validationContract.steps.map((step) => step.id)).toEqual([
      'execute-aitp-validation-contract-write',
    ]);
    expect(validationResult.steps.map((step) => step.id)).toEqual([
      'execute-aitp-validation-result-write',
    ]);
    expect(sourceReviewResult.steps.map((step) => step.id)).toEqual([
      'execute-aitp-source-reconstruction-review-result-write',
    ]);
    expect(exploration.recording.evidenceRefs).toContain('aitp:exploratory_record:<id>');
    expect(artifact.recording.evidenceRefs).toContain('aitp:artifact:<id>');
    expect(codeState.recording.evidenceRefs).toContain('aitp:code_state:<id>');
    expect(codeState.recording.primitiveToolCallIdsRequired).toBe(true);
    expect(sourceAsset.recording.evidenceRefs).toContain('aitp:source_asset:<id>');
    expect(referenceLocation.recording.evidenceRefs).toContain('aitp:reference_location:<id>');
    expect(evidence.recording.evidenceRefs).toContain('aitp:evidence:<id>');
    expect(toolRun.recording.evidenceRefs).toContain('aitp:tool_run:<id>');
    expect(obligation.recording.evidenceRefs).toContain('aitp:proof_obligation:<id>');
    expect(validationContract.recording.evidenceRefs).toContain('aitp:validation_contract:<id>');
    expect(validationResult.recording.evidenceRefs).toContain('aitp:validation_result:<id>');
    expect(sourceReviewResult.recording.evidenceRefs).toContain(
      'aitp:source_reconstruction_review_result:<id>',
    );
  });

  it('plans AITP route moments as non-write-bridge process records', () => {
    const choice = planFor('aitp.record_route_choice');
    const failed = planFor('aitp.record_failed_route_lesson');
    const switchCheckpoint = planFor('aitp.checkpoint_before_route_switch');

    expect(choice.steps.map((step) => step.id)).toEqual([
      'inspect-route-state',
      'record-route-state-action',
    ]);
    expect(failed.steps.map((step) => step.id)).toEqual([
      'inspect-route-state',
      'record-route-state-action',
    ]);
    expect(switchCheckpoint.steps.map((step) => step.id)).toEqual([
      'inspect-route-state',
      'record-route-state-action',
    ]);
    expect(choice.recording.evidenceRefs).toEqual(
      expect.arrayContaining(['route_id', 'ledger_event_id']),
    );
    expect(failed.recording.evidenceRefs).toContain('lesson');
    expect(switchCheckpoint.recording.evidenceRefs).toContain('from_route_id');
  });

  it('plans AITP trust-boundary checkpoints through AITP request plus human question', () => {
    const plan = planFor('aitp.request_human_checkpoint');

    expect(plan.toolNames).toEqual(
      expect.arrayContaining(['AskUserQuestion', 'ResearchAction', 'ResearchLedger']),
    );
    expect(plan.steps.map((step) => step.id)).toEqual([
      'execute-aitp-checkpoint-request',
      'ask-human-checkpoint',
      'record-checkpoint',
    ]);
    expect(plan.recording.evidenceRefs).toEqual(
      expect.arrayContaining([
        'aitp:human_checkpoint:<id>',
        'human_checkpoint_decision',
        'ledger_event_id',
      ]),
    );
    expect(plan.followupActionIds).toContain('aitp.record_research_state');
  });

  it('plans AITP trust preflight as a non-mutating bridge check', () => {
    const plan = planFor('aitp.run_trust_preflight');

    expect(plan.toolNames).toEqual(expect.arrayContaining(['ResearchAction', 'ResearchLedger']));
    expect(plan.steps.map((step) => step.id)).toEqual([
      'execute-aitp-trust-preflight',
      'keep-trust-state-external',
    ]);
    expect(plan.recording.evidenceRefs).toEqual(
      expect.arrayContaining([
        'aitp:trust_preflight:<token>',
        'preflight_allowed',
        'required_actions',
      ]),
    );
    expect(plan.followupActionIds).toContain('aitp.request_human_checkpoint');
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
