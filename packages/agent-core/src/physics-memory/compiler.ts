import { PhysicsMemoryRegistry } from './registry';
import type {
  BridgePolicy,
  PhysicsCapsule,
  PhysicsCapsuleId,
  PhysicsContextPack,
  PhysicsDomainId,
  PhysicsMemoryDiagnostic,
  ReliabilityState,
} from './types';

export interface CompilePhysicsContextOptions {
  readonly domain: PhysicsDomainId;
  readonly focus?: readonly PhysicsCapsuleId[];
  readonly reliabilityFloor?: ReliabilityState;
  readonly bridgePolicy?: BridgePolicy;
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

  for (const capsule of seedCapsules) {
    includeCapsule(registry, selected, diagnostics, capsule, options.domain, bridgePolicy, reliabilityFloor);
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
      includeCapsule(registry, selected, diagnostics, dependency, options.domain, bridgePolicy, reliabilityFloor);
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

function includeCapsule(
  _registry: PhysicsMemoryRegistry,
  selected: Map<PhysicsCapsuleId, PhysicsCapsule>,
  diagnostics: PhysicsMemoryDiagnostic[],
  capsule: PhysicsCapsule,
  domain: PhysicsDomainId,
  bridgePolicy: BridgePolicy,
  reliabilityFloor: ReliabilityState,
): void {
  if (!passesReliability(capsule.metadata.reliability, reliabilityFloor)) return;
  if (capsule.metadata.domain !== domain) {
    const allowed = bridgePolicy === 'allow' || capsule.metadata.allowCrossDomain;
    if (!allowed) {
      diagnostics.push({
        severity: 'warning',
        code: 'cross-domain-dependency',
        message: `Capsule "${capsule.metadata.id}" belongs to domain "${capsule.metadata.domain}" and was not included in domain "${domain}".`,
        capsuleId: capsule.metadata.id,
      });
      return;
    }
  }
  selected.set(capsule.metadata.id, capsule);
}

function passesReliability(value: ReliabilityState, floor: ReliabilityState): boolean {
  return RELIABILITY_ORDER[value] >= RELIABILITY_ORDER[floor];
}
