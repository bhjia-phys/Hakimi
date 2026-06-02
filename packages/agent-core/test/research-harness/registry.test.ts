import { describe, expect, it } from 'vitest';

import {
  ResearchEvalCaseRegistry,
  parseResearchEvalCaseText,
  runResearchEvalCase,
  type FileBackedResearchEvalCase,
  type ResearchEvalCaseRoot,
} from '../../src/research-harness';

describe('research eval case registry', () => {
  it('parses file-backed eval cases with bindings and final-answer checks', () => {
    const file = parseResearchEvalCaseText({
      path: '/tmp/fqhe-charge-flux.md',
      source: 'project',
      text: [
        '---',
        'id: eval.fqhe.charge-flux',
        'kind: research_eval_case',
        'title: FQHE charge-flux convention',
        'task: Explain inverse fractional charge and flux period safely.',
        'domain: topological-order/fqhe-cs',
        'source_refs:',
        '  - local:test',
        'capsule_refs:',
        '  - capsule.fqhe.flux-insertion',
        'action_sequence:',
        '  - physics.apply_direction_lens',
        'required_action_bindings:',
        '  - id: binding.fqhe.convention',
        '    action_id: validate.check_convention',
        '    domain_id: topological-order/fqhe-cs',
        '    lens_id: charge_flux_quantization',
        '    check_id: check.charge-flux-quantization.convention',
        '    priority: blocking',
        'validations:',
        '  - type: action_outcome',
        '    action_id: validate.check_convention',
        '    outcome: pass',
        '  - type: evidence_ref',
        '    pattern: ledger:event.fqhe.flux-convention',
        'required_checks:',
        '  - id: check.charge-flux-quantization.convention',
        '    kind: convention',
        '    severity: blocking',
        'expected_final_status: checked',
        'forbidden_claims:',
        '  - Berry curvature flux is identical to external electromagnetic flux',
        '---',
        'Eval body.',
      ].join('\n'),
    });

    expect(file.evalCase.actionSequence).toEqual([
      'physics.apply_direction_lens',
      expect.objectContaining({
        id: 'binding.fqhe.convention',
        actionId: 'validate.check_convention',
        checkId: 'check.charge-flux-quantization.convention',
      }),
    ]);
    expect(file.evalCase.validations.map((validation) => validation.type)).toEqual([
      'action_outcome',
      'evidence_ref',
      'final_status',
      'forbidden_claim',
      'required_check',
    ]);

    const result = runResearchEvalCase({
      evalCase: file.evalCase,
      finalStatus: 'checked',
      finalAnswerText: 'The AB flux period is larger for smaller effective charge.',
      actionRecords: [
        {
          actionId: 'physics.apply_direction_lens',
          callId: 'call-1',
          source: 'model',
          input: {},
          output: {},
          graphRefs: [],
          capsuleRefs: [],
          ledgerEventIds: [],
          evidenceRefs: [],
          outcome: 'pass',
          nextSuggestedActions: [],
        },
        {
          actionId: 'validate.check_convention',
          callId: 'call-2',
          source: 'model',
          input: {},
          output: {},
          graphRefs: [],
          capsuleRefs: [],
          ledgerEventIds: ['event.fqhe.flux-convention'],
          evidenceRefs: ['ledger:event.fqhe.flux-convention'],
          outcome: 'pass',
          nextSuggestedActions: [],
        },
      ],
      checkResults: [
        {
          checkId: 'check.charge-flux-quantization.convention',
          kind: 'convention',
          status: 'passed',
          evidenceRefs: ['ledger:event.fqhe.flux-convention'],
        },
      ],
    });

    expect(result.outcome).toBe('pass');
  });

  it('filters eval cases by domain and keeps the first duplicate id', () => {
    const registry = new ResearchEvalCaseRegistry();
    registry.register(evalFile('eval.fqhe', 'topological-order/fqhe-cs'));
    registry.register(evalFile('eval.librpa', 'librpa/head-wing'));
    registry.register(evalFile('eval.fqhe', 'duplicate-domain'));

    expect(registry.listDomains()).toEqual(['librpa/head-wing', 'topological-order/fqhe-cs']);
    expect(
      registry.listEvalCases({ domain: 'topological-order/fqhe-cs' }).map((item) => item.evalCase.id),
    ).toEqual(['eval.fqhe']);
    expect(registry.requireEvalCase('eval.fqhe').evalCase.domain).toBe(
      'topological-order/fqhe-cs',
    );
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-research-eval-case-id',
        evalCaseId: 'eval.fqhe',
      }),
    );
  });

  it('preserves root provenance and records scan warnings as diagnostics', async () => {
    const roots: readonly ResearchEvalCaseRoot[] = [
      { path: '/project/.aitp/evals', source: 'project' },
      { path: '/user/.aitp/evals', source: 'user' },
      { path: '/project/.aitp/evals', source: 'project' },
    ];
    const registry = new ResearchEvalCaseRegistry({
      discover: async (input) => {
        input.onWarning?.('bad eval', new Error('missing task'));
        return [evalFile('eval.fqhe', 'topological-order/fqhe-cs')];
      },
    });

    await registry.loadRoots(roots);

    expect(registry.getRoots()).toEqual([
      { path: '/project/.aitp/evals', source: 'project' },
      { path: '/user/.aitp/evals', source: 'user' },
    ]);
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'scan-warning',
        message: 'bad eval: missing task',
      }),
    );
  });
});

function evalFile(id: string, domain: string): FileBackedResearchEvalCase {
  return {
    path: `/tmp/${id}.md`,
    source: 'project',
    body: '',
    sourceRefs: ['local:test'],
    evalCase: {
      id,
      title: id,
      task: 'Run eval.',
      domain,
      capsuleRefs: [],
      actionSequence: [],
      validations: [],
    },
  };
}
