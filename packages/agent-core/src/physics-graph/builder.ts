import type {
  PhysicsCapsule,
  PhysicsGraphObjectKind,
  PhysicsRelationType,
  PhysicsMemoryRegistry,
} from '../physics-memory';
import type { PhysicsGraph, PhysicsGraphDiagnostic, PhysicsGraphEdge, PhysicsGraphNode } from './types';

export function buildPhysicsGraphFromMemory(registry: PhysicsMemoryRegistry): PhysicsGraph {
  const nodes = new Map<string, PhysicsGraphNode>();
  const edges: PhysicsGraphEdge[] = [];
  const diagnostics: PhysicsGraphDiagnostic[] = [];
  const capsules = registry.listCapsules();

  for (const capsule of capsules) {
    nodes.set(capsule.metadata.id, nodeFromCapsule(capsule));
  }

  for (const capsule of capsules) {
    for (const dependencyId of capsule.metadata.dependsOn) {
      edges.push(edge(capsule, dependencyId, 'depends_on'));
    }
    for (const assumptionId of capsule.metadata.assumes) {
      ensureExternalNode(nodes, assumptionId, 'Assumption');
      edges.push(edge(capsule, assumptionId, 'assumes'));
    }
    for (const ref of capsule.metadata.graphRefs) {
      ensureExternalNode(nodes, ref.id, ref.kind);
      if (ref.relation !== undefined) edges.push(edge(capsule, ref.id, ref.relation));
    }
    if (capsule.metadata.bridge !== undefined) {
      for (const capsuleRef of capsule.metadata.bridge.capsuleRefs) {
        edges.push(edge(capsule, capsuleRef, 'bridges_to'));
      }
    }
  }

  for (const item of edges) {
    if (nodes.has(item.targetId)) continue;
    diagnostics.push({
      severity: 'warning',
      code: 'graph-edge-target-missing',
      message: `Graph edge target "${item.targetId}" is not a known graph node.`,
      edge: item,
    });
  }

  return {
    nodes: [...nodes.values()].toSorted((a, b) => a.id.localeCompare(b.id)),
    edges: edges.toSorted((a, b) =>
      `${a.sourceId}|${a.relation}|${a.targetId}`.localeCompare(
        `${b.sourceId}|${b.relation}|${b.targetId}`,
      ),
    ),
    diagnostics,
  };
}

function nodeFromCapsule(capsule: PhysicsCapsule): PhysicsGraphNode {
  return {
    id: capsule.metadata.id,
    kind: capsule.metadata.kind,
    domain: capsule.metadata.domain,
    title: capsule.metadata.title,
    reliability: capsule.metadata.reliability,
    sourceCapsuleId: capsule.metadata.id,
    sourceRefs: capsule.metadata.sourceRefs,
  };
}

function ensureExternalNode(
  nodes: Map<string, PhysicsGraphNode>,
  id: string,
  kind: PhysicsGraphObjectKind,
): void {
  if (nodes.has(id)) return;
  nodes.set(id, {
    id,
    kind,
    title: id,
    sourceRefs: [],
  });
}

function edge(
  capsule: PhysicsCapsule,
  targetId: string,
  relation: PhysicsRelationType,
): PhysicsGraphEdge {
  return {
    sourceId: capsule.metadata.id,
    targetId,
    relation,
    sourceCapsuleId: capsule.metadata.id,
  };
}
