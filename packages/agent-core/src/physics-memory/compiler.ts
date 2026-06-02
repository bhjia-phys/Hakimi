import { PhysicsMemoryRegistry } from './registry';
import type {
  BridgePolicy,
  PhysicsCapsule,
  PhysicsCapsuleId,
  PhysicsContextPack,
  PhysicsDomainId,
  PhysicsMemoryDiagnostic,
  PhysicsCapsuleKind,
  ReliabilityState,
} from './types';
import type { ResearchLedgerRegistry } from '../research-ledger';
import {
  bridgeAllowsCapsule,
  collectBridgePermissions,
  type BridgePermission,
} from './bridge';
import { checkGraphCandidateContradictions } from './contradiction-checker';
import { checkGraphCandidateDependencies } from './dependency-checker';
import type {
  PhysicsGraphCandidate,
  PhysicsGraphCandidateKind,
  PhysicsGraphCompileResult,
} from './graph-types';
import { checkGraphCandidateProvenance } from './provenance-checker';

export interface CompilePhysicsContextOptions {
  readonly domain: PhysicsDomainId;
  readonly focus?: readonly PhysicsCapsuleId[];
  readonly reliabilityFloor?: ReliabilityState;
  readonly bridgePolicy?: BridgePolicy;
}

export interface CompilePhysicsGraphCandidatesOptions {
  readonly ledger: ResearchLedgerRegistry;
  readonly topic?: string | undefined;
  readonly domain?: PhysicsDomainId | undefined;
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

export function compilePhysicsContext(
  registry: PhysicsMemoryRegistry,
  options: CompilePhysicsContextOptions,
): PhysicsContextPack {
  const bridgePolicy = options.bridgePolicy ?? 'explicit-only';
  const reliabilityFloor = options.reliabilityFloor ?? 'raw';
  const diagnostics: PhysicsMemoryDiagnostic[] = [...registry.getDiagnostics()];
  const selected = new Map<PhysicsCapsuleId, PhysicsCapsule>();
  const focus = options.focus ?? [];

  const seedCapsules =
    focus.length > 0
      ? focus.map((id) => {
          const capsule = registry.getCapsule(id);
          if (capsule === undefined) {
            diagnostics.push({
              severity: 'error',
              code: 'missing-focus-capsule',
              message: `Focused capsule "${id}" is not registered.`,
              capsuleId: id,
            });
          }
          return capsule;
        }).filter((capsule): capsule is PhysicsCapsule => capsule !== undefined)
      : registry.listCapsules({ domain: options.domain });
  const bridgePermissions = collectBridgePermissions({
    registry,
    bridgeCapsuleIds:
      focus.length > 0 ? focus : seedCapsules.map((capsule) => capsule.metadata.id),
    domain: options.domain,
    diagnostics,
  });

  for (const capsule of seedCapsules) {
    includeCapsule(
      selected,
      diagnostics,
      capsule,
      options.domain,
      bridgePolicy,
      reliabilityFloor,
      bridgePermissions,
    );
    for (const dependencyId of capsule.metadata.dependsOn) {
      const dependency = registry.getCapsule(dependencyId);
      if (dependency === undefined) {
        diagnostics.push({
          severity: 'error',
          code: 'missing-dependency',
          message: `Capsule "${capsule.metadata.id}" depends on missing capsule "${dependencyId}".`,
          capsuleId: capsule.metadata.id,
        });
        continue;
      }
      includeCapsule(
        selected,
        diagnostics,
        dependency,
        options.domain,
        bridgePolicy,
        reliabilityFloor,
        bridgePermissions,
      );
    }
  }

  for (const capsule of selected.values()) {
    if (capsule.metadata.kind !== 'Formula') continue;
    const hasBenchmark = registry
      .listCapsules({ domain: capsule.metadata.domain, kind: 'BenchmarkCase' })
      .some((benchmark) => benchmark.metadata.dependsOn.includes(capsule.metadata.id));
    if (!hasBenchmark) {
      diagnostics.push({
        severity: 'warning',
        code: 'missing-benchmark',
        message: `Formula capsule "${capsule.metadata.id}" has no BenchmarkCase depending on it.`,
        capsuleId: capsule.metadata.id,
      });
    }
  }

  return {
    domain: options.domain,
    focus,
    capsules: [...selected.values()].toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id)),
    diagnostics,
  };
}

