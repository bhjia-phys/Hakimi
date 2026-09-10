import type { SnapshotSubagent } from '../../../protocol/rest-snapshot';
import type { EventEnvelope } from './sessionEventJournal';
import { z } from 'zod';

const spawn = z.object({
  type: z.literal('subagent.spawned'), subagentId: z.string().min(1),
  parentAgentId: z.string().optional(), callerAgentId: z.string().optional(),
  parentToolCallId: z.string().optional(), description: z.string().optional(),
  subagentName: z.string().optional(), runInBackground: z.boolean().optional(),
});
const terminal = z.object({
  type: z.enum(['subagent.completed', 'subagent.failed']), subagentId: z.string().min(1),
  runId: z.string().min(1).optional(),
  resultSummary: z.string().optional(), error: z.string().optional(),
});
const started = z.object({ type: z.literal('subagent.started'), subagentId: z.string().min(1),
  runId: z.string().min(1).optional(),
});
const detached = z.object({ type: z.literal('task.started'), info: z.object({
  kind: z.literal('agent'), agentId: z.string(), detached: z.literal(true),
}) });

/** Disposable projection of durable execution facts, not a scheduler or scientific status.
 * Rebuilt during the journal's existing streaming open, never by scanning on each snapshot.
 * Unfinished historical spawns are deliberately not advertised as running after restart.
 */
export class SubagentHistory {
  private readonly rows = new Map<string, SnapshotSubagent>();
  private readonly seenAgents = new Set<string>();
  private readonly ambiguousAgents = new Set<string>();
  private readonly runs = new Map<string, string>();

  constructor(private readonly sessionId: string) {}

  apply(envelope: EventEnvelope): void {
    if (envelope.session_id !== this.sessionId || envelope.volatile === true ||
        !Number.isFinite(Date.parse(envelope.timestamp))) return;
    if (envelope.type === 'subagent.spawned') {
      const parsed = spawn.safeParse(envelope.payload);
      if (!parsed.success) return;
      const event = parsed.data;
      // Legacy completion events identify an agent, not an execution. After
      // reuse a delayed old completion cannot safely identify the new run.
      if (this.seenAgents.has(event.subagentId)) this.ambiguousAgents.add(event.subagentId);
      this.seenAgents.add(event.subagentId);
      // A new execution invalidates an older terminal result for the same agent.
      this.rows.delete(event.subagentId);
      this.runs.delete(event.subagentId);
      if (event.runInBackground === true) return;
      this.rows.set(event.subagentId, {
        id: event.subagentId, agent_id: event.subagentId, session_id: this.sessionId,
        kind: 'subagent', description: event.description ?? event.subagentName ?? event.subagentId,
        status: 'running', subagent_phase: 'queued', run_in_background: false,
        parent_agent_id: event.parentAgentId ?? event.callerAgentId,
        parent_tool_call_id: event.parentToolCallId || undefined,
        subagent_type: event.subagentName, created_at: envelope.timestamp,
      });
    } else if (envelope.type === 'subagent.started') {
      const parsed = started.safeParse(envelope.payload);
      if (!parsed.success) return;
      const row = this.rows.get(parsed.data.subagentId);
      if (row === undefined) return;
      if (parsed.data.runId !== undefined) this.runs.set(parsed.data.subagentId, parsed.data.runId);
      row.run_id = parsed.data.runId;
      row.started_at ??= envelope.timestamp;
    } else if (envelope.type === 'task.started') {
      const parsed = detached.safeParse(envelope.payload);
      if (parsed.success) this.rows.delete(parsed.data.info.agentId);
    } else if (envelope.type === 'subagent.completed' || envelope.type === 'subagent.failed') {
      const parsed = terminal.safeParse(envelope.payload);
      if (!parsed.success || parsed.data.type !== envelope.type) return;
      const row = this.rows.get(parsed.data.subagentId);
      if (row === undefined) return;
      const runId = this.runs.get(parsed.data.subagentId);
      if (runId !== undefined || parsed.data.runId !== undefined) {
        if (runId !== parsed.data.runId) return;
      } else if (this.ambiguousAgents.has(parsed.data.subagentId)) return;
      row.status = parsed.data.type === 'subagent.completed' ? 'completed' : 'failed';
      row.subagent_phase = row.status;
      row.completed_at = envelope.timestamp;
      row.output_preview = parsed.data.resultSummary ?? parsed.data.error;
    }
  }

  get(): SnapshotSubagent[] {
    return [...this.rows.values()].filter(row => row.status !== 'running').map(row => ({ ...row }));
  }
}
