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
  coerceAitpWriteBridgeInput,
  evidenceRefsForAitpWriteBridgeResult,
  renderTheoryReasoningSummary,
  theoryReasoningProjectionFromParams,
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
    return ok(renderAitpWriteBridgeExecution(operation, actionId, resolvedCallId.callId, result));
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
        primitiveToolCallIds: args.primitive_tool_call_ids ?? [],
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
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return undefined;
  const value = (record as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
): string {
  const target = aitpRuntimeBridgeTargetForOperation(operation);
  return [
    `<aitp_write_bridge operation="${operation}" action_id="${escapeXml(actionId)}" call_id="${escapeXml(callId)}" kind="${result.kind}" ok="${String(result.ok)}">`,
    `  <runtime_target entrypoint_key="${escapeXml(target.entrypointKey)}" mcp_tool="${escapeXml(target.mcpTool)}" cli_fallback="${escapeXml(target.cliFallback)}" surface="${escapeXml(target.surface)}" preferred_transport="${target.preferredTransport}" fallback_transport="${target.fallbackTransport}" mcp_argument_style="${target.mcpInvocation.argumentStyle}" mcp_base_argument="${target.mcpInvocation.baseArgument}" mcp_payload_key_case="${target.mcpInvocation.payloadKeyCase}" mcp_result_content_type="${target.mcpInvocation.resultContentType}" fallback_policy="${target.mcpInvocation.fallbackPolicy}" state_effect="${target.stateEffect}" claim_trust_mutation="${target.claimTrustMutation}" />`,
    `  <record_id>${escapeXml(aitpWriteBridgeRecordId(result))}</record_id>`,
    renderStringList('evidence_refs', 'evidence_ref', evidenceRefsForAitpWriteBridgeResult(result), '  '),
    '</aitp_write_bridge>',
    '',
  ].join('\n');
}

function aitpWriteBridgeRecordId(result: AitpWriteBridgeExecutionResult): string {
  switch (result.kind) {
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

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function renderActionList(actions: readonly ResearchActionDefinition[]): string {
  if (actions.length === 0) return '<research_actions />\n';
  return [
    '<research_actions>',
    ...actions.map((action) => renderAction(action, '  ')),
    '</research_actions>',
    '',
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
