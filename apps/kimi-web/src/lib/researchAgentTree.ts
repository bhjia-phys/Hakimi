import type { AgentRelationship, AppTask, AppTaskStatus } from '../api/types';

export interface ResearchAgentRow extends AgentRelationship {
  depth: number;
  description: string;
  status: AppTaskStatus | 'unknown';
  uncertain: boolean;
}

export function buildResearchAgentTree(
  relationships: readonly AgentRelationship[],
  tasks: readonly AppTask[],
): ResearchAgentRow[] {
  const nodes = new Map(relationships.map((node) => [node.agentId, { ...node }]));
  const ambiguous = new Set<string>();
  for (const task of tasks) {
    if (task.kind !== 'subagent' || task.agentId === undefined) continue;
    const saved = relationships.find((node) => node.agentId === task.agentId);
    const candidates = tasks.filter((candidate) => candidate.kind === 'subagent' && candidate.agentId === task.agentId);
    const parents = [...new Set(candidates.flatMap((candidate) => candidate.parentAgentId === undefined ? [] : [candidate.parentAgentId]))];
    const scopes = [...new Set(candidates.flatMap((candidate) => candidate.taskScope === undefined ? [] : [candidate.taskScope]))];
    if (parents.length > 1 || scopes.length > 1) ambiguous.add(task.agentId);
    nodes.set(task.agentId, {
      agentId: task.agentId, parentAgentId: saved?.parentAgentId ?? (parents.length === 1 ? parents[0] : undefined),
      taskScope: saved?.taskScope ?? (scopes.length === 1 ? scopes[0] : undefined),
    });
  }
  const rows = [...nodes.values()].map<ResearchAgentRow & { order: string }>((node) => {
    const seen = new Set([node.agentId]);
    const ancestry = [node.agentId];
    let parent = node.parentAgentId;
    let uncertain = parent === undefined || ambiguous.has(node.agentId);
    while (parent !== undefined && parent !== 'main') {
      if (seen.has(parent) || !nodes.has(parent)) { uncertain = true; break; }
      seen.add(parent);
      ancestry.unshift(parent);
      parent = nodes.get(parent)?.parentAgentId;
      if (parent === undefined) uncertain = true;
    }
    const candidates = tasks.filter((task) => task.kind === 'subagent' && task.agentId === node.agentId);
    const matching = candidates.filter((task) =>
      (task.parentAgentId === undefined || node.parentAgentId === undefined || task.parentAgentId === node.parentAgentId) &&
      (task.taskScope === undefined || node.taskScope === undefined || task.taskScope === node.taskScope));
    if (matching.length !== candidates.length) uncertain = true;
    const active = matching.filter((task) => task.status === 'running');
    if (active.length > 1) uncertain = true;
    const task = ambiguous.has(node.agentId) ? undefined
      : active.length === 1 ? active[0] : matching.length === 1 ? matching[0] : undefined;
    return { ...node, depth: uncertain ? 0 : ancestry.length - 1,
      description: task?.description ?? node.agentId,
      status: task?.status ?? 'unknown', uncertain, order: ancestry.join('\0') };
  });
  return rows.sort((a, b) => a.order.localeCompare(b.order)).map(({ order: _, ...row }) => row);
}
