import { z } from 'zod';

import type { PhysicsMemoryManager } from '../../../agent/physics-memory';
import type { BuiltinTool } from '../../../agent/tool';
import { ToolAccesses } from '../../../loop/tool-access';
import type {
  ExecutableToolContext,
  ExecutableToolResult,
  ToolExecution,
} from '../../../loop/types';
import {
  compilePhysicsContext,
  PHYSICS_CAPSULE_KINDS,
  PhysicsMemoryRegistry,
  RELIABILITY_STATES,
  promotePhysicsCandidates,
  type BridgePolicy,
  type PhysicsGraphCandidate,
  type PhysicsCapsule,
  type PhysicsCapsuleKind,
  type PhysicsContextPack,
  type PhysicsPromotionPacket,
  type ReliabilityState,
} from '../../../physics-memory';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './physics-memory-tool.md';

const ACTIONS = [
  'list_domains',
  'list_capsules',
  'load_capsule',
  'compile_context',
  'promote_candidate',
] as const;
const BRIDGE_POLICIES = ['deny', 'explicit-only', 'allow'] as const;
const PROMOTION_TARGETS = ['checked', 'validated', 'formalized'] as const;

export const PhysicsMemoryToolInputSchema = z.object({
  action: z.enum(ACTIONS).describe('The physics-memory operation to perform.'),
  domain: z.string().optional().describe('Domain id for scoped listing or context compilation.'),
  kind: z.enum(PHYSICS_CAPSULE_KINDS).optional().describe('Optional capsule kind filter.'),
  id: z.string().optional().describe('Capsule id for load_capsule.'),
  focus: z.array(z.string()).optional().describe('Focused capsule ids for compile_context.'),
  reliability_floor: z
    .enum(RELIABILITY_STATES)
    .optional()
    .describe('Minimum reliability state for compile_context.'),
  bridge_policy: z
    .enum(BRIDGE_POLICIES)
    .optional()
    .describe('Cross-domain inclusion policy for compile_context.'),
  include_body: z
    .boolean()
    .optional()
    .describe('Whether load_capsule or compile_context should include capsule body text.'),
  candidates: z
    .array(z.unknown())
    .optional()
    .describe('Candidate graph objects for promotion.'),
  packet_id: z.string().optional().describe('Promotion packet id for promote_candidate.'),
  candidate_ids: z.array(z.string()).optional().describe('Candidate ids to promote.'),
  source_refs: z.array(z.string()).optional().describe('Promotion source refs.'),
  validation_refs: z.array(z.string()).optional().describe('Promotion validation refs.'),
  failure_modes: z.array(z.string()).optional().describe('Known failure modes for promotion.'),
  scope_regimes: z.array(z.string()).optional().describe('Scope regimes for promotion.'),
  scope_assumptions: z.array(z.string()).optional().describe('Scope assumptions for promotion.'),
  scope_excludes: z.array(z.string()).optional().describe('Scope exclusions for promotion.'),
  target_reliability: z
    .enum(PROMOTION_TARGETS)
    .optional()
    .describe('Target reliability for promotion.'),
  required_human_checkpoint: z
    .boolean()
    .optional()
    .describe('Whether promotion requires human checkpoint.'),
  human_checkpoint_label: z
    .string()
    .optional()
    .describe('Human checkpoint label required for formalized promotion.'),
});

export type PhysicsMemoryToolInput = z.Infer<typeof PhysicsMemoryToolInputSchema>;

export class PhysicsMemoryTool implements BuiltinTool<PhysicsMemoryToolInput> {
  readonly name = 'PhysicsMemory' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(PhysicsMemoryToolInputSchema);
  private readonly registry: PhysicsMemoryRegistry;
  private readonly manager: PhysicsMemoryManager | undefined;

  constructor(memory: PhysicsMemoryRegistry | PhysicsMemoryManager) {
    if (memory instanceof PhysicsMemoryRegistry) {
      this.registry = memory;
    } else {
      this.registry = memory.registry;
      this.manager = memory;
    }
  }

