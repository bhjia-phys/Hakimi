import { describe, expect, it } from 'vitest';

import {
  DomainProfileRegistry,
  PhysicsMemoryRegistry,
  ResearchEvalCaseRegistry,
  ResearchLedgerRegistry,
  WorkflowRecipeRegistry,
  compileAitpProcessGraphSlice,
  compileResearchContextPack,
  createWorkFrame,
  type DomainProfile,
  type FileBackedResearchEvalCase,
  type PhysicsCapsule,
  type ResearchLedgerEvent,
  type WorkflowRecipe,
} from '../../src';

const DOMAIN = 'topological-order/fqhe-cs';

describe('compileResearchContextPack', () => {
  it('compiles profiles, recipes, memory, ledger proposals, and action bindings for a WorkFrame', () => {
    const domainProfiles = new DomainProfileRegistry();
    const workflowRecipes = new WorkflowRecipeRegistry();
    const physicsMemory = new PhysicsMemoryRegistry();
    const researchLedger = new ResearchLedgerRegistry();
    const researchHarness = new ResearchEvalCaseRegistry();

    domainProfiles.register(profile());
    workflowRecipes.register(recipe());
    physicsMemory.register(formulaCapsule());
    physicsMemory.register(benchmarkCapsule());
    researchLedger.register(ledgerEvent());
    researchHarness.register(evalFile());

    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.fqhe',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Relate Laughlin wavefunction and CS response.',
        activeObjectIds: ['formula.fqhe.flux-quantization'],
        sourceRefs: ['prompt:initial-question'],
      }),
      domainProfiles,
      workflowRecipes,
      physicsMemory,
      researchLedger,
      researchHarness,
      now: () => 123,
    });

    expect(pack.id).toMatch(/^context\.frame\.fqhe\.[a-f0-9]{12}$/);
    expect(pack.compiledAt).toBe(123);
    expect(pack.profiles.map((item) => item.id)).toEqual(['domain.fqhe-cs']);
    expect(pack.workflows.map((item) => item.id)).toEqual(['workflow.fqhe-cs.charge-flux']);
    expect(pack.physics.capsules.map((item) => item.id)).toEqual([
      'formula.fqhe.flux-quantization',
    ]);
    expect(pack.ledger.proposals.map((item) => item.id)).toEqual([
      'proposal.event.fqhe.flux-source.formula',
    ]);
    expect(pack.actionBindings.map((item) => item.id)).toEqual([
      'binding.formula.fqhe.flux-quantization.validate.check_convention',
      'binding.fqhe.convention',
    ]);
    expect(pack.domainPack).toMatchObject({
      domain: DOMAIN,
      profileIds: ['domain.fqhe-cs'],
      workflowIds: ['workflow.fqhe-cs.charge-flux'],
      evalCaseIds: ['eval.fqhe.charge-flux'],
      requiredTools: ['PhysicsMemory', 'ResearchLedger'],
    });
    expect(pack.sourceRefs).toEqual([
      'ledger:event.fqhe.flux-source',
      'local:profile',
      'local:workflow',
      'paper:laughlin',
      'prompt:initial-question',
    ]);
  });

  it('keeps missing registries as diagnostics instead of failing compilation', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.empty',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Answer a lightweight question.',
      }),
      now: () => 1,
    });

    expect(pack.profiles).toEqual([]);
    expect(pack.physics.capsules).toEqual([]);
    expect(pack.diagnostics.map((item) => item.code)).toEqual([
      'domain-profile-registry-disabled',
      'workflow-recipe-registry-disabled',
      'physics-memory-registry-disabled',
      'research-ledger-registry-disabled',
    ]);
  });

  it('compiles AITP process graph slices into native context bindings', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.aitp',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Backtrace a provisional relation before promoting it.',
      }),
      aitp: compileAitpProcessGraphSlice(aitpSlicePayload(), {
        prompt: 'Brainstorm the relation path and follow the source dependency.',
      }),
      now: () => 123,
    });

    expect(pack.aitp).toMatchObject({
      truthSource: 'typed_records',
      orientationOnly: true,
      liveRouteIds: ['route-source-first'],
      blockedRouteIds: ['route-direct-proof'],
      abandonedRouteIds: [],
      pivotRequiredRouteIds: ['route-source-first'],
      provenanceGapIds: ['gap-code-state'],
      codeProvenanceGapIds: ['gap-code-state'],
      sourceAssetIds: ['source-asset-edge-counting'],
      sourceAssetMissingHashIds: ['source-asset-edge-counting'],
      sourceAssetDuplicateHashIds: [],
      sourceStackCoverageClaimIds: ['claim-fqhe'],
      sourceStackEvidenceGapClaimIds: ['claim-fqhe'],
      sourceStackReconstructionGapClaimIds: ['claim-fqhe'],
      sourceStackReviewGapClaimIds: [],
      sourceStackCoverageNextActions: expect.arrayContaining([
        'record_evidence_for_required_outputs:claim-fqhe',
      ]),
      openObligationIds: ['obligation-source'],
      requiredCallIds: expect.arrayContaining([
        expect.stringContaining('aitp-record-evidence'),
        expect.stringContaining('aitp-record-reference-location'),
        expect.stringContaining('aitp-request-human-checkpoint'),
      ]),
      trustPrerequisiteCallIds: expect.arrayContaining([
        expect.stringContaining('aitp-record-evidence'),
        expect.stringContaining('aitp-record-reference-location'),
      ]),
    });
    expect(pack.aitp?.contextLines.join('\n')).toContain(
      'Source asset index: source_asset:source-asset-edge-counting [paper/missing]',
    );
    expect(pack.aitp?.contextLines.join('\n')).toContain(
      'Source stack coverage: claim-fqhe [evidence_gap/guided]',
    );
    expect(pack.actionBindings.map((item) => item.actionId)).toEqual(
      expect.arrayContaining([
        'aitp.create_open_obligation',
        'aitp.checkpoint_before_route_switch',
        'aitp.capture_code_state_auto',
        'aitp.record_evidence',
        'aitp.record_failed_route_lesson',
        'aitp.record_reference_location',
        'aitp.record_route_choice',
        'aitp.request_human_checkpoint',
        'code.capture_git_diff_observation',
        'physics.brainstorm_relation_path',
        'trace.follow_source_dependency',
      ]),
    );
    expect(pack.diagnostics.map((item) => item.source)).toContain('aitp');
  });
});

