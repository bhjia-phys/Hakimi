import type { DomainProfile, DomainProfileRegistry } from '../domain-profile';
import type {
  FileBackedResearchEvalCase,
  ResearchEvalCaseRegistry,
} from '../research-harness';
import type { ResearchActionBinding, WorkFrame } from '../research-action';
import type { WorkflowRecipe, WorkflowRecipeRegistry } from '../workflow-recipe';
import type { PhysicsCapsule, PhysicsMemoryRegistry } from '../physics-memory';

export const GENERIC_THEORETICAL_PHYSICS_DOMAIN = 'theoretical-physics/general';
export const GENERIC_THEORETICAL_PHYSICS_PROFILE_ID =
  'domain.theoretical-physics.generic';
export const GENERIC_THEORETICAL_PHYSICS_GENERAL_WORKFLOW_ID =
  'workflow.theoretical-physics.general-research';
export const GENERIC_THEORETICAL_PHYSICS_COMPUTATIONAL_WORKFLOW_ID =
  'workflow.theoretical-physics.computational-research';
export const GENERIC_THEORETICAL_PHYSICS_EVAL_ID =
  'eval.theoretical-physics.evidence-loop';

const BUILTIN_SOURCE_REF = 'builtin:hakimi/theoretical-physics-defaults';
const BUILTIN_PATH_PREFIX = 'builtin:hakimi/theoretical-physics-defaults';

const PROCESS_CAPSULE_IDS = {
  objectDiscovery:
    'workflow.theoretical-physics.research-object-discovery',
  boundarySinkMotion:
    'workflow.theoretical-physics.boundary-sink-motion-inventory',
  scopeEvidence:
    'workflow.theoretical-physics.scope-evidence-validation-ladder',
  unsourcedOverclaim:
    'failure.theoretical-physics.unsourced-or-unscoped-overclaim',
  formulaValidation:
    'workflow.theoretical-physics.formula-validation-contract',
} as const;

export const BUILTIN_THEORETICAL_PHYSICS_DOMAIN_PROFILES = [
  {
    metadata: {
      id: GENERIC_THEORETICAL_PHYSICS_PROFILE_ID,
      kind: 'domain_profile',
      title: 'Generic theoretical physics research profile',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      status: 'checked',
      sourceRefs: [BUILTIN_SOURCE_REF],
      conventions: [
        'convention.scope-first',
        'convention.explicit-assumptions',
        'convention.source-backed-promotion',
      ],
      lenses: [
        'research_object_discovery',
        'boundary_sink_motion_inventory',
        'lens.evidence-before-validation',
        'lens.dimension-convention-dependency',
      ],
      workflows: [GENERIC_THEORETICAL_PHYSICS_GENERAL_WORKFLOW_ID],
      capsuleRefs: [
        PROCESS_CAPSULE_IDS.objectDiscovery,
        PROCESS_CAPSULE_IDS.boundarySinkMotion,
        PROCESS_CAPSULE_IDS.scopeEvidence,
        PROCESS_CAPSULE_IDS.unsourcedOverclaim,
        PROCESS_CAPSULE_IDS.formulaValidation,
      ],
      bridgeCapsules: [],
      contextTags: [
        'theoretical-physics',
        'generic-fallback',
        'hakimi-default',
      ],
    },
    path: `${BUILTIN_PATH_PREFIX}/domain-profile.md`,
    source: 'builtin',
    body: [
      'Built-in fallback profile for new theoretical physics topics.',
      'It provides process constraints only: scope, assumptions, source support,',
      'validation checks, and promotion discipline. It does not encode domain facts.',
    ].join('\n'),
  },
] as const satisfies readonly DomainProfile[];

