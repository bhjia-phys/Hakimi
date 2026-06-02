import { z } from 'zod';

import type { ResearchActionManager } from '../../../agent/research-action';
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
  asActionAlgebraDefinition,
  recommendResearchActions,
  type ResearchActionCategory,
  type ResearchActionDefinition,
  type ResearchActionExposure,
  type ResearchActionOutcome,
  type ResearchActionSource,
  type ResearchObligation,
  type WorkFrame,
} from '../../../research-action';
import {
  PHYSICS_CAPSULE_KINDS,
  RELIABILITY_STATES,
  type GraphRef,
  type PhysicsCapsuleKind,
} from '../../../physics-memory';
import type { ResearchContextPack } from '../../../research-context';
import { RESEARCH_LEDGER_EVENT_STATUSES } from '../../../research-ledger';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './research-action-tool.md';

const ACTIONS = [
  'list_actions',
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
] as const;
const EXPOSURES = ['direct', 'deferred', 'direct-model-only', 'hidden'] as const;
const CATEGORIES = ['graph', 'derivation', 'physics', 'code', 'benchmark', 'memory', 'harness'] as const;
const OUTCOMES = ['pass', 'fail', 'blocked', 'inconclusive'] as const;
const SOURCES = ['model', 'controller', 'hidden-check', 'subagent', 'replay'] as const;
const BRIDGE_POLICIES = ['deny', 'explicit-only', 'allow'] as const;
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
  action_id: z.string().optional().describe('Action id for record_action_result.'),
  call_id: z.string().optional().describe('Semantic action call id for record_action_result.'),
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
});

export type ResearchActionToolInput = z.Infer<typeof ResearchActionToolInputSchema>;

export class ResearchActionTool implements BuiltinTool<ResearchActionToolInput> {
  readonly name = 'ResearchAction' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ResearchActionToolInputSchema);
  private readonly registry: ResearchActionRegistry;

  constructor(private readonly manager?: ResearchActionManager) {
    this.registry = new ResearchActionRegistry();
    for (const action of DEFAULT_RESEARCH_ACTIONS) {
      this.registry.register(action);
    }
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
        capsuleKind: args.capsule_kind as PhysicsCapsuleKind | undefined,
      }),
    );
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
        (item) =>
          `  <recommendation action_id="${escapeXml(item.action.id)}" score="${String(item.score)}" obligation_ids="${escapeXml(item.obligationIds.join(','))}">${escapeXml(item.reasons.join(' | '))}</recommendation>`,
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
    if (args.call_id === undefined || args.call_id.length === 0) {
      return errorResult('ResearchAction record_action_result requires a call_id.');
    }
    if (args.outcome === undefined) {
      return errorResult('ResearchAction record_action_result requires an outcome.');
    }
    const source = (args.source ?? 'model') as ResearchActionSource;
    const record = {
      actionId: args.action_id,
      callId: args.call_id,
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
      `<research_action_recorded action_id="${escapeXml(record.actionId)}" call_id="${escapeXml(record.callId)}" outcome="${record.outcome}" />\n`,
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
    if (args.call_id === undefined || args.call_id.length === 0) {
      return errorResult('ResearchAction start_action_call requires call_id.');
    }
    const started = this.manager.startActionCall(
      {
        actionId: args.action_id,
        callId: args.call_id,
        input: args.action_input,
      },
      {
        source: 'model',
        toolCallId: ctx.toolCallId,
      },
    );
    return ok(
      `<research_action_call_started action_id="${escapeXml(started.actionId)}" call_id="${escapeXml(started.callId)}"${started.workFrameId === undefined ? '' : ` work_frame_id="${escapeXml(started.workFrameId)}"`} />\n`,
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
    if (args.call_id === undefined || args.call_id.length === 0) {
      return errorResult('ResearchAction finish_action_call requires call_id.');
    }
    if (args.outcome === undefined) {
      return errorResult('ResearchAction finish_action_call requires outcome.');
    }
    this.manager.finishActionCall(
      {
        actionId: args.action_id,
        callId: args.call_id,
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
      `<research_action_call_finished action_id="${escapeXml(args.action_id)}" call_id="${escapeXml(args.call_id)}" outcome="${args.outcome}" />\n`,
    );
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
    '  <action_bindings>',
    ...pack.actionBindings.map(
      (binding) =>
        `    <binding id="${escapeXml(binding.id)}" action_id="${escapeXml(binding.actionId)}"${binding.priority === undefined ? '' : ` priority="${binding.priority}"`}${binding.checkId === undefined ? '' : ` check_id="${escapeXml(binding.checkId)}"`}${binding.lensId === undefined ? '' : ` lens_id="${escapeXml(binding.lensId)}"`}${binding.adapterId === undefined ? '' : ` adapter_id="${escapeXml(binding.adapterId)}"`} />`,
    ),
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
