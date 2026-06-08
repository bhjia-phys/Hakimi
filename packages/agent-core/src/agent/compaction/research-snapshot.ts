import type { Agent } from '..';
import type { ResearchContextPack } from '../../research-context';
import type { ResearchObligation, WorkFrame } from '../../research-action';
import type {
  PrimitiveToolLifecycleEnvelope,
} from '../tool-lifecycle';

export const RESEARCH_COMPACTION_SNAPSHOT_HEADER = '## Hakimi Research State';

const MAX_FRAMES = 8;
const MAX_LIST_ITEMS = 8;
const MAX_TRACE_ITEMS = 8;
const MAX_TOOL_ITEMS = 8;
const MAX_INLINE_CHARS = 240;

export function renderResearchCompactionSnapshot(agent: Agent): string | undefined {
  const frames = prioritizeFrames(agent.workFrames.list(), agent.workFrames.active?.id);
  if (frames.length === 0) return undefined;

  const lines: string[] = [
    RESEARCH_COMPACTION_SNAPSHOT_HEADER,
    '',
    'Runtime-generated research state. Treat this block as authoritative for WorkFrame scope, physics memory, evidence, action trace, and next research obligations after compaction.',
    '',
    'Open WorkFrames:',
    ...frames.map((frame) => renderFrameLine(frame, frame.id === agent.workFrames.active?.id)),
  ];

  if (agent.workFrames.list().length > frames.length) {
    lines.push(`- ...(+${String(agent.workFrames.list().length - frames.length)} more frames)`);
  }

  for (const frame of frames) {
    lines.push('', ...renderFrameSnapshot(agent, frame, frame.id === agent.workFrames.active?.id));
  }

  return lines.join('\n').trim();
}

export function mergeResearchCompactionSnapshot(
  summary: string,
  snapshot: string | undefined,
): string {
  if (snapshot === undefined || snapshot.trim().length === 0) return summary;
  const trimmed = summary.trim();
  const existingIndex = trimmed.indexOf(RESEARCH_COMPACTION_SNAPSHOT_HEADER);
  const summaryWithoutExisting =
    existingIndex === -1 ? trimmed : trimmed.slice(0, existingIndex).trimEnd();
  if (summaryWithoutExisting.length === 0) return snapshot.trim();
  return `${summaryWithoutExisting}\n\n${snapshot.trim()}`;
}

function renderFrameSnapshot(
  agent: Agent,
  frame: WorkFrame,
  active: boolean,
): string[] {
  const pack = frame.contextPackId === undefined
    ? undefined
    : agent.researchContext.getPack(frame.contextPackId);
  const evidenceRefs = agent.researchAction.recentEvidence(12, {
    workFrameId: frame.id,
    domain: frame.domain,
    topic: frame.topic,
  });
  const obligations = agent.researchAction.listObligations({
    domain: frame.domain,
    topic: frame.topic,
    status: 'open',
  });
  const trace = agent.researchAction.listRecentTrace(MAX_TRACE_ITEMS, {
    workFrameId: frame.id,
    domain: frame.domain,
    topic: frame.topic,
  });
  const primitiveTools = agent.toolLifecycle
    .listRecent(MAX_TOOL_ITEMS * 2)
    .filter((item) => item.completed.workFrameId === frame.id)
    .slice(-MAX_TOOL_ITEMS);

  return [
    `### WorkFrame ${sanitize(frame.id)}${active ? ' (active)' : ''}`,
    `- Research question: ${sanitize(frame.goal)}`,
    `- Domain/topic: ${sanitize(frame.domain)} / ${sanitize(frame.topic)}`,
    `- Trust state: ${frame.trustState}`,
    `- Context pack: ${frame.contextPackId ?? 'none'}`,
    `- Focus objects: ${renderList(frame.activeObjectIds)}`,
    `- Assumptions: ${renderList(frame.assumptionIds)}`,
    `- Conventions: ${renderList(frame.conventionIds)}`,
    `- Source refs: ${renderList(frame.sourceRefs)}`,
    ...renderContextPackLines(pack),
    `- Recent evidence refs: ${renderList(evidenceRefs)}`,
    `- Open obligations: ${renderObligations(obligations, frame.openObligationIds)}`,
    ...renderTraceLines(trace),
    ...renderPrimitiveToolLines(primitiveTools),
  ];
}

function renderContextPackLines(pack: ResearchContextPack | undefined): string[] {
  if (pack === undefined) return ['- Physics memory: no attached ContextPack'];
  return [
    `- Domain pack: ${pack.domainPack?.id ?? 'none'}`,
    `- Domain profiles: ${renderList(pack.profiles.map((profile) => `${profile.id} [${profile.status}]`))}`,
    `- Workflow recipes: ${renderList(pack.workflows.map((workflow) => `${workflow.id} [${workflow.status}]`))}`,
    `- Physics memory: ${renderList(pack.physics.capsules.map((capsule) => `${capsule.id} (${capsule.kind}, ${capsule.reliability})`))}`,
    `- Ledger proposals: ${renderList(pack.ledger.proposals.map((proposal) => `${proposal.id} [${proposal.confidence}]`))}`,
    `- AITP curated RAG: ${pack.curatedRag === undefined ? 'none' : `${renderList(pack.curatedRag.results.map((item) => `${item.chunkId} (${item.documentId})`))}; heuristic_context only, promote before claim support`}`,
    `- Action bindings: ${renderList(pack.actionBindings.map((binding) => renderActionBinding(binding)))}`,
    `- Eval cases: ${renderList(pack.domainPack?.evalCaseIds ?? [])}`,
    `- Required tools: ${renderList(pack.domainPack?.requiredTools ?? [])}`,
    `- Context diagnostics: ${renderList(pack.diagnostics.map((diagnostic) => `${diagnostic.severity}:${diagnostic.code}`))}`,
  ];
}

