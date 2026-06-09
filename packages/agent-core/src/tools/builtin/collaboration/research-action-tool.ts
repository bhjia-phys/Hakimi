import { createHash } from 'node:crypto';

import { z } from 'zod';

import type {
  LoadedResearchEvidenceRef,
  ResearchActionManager,
  ResearchEvidenceFilter,
} from '../../../agent/research-action';
import type { BuiltinTool } from '../../../agent/tool';
import { ToolAccesses } from '../../../loop/tool-access';
import type {
  ExecutableToolContext,
  ExecutableToolResult,
  ToolExecution,
} from '../../../loop/types';
import {
  DEFAULT_RESEARCH_ACTIONS,
  ResearchActionRegistry,
  ResearchPrimitivePlanRegistry,
  asActionAlgebraDefinition,
  buildPrimitivePlanForAction,
  recommendResearchActions,
  registerDefaultResearchPrimitivePlanTemplates,
  type ResearchActionCategory,
  type ResearchActionDefinition,
  type ResearchActionExposure,
  type ResearchActionOutcome,
  type ResearchActionSource,
  type ResearchPrimitivePlanTemplate,
  type ResearchObligation,
  type WorkFrame,
} from '../../../research-action';
import {
  PHYSICS_CAPSULE_KINDS,
  RELIABILITY_STATES,
  type GraphRef,
  type PhysicsRelationType,
} from '../../../physics-memory';
import {
  AITP_WRITE_BRIDGE_OPERATIONS,
  actionIdForAitpWriteBridgeOperation,
  aitpRuntimeBridgeTargetForOperation,
  aitpRuntimePayloadProfileById,
  buildPrimitiveToolLifecycleAitpToolRunPayload,
  coerceAitpWriteBridgeInput,
  evidenceRefsForAitpWriteBridgeResult,
  PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
  renderTheoryReasoningSummary,
  theoryReasoningProjectionFromParams,
  type AitpCuratedRagCorpus,
  type AitpCuratedRagChunkLookup,
  type AitpCuratedRagPromotionDraft,
  type AitpCuratedRagPromotionDraftOperation,
  type AitpCuratedRagSearchResult,
  type AitpRecordRefLookup,
  type AitpRecordRefLookupItem,
  type AitpRuntimePayloadProfilesCatalog,
  type AitpWriteBridgeExecutionResult,
  type AitpWriteBridgeOperation,
} from '../../../aitp';
import type { BenchmarkAdapterOutcome, BenchmarkAdapterRunResult } from '../../../benchmark-adapter';
import type { DomainPackManifestDiagnostic } from '../../../domain-pack';
import type { FormalizationPlan } from '../../../formalization';
import {
  findPhysicsGraphPath,
  queryPhysicsGraphContradictions,
  queryPhysicsGraphDependencyClosure,
  queryPhysicsGraphNeighborhood,
  type PhysicsGraphEdge,
  type PhysicsGraphPathResult,
  type PhysicsGraphQueryResult,
} from '../../../physics-graph';
import type { ResearchContextPack } from '../../../research-context';
import {
  RESEARCH_LEDGER_EVENT_STATUSES,
  type ResearchLedgerEvent,
} from '../../../research-ledger';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './research-action-tool.md';

const ACTIONS = [
  'list_actions',
  'plan_primitive_tools',
  'recommend_next_actions',
  'record_action_result',
  'open_work_frame',
  'switch_work_frame',
  'close_work_frame',
  'list_work_frames',
  'start_action_call',
  'finish_action_call',
  'compile_context_pack',
  'list_context_packs',
  'load_context_pack',
  'inspect_domain_pack',
  'list_evidence_refs',
  'load_evidence_ref',
  'run_benchmark_adapter',
  'query_physics_graph',
  'build_formalization_plan',
  'execute_aitp_write_bridge',
  'inspect_aitp_write_bridge_handoff_readiness',
  'inspect_handoff_guard_remediation_taxonomy',
  'inspect_aitp_runtime_payload_profiles',
  'inspect_aitp_curated_rag_corpus',
  'search_aitp_curated_rag_corpus',
  'inspect_aitp_curated_rag_chunk',
  'draft_aitp_curated_rag_promotion',
  'draft_aitp_curated_rag_write_bridge_call',
  'draft_aitp_record_ref_repair_write_bridge_call',
  'capture_primitive_tool_run',
] as const;
const EXPOSURES = ['direct', 'deferred', 'direct-model-only', 'hidden'] as const;
const CATEGORIES = ['graph', 'derivation', 'physics', 'code', 'benchmark', 'memory', 'harness'] as const;
const OUTCOMES = ['pass', 'fail', 'blocked', 'inconclusive'] as const;
const SOURCES = ['model', 'controller', 'hidden-check', 'subagent', 'replay'] as const;
const BRIDGE_POLICIES = ['deny', 'explicit-only', 'allow'] as const;
const GRAPH_QUERIES = ['dependency_closure', 'neighborhood', 'path', 'contradictions'] as const;
const GRAPH_DIRECTIONS = ['in', 'out', 'both'] as const;
const OBLIGATION_KINDS = [
  'source_support',
  'dimension_check',
  'convention_check',
  'symbol_closure',
  'dependency_closure',
  'known_limit',
  'code_mapping',
  'benchmark',
  'human_decision',
] as const;
const OBLIGATION_SEVERITIES = ['blocking', 'important', 'advisory'] as const;
const PROMOTION_DRAFT_STAGES = [
  'source_asset',
  'reference_location',
  'evidence',
  'validation',
  'trust_preflight',
] as const;
const PROMOTION_DRAFT_WRITE_OPERATIONS = [
  'registerSourceAsset',
  'recordReferenceLocation',
  'recordEvidence',
  'createValidationContract',
  'preflightTrustUpdate',
] as const;
const RECORD_REF_REPAIR_WRITE_OPERATIONS = [
  'registerSourceAsset',
  'recordReferenceLocation',
] as const;

const GraphRefSchema = z.object({
  kind: z.string(),
  id: z.string(),
  relation: z.string().optional(),
});

const ObligationSchema = z.object({
  id: z.string(),
  kind: z.enum(OBLIGATION_KINDS),
  domain: z.string(),
  topic: z.string(),
  targetObjectId: z.string(),
  severity: z.enum(OBLIGATION_SEVERITIES),
  reason: z.string(),
  requiredActionId: z.string(),
  status: z.enum(['open', 'passed', 'failed', 'waived']),
});

export const ResearchActionToolInputSchema = z.object({
  action: z.enum(ACTIONS).describe('The research-action operation to perform.'),
  category: z.enum(CATEGORIES).optional().describe('Optional action category filter.'),
  exposure: z.enum(EXPOSURES).optional().describe('Optional action exposure filter.'),
  domain: z.string().optional().describe('Optional action domain filter.'),
  topic: z.string().optional().describe('Topic id for WorkFrame operations.'),
  goal: z.string().optional().describe('Goal text for open_work_frame.'),
  frame_id: z.string().optional().describe('WorkFrame id for WorkFrame operations.'),
  context_pack_id: z.string().optional().describe('Optional context pack id for open_work_frame.'),
  action_binding_id: z
    .string()
    .optional()
    .describe('Optional ContextPack action binding id for executing a bound read-only action.'),
  evidence_ref: z
    .string()
    .optional()
    .describe('Evidence ref for load_evidence_ref, for example ledger:event.id.'),
  include_body: z
    .boolean()
    .optional()
    .describe('Whether load_evidence_ref should include the ledger event body.'),
  attach_context_pack: z
    .boolean()
    .optional()
    .describe('Whether compile_context_pack should attach the pack to the WorkFrame.'),
  reliability_floor: z
    .enum(RELIABILITY_STATES)
    .optional()
    .describe('Minimum physics memory reliability for compile_context_pack.'),
  bridge_policy: z
    .enum(BRIDGE_POLICIES)
    .optional()
    .describe('Cross-domain bridge policy for compile_context_pack.'),
  include_ledger_statuses: z
    .array(z.enum(RESEARCH_LEDGER_EVENT_STATUSES))
    .optional()
    .describe('Research ledger statuses included in compile_context_pack.'),
  max_capsules: z.number().int().positive().optional().describe('Maximum capsule summaries.'),
  max_ledger_proposals: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum ledger proposal summaries.'),
  max_action_bindings: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum action binding summaries.'),
  active_object_ids: z.array(z.string()).optional().describe('Active object ids for open_work_frame.'),
  assumption_ids: z.array(z.string()).optional().describe('Assumption ids for open_work_frame.'),
  convention_ids: z.array(z.string()).optional().describe('Convention ids for open_work_frame.'),
  source_refs: z.array(z.string()).optional().describe('Source refs for open_work_frame.'),
  capsule_kind: z.enum(PHYSICS_CAPSULE_KINDS).optional().describe('Optional capsule kind filter.'),
  obligations: z
    .array(ObligationSchema)
    .optional()
    .describe('Open and closed obligations for recommend_next_actions.'),
  limit: z.number().int().positive().optional().describe('Maximum recommendations to return.'),
  action_id: z
    .string()
    .optional()
    .describe('Action id for plan_primitive_tools, record_action_result, or executor attribution.'),
  call_id: z
    .string()
    .optional()
    .describe(
      'Semantic action call id for start_action_call, finish_action_call, or record_action_result. If omitted, Hakimi infers one from the active action call or current tool call.',
    ),
  source: z.enum(SOURCES).optional().describe('Action source for record_action_result.'),
  outcome: z.enum(OUTCOMES).optional().describe('Action outcome for record_action_result.'),
  graph_refs: z.array(GraphRefSchema).optional().describe('Graph refs touched by the action.'),
  capsule_refs: z.array(z.string()).optional().describe('Capsule refs touched by the action.'),
  evidence_refs: z.array(z.string()).optional().describe('Evidence refs produced by the action.'),
  ledger_event_ids: z.array(z.string()).optional().describe('Ledger event ids produced or used by the action.'),
  generated_obligation_ids: z
    .array(z.string())
    .optional()
    .describe('Obligation ids generated by the action.'),
  primitive_tool_call_ids: z
    .array(z.string())
    .optional()
    .describe('Primitive tool call ids attributed to the action.'),
  primitive_tool_call_id: z
    .string()
    .optional()
    .describe('Single primitive tool call id for capture_primitive_tool_run.'),
  next_suggested_actions: z
    .array(z.string())
    .optional()
    .describe('Follow-up action ids suggested by the action.'),
  action_input: z.unknown().optional().describe('Optional structured input for start_action_call.'),
  action_output: z.unknown().optional().describe('Optional structured output for finish_action_call.'),
  adapter_id: z.string().optional().describe('Benchmark adapter id for run_benchmark_adapter.'),
  benchmark_case_id: z.string().optional().describe('Optional case id for run_benchmark_adapter.'),
  benchmark_payload: z.unknown().optional().describe('Structured benchmark payload.'),
  graph_query: z.enum(GRAPH_QUERIES).optional().describe('Physics graph query to run.'),
  start_ids: z.array(z.string()).optional().describe('Graph start node ids.'),
  from_id: z.string().optional().describe('Source node id for graph path queries.'),
  to_id: z.string().optional().describe('Target node id for graph path queries.'),
  relation_types: z.array(z.string()).optional().describe('Optional physics relation filters.'),
  direction: z.enum(GRAPH_DIRECTIONS).optional().describe('Graph traversal direction.'),
  max_depth: z.number().int().positive().optional().describe('Maximum graph traversal depth.'),
  formalization_target_ids: z
    .array(z.string())
    .optional()
    .describe('Target graph node ids for build_formalization_plan.'),
  include_dependency_closure: z
    .boolean()
    .optional()
    .describe('Whether build_formalization_plan should include dependency closure.'),
  aitp_operation: z
    .enum(AITP_WRITE_BRIDGE_OPERATIONS)
    .optional()
    .describe('AITP write bridge operation for execute_aitp_write_bridge.'),
  aitp_payload: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Structured payload for execute_aitp_write_bridge.'),
  aitp_handoff: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Optional curated RAG or record-ref repair handoff artifact for execute_aitp_write_bridge or inspect_aitp_write_bridge_handoff_readiness. When provided, Hakimi verifies the handoff status, hash, and embedded tool call before execution.',
    ),
  rag_query: z
    .string()
    .optional()
    .describe('Search query for AITP curated heuristic RAG lookup.'),
  rag_limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum AITP curated heuristic RAG search results.'),
  rag_chunk_id: z
    .string()
    .optional()
    .describe('Curated RAG chunk id for AITP chunk inspection or promotion draft planning.'),
  aitp_topic_id: z
    .string()
    .optional()
    .describe('Optional AITP topic id for read-only promotion draft planning.'),
  aitp_claim_id: z
    .string()
    .optional()
    .describe('Optional AITP claim id for read-only promotion draft planning.'),
  aitp_connector_id: z
    .string()
    .optional()
    .describe('Optional AITP connector id for read-only promotion draft planning.'),
  aitp_promotion_intent: z
    .string()
    .optional()
    .describe('Optional intent label for read-only curated RAG promotion draft planning.'),
  promotion_draft_stage: z
    .enum(PROMOTION_DRAFT_STAGES)
    .optional()
    .describe('Selected curated RAG promotion draft stage for prefilled write-bridge call drafting.'),
  promotion_draft_operation: z
    .enum(PROMOTION_DRAFT_WRITE_OPERATIONS)
    .optional()
    .describe('Selected curated RAG promotion draft operation for prefilled write-bridge call drafting.'),
  promotion_reviewed_overrides: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Reviewed top-level payload field overrides for draft_aitp_curated_rag_write_bridge_call. These only update the returned call draft; they do not execute an AITP write.',
    ),
  promotion_carried_refs: z
    .array(z.string())
    .optional()
    .describe(
      'Canonical refs from earlier explicit curated RAG promotion writes. These render copyable reviewed-override suggestions only; they do not modify the returned payload or execute AITP writes.',
    ),
  promotion_carried_ref_handoffs: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe(
      'Carried-ref handoff objects from earlier explicit curated RAG promotion writes. These render copyable reviewed-override suggestions only; they do not modify the returned payload or execute AITP writes.',
    ),
  repair_ref: z
    .string()
    .optional()
    .describe('Missing AITP record ref being repaired by draft_aitp_record_ref_repair_write_bridge_call.'),
  repair_operation: z
    .enum(RECORD_REF_REPAIR_WRITE_OPERATIONS)
    .optional()
    .describe('AITP repair operation for draft_aitp_record_ref_repair_write_bridge_call. Supports registerSourceAsset and recordReferenceLocation.'),
  repair_reason: z
    .string()
    .optional()
    .describe('Optional AITP lookup repair reason copied from suggested_next_reason.'),
});

export type ResearchActionToolInput = z.Infer<typeof ResearchActionToolInputSchema>;

interface GraphSuccessOutput {
  readonly isError?: false | undefined;
  readonly outcome: ResearchActionOutcome;
  readonly nodeIds: readonly string[];
  readonly payload: unknown;
  readonly text: string;
}

type ExecutableGraphOutput = GraphSuccessOutput | ExecutableToolResult;

interface EvidenceScope {
  readonly source: 'work_frame' | 'explicit';
  readonly filter: ResearchEvidenceFilter;
}

interface CuratedRagPromotionDraftBindingInput {
  readonly ragChunkId: string;
  readonly aitpTopicId?: string | undefined;
  readonly aitpClaimId?: string | undefined;
  readonly aitpConnectorId?: string | undefined;
  readonly aitpPromotionIntent?: string | undefined;
}

interface CuratedRagPromotionWriteBridgeCallSelector {
  readonly stage?: string | undefined;
  readonly operation?: string | undefined;
}

interface CuratedRagPromotionWriteBridgeCallDraft {
  readonly stage: string;
  readonly draftOperation: string;
  readonly aitpOperation: AitpWriteBridgeOperation;
  readonly actionId: string;
  readonly selectedOperation: AitpCuratedRagPromotionDraftOperation;
  readonly originalPayload: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly payloadSource: 'payload_draft' | 'payload_template' | 'empty_payload';
  readonly reviewedOverrides: Readonly<Record<string, unknown>>;
  readonly requiredExistingRecords: readonly string[];
  readonly diagnostics: readonly CuratedRagPromotionWriteBridgeCallDiagnostic[];
  readonly overrideDiagnostics: readonly CuratedRagPromotionWriteBridgeCallDiagnostic[];
  readonly originalUnresolvedPlaceholderCount: number;
  readonly unresolvedPlaceholderCount: number;
  readonly recordRefLookup?: CuratedRagPayloadRefLookup | undefined;
  readonly carriedRefSuggestion?: CuratedRagCarriedRefOverrideSuggestion | undefined;
}

type CuratedRagPayloadRefLookup =
  | {
      readonly status: 'not_requested';
      readonly reason: string;
    }
  | {
      readonly status: 'performed';
      readonly lookup: AitpRecordRefLookup;
    }
  | {
      readonly status: 'failed';
      readonly reason: string;
    };

interface CuratedRagPromotionWriteBridgeCallDiagnostic {
  readonly code: string;
  readonly field?: string | undefined;
  readonly message: string;
}

interface CuratedRagCarriedRefOverrideSuggestion {
  readonly selectedStage: string;
  readonly selectedOperation: string;
  readonly refs: readonly string[];
  readonly usedRefs: readonly string[];
  readonly unusedRefs: readonly string[];
  readonly suggestedOverrides: Readonly<Record<string, unknown>>;
  readonly targetField: string;
  readonly reason: string;
  readonly appliedByReviewedOverride: boolean;
}

interface CuratedRagPromotionWriteBridgeConfirmationSummary {
  readonly status: 'blocked' | 'needs_explicit_confirmation' | 'ready_for_explicit_execute';
  readonly hardBlockingDiagnostics: readonly CuratedRagPromotionWriteBridgeCallDiagnostic[];
  readonly confirmationRequiredDiagnostics: readonly CuratedRagPromotionWriteBridgeCallDiagnostic[];
  readonly advisoryDiagnostics: readonly CuratedRagPromotionWriteBridgeCallDiagnostic[];
  readonly missingRefRepairHintCount: number;
  readonly executeCallAllowedAfterExplicitConfirmation: boolean;
  readonly nextStep: string;
}

interface AitpWriteBridgeToolCallDraft {
  readonly action: 'execute_aitp_write_bridge';
  readonly aitp_operation: AitpWriteBridgeOperation;
  readonly aitp_payload: unknown;
}

interface CuratedRagPromotionWriteBridgeHandoffArtifact {
  readonly handoffId: string;
  readonly confirmationId: string;
  readonly diagnosticHash: string;
  readonly confirmationStatus: CuratedRagPromotionWriteBridgeConfirmationSummary['status'];
  readonly toolCall: AitpWriteBridgeToolCallDraft;
  readonly hashInput: Readonly<Record<string, unknown>>;
  readonly nonExecutionProvenance: Readonly<Record<string, unknown>>;
}

interface AitpHandoffGuard {
  readonly kind: 'curated_rag_write_bridge_handoff' | 'record_ref_repair_write_bridge_handoff';
  readonly handoffId: string;
  readonly confirmationId: string;
  readonly diagnosticHash: string;
  readonly confirmationStatus: string;
  readonly selectedAitpOperation: string;
  readonly chunkId?: string | undefined;
  readonly documentId?: string | undefined;
  readonly stage?: string | undefined;
  readonly draftOperation?: string | undefined;
  readonly missingRefRepairHintCount: number;
  readonly missingRefRepairChecklistPresent: boolean;
  readonly repairHintOperations: readonly string[];
  readonly selectedWriteDiffersFromRepairHints: boolean;
}

interface AitpHandoffGuardFailure {
  readonly code: HandoffGuardFailureCode;
  readonly field?: string | undefined;
  readonly path?: string | undefined;
  readonly remediation: {
    readonly nextStep: HandoffGuardRemediationStep;
    readonly repairTarget: string;
  };
}

type HandoffGuardFailureCode =
  | 'blocked_handoff'
  | 'diagnostic_hash_mismatch'
  | 'hash_input_confirmation_status_mismatch'
  | 'hash_input_operation_mismatch'
  | 'hash_input_tool_call_mismatch'
  | 'invalid_diagnostic_hash_algorithm'
  | 'missing_confirmation_id'
  | 'missing_confirmation_status'
  | 'missing_diagnostic_hash'
  | 'missing_handoff_id'
  | 'missing_hash_input_json'
  | 'missing_tool_call_json'
  | 'missing_tool_call_payload'
  | 'tool_call_action_mismatch'
  | 'tool_call_operation_mismatch'
  | 'tool_call_payload_mismatch'
  | 'unsupported_confirmation_status';

type HandoffGuardRemediationStep =
  | 'align_explicit_execute_args_with_handoff_tool_call'
  | 'copy_missing_handoff_field_from_draft'
  | 'inspect_handoff_guard_failure'
  | 'redraft_handoff_or_restore_hash_input'
  | 'redraft_or_resolve_blocking_diagnostics';

type CarriedRefHandoffFailureCode =
  | 'canonical_ref_dialect_or_kind_mismatch'
  | 'canonical_ref_record_id_mismatch'
  | 'evidence_ref_kind_mismatch'
  | 'evidence_ref_record_id_mismatch'
  | 'missing_canonical_ref'
  | 'missing_evidence_ref'
  | 'missing_record_id'
  | 'missing_ref_kind';

type CarriedRefHandoffRemediationStep =
  | 'copy_required_handoff_field_from_execute_result'
  | 'copy_record_id_from_canonical_ref'
  | 'use_evidence_ref_for_same_record'
  | 'use_next_payload_canonical_ref';

