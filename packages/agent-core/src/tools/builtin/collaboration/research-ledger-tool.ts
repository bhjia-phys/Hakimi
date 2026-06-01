import { z } from 'zod';

import type { ResearchLedgerManager } from '../../../agent/research-ledger';
import type { BuiltinTool } from '../../../agent/tool';
import { ToolAccesses } from '../../../loop/tool-access';
import type {
  ExecutableToolContext,
  ExecutableToolResult,
  ToolExecution,
} from '../../../loop/types';
import {
  compileResearchLedgerProposals,
  RESEARCH_LEDGER_EVENT_STATUSES,
  RESEARCH_LEDGER_EVENT_TYPES,
  ResearchLedgerRegistry,
  type CompileProposal,
  type ResearchLedgerCompileDiagnostic,
  type ResearchLedgerCompileResult,
  type ResearchLedgerEvent,
  type ResearchLedgerEventStatus,
  type ResearchLedgerEventType,
} from '../../../research-ledger';
import { PHYSICS_CAPSULE_KINDS, type PhysicsCapsuleKind } from '../../../physics-memory';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './research-ledger-tool.md';

const ACTIONS = [
  'list_topics',
  'list_events',
  'load_event',
  'compile_proposals',
  'write_event',
] as const;

export const ResearchLedgerToolInputSchema = z.object({
  action: z.enum(ACTIONS).describe('The research-ledger operation to perform.'),
  topic: z.string().optional().describe('Topic id for scoped listing or proposal compilation.'),
  domain: z.string().optional().describe('Domain id for scoped listing or proposal compilation.'),
  type: z.enum(RESEARCH_LEDGER_EVENT_TYPES).optional().describe('Optional event type filter.'),
  status: z.enum(RESEARCH_LEDGER_EVENT_STATUSES).optional().describe('Optional event status filter.'),
  id: z.string().optional().describe('Event id for load_event.'),
  include_body: z.boolean().optional().describe('Whether load_event should include event body.'),
  body: z.string().optional().describe('Markdown body for write_event.'),
  source_refs: z.array(z.string()).optional().describe('Source refs for write_event.'),
  depends_on: z.array(z.string()).optional().describe('Dependency event ids for write_event.'),
  candidate_capsule_kind: z
    .enum(PHYSICS_CAPSULE_KINDS)
    .optional()
    .describe('Candidate capsule kind for write_event.'),
  open_questions: z.array(z.string()).optional().describe('Open questions for write_event.'),
  related_objects: z.array(z.string()).optional().describe('Related object ids for write_event.'),
  created_at: z.string().optional().describe('Optional ISO timestamp for write_event.'),
  overwrite: z.boolean().optional().describe('Allow write_event to replace an existing event file/id.'),
});

export type ResearchLedgerToolInput = z.Infer<typeof ResearchLedgerToolInputSchema>;

