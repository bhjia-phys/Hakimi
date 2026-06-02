import type { BridgePolicy, PhysicsRelationType } from '../physics-memory';
import type {
  PhysicsGraph,
  PhysicsGraphDiagnostic,
  PhysicsGraphDirection,
  PhysicsGraphEdge,
  PhysicsGraphPathQuery,
  PhysicsGraphPathResult,
  PhysicsGraphQueryOptions,
  PhysicsGraphQueryResult,
} from './types';

export function queryPhysicsGraphNeighborhood(
  graph: PhysicsGraph,
  options: PhysicsGraphQueryOptions,
): PhysicsGraphQueryResult {
  return traverseGraph(graph, options);
}

export function queryPhysicsGraphDependencyClosure(
  graph: PhysicsGraph,
  options: Omit<PhysicsGraphQueryOptions, 'direction' | 'relationTypes'>,
): PhysicsGraphQueryResult {
  return traverseGraph(graph, {
    ...options,
    direction: 'out',
    relationTypes: ['depends_on', 'assumes', 'bridges_to'],
  });
}

export function findPhysicsGraphPath(
  graph: PhysicsGraph,
  query: PhysicsGraphPathQuery,
): PhysicsGraphPathResult {
  const maxDepth = query.maxDepth ?? 6;
  const direction = query.direction ?? 'out';
  const diagnostics = validateStartIds(graph, [query.fromId, query.toId]);
  if (diagnostics.length > 0) {
    return { found: false, nodeIds: [], edges: [], diagnostics };
  }

  const queue: Array<{
    readonly nodeId: string;
    readonly depth: number;
    readonly nodeIds: readonly string[];
    readonly edges: readonly PhysicsGraphEdge[];
  }> = [{ nodeId: query.fromId, depth: 0, nodeIds: [query.fromId], edges: [] }];
  const visited = new Set<string>([query.fromId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current.nodeId === query.toId) {
      return {
        found: true,
        nodeIds: current.nodeIds,
        edges: current.edges,
        diagnostics,
      };
    }
    if (current.depth >= maxDepth) continue;
    for (const candidate of incidentEdges(graph, current.nodeId, direction)) {
      if (!edgeMatches(graph, candidate.edge, query.relationTypes, query.bridgePolicy)) continue;
      const nextNodeId = candidate.nextNodeId;
      if (visited.has(nextNodeId)) continue;
      visited.add(nextNodeId);
      queue.push({
        nodeId: nextNodeId,
        depth: current.depth + 1,
        nodeIds: [...current.nodeIds, nextNodeId],
        edges: [...current.edges, candidate.edge],
      });
    }
  }

  return {
    found: false,
    nodeIds: [],
    edges: [],
    diagnostics,
  };
}

export function queryPhysicsGraphContradictions(
  graph: PhysicsGraph,
  input: { readonly domain?: string | undefined } = {},
): readonly PhysicsGraphEdge[] {
  return graph.edges.filter((edge) => {
    if (edge.relation !== 'contradicts') return false;
    if (input.domain === undefined) return true;
    const source = nodeById(graph).get(edge.sourceId);
    const target = nodeById(graph).get(edge.targetId);
    return source?.domain === input.domain || target?.domain === input.domain;
  });
}

function traverseGraph(
  graph: PhysicsGraph,
  options: PhysicsGraphQueryOptions,
): PhysicsGraphQueryResult {
  const maxDepth = options.maxDepth ?? 1;
  const direction = options.direction ?? 'out';
  const diagnostics = validateStartIds(graph, options.startIds);
  const visited = new Set(options.startIds.filter((id) => nodeById(graph).has(id)));
  const edges = new Map<string, PhysicsGraphEdge>();
  let frontier = [...visited];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      for (const candidate of incidentEdges(graph, nodeId, direction)) {
        if (!edgeMatches(graph, candidate.edge, options.relationTypes, options.bridgePolicy)) {
          continue;
        }
        edges.set(edgeKey(candidate.edge), candidate.edge);
        if (!visited.has(candidate.nextNodeId)) {
          visited.add(candidate.nextNodeId);
          nextFrontier.push(candidate.nextNodeId);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return {
    nodeIds: [...visited].toSorted(),
    edges: [...edges.values()].toSorted((a, b) => edgeKey(a).localeCompare(edgeKey(b))),
    diagnostics,
  };
}

function incidentEdges(
  graph: PhysicsGraph,
  nodeId: string,
  direction: PhysicsGraphDirection,
): ReadonlyArray<{ readonly edge: PhysicsGraphEdge; readonly nextNodeId: string }> {
  const out: Array<{ readonly edge: PhysicsGraphEdge; readonly nextNodeId: string }> = [];
  if (direction === 'out' || direction === 'both') {
    for (const edge of graph.edges) {
      if (edge.sourceId === nodeId) out.push({ edge, nextNodeId: edge.targetId });
    }
  }
  if (direction === 'in' || direction === 'both') {
    for (const edge of graph.edges) {
      if (edge.targetId === nodeId) out.push({ edge, nextNodeId: edge.sourceId });
    }
  }
  return out;
}

function edgeMatches(
  graph: PhysicsGraph,
  edge: PhysicsGraphEdge,
  relationTypes: readonly PhysicsRelationType[] | undefined,
  bridgePolicy: BridgePolicy | undefined,
): boolean {
  if (relationTypes !== undefined && !relationTypes.includes(edge.relation)) return false;
  switch (bridgePolicy ?? 'explicit-only') {
    case 'allow':
      return true;
    case 'deny':
      return edge.relation !== 'bridges_to' && isSameDomainEdge(graph, edge);
    case 'explicit-only':
      return isSameDomainEdge(graph, edge) || edge.relation === 'bridges_to';
  }
}

function isSameDomainEdge(graph: PhysicsGraph, edge: PhysicsGraphEdge): boolean {
  const nodes = nodeById(graph);
  const source = nodes.get(edge.sourceId);
  const target = nodes.get(edge.targetId);
  if (source?.domain === undefined || target?.domain === undefined) return true;
  return source.domain === target.domain;
}

function validateStartIds(
  graph: PhysicsGraph,
  startIds: readonly string[],
): readonly PhysicsGraphDiagnostic[] {
  const nodes = nodeById(graph);
  return startIds
    .filter((id) => !nodes.has(id))
    .map((id) => ({
      severity: 'error',
      code: 'graph-start-node-missing',
      message: `Graph start node "${id}" is not present.`,
      nodeId: id,
    }));
}

function nodeById(graph: PhysicsGraph) {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function edgeKey(edge: PhysicsGraphEdge): string {
  return `${edge.sourceId}|${edge.relation}|${edge.targetId}`;
}
