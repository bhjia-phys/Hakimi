import type { AppTask } from '../api/types';

/**
 * Append the live-only swarm subagents that a fresh REST `/tasks` list does not
 * contain.
 *
 * REST `/tasks` carries registered foreground/background tasks with an explicit
 * detached flag, but it does not reliably reconstruct every WS-owned swarm row.
 * Both the session-load task fetch and the 1s output poll rebuild
 * `tasksBySession` from that REST list, so a plain replace would drop omitted
 * subagents and the next event would re-add them, flickering the cards.
 *
 * Keep WS-owned subagent tasks that REST omits. When REST also has the same
 * agent run it is keyed by background-task id while WS is keyed by agent id
 * (`backgroundTaskId` links the two, set from `task.started`). Fold only an
 * exact or unambiguous REST copy into the WS row; REST may still correct a
 * terminal status the WS row missed while disconnected.
 */
function selectRestAgentCandidate(
  candidates: readonly AppTask[],
  parentToolCallId?: string,
): AppTask | undefined {
  if (parentToolCallId !== undefined) {
    const exact = candidates.filter((task) => task.parentToolCallId === parentToolCallId);
    if (exact.length === 1) return exact[0];
    // Explicit parent identity is authoritative. Agent-id/status fallback exists
    // only for rows from older servers that omitted parentToolCallId entirely.
    if (candidates.some((task) => task.parentToolCallId !== undefined)) return undefined;
  }
  if (candidates.length === 1) return candidates[0];
  // Reusing one agent id can leave several persisted background runs. A unique
  // running row is the only safe implicit match; terminal-only or multi-running
  // sets are ambiguous and must remain separate.
  const running = candidates.filter((task) => task.status === 'running');
  return running.length === 1 ? running[0] : undefined;
}

export function keepLiveSubagents(restBased: AppTask[], existing: AppTask[]): AppTask[] {
  const restIds = new Set(restBased.map((t) => t.id));
  const liveSubagents = existing.filter((t) => t.kind === 'subagent' && !restIds.has(t.id));
  if (liveSubagents.length === 0) return restBased;
  const restById = new Map(restBased.map((t) => [t.id, t] as const));
  const restByAgentId = new Map<string, AppTask[]>();
  for (const task of restBased) {
    if (task.kind !== 'subagent' || !task.agentId) continue;
    const candidates = restByAgentId.get(task.agentId) ?? [];
    candidates.push(task);
    restByAgentId.set(task.agentId, candidates);
  }
  const foldedRestIds = new Set<string>();
  const merged = liveSubagents.map((live) => {
    // task.started normally teaches the live row its exact background task id.
    // Without it, matching parent identity takes precedence. Agent-id/status
    // fallback is safe only when every candidate omitted parent identity.
    const rest =
      live.backgroundTaskId !== undefined
        ? restById.get(live.backgroundTaskId)
        : selectRestAgentCandidate(
            restByAgentId.get(live.agentId ?? live.id) ?? [],
            live.parentToolCallId,
          );
    if (rest === undefined) return live;
    foldedRestIds.add(rest.id);
    // True when the fold — not the event stream — is what makes the row terminal.
    const restCompletesLiveRow = live.status === 'running' && rest.status !== 'running';
    return {
      ...live,
      backgroundTaskId: live.backgroundTaskId ?? rest.id,
      // Live status metadata is newer than a REST poll. REST only fills gaps;
      // it must not replace a status-frame model/profile with an older value.
      agentId: live.agentId ?? rest.agentId,
      model: live.model ?? rest.model,
      thinkingEffort: live.thinkingEffort ?? rest.thinkingEffort,
      subagentType: live.subagentType ?? rest.subagentType,
      // Terminal-stickiness: never let a lagging poll flip a finished row back
      // to running, but let REST complete a row whose finish event was missed.
      status: live.status === 'running' ? rest.status : live.status,
      // toAgentMember prefers subagentPhase over status, so sync it too —
      // otherwise the detail panel badge keeps showing a stale Working/Queued.
      // The phase enum has no 'cancelled'; the dock already styles cancelled
      // rows as failed.
      subagentPhase: restCompletesLiveRow
        ? rest.status === 'completed'
          ? 'completed'
          : 'failed'
        : live.subagentPhase,
      completedAt: live.completedAt ?? rest.completedAt,
      // REST output is authoritative once present: agent tasks persist their
      // result at completion, and a previously folded preview would otherwise
      // freeze the detail panel's Result.
      outputPreview: rest.outputPreview ?? live.outputPreview,
      outputBytes: rest.outputBytes ?? live.outputBytes,
    };
  });
  const rest = restBased.filter((t) => !foldedRestIds.has(t.id));
  return [...rest, ...merged];
}

/**
 * Seed the task store from the snapshot's subagent roster. The roster is
 * authoritative for identity/status/phase; keep reducer-owned accumulated
 * output (outputLines/text) from any already-live task, and keep tasks the
 * roster does not know about (background bash tasks from REST).
 */
export function mergeSnapshotSubagents(roster: AppTask[], existing: AppTask[]): AppTask[] {
  if (roster.length === 0) return existing;
  const existingById = new Map(existing.map((t) => [t.id, t] as const));
  const rosterIds = new Set(roster.map((t) => t.id));
  const merged = roster.map((task) => {
    const live = existingById.get(task.id);
    if (!live) return task;
    return { ...task, outputLines: live.outputLines, text: live.text };
  });
  const kept = existing.filter((t) => !rosterIds.has(t.id));
  return kept.length === 0 ? merged : [...merged, ...kept];
}