export class ResearchActionTool implements BuiltinTool<ResearchActionToolInput> {
  readonly name = 'ResearchAction' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ResearchActionToolInputSchema);
  private readonly registry: ResearchActionRegistry;
  private readonly primitivePlanRegistry: ResearchPrimitivePlanRegistry;

  constructor(private readonly manager?: ResearchActionManager) {
    this.registry = new ResearchActionRegistry();
    for (const action of DEFAULT_RESEARCH_ACTIONS) {
      this.registry.register(action);
    }
    this.primitivePlanRegistry = new ResearchPrimitivePlanRegistry();
    registerDefaultResearchPrimitivePlanTemplates(this.primitivePlanRegistry);
  }

  resolveExecution(args: ResearchActionToolInput): ToolExecution {
    return {
      accesses: ToolAccesses.none(),
      description: `Research action: ${args.action}`,
      approvalRule: this.name,
      execute: (ctx) => this.execution(args, ctx),
    };
  }

  private async execution(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    try {
      switch (args.action) {
        case 'list_actions':
          return ok(this.listActions(args));
        case 'plan_primitive_tools':
          return this.planPrimitiveTools(args);
        case 'recommend_next_actions':
          return ok(this.recommendNextActions(args));
        case 'record_action_result':
          return this.recordActionResult(args, ctx);
        case 'open_work_frame':
          return this.openWorkFrame(args, ctx);
        case 'switch_work_frame':
          return this.switchWorkFrame(args, ctx);
        case 'close_work_frame':
          return this.closeWorkFrame(args, ctx);
        case 'list_work_frames':
          return this.listWorkFrames();
        case 'start_action_call':
          return this.startActionCall(args, ctx);
        case 'finish_action_call':
          return this.finishActionCall(args, ctx);
        case 'compile_context_pack':
          return this.compileContextPack(args, ctx);
        case 'list_context_packs':
          return this.listContextPacks();
        case 'load_context_pack':
          return this.loadContextPack(args);
        case 'inspect_domain_pack':
          return this.inspectDomainPack(args);
        case 'list_evidence_refs':
          return this.listEvidenceRefs(args);
        case 'load_evidence_ref':
          return this.loadEvidenceRef(args, ctx);
        case 'run_benchmark_adapter':
          return await this.runBenchmarkAdapter(args, ctx);
        case 'query_physics_graph':
          return this.queryPhysicsGraph(args, ctx);
        case 'build_formalization_plan':
          return this.buildFormalizationPlan(args, ctx);
        case 'execute_aitp_write_bridge':
          return await this.executeAitpWriteBridge(args, ctx);
        case 'inspect_aitp_write_bridge_handoff_readiness':
          return this.inspectAitpWriteBridgeHandoffReadiness(args);
        case 'inspect_handoff_guard_remediation_taxonomy':
          return ok(`${renderHandoffGuardRemediationTaxonomy('')}\n`);
        case 'inspect_aitp_runtime_payload_profiles':
          return await this.inspectAitpRuntimePayloadProfiles(ctx);
        case 'inspect_aitp_curated_rag_corpus':
          return await this.inspectAitpCuratedRagCorpus(ctx);
        case 'search_aitp_curated_rag_corpus':
          return await this.searchAitpCuratedRagCorpus(args, ctx);
        case 'inspect_aitp_curated_rag_chunk':
          return await this.inspectAitpCuratedRagChunk(args, ctx);
        case 'draft_aitp_curated_rag_promotion':
          return await this.draftAitpCuratedRagPromotion(args, ctx);
        case 'draft_aitp_curated_rag_write_bridge_call':
          return await this.draftAitpCuratedRagWriteBridgeCall(args, ctx);
        case 'draft_aitp_record_ref_repair_write_bridge_call':
          return this.draftAitpRecordRefRepairWriteBridgeCall(args);
        case 'capture_primitive_tool_run':
          return await this.capturePrimitiveToolRun(args, ctx);
      }
    } catch (error) {
      return {
        isError: true,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private listActions(args: ResearchActionToolInput): string {
    return renderActionList(
      this.registry.listActions({
        category: args.category as ResearchActionCategory | undefined,
        exposure: args.exposure as ResearchActionExposure | undefined,
        domain: args.domain,
        capsuleKind: args.capsule_kind,
      }),
    );
  }

  private planPrimitiveTools(args: ResearchActionToolInput): ExecutableToolResult {
    if (args.action_id === undefined || args.action_id.length === 0) {
      return errorResult('ResearchAction plan_primitive_tools requires action_id.');
    }
    const action = this.registry.getAction(args.action_id);
    if (action === undefined) {
      return errorResult(`ResearchAction plan_primitive_tools unknown action_id: ${args.action_id}`);
    }
    return ok(renderPrimitivePlan(buildPrimitivePlanForAction(action, this.primitivePlanRegistry)));
  }

  private recommendNextActions(args: ResearchActionToolInput): string {
    const recommendations = recommendResearchActions({
      actions: this.registry.listActions(),
      obligations: (args.obligations ?? []) as ResearchObligation[],
      limit: args.limit,
    });
    if (recommendations.length === 0) return '<research_action_recommendations />\n';
    return [
      '<research_action_recommendations>',
      ...recommendations.map(
        (item) => {
          const plan = buildPrimitivePlanForAction(item.action, this.primitivePlanRegistry);
          return `  <recommendation action_id="${escapeXml(item.action.id)}" score="${String(item.score)}" obligation_ids="${escapeXml(item.obligationIds.join(','))}" primitive_tools="${escapeXml(plan.toolNames.join(','))}">${escapeXml(item.reasons.join(' | '))}</recommendation>`;
        },
      ),
      '</research_action_recommendations>',
      '',
    ].join('\n');
  }

  private recordActionResult(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (args.action_id === undefined || args.action_id.length === 0) {
      return errorResult('ResearchAction record_action_result requires an action_id.');
    }
    if (args.outcome === undefined) {
      return errorResult('ResearchAction record_action_result requires an outcome.');
    }
    const resolvedCallId = this.resolveCallId(args, ctx);
    const source = (args.source ?? 'model') as ResearchActionSource;
    const record = {
      actionId: args.action_id,
      callId: resolvedCallId.callId,
      input: {},
      output: {},
      graphRefs: (args.graph_refs ?? []) as GraphRef[],
      capsuleRefs: args.capsule_refs ?? [],
      ledgerEventIds: args.ledger_event_ids ?? [],
      evidenceRefs: args.evidence_refs ?? [],
      outcome: args.outcome as ResearchActionOutcome,
      generatedObligationIds: args.generated_obligation_ids ?? [],
      primitiveToolCallIds: args.primitive_tool_call_ids ?? [],
      nextSuggestedActions: args.next_suggested_actions ?? [],
    };
    this.manager?.recordActionResult(record, {
      source,
      toolCallId: ctx.toolCallId,
    });
    return ok(
      `<research_action_recorded action_id="${escapeXml(record.actionId)}" call_id="${escapeXml(record.callId)}" call_id_source="${resolvedCallId.source}" outcome="${record.outcome}" />\n`,
    );
  }

  private startActionCall(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction start_action_call requires a session manager.');
    }
    if (args.action_id === undefined || args.action_id.length === 0) {
      return errorResult('ResearchAction start_action_call requires action_id.');
    }
    const resolvedCallId = this.resolveCallId(args, ctx);
    const started = this.manager.startActionCall(
      {
        actionId: args.action_id,
        callId: resolvedCallId.callId,
        input: args.action_input,
      },
      {
        source: 'model',
        toolCallId: ctx.toolCallId,
      },
    );
    return ok(
      `<research_action_call_started action_id="${escapeXml(started.actionId)}" call_id="${escapeXml(started.callId)}" call_id_source="${resolvedCallId.source}"${started.workFrameId === undefined ? '' : ` work_frame_id="${escapeXml(started.workFrameId)}"`} />\n`,
    );
  }

  private finishActionCall(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction finish_action_call requires a session manager.');
    }
    if (args.action_id === undefined || args.action_id.length === 0) {
      return errorResult('ResearchAction finish_action_call requires action_id.');
    }
    if (args.outcome === undefined) {
      return errorResult('ResearchAction finish_action_call requires outcome.');
    }
    const resolvedCallId = this.resolveCallId(args, ctx);
    this.manager.finishActionCall(
      {
        actionId: args.action_id,
        callId: resolvedCallId.callId,
        outcome: args.outcome,
        output: args.action_output,
        ledgerEventIds: args.ledger_event_ids,
        evidenceRefs: args.evidence_refs,
        generatedObligationIds: args.generated_obligation_ids,
        primitiveToolCallIds: args.primitive_tool_call_ids,
        nextSuggestedActions: args.next_suggested_actions,
      },
      {
        source: 'model',
        toolCallId: ctx.toolCallId,
      },
    );
    return ok(
      `<research_action_call_finished action_id="${escapeXml(args.action_id)}" call_id="${escapeXml(resolvedCallId.callId)}" call_id_source="${resolvedCallId.source}" outcome="${args.outcome}" />\n`,
    );
  }

  private resolveCallId(
    args: ResearchActionToolInput & { readonly action_id?: string | undefined },
    ctx: ExecutableToolContext,
  ): { readonly callId: string; readonly source: 'provided' | 'active' | 'generated' } {
    if (args.call_id !== undefined && args.call_id.trim().length > 0) {
      return { callId: args.call_id, source: 'provided' };
    }
    const active = this.manager?.activeActionCall;
    if (active !== undefined && active.actionId === args.action_id) {
      return { callId: active.callId, source: 'active' };
    }
    return {
      callId: defaultCallId(args.action_id ?? 'research-action', ctx.toolCallId),
      source: 'generated',
    };
  }

  private async executeAitpWriteBridge(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchAction execute_aitp_write_bridge requires a session manager.');
    }
    if (args.aitp_operation === undefined) {
      return errorResult('ResearchAction execute_aitp_write_bridge requires aitp_operation.');
    }
    if (args.aitp_payload === undefined) {
      return errorResult('ResearchAction execute_aitp_write_bridge requires aitp_payload.');
    }
    const operation = args.aitp_operation as AitpWriteBridgeOperation;
    const handoffGuard = verifyAitpWriteBridgeHandoff(args.aitp_handoff, operation, args.aitp_payload);
    if (handoffGuard.isError) {
      return errorResult(
        `${renderAitpHandoffExecutionPrecheck({ status: 'failed', failure: handoffGuard.failure })}\n${handoffGuard.message}`,
      );
    }
    const actionId = args.action_id ?? actionIdForAitpWriteBridgeOperation(operation);
    const resolvedCallId = this.resolveCallId({ ...args, action_id: actionId }, ctx);
    const input = coerceAitpWriteBridgeInput(operation, args.aitp_payload, ctx.signal);
    const result = await this.manager.executeAitpWriteBridge(
      {
        ...input,
        actionId,
        callId: resolvedCallId.callId,
      },
      {
        source: (args.source ?? 'model') as ResearchActionSource,
        toolCallId: ctx.toolCallId,
      },
    );
    return ok(renderAitpWriteBridgeExecution(operation, actionId, resolvedCallId.callId, result, handoffGuard.guard));
  }

  private inspectAitpWriteBridgeHandoffReadiness(
    args: ResearchActionToolInput,
  ): ExecutableToolResult {
    if (args.aitp_operation === undefined) {
      return errorResult('ResearchAction inspect_aitp_write_bridge_handoff_readiness requires aitp_operation.');
    }
    if (args.aitp_payload === undefined) {
      return errorResult('ResearchAction inspect_aitp_write_bridge_handoff_readiness requires aitp_payload.');
    }
    if (args.aitp_handoff === undefined) {
      return errorResult('ResearchAction inspect_aitp_write_bridge_handoff_readiness requires aitp_handoff.');
    }
    const operation = args.aitp_operation as AitpWriteBridgeOperation;
    const handoffGuard = verifyAitpWriteBridgeHandoff(args.aitp_handoff, operation, args.aitp_payload);
    if (handoffGuard.isError) {
      return ok(renderAitpWriteBridgeHandoffReadiness({ status: 'failed', failure: handoffGuard.failure }));
    }
    return ok(renderAitpWriteBridgeHandoffReadiness({ status: 'passed', guard: handoffGuard.guard }));
  }

  private async inspectAitpRuntimePayloadProfiles(
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult(
        'ResearchAction inspect_aitp_runtime_payload_profiles requires a session manager.',
      );
    }
    if (!this.manager.hasAitpRuntimePayloadProfilesProvider()) {
      return errorResult('AITP runtime payload profiles provider is not configured');
    }
    const catalog = await this.manager.readAitpRuntimePayloadProfiles(ctx.signal);
    return ok(renderAitpRuntimePayloadProfiles(catalog));
  }

  private async inspectAitpCuratedRagCorpus(
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchAction inspect_aitp_curated_rag_corpus requires a session manager.');
    }
    if (!this.manager.hasAitpCuratedRagProvider()) {
      return errorResult('AITP curated RAG provider is not configured');
    }
    const corpus = await this.manager.readAitpCuratedRagCorpus(ctx.signal);
    return ok(renderAitpCuratedRagCorpus(corpus));
  }

  private async searchAitpCuratedRagCorpus(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchAction search_aitp_curated_rag_corpus requires a session manager.');
    }
    if (!this.manager.hasAitpCuratedRagProvider()) {
      return errorResult('AITP curated RAG provider is not configured');
    }
    if (args.rag_query === undefined || args.rag_query.trim().length === 0) {
      return errorResult('ResearchAction search_aitp_curated_rag_corpus requires rag_query.');
    }
    const searchResult = await this.manager.searchAitpCuratedRagCorpus(
      args.rag_query,
      args.rag_limit,
      ctx.signal,
    );
    return ok(renderAitpCuratedRagSearchResult(searchResult));
  }

  private async inspectAitpCuratedRagChunk(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchAction inspect_aitp_curated_rag_chunk requires a session manager.');
    }
    if (!this.manager.hasAitpCuratedRagProvider()) {
      return errorResult('AITP curated RAG provider is not configured');
    }
    if (args.rag_chunk_id === undefined || args.rag_chunk_id.trim().length === 0) {
      return errorResult('ResearchAction inspect_aitp_curated_rag_chunk requires rag_chunk_id.');
    }
    const chunk = await this.manager.readAitpCuratedRagChunk(args.rag_chunk_id, ctx.signal);
    return ok(renderAitpCuratedRagChunk(chunk));
  }

  private async draftAitpCuratedRagPromotion(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchAction draft_aitp_curated_rag_promotion requires a session manager.');
    }
    if (!this.manager.hasAitpCuratedRagProvider()) {
      return errorResult('AITP curated RAG provider is not configured');
    }
    const boundInput = this.resolveCuratedRagPromotionDraftBinding(args);
    if (boundInput.isError) return errorResult(boundInput.message);
    const ragChunkId = firstText(args.rag_chunk_id, boundInput.input?.ragChunkId);
    if (ragChunkId === undefined) {
      return errorResult('ResearchAction draft_aitp_curated_rag_promotion requires rag_chunk_id.');
    }
    const draft = await this.manager.draftAitpCuratedRagPromotion({
      chunkId: ragChunkId,
      topicId: firstText(args.aitp_topic_id, args.topic, boundInput.input?.aitpTopicId),
      claimId: firstText(args.aitp_claim_id, boundInput.input?.aitpClaimId),
      connectorId: firstText(args.aitp_connector_id, boundInput.input?.aitpConnectorId),
      promotionIntent: firstText(args.aitp_promotion_intent, boundInput.input?.aitpPromotionIntent),
      signal: ctx.signal,
    });
    return ok(renderAitpCuratedRagPromotionDraft(draft, boundInput.bindingId));
  }

  private async draftAitpCuratedRagWriteBridgeCall(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchAction draft_aitp_curated_rag_write_bridge_call requires a session manager.');
    }
    if (!this.manager.hasAitpCuratedRagProvider()) {
      return errorResult('AITP curated RAG provider is not configured');
    }
    const selector = curatedRagPromotionWriteBridgeCallSelector(args);
    if (selector.isError) return errorResult(selector.message);
    const boundInput = this.resolveCuratedRagWriteBridgeCallBinding(args);
    if (boundInput.isError) return errorResult(boundInput.message);
    const ragChunkId = firstText(args.rag_chunk_id, boundInput.input?.ragChunkId);
    if (ragChunkId === undefined) {
      return errorResult('ResearchAction draft_aitp_curated_rag_write_bridge_call requires rag_chunk_id.');
    }
    const draft = await this.manager.draftAitpCuratedRagPromotion({
      chunkId: ragChunkId,
      topicId: firstText(args.aitp_topic_id, args.topic, boundInput.input?.aitpTopicId),
      claimId: firstText(args.aitp_claim_id, boundInput.input?.aitpClaimId),
      connectorId: firstText(args.aitp_connector_id, boundInput.input?.aitpConnectorId),
      promotionIntent: firstText(args.aitp_promotion_intent, boundInput.input?.aitpPromotionIntent),
      signal: ctx.signal,
    });
    const carriedRefs = promotionCarriedRefsFromInput(args);
    if (carriedRefs.isError) return errorResult(carriedRefs.message);
    const callDraft = curatedRagPromotionWriteBridgeCallDraft(
      draft,
      selector.selector,
      args.promotion_reviewed_overrides,
      carriedRefs.refs,
    );
    if (callDraft.isError) return errorResult(callDraft.message);
    const lookup = await this.lookupCuratedRagCallDraftRefs(callDraft.draft, ctx.signal);
    return ok(
      renderAitpCuratedRagWriteBridgeCallDraft(
        draft,
        { ...callDraft.draft, recordRefLookup: lookup },
        boundInput.bindingId,
      ),
    );
  }

  private draftAitpRecordRefRepairWriteBridgeCall(
    args: ResearchActionToolInput,
  ): ExecutableToolResult {
    if (args.repair_operation === undefined) {
      return errorResult('ResearchAction draft_aitp_record_ref_repair_write_bridge_call requires repair_operation.');
    }
    if (args.repair_ref === undefined || args.repair_ref.trim().length === 0) {
      return errorResult('ResearchAction draft_aitp_record_ref_repair_write_bridge_call requires repair_ref.');
    }
    if (args.aitp_payload === undefined) {
      return errorResult('ResearchAction draft_aitp_record_ref_repair_write_bridge_call requires aitp_payload.');
    }
    let input: ReturnType<typeof coerceAitpWriteBridgeInput>;
    try {
      input = coerceAitpWriteBridgeInput(args.repair_operation, args.aitp_payload);
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
    return ok(
      renderAitpRecordRefRepairWriteBridgeCallDraft({
        repairRef: args.repair_ref,
        repairOperation: args.repair_operation,
        repairReason: args.repair_reason,
        payload: input.payload,
      }),
    );
  }

  private async lookupCuratedRagCallDraftRefs(
    callDraft: CuratedRagPromotionWriteBridgeCallDraft,
    signal?: AbortSignal | undefined,
  ): Promise<CuratedRagPayloadRefLookup> {
    const refs = concreteLookupRefs(curatedRagPayloadIdentity(callDraft.payload).refs);
    if (refs.length === 0) {
      return { status: 'not_requested', reason: 'no_concrete_record_refs' };
    }
    if (this.manager === undefined || !this.manager.hasAitpRecordRefLookupProvider()) {
      return { status: 'not_requested', reason: 'aitp_record_ref_lookup_provider_unavailable' };
    }
    try {
      return {
        status: 'performed',
        lookup: await this.manager.lookupAitpRecordRefs(refs, signal),
      };
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private resolveCuratedRagPromotionDraftBinding(args: ResearchActionToolInput):
    | {
        readonly isError: false;
        readonly bindingId?: string | undefined;
        readonly input?: CuratedRagPromotionDraftBindingInput | undefined;
      }
    | { readonly isError: true; readonly message: string } {
    if (this.manager === undefined) {
      return { isError: false };
    }
    if (args.action_binding_id === undefined || args.action_binding_id.trim().length === 0) {
      return { isError: false };
    }
    const bindingId = args.action_binding_id.trim();
    const contextPackId = args.context_pack_id ?? this.manager.activeWorkFrame()?.contextPackId;
    if (contextPackId === undefined || contextPackId.length === 0) {
      return {
        isError: true,
        message:
          'ResearchAction draft_aitp_curated_rag_promotion with action_binding_id requires context_pack_id or an active WorkFrame with an attached ContextPack.',
      };
    }
    const binding = this.manager
      .requireContextPack(contextPackId)
      .actionBindings.find((item) => item.id === bindingId);
    if (binding === undefined) {
      return {
        isError: true,
        message: `ContextPack "${contextPackId}" does not contain action binding "${bindingId}".`,
      };
    }
    if (binding.actionId !== 'draft_aitp_curated_rag_promotion') {
      return {
        isError: true,
        message:
          `Action binding "${bindingId}" is for "${binding.actionId}", not draft_aitp_curated_rag_promotion.`,
      };
    }
    const input = curatedRagPromotionDraftBindingInput(binding.params);
    if (input === undefined) {
      return {
        isError: true,
        message: `Action binding "${bindingId}" does not contain a usable curated RAG promotion draft input.`,
      };
    }
    return { isError: false, bindingId, input };
  }

  private resolveCuratedRagWriteBridgeCallBinding(args: ResearchActionToolInput):
    | {
        readonly isError: false;
        readonly bindingId?: string | undefined;
        readonly input?: CuratedRagPromotionDraftBindingInput | undefined;
      }
    | { readonly isError: true; readonly message: string } {
    if (this.manager === undefined) {
      return { isError: false };
    }
    if (args.action_binding_id === undefined || args.action_binding_id.trim().length === 0) {
      return { isError: false };
    }
    const bindingId = args.action_binding_id.trim();
    const contextPackId = args.context_pack_id ?? this.manager.activeWorkFrame()?.contextPackId;
    if (contextPackId === undefined || contextPackId.length === 0) {
      return {
        isError: true,
        message:
          'ResearchAction draft_aitp_curated_rag_write_bridge_call with action_binding_id requires context_pack_id or an active WorkFrame with an attached ContextPack.',
      };
    }
    const binding = this.manager
      .requireContextPack(contextPackId)
      .actionBindings.find((item) => item.id === bindingId);
    if (binding === undefined) {
      return {
        isError: true,
        message: `ContextPack "${contextPackId}" does not contain action binding "${bindingId}".`,
      };
    }
    if (
      binding.actionId !== 'draft_aitp_curated_rag_promotion' &&
      binding.actionId !== 'draft_aitp_curated_rag_write_bridge_call'
    ) {
      return {
        isError: true,
        message:
          `Action binding "${bindingId}" is for "${binding.actionId}", not draft_aitp_curated_rag_write_bridge_call.`,
      };
    }
    if (binding.actionId === 'draft_aitp_curated_rag_write_bridge_call') {
      return { isError: false, bindingId };
    }
    const input = curatedRagPromotionDraftBindingInput(binding.params);
    if (input === undefined) {
      return {
        isError: true,
        message: `Action binding "${bindingId}" does not contain a usable curated RAG write-bridge call input.`,
      };
    }
    return { isError: false, bindingId, input };
  }

  private openWorkFrame(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction open_work_frame requires a session manager.');
    }
    if (args.frame_id === undefined || args.frame_id.length === 0) {
      return errorResult('ResearchAction open_work_frame requires frame_id.');
    }
    if (args.domain === undefined || args.domain.length === 0) {
      return errorResult('ResearchAction open_work_frame requires domain.');
    }
    if (args.topic === undefined || args.topic.length === 0) {
      return errorResult('ResearchAction open_work_frame requires topic.');
    }
    if (args.goal === undefined || args.goal.length === 0) {
      return errorResult('ResearchAction open_work_frame requires goal.');
    }
    const frame = this.manager.openWorkFrame(
      {
        id: args.frame_id,
        domain: args.domain,
        topic: args.topic,
        goal: args.goal,
        contextPackId: args.context_pack_id,
        activeObjectIds: args.active_object_ids,
        assumptionIds: args.assumption_ids,
        conventionIds: args.convention_ids,
        sourceRefs: args.source_refs,
      },
      {
        source: 'model-tool',
        toolCallId: ctx.toolCallId,
      },
    );
    return ok(renderWorkFrame(frame, true));
  }

  private switchWorkFrame(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction switch_work_frame requires a session manager.');
    }
    if (args.frame_id === undefined || args.frame_id.length === 0) {
      return errorResult('ResearchAction switch_work_frame requires frame_id.');
    }
    const frame = this.manager.switchWorkFrame(args.frame_id, {
      source: 'model-tool',
      toolCallId: ctx.toolCallId,
    });
    return ok(renderWorkFrame(frame, true));
  }

  private closeWorkFrame(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction close_work_frame requires a session manager.');
    }
    if (args.frame_id === undefined || args.frame_id.length === 0) {
      return errorResult('ResearchAction close_work_frame requires frame_id.');
    }
    this.manager.closeWorkFrame(args.frame_id, {
      source: 'model-tool',
      toolCallId: ctx.toolCallId,
    });
    return ok(`<work_frame_closed id="${escapeXml(args.frame_id)}" />\n`);
  }

  private listWorkFrames(): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction list_work_frames requires a session manager.');
    }
    const active = this.manager.activeWorkFrame();
    return ok(renderWorkFrameList(this.manager.listWorkFrames(), active?.id));
  }

  private compileContextPack(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction compile_context_pack requires a session manager.');
    }
    const pack = this.manager.compileContextPack(
      {
        workFrameId: args.frame_id,
        attachToWorkFrame: args.attach_context_pack,
        reliabilityFloor: args.reliability_floor,
        bridgePolicy: args.bridge_policy,
        includeLedgerStatuses: args.include_ledger_statuses,
        limits: {
          maxCapsules: args.max_capsules,
          maxLedgerProposals: args.max_ledger_proposals,
          maxActionBindings: args.max_action_bindings,
        },
      },
      {
        source: 'model-tool',
        toolCallId: ctx.toolCallId,
      },
    );
    return ok(renderContextPack(pack));
  }

  private listContextPacks(): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction list_context_packs requires a session manager.');
    }
    const packs = this.manager.listContextPacks();
    if (packs.length === 0) return ok('<context_packs />\n');
    return ok(
      [
        '<context_packs>',
        ...packs.map(
          (pack) =>
            `  <context_pack id="${escapeXml(pack.id)}" work_frame_id="${escapeXml(pack.workFrameId)}" domain="${escapeXml(pack.domain)}" topic="${escapeXml(pack.topic)}" capsule_count="${String(pack.physics.capsules.length)}" proposal_count="${String(pack.ledger.proposals.length)}" action_binding_count="${String(pack.actionBindings.length)}" />`,
        ),
        '</context_packs>',
        '',
      ].join('\n'),
    );
  }

  private loadContextPack(args: ResearchActionToolInput): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction load_context_pack requires a session manager.');
    }
    if (args.context_pack_id === undefined || args.context_pack_id.length === 0) {
      return errorResult('ResearchAction load_context_pack requires context_pack_id.');
    }
    return ok(renderContextPack(this.manager.requireContextPack(args.context_pack_id)));
  }

  private inspectDomainPack(args: ResearchActionToolInput): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction inspect_domain_pack requires a session manager.');
    }
    const contextPackId = args.context_pack_id ?? this.manager.activeWorkFrame()?.contextPackId;
    if (contextPackId === undefined || contextPackId.length === 0) {
      return errorResult(
        'ResearchAction inspect_domain_pack requires context_pack_id or an active WorkFrame with an attached ContextPack.',
      );
    }
    return ok(renderDomainPackInspection(this.manager.requireContextPack(contextPackId)));
  }

  private listEvidenceRefs(args: ResearchActionToolInput): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction list_evidence_refs requires a session manager.');
    }
    const scope = this.resolveEvidenceScope(args, this.manager);
    return ok(renderEvidenceRefs(this.manager.recentEvidence(args.limit ?? 20, scope.filter), scope));
  }

  private loadEvidenceRef(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction load_evidence_ref requires a session manager.');
    }
    if (!hasText(args.evidence_ref)) {
      return errorResult('ResearchAction load_evidence_ref requires evidence_ref.');
    }
    const scope = this.resolveEvidenceScope(args, this.manager);
    const loaded = this.manager.loadEvidenceRef(args.evidence_ref, scope.filter, {
      source: 'model-tool',
      toolCallId: ctx.toolCallId,
    });
    return ok(renderLoadedEvidenceRef(loaded, args.include_body ?? true, scope));
  }

  private resolveEvidenceScope(
    args: ResearchActionToolInput,
    manager: ResearchActionManager,
  ): EvidenceScope {
    if (hasText(args.frame_id)) {
      const frame = manager.listWorkFrames().find((candidate) => candidate.id === args.frame_id);
      if (frame === undefined) {
        throw new Error(`ResearchAction evidence access unknown frame_id: ${args.frame_id}`);
      }
      return {
        source: 'work_frame',
        filter: {
          workFrameId: frame.id,
          domain: frame.domain,
          topic: frame.topic,
        },
      };
    }
    const active = manager.activeWorkFrame();
    if (active !== undefined) {
      return {
        source: 'work_frame',
        filter: {
          workFrameId: active.id,
          domain: active.domain,
          topic: active.topic,
        },
      };
    }
    if (hasText(args.domain) && hasText(args.topic)) {
      return {
        source: 'explicit',
        filter: {
          domain: args.domain,
          topic: args.topic,
        },
      };
    }
    if (hasText(args.domain) || hasText(args.topic)) {
      throw new Error(
        'ResearchAction evidence access requires both domain and topic when no WorkFrame is active.',
      );
    }
    throw new Error(
      'ResearchAction evidence access requires an active WorkFrame, explicit frame_id, or explicit domain and topic.',
    );
  }

  private async runBenchmarkAdapter(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchAction run_benchmark_adapter requires a session manager.');
    }
    if (args.adapter_id === undefined || args.adapter_id.length === 0) {
      return errorResult('ResearchAction run_benchmark_adapter requires adapter_id.');
    }
    const result = this.manager.runBenchmarkAdapter(args.adapter_id, {
      caseId: args.benchmark_case_id,
      payload: args.benchmark_payload,
      sourceRefs: args.source_refs,
    });
    const actionId = args.action_id ?? result.actionId;
    const callId = args.call_id ?? defaultCallId(actionId, ctx.toolCallId);
    const aitpCapture = await this.captureBenchmarkAdapterRunAsAitpToolRun(
      result,
      args,
      actionId,
      callId,
      ctx,
    );
    const evidenceRefs = uniqueStrings([
      ...result.evidenceRefs,
      ...evidenceRefsForBenchmarkAitpCapture(aitpCapture),
    ]);
    this.recordExecutedAction(args, ctx, {
      actionId,
      callId,
      outcome: result.outcome,
      input: {
        adapterId: args.adapter_id,
        caseId: result.caseId,
        payload: args.benchmark_payload,
      },
      output: {
        ...result,
        aitpToolRunCapture: aitpCapture,
      },
      evidenceRefs,
      graphRefs: [],
    });
    return ok(renderBenchmarkAdapterRun(result, aitpCapture));
  }

  private async captureBenchmarkAdapterRunAsAitpToolRun(
    result: BenchmarkAdapterRunResult,
    args: ResearchActionToolInput,
    actionId: string,
    callId: string,
    ctx: ExecutableToolContext,
  ): Promise<BenchmarkAitpToolRunCapture> {
    if (this.manager === undefined) return { status: 'skipped', reason: 'session manager unavailable' };
    if (!this.manager.hasAitpWriteBridge()) {
      return { status: 'skipped', reason: 'AITP write bridge is not configured' };
    }
    const payload = buildBenchmarkAdapterAitpToolRunPayload(
      result,
      args,
      actionId,
      callId,
      this.manager.activeWorkFrame(),
    );
    if (payload === undefined) {
      return {
        status: 'skipped',
        reason: 'topic_id and claim_id are required to record benchmark adapter provenance in AITP',
      };
    }
    try {
      const input = coerceAitpWriteBridgeInput('recordToolRun', payload, ctx.signal);
      const writeResult = await this.manager.executeAitpWriteBridge(
        {
          ...input,
          actionId: 'aitp.record_tool_run',
          callId: `${callId}.aitp-tool-run`,
        },
        {
          source: (args.source ?? 'model') as ResearchActionSource,
          toolCallId: ctx.toolCallId,
        },
      );
      return {
        status: 'recorded',
        profileId: 'benchmark_adapter_run_to_tool_run',
        operation: 'recordToolRun',
        result: writeResult,
        evidenceRefs: evidenceRefsForAitpWriteBridgeResult(writeResult),
      };
    } catch (error) {
      return {
        status: 'failed',
        profileId: 'benchmark_adapter_run_to_tool_run',
        operation: 'recordToolRun',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async capturePrimitiveToolRun(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchAction capture_primitive_tool_run requires a session manager.');
    }
    const toolCallId = firstText(args.primitive_tool_call_id, args.primitive_tool_call_ids?.[0]);
    if (!hasText(toolCallId)) {
      return errorResult('ResearchAction capture_primitive_tool_run requires primitive_tool_call_id.');
    }
    const actionId = args.action_id ?? 'aitp.capture_primitive_tool_run';
    const resolvedCallId = this.resolveCallId({ ...args, action_id: actionId }, ctx);
    const capture = await this.capturePrimitiveToolLifecycleAsAitpToolRun(
      toolCallId,
      args,
      resolvedCallId.callId,
      ctx,
    );
    this.recordExecutedAction(args, ctx, {
      actionId,
      callId: resolvedCallId.callId,
      outcome: outcomeForPrimitiveToolAitpCapture(capture),
      input: {
        toolCallId,
        sourceRefs: args.source_refs ?? [],
        profileId: PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
      },
      output: capture,
      evidenceRefs: evidenceRefsForPrimitiveToolAitpCapture(capture),
      graphRefs: [],
    });
    return ok(renderPrimitiveToolAitpCapture(toolCallId, capture));
  }

  private async capturePrimitiveToolLifecycleAsAitpToolRun(
    toolCallId: string,
    args: ResearchActionToolInput,
    callId: string,
    ctx: ExecutableToolContext,
  ): Promise<PrimitiveToolAitpToolRunCapture> {
    if (this.manager === undefined) return { status: 'skipped', reason: 'session manager unavailable' };
    if (!this.manager.hasAitpWriteBridge()) {
      return { status: 'skipped', reason: 'AITP write bridge is not configured' };
    }
    const envelope = this.manager.findPrimitiveToolLifecycleEnvelope(toolCallId);
    if (envelope === undefined) {
      return { status: 'skipped', reason: `primitive tool call not found: ${toolCallId}` };
    }
    const payload = buildPrimitiveToolLifecycleAitpToolRunPayload(
      envelope,
      this.manager.activeWorkFrame(),
      {
        topicId: firstText(
          optionalRecordValue(args.aitp_payload, 'topicId'),
          optionalRecordValue(args.aitp_payload, 'topic_id'),
          args.topic,
        ),
        claimId: firstText(
          optionalRecordValue(args.aitp_payload, 'claimId'),
          optionalRecordValue(args.aitp_payload, 'claim_id'),
        ),
        sourceRefs: args.source_refs,
      },
    );
    if (payload === undefined) {
      return {
        status: 'skipped',
        reason: 'topic_id and claim_id are required to record primitive tool provenance in AITP',
      };
    }
    try {
      const input = coerceAitpWriteBridgeInput('recordToolRun', payload, ctx.signal);
      const writeResult = await this.manager.executeAitpWriteBridge(
        {
          ...input,
          actionId: 'aitp.record_tool_run',
          callId: `${callId}.aitp-tool-run`,
        },
        {
          source: (args.source ?? 'model') as ResearchActionSource,
          toolCallId: ctx.toolCallId,
        },
      );
      return {
        status: 'recorded',
        profileId: PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
        operation: 'recordToolRun',
        result: writeResult,
        evidenceRefs: evidenceRefsForAitpWriteBridgeResult(writeResult),
      };
    } catch (error) {
      return {
        status: 'failed',
        profileId: PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
        operation: 'recordToolRun',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private queryPhysicsGraph(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction query_physics_graph requires a session manager.');
    }
    const graph = this.manager.buildPhysicsGraph();
    const query = args.graph_query ?? 'dependency_closure';
    const relationTypes = args.relation_types as readonly PhysicsRelationType[] | undefined;
    const output =
      query === 'path'
        ? this.queryPhysicsGraphPath(args, graph, relationTypes)
        : this.queryPhysicsGraphSet(args, graph, query, relationTypes);
    if (!isGraphSuccessOutput(output)) return output;

    const actionId = args.action_id ?? defaultGraphActionId(query);
    const callId = args.call_id ?? defaultCallId(actionId, ctx.toolCallId);
    this.recordExecutedAction(args, ctx, {
      actionId,
      callId,
      outcome: output.outcome,
      input: {
        query,
        startIds: args.start_ids,
        fromId: args.from_id,
        toId: args.to_id,
        relationTypes,
        direction: args.direction,
        maxDepth: args.max_depth,
      },
      output: output.payload,
      evidenceRefs: [`graph:${query}:${callId}`],
      graphRefs: graphRefsFromNodeIds(output.nodeIds),
    });
    return ok(output.text);
  }

  private queryPhysicsGraphPath(
    args: ResearchActionToolInput,
    graph: ReturnType<ResearchActionManager['buildPhysicsGraph']>,
    relationTypes: readonly PhysicsRelationType[] | undefined,
  ): ExecutableGraphOutput {
    if (args.from_id === undefined || args.from_id.length === 0) {
      return errorResult('ResearchAction query_physics_graph path requires from_id.');
    }
    if (args.to_id === undefined || args.to_id.length === 0) {
      return errorResult('ResearchAction query_physics_graph path requires to_id.');
    }
    const result = findPhysicsGraphPath(graph, {
      fromId: args.from_id,
      toId: args.to_id,
      direction: args.direction,
      maxDepth: args.max_depth,
      relationTypes,
      bridgePolicy: args.bridge_policy,
    });
    return {
      outcome: result.found ? 'pass' : 'blocked',
      nodeIds: result.nodeIds,
      payload: result,
      text: renderGraphPathResult(result),
    };
  }

  private queryPhysicsGraphSet(
    args: ResearchActionToolInput,
    graph: ReturnType<ResearchActionManager['buildPhysicsGraph']>,
    query: Exclude<(typeof GRAPH_QUERIES)[number], 'path'>,
    relationTypes: readonly PhysicsRelationType[] | undefined,
  ): ExecutableGraphOutput {
    if (query === 'contradictions') {
      const edges = queryPhysicsGraphContradictions(graph, { domain: args.domain });
      return {
        outcome: 'pass',
        nodeIds: nodeIdsFromEdges(edges),
        payload: { edges },
        text: renderGraphEdges('contradictions', edges),
      };
    }
    const startIds = args.start_ids ?? args.capsule_refs;
    if (startIds === undefined || startIds.length === 0) {
      return errorResult(`ResearchAction query_physics_graph ${query} requires start_ids.`);
    }
    const result =
      query === 'dependency_closure'
        ? queryPhysicsGraphDependencyClosure(graph, {
            startIds,
            maxDepth: args.max_depth,
            bridgePolicy: args.bridge_policy,
          })
        : queryPhysicsGraphNeighborhood(graph, {
            startIds,
            direction: args.direction,
            maxDepth: args.max_depth,
            relationTypes,
            bridgePolicy: args.bridge_policy,
          });
    return {
      outcome: result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
        ? 'blocked'
        : 'pass',
      nodeIds: result.nodeIds,
      payload: result,
      text: renderGraphQueryResult(query, result),
    };
  }

  private buildFormalizationPlan(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (this.manager === undefined) {
      return errorResult('ResearchAction build_formalization_plan requires a session manager.');
    }
    const targetIds = args.formalization_target_ids ?? args.start_ids ?? args.capsule_refs;
    if (targetIds === undefined || targetIds.length === 0) {
      return errorResult('ResearchAction build_formalization_plan requires formalization_target_ids.');
    }
    const plan = this.manager.buildFormalizationPlan({
      targetIds,
      includeDependencyClosure: args.include_dependency_closure,
      maxDepth: args.max_depth,
    });
    const actionId = args.action_id ?? 'formalization.build_blueprint';
    const callId = args.call_id ?? defaultCallId(actionId, ctx.toolCallId);
    const hasError = plan.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    this.recordExecutedAction(args, ctx, {
      actionId,
      callId,
      outcome: hasError ? 'blocked' : 'pass',
      input: {
        targetIds,
        includeDependencyClosure: args.include_dependency_closure,
        maxDepth: args.max_depth,
      },
      output: plan,
      evidenceRefs: [`formalization:${plan.blueprint.format}:${callId}`],
      graphRefs: plan.contracts.map((contract) => ({
        kind: 'ValidationContract',
        id: contract.id,
      })),
    });
    return ok(renderFormalizationPlan(plan));
  }

  private recordExecutedAction(
    args: ResearchActionToolInput,
    ctx: ExecutableToolContext,
    record: {
      readonly actionId: string;
      readonly callId: string;
      readonly outcome: ResearchActionOutcome;
      readonly input: unknown;
      readonly output: unknown;
      readonly evidenceRefs: readonly string[];
      readonly graphRefs: readonly GraphRef[];
    },
  ): void {
    this.manager?.recordActionResult(
      {
        actionId: record.actionId,
        callId: record.callId,
        input: record.input,
        output: record.output,
        graphRefs: record.graphRefs,
        capsuleRefs: args.capsule_refs ?? [],
        ledgerEventIds: args.ledger_event_ids ?? [],
        evidenceRefs: record.evidenceRefs,
        outcome: record.outcome,
        generatedObligationIds: args.generated_obligation_ids ?? [],
        primitiveToolCallIds: uniqueStrings([
          ...(args.primitive_tool_call_ids ?? []),
          ...(args.primitive_tool_call_id === undefined ? [] : [args.primitive_tool_call_id]),
        ]),
        nextSuggestedActions: args.next_suggested_actions ?? [],
      },
      {
        source: (args.source ?? 'model') as ResearchActionSource,
        toolCallId: ctx.toolCallId,
      },
    );
  }
}

function isGraphSuccessOutput(output: ExecutableGraphOutput): output is GraphSuccessOutput {
  return 'text' in output;
}

function defaultGraphActionId(query: (typeof GRAPH_QUERIES)[number]): string {
  switch (query) {
    case 'dependency_closure':
      return 'graph.query_dependency_closure';
    case 'neighborhood':
    case 'path':
    case 'contradictions':
      return 'graph.compile_edges';
  }
}

function defaultCallId(actionId: string, toolCallId: string): string {
  return `call.${safeId(actionId)}.${safeId(toolCallId)}`;
}

type BenchmarkAitpToolRunCapture =
  | {
      readonly status: 'recorded';
      readonly profileId: 'benchmark_adapter_run_to_tool_run';
      readonly operation: 'recordToolRun';
      readonly result: AitpWriteBridgeExecutionResult;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly status: 'skipped';
      readonly reason: string;
    }
  | {
      readonly status: 'failed';
      readonly profileId: 'benchmark_adapter_run_to_tool_run';
      readonly operation: 'recordToolRun';
      readonly reason: string;
    };

type PrimitiveToolAitpToolRunCapture =
  | {
      readonly status: 'recorded';
      readonly profileId: typeof PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE;
      readonly operation: 'recordToolRun';
      readonly result: AitpWriteBridgeExecutionResult;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly status: 'skipped';
      readonly reason: string;
    }
  | {
      readonly status: 'failed';
      readonly profileId: typeof PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE;
      readonly operation: 'recordToolRun';
      readonly reason: string;
    };

function renderBenchmarkAdapterRun(
  result: BenchmarkAdapterRunResult,
  aitpCapture?: BenchmarkAitpToolRunCapture,
): string {
  return [
    `<benchmark_adapter_run adapter_id="${escapeXml(result.adapterId)}" case_id="${escapeXml(result.caseId)}" domain="${escapeXml(result.domain)}" action_id="${escapeXml(result.actionId)}" outcome="${result.outcome}">`,
    `  <observation>${escapeXml(result.observation)}</observation>`,
    renderStringList('evidence_refs', 'evidence_ref', result.evidenceRefs, '  '),
    renderStringList('artifact_refs', 'artifact_ref', result.artifactRefs, '  '),
    '  <checks>',
    ...result.checkResults.map(
      (check) =>
        `    <check id="${escapeXml(check.checkId)}" kind="${check.kind}" status="${check.status}" evidence_refs="${escapeXml(check.evidenceRefs.join(','))}" />`,
    ),
    '  </checks>',
    renderBenchmarkAitpToolRunCapture(aitpCapture, '  '),
    '</benchmark_adapter_run>',
    '',
  ].join('\n');
}

function renderBenchmarkAitpToolRunCapture(
  capture: BenchmarkAitpToolRunCapture | undefined,
  indent: string,
): string {
  if (capture === undefined) return `${indent}<aitp_tool_run_capture status="skipped" reason="not evaluated" />`;
  if (capture.status === 'skipped') {
    return `${indent}<aitp_tool_run_capture status="skipped" reason="${escapeXml(capture.reason)}" />`;
  }
  if (capture.status === 'failed') {
    return `${indent}<aitp_tool_run_capture status="failed" profile_id="${capture.profileId}" operation="${capture.operation}" reason="${escapeXml(capture.reason)}" />`;
  }
  return [
    `${indent}<aitp_tool_run_capture status="recorded" profile_id="${capture.profileId}" operation="${capture.operation}">`,
    `${indent}  <record_id>${escapeXml(aitpWriteBridgeRecordId(capture.result))}</record_id>`,
    renderStringList('evidence_refs', 'evidence_ref', capture.evidenceRefs, `${indent}  `),
    `${indent}</aitp_tool_run_capture>`,
  ].join('\n');
}

function evidenceRefsForBenchmarkAitpCapture(
  capture: BenchmarkAitpToolRunCapture,
): readonly string[] {
  return capture.status === 'recorded' ? capture.evidenceRefs : [];
}

function renderPrimitiveToolAitpCapture(
  toolCallId: string,
  capture: PrimitiveToolAitpToolRunCapture,
): string {
  if (capture.status === 'skipped') {
    return `<aitp_primitive_tool_run_capture status="skipped" tool_call_id="${escapeXml(toolCallId)}" reason="${escapeXml(capture.reason)}" />\n`;
  }
  if (capture.status === 'failed') {
    return `<aitp_primitive_tool_run_capture status="failed" tool_call_id="${escapeXml(toolCallId)}" profile_id="${capture.profileId}" operation="${capture.operation}" reason="${escapeXml(capture.reason)}" />\n`;
  }
  return [
    `<aitp_primitive_tool_run_capture status="recorded" tool_call_id="${escapeXml(toolCallId)}" profile_id="${capture.profileId}" operation="${capture.operation}">`,
    `  <record_id>${escapeXml(aitpWriteBridgeRecordId(capture.result))}</record_id>`,
    renderStringList('evidence_refs', 'evidence_ref', capture.evidenceRefs, '  '),
    '</aitp_primitive_tool_run_capture>',
    '',
  ].join('\n');
}

function evidenceRefsForPrimitiveToolAitpCapture(
  capture: PrimitiveToolAitpToolRunCapture,
): readonly string[] {
  return capture.status === 'recorded' ? capture.evidenceRefs : [];
}

function renderAitpRuntimePayloadProfiles(
  catalog: AitpRuntimePayloadProfilesCatalog,
): string {
  const benchmarkProfile = aitpRuntimePayloadProfileById(
    catalog,
    'benchmark_adapter_run_to_tool_run',
  );
  const primitiveProfile = aitpRuntimePayloadProfileById(
    catalog,
    PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
  );
  return [
    `<aitp_runtime_payload_profiles catalog_version="${escapeXml(catalog.catalogVersion)}" profile_count="${String(catalog.profileCount)}" read_surface_effect="${catalog.hostUsagePolicy.readSurfaceEffect}" records_validation_result="false" claim_trust_mutation="${catalog.hostUsagePolicy.claimTrustMutation}" can_update_claim_trust="false">`,
    renderStringList('profile_index', 'profile_id', catalog.profileIndex, '  '),
    renderStringList('allowed_uses', 'use', catalog.hostUsagePolicy.allowedUses, '  '),
    renderStringList('forbidden_uses', 'use', catalog.hostUsagePolicy.forbiddenUses, '  '),
    '  <profiles>',
    ...catalog.profiles.map(
      (profile) =>
        `    <profile id="${escapeXml(profile.profileId)}" host_event="${escapeXml(profile.hostEvent)}" target_operation="${profile.targetOperation}" capture_mode="${profile.capturePolicy.captureMode}" host_trigger="${escapeXml(profile.capturePolicy.hostTrigger)}" requires_tool_call_id="${String(profile.capturePolicy.requiresToolCallId)}" records_validation_result="false" claim_trust_mutation="${profile.capturePolicy.claimTrustMutation}" />`,
    ),
    '  </profiles>',
    `  <profile_binding action="run_benchmark_adapter" profile_id="${escapeXml(benchmarkProfile?.profileId ?? '')}" capture_mode="${escapeXml(benchmarkProfile?.capturePolicy.captureMode ?? '')}" />`,
    `  <profile_binding action="capture_primitive_tool_run" profile_id="${escapeXml(primitiveProfile?.profileId ?? '')}" capture_mode="${escapeXml(primitiveProfile?.capturePolicy.captureMode ?? '')}" requires_tool_call_id="${String(primitiveProfile?.capturePolicy.requiresToolCallId ?? false)}" />`,
    '</aitp_runtime_payload_profiles>',
    '',
  ].join('\n');
}

function renderAitpCuratedRagCorpus(corpus: AitpCuratedRagCorpus): string {
  const target = aitpRuntimeBridgeTargetForOperation('readCuratedRagCorpus');
  return [
    `<aitp_curated_rag_corpus catalog_version="${escapeXml(corpus.catalogVersion)}" corpus_id="${escapeXml(corpus.corpusId)}" result_role="${corpus.retrievalPolicy.resultRole}" read_surface_effect="${corpus.retrievalPolicy.readSurfaceEffect}" document_count="${String(corpus.documentCount)}" chunk_count="${String(corpus.chunkCount)}" records_validation_result="false" claim_trust_mutation="${corpus.retrievalPolicy.claimTrustMutation}" can_update_claim_trust="false" requires_promotion_for_claim_support="true">`,
    `  <runtime_target entrypoint_key="${escapeXml(target.entrypointKey)}" mcp_tool="${escapeXml(target.mcpTool)}" cli_fallback="${escapeXml(target.cliFallback)}" surface="${escapeXml(target.surface)}" state_effect="${target.stateEffect}" />`,
    renderStringList('allowed_uses', 'use', corpus.retrievalPolicy.allowedUses, '  '),
    renderStringList('forbidden_uses', 'use', corpus.retrievalPolicy.forbiddenUses, '  '),
    `  <index_policy active_index_mode="${corpus.indexPolicy.activeIndexMode}" embedding_index_required="false" index_is_derived="true" derived_from="${escapeXml(corpus.indexPolicy.derivedFrom)}" stale_index_behavior="${escapeXml(corpus.indexPolicy.staleIndexBehavior)}" />`,
    renderStringList('document_index', 'document_id', corpus.documentIndex, '  '),
    renderStringList('chunk_index', 'chunk_id', corpus.chunkIndex, '  '),
    '  <documents>',
    ...corpus.documents.map(
      (document) =>
        `    <document id="${escapeXml(document.documentId)}" title="${escapeXml(document.title)}" asset_type="${escapeXml(document.assetType)}" source_uri="${escapeXml(document.sourceUri)}" trust_status="${document.trustStatus}" orientation_only="true" can_update_claim_trust="false" />`,
    ),
    '  </documents>',
    '  <chunks>',
    ...corpus.chunks.map(
      (chunk) =>
        `    <chunk id="${escapeXml(chunk.chunkId)}" document_id="${escapeXml(chunk.documentId)}" retrieval_role="${chunk.retrievalRole}" orientation_only="true" can_update_claim_trust="false" token_estimate="${String(chunk.tokenEstimate)}">` +
        `<summary>${escapeXml(chunk.summary)}</summary></chunk>`,
    ),
    '  </chunks>',
    '</aitp_curated_rag_corpus>',
    '',
  ].join('\n');
}

function renderAitpCuratedRagSearchResult(searchResult: AitpCuratedRagSearchResult): string {
  const target = aitpRuntimeBridgeTargetForOperation('searchCuratedRagCorpus');
  return [
    `<aitp_curated_rag_search_result catalog_version="${escapeXml(searchResult.catalogVersion)}" query="${escapeXml(searchResult.query)}" index_mode="${searchResult.indexMode}" result_role="${searchResult.resultRole}" result_count="${String(searchResult.resultCount)}" records_validation_result="false" claim_trust_mutation="${searchResult.claimTrustMutation}" can_update_claim_trust="false" requires_promotion_for_claim_support="true">`,
    `  <runtime_target entrypoint_key="${escapeXml(target.entrypointKey)}" mcp_tool="${escapeXml(target.mcpTool)}" cli_fallback="${escapeXml(target.cliFallback)}" surface="${escapeXml(target.surface)}" state_effect="${target.stateEffect}" />`,
    '  <results>',
    ...searchResult.results.map(
      (item) =>
        `    <result chunk_id="${escapeXml(item.chunkId)}" document_id="${escapeXml(item.documentId)}" score="${String(item.score)}" retrieval_role="${item.retrievalRole}" orientation_only="true" can_update_claim_trust="false" content_hash="${escapeXml(item.contentHash)}">` +
        `<summary>${escapeXml(item.summary)}</summary><text>${escapeXml(item.text)}</text></result>`,
    ),
    '  </results>',
    '  <promotion_boundary>Curated RAG is heuristic_context only; promote source passages through AITP source_asset, reference_location, evidence, validation, and trust preflight records before using them as claim support.</promotion_boundary>',
    '</aitp_curated_rag_search_result>',
    '',
  ].join('\n');
}

function renderAitpCuratedRagChunk(lookup: AitpCuratedRagChunkLookup): string {
  const target = aitpRuntimeBridgeTargetForOperation('readCuratedRagChunk');
  return [
    `<aitp_curated_rag_chunk catalog_version="${escapeXml(lookup.catalogVersion)}" corpus_id="${escapeXml(lookup.corpusId)}" chunk_id="${escapeXml(lookup.chunkId)}" document_id="${escapeXml(lookup.documentId)}" index_mode="${lookup.indexMode}" state_effect="${lookup.stateEffect}" retrieval_role="${lookup.retrievalRole}" read_surface_effect="${lookup.readSurfaceEffect}" lookup_creates_records="false" records_validation_result="false" claim_trust_mutation="${lookup.claimTrustMutation}" can_update_claim_trust="false" requires_promotion_for_claim_support="true" promotion_required_before_claim_support="true">`,
    `  <runtime_target entrypoint_key="${escapeXml(target.entrypointKey)}" mcp_tool="${escapeXml(target.mcpTool)}" cli_fallback="${escapeXml(target.cliFallback)}" surface="${escapeXml(target.surface)}" state_effect="${target.stateEffect}" />`,
    `  <chunk id="${escapeXml(lookup.chunk.chunkId)}" document_id="${escapeXml(lookup.chunk.documentId)}" content_hash="${escapeXml(lookup.chunk.contentHash)}" retrieval_role="${lookup.chunk.retrievalRole}" orientation_only="true" can_update_claim_trust="false" token_estimate="${String(lookup.chunk.tokenEstimate)}" anchor="${escapeXml(JSON.stringify(lookup.chunk.anchor))}"><summary>${escapeXml(lookup.chunk.summary)}</summary><text>${escapeXml(lookup.chunk.text)}</text></chunk>`,
    `  <document id="${escapeXml(lookup.document.documentId)}" title="${escapeXml(lookup.document.title)}" asset_type="${escapeXml(lookup.document.assetType)}" source_uri="${escapeXml(lookup.document.sourceUri)}" version_anchor="${escapeXml(JSON.stringify(lookup.document.versionAnchor))}" content_hash="${escapeXml(lookup.document.contentHash)}" intended_use="${escapeXml(lookup.document.intendedUse)}" trust_status="${lookup.document.trustStatus}" orientation_only="true" can_update_claim_trust="false" />`,
    renderStringList('promotion_path', 'stage', lookup.promotionPath, '  '),
    renderStringList('forbidden_uses', 'use', lookup.forbiddenUses, '  '),
    '  <promotion_boundary retrieval_is_claim_support="false" lookup_is_evidence="false" lookup_records_validation_result="false" lookup_satisfies_final_gate="false" lookup_can_update_claim_trust="false" requires_user_or_model_decision_before_write="true" />',
    '  <next_step>Use this identity, anchor, and hash for review; call ResearchAction.draft_aitp_curated_rag_promotion only if this chunk should enter the explicit promotion path.</next_step>',
    '</aitp_curated_rag_chunk>',
    '',
  ].join('\n');
}

function renderAitpCuratedRagPromotionDraft(
  draft: AitpCuratedRagPromotionDraft,
  bindingId?: string | undefined,
): string {
  const target = aitpRuntimeBridgeTargetForOperation('draftCuratedRagPromotion');
  return [
    `<aitp_curated_rag_promotion_draft catalog_version="${escapeXml(draft.catalogVersion)}" corpus_id="${escapeXml(draft.corpusId)}" chunk_id="${escapeXml(draft.chunkId)}" document_id="${escapeXml(draft.documentId)}" topic_id="${escapeXml(draft.topicId)}" claim_id="${escapeXml(draft.claimId)}" connector_id="${escapeXml(draft.connectorId)}" promotion_intent="${escapeXml(draft.promotionIntent)}" state_effect="${draft.stateEffect}" draft_role="${draft.draftRole}" retrieval_role="${draft.retrievalRole}" read_surface_effect="${draft.readSurfaceEffect}" draft_creates_records="false" records_validation_result="false" claim_trust_mutation="${draft.claimTrustMutation}" can_update_claim_trust="false" requires_promotion_for_claim_support="true"${bindingId === undefined ? '' : ` action_binding_id="${escapeXml(bindingId)}"`}>`,
    `  <runtime_target entrypoint_key="${escapeXml(target.entrypointKey)}" mcp_tool="${escapeXml(target.mcpTool)}" cli_fallback="${escapeXml(target.cliFallback)}" surface="${escapeXml(target.surface)}" state_effect="${target.stateEffect}" />`,
    `  <chunk id="${escapeXml(draft.chunk.chunkId)}" document_id="${escapeXml(draft.chunk.documentId)}" content_hash="${escapeXml(draft.chunk.contentHash)}" retrieval_role="${draft.chunk.retrievalRole}" orientation_only="true" can_update_claim_trust="false"><summary>${escapeXml(draft.chunk.summary)}</summary><text>${escapeXml(draft.chunk.text)}</text></chunk>`,
    `  <document id="${escapeXml(draft.document.documentId)}" title="${escapeXml(draft.document.title)}" asset_type="${escapeXml(draft.document.assetType)}" source_uri="${escapeXml(draft.document.sourceUri)}" content_hash="${escapeXml(draft.document.contentHash)}" trust_status="${draft.document.trustStatus}" orientation_only="true" can_update_claim_trust="false" />`,
    renderStringList('required_context_before_write', 'field', draft.requiredContextBeforeWrite, '  '),
    renderStringList('promotion_path', 'stage', draft.promotionPath, '  '),
    renderStringList('forbidden_uses', 'use', draft.forbiddenUses, '  '),
    '  <draft_operations>',
    ...draft.draftOperations.map(
      (operation) =>
        `    <operation stage="${escapeXml(operation.stage)}" operation="${escapeXml(operation.operation)}" mcp_tool="${escapeXml(operation.mcpTool)}" surface="${escapeXml(operation.surface)}" draft_only="true" creates_record_now="false" claim_support_created="false" cli_template="${escapeXml(operation.cliTemplate)}"${operation.requiresExistingRecords.length === 0 ? '' : ` requires_existing_records="${escapeXml(operation.requiresExistingRecords.join(','))}"`} />`,
    ),
    '  </draft_operations>',
    renderCuratedRagPromotionWriteSequence(draft),
    renderCuratedRagCanonicalIdentityAlignment(draft),
    renderCuratedRagPromotionDecisionTree(draft),
    '  <promotion_boundary retrieval_is_claim_support="false" draft_is_evidence="false" draft_records_validation_result="false" draft_satisfies_final_gate="false" draft_can_update_claim_trust="false" requires_user_or_model_decision_before_write="true" />',
    '</aitp_curated_rag_promotion_draft>',
    '',
  ].join('\n');
}

function renderCuratedRagPromotionDecisionTree(draft: AitpCuratedRagPromotionDraft): string {
  const operations = draft.draftOperations
    .map((operation) => {
      const writeOperation = writeBridgeOperationForPromotionDraft(operation.operation);
      const target =
        writeOperation === undefined ? undefined : aitpRuntimeBridgeTargetForOperation(writeOperation);
      const payload = operation.payloadDraft ?? operation.payloadTemplate;
      return [
        `    <option stage="${escapeXml(operation.stage)}" draft_operation="${escapeXml(operation.operation)}" draft_only="true" creates_record_now="false" claim_support_created="false"${writeOperation === undefined ? '' : ` next_research_action="execute_aitp_write_bridge" aitp_operation="${writeOperation}" mcp_tool="${escapeXml(target?.mcpTool ?? '')}" surface="${escapeXml(target?.surface ?? '')}" state_effect="${escapeXml(target?.stateEffect ?? '')}"`}>`,
        `      <decision>Only execute this as a separate explicit AITP write/preflight bridge call after reviewing required context and replacing placeholders.</decision>`,
        renderStringList(
          'requires_existing_records',
          'record',
          operation.requiresExistingRecords,
          '      ',
        ),
        `      <payload>${escapeXml(JSON.stringify(payload ?? {}))}</payload>`,
        '    </option>',
      ].join('\n');
    });
  return [
    '  <promotion_decision_tree selected_write_executed="false" requires_explicit_next_write_choice="true">',
    ...operations,
    '  </promotion_decision_tree>',
  ].join('\n');
}

function renderCuratedRagPromotionWriteSequence(
  draft: AitpCuratedRagPromotionDraft,
  selectedStage?: string | undefined,
): string {
  return [
    `  <promotion_write_sequence source="aitp_curated_rag_promotion_draft" step_count="${String(draft.promotionWriteSequence.length)}" read_only="true" executes_write_now="false" records_validation_result="false" claim_trust_mutation="none" requires_explicit_execute_call="true">`,
    ...draft.promotionWriteSequence.map((step) => {
      const selected = selectedStage === undefined ? '' : ` selected="${String(step.stage === selectedStage)}"`;
      return `    <step order="${String(step.order)}" stage="${escapeXml(step.stage)}" operation="${escapeXml(step.operation)}" surface="${escapeXml(step.surface)}" output_ref="${escapeXml(step.outputRef)}" requires_prior_refs="${escapeXml(step.requiresPriorRefs.join(','))}" feeds_next_stages="${escapeXml(step.feedsNextStages.join(','))}" requires_explicit_execute_call="true" executes_write_now="false" records_validation_result="false" claim_trust_mutation="none"${selected} />`;
    }),
    '  </promotion_write_sequence>',
  ].join('\n');
}

function renderCuratedRagCanonicalIdentityAlignment(
  draft: AitpCuratedRagPromotionDraft,
  callDraft?: CuratedRagPromotionWriteBridgeCallDraft | undefined,
): string {
  const operations =
    callDraft === undefined ? draft.draftOperations : [callDraft.selectedOperation];
  return [
    `  <canonical_identity_alignment chunk_id="${escapeXml(draft.chunkId)}" document_id="${escapeXml(draft.documentId)}" content_hash="${escapeXml(draft.chunk.contentHash)}" alignment_role="${callDraft === undefined ? 'promotion_draft' : 'selected_write_bridge_call'}" draft_creates_records="false" executes_write_now="false" claim_support_created="false">`,
    ...operations.map((operation) =>
      renderCuratedRagCanonicalIdentityOperation(
        draft,
        operation,
        callDraft !== undefined ? callDraft.payload : (operation.payloadDraft ?? operation.payloadTemplate ?? {}),
        callDraft?.recordRefLookup,
      ),
    ),
    '  </canonical_identity_alignment>',
  ].join('\n');
}

function renderCuratedRagCanonicalIdentityOperation(
  draft: AitpCuratedRagPromotionDraft,
  operation: AitpCuratedRagPromotionDraftOperation,
  payload: Readonly<Record<string, unknown>>,
  lookup?: CuratedRagPayloadRefLookup | undefined,
): string {
  const futureRecordKind = futureRecordKindForPromotionOperation(operation.operation);
  const canonicalPrefix = canonicalRefPrefixForFutureRecordKind(futureRecordKind);
  const payloadIdentity = curatedRagPayloadIdentity(payload);
  return [
    `    <record_alignment stage="${escapeXml(operation.stage)}" operation="${escapeXml(operation.operation)}" future_record_kind="${escapeXml(futureRecordKind)}" canonical_ref_prefix="${escapeXml(canonicalPrefix)}" id_source="aitp_write_result_after_explicit_execute" draft_only="true" creates_record_now="false" existing_record_required_count="${String(operation.requiresExistingRecords.length)}" placeholder_ref_count="${String(payloadIdentity.placeholderCount)}" concrete_ref_count="${String(payloadIdentity.concreteCount)}">`,
    `      <source_chunk document_id="${escapeXml(draft.documentId)}" chunk_id="${escapeXml(draft.chunkId)}" content_hash="${escapeXml(draft.chunk.contentHash)}" source_uri="${escapeXml(draft.document.sourceUri)}" orientation_only="true" />`,
    renderStringList('requires_existing_records', 'record', operation.requiresExistingRecords, '      '),
    renderStringList('payload_identity_fields', 'field', payloadIdentity.fields, '      '),
    renderPayloadRefReadiness(payloadIdentity.refs, '      ', lookup),
    '    </record_alignment>',
  ].join('\n');
}

function futureRecordKindForPromotionOperation(operation: string): string {
  switch (operation) {
    case 'registerSourceAsset':
      return 'source_asset_record';
    case 'recordReferenceLocation':
      return 'reference_location_record';
    case 'recordEvidence':
      return 'evidence_record';
    case 'createValidationContract':
      return 'validation_contract_record';
    case 'preflightTrustUpdate':
      return 'trust_update_preflight';
    default:
      return 'aitp_record';
  }
}

function canonicalRefPrefixForFutureRecordKind(kind: string): string {
  switch (kind) {
    case 'source_asset_record':
      return 'source_asset:';
    case 'reference_location_record':
      return 'reference_location:';
    case 'evidence_record':
      return 'evidence:';
    case 'validation_contract_record':
      return 'validation_contract:';
    case 'trust_update_preflight':
      return 'trust_preflight:';
    default:
      return 'aitp:';
  }
}

function curatedRagPayloadIdentity(
  payload: Readonly<Record<string, unknown>>,
): {
  readonly fields: readonly string[];
  readonly refs: readonly string[];
  readonly placeholderCount: number;
  readonly concreteCount: number;
} {
  const identityFields = [
    'topic_id',
    'claim_id',
    'connector_id',
    'asset_type',
    'uri',
    'title',
    'source_ref',
    'source_refs',
    'derived_from',
    'reference_location_ids',
    'evidence_refs',
  ];
  const fields = uniqueStrings(identityFields.filter((field) => payload[field] !== undefined));
  const refs = uniqueStrings(
    fields.flatMap((field) => refsFromPayloadIdentityValue(payload[field])),
  );
  return {
    fields,
    refs,
    placeholderCount: refs.filter(isPlaceholderRef).length,
    concreteCount: refs.filter((ref) => !isPlaceholderRef(ref)).length,
  };
}

function refsFromPayloadIdentityValue(value: unknown): readonly string[] {
  if (typeof value === 'string') return value.length > 0 ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(refsFromPayloadIdentityValue);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(refsFromPayloadIdentityValue);
}

function renderPayloadRefReadiness(
  refs: readonly string[],
  indent: string,
  lookup?: CuratedRagPayloadRefLookup | undefined,
): string {
  if (refs.length === 0) {
    return `${indent}<payload_ref_readiness placeholder_ref_count="0" concrete_ref_count="0" confirmation_source="syntax_only" aitp_lookup_performed="false" requires_aitp_lookup_before_execution="true" />`;
  }
  const placeholderCount = refs.filter(isPlaceholderRef).length;
  const concreteCount = refs.length - placeholderCount;
  if (lookup?.status === 'performed') {
    const byRef = new Map(lookup.lookup.refs.map((item) => [item.ref, item]));
    const confirmedCount = refs.filter((ref) => byRef.get(ref)?.recordConfirmed === true).length;
    const repairChecklist = renderMissingRefRepairChecklist(
      refs.map((ref) => byRef.get(ref)).filter(isMissingRefRepairItem),
      indent,
    );
    return [
      `${indent}<payload_ref_readiness placeholder_ref_count="${String(placeholderCount)}" concrete_ref_count="${String(concreteCount)}" confirmation_source="aitp_record_ref_lookup" aitp_lookup_performed="true" lookup_scope="${escapeXml(lookup.lookup.lookupScope)}" lookup_count="${String(lookup.lookup.lookupCount)}" found_count="${String(lookup.lookup.foundCount)}" missing_count="${String(lookup.lookup.missingCount)}" unsupported_count="${String(lookup.lookup.unsupportedCount)}" malformed_count="${String(lookup.lookup.malformedCount)}" confirmed_ref_count="${String(confirmedCount)}" read_surface_effect="${escapeXml(lookup.lookup.readSurfaceEffect)}" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" can_update_claim_trust="false" requires_aitp_lookup_before_execution="false">`,
      ...refs.map((ref) => renderPayloadRefReadinessItem(ref, byRef.get(ref), indent)),
      ...(repairChecklist === undefined ? [] : [repairChecklist]),
      `${indent}</payload_ref_readiness>`,
    ].join('\n');
  }
  if (lookup?.status === 'failed') {
    return [
      `${indent}<payload_ref_readiness placeholder_ref_count="${String(placeholderCount)}" concrete_ref_count="${String(concreteCount)}" confirmation_source="aitp_record_ref_lookup_failed" aitp_lookup_performed="false" lookup_error="${escapeXml(lookup.reason)}" requires_aitp_lookup_before_execution="true">`,
      ...refs.map(
        (ref) =>
          `${indent}  <ref status="${isPlaceholderRef(ref) ? 'placeholder' : 'concrete'}" aitp_record_confirmed="false">${escapeXml(ref)}</ref>`,
      ),
      `${indent}</payload_ref_readiness>`,
    ].join('\n');
  }
  const reason = lookup?.status === 'not_requested' ? lookup.reason : 'aitp_record_ref_lookup_provider_unavailable';
  return [
    `${indent}<payload_ref_readiness placeholder_ref_count="${String(placeholderCount)}" concrete_ref_count="${String(concreteCount)}" confirmation_source="syntax_only" aitp_lookup_performed="false" lookup_not_requested_reason="${escapeXml(reason)}" requires_aitp_lookup_before_execution="true">`,
    ...refs.map(
      (ref) =>
        `${indent}  <ref status="${isPlaceholderRef(ref) ? 'placeholder' : 'concrete'}" aitp_record_confirmed="false">${escapeXml(ref)}</ref>`,
    ),
    `${indent}</payload_ref_readiness>`,
  ].join('\n');
}

function renderPayloadRefReadinessItem(
  ref: string,
  lookup: AitpRecordRefLookupItem | undefined,
  indent: string,
): string {
  if (isPlaceholderRef(ref)) {
    return `${indent}  <ref status="placeholder" aitp_record_confirmed="false">${escapeXml(ref)}</ref>`;
  }
  if (lookup === undefined) {
    return `${indent}  <ref status="concrete" aitp_record_confirmed="false" lookup_status="not_requested">${escapeXml(ref)}</ref>`;
  }
  const suggestedNext =
    lookup.suggestedNextOperation.length === 0
      ? ''
      : ` suggested_next_operation="${escapeXml(lookup.suggestedNextOperation)}" suggested_next_entrypoint="${escapeXml(lookup.suggestedNextEntrypoint)}" suggested_next_surface="${escapeXml(lookup.suggestedNextSurface)}" suggested_next_reason="${escapeXml(lookup.suggestedNextReason)}"`;
  return `${indent}  <ref status="concrete" aitp_record_confirmed="${String(lookup.recordConfirmed)}" lookup_status="${lookup.status}" ref_kind="${escapeXml(lookup.refKind)}" record_id="${escapeXml(lookup.recordId)}" surface="${escapeXml(lookup.surface)}" read_surface_effect="${escapeXml(lookup.readSurfaceEffect)}" records_validation_result="false" source_support_result="false" claim_trust_mutation="none"${suggestedNext}>${escapeXml(ref)}</ref>`;
}

function isMissingRefRepairItem(
  item: AitpRecordRefLookupItem | undefined,
): item is AitpRecordRefLookupItem {
  return item?.status === 'not_found' && item.suggestedNextOperation.length > 0;
}

function renderMissingRefRepairChecklist(
  items: readonly AitpRecordRefLookupItem[],
  indent: string,
): string | undefined {
  if (items.length === 0) return undefined;
  return [
    `${indent}  <missing_ref_repair_checklist item_count="${String(items.length)}" source="aitp_record_ref_lookup" read_only="true" executes_write_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" requires_explicit_execute_call="true" repair_action_hint_only="true" selected_write_call_unchanged="true">`,
    ...items.map(
      (item) =>
        `${indent}    <repair_item ref="${escapeXml(item.ref)}" ref_kind="${escapeXml(item.refKind)}" record_id="${escapeXml(item.recordId)}" suggested_next_operation="${escapeXml(item.suggestedNextOperation)}" suggested_next_entrypoint="${escapeXml(item.suggestedNextEntrypoint)}" suggested_next_surface="${escapeXml(item.suggestedNextSurface)}" next_research_action="execute_aitp_write_bridge" next_aitp_operation="${escapeXml(item.suggestedNextOperation)}" next_operation_source="aitp_record_ref_lookup" repair_action_hint_only="true" selected_write_call_unchanged="true" next_step="${escapeXml(item.suggestedNextReason)}" />`,
    ),
    `${indent}  </missing_ref_repair_checklist>`,
  ].join('\n');
}

function concreteLookupRefs(refs: readonly string[]): readonly string[] {
  return uniqueStrings(
    refs.filter((ref) => !isPlaceholderRef(ref) && looksLikeAitpRecordRef(ref)),
  );
}

function looksLikeAitpRecordRef(ref: string): boolean {
  const kind = aitpRecordRefKind(ref);
  return (
    kind !== undefined &&
    [
      'artifact',
      'claim',
      'code_state',
      'evidence',
      'reference_location',
      'source_asset',
      'tool_run',
      'validation_contract',
      'validation_result',
    ].includes(kind)
  );
}

function aitpRecordRefKind(ref: string): string | undefined {
  const parts = ref.trim().split(':');
  if (parts.length < 2) return undefined;
  return parts[0] === 'aitp' ? parts[1] : parts[0];
}

function aitpRecordRefId(ref: string): string | undefined {
  const parts = ref.trim().split(':');
  if (parts.length < 2) return undefined;
  return parts.at(-1);
}

function isPlaceholderRef(ref: string): boolean {
  const trimmed = ref.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>');
}

function curatedRagPromotionWriteBridgeCallSelector(args: ResearchActionToolInput):
  | {
      readonly isError: false;
      readonly selector: CuratedRagPromotionWriteBridgeCallSelector;
    }
  | { readonly isError: true; readonly message: string } {
  const stage = args.promotion_draft_stage;
  const operation = args.promotion_draft_operation;
  if (stage === undefined && operation === undefined) {
    return {
      isError: true,
      message:
        'ResearchAction draft_aitp_curated_rag_write_bridge_call requires promotion_draft_stage or promotion_draft_operation.',
    };
  }
  return { isError: false, selector: { stage, operation } };
}

function promotionCarriedRefsFromInput(args: ResearchActionToolInput):
  | { readonly isError: false; readonly refs: readonly string[] }
  | { readonly isError: true; readonly message: string } {
  const refs = args.promotion_carried_refs ?? [];
  const handoffRefs: string[] = [];
  for (const [index, handoff] of (args.promotion_carried_ref_handoffs ?? []).entries()) {
    const canonicalRef = stringRecordValue(handoff, 'canonical_ref', 'canonicalRef');
    if (canonicalRef === undefined || canonicalRef.trim().length === 0) {
      return carriedRefHandoffError(index, 'missing_canonical_ref', 'requires canonical_ref.', 'canonical_ref');
    }
    const evidenceRef = stringRecordValue(handoff, 'evidence_ref', 'evidenceRef');
    if (evidenceRef === undefined || evidenceRef.trim().length === 0) {
      return carriedRefHandoffError(index, 'missing_evidence_ref', 'requires evidence_ref.', 'evidence_ref');
    }
    const refKind = stringRecordValue(handoff, 'ref_kind', 'refKind');
    const canonicalKind = aitpRecordRefKind(canonicalRef);
    if (refKind === undefined || refKind.trim().length === 0) {
      return carriedRefHandoffError(index, 'missing_ref_kind', 'requires ref_kind.', 'ref_kind');
    }
    if (canonicalKind === undefined || canonicalRef.trim().startsWith('aitp:') || canonicalKind !== refKind) {
      return carriedRefHandoffError(
        index,
        'canonical_ref_dialect_or_kind_mismatch',
        'canonical_ref must use the next-payload ref dialect and match ref_kind.',
        'canonical_ref',
      );
    }
    if (aitpRecordRefKind(evidenceRef) !== refKind) {
      return carriedRefHandoffError(
        index,
        'evidence_ref_kind_mismatch',
        'evidence_ref must match ref_kind.',
        'evidence_ref',
      );
    }
    const recordId = stringRecordValue(handoff, 'record_id', 'recordId');
    if (recordId === undefined || recordId.trim().length === 0) {
      return carriedRefHandoffError(index, 'missing_record_id', 'requires record_id.', 'record_id');
    }
    if (aitpRecordRefId(canonicalRef) !== recordId) {
      return carriedRefHandoffError(
        index,
        'canonical_ref_record_id_mismatch',
        'canonical_ref record id must match record_id.',
        'canonical_ref',
      );
    }
    if (aitpRecordRefId(evidenceRef) !== recordId) {
      return carriedRefHandoffError(
        index,
        'evidence_ref_record_id_mismatch',
        'evidence_ref record id must match record_id.',
        'evidence_ref',
      );
    }
    handoffRefs.push(canonicalRef);
  }
  return {
    isError: false,
    refs: uniqueStrings([...refs, ...handoffRefs].map((ref) => ref.trim()).filter((ref) => ref.length > 0)),
  };
}

const CARRIED_REF_HANDOFF_REMEDIATION_BY_CODE: Record<
  CarriedRefHandoffFailureCode,
  CarriedRefHandoffRemediationStep
> = {
  canonical_ref_dialect_or_kind_mismatch: 'use_next_payload_canonical_ref',
  canonical_ref_record_id_mismatch: 'copy_record_id_from_canonical_ref',
  evidence_ref_kind_mismatch: 'use_evidence_ref_for_same_record',
  evidence_ref_record_id_mismatch: 'use_evidence_ref_for_same_record',
  missing_canonical_ref: 'copy_required_handoff_field_from_execute_result',
  missing_evidence_ref: 'copy_required_handoff_field_from_execute_result',
  missing_record_id: 'copy_required_handoff_field_from_execute_result',
  missing_ref_kind: 'copy_required_handoff_field_from_execute_result',
};

function carriedRefHandoffError(
  index: number,
  code: CarriedRefHandoffFailureCode,
  reason: string,
  field: string,
): { readonly isError: true; readonly message: string } {
  const path = `promotion_carried_ref_handoffs[${String(index)}].${field}`;
  const nextStep = CARRIED_REF_HANDOFF_REMEDIATION_BY_CODE[code];
  const repairTarget = `promotion_carried_ref_handoffs[${String(index)}]`;
  return {
    isError: true,
    message: [
      `<carried_ref_handoff_failure status="failed" code="${escapeXml(code)}" field="${escapeXml(field)}" path="${escapeXml(path)}" index="${String(index)}" suggestion_rendered="false" next_call_pointer_rendered="false" bridge_called="false" executes_write_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none">`,
      `  <message>ResearchAction draft_aitp_curated_rag_write_bridge_call received malformed promotion_carried_ref_handoffs[${String(index)}]: ${escapeXml(reason)}</message>`,
      `  <remediation_summary next_step="${escapeXml(nextStep)}" repair_target="${escapeXml(repairTarget)}" retry_requires_fresh_draft_action="true" mutates_handoff_now="false" />`,
      '</carried_ref_handoff_failure>',
    ].join('\n'),
  };
}

function curatedRagPromotionWriteBridgeCallDraft(
  draft: AitpCuratedRagPromotionDraft,
  selector: CuratedRagPromotionWriteBridgeCallSelector,
  reviewedOverrides: Readonly<Record<string, unknown>> | undefined,
  carriedRefs: readonly string[] | undefined,
):
  | {
      readonly isError: false;
      readonly draft: CuratedRagPromotionWriteBridgeCallDraft;
    }
  | { readonly isError: true; readonly message: string } {
  const selected = draft.draftOperations.find(
    (operation) =>
      (selector.stage === undefined || operation.stage === selector.stage) &&
      (selector.operation === undefined || operation.operation === selector.operation),
  );
  if (selected === undefined) {
    return {
      isError: true,
      message:
        `Curated RAG promotion draft does not contain a selected operation for stage="${selector.stage ?? ''}" operation="${selector.operation ?? ''}".`,
    };
  }
  const aitpOperation = writeBridgeOperationForPromotionDraft(selected.operation);
  if (aitpOperation === undefined) {
    return {
      isError: true,
      message: `Curated RAG promotion draft operation "${selected.operation}" cannot be mapped to execute_aitp_write_bridge.`,
    };
  }
  const payloadSource =
    selected.payloadDraft !== undefined
      ? 'payload_draft'
      : selected.payloadTemplate !== undefined
        ? 'payload_template'
        : 'empty_payload';
  const originalPayload = selected.payloadDraft ?? selected.payloadTemplate ?? {};
  const overrides = reviewedOverrides ?? {};
  const payload = { ...originalPayload, ...overrides };
  const carriedRefSuggestion = curatedRagCarriedRefOverrideSuggestion(
    selected.stage,
    payload,
    carriedRefs ?? [],
  );
  const diagnostics = curatedRagPromotionWriteBridgeCallDiagnostics(draft, selected, aitpOperation, payload);
  const originalDiagnostics = curatedRagPromotionWriteBridgeCallDiagnostics(
    draft,
    selected,
    aitpOperation,
    originalPayload,
  );
  const overrideDiagnostics = curatedRagPromotionWriteBridgeCallOverrideDiagnostics(
    originalPayload,
    payload,
    overrides,
  );
  return {
    isError: false,
    draft: {
      stage: selected.stage,
      draftOperation: selected.operation,
      aitpOperation,
      actionId: actionIdForAitpWriteBridgeOperation(aitpOperation),
      selectedOperation: selected,
      originalPayload,
      payload,
      payloadSource,
      reviewedOverrides: overrides,
      requiredExistingRecords: selected.requiresExistingRecords,
      diagnostics,
      overrideDiagnostics,
      originalUnresolvedPlaceholderCount: originalDiagnostics.filter((item) => item.code === 'placeholder_value').length,
      unresolvedPlaceholderCount: diagnostics.filter((item) => item.code === 'placeholder_value').length,
      carriedRefSuggestion,
    },
  };
}

function curatedRagPromotionWriteBridgeCallDiagnostics(
  draft: AitpCuratedRagPromotionDraft,
  operation: AitpCuratedRagPromotionDraftOperation,
  aitpOperation: AitpWriteBridgeOperation,
  payload: Readonly<Record<string, unknown>>,
): readonly CuratedRagPromotionWriteBridgeCallDiagnostic[] {
  const diagnostics: CuratedRagPromotionWriteBridgeCallDiagnostic[] = [];
  for (const field of requiredFieldsForPromotionWriteOperation(aitpOperation)) {
    if (fieldIsEmpty(payload, field)) {
      diagnostics.push({
        code: 'missing_required_field',
        field,
        message: `AITP ${aitpOperation} requires ${field} before this draft can be executed.`,
      });
    }
  }
  for (const field of draft.requiredContextBeforeWrite) {
    diagnostics.push({
      code: 'missing_draft_context',
      field,
      message: `The AITP promotion draft reports missing ${field}; resolve it before any write/preflight call.`,
    });
  }
  for (const field of placeholderFieldPaths(payload)) {
    diagnostics.push({
      code: 'placeholder_value',
      field,
      message: `Replace placeholder ${field} with a real AITP record id or reviewed value before execution.`,
    });
  }
  const payloadRefs = curatedRagPayloadIdentity(payload).refs;
  for (const missing of missingSequencePriorRefs(draft, operation.stage, payloadRefs)) {
    diagnostics.push({
      code: 'missing_sequence_prior_ref',
      field: missing.refKind,
      message:
        `AITP promotion_write_sequence requires a ${missing.refKind} ref matching ${missing.pattern} before executing ${aitpOperation}.`,
    });
  }
  for (const record of operation.requiresExistingRecords) {
    diagnostics.push({
      code: 'requires_existing_record',
      field: record,
      message: `This option depends on an existing ${record}; create or identify that AITP record first.`,
    });
  }
  diagnostics.push({
    code: 'manual_review_required',
    message:
      'Review the source passage, claim scope, and AITP record refs before calling execute_aitp_write_bridge.',
  });
  return diagnostics;
}

function missingSequencePriorRefs(
  draft: AitpCuratedRagPromotionDraft,
  selectedStage: string,
  payloadRefs: readonly string[],
): readonly { readonly refKind: string; readonly pattern: string }[] {
  const step = draft.promotionWriteSequence.find((item) => item.stage === selectedStage);
  if (step === undefined || step.requiresPriorRefs.length === 0) return [];
  return step.requiresPriorRefs
    .map((pattern) => ({ refKind: refKindFromSequencePattern(pattern), pattern }))
    .filter((item) => item.refKind.length > 0)
    .filter((item) => !payloadRefs.some((ref) => refMatchesSequencePriorKind(ref, item.refKind)));
}

function refKindFromSequencePattern(pattern: string): string {
  return aitpRecordRefKind(pattern) ?? '';
}

function refMatchesSequencePriorKind(ref: string, refKind: string): boolean {
  return aitpRecordRefKind(ref) === refKind;
}

function curatedRagCarriedRefOverrideSuggestion(
  selectedStage: string,
  payload: Readonly<Record<string, unknown>>,
  carriedRefs: readonly string[],
): CuratedRagCarriedRefOverrideSuggestion | undefined {
  const refs = uniqueStrings(carriedRefs.map((ref) => ref.trim()).filter((ref) => ref.length > 0));
  if (refs.length === 0) return undefined;
  const target = carriedRefOverrideTargetForStage(selectedStage);
  if (target === undefined) {
  return {
    selectedStage,
    selectedOperation: operationForPromotionStage(selectedStage) ?? '',
    refs,
    usedRefs: [],
      unusedRefs: refs,
      suggestedOverrides: {},
      targetField: '',
      reason: `No carried-ref override target is defined for promotion stage ${selectedStage}.`,
      appliedByReviewedOverride: false,
    };
  }
  const usedRefs = refs.filter((ref) => target.refKinds.includes(aitpRecordRefKind(ref) ?? ''));
  const unusedRefs = refs.filter((ref) => !usedRefs.includes(ref));
  const existingValue = payload[target.field];
  const existingRefs = target.mode === 'array'
    ? concreteStringArrayValue(existingValue)
    : typeof existingValue === 'string' && !isPlaceholderRef(existingValue)
      ? [existingValue]
      : [];
  const appliedByReviewedOverride = usedRefs.length > 0 && usedRefs.every((ref) => existingRefs.includes(ref));
  const suggestedValue = target.mode === 'array'
    ? uniqueStrings([...existingRefs, ...usedRefs])
    : usedRefs[0] ?? existingRefs[0] ?? '';
  const suggestedOverrides =
    usedRefs.length === 0 ? {} : { [target.field]: suggestedValue };
  return {
    selectedStage,
    selectedOperation: operationForPromotionStage(selectedStage) ?? '',
    refs,
    usedRefs,
    unusedRefs,
    suggestedOverrides,
    targetField: target.field,
    reason: target.reason,
    appliedByReviewedOverride,
  };
}

function carriedRefOverrideTargetForStage(
  selectedStage: string,
): { readonly field: string; readonly refKinds: readonly string[]; readonly mode: 'array' | 'string'; readonly reason: string } | undefined {
  switch (selectedStage) {
    case 'reference_location':
      return {
        field: 'source_ref',
        refKinds: ['source_asset'],
        mode: 'string',
        reason: 'Carry the explicit source_asset write result into the reviewed reference-location payload.',
      };
    case 'evidence':
      return {
        field: 'source_refs',
        refKinds: ['source_asset', 'reference_location'],
        mode: 'array',
        reason: 'Carry explicit source_asset/reference_location write results into the reviewed evidence payload.',
      };
    default:
      return undefined;
  }
}

function operationForPromotionStage(stage: string): string | undefined {
  switch (stage) {
    case 'source_asset':
      return 'registerSourceAsset';
    case 'reference_location':
      return 'recordReferenceLocation';
    case 'evidence':
      return 'recordEvidence';
    case 'validation':
      return 'createValidationContract';
    case 'trust_preflight':
      return 'preflightTrustUpdate';
    default:
      return undefined;
  }
}

function curatedRagPromotionWriteBridgeCallOverrideDiagnostics(
  originalPayload: Readonly<Record<string, unknown>>,
  reviewedPayload: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, unknown>>,
): readonly CuratedRagPromotionWriteBridgeCallDiagnostic[] {
  const diagnostics: CuratedRagPromotionWriteBridgeCallDiagnostic[] = [];
  for (const key of Object.keys(overrides)) {
    if (!(key in originalPayload)) {
      diagnostics.push({
        code: 'reviewed_override_adds_field',
        field: key,
        message:
          `Reviewed override adds ${key}; confirm this field is accepted by the selected AITP write/preflight target before execution.`,
      });
      continue;
    }
    diagnostics.push({
      code: 'reviewed_override_applied',
      field: key,
      message: `Reviewed override replaces AITP draft payload field ${key} in the returned call draft only.`,
    });
  }
  for (const field of placeholderFieldPaths(originalPayload)) {
    if (!placeholderFieldPaths(reviewedPayload).includes(field)) {
      diagnostics.push({
        code: 'reviewed_override_resolves_placeholder',
        field,
        message: `Reviewed override resolves placeholder ${field} in the returned call draft.`,
      });
    }
  }
  for (const field of placeholderFieldPaths(reviewedPayload)) {
    if (!placeholderFieldPaths(originalPayload).includes(field)) {
      diagnostics.push({
        code: 'reviewed_override_introduces_placeholder',
        field,
        message: `Reviewed override still contains placeholder ${field}; replace it before execution.`,
      });
    }
  }
  if (Object.keys(overrides).length > 0) {
    diagnostics.push({
      code: 'reviewed_overrides_not_executed',
      message:
        'Reviewed overrides only change this returned call draft; execute_aitp_write_bridge still requires a separate explicit call.',
    });
  }
  return diagnostics;
}

function requiredFieldsForPromotionWriteOperation(operation: AitpWriteBridgeOperation): readonly string[] {
  switch (operation) {
    case 'registerSourceAsset':
      return ['topic_id', 'asset_type', 'uri', 'title'];
    case 'recordReferenceLocation':
      return ['topic_id', 'connector_id', 'location_type', 'uri', 'label'];
    case 'recordEvidence':
      return ['topic_id', 'claim_id', 'evidence_type', 'status', 'summary'];
    case 'createValidationContract':
      return ['topic_id', 'claim_id', 'required_checks', 'failure_modes', 'required_evidence_outputs'];
    case 'preflightTrustUpdate':
      return ['action', 'session_id', 'topic_id', 'claim_id'];
    default:
      return [];
  }
}

function fieldIsEmpty(record: Readonly<Record<string, unknown>>, field: string): boolean {
  const value = record[field];
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null;
}

function concreteStringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && !isPlaceholderRef(item));
}

function placeholderFieldPaths(value: unknown, path = ''): readonly string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.startsWith('<') && trimmed.endsWith('>') ? [path] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => placeholderFieldPaths(item, `${path}[${String(index)}]`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    placeholderFieldPaths(item, path.length === 0 ? key : `${path}.${key}`),
  );
}

