import type { PhysicsDomainId } from '../physics-memory';

export type WorkFrameTrustState =
  | 'exploratory'
  | 'deriving'
  | 'checking'
  | 'validated'
  | 'blocked';

export interface WorkFrame {
  readonly id: string;
  readonly domain: PhysicsDomainId;
  readonly topic: string;
  readonly goal: string;
  readonly activeObjectIds: readonly string[];
  readonly assumptionIds: readonly string[];
  readonly conventionIds: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly openObligationIds: readonly string[];
  readonly contextPackId?: string;
  readonly trustState: WorkFrameTrustState;
}

export function createWorkFrame(input: {
  readonly id: string;
  readonly domain: PhysicsDomainId;
  readonly topic: string;
  readonly goal: string;
  readonly contextPackId?: string;
  readonly activeObjectIds?: readonly string[];
  readonly assumptionIds?: readonly string[];
  readonly conventionIds?: readonly string[];
  readonly sourceRefs?: readonly string[];
  readonly openObligationIds?: readonly string[];
  readonly trustState?: WorkFrameTrustState;
}): WorkFrame {
  return {
    id: input.id,
    domain: input.domain,
    topic: input.topic,
    goal: input.goal,
    activeObjectIds: input.activeObjectIds ?? [],
    assumptionIds: input.assumptionIds ?? [],
    conventionIds: input.conventionIds ?? [],
    sourceRefs: input.sourceRefs ?? [],
    openObligationIds: input.openObligationIds ?? [],
    contextPackId: input.contextPackId,
    trustState: input.trustState ?? 'exploratory',
  };
}

export function addOpenObligation(frame: WorkFrame, obligationId: string): WorkFrame {
  if (frame.openObligationIds.includes(obligationId)) return frame;
  return {
    ...frame,
    openObligationIds: [...frame.openObligationIds, obligationId],
    trustState: frame.trustState === 'validated' ? 'checking' : frame.trustState,
  };
}

export function closeOpenObligation(frame: WorkFrame, obligationId: string): WorkFrame {
  return {
    ...frame,
    openObligationIds: frame.openObligationIds.filter((id) => id !== obligationId),
  };
}
