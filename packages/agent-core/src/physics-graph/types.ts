import type {
  PhysicsCapsuleId,
  PhysicsDomainId,
  PhysicsGraphObjectKind,
  PhysicsRelationType,
  ReliabilityState,
} from '../physics-memory';

export type PhysicsGraphNodeId = string;
export type PhysicsGraphDirection = 'out' | 'in' | 'both';

export interface PhysicsGraphNode {
  readonly id: PhysicsGraphNodeId;
  readonly kind: PhysicsGraphObjectKind;
  readonly domain?: PhysicsDomainId | undefined;
  readonly title: string;
  readonly reliability?: ReliabilityState | undefined;
  readonly sourceCapsuleId?: PhysicsCapsuleId | undefined;
  readonly sourceRefs: readonly string[];
}

export interface PhysicsGraphEdge {
  readonly sourceId: PhysicsGraphNodeId;
  readonly targetId: PhysicsGraphNodeId;
  readonly relation: PhysicsRelationType;
  readonly sourceCapsuleId?: PhysicsCapsuleId | undefined;
}

export interface PhysicsGraphDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly nodeId?: PhysicsGraphNodeId | undefined;
  readonly edge?: PhysicsGraphEdge | undefined;
}

export interface PhysicsGraph {
  readonly nodes: readonly PhysicsGraphNode[];
  readonly edges: readonly PhysicsGraphEdge[];
  readonly diagnostics: readonly PhysicsGraphDiagnostic[];
}

export interface PhysicsGraphQueryOptions {
  readonly startIds: readonly PhysicsGraphNodeId[];
  readonly maxDepth?: number | undefined;
  readonly relationTypes?: readonly PhysicsRelationType[] | undefined;
  readonly direction?: PhysicsGraphDirection | undefined;
  readonly bridgePolicy?: 'deny' | 'explicit-only' | 'allow' | undefined;
}

export interface PhysicsGraphQueryResult {
  readonly nodeIds: readonly PhysicsGraphNodeId[];
  readonly edges: readonly PhysicsGraphEdge[];
  readonly diagnostics: readonly PhysicsGraphDiagnostic[];
}

export interface PhysicsGraphPathQuery {
  readonly fromId: PhysicsGraphNodeId;
  readonly toId: PhysicsGraphNodeId;
  readonly maxDepth?: number | undefined;
  readonly relationTypes?: readonly PhysicsRelationType[] | undefined;
  readonly direction?: PhysicsGraphDirection | undefined;
  readonly bridgePolicy?: 'deny' | 'explicit-only' | 'allow' | undefined;
}

export interface PhysicsGraphPathResult {
  readonly found: boolean;
  readonly nodeIds: readonly PhysicsGraphNodeId[];
  readonly edges: readonly PhysicsGraphEdge[];
  readonly diagnostics: readonly PhysicsGraphDiagnostic[];
}