  resolveExecution(args: PhysicsMemoryToolInput): ToolExecution {
    return {
      accesses: ToolAccesses.none(),
      description: `Physics memory: ${args.action}`,
      approvalRule: this.name,
      execute: (ctx) => this.execution(args, ctx),
    };
  }

  private async execution(
    args: PhysicsMemoryToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    try {
      switch (args.action) {
        case 'list_domains':
          return ok(renderDomains(this.registry.listDomains()));
        case 'list_capsules':
          return ok(
            renderCapsuleList(
              this.registry.listCapsules({
                domain: args.domain,
                kind: args.kind as PhysicsCapsuleKind | undefined,
              }),
            ),
          );
        case 'load_capsule':
          return this.loadCapsule(args, ctx);
        case 'compile_context':
          return this.compileContext(args, ctx);
        case 'promote_candidate':
          return this.promoteCandidate(args, ctx);
      }
    } catch (error) {
      return {
        isError: true,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private loadCapsule(
    args: PhysicsMemoryToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (args.id === undefined || args.id.length === 0) {
      return errorResult('PhysicsMemory load_capsule requires an id.');
    }
    const capsule = this.registry.requireCapsule(args.id);
    this.manager?.recordCapsuleLoaded(capsule, {
      source: 'model-tool',
      toolCallId: ctx.toolCallId,
    });
    return ok(renderCapsule(capsule, args.include_body ?? true));
  }

  private compileContext(
    args: PhysicsMemoryToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (args.domain === undefined || args.domain.length === 0) {
      return errorResult('PhysicsMemory compile_context requires a domain.');
    }
    const input = {
      domain: args.domain,
      focus: args.focus,
      reliabilityFloor: args.reliability_floor as ReliabilityState | undefined,
      bridgePolicy: args.bridge_policy as BridgePolicy | undefined,
    };
    const pack = compilePhysicsContext(this.registry, input);
    this.manager?.recordContextCompiled(input, pack, {
      source: 'model-tool',
      toolCallId: ctx.toolCallId,
    });
    const hasError = pack.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    return {
      isError: hasError ? true : undefined,
      output: renderContextPack(pack, args.include_body ?? true),
    };
  }

  private promoteCandidate(
    args: PhysicsMemoryToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    const candidates = parseCandidates(args.candidates);
    if (candidates.length === 0) {
      return errorResult('PhysicsMemory promote_candidate requires at least one candidate.');
    }
    if (args.packet_id === undefined || args.packet_id.length === 0) {
      return errorResult('PhysicsMemory promote_candidate requires packet_id.');
    }
    if (args.target_reliability === undefined) {
      return errorResult('PhysicsMemory promote_candidate requires target_reliability.');
    }
    const packet: PhysicsPromotionPacket = {
      id: args.packet_id,
      candidateIds: args.candidate_ids ?? candidates.map((candidate) => candidate.id),
      sourceRefs: args.source_refs ?? [],
      validationRefs: args.validation_refs ?? [],
      failureModes: args.failure_modes ?? [],
      scope:
        args.scope_regimes === undefined &&
        args.scope_assumptions === undefined &&
        args.scope_excludes === undefined
          ? undefined
          : {
              regimes: args.scope_regimes,
              assumptions: args.scope_assumptions,
              excludes: args.scope_excludes,
            },
      targetReliability: args.target_reliability,
      requiredHumanCheckpoint: args.required_human_checkpoint ?? false,
      humanCheckpointLabel: args.human_checkpoint_label,
    };
    const result = promotePhysicsCandidates(candidates, packet);
    if (!result.ok) {
      return {
        isError: true,
        output: renderPromotionResult(result),
      };
    }
    for (const capsule of result.capsules) {
      this.registry.register(capsule, { replace: true });
    }
    this.manager?.recordCapsulesPromoted(packet, result.capsules, {
      source: 'model-tool',
      toolCallId: ctx.toolCallId,
    });
    return ok(renderPromotionResult(result));
  }
}

function ok(output: string): ExecutableToolResult {
  return { output };
}

function errorResult(output: string): ExecutableToolResult {
  return { isError: true, output };
}

function renderDomains(domains: readonly string[]): string {
  if (domains.length === 0) return '<physics_memory_domains />\n';
  return [
    '<physics_memory_domains>',
    ...domains.map((domain) => `  <domain id="${escapeXml(domain)}" />`),
    '</physics_memory_domains>',
    '',
  ].join('\n');
}

function renderCapsuleList(capsules: readonly PhysicsCapsule[]): string {
  if (capsules.length === 0) return '<physics_memory_capsules />\n';
  return [
    '<physics_memory_capsules>',
    ...capsules.map((capsule) => renderCapsuleSummary(capsule, '  ')),
    '</physics_memory_capsules>',
    '',
  ].join('\n');
}

function renderPromotionResult(input: ReturnType<typeof promotePhysicsCandidates>): string {
  const lines = [
    `<physics_promotion ok="${input.ok ? 'true' : 'false'}">`,
    '  <diagnostics>',
    ...input.diagnostics.map(
      (diagnostic) =>
        `    <diagnostic severity="${diagnostic.severity}" code="${escapeXml(diagnostic.code)}">` +
        `${escapeXml(diagnostic.message)}</diagnostic>`,
    ),
    '  </diagnostics>',
    '  <capsules>',
    ...input.capsules.map((capsule) => renderCapsuleSummary(capsule, '    ')),
    '  </capsules>',
    '</physics_promotion>',
    '',
  ];
  return lines.join('\n');
}

function renderContextPack(pack: PhysicsContextPack, includeBody: boolean): string {
  const lines = [
    `<physics_memory_context domain="${escapeXml(pack.domain)}">`,
    renderFocus(pack.focus, '  '),
    '  <diagnostics>',
    ...pack.diagnostics.map(
      (diagnostic) =>
        `    <diagnostic severity="${diagnostic.severity}" code="${escapeXml(diagnostic.code)}"` +
        `${diagnostic.capsuleId === undefined ? '' : ` capsule_id="${escapeXml(diagnostic.capsuleId)}"`}>` +
        `${escapeXml(diagnostic.message)}</diagnostic>`,
    ),
    '  </diagnostics>',
    '  <capsules>',
    ...pack.capsules.map((capsule) => renderCapsule(capsule, includeBody, '    ')),
    '  </capsules>',
    '</physics_memory_context>',
    '',
  ];
  return lines.join('\n');
}

function renderCapsule(capsule: PhysicsCapsule, includeBody: boolean, indent = ''): string {
  const metadata = capsule.metadata;
  const lines = [
    `${indent}<physics_capsule id="${escapeXml(metadata.id)}" kind="${metadata.kind}" domain="${escapeXml(metadata.domain)}" reliability="${metadata.reliability}">`,
    `${indent}  <title>${escapeXml(metadata.title)}</title>`,
    renderTagList('symbols', 'symbol', metadata.symbols, `${indent}  `),
    renderTagList('assumes', 'assumption', metadata.assumes, `${indent}  `),
    renderTagList('depends_on', 'capsule', metadata.dependsOn, `${indent}  `),
    renderTagList('source_refs', 'source_ref', metadata.sourceRefs, `${indent}  `),
    renderGraphRefs(capsule, `${indent}  `),
    renderExpansionHandles(capsule, `${indent}  `),
    renderRequiredChecks(capsule, `${indent}  `),
    renderActionAffordances(capsule, `${indent}  `),
  ];
  if (includeBody) {
    lines.push(`${indent}  <body>${escapeXml(capsule.body)}</body>`);
  }
  lines.push(`${indent}</physics_capsule>`);
  return lines.join('\n');
}

function renderCapsuleSummary(capsule: PhysicsCapsule, indent = ''): string {
  const metadata = capsule.metadata;
  return (
    `${indent}<capsule id="${escapeXml(metadata.id)}" kind="${metadata.kind}" ` +
    `domain="${escapeXml(metadata.domain)}" reliability="${metadata.reliability}">` +
    `${escapeXml(metadata.title)}</capsule>`
  );
}

function renderFocus(focus: readonly string[], indent: string): string {
  if (focus.length === 0) return `${indent}<focus />`;
  return [
    `${indent}<focus>`,
    ...focus.map((id) => `${indent}  <capsule id="${escapeXml(id)}" />`),
    `${indent}</focus>`,
  ].join('\n');
}

function renderTagList(
  container: string,
  itemTag: string,
  items: readonly string[],
  indent: string,
): string {
  if (items.length === 0) return `${indent}<${container} />`;
  return [
    `${indent}<${container}>`,
    ...items.map((item) => `${indent}  <${itemTag}>${escapeXml(item)}</${itemTag}>`),
    `${indent}</${container}>`,
  ].join('\n');
}

function renderGraphRefs(capsule: PhysicsCapsule, indent: string): string {
  const refs = capsule.metadata.graphRefs;
  if (refs.length === 0) return `${indent}<graph_refs />`;
  return [
    `${indent}<graph_refs>`,
    ...refs.map(
      (ref) =>
        `${indent}  <graph_ref kind="${ref.kind}" id="${escapeXml(ref.id)}"` +
        `${ref.relation === undefined ? ' />' : ` relation="${ref.relation}" />`}`,
    ),
    `${indent}</graph_refs>`,
  ].join('\n');
}

function renderExpansionHandles(capsule: PhysicsCapsule, indent: string): string {
  const handles = capsule.metadata.expansionHandles;
  if (handles.length === 0) return `${indent}<expansion_handles />`;
  return [
    `${indent}<expansion_handles>`,
    ...handles.map(
      (handle) =>
        `${indent}  <expansion kind="${handle.kind}" ref="${escapeXml(handle.ref)}"` +
        `${handle.title === undefined ? ' />' : ` title="${escapeXml(handle.title)}" />`}`,
    ),
    `${indent}</expansion_handles>`,
  ].join('\n');
}

function renderRequiredChecks(capsule: PhysicsCapsule, indent: string): string {
  const checks = capsule.metadata.requiredChecks;
  if (checks.length === 0) return `${indent}<required_checks />`;
  return [
    `${indent}<required_checks>`,
    ...checks.map(
      (check) =>
        `${indent}  <check id="${escapeXml(check.id)}" kind="${check.kind}" severity="${check.severity}">` +
        `${escapeXml(check.description ?? '')}</check>`,
    ),
    `${indent}</required_checks>`,
  ].join('\n');
}

function renderActionAffordances(capsule: PhysicsCapsule, indent: string): string {
  const affordances = capsule.metadata.actionAffordances;
  if (affordances.length === 0) return `${indent}<action_affordances />`;
  return [
    `${indent}<action_affordances>`,
    ...affordances.map(
      (affordance) =>
        `${indent}  <action id="${escapeXml(affordance.actionId)}" intent="${affordance.intent}">` +
        `${escapeXml(affordance.reason ?? '')}</action>`,
    ),
    `${indent}</action_affordances>`,
  ].join('\n');
}

function escapeXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseCandidates(values: readonly unknown[] | undefined): readonly PhysicsGraphCandidate[] {
  if (values === undefined) return [];
  return values.filter((value): value is PhysicsGraphCandidate => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<PhysicsGraphCandidate>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.kind === 'string' &&
      typeof candidate.domain === 'string' &&
      typeof candidate.title === 'string' &&
      typeof candidate.body === 'string' &&
      typeof candidate.reliability === 'string' &&
      Array.isArray(candidate.sourceEventIds) &&
      Array.isArray(candidate.sourceRefs) &&
      Array.isArray(candidate.relatedObjects) &&
      Array.isArray(candidate.dependsOn) &&
      Array.isArray(candidate.assumptions) &&
      candidate.promotionState === 'candidate'
    );
  });
}
