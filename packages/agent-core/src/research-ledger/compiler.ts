import type { PhysicsCapsuleKind, PhysicsDomainId } from '../physics-memory';
import type { ResearchLedgerRegistry } from './registry';
import type {
  CompileProposal,
  ResearchLedgerCompileDiagnostic,
  ResearchLedgerCompileResult,
  ResearchLedgerEvent,
  ResearchLedgerEventStatus,
  ResearchLedgerEventType,
  ResearchTopicId,
} from './types';

const COMPILED_STATUSES: readonly ResearchLedgerEventStatus[] = [
  'linked',
  'compiled',
  'promoted',
];

export interface CompileResearchLedgerOptions {
  readonly topic?: ResearchTopicId;
  readonly domain?: PhysicsDomainId;
  readonly type?: ResearchLedgerEventType;
  readonly includeStatuses?: readonly ResearchLedgerEventStatus[];
}

export function compileResearchLedgerProposals(
  registry: ResearchLedgerRegistry,
  options: CompileResearchLedgerOptions = {},
): ResearchLedgerCompileResult {
  const statuses = options.includeStatuses ?? COMPILED_STATUSES;
  const diagnostics: ResearchLedgerCompileDiagnostic[] = [];
  const proposals: CompileProposal[] = [];
  const events = registry
    .listEvents({
      topic: options.topic,
      domain: options.domain,
      type: options.type,
    })
    .filter((event) => statuses.includes(event.metadata.status));

  for (const event of events) {
    const proposal = proposalForEvent(event);
    if (event.metadata.sourceRefs.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'missing-source-ref',
        message: `Research ledger event "${event.metadata.id}" has no source refs.`,
        eventId: event.metadata.id,
      });
    }
    if (event.body.trim().length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'missing-body',
        message: `Research ledger event "${event.metadata.id}" has no body text.`,
        eventId: event.metadata.id,
      });
    }
    if (event.metadata.candidateCapsuleKind === undefined) {
      diagnostics.push({
        severity: 'info',
        code: 'missing-candidate-kind',
        message: `Research ledger event "${event.metadata.id}" has no candidate capsule kind.`,
        eventId: event.metadata.id,
      });
    }
    for (const question of event.metadata.openQuestions) {
      diagnostics.push({
        severity: 'warning',
        code: 'unresolved-open-question',
        message: question,
        eventId: event.metadata.id,
        proposalId: proposal.id,
      });
    }
    proposals.push(proposal);
  }

  return {
    topic: options.topic,
    domain: options.domain,
    proposals: proposals.toSorted((a, b) => a.id.localeCompare(b.id)),
    diagnostics,
  };
}

function proposalForEvent(event: ResearchLedgerEvent): CompileProposal {
  const targetCapsuleKind = event.metadata.candidateCapsuleKind;
  return {
    id: proposalId(event, targetCapsuleKind),
    kind: targetCapsuleKind === undefined ? 'obligation' : 'capsule',
    topic: event.metadata.topic,
    domain: event.metadata.domain,
    eventIds: [event.metadata.id],
    targetCapsuleKind,
    sourceRefs: event.metadata.sourceRefs,
    openQuestions: event.metadata.openQuestions,
    confidence: proposalConfidence(event),
  };
}

function proposalId(
  event: ResearchLedgerEvent,
  targetCapsuleKind: PhysicsCapsuleKind | undefined,
): string {
  const suffix = targetCapsuleKind === undefined ? 'obligation' : targetCapsuleKind.toLowerCase();
  return `proposal.${event.metadata.id}.${suffix}`;
}

function proposalConfidence(event: ResearchLedgerEvent): CompileProposal['confidence'] {
  if (event.metadata.sourceRefs.length === 0) return 'low';
  if (event.metadata.openQuestions.length > 0) return 'medium';
  return 'high';
}