export const BUILTIN_THEORETICAL_PHYSICS_WORKFLOW_RECIPES = [
  {
    metadata: {
      id: GENERIC_THEORETICAL_PHYSICS_GENERAL_WORKFLOW_ID,
      kind: 'workflow_recipe',
      title: 'General theoretical physics evidence loop',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      status: 'checked',
      sourceRefs: [BUILTIN_SOURCE_REF],
      actionBindings: [
        binding('open-frame', 'scope.open_work_frame', 'blocking'),
        binding('compile-context', 'scope.compile_context_pack', 'blocking'),
        lensBinding(
          'apply-object-discovery-lens',
          'physics.apply_direction_lens',
          'research_object_discovery',
          'check.theoretical-physics.research-object-inventory',
          'blocking',
        ),
        lensBinding(
          'extract-object-inventory',
          'source.extract_definition',
          'research_object_discovery',
          'check.theoretical-physics.research-object-inventory',
          'high',
        ),
        lensBinding(
          'check-primary-observables',
          'validate.check_convention',
          'research_object_discovery',
          'check.theoretical-physics.primary-observable-alignment',
          'high',
        ),
        lensBinding(
          'apply-boundary-sink-motion-lens',
          'physics.apply_direction_lens',
          'boundary_sink_motion_inventory',
          'check.theoretical-physics.boundary-sink-motion-inventory',
          'blocking',
        ),
        lensBinding(
          'check-reachability-before-boundary-loss',
          'validate.check_known_limit',
          'boundary_sink_motion_inventory',
          'check.theoretical-physics.reachability-before-boundary-loss',
          'blocking',
        ),
        lensBinding(
          'map-boundary-motion-model-layers',
          'validate.check_convention',
          'boundary_sink_motion_inventory',
          'check.theoretical-physics.model-layer-motion-map',
          'blocking',
        ),
        lensBinding(
          'extract-motion-observables',
          'source.extract_definition',
          'boundary_sink_motion_inventory',
          'check.theoretical-physics.boundary-sink-motion-inventory',
          'high',
        ),
        binding('search-literature', 'source.search_literature', 'high'),
        binding('capture-source', 'source.capture_source_excerpt', 'high'),
        binding('declare-conventions', 'scope.declare_convention_set', 'high'),
        binding('extract-definition', 'source.extract_definition', 'normal'),
        binding('extract-formula', 'source.extract_formula', 'normal'),
        binding('extract-assumption', 'source.extract_assumption', 'normal'),
        binding('propose-route', 'derive.propose_route', 'normal'),
        binding('derive-step', 'derive.derive_step', 'normal'),
        binding('transform-formula', 'derive.transform_formula', 'normal'),
        binding('specialize-regime', 'derive.specialize_regime', 'normal'),
        binding('compare-known-result', 'derive.compare_with_known_result', 'normal'),
        binding('query-dependencies', 'graph.query_dependency_closure', 'high'),
        binding('check-source-support', 'validate.check_source_support', 'blocking'),
        binding('check-dimension', 'validate.check_dimension', 'blocking'),
        binding('check-convention', 'validate.check_convention', 'blocking'),
        binding('check-symbols', 'validate.check_symbol_consistency', 'high'),
        binding('check-known-limit', 'validate.check_known_limit', 'high'),
        binding('check-dependency-closure', 'validate.check_dependency_closure', 'blocking'),
        binding('compile-edges', 'graph.compile_edges', 'normal'),
        binding('formalization-blueprint', 'formalization.build_blueprint', 'low'),
        binding('propose-capsule', 'memory.propose_capsule', 'low'),
        binding('build-eval-from-failure', 'harness.build_eval_from_failure', 'low'),
      ],
      requiredCapsules: [
        PROCESS_CAPSULE_IDS.objectDiscovery,
        PROCESS_CAPSULE_IDS.boundarySinkMotion,
        PROCESS_CAPSULE_IDS.scopeEvidence,
        PROCESS_CAPSULE_IDS.unsourcedOverclaim,
        PROCESS_CAPSULE_IDS.formulaValidation,
      ],
      requiredTools: [
        'PhysicsMemory',
        'ResearchLedger',
        'ResearchAction',
        'Read',
        'WebSearch',
        'FetchURL',
      ],
      failureModes: [PROCESS_CAPSULE_IDS.unsourcedOverclaim],
    },
    path: `${BUILTIN_PATH_PREFIX}/workflow-general.md`,
    source: 'builtin',
    body: [
      'Default research loop for a new theoretical physics topic:',
      'open a WorkFrame, compile context, collect source evidence, extract typed',
      'objects, keep assumptions and conventions explicit, validate before promotion,',
      'and turn failures into reusable eval candidates.',
    ].join('\n'),
  },
  {
    metadata: {
      id: GENERIC_THEORETICAL_PHYSICS_COMPUTATIONAL_WORKFLOW_ID,
      kind: 'workflow_recipe',
      title: 'Computational physics implementation loop',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      status: 'checked',
      sourceRefs: [BUILTIN_SOURCE_REF],
      actionBindings: [
        binding('inspect-git-history', 'code.inspect_git_history', 'normal'),
        binding('inspect-call-sites', 'code.inspect_call_sites', 'high'),
        binding('map-formula-code', 'code.map_formula_to_code_region', 'high'),
        binding('prepare-patch', 'code.prepare_patch', 'normal'),
        binding('capture-diff', 'code.capture_git_diff_observation', 'normal'),
        binding('check-observable', 'code.check_intermediate_observable', 'blocking'),
        binding('run-minimal-benchmark', 'benchmark.run_minimal_case', 'high'),
        binding('submit-external-job', 'benchmark.submit_external_job', 'normal'),
      ],
      requiredCapsules: [PROCESS_CAPSULE_IDS.formulaValidation],
      requiredTools: [
        'PhysicsMemory',
        'ResearchLedger',
        'ResearchAction',
        'Read',
        'Grep',
        'Glob',
        'Bash',
        'Edit',
        'Write',
      ],
      failureModes: [PROCESS_CAPSULE_IDS.unsourcedOverclaim],
    },
    path: `${BUILTIN_PATH_PREFIX}/workflow-computational.md`,
    source: 'builtin',
    body: [
      'Optional built-in workflow for turns whose WorkFrame explicitly asks for code,',
      'benchmarks, external jobs, or formula-to-code mapping. Native tools execute the',
      'primitive work; ResearchAction records the semantic action and evidence refs.',
    ].join('\n'),
  },
] as const satisfies readonly WorkflowRecipe[];

