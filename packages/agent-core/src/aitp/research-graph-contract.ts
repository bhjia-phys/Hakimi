export type ResearchGraphSurfaceOwner = 'aitp' | 'hakimi';

export type ResearchGraphSurfaceAuthority =
  | 'canonical_truth'
  | 'derived_readonly'
  | 'runtime_controller'
  | 'heuristic_context'
  | 'compat_projection'
  | 'hidden_eval';

export type ResearchGraphApiStatus =
  | 'current'
  | 'compatibility'
  | 'deprecate_after_migration'
  | 'test_only';

export interface ResearchGraphBoundarySurface {
  readonly id: string;
  readonly owner: ResearchGraphSurfaceOwner;
  readonly authority: ResearchGraphSurfaceAuthority;
  readonly apiStatus: ResearchGraphApiStatus;
  readonly role: string;
  readonly canonicalTruth: boolean;
  readonly normalReadPath: readonly string[];
  readonly normalWritePath: readonly string[];
  readonly mayCreateTypedRecords: boolean;
  readonly mayUpdateClaimTrust: boolean;
  readonly replacement?: string | undefined;
  readonly boundaryRules: readonly string[];
}

export const HAKIMI_AITP_RESEARCH_GRAPH_CONTRACT: readonly ResearchGraphBoundarySurface[] = [
  {
    id: 'aitp.typed-record-kernel',
    owner: 'aitp',
    authority: 'canonical_truth',
    apiStatus: 'current',
    role: 'Canonical topic/session/claim/evidence/tool/object/proof-obligation graph.',
    canonicalTruth: true,
    normalReadPath: ['AITP MCP aitp_v5_*', 'aitp-v5 CLI fallback'],
    normalWritePath: ['AITP typed write bridge', 'AITP MCP aitp_v5_*', 'aitp-v5 CLI fallback'],
    mayCreateTypedRecords: true,
    mayUpdateClaimTrust: true,
    boundaryRules: [
      'Only AITP typed records can become durable research graph facts.',
      'Claim-trust changes require AITP trust preflight and explicit allowed entrypoints.',
    ],
  },
  {
    id: 'aitp.execution-brief',
    owner: 'aitp',
    authority: 'derived_readonly',
    apiStatus: 'current',
    role: 'Recovery brief for current focus, blockers, obligations, evidence coverage, and next actions.',
    canonicalTruth: false,
    normalReadPath: ['aitp_v5_get_execution_brief', 'aitp-v5 brief <session-id>'],
    normalWritePath: [],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'Derived from typed records and must not be cited as evidence by itself.',
      'Use it before promotion, trust changes, or research-session restoration.',
    ],
  },
  {
    id: 'aitp.process-graph-slice',
    owner: 'aitp',
    authority: 'derived_readonly',
    apiStatus: 'current',
    role: 'Read-only process graph projection over typed records for action selection and recovery.',
    canonicalTruth: false,
    normalReadPath: ['aitp_v5_get_process_graph_slice', 'aitp-v5 graph slice <session-id>'],
    normalWritePath: [],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'Orientation-only graph view; it cannot promote a claim or satisfy a final gate.',
      'Use referenced typed record ids when a durable fact is needed.',
    ],
  },
  {
    id: 'aitp.claim-relation-map',
    owner: 'aitp',
    authority: 'derived_readonly',
    apiStatus: 'current',
    role: 'Conclusion-boundary surface explaining support, limits, non-testing failures, blockers, and next valid actions.',
    canonicalTruth: false,
    normalReadPath: ['aitp_v5_get_claim_relation_map', 'aitp-v5 relation-map <session-id>'],
    normalWritePath: [],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'Never treat application/runtime failures as algorithm evidence without a typed relation saying so.',
      'Can-say/cannot-say lines are recovery guidance, not new evidence records.',
    ],
  },
  {
    id: 'aitp.curated-rag',
    owner: 'aitp',
    authority: 'heuristic_context',
    apiStatus: 'current',
    role: 'Curated lecture/review/background corpus for heuristic orientation and source-discovery hints.',
    canonicalTruth: false,
    normalReadPath: [
      'aitp_v5_get_curated_rag_corpus',
      'aitp_v5_search_curated_rag_corpus',
      'aitp_v5_get_curated_rag_chunk',
    ],
    normalWritePath: ['aitp_v5_ingest_curated_rag_corpus'],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'Retrieval is not evidence, validation, final-gate satisfaction, or claim support.',
      'Claim support requires explicit promotion into source/evidence/validation/trust-preflight records.',
    ],
  },
  {
    id: 'hakimi.workframe',
    owner: 'hakimi',
    authority: 'runtime_controller',
    apiStatus: 'current',
    role: 'Runtime research scope: active domain, topic, goal, source refs, and attached ContextPack.',
    canonicalTruth: false,
    normalReadPath: ['Hakimi WorkFrame manager'],
    normalWritePath: ['ResearchAction.open_work_frame', 'ResearchAction.switch_work_frame'],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'A WorkFrame scopes model attention and AITP reads; it is not a canonical topic/session record.',
      'Durable research state must be written through AITP typed entrypoints.',
    ],
  },
  {
    id: 'hakimi.context-pack',
    owner: 'hakimi',
    authority: 'runtime_controller',
    apiStatus: 'current',
    role: 'Compiled per-turn context combining domain prompts, AITP views, curated RAG, and action bindings.',
    canonicalTruth: false,
    normalReadPath: ['ResearchAction.compile_context_pack', 'ResearchAction.load_context_pack'],
    normalWritePath: [],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'ContextPack text is bounded working context, not durable truth.',
      'It may carry AITP ids and recommended actions but does not execute writes.',
    ],
  },
  {
    id: 'hakimi.research-action',
    owner: 'hakimi',
    authority: 'runtime_controller',
    apiStatus: 'current',
    role: 'Semantic action router, audit wrapper, and explicit AITP write-bridge executor.',
    canonicalTruth: false,
    normalReadPath: ['ResearchAction.list_actions', 'ResearchAction.inspect_*'],
    normalWritePath: ['ResearchAction.execute_aitp_write_bridge'],
    mayCreateTypedRecords: true,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'May call configured AITP write bridges, but does not define a separate Hakimi truth store.',
      'Draft/readiness actions are read-only until an explicit execute action is called.',
    ],
  },
  {
    id: 'hakimi.research-ledger',
    owner: 'hakimi',
    authority: 'compat_projection',
    apiStatus: 'deprecate_after_migration',
    role: 'Legacy/session-local note ledger for compact observations not yet migrated to AITP typed records.',
    canonicalTruth: false,
    normalReadPath: ['ResearchLedger.list_events', 'ResearchLedger.load_event'],
    normalWritePath: ['ResearchLedger.write_event', 'ResearchLedger.capture_event'],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    replacement: 'AITP typed evidence/tool_run/artifact/exploratory_record records',
    boundaryRules: [
      'Ledger events are source-backed scratch/provenance notes, not canonical AITP evidence.',
      'New durable research facts should be written through AITP typed entrypoints.',
      'Keep this surface for compatibility and migration review only.',
    ],
  },
  {
    id: 'hakimi.physics-memory',
    owner: 'hakimi',
    authority: 'compat_projection',
    apiStatus: 'deprecate_after_migration',
    role: 'Legacy/local capsule graph used for domain fixtures, prompts, and migration candidates.',
    canonicalTruth: false,
    normalReadPath: ['PhysicsMemory.list_capsules', 'PhysicsMemory.compile_context'],
    normalWritePath: ['PhysicsMemory.promote_candidate'],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    replacement: 'AITP typed records plus curated RAG and process-graph/relation-map projections',
    boundaryRules: [
      'Capsules can orient Hakimi but cannot override AITP typed records.',
      'Promotion is a local compatibility operation and must not be described as claim trust.',
      'Use AITP source/evidence/validation records for durable scientific claims.',
    ],
  },
  {
    id: 'hakimi.workflow-recipe',
    owner: 'hakimi',
    authority: 'runtime_controller',
    apiStatus: 'current',
    role: 'Local action-affordance templates for ergonomic ResearchAction planning.',
    canonicalTruth: false,
    normalReadPath: ['workflow recipe registry'],
    normalWritePath: [],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'Recipes suggest actions and required tools only.',
      'Recipe success must be recorded through ResearchAction and AITP typed records when durable.',
    ],
  },
  {
    id: 'hakimi.domain-profile',
    owner: 'hakimi',
    authority: 'runtime_controller',
    apiStatus: 'current',
    role: 'Domain/lens prompt profile used to compile ContextPacks and object-discovery hints.',
    canonicalTruth: false,
    normalReadPath: ['domain profile registry', 'physics direction packs'],
    normalWritePath: [],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'Domain profiles train attention; they do not prove claims.',
      'Conflicts with AITP typed records must be resolved in favor of AITP.',
    ],
  },
  {
    id: 'hakimi.eval-harness',
    owner: 'hakimi',
    authority: 'hidden_eval',
    apiStatus: 'test_only',
    role: 'Hidden rubric and real-session audit loop used to improve Hakimi behavior without leaking answers.',
    canonicalTruth: false,
    normalReadPath: ['scripts/hakimi-real-session-audit.mjs'],
    normalWritePath: [],
    mayCreateTypedRecords: false,
    mayUpdateClaimTrust: false,
    boundaryRules: [
      'Rubrics are analyzer-only and must never be inserted into normal model prompts.',
      'Eval reports can diagnose tool use and answers but are not scientific evidence.',
    ],
  },
] as const;