function renderAitpCuratedRagWriteBridgeCallDraft(
  sourceDraft: AitpCuratedRagPromotionDraft,
  callDraft: CuratedRagPromotionWriteBridgeCallDraft,
  bindingId?: string | undefined,
): string {
  const target = aitpRuntimeBridgeTargetForOperation(callDraft.aitpOperation);
  const toolCall: AitpWriteBridgeToolCallDraft = {
    action: 'execute_aitp_write_bridge',
    aitp_operation: callDraft.aitpOperation,
    aitp_payload: callDraft.payload,
  };
  const overrideCount = Object.keys(callDraft.reviewedOverrides).length;
  const confirmation = curatedRagPromotionWriteBridgeConfirmationSummary(callDraft);
  const repairHintOperations = missingRefRepairHintOperations(callDraft.recordRefLookup);
  const selectedWriteDiffersFromRepairHints =
    repairHintOperations.length > 0 && !repairHintOperations.includes(callDraft.aitpOperation);
  const handoffArtifact = curatedRagPromotionWriteBridgeHandoffArtifact(
    sourceDraft,
    callDraft,
    confirmation,
    toolCall,
    bindingId,
  );
  return [
    `<aitp_curated_rag_write_bridge_call_draft chunk_id="${escapeXml(sourceDraft.chunkId)}" document_id="${escapeXml(sourceDraft.documentId)}" stage="${escapeXml(callDraft.stage)}" draft_operation="${escapeXml(callDraft.draftOperation)}" next_research_action="execute_aitp_write_bridge" aitp_operation="${callDraft.aitpOperation}" action_id="${escapeXml(callDraft.actionId)}" payload_source="${callDraft.payloadSource}" reviewed_override_count="${String(overrideCount)}" original_unresolved_placeholder_count="${String(callDraft.originalUnresolvedPlaceholderCount)}" unresolved_placeholder_count="${String(callDraft.unresolvedPlaceholderCount)}" confirmation_status="${confirmation.status}" repair_hint_operation_count="${String(repairHintOperations.length)}" repair_hint_operations="${escapeXml(repairHintOperations.join(','))}" repair_hint_summary_source="missing_ref_repair_checklist" selected_write_differs_from_repair_hints="${String(selectedWriteDiffersFromRepairHints)}" repair_action_hint_only="true" selected_write_call_unchanged="true" handoff_id="${escapeXml(handoffArtifact.handoffId)}" diagnostic_hash="${escapeXml(handoffArtifact.diagnosticHash)}" execute_call_allowed_after_explicit_confirmation="${String(confirmation.executeCallAllowedAfterExplicitConfirmation)}" executes_write_now="false" selected_write_executed="false" reviewed_overrides_executed="false" records_validation_result="false" claim_trust_mutation="none" can_update_claim_trust="false" requires_explicit_execute_call="true"${bindingId === undefined ? '' : ` action_binding_id="${escapeXml(bindingId)}"`}>`,
    `  <runtime_target entrypoint_key="${escapeXml(target.entrypointKey)}" mcp_tool="${escapeXml(target.mcpTool)}" cli_fallback="${escapeXml(target.cliFallback)}" surface="${escapeXml(target.surface)}" preferred_transport="${target.preferredTransport}" fallback_transport="${target.fallbackTransport}" state_effect="${target.stateEffect}" claim_trust_mutation="${target.claimTrustMutation}" />`,
    `  <tool_call_json>${escapeXml(JSON.stringify(toolCall))}</tool_call_json>`,
    `  <original_payload_json>${escapeXml(JSON.stringify(callDraft.originalPayload))}</original_payload_json>`,
    `  <reviewed_overrides_json>${escapeXml(JSON.stringify(callDraft.reviewedOverrides))}</reviewed_overrides_json>`,
    `  <reviewed_payload_json>${escapeXml(JSON.stringify(callDraft.payload))}</reviewed_payload_json>`,
    renderAitpCuratedRagCarriedRefOverrideSuggestion(callDraft.carriedRefSuggestion, sourceDraft, '  '),
    renderStringList('required_existing_records', 'record', callDraft.requiredExistingRecords, '  '),
    renderCuratedRagPromotionWriteSequence(sourceDraft, callDraft.stage),
    renderCuratedRagCanonicalIdentityAlignment(sourceDraft, callDraft),
    renderAitpCuratedRagWriteBridgeConfirmationSummary(confirmation, '  '),
    renderReadinessCallPointer(handoffArtifact, '  '),
    renderReadinessInspectionSummary('curated_rag_write_call_draft', '  '),
    renderReadinessInspectionChecklist('curated_rag_write_call_draft', handoffArtifact.handoffId, '  '),
    renderAitpCuratedRagWriteBridgeHandoffArtifact(handoffArtifact, '  '),
    renderAitpCuratedRagWriteBridgeCallOverrideDiagnostics(callDraft.overrideDiagnostics, '  '),
    renderAitpCuratedRagWriteBridgeCallDiagnostics(callDraft.diagnostics, '  '),
    '  <promotion_boundary draft_is_evidence="false" draft_records_validation_result="false" draft_satisfies_final_gate="false" draft_can_update_claim_trust="false" requires_user_or_model_decision_before_write="true" />',
    '</aitp_curated_rag_write_bridge_call_draft>',
    '',
  ].join('\n');
}