function profile(): DomainProfile {
  return {
    metadata: {
      id: 'domain.fqhe-cs',
      kind: 'domain_profile',
      title: 'FQHE/CS profile',
      domain: DOMAIN,
      status: 'checked',
      sourceRefs: ['local:profile'],
      conventions: ['convention.cs.level-normalization'],
      lenses: ['charge_flux_quantization'],
      workflows: ['workflow.fqhe-cs.charge-flux'],
      capsuleRefs: ['formula.fqhe.flux-quantization'],
      bridgeCapsules: [],
      contextTags: ['fqhe', 'chern-simons'],
    },
    path: 'profile.md',
    body: 'Profile body.',
    source: 'project',
  };
}

function recipe(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.fqhe-cs.charge-flux',
      kind: 'workflow_recipe',
      title: 'Charge-flux convention workflow',
      domain: DOMAIN,
      status: 'checked',
      sourceRefs: ['local:workflow'],
      actionBindings: [
        {
          id: 'binding.fqhe.convention',
          actionId: 'validate.check_convention',
          domainId: DOMAIN,
          lensId: 'charge_flux_quantization',
          checkId: 'check.charge-flux-quantization.convention',
          priority: 'blocking',
        },
      ],
      requiredCapsules: ['formula.fqhe.flux-quantization'],
      requiredTools: ['PhysicsMemory', 'ResearchLedger'],
      failureModes: ['failure.fqhe.convention-mismatch'],
    },
    path: 'workflow.md',
    body: 'Workflow body.',
    source: 'project',
  };
}

function evalFile(): FileBackedResearchEvalCase {
  return {
    path: 'eval.md',
    source: 'project',
    body: 'Eval body.',
    sourceRefs: ['local:eval'],
    evalCase: {
      id: 'eval.fqhe.charge-flux',
      title: 'FQHE charge-flux eval',
      task: 'Explain charge-flux convention.',
      domain: DOMAIN,
      capsuleRefs: ['formula.fqhe.flux-quantization'],
      actionSequence: [],
      validations: [],
    },
  };
}

function formulaCapsule(): PhysicsCapsule {
  return {
    metadata: {
      id: 'formula.fqhe.flux-quantization',
      kind: 'Formula',
      domain: DOMAIN,
      title: 'Flux quantization convention',
      reliability: 'checked',
      symbols: ['Phi', 'Phi_0'],
      assumes: ['convention.cs.level-normalization'],
      dependsOn: [],
      sourceRefs: ['paper:laughlin'],
      graphRefs: [{ kind: 'Formula', id: 'formula.fqhe.flux-quantization' }],
      expansionHandles: [{ kind: 'formula', ref: 'formula.fqhe.flux-quantization' }],
      requiredChecks: [
        {
          id: 'check.charge-flux-quantization.convention',
          kind: 'convention',
          severity: 'blocking',
        },
      ],
      actionAffordances: [
        {
          actionId: 'validate.check_convention',
          intent: 'required',
          reason: 'CS normalization depends on the flux convention.',
        },
      ],
      allowCrossDomain: false,
    },
    path: 'formula.md',
    body: 'Phi = n Phi_0.',
    source: 'project',
  };
}