export class ResearchLedgerTool implements BuiltinTool<ResearchLedgerToolInput> {
  readonly name = 'ResearchLedger' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ResearchLedgerToolInputSchema);
  private readonly registry: ResearchLedgerRegistry;
  private readonly manager: ResearchLedgerManager | undefined;

  constructor(ledger: ResearchLedgerRegistry | ResearchLedgerManager) {
    if (ledger instanceof ResearchLedgerRegistry) {
      this.registry = ledger;
    } else {
      this.registry = ledger.registry;
      this.manager = ledger;
    }
  }

  resolveExecution(args: ResearchLedgerToolInput): ToolExecution {
    return {
      accesses:
        args.action === 'write_event' && this.manager !== undefined
          ? ToolAccesses.writeTree(this.manager.defaultWriteRoot().path)
          : ToolAccesses.none(),
      description: `Research ledger: ${args.action}`,
      approvalRule: this.name,
      execute: (ctx) => this.execution(args, ctx),
    };
  }

  private async execution(
    args: ResearchLedgerToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    try {
      switch (args.action) {
        case 'list_topics':
          return ok(renderTopics(this.registry.listTopics({ domain: args.domain })));
        case 'list_events':
          return ok(
            renderEventList(
              this.registry.listEvents({
                topic: args.topic,
                domain: args.domain,
                type: args.type as ResearchLedgerEventType | undefined,
                status: args.status as ResearchLedgerEventStatus | undefined,
              }),
            ),
          );
        case 'load_event':
          return this.loadEvent(args, ctx);
        case 'compile_proposals':
          return this.compileProposals(args, ctx);
        case 'write_event':
          return await this.writeEvent(args, ctx);
      }
    } catch (error) {
      return {
        isError: true,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private loadEvent(
    args: ResearchLedgerToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    if (args.id === undefined || args.id.length === 0) {
      return errorResult('ResearchLedger load_event requires an id.');
    }
    const event = this.registry.requireEvent(args.id);
    this.manager?.recordEventLoaded(event, {
      source: 'model-tool',
      toolCallId: ctx.toolCallId,
    });
    return ok(renderEvent(event, args.include_body ?? true));
  }

  private compileProposals(
    args: ResearchLedgerToolInput,
    ctx: ExecutableToolContext,
  ): ExecutableToolResult {
    const input = {
      topic: args.topic,
      domain: args.domain,
      type: args.type as ResearchLedgerEventType | undefined,
      includeStatuses:
        args.status === undefined
          ? undefined
          : ([args.status] as readonly ResearchLedgerEventStatus[]),
    };
    const result = compileResearchLedgerProposals(this.registry, input);
    this.manager?.recordProposalsCompiled(input, result, {
      source: 'model-tool',
      toolCallId: ctx.toolCallId,
    });
    const hasError = result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    return {
      isError: hasError ? true : undefined,
      output: renderCompileResult(result),
    };
  }

  private async writeEvent(
    args: ResearchLedgerToolInput,
    ctx: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (this.manager === undefined) {
      return errorResult('ResearchLedger write_event requires a session research ledger manager.');
    }
    const id = args.id;
    const topic = args.topic;
    const domain = args.domain;
    const type = args.type;
    const body = args.body;
    if (id === undefined || id.length === 0) {
      return errorResult('ResearchLedger write_event requires id.');
    }
    if (topic === undefined || topic.length === 0) {
      return errorResult('ResearchLedger write_event requires topic.');
    }
    if (domain === undefined || domain.length === 0) {
      return errorResult('ResearchLedger write_event requires domain.');
    }
    if (type === undefined || type.length === 0) {
      return errorResult('ResearchLedger write_event requires type.');
    }
    if (body === undefined || body.length === 0) {
      return errorResult('ResearchLedger write_event requires body.');
    }
    if (args.source_refs === undefined || args.source_refs.length === 0) {
      return errorResult('ResearchLedger write_event requires at least one source_refs entry.');
    }
    const result = await this.manager.writeEvent(
      {
        metadata: {
          id,
          type,
          topic,
          domain,
          status: (args.status as ResearchLedgerEventStatus | undefined) ?? 'captured',
          sourceRefs: args.source_refs,
          dependsOn: args.depends_on ?? [],
          candidateCapsuleKind: args.candidate_capsule_kind as PhysicsCapsuleKind | undefined,
          openQuestions: args.open_questions ?? [],
          relatedObjects: args.related_objects ?? [],
          createdAt: args.created_at,
        },
        body,
        overwrite: args.overwrite,
      },
      {
        source: 'model-tool',
        toolCallId: ctx.toolCallId,
        overwrite: args.overwrite,
      },
    );
    return ok(renderWriteResult(result));
  }
}

function ok(output: string): ExecutableToolResult {
  return { output };
}

function errorResult(output: string): ExecutableToolResult {
  return { isError: true, output };
}

function renderTopics(topics: readonly string[]): string {
  if (topics.length === 0) return '<research_ledger_topics />\n';
  return [
    '<research_ledger_topics>',
    ...topics.map((topic) => `  <topic id="${escapeXml(topic)}" />`),
    '</research_ledger_topics>',
    '',
  ].join('\n');
}

function renderEventList(events: readonly ResearchLedgerEvent[]): string {
  if (events.length === 0) return '<research_ledger_events />\n';
  return [
    '<research_ledger_events>',
    ...events.map((event) => renderEventSummary(event, '  ')),
    '</research_ledger_events>',
    '',
  ].join('\n');
}

function renderEvent(event: ResearchLedgerEvent, includeBody: boolean, indent = ''): string {
  const metadata = event.metadata;
  const lines = [
    `${indent}<research_ledger_event id="${escapeXml(metadata.id)}" type="${metadata.type}" topic="${escapeXml(metadata.topic)}" domain="${escapeXml(metadata.domain)}" status="${metadata.status}">`,
    `${indent}  <path>${escapeXml(event.path)}</path>`,
    renderTagList('source_refs', 'source_ref', metadata.sourceRefs, `${indent}  `),
    renderTagList('depends_on', 'event', metadata.dependsOn, `${indent}  `),
    `${indent}  <candidate_capsule_kind>${escapeXml(metadata.candidateCapsuleKind ?? '')}</candidate_capsule_kind>`,
    renderTagList('open_questions', 'question', metadata.openQuestions, `${indent}  `),
    renderTagList('related_objects', 'object', metadata.relatedObjects, `${indent}  `),
  ];
  if (includeBody) {
    lines.push(`${indent}  <body>${escapeXml(event.body)}</body>`);
  }
  lines.push(`${indent}</research_ledger_event>`);
  return lines.join('\n');
}

function renderEventSummary(event: ResearchLedgerEvent, indent = ''): string {
  const metadata = event.metadata;
  return (
    `${indent}<event id="${escapeXml(metadata.id)}" type="${metadata.type}" ` +
    `topic="${escapeXml(metadata.topic)}" domain="${escapeXml(metadata.domain)}" ` +
    `status="${metadata.status}" />`
  );
}

function renderCompileResult(result: ResearchLedgerCompileResult): string {
  return [
    `<research_ledger_compile${result.topic === undefined ? '' : ` topic="${escapeXml(result.topic)}"`}${result.domain === undefined ? '' : ` domain="${escapeXml(result.domain)}"`}>`,
    '  <diagnostics>',
    ...result.diagnostics.map((diagnostic) => renderDiagnostic(diagnostic, '    ')),
    '  </diagnostics>',
    '  <proposals>',
    ...result.proposals.map((proposal) => renderProposal(proposal, '    ')),
    '  </proposals>',
    '</research_ledger_compile>',
    '',
  ].join('\n');
}

function renderWriteResult(result: {
  readonly event: ResearchLedgerEvent;
  readonly path: string;
  readonly created: boolean;
}): string {
  return [
    `<research_ledger_write event_id="${escapeXml(result.event.metadata.id)}" created="${String(result.created)}">`,
    `  <path>${escapeXml(result.path)}</path>`,
    renderEventSummary(result.event, '  '),
    '</research_ledger_write>',
    '',
  ].join('\n');
}

function renderProposal(proposal: CompileProposal, indent: string): string {
  return [
    `${indent}<proposal id="${escapeXml(proposal.id)}" kind="${proposal.kind}" topic="${escapeXml(proposal.topic)}" domain="${escapeXml(proposal.domain)}" confidence="${proposal.confidence}">`,
    `${indent}  <target_capsule_kind>${escapeXml(proposal.targetCapsuleKind ?? '')}</target_capsule_kind>`,
    renderTagList('event_ids', 'event', proposal.eventIds, `${indent}  `),
    renderTagList('source_refs', 'source_ref', proposal.sourceRefs, `${indent}  `),
    renderTagList('open_questions', 'question', proposal.openQuestions, `${indent}  `),
    `${indent}</proposal>`,
  ].join('\n');
}

function renderDiagnostic(diagnostic: ResearchLedgerCompileDiagnostic, indent: string): string {
  return (
    `${indent}<diagnostic severity="${diagnostic.severity}" code="${escapeXml(diagnostic.code)}"` +
    `${diagnostic.eventId === undefined ? '' : ` event_id="${escapeXml(diagnostic.eventId)}"`}` +
    `${diagnostic.proposalId === undefined ? '' : ` proposal_id="${escapeXml(diagnostic.proposalId)}"`}>` +
    `${escapeXml(diagnostic.message)}</diagnostic>`
  );
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

function escapeXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
