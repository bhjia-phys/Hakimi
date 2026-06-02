import type { PhysicsCapsuleKind, ReliabilityState } from '../physics-memory';
import {
  type PhysicsGraph,
  type PhysicsGraphEdge,
  type PhysicsGraphNode,
  queryPhysicsGraphDependencyClosure,
} from '../physics-graph';
import {
  formalizationTargetKindFromCapsuleKind,
  type FormalizationBlueprint,
  type FormalizationContract,
  type FormalizationDiagnostic,
  type FormalizationPlan,
  type FormalizationPlanInput,
  type FormalizationReadiness,
} from './types';

export function buildFormalizationPlan(
  graph: PhysicsGraph,
  input: FormalizationPlanInput,
): FormalizationPlan {
  const diagnostics: FormalizationDiagnostic[] = [];
  const graphNodes = nodeById(graph);
  const candidateIds = collectCandidateIds(graph, input, diagnostics);
  const candidateSet = new Set(candidateIds);
  const contracts = candidateIds.flatMap((nodeId) => {
    const node = graphNodes.get(nodeId);
    if (node === undefined) return [];
    const contract = contractFromNode(node, graph.edges, diagnostics);
    return contract === undefined ? [] : [contract];
  });
  const contractIds = new Set(contracts.map((contract) => contract.graphNodeId));

  return {
    contracts,
    blueprint: {
      format: 'aitp-formalization-blueprint/v0',
      nodes: contracts.map((contract) => ({
        id: contract.graphNodeId,
        contractId: contract.id,
        kind: contract.targetKind,
        title: contract.title,
        readiness: contract.readiness,
        domain: contract.domain,
      })),
      edges: graph.edges
        .filter((edge) => candidateSet.has(edge.sourceId) && candidateSet.has(edge.targetId))
        .filter((edge) => contractIds.has(edge.sourceId) && contractIds.has(edge.targetId))
        .filter((edge) => isFormalizationDependencyRelation(edge.relation))
        .map((edge) => ({
          from: edge.sourceId,
          to: edge.targetId,
          relation: edge.relation,
        }))
        .toSorted((a, b) => `${a.from}|${a.relation}|${a.to}`.localeCompare(
          `${b.from}|${b.relation}|${b.to}`,
        )),
    } satisfies FormalizationBlueprint,
    diagnostics,
  };
}

function isFormalizationDependencyRelation(relation: PhysicsGraphEdge['relation']): boolean {
  return relation === 'depends_on' || relation === 'assumes';
}

function collectCandidateIds(
  graph: PhysicsGraph,
  input: FormalizationPlanInput,
  diagnostics: FormalizationDiagnostic[],
): readonly string[] {
  const graphNodes = nodeById(graph);
  const candidates = new Set<string>();
  for (const targetId of input.targetIds) {
    if (!graphNodes.has(targetId)) {
      diagnostics.push({
        severity: 'error',
        code: 'formalization-target-missing',
        message: `Formalization target "${targetId}" is not present in the graph.`,
        nodeId: targetId,
      });
      continue;
    }
    candidates.add(targetId);
    if (input.includeDependencyClosure === false) continue;
    const closure = queryPhysicsGraphDependencyClosure(graph, {
      startIds: [targetId],
      maxDepth: input.maxDepth ?? 4,
      bridgePolicy: 'explicit-only',
    });
    for (const nodeId of closure.nodeIds) candidates.add(nodeId);
    diagnostics.push(...closure.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      nodeId: diagnostic.nodeId,
    })));
  }
  return [...candidates].toSorted();
}

function contractFromNode(
  node: PhysicsGraphNode,
  edges: readonly PhysicsGraphEdge[],
  diagnostics: FormalizationDiagnostic[],
): FormalizationContract | undefined {
  const kind = formalizationTargetKindFromCapsuleKind(node.kind as PhysicsCapsuleKind);
  if (kind === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'not-formalizable-kind',
      message: `Graph node "${node.id}" of kind "${node.kind}" is not a formalization target.`,
      nodeId: node.id,
    });
    return undefined;
  }
  const dependencyIds = edges
    .filter((edge) => edge.sourceId === node.id && edge.relation === 'depends_on')
    .map((edge) => edge.targetId)
    .toSorted();
  const assumptionIds = edges
    .filter((edge) => edge.sourceId === node.id && edge.relation === 'assumes')
    .map((edge) => edge.targetId)
    .toSorted();
  const readiness = readinessFromReliability(node.reliability);
  return {
    id: `formalization.contract.${safeId(node.id)}`,
    graphNodeId: node.id,
    targetKind: kind,
    title: node.title,
    domain: node.domain,
    currentReliability: node.reliability,
    readiness,
    sourceRefs: node.sourceRefs,
    dependencyIds,
    assumptionIds,
    requiredHumanCheckpoint: readiness !== 'formalized',
    notes: notesForReadiness(readiness, node.reliability),
  };
}

function readinessFromReliability(
  reliability: ReliabilityState | undefined,
): FormalizationReadiness {
  switch (reliability) {
    case 'formalized':
      return 'formalized';
    case 'checked':
    case 'validated':
      return 'formalization_ready';
    case 'raw':
    case 'parsed':
    case 'linked':
    case undefined:
      return 'needs_review';
    case 'rejected':
      return 'not_formalizable';
  }
}

function notesForReadiness(
  readiness: FormalizationReadiness,
  reliability: ReliabilityState | undefined,
): readonly string[] {
  switch (readiness) {
    case 'formalized':
      return ['Already marked formalized in the trust ladder.'];
    case 'formalization_ready':
      return [
        `Current reliability is ${reliability}; export as a candidate contract, not as a checked theorem.`,
      ];
    case 'needs_review':
      return ['Requires review, sources, and scope checks before formalization export.'];
    case 'not_formalizable':
      return ['Rejected memory cannot be exported as a formalization target.'];
  }
}

function nodeById(graph: PhysicsGraph): Map<string, PhysicsGraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function safeId(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_.-]+/g, '-');
}
