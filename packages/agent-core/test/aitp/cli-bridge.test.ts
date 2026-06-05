import { describe, expect, it } from 'vitest';

import {
  AitpCliBridgeError,
  buildAitpExploratoryRecordArgs,
  buildAitpProcessGraphSliceArgs,
  createAitpCliBridge,
  createAitpCliProcessGraphSliceProvider,
  resolveAitpScopeFromWorkFrame,
  type AitpCommandRunner,
} from '../../src/aitp';

describe('AITP CLI bridge', () => {
  it('builds narrow graph-slice commands and compiles JSON output', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeSlicePayload()),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      command: 'aitp-v5',
      runner,
    });

    const compiled = await bridge.readProcessGraphSlice({
      sessionId: 'session-qg',
      claimId: 'claim-mipt',
      limit: 12,
      prompt: 'We need to backtrace the source dependency and brainstorm relation paths.',
    });

    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'graph',
          'slice',
          'session-qg',
          '--limit',
          '12',
          '--claim',
          'claim-mipt',
        ],
      },
    ]);
    expect(compiled.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(compiled.actionRecommendations.map((item) => item.actionId)).toEqual(
      expect.arrayContaining([
        'physics.brainstorm_relation_path',
        'trace.follow_source_dependency',
      ]),
    );
  });

  it('records exploratory records through AITP without inventing a Hakimi schema', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'exploratory_record',
            record_id: 'exploratory-qg-path',
            topic_id: 'qg',
            exploration_type: 'relation_path_brainstorm',
            orientation_only: true,
            can_update_claim_trust: false,
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.recordExploratoryRecord({
      topicId: 'qg',
      claimId: 'claim-mipt',
      sessionId: 'session-qg',
      explorationType: 'relation_path_brainstorm',
      title: 'Trace algebra to observer relation',
      focalQuestion: 'Can the algebraic split and observer role share a definition path?',
      summary: 'Keep candidate relation paths local and unresolved.',
      candidatePaths: ['von Neumann algebra -> split property -> observer factorization'],
      unresolvedPoints: ['which theorem carries the split assumption'],
      nextActions: ['open source dependency backtrace'],
      metadata: { surface: 'hakimi' },
    });

    expect(result).toMatchObject({
      kind: 'exploratory_record',
      recordId: 'exploratory-qg-path',
      orientationOnly: true,
      canUpdateClaimTrust: false,
    });
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining([
        'exploration',
        'record',
        '--type',
        'relation_path_brainstorm',
        '--candidate-path',
        'von Neumann algebra -> split property -> observer factorization',
        '--metadata-json',
        '{"surface":"hakimi"}',
      ]),
    );
  });

  it('rejects unsupported exploratory record types before running AITP', () => {
    expect(() =>
      buildAitpExploratoryRecordArgs({
        basePath: 'F:/project',
        topicId: 'qg',
        // @ts-expect-error verifies runtime validation for external input.
        explorationType: 'private_hakimi_schema',
        title: 'Bad schema',
        focalQuestion: 'Can Hakimi invent a record type?',
        summary: 'No.',
      }),
    ).toThrow(AitpCliBridgeError);
  });

  it('keeps graph slice args deterministic', () => {
    expect(
      buildAitpProcessGraphSliceArgs({
        basePath: 'F:/project',
        sessionId: 's1',
      }),
    ).toEqual(['--base', 'F:/project', 'graph', 'slice', 's1', '--limit', '80']);
  });

  it('creates a WorkFrame-scoped process graph provider without guessing scope', async () => {
    const runner: AitpCommandRunner = {
      async run() {
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeSlicePayload()),
          stderr: '',
        };
      },
    };
    const provider = createAitpCliProcessGraphSliceProvider({
      basePath: 'F:/project',
      runner,
      limit: 8,
    });

    await expect(
      provider.getProcessGraphSlice({
        workFrame: {
          id: 'frame.no-scope',
          domain: 'theoretical-physics/general',
          topic: 'qg',
          goal: 'No AITP scope yet.',
          activeObjectIds: [],
          assumptionIds: [],
          conventionIds: [],
          sourceRefs: [],
          openObligationIds: [],
          trustState: 'exploratory',
        },
        prompt: [],
      }),
    ).resolves.toBeNull();

    const compiled = await provider.getProcessGraphSlice({
      workFrame: {
        id: 'frame.qg',
        domain: 'theoretical-physics/general',
        topic: 'qg',
        goal: 'Trace QG/MIPT relation.',
        activeObjectIds: [],
        assumptionIds: [],
        conventionIds: [],
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
        openObligationIds: [],
        trustState: 'exploratory',
      },
      prompt: [{ type: 'text', text: 'Brainstorm relation path.' }],
    });

    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
  });

  it('resolves explicit AITP scope refs from WorkFrame source refs', () => {
    expect(
      resolveAitpScopeFromWorkFrame({
        id: 'frame.qg',
        domain: 'theoretical-physics/general',
        topic: 'qg',
        goal: 'Trace QG/MIPT relation.',
        activeObjectIds: [],
        assumptionIds: [],
        conventionIds: [],
        sourceRefs: ['paper:foo', 'aitp:session:session-qg', 'aitp:claim:claim-mipt'],
        openObligationIds: [],
        trustState: 'exploratory',
      }),
    ).toEqual({ sessionId: 'session-qg', claimId: 'claim-mipt' });
  });
});

function fakeSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-mipt',
        type: 'claim',
        record: {
          statement: 'MIPT observer role may be represented by an algebraic split.',
          status: 'hypothesis',
        },
      },
    ],
    edges: [],
    open_obligations: [],
    source_backtrace: [
      {
        claim_id: 'claim-mipt',
        missing_components: ['reference_location'],
        complete: false,
      },
    ],
    relation_neighborhood: [
      {
        relation_id: 'rel-algebra-observer',
        status: 'hypothesis',
        relation_type: 'connects',
        subject_id: 'object-algebra',
        object_id: 'object-observer',
      },
    ],
    exploratory_records: [],
    trust_boundary_reasons: ['this API cannot update claim trust'],
    recommended_moments: [
      {
        moment: 'brainstorm_relation_path',
        target_type: 'object_relation',
        target_id: 'rel-algebra-observer',
        reason: 'relation is still only a hypothesis',
      },
    ],
  };
}