export function compilePhysicsGraphCandidates(
  registry: PhysicsMemoryRegistry,
  options: CompilePhysicsGraphCandidatesOptions,
): PhysicsGraphCompileResult {
  const diagnostics: Array<PhysicsGraphCompileResult['diagnostics'][number]> = [];
  const candidates: PhysicsGraphCandidate[] = [];

  const events = options.ledger.listEvents({
    ...(options.topic === undefined ? {} : { topic: options.topic }),
    ...(options.domain === undefined ? {} : { domain: options.domain }),
  });

  for (const event of events) {
    const candidateKind = candidateKindFromCapsuleKind(event.metadata.candidateCapsuleKind);
    if (candidateKind === undefined) {
      diagnostics.push({
        severity: 'info',
        code: 'skip-non-graph-event',
        message: `Ledger event "${event.metadata.id}" does not map to a graph candidate kind.`,
        eventId: event.metadata.id,
      });
      continue;
    }

    const candidate = candidateFromEvent(event.metadata.id, candidateKind, event.body, {
      title: extractTitle(event.body, event.metadata.id),
      domain: event.metadata.domain,
      reliability: reliabilityFromLedgerStatus(event.metadata.status),
      sourceRefs: event.metadata.sourceRefs,
      relatedObjects: event.metadata.relatedObjects,
      dependsOn: event.metadata.dependsOn,
      assumptions: event.metadata.relatedObjects
        .filter((objectId) => objectId.startsWith('assumption:'))
        .map((objectId) => objectId),
    });
    candidates.push(candidate);
    diagnostics.push(...checkGraphCandidateProvenance(candidate).map((item) => ({ ...item, eventId: event.metadata.id })));
  }

  diagnostics.push(...checkGraphCandidateDependencies(registry, candidates));
  diagnostics.push(...checkGraphCandidateContradictions(candidates));

  return {
    topic: options.topic,
    domain: options.domain,
    candidates: candidates.toSorted((a, b) => a.id.localeCompare(b.id)),
    diagnostics,
  };
}

function includeCapsule(
  selected: Map<PhysicsCapsuleId, PhysicsCapsule>,
  diagnostics: PhysicsMemoryDiagnostic[],
  capsule: PhysicsCapsule,
  domain: PhysicsDomainId,
  bridgePolicy: BridgePolicy,
  reliabilityFloor: ReliabilityState,
  bridgePermissions: readonly BridgePermission[],
): void {
  if (!passesReliability(capsule.metadata.reliability, reliabilityFloor)) return;
  if (capsule.metadata.domain !== domain) {
    if (bridgePolicy === 'deny') {
      diagnostics.push({
        severity: 'warning',
        code: 'cross-domain-denied',
        message:
          `Capsule "${capsule.metadata.id}" belongs to domain "${capsule.metadata.domain}" ` +
          `and bridge policy "deny" prevents inclusion in domain "${domain}".`,
        capsuleId: capsule.metadata.id,
      });
      return;
    }
    const bridgePermission = bridgeAllowsCapsule({
      permissions: bridgePermissions,
      fromDomain: domain,
      capsule,
    });
    const allowed =
      bridgePolicy === 'allow' ||
      capsule.metadata.allowCrossDomain ||
      bridgePermission !== undefined;
    if (!allowed) {
      diagnostics.push({
        severity: 'warning',
        code: 'cross-domain-dependency',
        message: `Capsule "${capsule.metadata.id}" belongs to domain "${capsule.metadata.domain}" and was not included in domain "${domain}".`,
        capsuleId: capsule.metadata.id,
      });
      return;
    }
    if (bridgePermission !== undefined) {
      diagnostics.push({
        severity: 'info',
        code: 'bridge-cross-domain-inclusion',
        message:
          `Bridge capsule "${bridgePermission.bridgeCapsuleId}" allows ` +
          `"${capsule.metadata.id}" into domain "${domain}".`,
        capsuleId: capsule.metadata.id,
      });
    }
  }
  selected.set(capsule.metadata.id, capsule);
}

function passesReliability(value: ReliabilityState, floor: ReliabilityState): boolean {
  return RELIABILITY_ORDER[value] >= RELIABILITY_ORDER[floor];
}

function candidateKindFromCapsuleKind(
  kind: PhysicsCapsuleKind | undefined,
): PhysicsGraphCandidateKind | undefined {
  switch (kind) {
    case 'Definition':
      return 'definition';
    case 'Assumption':
      return 'assumption';
    case 'Formula':
      return 'formula';
    case 'DerivationStep':
      return 'derivation_step';
    case 'CodeMapping':
      return 'code_mapping';
    case 'BenchmarkCase':
      return 'benchmark_case';
    case 'FailureMode':
      return 'failure_mode';
    case 'WorkflowRecipe':
      return 'workflow_recipe';
    case 'Bridge':
      return 'bridge';
    default:
      return undefined;
  }
}

function candidateFromEvent(
  eventId: string,
  kind: PhysicsGraphCandidateKind,
  body: string,
  input: {
    readonly title: string;
    readonly domain: PhysicsDomainId;
    readonly reliability: ReliabilityState;
    readonly sourceRefs: readonly string[];
    readonly relatedObjects: readonly string[];
    readonly dependsOn: readonly string[];
    readonly assumptions: readonly string[];
  },
): PhysicsGraphCandidate {
  return {
    id: `graph.candidate.${eventId}`,
    kind,
    domain: input.domain,
    title: input.title,
    body,
    reliability: input.reliability,
    sourceEventIds: [eventId],
    sourceRefs: input.sourceRefs,
    relatedObjects: input.relatedObjects,
    dependsOn: input.dependsOn,
    assumptions: input.assumptions,
    promotionState: 'candidate',
  };
}

function reliabilityFromLedgerStatus(status: string): ReliabilityState {
  switch (status) {
    case 'captured':
      return 'raw';
    case 'parsed':
      return 'parsed';
    case 'linked':
      return 'linked';
    case 'compiled':
      return 'checked';
    case 'promoted':
      return 'validated';
    case 'rejected':
      return 'rejected';
    default:
      return 'raw';
  }
}

function extractTitle(body: string, fallback: string): string {
  const firstLine = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine === undefined) return fallback;
  return firstLine.replace(/^#+\s*/, '') || fallback;
}
