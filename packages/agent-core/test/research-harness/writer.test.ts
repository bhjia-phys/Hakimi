import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  discoverResearchEvalCases,
  harnessCandidateFromActionRecord,
  ResearchEvalCaseWriteError,
  writeHarnessCandidateEvalCase,
  writeResearchEvalCase,
  type ResearchActionRecord,
} from '../../src';

describe('research eval case writer', () => {
  it('writes failed action traces as file-backed eval cases', async () => {
    const root = await makeTempRoot();
    const candidate = harnessCandidateFromActionRecord(actionRecord('fail'))!;

    const result = await writeHarnessCandidateEvalCase({
      root: { path: root, source: 'project' },
      candidate,
      task: 'Replay the LibRPA formula-code mapping failure.',
      domain: 'librpa/head-wing',
      actionSequence: ['code.inspect_call_sites', candidate.sourceActionId],
      additionalValidations: [
        {
          type: 'final_status',
          status: 'blocked',
        },
      ],
    });

    expect(result.path.replaceAll('\\', '/')).toBe(
      `${root.replaceAll('\\', '/')}/librpa-head-wing/harness.eval.code.map_formula_to_code.call-1.md`,
    );
    expect(result.evalFile.evalCase).toMatchObject({
      id: 'harness.eval.code.map_formula_to_code.call-1',
      domain: 'librpa/head-wing',
      actionSequence: ['code.inspect_call_sites', 'code.map_formula_to_code'],
    });
    expect(result.evalFile.evalCase.validations.map((validation) => validation.type)).toEqual([
      'action_outcome',
      'evidence_ref',
      'final_status',
    ]);

    const written = await readFile(result.path, 'utf8');
    expect(written).toContain('kind: research_eval_case');
    expect(written).toContain('action_id: code.map_formula_to_code');

    const discovered = await discoverResearchEvalCases({
      roots: [{ path: root, source: 'project' }],
    });
    expect(discovered.map((item) => item.evalCase.id)).toEqual([
      'harness.eval.code.map_formula_to_code.call-1',
    ]);
  });

  it('uses action refs as source refs when the candidate has no evidence refs', async () => {
    const root = await makeTempRoot();
    const candidate = harnessCandidateFromActionRecord({
      ...actionRecord('inconclusive'),
      evidenceRefs: [],
    })!;

    const result = await writeHarnessCandidateEvalCase({
      root: { path: root, source: 'project' },
      candidate,
      task: 'Replay an inconclusive mapping trace.',
      domain: 'librpa/head-wing',
    });

    expect(result.evalFile.sourceRefs).toEqual([
      'action:code.map_formula_to_code:call-1',
    ]);
  });

  it('can namespace harness eval writes by session to avoid cross-session collisions', async () => {
    const root = await makeTempRoot();
    const candidate = harnessCandidateFromActionRecord(actionRecord('fail'))!;

    const first = await writeHarnessCandidateEvalCase({
      root: { path: root, source: 'project' },
      candidate,
      sessionId: 'session-alpha',
      task: 'Replay the first session failure.',
      domain: 'librpa/head-wing',
    });
    const second = await writeHarnessCandidateEvalCase({
      root: { path: root, source: 'project' },
      candidate,
      sessionId: 'session-beta',
      task: 'Replay the second session failure.',
      domain: 'librpa/head-wing',
    });

    expect(first.evalFile.evalCase.id).toBe(
      'harness.eval.code.map_formula_to_code.call-1.session.session-alpha',
    );
    expect(second.evalFile.evalCase.id).toBe(
      'harness.eval.code.map_formula_to_code.call-1.session.session-beta',
    );
    expect(first.path).not.toBe(second.path);
    expect(first.evalFile.sourceRefs).toContain('session:session-alpha');
    expect(second.evalFile.sourceRefs).toContain('session:session-beta');

    const discovered = await discoverResearchEvalCases({
      roots: [{ path: root, source: 'project' }],
    });
    expect(discovered.map((item) => item.evalCase.id).toSorted()).toEqual([
      'harness.eval.code.map_formula_to_code.call-1.session.session-alpha',
      'harness.eval.code.map_formula_to_code.call-1.session.session-beta',
    ]);
  });

  it('rejects missing source refs and duplicate files unless overwrite is requested', async () => {
    const root = await makeTempRoot();
    const evalCase = {
      id: 'eval.no-source',
      title: 'No source',
      task: 'Missing source refs.',
      capsuleRefs: [],
      actionSequence: [],
      validations: [],
    };

    await expect(
      writeResearchEvalCase({
        root: { path: root, source: 'project' },
        evalCase,
        sourceRefs: [],
        body: 'No source refs.',
      }),
    ).rejects.toThrow(ResearchEvalCaseWriteError);

    await writeResearchEvalCase({
      root: { path: root, source: 'project' },
      evalCase: { ...evalCase, id: 'eval.duplicate' },
      sourceRefs: ['local:test'],
      body: 'First.',
    });
    await expect(
      writeResearchEvalCase({
        root: { path: root, source: 'project' },
        evalCase: { ...evalCase, id: 'eval.duplicate' },
        sourceRefs: ['local:test'],
        body: 'Second.',
      }),
    ).rejects.toThrow(ResearchEvalCaseWriteError);
  });
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aitp-eval-writer-'));
  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

function actionRecord(outcome: ResearchActionRecord['outcome']): ResearchActionRecord {
  return {
    actionId: 'code.map_formula_to_code',
    callId: 'call-1',
    source: 'model',
    input: {},
    output: {},
    graphRefs: [
      {
        kind: 'Formula',
        id: 'graph.librpa.formula.head-wing',
      },
    ],
    capsuleRefs: ['formula.librpa.head-wing'],
    ledgerEventIds: ['event.librpa.mapping-failure'],
    evidenceRefs: ['ledger:event.librpa.mapping-failure'],
    outcome,
    nextSuggestedActions: ['benchmark.run_minimal_case'],
  };
}
