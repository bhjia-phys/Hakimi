import { describe, expect, it } from 'vitest';

import {
  compileResearchContextPack,
  createAitpCliBridge,
  createWorkFrame,
  type AitpCommandRunner,
  type ResearchActionBinding,
} from '../../src';

describe('AITP native bridge smoke', () => {
  it('keeps the slice -> context binding -> write bridge -> AITP CLI loop executable', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
        if (args.includes('graph') && args.includes('slice')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(qgMiptSlicePayload()),
            stderr: '',
          };
        }
        if (args.includes('research-state') && args.includes('create-proof-obligation')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              kind: 'proof_obligation',
              obligation_id: 'proof-obligation-algebra-source-chain',
              topic_id: 'qg-algebra-mipt',
              claim_id: 'claim-mipt-observer-algebra',
              status: 'open',
              can_update_claim_trust: false,
            }),
            stderr: '',
          };
        }
        if (args.includes('checkpoint') && args.includes('request')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              kind: 'human_checkpoint',
              checkpoint_id: 'checkpoint-qg-trust-boundary',
              topic_id: 'qg-algebra-mipt',
              claim_id: 'claim-mipt-observer-algebra',
              status: 'requested',
            }),
            stderr: '',
          };
        }
        return {
          exitCode: 1,
          stdout: '',
          stderr: `unexpected AITP command: ${args.join(' ')}`,
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      command: 'aitp-v5',
      runner,
    });

    const aitp = await bridge.readProcessGraphSlice({
      sessionId: 'session-qg-mipt',
      claimId: 'claim-mipt-observer-algebra',
      limit: 16,
      prompt:
        'Brainstorm the relation path, follow the source dependency, and keep the original question visible.',
    });
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.qg-mipt',
        domain: 'theoretical-physics/qg-algebra',
        topic: 'qg-algebra-mipt',
        goal: 'Trace whether an algebraic split can model the MIPT observer role.',
        activeObjectIds: ['object-von-neumann-algebra', 'object-mipt-observer'],
        sourceRefs: [
          'aitp:session:session-qg-mipt',
          'aitp:claim:claim-mipt-observer-algebra',
        ],
        trustState: 'exploratory',
      }),
      aitp,
      now: () => 777,
    });

    const obligationBinding = requiredBinding(pack.actionBindings, 'aitp.create_open_obligation');
    expect(obligationBinding.objectRefs).toEqual(
      expect.arrayContaining([
        'claim:claim-mipt-observer-algebra',
        'obligation:obl-source-chain',
      ]),
    );
    expect(obligationBinding.params?.['writeBridge']).toMatchObject({
      operation: 'createProofObligation',
      cli: 'aitp-v5 research-state create-proof-obligation',
      requiredFields: [
        'topicId',
        'claimId',
        'statement',
        'obligationType',
        'status',
        'maturityLevel',
        'nextAction',
      ],
    });
    expect(obligationBinding.params).toMatchObject({
      timing: 'after_brainstorm_before_derivation',
      trustBoundary: 'source_support',
    });

    const checkpointBinding = requiredBinding(pack.actionBindings, 'aitp.request_human_checkpoint');
    expect(checkpointBinding.params?.['writeBridge']).toMatchObject({
      operation: 'requestHumanCheckpoint',
      cli: 'aitp-v5 checkpoint request',
      requiredFields: ['topicId', 'claimId', 'reason', 'requestedBy', 'options'],
    });
    expect(pack.aitp?.contextLines.join('\n')).toContain('Moment policy:');
    expect(pack.aitp?.trustBoundaryReasons).toEqual([
      'Claim trust cannot be updated until source dependency and human decision are recorded.',
    ]);

    const proof = await bridge.createProofObligation({
      topicId: 'qg-algebra-mipt',
      claimId: 'claim-mipt-observer-algebra',
      statement:
        'Backtrace the algebraic split source chain before treating the observer analogy as supported.',
      obligationType: 'source_support',
      status: 'open',
      maturityLevel: 'hypothesis',
      nextAction: 'follow source dependency back to the definition source',
      requiredEvidence: ['source reconstruction', 'definition provenance'],
      proofStrategy: [
        'trace von Neumann algebra split definition',
        'compare with MIPT observer operational role',
      ],
      failureModes: ['analogy mistaken for derivation'],
      sourceRefs: ['source_asset:asset-algebra-paper'],
    });
    const checkpoint = await bridge.requestHumanCheckpoint({
      topicId: 'qg-algebra-mipt',
      claimId: 'claim-mipt-observer-algebra',
      reason: 'Trust boundary before updating claim status from exploratory to supported.',
      requestedBy: 'hakimi',
      options: ['keep exploratory', 'approve source-supported transition'],
    });

    expect(proof).toMatchObject({
      kind: 'proof_obligation',
      obligationId: 'proof-obligation-algebra-source-chain',
      canUpdateClaimTrust: false,
    });
    expect(checkpoint).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg-trust-boundary',
      status: 'requested',
    });
    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'graph',
          'slice',
          'session-qg-mipt',
          '--limit',
          '16',
          '--claim',
          'claim-mipt-observer-algebra',
        ],
      },
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'research-state',
          'create-proof-obligation',
          '--topic',
          'qg-algebra-mipt',
          '--claim',
          'claim-mipt-observer-algebra',
          '--statement',
          'Backtrace the algebraic split source chain before treating the observer analogy as supported.',
          '--type',
          'source_support',
          '--status',
          'open',
          '--maturity-level',
          'hypothesis',
          '--next-action',
          'follow source dependency back to the definition source',
          '--required-evidence',
          'source reconstruction',
          '--required-evidence',
          'definition provenance',
          '--proof-strategy',
          'trace von Neumann algebra split definition',
          '--proof-strategy',
          'compare with MIPT observer operational role',
          '--failure-mode',
          'analogy mistaken for derivation',
          '--source-ref',
          'source_asset:asset-algebra-paper',
        ],
      },
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'checkpoint',
          'request',
          '--topic',
          'qg-algebra-mipt',
          '--claim',
          'claim-mipt-observer-algebra',
          '--reason',
          'Trust boundary before updating claim status from exploratory to supported.',
          '--requested-by',
          'hakimi',
          '--option',
          'keep exploratory',
          '--option',
          'approve source-supported transition',
        ],
      },
    ]);
  });
});

