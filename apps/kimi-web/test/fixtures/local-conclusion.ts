import type { ResearchLocalConclusion } from '../../src/api/types';

// Reduced from the unscoped Heisenberg primitive-audit failure: a counterexample,
// not a proof of the project's full conjecture and not an AITP commit receipt.
export const localConclusion: ResearchLocalConclusion = {
  action: {
    actionId: 'primitive-audit', kind: 'experiment', status: 'completed',
    purpose: 'Check one-site spin algebra before a larger calculation',
    expectedEvidence: ['Exact primitive counterexample or successful identity checks'],
    stopCondition: 'Stop at a reproducible primitive mismatch',
    allowedToolKinds: ['Bash'], requiresHumanApproval: false,
    createdAt: 1, completedAt: 3,
  },
  progress: {
    headline: 'Spin primitive counterexample retained',
    motivation: 'The larger calculation depends on this primitive',
    workPerformed: 'Checked the two spin basis states exactly',
    result: 'The x-spin implementation does not satisfy its squared-operator identity',
    mainlineImpact: 'Affected calculations need revalidation',
    uncertainties: ['The full conjecture remains unresolved'],
    nextAction: 'Validate a narrowly scoped correction',
    detail: { limitations: ['This is not a full-project proof'] },
    recordedAt: 3,
  },
  candidate: {
    sourceActionId: 'primitive-audit', progressRecordedAt: 3,
    entryKind: 'failure', authority: 'agent', provenance: 'agent_verification',
    rationale: 'Exact counterexample to a required primitive',
  },
};