function renderAitpCuratedRagCarriedRefOverrideSuggestion(
  suggestion: CuratedRagCarriedRefOverrideSuggestion | undefined,
  sourceDraft: AitpCuratedRagPromotionDraft,
  indent: string,
): string {
  if (suggestion === undefined) return '';
  const appliedByReviewedOverride = carriedRefSuggestionAppliedByPayload(suggestion);
  return [
    `${indent}<promotion_carried_ref_suggestions source="promotion_carried_refs" carried_ref_count="${String(suggestion.refs.length)}" used_ref_count="${String(suggestion.usedRefs.length)}" unused_ref_count="${String(suggestion.unusedRefs.length)}" target_field="${escapeXml(suggestion.targetField)}" applied_to_payload="false" applied_by_reviewed_override="${String(appliedByReviewedOverride)}" carry_into="promotion_reviewed_overrides" requires_reviewed_override="true" executes_write_now="false" next_write_executed_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" can_update_claim_trust="false" requires_explicit_execute_call="true">`,
    `${indent}  <reason>${escapeXml(suggestion.reason)}</reason>`,
    renderStringList('carried_refs', 'ref', suggestion.refs, `${indent}  `),
    renderStringList('used_refs', 'ref', suggestion.usedRefs, `${indent}  `),
    renderStringList('unused_refs', 'ref', suggestion.unusedRefs, `${indent}  `),
    `${indent}  <suggested_reviewed_overrides_json>${escapeXml(JSON.stringify(suggestion.suggestedOverrides))}</suggested_reviewed_overrides_json>`,
    renderCarriedRefNextCallPointer(suggestion, sourceDraft, `${indent}  `),
    `${indent}</promotion_carried_ref_suggestions>`,
  ].join('\n');
}

