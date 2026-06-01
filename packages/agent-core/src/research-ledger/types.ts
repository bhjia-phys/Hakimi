import type { PhysicsCapsuleId, PhysicsCapsuleKind, PhysicsDomainId } from '../physics-memory';

export const RESEARCH_LEDGER_EVENT_TYPES = [
  'source_excerpt',
  'derivation_scratch',
  'equation_candidate',
  'assumption_candidate',
  'code_observation',
  'git_diff_observation',
  'benchmark_observation',
  'failure_observation',
  'decision_note',
  'tool_run',
] as const;

export type ResearchLedgerEventType = (typeof RESEARCH_LEDGER_EVENT_TYPES)[number];

export const RESEARCH_LEDGER_EVENT_STATUSES = [
  'captured',
  'parsed',
  'linked',
  'compiled',
  'promoted',
  'rejected',
] as const;

export type ResearchLedgerEventStatus = (typeof RESEARCH_LEDGER_EVENT_STATUSES)[number];

export type ResearchLedgerEventId = string;
export type ResearchTopicId = string;

export interface ResearchLedgerRoot {
  readonly path: string;
  readonly source: 'project' | 'user' | 'extra';
}

export interface ResearchLedgerEventMetadata {
  readonly id: ResearchLedgerEventId;
  readonly type: ResearchLedgerEventType;
  readonly topic: ResearchTopicId;
  readonly domain: PhysicsDomainId;
  readonly status: ResearchLedgerEventStatus;
  readonly sourceRefs: readonly string[];
  readonly dependsOn: readonly ResearchLedgerEventId[];
  readonly candidateCapsuleKind?: PhysicsCapsuleKind;
  readonly openQuestions: readonly string[];
  readonly relatedObjects: readonly string[];
  readonly createdAt?: string;
}

export interface ResearchLedgerEvent {
  readonly metadata: ResearchLedgerEventMetadata;
  readonly path: string;
  readonly body: string;
  readonly root: ResearchLedgerRoot;
}

export interface PrecompilePacket {
  readonly id: string;
  readonly topic: ResearchTopicId;
  readonly domain: PhysicsDomainId;
  readonly eventIds: readonly ResearchLedgerEventId[];
  readonly sourceRefs: readonly string[];
  readonly openQuestions: readonly string[];
}

export type CompileProposalKind =
  | 'capsule'
  | 'graph_edge'
  | 'obligation'
  | 'failure_mode'
  | 'harness_candidate';

export interface CompileProposal {
  readonly id: string;
  readonly kind: CompileProposalKind;
  readonly topic: ResearchTopicId;
  readonly domain: PhysicsDomainId;
  readonly eventIds: readonly ResearchLedgerEventId[];
  readonly targetCapsuleKind?: PhysicsCapsuleKind;
  readonly targetCapsuleId?: PhysicsCapsuleId;
  readonly sourceRefs: readonly string[];
  readonly openQuestions: readonly string[];
  readonly confidence: 'low' | 'medium' | 'high';
}

export interface PromotionPacket {
  readonly id: string;
  readonly proposalIds: readonly string[];
  readonly targetCapsuleIds: readonly PhysicsCapsuleId[];
  readonly evidenceRefs: readonly string[];
  readonly requiredHumanCheckpoint: boolean;
}

export interface ResearchLedgerCompileDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly eventId?: ResearchLedgerEventId;
  readonly proposalId?: string;
}

export interface ResearchLedgerCompileResult {
  readonly topic?: ResearchTopicId;
  readonly domain?: PhysicsDomainId;
  readonly proposals: readonly CompileProposal[];
  readonly diagnostics: readonly ResearchLedgerCompileDiagnostic[];
}

export function isResearchLedgerEventType(value: string): value is ResearchLedgerEventType {
  return (RESEARCH_LEDGER_EVENT_TYPES as readonly string[]).includes(value);
}

export function isResearchLedgerEventStatus(
  value: string,
): value is ResearchLedgerEventStatus {
  return (RESEARCH_LEDGER_EVENT_STATUSES as readonly string[]).includes(value);
}
