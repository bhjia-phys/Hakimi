import type { PhysicsMemoryRegistry } from './registry';
import type {
  PhysicsCapsule,
  PhysicsCapsuleId,
  PhysicsDomainId,
  PhysicsMemoryDiagnostic,
} from './types';

export interface BridgePermission {
  readonly bridgeCapsuleId: PhysicsCapsuleId;
  readonly fromDomain: PhysicsDomainId;
  readonly toDomain: PhysicsDomainId;
  readonly capsuleRefs: readonly PhysicsCapsuleId[];
  readonly reason?: string | undefined;
}

export function collectBridgePermissions(input: {
  readonly registry: PhysicsMemoryRegistry;
  readonly bridgeCapsuleIds: readonly PhysicsCapsuleId[];
  readonly domain: PhysicsDomainId;
  readonly diagnostics: PhysicsMemoryDiagnostic[];
}): readonly BridgePermission[] {
  const permissions: BridgePermission[] = [];
  for (const bridgeCapsuleId of unique(input.bridgeCapsuleIds)) {
    const capsule = input.registry.getCapsule(bridgeCapsuleId);
    if (capsule === undefined) {
      input.diagnostics.push({
        severity: 'error',
        code: 'missing-bridge-capsule',
        message: `Bridge capsule "${bridgeCapsuleId}" is not registered.`,
        capsuleId: bridgeCapsuleId,
      });
      continue;
    }
    if (capsule.metadata.kind !== 'Bridge') continue;
    const bridge = capsule.metadata.bridge;
    if (bridge === undefined) {
      input.diagnostics.push({
        severity: 'warning',
        code: 'bridge-metadata-missing',
        message: `Bridge capsule "${bridgeCapsuleId}" is missing bridge metadata.`,
        capsuleId: bridgeCapsuleId,
      });
      continue;
    }
    if (bridge.fromDomain !== input.domain) {
      input.diagnostics.push({
        severity: 'warning',
        code: 'bridge-inactive-for-domain',
        message:
          `Bridge capsule "${bridgeCapsuleId}" starts from "${bridge.fromDomain}", ` +
          `not "${input.domain}".`,
        capsuleId: bridgeCapsuleId,
      });
      continue;
    }
    permissions.push({
      bridgeCapsuleId,
      fromDomain: bridge.fromDomain,
      toDomain: bridge.toDomain,
      capsuleRefs: bridge.capsuleRefs,
      reason: bridge.reason,
    });
  }
  return permissions;
}

export function bridgeAllowsCapsule(input: {
  readonly permissions: readonly BridgePermission[];
  readonly fromDomain: PhysicsDomainId;
  readonly capsule: PhysicsCapsule;
}): BridgePermission | undefined {
  return input.permissions.find((permission) => {
    if (permission.fromDomain !== input.fromDomain) return false;
    if (permission.toDomain !== input.capsule.metadata.domain) return false;
    return (
      permission.capsuleRefs.length === 0 ||
      permission.capsuleRefs.includes(input.capsule.metadata.id)
    );
  });
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