export function getResearchGraphBoundarySurface(
  id: string,
): ResearchGraphBoundarySurface | undefined {
  return HAKIMI_AITP_RESEARCH_GRAPH_CONTRACT.find((surface) => surface.id === id);
}

export function canonicalResearchGraphSurfaces(): readonly ResearchGraphBoundarySurface[] {
  return HAKIMI_AITP_RESEARCH_GRAPH_CONTRACT.filter((surface) => surface.canonicalTruth);
}

export function compatibilityResearchGraphSurfaces(): readonly ResearchGraphBoundarySurface[] {
  return HAKIMI_AITP_RESEARCH_GRAPH_CONTRACT.filter(
    (surface) => surface.apiStatus === 'compatibility' || surface.apiStatus === 'deprecate_after_migration',
  );
}

export function renderResearchGraphBoundaryContract(): string {
  const lines = ['Hakimi/AITP research graph boundary contract:'];
  for (const surface of HAKIMI_AITP_RESEARCH_GRAPH_CONTRACT) {
    lines.push(
      `- ${surface.id}: owner=${surface.owner}; authority=${surface.authority}; status=${surface.apiStatus}; canonical=${String(surface.canonicalTruth)}; trust_update=${String(surface.mayUpdateClaimTrust)}`,
    );
    if (surface.replacement !== undefined) {
      lines.push(`  replacement: ${surface.replacement}`);
    }
  }
  return lines.join('\n');
}