function requiredBinding(
  bindings: readonly ResearchActionBinding[],
  actionId: string,
): ResearchActionBinding {
  const binding = bindings.find((item) => item.actionId === actionId);
  expect(binding).toBeDefined();
  return binding!;
}

function qgMiptSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-mipt-observer-algebra',
        type: 'claim',
        record: {
          statement: 'The MIPT observer role may be modeled by an algebraic split.',
          status: 'hypothesis',
          source_refs: ['source_asset:asset-algebra-paper'],
        },
      },
      {
        id: 'source_asset:asset-algebra-paper',
        kind: 'source_asset',
        asset_type: 'paper',
        title: 'Algebraic observer source',
        uri: 'arxiv:2601.00001',
      },
    ],
    edges: [
      {
        id: 'edge-algebra-observer',
        source: 'physics_object:object-von-neumann-algebra',
        target: 'physics_object:object-mipt-observer',
        relation: 'candidate_bridge',
        status: 'hypothesis',
      },
    ],
    open_obligations: [
      {
        obligation_id: 'obl-source-chain',
        claim_id: 'claim-mipt-observer-algebra',
        status: 'open',
        severity: 'blocking',
        obligation_type: 'source_support',
        statement:
          'Backtrace the algebraic split source chain before treating the observer analogy as supported.',
        next_action: 'follow source dependency back to the definition source',
        suggested_moments: ['backtrace_source_reconstruction'],
        source_refs: ['source_asset:asset-algebra-paper'],
      },
    ],
    source_backtrace: [
      {
        id: 'backtrace-algebra-split',
        claim_id: 'claim-mipt-observer-algebra',
        missing_components: ['reference_location', 'definition_source'],
        complete: false,
        source_asset_ids: ['asset-algebra-paper'],
        reason: 'source gap before source trust',
      },
    ],
    relation_neighborhood: [
      {
        relation_id: 'rel-algebra-observer',
        status: 'hypothesis',
        relation_type: 'candidate_bridge',
        subject_id: 'object-von-neumann-algebra',
        object_id: 'object-mipt-observer',
      },
    ],
    exploratory_records: [
      {
        record_id: 'explore-qg-path',
        exploration_type: 'relation_path_brainstorm',
        title: 'Trace algebra to observer relation',
        focal_question:
          'Can the algebraic split and observer role share a definition path?',
        original_question:
          'Does quantum-gravity algebra clarify the observer role in MIPT?',
        local_question:
          'Which source defines the split needed for the observer analogy?',
        status: 'active',
        object_ids: ['object-von-neumann-algebra', 'object-mipt-observer'],
        relation_ids: ['rel-algebra-observer'],
        candidate_paths: [
          'von Neumann algebra -> split property -> observer factorization',
        ],
        unresolved_points: ['which theorem carries the split assumption'],
        next_actions: ['open source dependency backtrace'],
      },
    ],
    trust_boundary_reasons: [
      'Claim trust cannot be updated until source dependency and human decision are recorded.',
    ],
    recommended_moments: [
      {
        moment: 'record_or_validate_open_obligation',
        priority: 'blocking',
        reason: 'The source-support gap should become an explicit typed obligation.',
        target_refs: [
          'claim:claim-mipt-observer-algebra',
          'obligation:obl-source-chain',
        ],
        timing: 'after_brainstorm_before_derivation',
        trust_boundary: 'source_support',
      },
      {
        moment: 'human_checkpoint',
        priority: 'high',
        reason: 'A human should decide whether the claim can leave exploratory status.',
        target_refs: ['claim:claim-mipt-observer-algebra'],
        timing: 'before_trust_update',
        trust_boundary: 'human_checkpoint',
      },
    ],
  };
}