export const BUILTIN_THEORETICAL_PHYSICS_CAPSULES = [
  {
    metadata: {
      id: PROCESS_CAPSULE_IDS.objectDiscovery,
      kind: 'WorkflowRecipe',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      title: 'Research object discovery inventory',
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: [],
      sourceRefs: [BUILTIN_SOURCE_REF],
      graphRefs: [
        {
          kind: 'WorkflowRecipe',
          id: PROCESS_CAPSULE_IDS.objectDiscovery,
          relation: 'defines',
        },
      ],
      expansionHandles: [
        {
          kind: 'workflow',
          ref: 'lens:research_object_discovery',
          title: 'Research object discovery lens',
        },
      ],
      requiredChecks: [
        {
          id: 'check.theoretical-physics.research-object-inventory',
          kind: 'assumption_scope',
          severity: 'blocking',
          description:
            'New topics require an inventory of dynamical objects, controls, observables, model layers, known limits, and failure modes.',
        },
        {
          id: 'check.theoretical-physics.primary-observable-alignment',
          kind: 'convention',
          severity: 'warning',
          description:
            'Primary observables must answer the user question directly; auxiliary diagnostics must be labeled secondary.',
        },
      ],
      actionAffordances: [
        {
          actionId: 'physics.apply_direction_lens',
          intent: 'required',
          reason: 'Use the research_object_discovery lens before graph writes on a new topic.',
        },
        {
          actionId: 'source.extract_definition',
          intent: 'recommended',
          reason:
            'Extract candidate degrees of freedom, controls, observables, model layers, known limits, and failure modes.',
        },
        {
          actionId: 'validate.check_known_limit',
          intent: 'recommended',
          reason: 'Known limits often reveal whether the naive object choice is wrong.',
        },
      ],
      scope: {
        regimes: ['new theoretical physics topic', 'problem framing', 'graph initialization'],
        assumptions: ['process guidance only; no domain-specific physics facts'],
      },
      allowCrossDomain: true,
    },
    path: `${BUILTIN_PATH_PREFIX}/capsule-research-object-discovery.md`,
    source: 'builtin',
    body: [
      'Before deriving or writing graph objects for a new theoretical-physics topic,',
      'make a compact object inventory: dynamical degrees of freedom, controls,',
      'boundary/source/sink terms, primary observables, auxiliary diagnostics,',
      'model layers, known limits, and failure modes. Do not replace the user target',
      'with a familiar object such as a spectrum, normal mode, code path, or formal',
      'operator until it has been marked as primary or secondary.',
    ].join('\n'),
  },
  {
    metadata: {
      id: PROCESS_CAPSULE_IDS.boundarySinkMotion,
      kind: 'WorkflowRecipe',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      title: 'Boundary/source-sink motion inventory',
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: [PROCESS_CAPSULE_IDS.objectDiscovery],
      sourceRefs: [BUILTIN_SOURCE_REF],
      graphRefs: [
        {
          kind: 'WorkflowRecipe',
          id: PROCESS_CAPSULE_IDS.boundarySinkMotion,
          relation: 'defines',
        },
      ],
      expansionHandles: [
        {
          kind: 'workflow',
          ref: 'lens:boundary_sink_motion_inventory',
          title: 'Boundary/source-sink motion lens',
        },
      ],
      requiredChecks: [
        {
          id: 'check.theoretical-physics.boundary-sink-motion-inventory',
          kind: 'assumption_scope',
          severity: 'blocking',
          description:
            'Boundary/source-sink motion questions require the moving object, effective interaction surface, reachability or hitting condition, primary motion observables, model layers, and auxiliary diagnostics.',
        },
        {
          id: 'check.theoretical-physics.reachability-before-boundary-loss',
          kind: 'limiting_case',
          severity: 'blocking',
          description:
            'Before assigning boundary loss, check whether the matter reaches the true boundary or instead couples through a finite wall, cutoff surface, detector support, wave tail, or ensemble sink.',
        },
        {
          id: 'check.theoretical-physics.model-layer-motion-map',
          kind: 'assumption_scope',
          severity: 'blocking',
          description:
            'Separate point-particle/geodesic, field/wavepacket, kinetic/ensemble, effective open-system, and spectral-diagnostic layers, then state the reachability verdict and primary observable for each active layer before treating boundary motion, loss, or observables as the same object across them.',
        },
      ],
      actionAffordances: [
        {
          actionId: 'physics.apply_direction_lens',
          intent: 'required',
          reason:
            'Use the boundary_sink_motion_inventory lens when dynamics is controlled by a wall, boundary, source, sink, bath, detector, or absorbing channel.',
        },
        {
          actionId: 'validate.check_known_limit',
          intent: 'required',
          reason:
            'Reachability and known-limit checks prevent assuming boundary absorption where the moving object cannot hit the relevant surface.',
        },
        {
          actionId: 'validate.check_convention',
          intent: 'required',
          reason:
            'Model-layer conventions keep particle trajectories, field wavepackets, kinetic ensembles, open-system loss, and spectral diagnostics from being conflated.',
        },
        {
          actionId: 'source.extract_definition',
          intent: 'recommended',
          reason:
            'Extract trajectory/reflection, survival, hitting-time, particle/current, energy-flux, and absorption-rate observables before optional spectra.',
        },
      ],
      scope: {
        regimes: [
          'matter motion with boundary conditions',
          'open-system boundary channels',
          'source/sink or detector-coupled dynamics',
        ],
        assumptions: ['process guidance only; no domain-specific spacetime fact is validated by this capsule'],
        excludes: ['using spectral quantities as the primary object before motion observables are named'],
      },
      allowCrossDomain: true,
    },
    path: `${BUILTIN_PATH_PREFIX}/capsule-boundary-sink-motion.md`,
    source: 'builtin',
    body: [
      'When a physics question asks how matter moves under a boundary, wall, source,',
      'sink, bath, detector, or absorbing channel, first build a motion inventory.',
      'Name the moving object, the effective surface or support where interaction',
      'occurs, whether the object can reach or overlap that surface in the chosen',
      'model layer, and the primary observables. In the final framing, give a',
      'layer-by-layer reachability verdict for point-particle/geodesic, field',
      'wavepacket, kinetic/ensemble, effective open-system, and spectral-diagnostic',
      'layers when they are active. Prefer trajectory/reflection maps,',
      'survival probability, hitting-time distributions, particle number/current,',
      'energy flux, and absorption rates as primary outputs. Mark normal modes,',
      'QNM poles, spectra, and Green-function poles as auxiliary diagnostics unless',
      'the user explicitly makes them the primary target. Separate point-particle,',
      'field wavepacket, kinetic/ensemble, effective open-system, and spectral',
      'diagnostic layers before writing graph claims.',
    ].join(' '),
  },
  {
    metadata: {
      id: PROCESS_CAPSULE_IDS.scopeEvidence,
      kind: 'WorkflowRecipe',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      title: 'Scope, evidence, validation ladder',
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: [],
      sourceRefs: [BUILTIN_SOURCE_REF],
      graphRefs: [
        {
          kind: 'WorkflowRecipe',
          id: PROCESS_CAPSULE_IDS.scopeEvidence,
          relation: 'defines',
        },
      ],
      expansionHandles: [
        {
          kind: 'workflow',
          ref: GENERIC_THEORETICAL_PHYSICS_GENERAL_WORKFLOW_ID,
          title: 'General theoretical physics evidence loop',
        },
      ],
      requiredChecks: [
        {
          id: 'check.theoretical-physics.source-support-before-promotion',
          kind: 'assumption_scope',
          severity: 'blocking',
          description:
            'A reusable claim must carry explicit scope, assumptions, and source refs.',
        },
      ],
      actionAffordances: [
        {
          actionId: 'scope.open_work_frame',
          intent: 'required',
          reason: 'Keep each research topic isolated before collecting evidence.',
        },
        {
          actionId: 'scope.compile_context_pack',
          intent: 'required',
          reason: 'Bound context before deriving or editing.',
        },
      ],
      scope: {
        regimes: ['new theoretical physics topic'],
        assumptions: ['process guidance only; no domain-specific physics facts'],
      },
      allowCrossDomain: true,
    },
    path: `${BUILTIN_PATH_PREFIX}/capsule-scope-evidence.md`,
    source: 'builtin',
    body: [
      'For a new theoretical physics topic, first isolate the WorkFrame, then gather',
      'source-backed evidence, then extract definitions/formulas/assumptions, then',
      'validate obligations before any claim is promoted to reusable memory.',
    ].join('\n'),
  },
  {
    metadata: {
      id: PROCESS_CAPSULE_IDS.unsourcedOverclaim,
      kind: 'FailureMode',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      title: 'Unsourced or unscoped overclaim',
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: [],
      sourceRefs: [BUILTIN_SOURCE_REF],
      graphRefs: [
        {
          kind: 'FailureMode',
          id: PROCESS_CAPSULE_IDS.unsourcedOverclaim,
          relation: 'fails_under',
        },
      ],
      expansionHandles: [
        {
          kind: 'failure',
          ref: PROCESS_CAPSULE_IDS.unsourcedOverclaim,
          title: 'Unsourced or unscoped overclaim',
        },
      ],
      requiredChecks: [
        {
          id: 'check.theoretical-physics.no-validated-status-without-evidence',
          kind: 'assumption_scope',
          severity: 'blocking',
          description:
            'Do not report validated status when source support or scope checks are missing.',
        },
      ],
      actionAffordances: [
        {
          actionId: 'validate.check_source_support',
          intent: 'required',
          reason: 'Overclaims are prevented by explicit source-support checks.',
        },
        {
          actionId: 'memory.reject_or_downgrade',
          intent: 'recommended',
          reason: 'Failed or unsupported proposals should remain visible as negative memory.',
        },
      ],
      scope: {
        regimes: ['final answers', 'memory promotion', 'capsule proposals'],
        assumptions: ['process guidance only; no domain-specific physics facts'],
      },
      allowCrossDomain: true,
    },
    path: `${BUILTIN_PATH_PREFIX}/capsule-unsourced-overclaim.md`,
    source: 'builtin',
    body: [
      'Failure mode: the agent treats a provisional derivation, code result, or',
      'literature note as validated before source, scope, convention, and dependency',
      'checks have been recorded.',
    ].join('\n'),
  },
  {
    metadata: {
      id: PROCESS_CAPSULE_IDS.formulaValidation,
      kind: 'WorkflowRecipe',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      title: 'Formula validation contract',
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: [PROCESS_CAPSULE_IDS.scopeEvidence],
      sourceRefs: [BUILTIN_SOURCE_REF],
      graphRefs: [
        {
          kind: 'ValidationContract',
          id: PROCESS_CAPSULE_IDS.formulaValidation,
          relation: 'checks',
        },
      ],
      expansionHandles: [
        {
          kind: 'workflow',
          ref: PROCESS_CAPSULE_IDS.formulaValidation,
          title: 'Formula validation contract',
        },
      ],
      requiredChecks: [
        {
          id: 'check.theoretical-physics.dimension-convention-symbol',
          kind: 'dimension',
          severity: 'blocking',
          description:
            'Formula-like claims require dimension, convention, symbol, and dependency checks.',
        },
      ],
      actionAffordances: [
        {
          actionId: 'validate.check_dimension',
          intent: 'required',
          reason: 'Dimensional consistency is a first-pass formula sanity check.',
        },
        {
          actionId: 'validate.check_convention',
          intent: 'required',
          reason: 'Notation and normalization choices must be made explicit.',
        },
        {
          actionId: 'validate.check_symbol_consistency',
          intent: 'recommended',
          reason: 'Symbol closure prevents notation drift.',
        },
        {
          actionId: 'validate.check_dependency_closure',
          intent: 'required',
          reason: 'Derived claims need closed dependencies before promotion.',
        },
      ],
      scope: {
        regimes: ['formula extraction', 'derivation steps', 'formula-to-code mapping'],
        assumptions: ['process guidance only; no domain-specific physics facts'],
      },
      allowCrossDomain: true,
    },
    path: `${BUILTIN_PATH_PREFIX}/capsule-formula-validation.md`,
    source: 'builtin',
    body: [
      'Formula candidates should remain provisional until source support, dimension',
      'checks, convention checks, symbol closure, and dependency closure are recorded.',
    ].join('\n'),
  },
] as const satisfies readonly PhysicsCapsule[];