function renderTraceLines(
  trace: ReturnType<Agent['researchAction']['listRecentTrace']>,
): string[] {
  if (trace.length === 0) return ['- Recent research actions: none'];
  return [
    '- Recent research actions:',
    ...trace.map((item) => {
      const parts = [
        item.kind,
        item.actionId === undefined ? undefined : `action=${item.actionId}`,
        item.callId === undefined ? undefined : `call=${item.callId}`,
        item.outcome === undefined ? undefined : `outcome=${item.outcome}`,
        item.rawToolName === undefined ? undefined : `raw_tool=${item.rawToolName}`,
        item.primitiveToolCallIds.length === 0
          ? undefined
          : `primitive_tools=${item.primitiveToolCallIds.join(',')}`,
        item.evidenceRefs.length === 0 ? undefined : `evidence=${item.evidenceRefs.join(',')}`,
        item.ledgerEventIds.length === 0 ? undefined : `ledger=${item.ledgerEventIds.join(',')}`,
        item.generatedObligationIds.length === 0
          ? undefined
          : `obligations=${item.generatedObligationIds.join(',')}`,
        item.nextSuggestedActions.length === 0
          ? undefined
          : `next=${item.nextSuggestedActions.join(',')}`,
      ].filter((part): part is string => part !== undefined);
      const summaries = [
        item.inputSummary === undefined ? undefined : `input=${sanitize(item.inputSummary)}`,
        item.outputSummary === undefined ? undefined : `output=${sanitize(item.outputSummary)}`,
        item.rawToolReason === undefined ? undefined : `reason=${sanitize(item.rawToolReason)}`,
      ].filter((part): part is string => part !== undefined);
      return `  - ${parts.join(' ')}${summaries.length === 0 ? '' : `; ${summaries.join('; ')}`}`;
    }),
  ];
}

function renderPrimitiveToolLines(
  envelopes: readonly PrimitiveToolLifecycleEnvelope[],
): string[] {
  if (envelopes.length === 0) return ['- Recent primitive tools: none'];
  return [
    '- Recent primitive tools:',
    ...envelopes.map((envelope) => {
      const started = envelope.started;
      const completed = envelope.completed;
      const detail = [
        `tool=${completed.toolName}`,
        `call=${completed.toolCallId}`,
        `status=${completed.status}`,
        started === undefined ? undefined : `args=${sanitize(started.argsSummary)}`,
        completed.artifactRefs.length === 0
          ? undefined
          : `artifacts=${completed.artifactRefs.join(',')}`,
        completed.outputSummary.length === 0
          ? undefined
          : `output=${sanitize(completed.outputSummary)}`,
      ].filter((part): part is string => part !== undefined);
      return `  - ${detail.join(' ')}`;
    }),
  ];
}

function renderFrameLine(frame: WorkFrame, active: boolean): string {
  const attrs = [
    active ? 'active' : undefined,
    `domain=${frame.domain}`,
    `topic=${frame.topic}`,
    `trust=${frame.trustState}`,
    frame.contextPackId === undefined ? undefined : `context=${frame.contextPackId}`,
  ].filter((value): value is string => value !== undefined);
  return `- ${sanitize(frame.id)} [${attrs.join(', ')}]: ${sanitize(frame.goal)}`;
}

function renderActionBinding(binding: ResearchContextPack['actionBindings'][number]): string {
  const parts = [
    binding.actionId,
    binding.priority === undefined ? undefined : `priority=${binding.priority}`,
    binding.checkId === undefined ? undefined : `check=${binding.checkId}`,
    binding.adapterId === undefined ? undefined : `adapter=${binding.adapterId}`,
  ].filter((part): part is string => part !== undefined);
  return parts.join(' ');
}

function renderObligations(
  obligations: readonly ResearchObligation[],
  frameObligationIds: readonly string[],
): string {
  const rendered = obligations.map(
    (obligation) =>
      `${obligation.id} (${obligation.kind}, ${obligation.severity}, action=${obligation.requiredActionId})`,
  );
  const missingIds = frameObligationIds.filter(
    (id) => !obligations.some((obligation) => obligation.id === id),
  );
  return renderList([...rendered, ...missingIds]);
}

function prioritizeFrames(
  frames: readonly WorkFrame[],
  activeFrameId: string | undefined,
): readonly WorkFrame[] {
  return [...frames]
    .toSorted((a, b) => {
      if (a.id === activeFrameId) return -1;
      if (b.id === activeFrameId) return 1;
      return a.id.localeCompare(b.id);
    })
    .slice(0, MAX_FRAMES);
}

function renderList(values: readonly string[], max = MAX_LIST_ITEMS): string {
  if (values.length === 0) return 'none';
  const safeValues = values.map(sanitize);
  if (safeValues.length <= max) return safeValues.join(', ');
  return `${safeValues.slice(0, max).join(', ')}, ...(+${String(safeValues.length - max)} more)`;
}

function sanitize(input: string): string {
  const normalized = input.replaceAll(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_INLINE_CHARS) return normalized;
  return `${normalized.slice(0, MAX_INLINE_CHARS - 15)}...[truncated]`;
}