function renderCarriedRefNextCallPointer(
  suggestion: CuratedRagCarriedRefOverrideSuggestion,
  sourceDraft: AitpCuratedRagPromotionDraft,
  indent: string,
): string {
  if (suggestion.usedRefs.length === 0 || suggestion.selectedOperation.length === 0) return '';
  const draftCall = {
    action: 'draft_aitp_curated_rag_write_bridge_call',
    rag_chunk_id: sourceDraft.chunkId,
    aitp_topic_id: sourceDraft.topicId,
    aitp_claim_id: sourceDraft.claimId,
    promotion_draft_stage: suggestion.selectedStage,
    promotion_draft_operation: suggestion.selectedOperation,
    promotion_reviewed_overrides: suggestion.suggestedOverrides,
  };
  return [
    `${indent}<carried_ref_next_call_pointer action="draft_aitp_curated_rag_write_bridge_call" rag_chunk_id="${escapeXml(sourceDraft.chunkId)}" topic_id="${escapeXml(sourceDraft.topicId)}" claim_id="${escapeXml(sourceDraft.claimId)}" promotion_draft_stage="${escapeXml(suggestion.selectedStage)}" promotion_draft_operation="${escapeXml(suggestion.selectedOperation)}" copy_reviewed_overrides_from="suggested_reviewed_overrides_json" applied_to_payload="false" executes_write_now="false" bridge_called="false" next_write_executed_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" can_update_claim_trust="false" requires_fresh_draft_action="true" requires_reviewed_override="true" requires_readiness_inspection="true" requires_explicit_execute_call="true">`,
    `${indent}  <draft_call_json>${escapeXml(JSON.stringify(draftCall))}</draft_call_json>`,
    `${indent}</carried_ref_next_call_pointer>`,
  ].join('\n');
}

function carriedRefSuggestionAppliedByPayload(suggestion: CuratedRagCarriedRefOverrideSuggestion): boolean {
  return suggestion.appliedByReviewedOverride;
}

function renderAitpRecordRefRepairWriteBridgeCallDraft(input: {
  readonly repairRef: string;
  readonly repairOperation: (typeof RECORD_REF_REPAIR_WRITE_OPERATIONS)[number];
  readonly repairReason?: string | undefined;
  readonly payload: unknown;
}): string {
  const target = aitpRuntimeBridgeTargetForOperation(input.repairOperation);
  const toolCall: AitpWriteBridgeToolCallDraft = {
    action: 'execute_aitp_write_bridge',
    aitp_operation: input.repairOperation,
    aitp_payload: input.payload,
  };
  const hashInput = {
    kind: 'aitp_record_ref_repair_write_bridge_call_handoff',
    repairRef: input.repairRef,
    repairOperation: input.repairOperation,
    aitpOperation: input.repairOperation,
    confirmationStatus: 'ready_for_explicit_execute',
    repairReason: input.repairReason ?? '',
    toolCall,
  };
  const hash = shortSha256(stableJson(hashInput), 16);
  const handoffId = [
    'record-ref-repair-handoff',
    safeId(input.repairRef),
    safeId(input.repairOperation),
    hash,
  ].join('.');
  const confirmationId = [
    'record-ref-repair-confirmation',
    safeId(input.repairRef),
    safeId(input.repairOperation),
    hash,
  ].join('.');
  const diagnosticHash = `sha256:${hash}`;
  const nonExecutionProvenance = {
    source: 'ResearchAction.draft_aitp_record_ref_repair_write_bridge_call',
    repairRef: input.repairRef,
    repairOperation: input.repairOperation,
    repairReason: input.repairReason ?? '',
    reviewedPayloadExecuted: false,
    handoffExecuted: false,
    executesWriteNow: false,
    recordsValidationResultNow: false,
    sourceSupportResultNow: false,
    claimTrustMutation: 'none',
    requiresExplicitExecuteCall: true,
    confirmationId,
    diagnosticHash,
  };
  const readinessCall = handoffReadinessToolCall(input.repairOperation, input.payload, {
    handoffId,
    confirmationId,
    confirmationStatus: 'ready_for_explicit_execute',
    diagnosticHash,
    toolCall,
    hashInput,
  });
  return [
    `<aitp_record_ref_repair_write_bridge_call_draft repair_ref="${escapeXml(input.repairRef)}" repair_operation="${input.repairOperation}" next_research_action="execute_aitp_write_bridge" aitp_operation="${input.repairOperation}" repair_operation_source="aitp_record_ref_lookup" payload_source="reviewed_repair_payload" repair_action_hint_only="true" selected_write_call_unchanged="true" handoff_id="${escapeXml(handoffId)}" diagnostic_hash="${escapeXml(diagnosticHash)}" reviewed_payload_executed="false" executes_write_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" can_update_claim_trust="false" requires_explicit_execute_call="true">`,
    `  <runtime_target entrypoint_key="${escapeXml(target.entrypointKey)}" mcp_tool="${escapeXml(target.mcpTool)}" cli_fallback="${escapeXml(target.cliFallback)}" surface="${escapeXml(target.surface)}" preferred_transport="${target.preferredTransport}" fallback_transport="${target.fallbackTransport}" state_effect="${target.stateEffect}" claim_trust_mutation="${target.claimTrustMutation}" />`,
    `  <repair_reason>${escapeXml(input.repairReason ?? '')}</repair_reason>`,
    `  <tool_call_json>${escapeXml(JSON.stringify(toolCall))}</tool_call_json>`,
    `  <reviewed_payload_json>${escapeXml(JSON.stringify(input.payload))}</reviewed_payload_json>`,
    renderReadinessCallPointer({ handoffId, confirmationId, diagnosticHash }, '  '),
    renderReadinessInspectionSummary('record_ref_repair_write_call_draft', '  '),
    renderReadinessInspectionChecklist('record_ref_repair_write_call_draft', handoffId, '  '),
    `  <execute_aitp_write_bridge_handoff handoff_id="${escapeXml(handoffId)}" confirmation_id="${escapeXml(confirmationId)}" confirmation_status="ready_for_explicit_execute" diagnostic_hash="${escapeXml(diagnosticHash)}" hash_algorithm="sha256" handoff_executed="false" executes_write_now="false" non_execution_provenance="repair_draft_only" requires_explicit_execute_call="true">`,
    `    <tool_call_json>${escapeXml(JSON.stringify(toolCall))}</tool_call_json>`,
    `    <hash_input_json>${escapeXml(stableJson(hashInput))}</hash_input_json>`,
    `    <non_execution_provenance_json>${escapeXml(JSON.stringify(nonExecutionProvenance))}</non_execution_provenance_json>`,
    `    <readiness_call_json>${escapeXml(JSON.stringify(readinessCall))}</readiness_call_json>`,
    '  </execute_aitp_write_bridge_handoff>',
    '  <repair_boundary draft_executes_write_now="false" draft_records_validation_result="false" draft_source_support_result="false" draft_can_update_claim_trust="false" requires_separate_explicit_execute_call="true" />',
    '</aitp_record_ref_repair_write_bridge_call_draft>',
    '',
  ].join('\n');
}

