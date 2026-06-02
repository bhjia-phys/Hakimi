import type { PhysicsGraphCandidate } from './graph-types';
import type {
  PhysicsCapsule,
  PhysicsCapsuleKind,
  PhysicsPromotionPacket,
  ReliabilityState,
  ScopeSpec,
} from './types';

export interface PhysicsPromotionDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly candidateId?: string | undefined;
  readonly packetId?: string | undefined;
}

export interface PhysicsPromotionResult {
  readonly ok: boolean;
  readonly capsules: readonly PhysicsCapsule[];
  readonly diagnostics: readonly PhysicsPromotionDiagnostic[];
}

const RELIABILITY_ORDER: Record<ReliabilityState, number> = {
  raw: 0,
  parsed: 1,
  linked: 2,
  checked: 3,
  validated: 4,
  formalized: 5,
  rejected: -1,
};

export function promotePhysicsCandidates(
  candidates: readonly PhysicsGraphCandidate[],
  packet: PhysicsPromotionPacket,
): PhysicsPromotionResult {
  const diagnostics: PhysicsPromotionDiagnostic[] = [];
  const selected = candidates.filter((candidate) => packet.candidateIds.includes(candidate.id));

  if (selected.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-candidates',
      message: `Promotion packet "${packet.id}" does not reference any available candidates.`,
      packetId: packet.id,
    });
  }
  if (packet.sourceRefs.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-source-refs',
      message: 'Promotion requires explicit source refs.',
      packetId: packet.id,
    });
  }
  if (packet.scope === undefined || isEmptyScope(packet.scope)) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-scope',
      message: 'Promotion requires an explicit scope.',
      packetId: packet.id,
    });
  }
  if (
    packet.targetReliability !== 'checked' &&
    packet.validationRefs.length === 0
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-validation-refs',
      message: `Promotion to "${packet.targetReliability}" requires validation refs.`,
      packetId: packet.id,
    });
  }
  if (
    packet.targetReliability === 'formalized' &&
    (packet.requiredHumanCheckpoint !== true || packet.humanCheckpointLabel === undefined)
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-human-checkpoint',
      message: 'Formalized promotion requires an explicit human checkpoint label.',
      packetId: packet.id,
    });
  }

  for (const candidate of selected) {
    if (RELIIABILITY_TOO_HIGH(candidate.reliability, packet.targetReliability)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-trust-regression',
        message: `Candidate "${candidate.id}" already carries reliability "${candidate.reliability}" above target "${packet.targetReliability}".`,
        candidateId: candidate.id,
        packetId: packet.id,
      });
    }
    if (candidate.sourceRefs.length === 0) {
      diagnostics.push({
        severity: 'error',
        code: 'candidate-missing-provenance',
        message: `Candidate "${candidate.id}" has no source refs and cannot be promoted.`,
        candidateId: candidate.id,
        packetId: packet.id,
      });
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, capsules: [], diagnostics };
  }

  const capsules = selected.map((candidate) =>
    promotedCapsuleFromCandidate(candidate, packet),
  );
  diagnostics.push({
    severity: 'info',
    code: 'promotion-ready',
    message: `Promotion packet "${packet.id}" produced ${String(capsules.length)} capsule(s).`,
    packetId: packet.id,
  });
  return {
    ok: true,
    capsules,
    diagnostics,
  };
}

function promotedCapsuleFromCandidate(
  candidate: PhysicsGraphCandidate,
  packet: PhysicsPromotionPacket,
): PhysicsCapsule {
  const capsuleId = candidate.id.replace(/^graph\.candidate\./, 'capsule.promoted.');
  return {
    path: `memory://${capsuleId}`,
    source: 'project',
    body: candidate.body,
    metadata: {
      id: capsuleId,
      kind: capsuleKindFromGraphKind(candidate.kind),
      domain: candidate.domain,
      title: candidate.title,
      reliability: packet.targetReliability,
      symbols: [],
      assumes: candidate.assumptions,
      dependsOn: candidate.dependsOn,
      sourceRefs: uniqueStrings([...candidate.sourceRefs, ...packet.sourceRefs]),
      graphRefs: candidate.relatedObjects.map((id) => ({
        kind: 'Concept' as const,
        id,
      })),
      expansionHandles: candidate.sourceEventIds.map((id) => ({
        kind: 'source' as const,
        ref: id,
      })),
      requiredChecks: [],
      actionAffordances: [],
      scope: packet.scope,
      allowCrossDomain: false,
      validationRefs: packet.validationRefs,
      failureModes: packet.failureModes,
      promotionPacketId: packet.id,
      ...(packet.humanCheckpointLabel === undefined
        ? {}
        : { humanCheckpointLabel: packet.humanCheckpointLabel }),
    },
  };
}

function capsuleKindFromGraphKind(kind: PhysicsGraphCandidate['kind']): PhysicsCapsuleKind {
  switch (kind) {
    case 'definition':
    case 'notation':
    case 'convention':
      return 'Definition';
    case 'assumption':
      return 'Assumption';
    case 'formula':
      return 'Formula';
    case 'derivation_step':
      return 'DerivationStep';
    case 'code_mapping':
      return 'CodeMapping';
    case 'benchmark_case':
      return 'BenchmarkCase';
    case 'failure_mode':
      return 'FailureMode';
    case 'workflow_recipe':
      return 'WorkflowRecipe';
    case 'bridge':
      return 'Lemma';
  }
}

function isEmptyScope(scope: ScopeSpec): boolean {
  return (scope.regimes?.length ?? 0) === 0 &&
    (scope.assumptions?.length ?? 0) === 0 &&
    (scope.excludes?.length ?? 0) === 0;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function RELIIABILITY_TOO_HIGH(
  current: ReliabilityState,
  target: PhysicsPromotionPacket['targetReliability'],
): boolean {
  return RELIABILITY_ORDER[current] > RELIABILITY_ORDER[target];
}