export const BUILTIN_THEORETICAL_PHYSICS_EVAL_CASES = [
  {
    path: `${BUILTIN_PATH_PREFIX}/eval-evidence-loop.md`,
    source: 'builtin',
    body: [
      'Built-in smoke eval for the generic theoretical physics evidence loop.',
      'It checks that a research turn can open a WorkFrame, compile context, collect',
      'source evidence, and avoid validated overclaims without support.',
    ].join('\n'),
    sourceRefs: [BUILTIN_SOURCE_REF],
    evalCase: {
      id: GENERIC_THEORETICAL_PHYSICS_EVAL_ID,
      title: 'Generic theoretical physics evidence loop',
      task:
        'Open a scoped theoretical-physics WorkFrame, compile context, search or capture source evidence, and end without unsupported validated claims.',
      domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
      capsuleRefs: [
        PROCESS_CAPSULE_IDS.scopeEvidence,
        PROCESS_CAPSULE_IDS.unsourcedOverclaim,
      ],
      actionSequence: [
        'scope.open_work_frame',
        'scope.compile_context_pack',
        'source.search_literature',
        'source.capture_source_excerpt',
        'validate.check_source_support',
      ],
      validations: [
        {
          type: 'forbidden_claim',
          pattern: 'validated without evidence',
        },
      ],
      timeoutSeconds: 300,
    },
  },
] as const satisfies readonly FileBackedResearchEvalCase[];