function renderReadinessCallPointer(
  input: { readonly handoffId: string; readonly confirmationId: string; readonly diagnosticHash: string },
  indent: string,
): string {
  return `${indent}<readiness_call_pointer action="inspect_aitp_write_bridge_handoff_readiness" handoff_id="${escapeXml(input.handoffId)}" confirmation_id="${escapeXml(input.confirmationId)}" diagnostic_hash="${escapeXml(input.diagnosticHash)}" source="execute_aitp_write_bridge_handoff.readiness_call_json" read_only="true" bridge_called="false" executes_write_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" requires_explicit_execute_call="true" />`;
}

function renderReadinessInspectionSummary(draftFamily: string, indent: string): string {
  return `${indent}<readiness_inspection_summary draft_family="${draftFamily}" root_pointer="readiness_call_pointer" nested_call="execute_aitp_write_bridge_handoff.readiness_call_json" inspection_action="inspect_aitp_write_bridge_handoff_readiness" inspection_only="true" read_only="true" bridge_called="false" executes_write_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" requires_explicit_execute_call="true" />`;
}

function renderReadinessInspectionChecklist(draftFamily: string, handoffId: string, indent: string): string {
  const checklistId = readinessChecklistId(draftFamily, handoffId);
  return [
    `${indent}<readiness_inspection_checklist checklist_id="${escapeXml(checklistId)}" draft_family="${draftFamily}" id_source="handoff_id+draft_family" item_count="2" read_only="true" bridge_called="false" executes_write_now="false" execute_call_authorized="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none">`,
    `${indent}  <inspection_item order="1" action="inspect_aitp_write_bridge_handoff_readiness" source="readiness_call_pointer+execute_aitp_write_bridge_handoff.readiness_call_json" required_before_explicit_execute="true" copy_call_from="execute_aitp_write_bridge_handoff.readiness_call_json" read_only="true" bridge_called="false" executes_write_now="false" />`,
    `${indent}  <inspection_item order="2" action="execute_aitp_write_bridge" source="tool_call_json" allowed_only_after_readiness_passes="true" executes_write_now="false" checklist_authorizes_execution="false" requires_explicit_execute_call="true" />`,
    `${indent}</readiness_inspection_checklist>`,
  ].join('\n');
}

function readinessChecklistId(draftFamily: string, handoffId: string): string {
  return `readiness-checklist.${safeId(draftFamily)}.${safeId(handoffId)}`;
}

function curatedRagPromotionWriteBridgeConfirmationSummary(
  callDraft: CuratedRagPromotionWriteBridgeCallDraft,
): CuratedRagPromotionWriteBridgeConfirmationSummary {
  const allDiagnostics = [...callDraft.diagnostics, ...callDraft.overrideDiagnostics];
  const hardBlockingDiagnostics = allDiagnostics.filter((diagnostic) =>
    HARD_BLOCKING_PROMOTION_CONFIRMATION_CODES.has(diagnostic.code),
  );
  const confirmationRequiredDiagnostics = allDiagnostics.filter((diagnostic) =>
    CONFIRMATION_REQUIRED_PROMOTION_CONFIRMATION_CODES.has(diagnostic.code),
  );
  const advisoryDiagnostics = allDiagnostics.filter(
    (diagnostic) =>
      !HARD_BLOCKING_PROMOTION_CONFIRMATION_CODES.has(diagnostic.code) &&
      !CONFIRMATION_REQUIRED_PROMOTION_CONFIRMATION_CODES.has(diagnostic.code),
  );
  const status =
    hardBlockingDiagnostics.length > 0
      ? 'blocked'
      : confirmationRequiredDiagnostics.length > 0
        ? 'needs_explicit_confirmation'
        : 'ready_for_explicit_execute';
  return {
    status,
    hardBlockingDiagnostics,
    confirmationRequiredDiagnostics,
    advisoryDiagnostics,
    missingRefRepairHintCount: missingRefRepairHintCount(callDraft.recordRefLookup),
    executeCallAllowedAfterExplicitConfirmation: hardBlockingDiagnostics.length === 0,
    nextStep:
      status === 'blocked'
        ? 'Resolve hard-blocking diagnostics before preparing an execute_aitp_write_bridge call.'
        : status === 'needs_explicit_confirmation'
          ? 'Review required existing records and source/claim scope, then make a separate explicit execute_aitp_write_bridge call if appropriate.'
          : 'Make a separate explicit execute_aitp_write_bridge call only after final human/model confirmation.',
  };
}

function missingRefRepairHintCount(lookup: CuratedRagPayloadRefLookup | undefined): number {
  if (lookup?.status !== 'performed') return 0;
  return lookup.lookup.refs.filter(isMissingRefRepairItem).length;
}

function missingRefRepairHintOperations(lookup: CuratedRagPayloadRefLookup | undefined): readonly string[] {
  if (lookup?.status !== 'performed') return [];
  return uniqueStrings(
    lookup.lookup.refs
      .filter(isMissingRefRepairItem)
      .map((item) => item.suggestedNextOperation),
  );
}

function curatedRagPromotionWriteBridgeHandoffArtifact(
  sourceDraft: AitpCuratedRagPromotionDraft,
  callDraft: CuratedRagPromotionWriteBridgeCallDraft,
  confirmation: CuratedRagPromotionWriteBridgeConfirmationSummary,
  toolCall: AitpWriteBridgeToolCallDraft,
  bindingId?: string | undefined,
): CuratedRagPromotionWriteBridgeHandoffArtifact {
  const diagnostics = [
    ...confirmation.hardBlockingDiagnostics,
    ...confirmation.confirmationRequiredDiagnostics,
    ...confirmation.advisoryDiagnostics,
  ].map((diagnostic) => ({
    code: diagnostic.code,
    field: diagnostic.field,
    message: diagnostic.message,
  }));
  const repairHintOperations = missingRefRepairHintOperations(callDraft.recordRefLookup);
  const selectedWriteDiffersFromRepairHints =
    repairHintOperations.length > 0 && !repairHintOperations.includes(callDraft.aitpOperation);
  const hashInput = {
    kind: 'aitp_curated_rag_write_bridge_call_handoff',
    chunkId: sourceDraft.chunkId,
    documentId: sourceDraft.documentId,
    stage: callDraft.stage,
    draftOperation: callDraft.draftOperation,
    aitpOperation: callDraft.aitpOperation,
    confirmationStatus: confirmation.status,
    missingRefRepairHintCount: confirmation.missingRefRepairHintCount,
    missingRefRepairChecklistPresent: confirmation.missingRefRepairHintCount > 0,
    repairHintOperations,
    selectedWriteDiffersFromRepairHints,
    executeCallAllowedAfterExplicitConfirmation: confirmation.executeCallAllowedAfterExplicitConfirmation,
    toolCall,
    requiredExistingRecords: callDraft.requiredExistingRecords,
    diagnostics,
  };
  const hash = shortSha256(stableJson(hashInput), 16);
  const confirmationId = [
    'curated-rag-confirmation',
    safeId(sourceDraft.chunkId),
    safeId(callDraft.stage),
    safeId(callDraft.aitpOperation),
    hash,
  ].join('.');
  return {
    handoffId: [
      'curated-rag-write-handoff',
      safeId(sourceDraft.chunkId),
      safeId(callDraft.stage),
      safeId(callDraft.aitpOperation),
      hash,
    ].join('.'),
    confirmationId,
    diagnosticHash: `sha256:${hash}`,
    confirmationStatus: confirmation.status,
    toolCall,
    hashInput,
    nonExecutionProvenance: {
      source: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call',
      sourceDraftKind: sourceDraft.kind,
      sourceDraftCreatesRecords: false,
      chunkId: sourceDraft.chunkId,
      documentId: sourceDraft.documentId,
      stage: callDraft.stage,
      draftOperation: callDraft.draftOperation,
      aitpOperation: callDraft.aitpOperation,
      bindingId,
      payloadSource: callDraft.payloadSource,
      reviewedOverrideCount: Object.keys(callDraft.reviewedOverrides).length,
      originalUnresolvedPlaceholderCount: callDraft.originalUnresolvedPlaceholderCount,
      unresolvedPlaceholderCount: callDraft.unresolvedPlaceholderCount,
      selectedWriteExecuted: false,
      reviewedOverridesExecuted: false,
      handoffExecuted: false,
      missingRefRepairHintCount: confirmation.missingRefRepairHintCount,
      missingRefRepairChecklistPresent: confirmation.missingRefRepairHintCount > 0,
      repairHintOperations,
      selectedWriteDiffersFromRepairHints,
      executesWriteNow: false,
      recordsEvidenceNow: false,
      recordsValidationResultNow: false,
      claimTrustMutation: 'none',
      requiresExplicitExecuteCall: true,
      confirmationId,
      diagnosticHash: `sha256:${hash}`,
    },
  };
}

const HARD_BLOCKING_PROMOTION_CONFIRMATION_CODES = new Set([
  'missing_required_field',
  'missing_draft_context',
  'placeholder_value',
  'missing_sequence_prior_ref',
  'reviewed_override_introduces_placeholder',
]);

const CONFIRMATION_REQUIRED_PROMOTION_CONFIRMATION_CODES = new Set([
  'requires_existing_record',
  'manual_review_required',
  'reviewed_override_adds_field',
  'reviewed_override_applied',
  'reviewed_override_resolves_placeholder',
  'reviewed_overrides_not_executed',
]);

function renderAitpCuratedRagWriteBridgeConfirmationSummary(
  summary: CuratedRagPromotionWriteBridgeConfirmationSummary,
  indent: string,
): string {
  return [
    `${indent}<confirmation_preflight status="${summary.status}" hard_blocking_count="${String(summary.hardBlockingDiagnostics.length)}" confirmation_required_count="${String(summary.confirmationRequiredDiagnostics.length)}" advisory_count="${String(summary.advisoryDiagnostics.length)}" missing_ref_repair_hint_count="${String(summary.missingRefRepairHintCount)}" missing_ref_repair_checklist_present="${String(summary.missingRefRepairHintCount > 0)}" execute_call_allowed_after_explicit_confirmation="${String(summary.executeCallAllowedAfterExplicitConfirmation)}" executes_write_now="false">`,
    `${indent}  <next_step>${escapeXml(summary.nextStep)}</next_step>`,
    renderAitpCuratedRagWriteBridgeCallDiagnostics(
      summary.hardBlockingDiagnostics,
      `${indent}  `,
      'hard_blocking_diagnostics',
    ),
    renderAitpCuratedRagWriteBridgeCallDiagnostics(
      summary.confirmationRequiredDiagnostics,
      `${indent}  `,
      'confirmation_required_diagnostics',
    ),
    renderAitpCuratedRagWriteBridgeCallDiagnostics(
      summary.advisoryDiagnostics,
      `${indent}  `,
      'advisory_diagnostics',
    ),
    `${indent}</confirmation_preflight>`,
  ].join('\n');
}

function renderAitpCuratedRagWriteBridgeHandoffArtifact(
  artifact: CuratedRagPromotionWriteBridgeHandoffArtifact,
  indent: string,
): string {
  return [
    `${indent}<execute_aitp_write_bridge_handoff handoff_id="${escapeXml(artifact.handoffId)}" confirmation_id="${escapeXml(artifact.confirmationId)}" confirmation_status="${artifact.confirmationStatus}" diagnostic_hash="${escapeXml(artifact.diagnosticHash)}" hash_algorithm="sha256" handoff_executed="false" executes_write_now="false" non_execution_provenance="draft_only" requires_explicit_execute_call="true">`,
    `${indent}  <tool_call_json>${escapeXml(JSON.stringify(artifact.toolCall))}</tool_call_json>`,
    `${indent}  <hash_input_json>${escapeXml(stableJson(artifact.hashInput))}</hash_input_json>`,
    `${indent}  <non_execution_provenance_json>${escapeXml(JSON.stringify(artifact.nonExecutionProvenance))}</non_execution_provenance_json>`,
    `${indent}  <readiness_call_json>${escapeXml(JSON.stringify(handoffReadinessToolCall(artifact.toolCall.aitp_operation, artifact.toolCall.aitp_payload, artifact)))}</readiness_call_json>`,
    `${indent}</execute_aitp_write_bridge_handoff>`,
  ].join('\n');
}

function handoffReadinessToolCall(
  operation: AitpWriteBridgeOperation,
  payload: unknown,
  artifact: {
    readonly handoffId: string;
    readonly confirmationId: string;
    readonly confirmationStatus: string;
    readonly diagnosticHash: string;
    readonly toolCall: AitpWriteBridgeToolCallDraft;
    readonly hashInput: unknown;
  },
): Readonly<Record<string, unknown>> {
  return {
    action: 'inspect_aitp_write_bridge_handoff_readiness',
    aitp_operation: operation,
    aitp_payload: payload,
    aitp_handoff: {
      handoff_id: artifact.handoffId,
      confirmation_id: artifact.confirmationId,
      confirmation_status: artifact.confirmationStatus,
      diagnostic_hash: artifact.diagnosticHash,
      tool_call_json: artifact.toolCall,
      hash_input_json: artifact.hashInput,
    },
  };
}

function verifyAitpWriteBridgeHandoff(
  handoff: Readonly<Record<string, unknown>> | undefined,
  operation: AitpWriteBridgeOperation,
  payload: Readonly<Record<string, unknown>>,
):
  | { readonly isError: false; readonly guard?: AitpHandoffGuard | undefined }
  | { readonly isError: true; readonly message: string; readonly failure: AitpHandoffGuardFailure } {
  if (handoff === undefined) return { isError: false };
  const handoffId = stringRecordValue(handoff, 'handoff_id', 'handoffId');
  const confirmationId = stringRecordValue(handoff, 'confirmation_id', 'confirmationId');
  const diagnosticHash = stringRecordValue(handoff, 'diagnostic_hash', 'diagnosticHash');
  const confirmationStatus = stringRecordValue(handoff, 'confirmation_status', 'confirmationStatus');
  const toolCall = recordRecordValue(handoff, 'tool_call_json', 'toolCallJson', 'tool_call', 'toolCall');
  const hashInput = recordRecordValue(handoff, 'hash_input_json', 'hashInputJson', 'hash_input', 'hashInput');
  if (!hasText(handoffId)) {
    return handoffGuardError('missing_handoff_id', 'requires handoff_id.', {
      field: 'handoff_id',
      path: 'aitp_handoff.handoff_id',
    });
  }
  if (!hasText(confirmationId)) {
    return handoffGuardError('missing_confirmation_id', 'requires confirmation_id.', {
      field: 'confirmation_id',
      path: 'aitp_handoff.confirmation_id',
    });
  }
  if (!hasText(diagnosticHash)) {
    return handoffGuardError('missing_diagnostic_hash', 'requires diagnostic_hash.', {
      field: 'diagnostic_hash',
      path: 'aitp_handoff.diagnostic_hash',
    });
  }
  if (!diagnosticHash.startsWith('sha256:')) {
    return handoffGuardError('invalid_diagnostic_hash_algorithm', 'requires diagnostic_hash to use sha256:<digest>.', {
      field: 'diagnostic_hash',
      path: 'aitp_handoff.diagnostic_hash',
    });
  }
  if (!hasText(confirmationStatus)) {
    return handoffGuardError('missing_confirmation_status', 'requires confirmation_status.', {
      field: 'confirmation_status',
      path: 'aitp_handoff.confirmation_status',
    });
  }
  if (confirmationStatus === 'blocked') {
    return handoffGuardError('blocked_handoff', 'refuses blocked handoff; resolve diagnostics before execution.', {
      field: 'confirmation_status',
      path: 'aitp_handoff.confirmation_status',
    });
  }
  if (confirmationStatus !== 'needs_explicit_confirmation' && confirmationStatus !== 'ready_for_explicit_execute') {
    return handoffGuardError('unsupported_confirmation_status', `has unsupported confirmation_status="${confirmationStatus}".`, {
      field: 'confirmation_status',
      path: 'aitp_handoff.confirmation_status',
    });
  }
  if (toolCall === undefined) {
    return handoffGuardError('missing_tool_call_json', 'requires tool_call_json/toolCall object.', {
      field: 'tool_call_json',
      path: 'aitp_handoff.tool_call_json',
    });
  }
  if (hashInput === undefined) {
    return handoffGuardError('missing_hash_input_json', 'requires hash_input_json/hashInput object.', {
      field: 'hash_input_json',
      path: 'aitp_handoff.hash_input_json',
    });
  }
  if (stringRecordValue(toolCall, 'action') !== 'execute_aitp_write_bridge') {
    return handoffGuardError('tool_call_action_mismatch', 'tool_call_json.action must be execute_aitp_write_bridge.', {
      field: 'tool_call_json',
      path: 'aitp_handoff.tool_call_json.action',
    });
  }
  if (stringRecordValue(toolCall, 'aitp_operation', 'aitpOperation') !== operation) {
    return handoffGuardError('tool_call_operation_mismatch', 'tool_call_json.aitp_operation does not match explicit aitp_operation.', {
      field: 'aitp_operation',
      path: 'aitp_handoff.tool_call_json.aitp_operation',
    });
  }
  const handoffPayload = recordRecordValue(toolCall, 'aitp_payload', 'aitpPayload');
  if (handoffPayload === undefined) {
    return handoffGuardError('missing_tool_call_payload', 'tool_call_json requires aitp_payload.', {
      field: 'aitp_payload',
      path: 'aitp_handoff.tool_call_json.aitp_payload',
    });
  }
  if (stableJson(handoffPayload) !== stableJson(payload)) {
    return handoffGuardError('tool_call_payload_mismatch', 'tool_call_json.aitp_payload does not match explicit aitp_payload.', {
      field: 'aitp_payload',
      path: 'aitp_handoff.tool_call_json.aitp_payload',
    });
  }
  const expectedHash = `sha256:${shortSha256(stableJson(hashInput), 16)}`;
  if (diagnosticHash !== expectedHash) {
    return handoffGuardError('diagnostic_hash_mismatch', 'diagnostic_hash does not match hash_input_json.', {
      field: 'diagnostic_hash',
      path: 'aitp_handoff.diagnostic_hash',
    });
  }
  if (stringRecordValue(hashInput, 'aitpOperation') !== operation) {
    return handoffGuardError('hash_input_operation_mismatch', 'hash_input_json.aitpOperation does not match explicit aitp_operation.', {
      field: 'aitpOperation',
      path: 'aitp_handoff.hash_input_json.aitpOperation',
    });
  }
  if (stringRecordValue(hashInput, 'confirmationStatus') !== confirmationStatus) {
    return handoffGuardError('hash_input_confirmation_status_mismatch', 'hash_input_json.confirmationStatus does not match confirmation_status.', {
      field: 'confirmationStatus',
      path: 'aitp_handoff.hash_input_json.confirmationStatus',
    });
  }
  const hashToolCall = recordRecordValue(hashInput, 'toolCall');
  if (hashToolCall === undefined || stableJson(hashToolCall) !== stableJson(toolCall)) {
    return handoffGuardError('hash_input_tool_call_mismatch', 'hash_input_json.toolCall does not match tool_call_json.', {
      field: 'toolCall',
      path: 'aitp_handoff.hash_input_json.toolCall',
    });
  }
  const missingRefRepairHintCount = nonNegativeIntegerRecordValue(hashInput, 'missingRefRepairHintCount');
  const repairHintOperations = stringArrayRecordValue(hashInput, 'repairHintOperations');
  const hashInputKind = stringRecordValue(hashInput, 'kind');
  return {
    isError: false,
    guard: {
      kind:
        hashInputKind === 'aitp_record_ref_repair_write_bridge_call_handoff'
          ? 'record_ref_repair_write_bridge_handoff'
          : 'curated_rag_write_bridge_handoff',
      handoffId,
      confirmationId,
      diagnosticHash,
      confirmationStatus,
      selectedAitpOperation: operation,
      chunkId: stringRecordValue(hashInput, 'chunkId'),
      documentId: stringRecordValue(hashInput, 'documentId'),
      stage: stringRecordValue(hashInput, 'stage'),
      draftOperation: stringRecordValue(hashInput, 'draftOperation'),
      missingRefRepairHintCount,
      missingRefRepairChecklistPresent: missingRefRepairHintCount > 0,
      repairHintOperations,
      selectedWriteDiffersFromRepairHints:
        repairHintOperations.length > 0 && !repairHintOperations.includes(operation),
    },
  };
}

const HANDOFF_GUARD_REMEDIATION_BY_CODE: Readonly<Record<HandoffGuardFailureCode, HandoffGuardRemediationStep>> = {
  blocked_handoff: 'redraft_or_resolve_blocking_diagnostics',
  diagnostic_hash_mismatch: 'redraft_handoff_or_restore_hash_input',
  hash_input_confirmation_status_mismatch: 'redraft_handoff_or_restore_hash_input',
  hash_input_operation_mismatch: 'redraft_handoff_or_restore_hash_input',
  hash_input_tool_call_mismatch: 'redraft_handoff_or_restore_hash_input',
  invalid_diagnostic_hash_algorithm: 'redraft_handoff_or_restore_hash_input',
  missing_confirmation_id: 'copy_missing_handoff_field_from_draft',
  missing_confirmation_status: 'copy_missing_handoff_field_from_draft',
  missing_diagnostic_hash: 'copy_missing_handoff_field_from_draft',
  missing_handoff_id: 'copy_missing_handoff_field_from_draft',
  missing_hash_input_json: 'copy_missing_handoff_field_from_draft',
  missing_tool_call_json: 'copy_missing_handoff_field_from_draft',
  missing_tool_call_payload: 'align_explicit_execute_args_with_handoff_tool_call',
  tool_call_action_mismatch: 'align_explicit_execute_args_with_handoff_tool_call',
  tool_call_operation_mismatch: 'align_explicit_execute_args_with_handoff_tool_call',
  tool_call_payload_mismatch: 'align_explicit_execute_args_with_handoff_tool_call',
  unsupported_confirmation_status: 'inspect_handoff_guard_failure',
};

function handoffGuardError(
  code: HandoffGuardFailureCode,
  reason: string,
  location: { readonly field?: string | undefined; readonly path?: string | undefined } = {},
): { readonly isError: true; readonly message: string; readonly failure: AitpHandoffGuardFailure } {
  const remediation = handoffGuardRemediation(code, location);
  return {
    isError: true,
    failure: {
      code,
      field: location.field,
      path: location.path,
      remediation,
    },
    message: [
      `<handoff_guard_failure status="failed" code="${escapeXml(code)}"${location.field === undefined ? '' : ` field="${escapeXml(location.field)}"`}${location.path === undefined ? '' : ` path="${escapeXml(location.path)}"`} executes_write_now="false" bridge_called="false">`,
      `  <message>ResearchAction execute_aitp_write_bridge handoff guard failed: ${escapeXml(reason)}</message>`,
      `  <remediation_summary next_step="${escapeXml(remediation.nextStep)}" repair_target="${escapeXml(remediation.repairTarget)}" retry_requires_explicit_execute_call="true" mutates_handoff_now="false" />`,
      '</handoff_guard_failure>',
    ].join('\n'),
  };
}

function handoffGuardRemediation(
  code: HandoffGuardFailureCode,
  location: { readonly field?: string | undefined; readonly path?: string | undefined },
): { readonly nextStep: HandoffGuardRemediationStep; readonly repairTarget: string } {
  return {
    nextStep: HANDOFF_GUARD_REMEDIATION_BY_CODE[code],
    repairTarget: handoffGuardRepairTarget(code, location),
  };
}

function handoffGuardRepairTarget(
  code: HandoffGuardFailureCode,
  location: { readonly field?: string | undefined; readonly path?: string | undefined },
): string {
  if (location.path !== undefined) return location.path;
  const nextStep = HANDOFF_GUARD_REMEDIATION_BY_CODE[code];
  if (nextStep === 'copy_missing_handoff_field_from_draft') {
    return `aitp_handoff.${location.field ?? 'field'}`;
  }
  if (nextStep === 'align_explicit_execute_args_with_handoff_tool_call') {
    return 'aitp_handoff.tool_call_json';
  }
  if (nextStep === 'redraft_handoff_or_restore_hash_input') {
    return 'aitp_handoff.hash_input_json';
  }
  if (nextStep === 'redraft_or_resolve_blocking_diagnostics') {
    return 'aitp_handoff.confirmation_status';
  }
  return location.field ?? 'aitp_handoff';
}

function renderAitpCuratedRagWriteBridgeCallOverrideDiagnostics(
  diagnostics: readonly CuratedRagPromotionWriteBridgeCallDiagnostic[],
  indent: string,
): string {
  if (diagnostics.length === 0) return `${indent}<reviewed_override_diagnostics />`;
  return [
    `${indent}<reviewed_override_diagnostics diagnostic_count="${String(diagnostics.length)}">`,
    ...diagnostics.map(
      (diagnostic) =>
        `${indent}  <diagnostic code="${escapeXml(diagnostic.code)}"${diagnostic.field === undefined ? '' : ` field="${escapeXml(diagnostic.field)}"`}>${escapeXml(diagnostic.message)}</diagnostic>`,
    ),
    `${indent}</reviewed_override_diagnostics>`,
  ].join('\n');
}

