import type { ResearchActionRecord, ResearchEvalValidation } from './types';

export interface HarnessCandidate {
  readonly id: string;
  readonly title: string;
  readonly sourceActionId: string;
  readonly sourceCallId: string;
  readonly outcome: 'fail' | 'inconclusive';
  readonly evidenceRefs: readonly string[];
  readonly capsuleRefs: readonly string[];
  readonly graphRefIds: readonly string[];
  readonly suggestedValidations: readonly ResearchEvalValidation[];
}

export function harnessCandidateFromActionRecord(
  record: ResearchActionRecord,
): HarnessCandidate | undefined {
  if (record.outcome !== 'fail' && record.outcome !== 'inconclusive') return undefined;
  return {
    id: `harness.candidate.${record.actionId}.${record.callId}`,
    title: `Harness candidate from ${record.actionId}`,
    sourceActionId: record.actionId,
    sourceCallId: record.callId,
    outcome: record.outcome,
    evidenceRefs: record.evidenceRefs,
    capsuleRefs: record.capsuleRefs,
    graphRefIds: record.graphRefs.map((ref) => ref.id),
    suggestedValidations: [
      {
        type: 'action_outcome',
        actionId: record.actionId,
        outcome: record.outcome,
      },
      ...record.evidenceRefs.map(
        (ref): ResearchEvalValidation => ({
          type: 'evidence_ref',
          pattern: ref,
        }),
      ),
    ],
  };
}