export function registerBuiltinTheoreticalPhysicsDefaults(input: {
  readonly domainProfiles?: DomainProfileRegistry | null | undefined;
  readonly workflowRecipes?: WorkflowRecipeRegistry | null | undefined;
  readonly physicsMemory?: PhysicsMemoryRegistry | null | undefined;
  readonly researchHarness?: ResearchEvalCaseRegistry | null | undefined;
}): void {
  for (const profile of BUILTIN_THEORETICAL_PHYSICS_DOMAIN_PROFILES) {
    if (input.domainProfiles?.getProfile(profile.metadata.id) === undefined) {
      input.domainProfiles?.register(profile);
    }
  }
  for (const recipe of BUILTIN_THEORETICAL_PHYSICS_WORKFLOW_RECIPES) {
    if (input.workflowRecipes?.getRecipe(recipe.metadata.id) === undefined) {
      input.workflowRecipes?.register(recipe);
    }
  }
  for (const capsule of BUILTIN_THEORETICAL_PHYSICS_CAPSULES) {
    if (input.physicsMemory?.getCapsule(capsule.metadata.id) === undefined) {
      input.physicsMemory?.register(capsule);
    }
  }
  for (const evalCase of BUILTIN_THEORETICAL_PHYSICS_EVAL_CASES) {
    if (input.researchHarness?.getEvalCase(evalCase.evalCase.id) === undefined) {
      input.researchHarness?.register(evalCase);
    }
  }
}