function renderAitpCuratedRagWriteBridgeCallDiagnostics(
  diagnostics: readonly CuratedRagPromotionWriteBridgeCallDiagnostic[],
  indent: string,
  container = 'diagnostics',
): string {
  if (diagnostics.length === 0) return `${indent}<${container} />`;
  return [
    `${indent}<${container} diagnostic_count="${String(diagnostics.length)}">`,
    ...diagnostics.map(
      (diagnostic) =>
        `${indent}  <diagnostic code="${escapeXml(diagnostic.code)}"${diagnostic.field === undefined ? '' : ` field="${escapeXml(diagnostic.field)}"`}>${escapeXml(diagnostic.message)}</diagnostic>`,
    ),
    `${indent}</${container}>`,
  ].join('\n');
}

function outcomeForPrimitiveToolAitpCapture(
  capture: PrimitiveToolAitpToolRunCapture,
): ResearchActionOutcome {
  if (capture.status === 'recorded') return 'pass';
  if (capture.status === 'failed') return 'fail';
  return 'blocked';
}

function buildBenchmarkAdapterAitpToolRunPayload(
  result: BenchmarkAdapterRunResult,
  args: ResearchActionToolInput,
  actionId: string,
  callId: string,
  activeWorkFrame?: WorkFrame | undefined,
): Readonly<Record<string, unknown>> | undefined {
  const topicId = firstText(
    optionalRecordValue(args.aitp_payload, 'topicId'),
    optionalRecordValue(args.aitp_payload, 'topic_id'),
    args.topic,
    activeWorkFrame?.topic,
  );
  const claimId = firstText(
    optionalRecordValue(args.aitp_payload, 'claimId'),
    optionalRecordValue(args.aitp_payload, 'claim_id'),
    firstClaimRef(args.source_refs),
    firstClaimRef(args.capsule_refs),
    firstClaimRef(activeWorkFrame?.sourceRefs),
    firstClaimRef(activeWorkFrame?.activeObjectIds),
  );
  if (!hasText(topicId) || !hasText(claimId)) return undefined;
  const sourceRefs = uniqueStrings([
    ...(args.source_refs ?? []),
    ...result.evidenceRefs,
  ]);
  return {
    recipeId: `benchmark_adapter:${result.adapterId}:${result.caseId}`,
    toolFamily: 'benchmark_adapter',
    toolName: result.adapterId,
    topicId,
    claimId,
    inputs: {
      benchmarkPayload: args.benchmark_payload,
      caseId: result.caseId,
      sourceRefs: args.source_refs ?? [],
    },
    outputs: {
      adapterId: result.adapterId,
      caseId: result.caseId,
      actionId,
      callId,
      outcome: result.outcome,
      observation: result.observation,
      output: result.output,
      evidenceRefs: result.evidenceRefs,
      artifactRefs: result.artifactRefs,
      checkResults: result.checkResults,
    },
    environment: {
      captureTool: 'hakimi.run_benchmark_adapter',
      payloadProfile: 'benchmark_adapter_run_to_tool_run',
      benchmarkDomain: result.domain,
      summaryInputsTrusted: false,
      canUpdateClaimTrust: false,
    },
    evidenceStatus: evidenceStatusForBenchmarkOutcome(result.outcome),
    artifactIds: normalizeArtifactIds(result.artifactRefs),
    sourceRefs,
  };
}

function evidenceStatusForBenchmarkOutcome(outcome: BenchmarkAdapterOutcome): string {
  switch (outcome) {
    case 'pass':
      return 'unreviewed';
    case 'fail':
      return 'contradicts';
    case 'blocked':
    case 'inconclusive':
      return 'inconclusive';
  }
}

function normalizeArtifactIds(refs: readonly string[]): readonly string[] {
  return refs
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0)
    .map((ref) => (ref.startsWith('aitp:artifact:') ? ref.slice('aitp:artifact:'.length) : ref))
    .map((ref) => (ref.startsWith('artifact:') ? ref.slice('artifact:'.length) : ref))
    .filter((ref) => ref.length > 0);
}

function optionalRecordValue(record: unknown, key: string): string | undefined {
  if (!isRecord(record)) return undefined;
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringRecordValue(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function recordRecordValue(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): Readonly<Record<string, unknown>> | undefined {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (isRecord(parsed)) return parsed;
      } catch {
        // Try the next accepted key spelling.
      }
    }
  }
  return undefined;
}

function nonNegativeIntegerRecordValue(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return 0;
  return value;
}

function stringArrayRecordValue(record: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((item): item is string => typeof item === 'string' && item.length > 0));
}

function curatedRagPromotionDraftBindingInput(
  params: Readonly<Record<string, unknown>> | undefined,
): CuratedRagPromotionDraftBindingInput | undefined {
  if (!isRecord(params)) return undefined;
  const allowedNextToolCall = isRecord(params['allowedNextToolCall'])
    ? params['allowedNextToolCall']
    : undefined;
  const ragChunkId = firstText(
    optionalRecordValue(params, 'ragChunkId'),
    optionalRecordValue(allowedNextToolCall, 'rag_chunk_id'),
  );
  if (ragChunkId === undefined) return undefined;
  return {
    ragChunkId,
    aitpTopicId: firstText(
      optionalRecordValue(params, 'aitpTopicId'),
      optionalRecordValue(allowedNextToolCall, 'aitp_topic_id'),
    ),
    aitpClaimId: firstText(
      optionalRecordValue(params, 'aitpClaimId'),
      optionalRecordValue(allowedNextToolCall, 'aitp_claim_id'),
    ),
    aitpConnectorId: firstText(
      optionalRecordValue(params, 'aitpConnectorId'),
      optionalRecordValue(allowedNextToolCall, 'aitp_connector_id'),
    ),
    aitpPromotionIntent: firstText(
      optionalRecordValue(params, 'aitpPromotionIntent'),
      optionalRecordValue(allowedNextToolCall, 'aitp_promotion_intent'),
    ),
  };
}