function benchmarkCapsule(): PhysicsCapsule {
  return {
    metadata: {
      id: 'benchmark.fqhe.flux-smoke',
      kind: 'BenchmarkCase',
      domain: DOMAIN,
      title: 'Flux convention smoke check',
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: ['formula.fqhe.flux-quantization'],
      sourceRefs: ['local:benchmark'],
      graphRefs: [],
      expansionHandles: [],
      requiredChecks: [],
      actionAffordances: [],
      allowCrossDomain: false,
    },
    path: 'benchmark.md',
    body: 'Smoke check.',
    source: 'project',
  };
}

function ledgerEvent(): ResearchLedgerEvent {
  return {
    metadata: {
      id: 'event.fqhe.flux-source',
      type: 'source_excerpt',
      topic: 'fqhe-cs-effective-theory',
      domain: DOMAIN,
      status: 'captured',
      sourceRefs: ['ledger:event.fqhe.flux-source'],
      dependsOn: [],
      candidateCapsuleKind: 'Formula',
      openQuestions: [],
      relatedObjects: ['formula.fqhe.flux-quantization'],
    },
    path: 'event.md',
    body: 'Flux insertion source excerpt.',
    root: { path: '.aitp/research-ledger', source: 'project' },
  };
}

function aitpSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-fqhe',
        type: 'claim',
        record: {
          statement: 'Sector counting identifies the edge CFT.',
          status: 'hypothesis',
        },
      },
    ],
    edges: [],
    open_obligations: [
      {
        obligation_id: 'obligation-source',
        claim_id: 'claim-fqhe',
        status: 'open',
        obligation_type: 'source_support',
        statement: 'Locate the source supporting the counting-CFT relation.',
        next_action: 'open source dependency backtrace',
      },
    ],
    source_backtrace: [
      {
        claim_id: 'claim-fqhe',
        missing_components: ['reference_location'],
        complete: false,
      },
    ],
    relation_neighborhood: [
      {
        relation_id: 'relation-counting-cft',
        status: 'hypothesis',
        relation_type: 'diagnoses',
        subject_id: 'object-counting',
        object_id: 'object-cft',
      },
    ],
    exploratory_records: [],
    route_state: {
      active_route_id: 'route-source-first',
      routes: [
        {
          route_id: 'route-source-first',
          topic_id: 'fqhe-cs-effective-theory',
          claim_id: 'claim-fqhe',
          title: 'Source-first route',
          route_type: 'source_backtrace',
          status: 'live',
          active: true,
          rationale: 'Locate source support before direct proof.',
          parent_route_ids: ['route-direct-proof'],
          pivot_reason: 'direct proof lacks a source location',
        },
        {
          route_id: 'route-direct-proof',
          topic_id: 'fqhe-cs-effective-theory',
          claim_id: 'claim-fqhe',
          title: 'Direct proof route',
          route_type: 'derivation',
          status: 'blocked',
          rationale: 'Try direct proof from the provisional relation.',
          failure_modes: ['missing source location'],
          lesson: 'Do not use direct proof until source location exists.',
        },
      ],
      live_route_ids: ['route-source-first'],
      blocked_route_ids: ['route-direct-proof'],
      abandoned_route_ids: [],
      pivot_required_route_ids: ['route-source-first'],
    },
    provenance_gaps: [
      {
        gap_id: 'gap-code-state',
        gap_type: 'code_state_missing',
        provenance_kind: 'code',
        reason: 'code-dependent route has no git code state',
        topic_id: 'fqhe-cs-effective-theory',
        claim_id: 'claim-fqhe',
        target_type: 'claim',
        target_id: 'claim-fqhe',
        target_refs: ['claim:claim-fqhe'],
        recommended_actions: ['aitp.capture_code_state_auto'],
        recommended_entrypoints: ['aitp_v5_capture_code_state_auto'],
        severity: 'recommended',
        required_now: false,
        required_before_trust_change: false,
        strict_boundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        blocking_when_used_as: ['benchmark_basis'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
    ],
    source_asset_index: [
      {
        asset_id: 'source-asset-edge-counting',
        topic_id: 'fqhe-cs-effective-theory',
        claim_id: 'claim-fqhe',
        asset_type: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Edge counting source asset',
        source_kind: 'literature',
        hash_status: 'missing',
        reference_location_ids: ['ref-edge-counting'],
        reference_locations: [
          {
            reference_location_id: 'ref-edge-counting',
            uri: 'arxiv:2601.00001#sec2',
            label: 'Section 2',
            location_type: 'paper_section',
            status: 'located',
          },
        ],
        target_refs: ['source_asset:source-asset-edge-counting'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
    ],
    source_stack_coverage: {
      kind: 'source_stack_coverage_manifest',
      claim_count: 1,
      coverage_status_counts: {
        complete: 0,
        evidence_gap: 1,
        reconstruction_gap: 0,
        review_gap: 0,
      },
      missing_required_output_counts: {
        scoped_claim: 1,
        evidence_or_provenance: 1,
      },
      source_component_gap_counts: {
        reconstruction_path: 1,
      },
      source_review_status_counts: {
        pending: 1,
      },
      items: [
        {
          topic_id: 'fqhe-cs-effective-theory',
          claim_id: 'claim-fqhe',
          claim_statement: 'Sector counting identifies the edge CFT.',
          risk_level: 'guided',
          required_outputs: ['scoped_claim', 'evidence_or_provenance'],
          satisfied_required_outputs: [],
          missing_required_outputs: ['scoped_claim', 'evidence_or_provenance'],
          evidence_ids_by_output: {
            scoped_claim: [],
            evidence_or_provenance: [],
          },
          source_reconstruction_complete: false,
          missing_source_components: ['reconstruction_path'],
          source_reconstruction_review_status: 'pending',
          latest_source_review_result_id: '',
          coverage_status: 'evidence_gap',
          next_actions: [
            'record_evidence_for_required_outputs:claim-fqhe',
            'complete_source_reconstruction:claim-fqhe',
            'review_source_reconstruction:claim-fqhe',
          ],
          can_update_claim_trust: false,
        },
      ],
      next_actions: [
        'record_evidence_for_required_outputs:claim-fqhe',
        'complete_source_reconstruction:claim-fqhe',
        'review_source_reconstruction:claim-fqhe',
      ],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    trust_boundary_reasons: ['this API cannot update claim trust'],
    moment_policy: {
      ok: true,
      kind: 'host_agnostic_moment_policy',
      decisions: [
        {
          moment: 'record_or_validate_open_obligation',
          decision_type: 'recording',
          action_kind: 'record_evidence_or_validation',
          required_now: true,
          reason: 'open proof obligation requires typed evidence or validation',
          target_type: 'proof_obligation',
          target_id: 'obligation-source',
          missing_components: [],
          record_entrypoints: [
            'aitp_v5_record_evidence',
            'aitp_v5_record_validation_result',
          ],
          exploration_entrypoints: [],
          entrypoints: [
            'aitp_v5_record_evidence',
            'aitp_v5_record_validation_result',
            'aitp_v5_preflight_trust_update',
          ],
          required_before_trust_change: [
            'record typed evidence or validation for the open obligation',
            'run aitp_v5_preflight_trust_update',
          ],
          trust_boundary: true,
          orientation_only: true,
          can_update_claim_trust: false,
        },
        {
          moment: 'backtrace_source_reconstruction',
          decision_type: 'backtrace',
          action_kind: 'reconstruct_missing_source_components',
          required_now: true,
          reason: 'missing source reconstruction components',
          target_type: 'claim',
          target_id: 'claim-fqhe',
          missing_components: ['reference_location'],
          record_entrypoints: [
            'aitp_v5_record_exploratory_record',
            'aitp_v5_record_reference_location',
          ],
          exploration_entrypoints: ['aitp_v5_record_exploratory_record'],
          entrypoints: [
            'aitp_v5_record_exploratory_record',
            'aitp_v5_record_reference_location',
            'aitp_v5_preflight_trust_update',
          ],
          required_before_trust_change: [
            'backtrace missing source components to typed records',
            'run aitp_v5_preflight_trust_update',
          ],
          trust_boundary: true,
          orientation_only: true,
          can_update_claim_trust: false,
        },
        {
          moment: 'trust_boundary_before_claim_update',
          decision_type: 'trust_boundary',
          action_kind: 'block_trust_change_until_policy_prerequisites_are_met',
          required_now: true,
          reason: 'recording, brainstorming, or backtrace prerequisites exist before any claim-trust update',
          target_type: 'claim',
          target_id: 'claim-fqhe',
          missing_components: [],
          record_entrypoints: [],
          exploration_entrypoints: [],
          entrypoints: ['aitp_v5_preflight_trust_update'],
          required_before_trust_change: [
            'resolve required recording/backtrace/brainstorm policy decisions',
            'run aitp_v5_preflight_trust_update',
          ],
          trust_boundary: true,
          orientation_only: true,
          can_update_claim_trust: false,
        },
      ],
      recommended_moments: [],
      trust_boundary_reasons: ['this API cannot update claim trust'],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    recommended_moments: [
      {
        moment: 'brainstorm_relation_path',
        reason: 'object relation is still a hypothesis',
        target_type: 'object_relation',
        target_id: 'relation-counting-cft',
      },
    ],
  };
}