export function isGenericTheoreticalPhysicsProfileId(id: string): boolean {
  return id === GENERIC_THEORETICAL_PHYSICS_PROFILE_ID;
}

export function isGenericTheoreticalPhysicsWorkflowId(id: string): boolean {
  return (
    id === GENERIC_THEORETICAL_PHYSICS_GENERAL_WORKFLOW_ID ||
    id === GENERIC_THEORETICAL_PHYSICS_COMPUTATIONAL_WORKFLOW_ID
  );
}

export function isGenericTheoreticalPhysicsCapsuleId(id: string): boolean {
  return Object.values(PROCESS_CAPSULE_IDS).includes(
    id as (typeof PROCESS_CAPSULE_IDS)[keyof typeof PROCESS_CAPSULE_IDS],
  );
}

export function shouldUseGenericTheoreticalPhysicsFallback(input: {
  readonly domain: string;
  readonly exactCount: number;
}): boolean {
  return (
    input.exactCount === 0 &&
    input.domain !== GENERIC_THEORETICAL_PHYSICS_DOMAIN
  );
}

export function hasComputationalResearchIntent(frame: Pick<WorkFrame, 'topic' | 'goal'>): boolean {
  const text = `${frame.topic} ${frame.goal}`.toLowerCase();
  return COMPUTATIONAL_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

function binding(
  suffix: string,
  actionId: string,
  priority: ResearchActionBinding['priority'],
): ResearchActionBinding {
  return {
    id: `binding.theoretical-physics.${suffix}`,
    actionId,
    domainId: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
    workflowId: actionId.startsWith('code.') || actionId.startsWith('benchmark.')
      ? GENERIC_THEORETICAL_PHYSICS_COMPUTATIONAL_WORKFLOW_ID
      : GENERIC_THEORETICAL_PHYSICS_GENERAL_WORKFLOW_ID,
    priority,
  };
}

function lensBinding(
  suffix: string,
  actionId: string,
  lensId: string,
  checkId: string,
  priority: ResearchActionBinding['priority'],
): ResearchActionBinding {
  return {
    ...binding(suffix, actionId, priority),
    lensId,
    checkId,
  };
}

const COMPUTATIONAL_INTENT_PATTERNS = [
  /\bcode\b/u,
  /\bpatch\b/u,
  /\bedit\b/u,
  /\bimplement/u,
  /\bdebug/u,
  /\bbug\b/u,
  /\btest\b/u,
  /\bbenchmark/u,
  /\bhpc\b/u,
  /\bcluster\b/u,
  /\bscheduler\b/u,
  /\bslurm\b/u,
  /\bsbatch\b/u,
  /\bsubmit\b/u,
  /\bjob\b/u,
  /\u4ee3\u7801/u,
  /\u6539\u4ee3\u7801/u,
  /\u5b9e\u73b0/u,
  /\u8c03\u8bd5/u,
  /\u6d4b\u8bd5/u,
  /\u57fa\u51c6/u,
  /\u63d0\u4ea4/u,
  /\u4efb\u52a1/u,
  /\u4f5c\u4e1a/u,
  /\u96c6\u7fa4/u,
  /\u8fd0\u884c/u,
];