function writeBridgeOperationForPromotionDraft(
  draftOperation: string,
): AitpWriteBridgeOperation | undefined {
  switch (draftOperation) {
    case 'registerSourceAsset':
      return 'registerSourceAsset';
    case 'recordReferenceLocation':
      return 'recordReferenceLocation';
    case 'recordEvidence':
      return 'recordEvidence';
    case 'createValidationContract':
      return 'createValidationContract';
    case 'preflightTrustUpdate':
      return 'preflightTrustUpdate';
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstClaimRef(refs: readonly string[] | undefined): string | undefined {
  for (const ref of refs ?? []) {
    if (ref.startsWith('aitp:claim:')) return ref.slice('aitp:claim:'.length);
    if (ref.startsWith('claim:')) return ref.slice('claim:'.length);
  }
  return undefined;
}

function firstText(...values: readonly (string | undefined)[]): string | undefined {
  return values.find(hasText);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function renderEvidenceRefs(refs: readonly string[], scope: EvidenceScope): string {
  const attrs = renderEvidenceScopeAttrs(scope);
  if (refs.length === 0) return `<research_evidence_refs${attrs} />\n`;
  return [
    `<research_evidence_refs${attrs}>`,
    ...refs.map(
      (ref) =>
        `  <evidence_ref kind="${escapeXml(evidenceRefKind(ref))}">${escapeXml(ref)}</evidence_ref>`,
    ),
    '</research_evidence_refs>',
    '',
  ].join('\n');
}

function renderLoadedEvidenceRef(
  loaded: LoadedResearchEvidenceRef,
  includeBody: boolean,
  scope: EvidenceScope,
): string {
  return [
    `<research_evidence_ref ref="${escapeXml(loaded.ref)}" kind="${loaded.kind}"${renderEvidenceScopeAttrs(scope)}>`,
    renderResearchLedgerEvent(loaded.event, includeBody, '  '),
    '</research_evidence_ref>',
    '',
  ].join('\n');
}

function renderResearchLedgerEvent(
  event: ResearchLedgerEvent,
  includeBody: boolean,
  indent = '',
): string {
  const metadata = event.metadata;
  const lines = [
    `${indent}<research_ledger_event id="${escapeXml(metadata.id)}" type="${metadata.type}" topic="${escapeXml(metadata.topic)}" domain="${escapeXml(metadata.domain)}" status="${metadata.status}">`,
    `${indent}  <path>${escapeXml(event.path)}</path>`,
    renderStringList('source_refs', 'source_ref', metadata.sourceRefs, `${indent}  `),
    renderStringList('depends_on', 'event', metadata.dependsOn, `${indent}  `),
    `${indent}  <candidate_capsule_kind>${escapeXml(metadata.candidateCapsuleKind ?? '')}</candidate_capsule_kind>`,
    renderStringList('open_questions', 'question', metadata.openQuestions, `${indent}  `),
    renderStringList('related_objects', 'object', metadata.relatedObjects, `${indent}  `),
  ];
  if (includeBody) {
    lines.push(`${indent}  <body>${escapeXml(event.body)}</body>`);
  }
  lines.push(`${indent}</research_ledger_event>`);
  return lines.join('\n');
}

function renderEvidenceScopeAttrs(scope: EvidenceScope): string {
  const attrs = [
    `scope="${scope.source}"`,
    scope.filter.workFrameId === undefined
      ? undefined
      : `work_frame_id="${escapeXml(scope.filter.workFrameId)}"`,
    scope.filter.domain === undefined
      ? undefined
      : `domain="${escapeXml(scope.filter.domain)}"`,
    scope.filter.topic === undefined ? undefined : `topic="${escapeXml(scope.filter.topic)}"`,
  ].filter((attr): attr is string => attr !== undefined);
  return ` ${attrs.join(' ')}`;
}

function evidenceRefKind(ref: string): string {
  return ref.startsWith('ledger:') ? 'ledger_event' : 'external_ref';
}

function renderGraphQueryResult(
  query: string,
  result: PhysicsGraphQueryResult,
): string {
  return [
    `<physics_graph_query query="${escapeXml(query)}">`,
    renderStringList('nodes', 'node', result.nodeIds, '  '),
    renderGraphEdgeList(result.edges, '  '),
    renderGraphDiagnostics(result.diagnostics, '  '),
    '</physics_graph_query>',
    '',
  ].join('\n');
}

function renderGraphPathResult(result: PhysicsGraphPathResult): string {
  return [
    `<physics_graph_path found="${String(result.found)}">`,
    renderStringList('nodes', 'node', result.nodeIds, '  '),
    renderGraphEdgeList(result.edges, '  '),
    renderGraphDiagnostics(result.diagnostics, '  '),
    '</physics_graph_path>',
    '',
  ].join('\n');
}

function renderGraphEdges(kind: string, edges: readonly PhysicsGraphEdge[]): string {
  return [
    `<physics_graph_edges kind="${escapeXml(kind)}">`,
    renderGraphEdgeList(edges, '  '),
    '</physics_graph_edges>',
    '',
  ].join('\n');
}

function renderGraphEdgeList(edges: readonly PhysicsGraphEdge[], indent: string): string {
  if (edges.length === 0) return `${indent}<edges />`;
  return [
    `${indent}<edges>`,
    ...edges.map(
      (edge) =>
        `${indent}  <edge from="${escapeXml(edge.sourceId)}" to="${escapeXml(edge.targetId)}" relation="${edge.relation}" />`,
    ),
    `${indent}</edges>`,
  ].join('\n');
}

function renderGraphDiagnostics(
  diagnostics: PhysicsGraphQueryResult['diagnostics'],
  indent: string,
): string {
  if (diagnostics.length === 0) return `${indent}<diagnostics />`;
  return [
    `${indent}<diagnostics>`,
    ...diagnostics.map(
      (diagnostic) =>
        `${indent}  <diagnostic severity="${diagnostic.severity}" code="${escapeXml(diagnostic.code)}"${diagnostic.nodeId === undefined ? '' : ` node_id="${escapeXml(diagnostic.nodeId)}"`}>${escapeXml(diagnostic.message)}</diagnostic>`,
    ),
    `${indent}</diagnostics>`,
  ].join('\n');
}

function renderFormalizationPlan(plan: FormalizationPlan): string {
  return [
    `<formalization_plan format="${plan.blueprint.format}">`,
    '  <contracts>',
    ...plan.contracts.map(
      (contract) =>
        `    <contract id="${escapeXml(contract.id)}" graph_node_id="${escapeXml(contract.graphNodeId)}" kind="${contract.targetKind}" readiness="${contract.readiness}" human_checkpoint="${String(contract.requiredHumanCheckpoint)}">${escapeXml(contract.title)}</contract>`,
    ),
    '  </contracts>',
    '  <blueprint_edges>',
    ...plan.blueprint.edges.map(
      (edge) =>
        `    <edge from="${escapeXml(edge.from)}" to="${escapeXml(edge.to)}" relation="${edge.relation}" />`,
    ),
    '  </blueprint_edges>',
    '  <diagnostics>',
    ...plan.diagnostics.map(
      (diagnostic) =>
        `    <diagnostic severity="${diagnostic.severity}" code="${escapeXml(diagnostic.code)}"${diagnostic.nodeId === undefined ? '' : ` node_id="${escapeXml(diagnostic.nodeId)}"`}>${escapeXml(diagnostic.message)}</diagnostic>`,
    ),
    '  </diagnostics>',
    '</formalization_plan>',
    '',
  ].join('\n');
}

function renderAitpWriteBridgeExecution(
  operation: AitpWriteBridgeOperation,
  actionId: string,
  callId: string,
  result: AitpWriteBridgeExecutionResult,
  handoffGuard?: AitpHandoffGuard | undefined,
): string {
  const target = aitpRuntimeBridgeTargetForOperation(operation);
  return [
    `<aitp_write_bridge operation="${operation}" action_id="${escapeXml(actionId)}" call_id="${escapeXml(callId)}" kind="${result.kind}" ok="${String(result.ok)}">`,
    `  <runtime_target entrypoint_key="${escapeXml(target.entrypointKey)}" mcp_tool="${escapeXml(target.mcpTool)}" cli_fallback="${escapeXml(target.cliFallback)}" surface="${escapeXml(target.surface)}" preferred_transport="${target.preferredTransport}" fallback_transport="${target.fallbackTransport}" mcp_argument_style="${target.mcpInvocation.argumentStyle}" mcp_base_argument="${target.mcpInvocation.baseArgument}" mcp_payload_key_case="${target.mcpInvocation.payloadKeyCase}" mcp_result_content_type="${target.mcpInvocation.resultContentType}" fallback_policy="${target.mcpInvocation.fallbackPolicy}" state_effect="${target.stateEffect}" claim_trust_mutation="${target.claimTrustMutation}" />`,
    renderAitpHandoffExecutionPrecheck({ status: 'passed', guard: handoffGuard }),
    renderAitpHandoffGuard(handoffGuard),
    `  <record_id>${escapeXml(aitpWriteBridgeRecordId(result))}</record_id>`,
    renderAitpCuratedRagCarriedRefHandoff(result, handoffGuard, '  '),
    renderAitpWriteBridgeResultDetails(result),
    renderStringList('evidence_refs', 'evidence_ref', evidenceRefsForAitpWriteBridgeResult(result), '  '),
    '</aitp_write_bridge>',
    '',
  ].join('\n');
}

function renderAitpHandoffExecutionPrecheck(
  precheck:
    | { readonly status: 'passed'; readonly guard?: AitpHandoffGuard | undefined }
    | { readonly status: 'failed'; readonly failure: AitpHandoffGuardFailure },
): string {
  if (precheck.status === 'passed') {
    if (precheck.guard === undefined) return '';
    return [
      `  <handoff_execution_precheck kind="${precheck.guard.kind}" status="passed" handoff_id="${escapeXml(precheck.guard.handoffId)}" confirmation_id="${escapeXml(precheck.guard.confirmationId)}" confirmation_status="${escapeXml(precheck.guard.confirmationStatus)}" selected_aitp_operation="${escapeXml(precheck.guard.selectedAitpOperation)}" missing_ref_repair_hint_count="${String(precheck.guard.missingRefRepairHintCount)}" missing_ref_repair_checklist_present="${String(precheck.guard.missingRefRepairChecklistPresent)}" repair_hint_operation_count="${String(precheck.guard.repairHintOperations.length)}" repair_hint_operations="${escapeXml(precheck.guard.repairHintOperations.join(','))}" selected_write_differs_from_repair_hints="${String(precheck.guard.selectedWriteDiffersFromRepairHints)}" bridge_call_allowed="true" bridge_called="true" retry_requires_explicit_execute_call="false" handoff_mutated_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none">`,
      renderExecutionPrecheckChecklistResult({ status: 'passed', guard: precheck.guard }, '    '),
      '  </handoff_execution_precheck>',
    ].join('\n');
  }
  const { failure } = precheck;
  return [
    `<handoff_execution_precheck kind="curated_rag_write_bridge_handoff" status="failed" code="${escapeXml(failure.code)}"${failure.field === undefined ? '' : ` field="${escapeXml(failure.field)}"`}${failure.path === undefined ? '' : ` path="${escapeXml(failure.path)}"`} next_step="${escapeXml(failure.remediation.nextStep)}" repair_target="${escapeXml(failure.remediation.repairTarget)}" bridge_call_allowed="false" bridge_called="false" retry_requires_explicit_execute_call="true" executes_write_now="false" records_evidence_now="false" handoff_mutated_now="false" claim_trust_mutation="none">`,
    renderExecutionPrecheckChecklistResult({ status: 'failed' }, '  '),
    '</handoff_execution_precheck>',
  ].join('\n');
}

function renderExecutionPrecheckChecklistResult(
  input:
    | { readonly status: 'passed'; readonly guard: AitpHandoffGuard }
    | { readonly status: 'failed' },
  indent: string,
): string {
  if (input.status === 'failed') {
    return `${indent}<readiness_checklist_result checklist_id_available="false" item_order="2" item_action="execute_aitp_write_bridge" item_status="not_followed" source="handoff_execution_precheck" execution_precheck_status="failed" bridge_called="false" executes_write_now="false" checklist_authorizes_execution="false" checklist_mutated_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" />`;
  }
  const draftFamily = readinessDraftFamily(input.guard.kind);
  return `${indent}<readiness_checklist_result checklist_id="${escapeXml(readinessChecklistId(draftFamily, input.guard.handoffId))}" draft_family="${draftFamily}" item_order="2" item_action="execute_aitp_write_bridge" item_status="followed" source="tool_call_json" previous_item_order="1" previous_item_action="inspect_aitp_write_bridge_handoff_readiness" execution_precheck_status="passed" bridge_called="true" explicit_execute_call_observed="true" executes_write_now="false" checklist_authorizes_execution="false" checklist_mutated_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" />`;
}

function renderAitpWriteBridgeHandoffReadiness(
  readiness:
    | { readonly status: 'passed'; readonly guard?: AitpHandoffGuard | undefined }
    | { readonly status: 'failed'; readonly failure: AitpHandoffGuardFailure },
): string {
  if (readiness.status === 'failed') {
    const { failure } = readiness;
    return [
      `<aitp_write_bridge_handoff_readiness kind="curated_rag_write_bridge_handoff" status="failed" code="${escapeXml(failure.code)}"${failure.field === undefined ? '' : ` field="${escapeXml(failure.field)}"`}${failure.path === undefined ? '' : ` path="${escapeXml(failure.path)}"`} next_step="${escapeXml(failure.remediation.nextStep)}" repair_target="${escapeXml(failure.remediation.repairTarget)}" bridge_call_allowed="false" bridge_called="false" executes_write_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" handoff_mutated_now="false" retry_requires_explicit_execute_call="true">`,
      renderReadinessChecklistResult({ status: 'failed' }, '  '),
      `  <message>Handoff readiness guard failed with code ${escapeXml(failure.code)}.</message>`,
      '</aitp_write_bridge_handoff_readiness>',
      '',
    ].join('\n');
  }
  const guard = readiness.guard;
  if (guard === undefined) {
    return '<aitp_write_bridge_handoff_readiness status="not_requested" bridge_call_allowed="false" bridge_called="false" executes_write_now="false" requires_handoff="true" />\n';
  }
  return [
    `<aitp_write_bridge_handoff_readiness kind="${guard.kind}" status="passed" handoff_id="${escapeXml(guard.handoffId)}" confirmation_id="${escapeXml(guard.confirmationId)}" confirmation_status="${escapeXml(guard.confirmationStatus)}" diagnostic_hash="${escapeXml(guard.diagnosticHash)}" selected_aitp_operation="${escapeXml(guard.selectedAitpOperation)}" missing_ref_repair_hint_count="${String(guard.missingRefRepairHintCount)}" missing_ref_repair_checklist_present="${String(guard.missingRefRepairChecklistPresent)}" repair_hint_operation_count="${String(guard.repairHintOperations.length)}" repair_hint_operations="${escapeXml(guard.repairHintOperations.join(','))}" selected_write_differs_from_repair_hints="${String(guard.selectedWriteDiffersFromRepairHints)}" bridge_call_allowed="true" bridge_called="false" executes_write_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" handoff_mutated_now="false" requires_explicit_execute_call="true">`,
    renderReadinessChecklistResult({ status: 'passed', guard }, '  '),
    '  <next_step>Call ResearchAction.execute_aitp_write_bridge with the same aitp_operation, aitp_payload, and aitp_handoff when explicit execution is intended.</next_step>',
    '</aitp_write_bridge_handoff_readiness>',
    '',
  ].join('\n');
}

function renderReadinessChecklistResult(
  input:
    | { readonly status: 'passed'; readonly guard: AitpHandoffGuard }
    | { readonly status: 'failed' },
  indent: string,
): string {
  if (input.status === 'failed') {
    return `${indent}<readiness_checklist_result checklist_id_available="false" item_order="1" item_action="inspect_aitp_write_bridge_handoff_readiness" item_status="failed" source="execute_aitp_write_bridge_handoff.readiness_call_json" read_only="true" bridge_called="false" executes_write_now="false" checklist_mutated_now="false" />`;
  }
  const draftFamily = readinessDraftFamily(input.guard.kind);
  return `${indent}<readiness_checklist_result checklist_id="${escapeXml(readinessChecklistId(draftFamily, input.guard.handoffId))}" draft_family="${draftFamily}" item_order="1" item_action="inspect_aitp_write_bridge_handoff_readiness" item_status="satisfied" source="execute_aitp_write_bridge_handoff.readiness_call_json" next_item_order="2" next_item_action="execute_aitp_write_bridge" read_only="true" bridge_called="false" executes_write_now="false" checklist_mutated_now="false" />`;
}

function readinessDraftFamily(kind: AitpHandoffGuard['kind']): string {
  return kind === 'record_ref_repair_write_bridge_handoff'
    ? 'record_ref_repair_write_call_draft'
    : 'curated_rag_write_call_draft';
}

function renderAitpHandoffGuard(handoffGuard: AitpHandoffGuard | undefined): string {
  if (handoffGuard === undefined) return '';
  const draftFamily = readinessDraftFamily(handoffGuard.kind);
  return `  <handoff_guard kind="${handoffGuard.kind}" handoff_id="${escapeXml(handoffGuard.handoffId)}" confirmation_id="${escapeXml(handoffGuard.confirmationId)}" confirmation_status="${escapeXml(handoffGuard.confirmationStatus)}" diagnostic_hash="${escapeXml(handoffGuard.diagnosticHash)}" selected_aitp_operation="${escapeXml(handoffGuard.selectedAitpOperation)}" missing_ref_repair_hint_count="${String(handoffGuard.missingRefRepairHintCount)}" missing_ref_repair_checklist_present="${String(handoffGuard.missingRefRepairChecklistPresent)}" repair_hint_operation_count="${String(handoffGuard.repairHintOperations.length)}" repair_hint_operations="${escapeXml(handoffGuard.repairHintOperations.join(','))}" selected_write_differs_from_repair_hints="${String(handoffGuard.selectedWriteDiffersFromRepairHints)}" readiness_checklist_id="${escapeXml(readinessChecklistId(draftFamily, handoffGuard.handoffId))}" readiness_checklist_item_order="2" readiness_checklist_item_action="execute_aitp_write_bridge" readiness_checklist_item_status="followed" readiness_checklist_reference_source="handoff_execution_precheck" checklist_authorizes_execution="false" checklist_mutated_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" status="passed" />`;
}

function renderAitpCuratedRagCarriedRefHandoff(
  result: AitpWriteBridgeExecutionResult,
  handoffGuard: AitpHandoffGuard | undefined,
  indent: string,
): string {
  if (handoffGuard?.kind !== 'curated_rag_write_bridge_handoff') return '';
  const carriedRef = curatedRagPromotionCarriedRef(result);
  if (carriedRef === undefined) return '';
  const nextStages = nextCuratedRagPromotionStagesForCarriedRef(carriedRef.refKind);
  if (nextStages.length === 0) return '';
  return [
    `${indent}<aitp_curated_rag_carried_ref_handoff source="execute_aitp_write_bridge_result" handoff_id="${escapeXml(handoffGuard.handoffId)}"${handoffGuard.chunkId === undefined ? '' : ` chunk_id="${escapeXml(handoffGuard.chunkId)}"`}${handoffGuard.stage === undefined ? '' : ` completed_stage="${escapeXml(handoffGuard.stage)}"`} completed_operation="${escapeXml(handoffGuard.selectedAitpOperation)}" canonical_ref="${escapeXml(carriedRef.canonicalRef)}" evidence_ref="${escapeXml(carriedRef.evidenceRef)}" ref_kind="${escapeXml(carriedRef.refKind)}" record_id="${escapeXml(carriedRef.recordId)}" feeds_next_stages="${escapeXml(nextStages.join(','))}" next_research_action="draft_aitp_curated_rag_write_bridge_call" carry_into="promotion_reviewed_overrides" carried_ref_executed_source="true" next_payload_mutated_now="false" next_write_executed_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" can_update_claim_trust="false" requires_reviewed_payload="true" requires_explicit_execute_call="true">`,
    `${indent}  <next_step>Use this ref as a reviewed override for a later AITP promotion sequence draft when the source text and claim scope have been reviewed.</next_step>`,
    `${indent}</aitp_curated_rag_carried_ref_handoff>`,
  ].join('\n');
}

function curatedRagPromotionCarriedRef(
  result: AitpWriteBridgeExecutionResult,
): { readonly canonicalRef: string; readonly evidenceRef: string; readonly refKind: string; readonly recordId: string } | undefined {
  const evidenceRef = evidenceRefsForAitpWriteBridgeResult(result)[0];
  if (evidenceRef === undefined) return undefined;
  const recordId = aitpWriteBridgeRecordId(result);
  const refKind = aitpRecordRefKind(evidenceRef);
  if (refKind === undefined || !PROMOTION_SEQUENCE_CARRIED_REF_KINDS.has(refKind)) return undefined;
  return {
    canonicalRef: `${refKind}:${recordId}`,
    evidenceRef,
    refKind,
    recordId,
  };
}

const PROMOTION_SEQUENCE_CARRIED_REF_KINDS = new Set([
  'source_asset',
  'reference_location',
  'evidence',
  'validation_result',
  'trust_preflight',
]);

function nextCuratedRagPromotionStagesForCarriedRef(refKind: string): readonly string[] {
  switch (refKind) {
    case 'source_asset':
      return ['reference_location', 'evidence'];
    case 'reference_location':
      return ['evidence'];
    case 'evidence':
      return ['validation', 'trust_preflight'];
    case 'validation_result':
      return ['trust_preflight'];
    default:
      return [];
  }
}

function aitpWriteBridgeRecordId(result: AitpWriteBridgeExecutionResult): string {
  switch (result.kind) {
    case 'curated_rag_ingest_result':
      return result.corpusId;
    case 'exploratory_record':
      return result.recordId;
    case 'source_asset':
      return result.assetId;
    case 'evidence':
      return result.evidenceId;
    case 'tool_run':
      return result.runId;
    case 'code_state':
      return result.codeStateId;
    case 'artifact':
      return result.artifactId;
    case 'reference_location':
      return result.locationId;
    case 'proof_obligation':
      return result.obligationId;
    case 'validation_contract':
      return result.contractId;
    case 'validation_result':
      return result.resultId;
    case 'source_reconstruction_review_result':
      return result.resultId;
    case 'human_checkpoint':
      return result.checkpointId;
    case 'trust_update_preflight':
      return result.preflightToken;
  }
}

function renderAitpWriteBridgeResultDetails(result: AitpWriteBridgeExecutionResult): string {
  if (result.kind !== 'curated_rag_ingest_result') return '';
  return [
    `  <curated_rag_ingest corpus_id="${escapeXml(result.corpusId)}" manifest_path="${escapeXml(result.manifestPath)}" index_path="${escapeXml(result.indexPath)}" manifest_hash="${escapeXml(result.manifestHash)}" index_status="${escapeXml(result.indexStatus)}" document_count="${String(result.documentCount)}" chunk_count="${String(result.chunkCount)}" retrieval_role="${result.retrievalRole}" records_validation_result="false" claim_trust_mutation="${result.claimTrustMutation}" requires_promotion_for_claim_support="true" />`,
    '  <promotion_boundary>Curated RAG ingestion only writes the AITP-owned heuristic corpus manifest/index; retrieved chunks must be promoted through source_asset, reference_location, evidence, validation, and trust preflight before claim support.</promotion_boundary>',
  ].join('\n');
}

function nodeIdsFromEdges(edges: readonly PhysicsGraphEdge[]): readonly string[] {
  return [...new Set(edges.flatMap((edge) => [edge.sourceId, edge.targetId]))].toSorted();
}

function graphRefsFromNodeIds(nodeIds: readonly string[]): readonly GraphRef[] {
  return nodeIds.map((id) => ({
    kind: 'Concept',
    id,
  }));
}

function safeId(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_.-]+/g, '-');
}

function shortSha256(value: string, length: number): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function renderActionList(actions: readonly ResearchActionDefinition[]): string {
  return [
    `<research_actions action_count="${String(actions.length)}">`,
    ...actions.map((action) => renderAction(action, '  ')),
    renderHandoffGuardRemediationTaxonomy('  '),
    renderCarriedRefHandoffDiagnosticTaxonomy('  '),
    '</research_actions>',
    '',
  ].join('\n');
}

function renderHandoffGuardRemediationTaxonomy(indent: string): string {
  const entries = Object.entries(HANDOFF_GUARD_REMEDIATION_BY_CODE) as ReadonlyArray<
    readonly [HandoffGuardFailureCode, HandoffGuardRemediationStep]
  >;
  return [
    `${indent}<handoff_guard_remediation_taxonomy kind="curated_rag_write_bridge_handoff" failure_count="${String(entries.length)}" read_only="true" executes_write_now="false" mutates_handoff_now="false" records_evidence="false" validates_claim="false" claim_trust_mutation="none">`,
    ...entries.map(
      ([code, nextStep]) =>
        `${indent}  <failure code="${escapeXml(code)}" next_step="${escapeXml(nextStep)}" retry_requires_explicit_execute_call="true" />`,
    ),
    `${indent}</handoff_guard_remediation_taxonomy>`,
  ].join('\n');
}

function renderCarriedRefHandoffDiagnosticTaxonomy(indent: string): string {
  const entries = Object.entries(CARRIED_REF_HANDOFF_REMEDIATION_BY_CODE) as ReadonlyArray<
    readonly [CarriedRefHandoffFailureCode, CarriedRefHandoffRemediationStep]
  >;
  return [
    `${indent}<carried_ref_handoff_diagnostic_taxonomy kind="promotion_carried_ref_handoff" failure_count="${String(entries.length)}" read_only="true" executes_write_now="false" renders_suggestion_now="false" renders_next_call_pointer_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none">`,
    ...entries.map(
      ([code, nextStep]) =>
        `${indent}  <failure code="${escapeXml(code)}" next_step="${escapeXml(nextStep)}" retry_requires_fresh_draft_action="true" />`,
    ),
    `${indent}</carried_ref_handoff_diagnostic_taxonomy>`,
  ].join('\n');
}

function renderAction(action: ResearchActionDefinition, indent: string): string {
  const algebra = asActionAlgebraDefinition(action);
  return (
    `${indent}<action id="${escapeXml(algebra.id)}" category="${algebra.category}" exposure="${algebra.exposure}" phase="${algebra.phase}" primitive_tool_policy="${algebra.primitiveToolPolicy}">` +
    `${escapeXml(algebra.title)}</action>`
  );
}

function renderPrimitivePlan(plan: ResearchPrimitivePlanTemplate): string {
  const fallbackLines = plan.toolNames.includes('WebSearch')
    ? [
        '  <fallbacks>',
        '    <fallback tool="WebSearch">If WebSearch is unavailable or unauthenticated, use FetchURL for known URLs or Read for local sources. Do not invent source evidence; finish the action as blocked or inconclusive when no reliable source can be retrieved.</fallback>',
        '  </fallbacks>',
      ]
    : [];
  return [
    `<primitive_tool_plan id="${escapeXml(plan.id)}" action_id="${escapeXml(plan.actionId)}" primitive_tool_policy="${escapeXml(plan.primitiveToolPolicy)}">`,
    `  <title>${escapeXml(plan.title)}</title>`,
    `  <intent>${escapeXml(plan.intent)}</intent>`,
    '  <required_sequence>',
    `    <call tool="ResearchAction" action="start_action_call" action_id="${escapeXml(plan.actionId)}" when="before_primitive_tools" />`,
    '    <call tool="native_tools" when="execute_primitive_plan_steps" />',
    `    <call tool="ResearchAction" action="finish_action_call" action_id="${escapeXml(plan.actionId)}" when="after_primitive_tools" required_outcome="pass|fail|blocked|inconclusive" />`,
    '  </required_sequence>',
    renderStringList('tools', 'tool', plan.toolNames, '  '),
    ...fallbackLines,
    '  <steps>',
    ...plan.steps.map((step) =>
      [
        `    <step id="${escapeXml(step.id)}" kind="${step.kind}" approval="${step.approval}" tools="${escapeXml(step.toolNames.join(','))}">`,
        `      <title>${escapeXml(step.title)}</title>`,
        `      <purpose>${escapeXml(step.purpose)}</purpose>`,
        renderStringList('expected_evidence', 'evidence', step.expectedEvidence, '      '),
        '    </step>',
      ].join('\n'),
    ),
    '  </steps>',
    `  <recording action_id="${escapeXml(plan.recording.actionId)}" primitive_tool_call_ids_required="${String(plan.recording.primitiveToolCallIdsRequired)}">`,
    `    <expected_outcome>${escapeXml(plan.recording.expectedOutcome)}</expected_outcome>`,
    renderStringList('evidence_refs', 'evidence_ref', plan.recording.evidenceRefs, '    '),
    '  </recording>',
    renderStringList('followup_actions', 'action', plan.followupActionIds, '  '),
    '</primitive_tool_plan>',
    '',
  ].join('\n');
}

function renderWorkFrameList(frames: readonly WorkFrame[], activeId?: string): string {
  if (frames.length === 0) return '<work_frames />\n';
  return [
    `<work_frames${activeId === undefined ? '' : ` active_id="${escapeXml(activeId)}"`}>`,
    ...frames.map((frame) => renderWorkFrame(frame, frame.id === activeId, '  ').trimEnd()),
    '</work_frames>',
    '',
  ].join('\n');
}

function renderWorkFrame(
  frame: {
    readonly id: string;
    readonly domain: string;
    readonly topic: string;
    readonly goal: string;
    readonly trustState: string;
    readonly contextPackId?: string | undefined;
    readonly activeObjectIds: readonly string[];
    readonly assumptionIds: readonly string[];
    readonly conventionIds: readonly string[];
    readonly sourceRefs: readonly string[];
    readonly openObligationIds: readonly string[];
  },
  active: boolean,
  indent = '',
): string {
  return [
    `${indent}<work_frame id="${escapeXml(frame.id)}" domain="${escapeXml(frame.domain)}" topic="${escapeXml(frame.topic)}" trust_state="${escapeXml(frame.trustState)}" active="${String(active)}">`,
    `${indent}  <goal>${escapeXml(frame.goal)}</goal>`,
    `${indent}  <context_pack_id>${escapeXml(frame.contextPackId ?? '')}</context_pack_id>`,
    renderStringList('active_objects', 'object', frame.activeObjectIds, `${indent}  `),
    renderStringList('assumptions', 'assumption', frame.assumptionIds, `${indent}  `),
    renderStringList('conventions', 'convention', frame.conventionIds, `${indent}  `),
    renderStringList('source_refs', 'source_ref', frame.sourceRefs, `${indent}  `),
    renderStringList('open_obligations', 'obligation', frame.openObligationIds, `${indent}  `),
    `${indent}</work_frame>`,
    '',
  ].join('\n');
}

function renderContextPack(pack: ResearchContextPack): string {
  return [
    `<context_pack id="${escapeXml(pack.id)}" work_frame_id="${escapeXml(pack.workFrameId)}" domain="${escapeXml(pack.domain)}" topic="${escapeXml(pack.topic)}">`,
    `  <goal>${escapeXml(pack.goal)}</goal>`,
    renderDomainPackManifest(pack),
    renderStringList('source_refs', 'source_ref', pack.sourceRefs, '  '),
    renderStringList('focus_objects', 'object', pack.focusObjectIds, '  '),
    '  <profiles>',
    ...pack.profiles.map(
      (profile) =>
        `    <profile id="${escapeXml(profile.id)}" status="${profile.status}" lenses="${escapeXml(profile.lenses.join(','))}" workflows="${escapeXml(profile.workflows.join(','))}">${escapeXml(profile.title)}</profile>`,
    ),
    '  </profiles>',
    '  <workflows>',
    ...pack.workflows.map(
      (workflow) =>
        `    <workflow id="${escapeXml(workflow.id)}" status="${workflow.status}" required_tools="${escapeXml(workflow.requiredTools.join(','))}" action_bindings="${escapeXml(workflow.actionBindingIds.join(','))}">${escapeXml(workflow.title)}</workflow>`,
    ),
    '  </workflows>',
    `  <physics requested_focus="${escapeXml(pack.physics.requestedFocus.join(','))}" included_focus="${escapeXml(pack.physics.includedFocus.join(','))}">`,
    ...pack.physics.capsules.map(
      (capsule) =>
        `    <capsule id="${escapeXml(capsule.id)}" kind="${capsule.kind}" reliability="${capsule.reliability}" checks="${escapeXml(capsule.requiredChecks.map((check) => check.id).join(','))}" actions="${escapeXml(capsule.actionAffordances.map((affordance) => affordance.actionId).join(','))}">${escapeXml(capsule.title)}</capsule>`,
    ),
    '  </physics>',
    `  <ledger statuses="${escapeXml(pack.ledger.includeStatuses.join(','))}">`,
    ...pack.ledger.proposals.map(
      (proposal) =>
        `    <proposal id="${escapeXml(proposal.id)}" kind="${escapeXml(proposal.kind)}" event_ids="${escapeXml(proposal.eventIds.join(','))}" confidence="${proposal.confidence}" />`,
    ),
    '  </ledger>',
    renderAitpSection(pack),
    renderCuratedRagSection(pack),
    renderCuratedRagCarriedRefRepairSection(pack),
    '  <action_bindings>',
    ...pack.actionBindings.map(renderActionBindingXml),
    '  </action_bindings>',
    '  <diagnostics>',
    ...pack.diagnostics.map(
      (diagnostic) =>
        `    <diagnostic severity="${diagnostic.severity}" source="${diagnostic.source}" code="${escapeXml(diagnostic.code)}"${diagnostic.refId === undefined ? '' : ` ref_id="${escapeXml(diagnostic.refId)}"`}>${escapeXml(diagnostic.message)}</diagnostic>`,
    ),
    '  </diagnostics>',
    '</context_pack>',
    '',
  ].join('\n');
}

function renderCuratedRagCarriedRefRepairSection(pack: ResearchContextPack): string {
  const repair = pack.curatedRagCarriedRefRepair;
  if (repair === undefined) return '  <curated_rag_carried_ref_repair_sequence />';
  return [
    `  <curated_rag_carried_ref_repair_sequence source="${repair.source}" active="${String(repair.active)}"${repair.failureCode === undefined ? '' : ` failure_code="${escapeXml(repair.failureCode)}"`}${repair.failurePath === undefined ? '' : ` failure_path="${escapeXml(repair.failurePath)}"`} taxonomy_action="${repair.taxonomyAction}" draft_action="${repair.draftAction}" readiness_action="${repair.readinessAction}" execute_action="${repair.executeAction}" executes_write_now="${String(repair.executesWriteNow)}" records_validation_result="${String(repair.recordsValidationResult)}" source_support_result="${String(repair.sourceSupportResult)}" claim_trust_mutation="${repair.claimTrustMutation}">`,
    renderBoundedStringList('trigger_terms', 'term', repair.triggerTerms, '    '),
    renderBoundedStringList('safe_sequence', 'step', repair.safeSequence, '    '),
    '  </curated_rag_carried_ref_repair_sequence>',
  ].join('\n');
}

function renderCuratedRagSection(pack: ResearchContextPack): string {
  const curatedRag = pack.curatedRag;
  if (curatedRag === undefined) return '  <aitp_curated_rag />';
  return [
    `  <aitp_curated_rag query="${escapeXml(curatedRag.query)}" index_mode="${curatedRag.indexMode}" result_role="${curatedRag.resultRole}" read_surface_effect="${curatedRag.readSurfaceEffect}" result_count="${String(curatedRag.resultCount)}" records_validation_result="false" claim_trust_mutation="${curatedRag.claimTrustMutation}" can_update_claim_trust="false" requires_promotion_for_claim_support="true" promotion_draft_suggested="${String(curatedRag.promotionDraftSuggested)}">`,
    renderBoundedStringList('reasons', 'reason', curatedRag.reasonIds, '    '),
    '    <results>',
    ...curatedRag.results.map(
      (item) =>
        `      <result chunk_id="${escapeXml(item.chunkId)}" document_id="${escapeXml(item.documentId)}" score="${String(item.score)}" content_hash="${escapeXml(item.contentHash)}"${item.promotionDraftBindingId === undefined ? '' : ` promotion_draft_binding_id="${escapeXml(item.promotionDraftBindingId)}"`}>` +
        `<summary>${escapeXml(item.summary)}</summary><text>${escapeXml(item.text)}</text></result>`,
    ),
    '    </results>',
    renderBoundedStringList(
      'promotion_draft_bindings',
      'binding',
      curatedRag.promotionDraftBindingIds,
      '    ',
    ),
    '    <promotion_boundary>Curated RAG is heuristic_context only; promote source passages through AITP source_asset, reference_location, evidence, validation, and trust preflight records before using them as claim support.</promotion_boundary>',
    '  </aitp_curated_rag>',
  ].join('\n');
}

function renderAitpSection(pack: ResearchContextPack): string {
  const aitp = pack.aitp;
  if (aitp === undefined) return '  <aitp />';
  return [
    `  <aitp truth_source="${escapeXml(aitp.truthSource)}" orientation_only="${String(aitp.orientationOnly)}">`,
    renderBoundedStringList('context_lines', 'line', aitp.contextLines, '    '),
    renderBoundedStringList('live_routes', 'route', aitp.liveRouteIds, '    '),
    renderBoundedStringList('blocked_routes', 'route', aitp.blockedRouteIds, '    '),
    renderBoundedStringList('abandoned_routes', 'route', aitp.abandonedRouteIds, '    '),
    renderBoundedStringList('pivot_required_routes', 'route', aitp.pivotRequiredRouteIds, '    '),
    renderBoundedStringList('source_assets', 'source_asset', aitp.sourceAssetIds, '    '),
    renderBoundedStringList(
      'source_assets_missing_hashes',
      'source_asset',
      aitp.sourceAssetMissingHashIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_assets_duplicate_hashes',
      'source_asset',
      aitp.sourceAssetDuplicateHashIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_stack_coverage',
      'claim',
      aitp.sourceStackCoverageClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_stack_evidence_gaps',
      'claim',
      aitp.sourceStackEvidenceGapClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_stack_reconstruction_gaps',
      'claim',
      aitp.sourceStackReconstructionGapClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_stack_review_gaps',
      'claim',
      aitp.sourceStackReviewGapClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_stack_next_actions',
      'action',
      aitp.sourceStackCoverageNextActions,
      '    ',
    ),
    renderBoundedStringList(
      'source_reconstruction_review',
      'claim',
      aitp.sourceReconstructionReviewClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_reconstruction_review_open',
      'claim',
      aitp.sourceReconstructionReviewOpenClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_reconstruction_review_needs_revision',
      'claim',
      aitp.sourceReconstructionReviewNeedsRevisionClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_reconstruction_review_inconclusive',
      'claim',
      aitp.sourceReconstructionReviewInconclusiveClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_reconstruction_review_packets',
      'claim',
      aitp.sourceReconstructionReviewPacketClaimIds,
      '    ',
    ),
    renderBoundedStringList(
      'source_reconstruction_review_next_actions',
      'action',
      aitp.sourceReconstructionReviewNextActions,
      '    ',
    ),
    renderBoundedStringList('open_obligations', 'obligation', aitp.openObligationIds, '    '),
    renderBoundedStringList('required_calls', 'call', aitp.requiredCallIds, '    '),
    renderBoundedStringList(
      'trust_prerequisite_calls',
      'call',
      aitp.trustPrerequisiteCallIds,
      '    ',
    ),
    renderBoundedStringList('trust_boundary_reasons', 'reason', aitp.trustBoundaryReasons, '    '),
    '  </aitp>',
  ].join('\n');
}

function renderActionBindingXml(binding: ResearchContextPack['actionBindings'][number]): string {
  const attrs = `id="${escapeXml(binding.id)}" action_id="${escapeXml(binding.actionId)}"` +
    `${binding.priority === undefined ? '' : ` priority="${binding.priority}"`}` +
    `${binding.checkId === undefined ? '' : ` check_id="${escapeXml(binding.checkId)}"`}` +
    `${binding.lensId === undefined ? '' : ` lens_id="${escapeXml(binding.lensId)}"`}` +
    `${binding.adapterId === undefined ? '' : ` adapter_id="${escapeXml(binding.adapterId)}"`}`;
  if (binding.params === undefined) {
    return `    <binding ${attrs} />`;
  }
  const theoryReasoning = theoryReasoningProjectionFromParams(binding.params);
  return [
    `    <binding ${attrs}>`,
    `      <params>${escapeXml(JSON.stringify(binding.params))}</params>`,
    ...(theoryReasoning === undefined
      ? []
      : [
          `      <theory_reasoning>${escapeXml(renderTheoryReasoningSummary(theoryReasoning, 12))}</theory_reasoning>`,
        ]),
    '    </binding>',
  ].join('\n');
}

function renderDomainPackManifest(pack: ResearchContextPack): string {
  const manifest = pack.domainPack;
  if (manifest === undefined) return '  <domain_pack />';
  return [
    `  <domain_pack id="${escapeXml(manifest.id)}" domain="${escapeXml(manifest.domain)}">`,
    renderBoundedStringList('profiles', 'profile', manifest.profileIds, '    '),
    renderBoundedStringList('workflows', 'workflow', manifest.workflowIds, '    '),
    renderBoundedStringList('capsules', 'capsule', manifest.capsuleIds, '    '),
    renderBoundedStringList('eval_cases', 'eval_case', manifest.evalCaseIds, '    '),
    renderBoundedStringList('actions', 'action', manifest.actionIds, '    '),
    renderBoundedStringList('required_tools', 'tool', manifest.requiredTools, '    '),
    '  </domain_pack>',
  ].join('\n');
}

function renderDomainPackInspection(pack: ResearchContextPack): string {
  const manifest = pack.domainPack;
  if (manifest === undefined) {
    return `<domain_pack_inspection context_pack_id="${escapeXml(pack.id)}" status="missing_manifest" />\n`;
  }
  return [
    `<domain_pack_inspection context_pack_id="${escapeXml(pack.id)}" manifest_id="${escapeXml(manifest.id)}" domain="${escapeXml(manifest.domain)}">`,
    renderBoundedStringList('profiles', 'profile', manifest.profileIds, '  '),
    renderBoundedStringList('workflows', 'workflow', manifest.workflowIds, '  '),
    renderBoundedStringList('capsules', 'capsule', manifest.capsuleIds, '  '),
    renderBoundedStringList('bridge_capsules', 'capsule', manifest.bridgeCapsuleIds, '  '),
    renderBoundedStringList('eval_cases', 'eval_case', manifest.evalCaseIds, '  '),
    renderBoundedStringList('action_bindings', 'binding', manifest.actionBindingIds, '  '),
    renderBoundedStringList('actions', 'action', manifest.actionIds, '  '),
    renderBoundedStringList('required_tools', 'tool', manifest.requiredTools, '  '),
    renderBoundedStringList('context_tags', 'tag', manifest.contextTags, '  '),
    renderDomainPackDiagnostics(manifest.diagnostics),
    '</domain_pack_inspection>',
    '',
  ].join('\n');
}

function renderDomainPackDiagnostics(
  diagnostics: readonly DomainPackManifestDiagnostic[],
): string {
  if (diagnostics.length === 0) return '  <diagnostics />';
  return [
    '  <diagnostics>',
    ...diagnostics.map(
      (diagnostic) =>
        `    <diagnostic severity="${diagnostic.severity}" source="${diagnostic.source}" code="${escapeXml(diagnostic.code)}"${diagnostic.refId === undefined ? '' : ` ref_id="${escapeXml(diagnostic.refId)}"`}${diagnostic.path === undefined ? '' : ` path="${escapeXml(diagnostic.path)}"`}${diagnostic.rootPath === undefined ? '' : ` root_path="${escapeXml(diagnostic.rootPath)}"`}>${escapeXml(diagnostic.message)}</diagnostic>`,
    ),
    '  </diagnostics>',
  ].join('\n');
}

function renderBoundedStringList(
  container: string,
  itemTag: string,
  values: readonly string[],
  indent: string,
): string {
  const max = 16;
  const boundedValues =
    values.length <= max ? values : [...values.slice(0, max), `...(+${String(values.length - max)} more)`];
  return renderStringList(container, itemTag, boundedValues, indent);
}

function renderStringList(
  container: string,
  itemTag: string,
  values: readonly string[],
  indent: string,
): string {
  if (values.length === 0) return `${indent}<${container} />`;
  return [
    `${indent}<${container}>`,
    ...values.map((value) => `${indent}  <${itemTag}>${escapeXml(value)}</${itemTag}>`),
    `${indent}</${container}>`,
  ].join('\n');
}

function ok(output: string): ExecutableToolResult {
  return { output };
}

function errorResult(output: string): ExecutableToolResult {
  return { isError: true, output };
}

function escapeXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
