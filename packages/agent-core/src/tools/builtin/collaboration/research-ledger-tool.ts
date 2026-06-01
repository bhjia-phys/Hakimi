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
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './research-ledger-tool.md';

const ACTIONS = ['list_topics', 'list_events', 'load_event', 'compile_proposals'] as const;

export const ResearchLedgerToolInputSchema = z.object({
  action: z.enum(ACTIONS).describe('The research-ledger operation to perform.'),
  topic: z.string().optional().describe('Topic id for scoped listing or proposal compilation.'),
  domain: z.string().optional().describe('Domain id for scoped listing or proposal compilation.'),
  type: z.enum(RESEARCH_LEDGER_EVENT_TYPES).optional().describe('Optional event type filter.'),
  status: z.enum(RESEARCH_LEDGER_EVENT_STATUSES).optional().describe('Optional event status filter.'),
  id: z.string().optional().describe('Event id for load_event.'),
  include_body: z.boolean().optional().describe('Whether load_event should include event body.'),
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
      accesses: ToolAccesses.none(),
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
