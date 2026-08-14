import { describe, expect, it } from 'vitest';

import { AgentTranscript } from '#/store/agentTranscript';
import { TranscriptStore } from '#/store/transcriptStore';
import {
  appendAtOffset,
  applyOperation,
  filterContinuation,
  normalizeStandaloneItems,
  type AgentState,
  type StandalonePlacement,
} from '#/ops/apply';
import { agentTranscriptSnapshotSchema } from '#/contract/schema';
import { goalMarkerFromMutation } from '#/history/goalMarker';
import type {
  AgentTranscriptSnapshot,
  FrameUpsertOp,
  MarkerUpsertOp,
  TurnUpsertOp,
  TranscriptOperation,
} from '#/ops/operation';
import type { ThinkingFrame, ToolCallFrame } from '#/model/frame';
import type { TranscriptInteraction } from '#/model/interaction';
import type { TranscriptItem } from '#/model/item';

/** Display id for order assertions across the item union. */
function itemLabel(item: TranscriptItem): string {
  if (item.kind === 'turn') return item.turnId;
  if (item.kind === 'marker') return item.markerId;
  return item.refId;
}

const turn1: TurnUpsertOp = {
  op: 'turn.upsert',
  turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'running', origin: { kind: 'user' }, prompt: 'hi' },
};

const doneThinking: FrameUpsertOp = {
  op: 'frame.upsert',
  turnId: 't1',
  stepId: 't1.1',
  frame: { kind: 'thinking', frameId: 't1.1.f1', text: 'ponder' } satisfies ThinkingFrame,
};

function toolFrame(state: ToolCallFrame['state'], output?: unknown): TranscriptOperation[] {
  return [
    turn1,
    {
      op: 'step.upsert',
      turnId: 't1',
      step: { kind: 'step', stepId: 't1.1', turnId: 't1', ordinal: 1, state: 'running' },
    },
    {
      op: 'frame.upsert',
      turnId: 't1',
      stepId: 't1.1',
      frame: {
        kind: 'tool',
        frameId: 't1.1.call_1',
        toolCallId: 'call_1',
        name: 'Read',
        state,
        input: { path: '/a' },
        output,
      } satisfies ToolCallFrame,
    },
  ];
}

describe('AgentTranscript', () => {
  it('applies turn/step/frame and keeps a self-consistent snapshot', () => {
    const tx = new AgentTranscript('main');
    tx.apply(toolFrame('running'));

    const items = tx.getItems();
    expect(items).toHaveLength(1);
    const turn = items[0];
    expect(turn?.kind).toBe('turn');
    if (turn?.kind !== 'turn') return;
    expect(turn.steps).toHaveLength(1);
    expect(turn.steps[0]?.frames.map((f) => f.kind)).toEqual(['tool']);
  });

  it('auto-vivifies missing parents so any op order stays self-consistent', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      {
        op: 'frame.upsert',
        turnId: 't9',
        stepId: 't9.2',
        frame: { kind: 'thinking', frameId: 't9.2.f1', text: 'x' },
      },
    ]);
    const turn = tx.getTurn('t9');
    expect(turn?.ordinal).toBe(9);
    expect(turn?.steps[0]?.stepId).toBe('t9.2');
  });

  it('upserts are idempotent under duplication in causal order', () => {
    const ops: TranscriptOperation[] = [
      turn1,
      {
        op: 'step.upsert',
        turnId: 't1',
        step: { kind: 'step', stepId: 't1.1', turnId: 't1', ordinal: 1, state: 'running' },
      },
      doneThinking,
      {
        op: 'step.upsert',
        turnId: 't1',
        step: { kind: 'step', stepId: 't1.1', turnId: 't1', ordinal: 1, state: 'completed' },
      },
      { op: 'turn.upsert', turn: { ...turn1.turn, state: 'completed' } },
    ];
    const a = new AgentTranscript('main');
    a.apply(ops);
    const b = new AgentTranscript('main');
    b.apply([...ops, ...ops]);
    b.apply(ops);
    expect(b.getItems()).toEqual(a.getItems());
  });

  it('appends text chunks by offset; gaps stay un-applied and signalled', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      turn1,
      {
        op: 'frame.upsert',
        turnId: 't1',
        stepId: 't1.1',
        frame: { kind: 'text', frameId: 't1.1.f1', role: 'assistant', text: '' },
      },
    ]);
    const gap = tx.apply([
      { op: 'append', target: { type: 'frame', turnId: 't1', stepId: 't1.1', frameId: 't1.1.f1' }, offset: 5, text: 'late' },
    ]);
    expect(gap.gap).toEqual({
      target: { type: 'frame', turnId: 't1', stepId: 't1.1', frameId: 't1.1.f1' },
      expected: 0,
      got: 5,
    });

    const ok = tx.apply([
      { op: 'append', target: { type: 'frame', turnId: 't1', stepId: 't1.1', frameId: 't1.1.f1' }, offset: 0, text: 'hello ' },
      { op: 'append', target: { type: 'frame', turnId: 't1', stepId: 't1.1', frameId: 't1.1.f1' }, offset: 6, text: 'world' },
    ]);
    expect(ok.gap).toBeUndefined();
    const turn = tx.getTurn('t1');
    const frame = turn?.steps[0]?.frames[0];
    expect(frame?.kind === 'text' && frame.text).toBe('hello world');

    // duplicate delivery is absorbed
    const dup = tx.apply([
      { op: 'append', target: { type: 'frame', turnId: 't1', stepId: 't1.1', frameId: 't1.1.f1' }, offset: 6, text: 'world' },
    ]);
    expect(dup.accepted).toHaveLength(0);
  });

  it('appendAtOffset matches web alignDelta semantics', () => {
    expect(appendAtOffset('abc', 3, 'd')).toEqual({ text: 'abcd', changed: true });
    expect(appendAtOffset('abc', 1, 'bc').changed).toBe(false);
    expect(appendAtOffset('abc', 1, 'bcd')).toEqual({ text: 'abcd', changed: true });
    expect(appendAtOffset('abc', 5, 'x').gap).toEqual({ expected: 3, got: 5 });
  });

  it('appendAtOffset treats a mismatched overlap as a gap, never a rewrite', () => {
    // The chunk is behind local state but is not the local suffix: rewriting
    // from the offset would silently drop local content ('llo').
    const result = appendAtOffset('hello', 2, ' world');
    expect(result.text).toBe('hello');
    expect(result.gap).toEqual({ expected: 5, got: 2 });
    // A matching overlap still trims to the novel suffix.
    expect(appendAtOffset('hello wo', 6, 'world')).toEqual({ text: 'hello world', changed: true });
  });

  it('tracks pending interactions as a derived index (entity channel)', () => {
    const tx = new AgentTranscript('main');
    const interaction = (state: TranscriptInteraction['state']): TranscriptInteraction => ({
      interactionId: 'appr-1',
      interactionKind: 'approval',
      toolCallId: 'call-1',
      state,
    });
    tx.apply([turn1, { op: 'interaction.upsert', interaction: interaction('pending') }]);
    expect(tx.listPendingInteractions()).toEqual(['appr-1']);
    tx.apply([{ op: 'interaction.upsert', interaction: interaction('approved') }]);
    expect(tx.listPendingInteractions()).toEqual([]);

    // An entity without an anchor tool call tracks pending the same way.
    const unanchored = (state: TranscriptInteraction['state']): TranscriptInteraction => ({
      interactionId: 'appr-2',
      interactionKind: 'question',
      state,
    });
    tx.apply([{ op: 'interaction.upsert', interaction: unanchored('pending') }]);
    expect(tx.listPendingInteractions()).toEqual(['appr-2']);
    tx.apply([{ op: 'interaction.upsert', interaction: unanchored('answered') }]);
    expect(tx.listPendingInteractions()).toEqual([]);
  });

  it('upserts attachment and todo entities idempotently', () => {
    const tx = new AgentTranscript('main');
    const attachment = {
      attachmentId: 'att_1',
      mediaType: 'image/png',
      source: { kind: 'url' as const, url: 'https://example.com/a.png' },
    };
    const todo = { todoId: 'todo', items: [{ title: 'x', status: 'pending' as const }] };
    const first = tx.apply([
      { op: 'attachment.upsert', attachment },
      { op: 'todo.upsert', todo },
    ]);
    expect(first.accepted).toHaveLength(2);
    // Re-applying the identical entities is a no-op (idempotent upsert).
    const second = tx.apply([
      { op: 'attachment.upsert', attachment },
      { op: 'todo.upsert', todo },
    ]);
    expect(second.accepted).toHaveLength(0);
    expect(tx.getAttachment('att_1')?.mediaType).toBe('image/png');
    expect(tx.getTodo('todo')?.items).toHaveLength(1);
    tx.apply([{ op: 'todo.upsert', todo: { ...todo, items: [] } }]);
    expect(tx.getTodo('todo')?.items).toHaveLength(0);
  });

  it('upserts prompt queue entities by id, idempotently', () => {
    const tx = new AgentTranscript('main');
    const queued = {
      promptId: 'p1',
      status: 'queued' as const,
      userMessageId: 'u1',
      createdAt: '2026-07-22T00:00:00.000Z',
    };
    expect(tx.apply([{ op: 'prompt.upsert', prompt: queued }]).accepted).toHaveLength(1);
    // Re-applying the identical entity is a no-op (idempotent upsert).
    expect(tx.apply([{ op: 'prompt.upsert', prompt: queued }]).accepted).toHaveLength(0);
    // Same id, new state: whole-entity replace.
    const running = { ...queued, status: 'running' as const, steeredAt: '2026-07-22T00:00:01.000Z' };
    expect(tx.apply([{ op: 'prompt.upsert', prompt: running }]).accepted).toHaveLength(1);
    expect(tx.getPrompt('p1')?.status).toBe('running');
    expect(tx.getPrompt('p1')?.steeredAt).toBe('2026-07-22T00:00:01.000Z');

    // Prompts are global snapshot entities: they survive a snapshot/reset
    // roundtrip (the full-refresh convergence path).
    const snapshot = tx.snapshot();
    expect(snapshot.prompts).toEqual([running]);
    const fresh = new AgentTranscript('main');
    fresh.receive([{ op: 'reset', agentId: 'main', snapshot }]);
    expect(fresh.getPrompt('p1')).toEqual(running);
    expect([...fresh.getPrompts().keys()]).toEqual(['p1']);
  });

  it('step upserts carry usage/timing and the terminal header clears retry', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      turn1,
      {
        op: 'step.upsert',
        turnId: 't1',
        step: {
          kind: 'step', stepId: 't1.1', turnId: 't1', ordinal: 1, state: 'running',
          retry: { failedAttempt: 1, nextAttempt: 2, maxAttempts: 3, delayMs: 500, errorName: 'RateLimit', errorMessage: 'slow down' },
        },
      },
    ]);
    expect(tx.getTurn('t1')?.steps[0]?.retry?.errorName).toBe('RateLimit');

    // Same identity fields but new usage/timing: must not be swallowed as a
    // no-op (the equality check covers the extension fields).
    const completed = tx.apply([
      {
        op: 'step.upsert',
        turnId: 't1',
        step: {
          kind: 'step', stepId: 't1.1', turnId: 't1', ordinal: 1, state: 'completed',
          usage: { inputOther: 10, output: 5, inputCacheRead: 3, inputCacheCreation: 2 },
          finishReason: 'stop',
          timing: { llmFirstTokenLatencyMs: 120 },
        },
      },
    ]);
    expect(completed.accepted).toHaveLength(1);
    const step = tx.getTurn('t1')?.steps[0];
    expect(step?.usage?.output).toBe(5);
    expect(step?.timing?.llmFirstTokenLatencyMs).toBe(120);
    // step.upsert replaces the whole header: no `retry` key means cleared.
    expect(step?.retry).toBeUndefined();
  });

  it('turn upserts carry durationMs and the terminal error', () => {
    const tx = new AgentTranscript('main');
    tx.apply([turn1]);
    const failed = tx.apply([
      { op: 'turn.upsert', turn: { ...turn1.turn, state: 'failed', durationMs: 1500, error: 'boom' } },
    ]);
    expect(failed.accepted).toHaveLength(1);
    const turn = tx.getTurn('t1');
    expect(turn?.durationMs).toBe(1500);
    expect(turn?.error).toBe('boom');
  });

  it('tool frames keep streamed inputText and the newest progress update', () => {
    const tx = new AgentTranscript('main');
    tx.apply(toolFrame('running'));
    const streamed = (frame: Partial<ToolCallFrame> & Pick<ToolCallFrame, 'inputText' | 'state'>): TranscriptOperation => ({
      op: 'frame.upsert',
      turnId: 't1',
      stepId: 't1.1',
      frame: {
        kind: 'tool', frameId: 't1.1.call_1', toolCallId: 'call_1', name: 'Read',
        ...frame,
      },
    });
    // Delta accumulation: inputText grows while the frame stays running.
    expect(tx.apply([streamed({ inputText: '{"path"', state: 'running' })]).accepted).toHaveLength(1);
    tx.apply([streamed({ inputText: '{"path":"/a"}', state: 'running' })]);
    // `tool.call.started` lands with the parsed input but keeps the raw text.
    tx.apply([
      streamed({ inputText: '{"path":"/a"}', state: 'running', input: { path: '/a' } }),
      streamed({
        inputText: '{"path":"/a"}',
        state: 'running',
        input: { path: '/a' },
        progress: { kind: 'progress', percent: 50 },
      }),
    ]);
    const frame = tx.getTurn('t1')?.steps[0]?.frames.find((f) => f.kind === 'tool');
    expect(frame?.kind === 'tool' && frame.input).toEqual({ path: '/a' });
    expect(frame?.kind === 'tool' && frame.inputText).toBe('{"path":"/a"}');
    expect(frame?.kind === 'tool' && frame.progress).toEqual({ kind: 'progress', percent: 50 });
  });

  it('task upserts carry resultSummary/error/stateReason/usage', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      { op: 'task.upsert', task: { taskId: 'task1', kind: 'subagent', state: 'running', detached: false, outputTail: '' } },
    ]);
    const done = tx.apply([
      {
        op: 'task.upsert',
        task: {
          taskId: 'task1', kind: 'subagent', state: 'completed', detached: false, outputTail: '',
          resultSummary: 'scanned 12 files',
          usage: { inputOther: 100, output: 40, inputCacheRead: 10, inputCacheCreation: 5 },
        },
      },
    ]);
    expect(done.accepted).toHaveLength(1);
    const task = tx.getTask('task1');
    expect(task?.resultSummary).toBe('scanned 12 files');
    expect(task?.usage?.inputOther).toBe(100);
  });

  it('items.remove clears anchored interactions and their pending entries', () => {
    // The interaction entity anchored to a tool call inside a removed turn
    // dies with its anchor.
    const tx = new AgentTranscript('main');
    tx.apply([
      turn1,
      {
        op: 'frame.upsert',
        turnId: 't1',
        stepId: 't1.1',
        frame: {
          kind: 'tool',
          frameId: 't1.1.call-9',
          toolCallId: 'call-9',
          name: 'Bash',
          state: 'running',
        },
      },
      {
        op: 'interaction.upsert',
        interaction: {
          interactionId: 'appr-9',
          interactionKind: 'approval',
          toolCallId: 'call-9',
          state: 'pending',
        },
      },
    ]);
    expect(tx.listPendingInteractions()).toEqual(['appr-9']);
    tx.apply([{ op: 'items.remove', ids: ['t1'] }]);
    expect(tx.getItems()).toHaveLength(0);
    expect(tx.getInteraction('appr-9')).toBeUndefined();
    expect(tx.listPendingInteractions()).toEqual([]);
  });

  it('receive() equals full reset seed; snapshot windowing keeps newest turns', () => {
    const tx = new AgentTranscript('main');
    for (let n = 1; n <= 5; n += 1) {
      tx.apply([
        { op: 'marker.upsert', item: { kind: 'marker', markerId: `m${n}`, marker: 'goal' } },
        {
          op: 'turn.upsert',
          turn: { kind: 'turn', turnId: `t${n}`, ordinal: n, state: 'completed', origin: { kind: 'user' } },
        },
      ]);
    }
    const snapshot = tx.snapshot({ tailTurns: 2 });
    expect(snapshot.hasMoreOlder).toBe(true);
    expect(snapshot.items.filter((i) => i.kind === 'turn').map((i) => i.kind === 'turn' && i.turnId)).toEqual(['t4', 't5']);
    // markers between kept turns survive; the one before t4's segment does not…
    expect(snapshot.items.filter((i) => i.kind === 'marker').length).toBeGreaterThan(0);

    const fresh = new AgentTranscript('main');
    fresh.receive([{ op: 'reset', agentId: 'main', snapshot }]);
    expect(fresh.getItems()).toEqual(snapshot.items);
    expect(fresh.hasMoreOlder).toBe(true);
  });

  it('carries the placement continuation through snapshot/reset so corrections converge', () => {
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    const tx = new AgentTranscript('main');
    tx.apply([
      turn('a', 0),
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'H', marker: 'goal' }, beforeTurn: 1 },
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'L', marker: 'skill' } },
      turn('b', 1),
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['a', 'H', 'L', 'b']);

    // The snapshot carries ONLY the anchored item's entry (the unanchored
    // live item has no placement to share).
    const snapshot = tx.snapshot();
    expect(snapshot.continuation).toEqual({
      standalonePlacements: [{ itemId: 'H', beforeTurn: 1 }],
    });

    // The continuation survives the JSON wire roundtrip and schema validation.
    const wire = JSON.parse(JSON.stringify(snapshot)) as AgentTranscriptSnapshot;
    expect(agentTranscriptSnapshotSchema.parse(wire).continuation).toEqual(snapshot.continuation);
    const fresh = new AgentTranscript('main');
    fresh.receive([{ op: 'reset', agentId: 'main', snapshot: wire }]);
    expect(fresh.getItems().map(itemLabel)).toEqual(['a', 'H', 'L', 'b']);

    // The ordinal correction lands identically on both peers: the anchored H
    // stays pinned ahead of b on the reset peer too, instead of diverging.
    tx.apply([turn('a', 2)]);
    fresh.apply([turn('a', 2)]);
    expect(tx.getItems().map(itemLabel)).toEqual(['H', 'b', 'a', 'L']);
    expect(fresh.getItems().map(itemLabel)).toEqual(['H', 'b', 'a', 'L']);

    // A legacy snapshot without a continuation still resets — it just starts
    // with an empty placement memory, so the correction takes the legacy
    // (live-segment) layout instead of crashing.
    const legacySnapshot: AgentTranscriptSnapshot = { ...snapshot, continuation: undefined };
    expect(agentTranscriptSnapshotSchema.safeParse(JSON.parse(JSON.stringify(legacySnapshot))).success).toBe(true);
    const legacy = new AgentTranscript('main');
    legacy.receive([{ op: 'reset', agentId: 'main', snapshot: legacySnapshot }]);
    expect(legacy.getItems().map(itemLabel)).toEqual(['a', 'H', 'L', 'b']);
    legacy.apply([turn('a', 2)]);
    expect(legacy.getItems().map(itemLabel)).toEqual(['b', 'a', 'H', 'L']);
  });

  it('windows the snapshot continuation with the items, never leaking paged-out ids', () => {
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    const tx = new AgentTranscript('main');
    tx.apply([
      turn('t0', 0),
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'H', marker: 'goal' }, beforeTurn: 1 },
      turn('t1', 1),
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'T', marker: 'goal' }, beforeTurn: 2 },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'H', 't1', 'T']);

    // tailTurns 1 keeps [t1, T]: only T's anchor rides along; H's placement
    // memory pages in with H itself on the older page.
    const windowed = tx.snapshot({ tailTurns: 1 });
    expect(windowed.items.map(itemLabel)).toEqual(['t1', 'T']);
    expect(windowed.continuation).toEqual({
      standalonePlacements: [{ itemId: 'T', beforeTurn: 2 }],
    });

    // tailTurns 0 (the kap-server baseline reset window) ships no items — and
    // no continuation at all.
    const empty = tx.snapshot({ tailTurns: 0 });
    expect(empty.items).toEqual([]);
    expect(empty.continuation).toBeUndefined();
  });

  it('cuts ghost beforeItem successors out of the continuation on snapshot, reset and page filter', () => {
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    const tx = new AgentTranscript('main');
    tx.apply([
      turn('t0', 0),
      // A's successor never lands: the ghost edge must not leak onto the wire.
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'A', marker: 'goal' },
        beforeTurn: 1,
        beforeItem: 'ghost',
      },
      // B's ONLY anchor is the ghost edge: nothing visible remains, so the
      // whole entry drops out of the continuation.
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'B', marker: 'skill' },
        beforeItem: 'ghost',
      },
      // C points at a turn id: not a standalone successor, the edge cuts too.
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'C', marker: 'mode' },
        beforeTurn: 1,
        beforeItem: 't1',
      },
      turn('t1', 1),
    ]);

    // The snapshot emits only the cut-back anchors — never a ghost id.
    const snapshot = tx.snapshot();
    expect(snapshot.continuation).toEqual({
      standalonePlacements: [
        { itemId: 'A', beforeTurn: 1 },
        { itemId: 'C', beforeTurn: 1 },
      ],
    });
    // …which survives the JSON wire roundtrip and schema validation.
    const wire = JSON.parse(JSON.stringify(snapshot)) as AgentTranscriptSnapshot;
    expect(agentTranscriptSnapshotSchema.parse(wire).continuation).toEqual(snapshot.continuation);
    const fresh = new AgentTranscript('main');
    fresh.receive([{ op: 'reset', agentId: 'main', snapshot: wire }]);
    expect(fresh.snapshot().continuation).toEqual(snapshot.continuation);

    // A dirty snapshot (ghost edges already on the wire, e.g. from an older
    // or sloppy producer) hydrates through the same filter on reset: the
    // ghost edge falls back to the turn anchor, the anchor-less entry drops.
    const dirty: AgentTranscriptSnapshot = {
      ...wire,
      continuation: {
        standalonePlacements: [
          { itemId: 'A', beforeTurn: 1, beforeItem: 'ghost' },
          { itemId: 'B', beforeItem: 'ghost' },
          { itemId: 'ghost', beforeTurn: 1 },
        ],
      },
    };
    const peer = new AgentTranscript('main');
    peer.receive([{ op: 'reset', agentId: 'main', snapshot: dirty }]);
    expect(peer.snapshot().continuation).toEqual({
      standalonePlacements: [{ itemId: 'A', beforeTurn: 1 }],
    });
  });

  it('keeps a same-window beforeItem successor but cuts it once the successor pages out', () => {
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    const tx = new AgentTranscript('main');
    tx.apply([
      turn('t0', 0),
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'm1', marker: 'goal' },
        beforeTurn: 1,
        beforeItem: 'm2',
      },
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'm2', marker: 'skill' },
        beforeTurn: 1,
      },
      turn('t1', 1),
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'm2', 't1']);

    // Both ends of the edge are visible in the full snapshot: it rides along.
    const snapshot = tx.snapshot();
    expect(snapshot.continuation).toEqual({
      standalonePlacements: [
        { itemId: 'm1', beforeTurn: 1, beforeItem: 'm2' },
        { itemId: 'm2', beforeTurn: 1 },
      ],
    });

    // The page filter keeps the edge while both ends are on the page…
    expect(filterContinuation(snapshot, snapshot.items)).toEqual(snapshot.continuation);
    // …and cuts it back to the turn anchor when the successor is not — the
    // page never leaks an id it does not carry.
    const page = snapshot.items.filter((item) => itemLabel(item) !== 'm2');
    expect(filterContinuation(snapshot, page)).toEqual({
      standalonePlacements: [{ itemId: 'm1', beforeTurn: 1 }],
    });
  });

  it('snapshots a zero-tail window with no items at all, even standalone-only', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'H', marker: 'goal' },
        beforeTurn: 0,
      },
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'L', marker: 'skill' } },
    ]);

    // tailTurns 0 ships NO items — standalone-only state included — and no
    // continuation; the held items report as older history to page in.
    const windowed = tx.snapshot({ tailTurns: 0 });
    expect(windowed.items).toEqual([]);
    expect(windowed.continuation).toBeUndefined();
    expect(windowed.hasMoreOlder).toBe(true);

    // The default snapshot is untouched: items and anchors still materialize.
    const full = tx.snapshot();
    expect(full.items.map(itemLabel)).toEqual(['H', 'L']);
    expect(full.continuation).toEqual({
      standalonePlacements: [{ itemId: 'H', beforeTurn: 0 }],
    });
    expect(full.hasMoreOlder).toBe(false);

    // A wholly empty store invents no older history…
    const empty = new AgentTranscript('main');
    expect(empty.snapshot({ tailTurns: 0 }).hasMoreOlder).toBe(false);
    // …while an items-empty state that already flagged older history (the
    // kap-server baseline reset shape) keeps its flag across a re-snapshot.
    const reset = new AgentTranscript('main');
    reset.receive([
      {
        op: 'reset',
        agentId: 'main',
        snapshot: {
          items: [],
          tasks: [],
          interactions: [],
          attachments: [],
          todos: [],
          prompts: [],
          meta: {},
          hasMoreOlder: true,
        },
      },
    ]);
    expect(reset.snapshot({ tailTurns: 0 }).hasMoreOlder).toBe(true);
  });

  it('onChange emits accepted ops once per apply batch', () => {
    const tx = new AgentTranscript('main');
    const seen: string[] = [];
    tx.onChange((event) => {
      seen.push(...event.ops.map((op) => op.op));
    });
    tx.apply([turn1, turn1]); // second upsert is a no-op
    expect(seen).toEqual(['turn.upsert']);
  });

  it('task upsert + append keeps output tail globally, detached flips freely', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      { op: 'task.upsert', task: { taskId: 'task1', kind: 'shell', state: 'running', detached: false, outputTail: '' } },
      { op: 'append', target: { type: 'task', taskId: 'task1' }, offset: 0, text: 'line1\n' },
      { op: 'task.upsert', task: { taskId: 'task1', kind: 'shell', state: 'running', detached: true, outputTail: 'line1\n' } },
    ]);
    const task = tx.getTask('task1');
    expect(task?.detached).toBe(true);
    expect(task?.outputTail).toBe('line1\n');
  });

  it('meta.merge merges goal/modes shallowly', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      { op: 'meta.merge', meta: { goal: { objective: 'ship it', status: 'active' } } },
      { op: 'meta.merge', meta: { modes: { plan: { reviewPath: '/p' } } } },
    ]);
    expect(tx.getMeta().goal?.status).toBe('active');
    expect(tx.getMeta().modes?.plan?.reviewPath).toBe('/p');
  });

  it('meta.merge clears Goal on null and keeps it when absent', () => {
    const tx = new AgentTranscript('main');
    tx.apply([{ op: 'meta.merge', meta: { goal: { objective: 'ship it', status: 'active' } } }]);
    tx.apply([{ op: 'meta.merge', meta: { activity: 'turn' } }]);
    expect(tx.getMeta().goal?.objective).toBe('ship it');

    const firstClear = tx.apply([{ op: 'meta.merge', meta: { goal: null } }]);
    expect(firstClear.accepted).toHaveLength(1);
    expect(tx.getMeta().goal).toBeUndefined();
    const duplicateClear = tx.apply([{ op: 'meta.merge', meta: { goal: null } }]);
    expect(duplicateClear.accepted).toHaveLength(0);
  });

  it('meta.merge clears a mode badge on null and keeps absent keys', () => {
    const tx = new AgentTranscript('main');
    tx.apply([{ op: 'meta.merge', meta: { modes: { plan: {}, swarm: {} } } }]);
    tx.apply([{ op: 'meta.merge', meta: { modes: { plan: null } } }]);
    expect(tx.getMeta().modes).toEqual({ swarm: {} });
    // Clearing the last badge normalizes `modes` away entirely.
    tx.apply([{ op: 'meta.merge', meta: { modes: { swarm: null } } }]);
    expect(tx.getMeta().modes).toBeUndefined();
  });

  it('meta.merge shallow-merges the agent status key one level deep', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      { op: 'meta.merge', meta: { agent: { model: 'k2', permission: 'auto' } } },
      // Status slices arrive piecemeal: a later op carries only the fields
      // that changed, and the earlier fields must survive.
      { op: 'meta.merge', meta: { agent: { contextTokens: 1234 } } },
    ]);
    expect(tx.getMeta().agent).toEqual({ model: 'k2', permission: 'auto', contextTokens: 1234 });

    // Same-named fields are overwritten by the newer slice.
    tx.apply([
      { op: 'meta.merge', meta: { agent: { model: 'k3', phase: { kind: 'idle' } } } },
    ]);
    expect(tx.getMeta().agent).toEqual({
      model: 'k3',
      permission: 'auto',
      contextTokens: 1234,
      phase: { kind: 'idle' },
    });

    // An op without the agent key leaves it untouched.
    tx.apply([{ op: 'meta.merge', meta: { activity: 'turn' } }]);
    expect(tx.getMeta().agent?.model).toBe('k3');
    expect(tx.getMeta().activity).toBe('turn');
  });

  it('snapshot immutability: later applies do not mutate earlier reads', () => {
    const tx = new AgentTranscript('main');
    tx.apply(toolFrame('running'));
    const before = tx.getItems();
    tx.apply(toolFrame('done', 'content'));
    const beforeFrame = before[0]?.kind === 'turn' ? before[0].steps[0]?.frames[0] : undefined;
    expect(beforeFrame?.kind === 'tool' && beforeFrame.state).toBe('running');
  });

  it('places anchored standalone items before their following turn, not at the end', () => {
    const tx = new AgentTranscript('main');
    // A live turn lands first — the engine kept running while the backfill
    // was still reading history from disk.
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't2', ordinal: 2, state: 'running', origin: { kind: 'user' } },
      },
    ]);
    // Backfill replays history: t0, a marker between t0/t1, t1, and a
    // taskref that trailed t1 (anchored past it, before the live t2).
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
      },
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'm1', marker: 'skill' },
        beforeTurn: 1,
      },
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'completed', origin: { kind: 'user' } },
      },
      {
        op: 'taskref.upsert',
        item: { kind: 'taskref', refId: 'r1', taskId: 'bash-1' },
        beforeTurn: 2,
      },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 't1', 'r1', 't2']);
  });

  it('anchors a standalone item before the very first turn; re-applies stay in place', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
      },
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'm0', marker: 'compaction' },
        beforeTurn: 0,
      },
    ]);
    expect(tx.getItems()[0]?.kind).toBe('marker');
    // Re-applying an existing id replaces in place — no move, no duplicate.
    tx.apply([
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'm0', marker: 'compaction', payload: { v: 1 } },
        beforeTurn: 0,
      },
    ]);
    const items = tx.getItems();
    expect(items).toHaveLength(2);
    expect(items[0]?.kind).toBe('marker');
  });

  it('replays an anchored standalone op without reordering same-anchor siblings', () => {
    const tx = new AgentTranscript('main');
    const t0: TranscriptOperation = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
    };
    const t1: TranscriptOperation = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'completed', origin: { kind: 'user' } },
    };
    const m1: TranscriptOperation = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'm1', marker: 'goal' },
      beforeTurn: 1,
    };
    tx.apply([
      t0,
      m1,
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'm2', marker: 'skill' },
        beforeTurn: 1,
      },
      t1,
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'm2', 't1']);

    // Replaying the first anchored op must not push it past its same-anchor
    // sibling: the anchor pins the segment, not a slot within it.
    const replay = tx.apply([m1]);
    expect(replay.accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'm2', 't1']);

    // A structurally identical replay carrying fresh object references (as a
    // JSON / structuredClone roundtrip produces) is a no-op too — the store
    // compares the item's observable fields, not object identity.
    const cloned = tx.apply([structuredClone(m1)]);
    expect(cloned.accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'm2', 't1']);

    // A content refresh replaces in place — still no reorder.
    const refreshedOp: TranscriptOperation = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'm1', marker: 'goal', payload: { v: 1 } },
      beforeTurn: 1,
    };
    const refreshed = tx.apply([refreshedOp]);
    expect(refreshed.accepted).toHaveLength(1);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'm2', 't1']);

    // Replaying the refreshed op through a clone is a no-op again: structural
    // equality covers the payload.
    const clonedRefresh = tx.apply([structuredClone(refreshedOp)]);
    expect(clonedRefresh.accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'm2', 't1']);
  });

  it('keeps marker+taskref sibling order under an anchored replay', () => {
    const tx = new AgentTranscript('main');
    const m1: TranscriptOperation = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'm1', marker: 'goal' },
      beforeTurn: 1,
    };
    const r1: TranscriptOperation = {
      op: 'taskref.upsert',
      item: { kind: 'taskref', refId: 'r1', taskId: 'bash-1' },
      beforeTurn: 1,
    };
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
      },
      m1,
      r1,
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'completed', origin: { kind: 'user' } },
      },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'r1', 't1']);

    const replay = tx.apply([m1]);
    expect(replay.accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'r1', 't1']);

    // The taskref sibling replays as a no-op under fresh references too.
    const clonedRef = tx.apply([structuredClone(r1)]);
    expect(clonedRef.accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'r1', 't1']);
  });

  it('restores same-segment sibling order via beforeItem after a live-first landing', () => {
    const tx = new AgentTranscript('main');
    const t0: TranscriptOperation = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
    };
    const t1: TranscriptOperation = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'completed', origin: { kind: 'user' } },
    };
    // goal:2 landed live-first (a live op carries no anchor) and sits past
    // t1; the backfill then replays the historical segment [goal:1, goal:2]
    // snapshotToOps-style: the first op chains to its in-segment successor,
    // the last one carries no beforeItem.
    tx.apply([
      t0,
      t1,
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'goal:2', marker: 'goal' } },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 't1', 'goal:2']);

    const backfillA: TranscriptOperation = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'goal:1', marker: 'goal' },
      beforeTurn: 1,
      beforeItem: 'goal:2',
    };
    const backfillB: TranscriptOperation = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'goal:2', marker: 'goal' },
      beforeTurn: 1,
    };
    tx.apply([backfillA, backfillB]);
    // The successor is relocated into the anchored segment first, then the
    // earlier sibling slots in before it — the historical order holds.
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'goal:1', 'goal:2', 't1']);

    // Replaying the anchored pair changes nothing and accepts nothing.
    const replay = tx.apply([backfillA, backfillB]);
    expect(replay.accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'goal:1', 'goal:2', 't1']);
  });

  it('keeps the other same-segment siblings in place on a beforeItem replay', () => {
    const tx = new AgentTranscript('main');
    const m = (id: string, beforeItem?: string): MarkerUpsertOp => ({
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: id, marker: 'goal' },
      beforeTurn: 1,
      beforeItem,
    });
    // Cold order: m1 chained to m2 chained to m3, all before turn 1.
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
      },
      m('m1', 'm2'),
      m('m2', 'm3'),
      m('m3'),
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'completed', origin: { kind: 'user' } },
      },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'm2', 'm3', 't1']);

    // Replaying the head of the chain must not push it (or its successor)
    // past the rest of the segment.
    const replay = tx.apply([m('m1', 'm2')]);
    expect(replay.accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'm1', 'm2', 'm3', 't1']);
  });

  it('falls back to the beforeTurn anchor when the beforeItem successor is unknown', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
      },
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'running', origin: { kind: 'user' } },
      },
    ]);
    // The successor never arrived (partial history): the item lands by its
    // turn anchor alone, exactly like a legacy op.
    const op: TranscriptOperation = {
      op: 'taskref.upsert',
      item: { kind: 'taskref', refId: 'r1', taskId: 'bash-1' },
      beforeTurn: 1,
      beforeItem: 'r-missing',
    };
    tx.apply([op]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'r1', 't1']);
    expect(tx.apply([op]).accepted).toHaveLength(0);
  });

  it('converges a beforeItem chain on first pass under any arrival order', () => {
    const t0: TurnUpsertOp = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
    };
    const t1: TurnUpsertOp = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'completed', origin: { kind: 'user' } },
    };
    // snapshotToOps-style chaining for the segment [A, B, C] before turn 1.
    const chain: Record<string, MarkerUpsertOp> = {
      A: {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'A', marker: 'goal' },
        beforeTurn: 1,
        beforeItem: 'B',
      },
      B: {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'B', marker: 'goal' },
        beforeTurn: 1,
        beforeItem: 'C',
      },
      C: {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'C', marker: 'goal' },
        beforeTurn: 1,
      },
    };
    const permutations: readonly (readonly [string, string, string])[] = [
      ['A', 'B', 'C'],
      ['A', 'C', 'B'],
      ['B', 'A', 'C'],
      ['B', 'C', 'A'],
      ['C', 'A', 'B'],
      ['C', 'B', 'A'],
    ];
    for (const order of permutations) {
      const tx = new AgentTranscript('main');
      tx.apply([t0, t1]);
      // One apply per op, in the permutation's arrival order: the remembered
      // placements must re-derive A,B,C on the first pass, with no replay.
      for (const id of order) tx.apply([chain[id]!]);
      expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'A', 'B', 'C', 't1']);

      // Replaying the same ops — in order, then shuffled through a
      // structuredClone roundtrip — moves nothing and accepts nothing.
      expect(tx.apply(order.map((id) => chain[id]!)).accepted).toHaveLength(0);
      const shuffled = [...order].reverse().map((id) => structuredClone(chain[id]!));
      expect(tx.apply(shuffled).accepted).toHaveLength(0);
      expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'A', 'B', 'C', 't1']);
    }
  });

  it('holds a partial beforeItem chain in arrival order until the missing successor lands', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
      },
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'completed', origin: { kind: 'user' } },
      },
    ]);
    const tail: MarkerUpsertOp = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'C', marker: 'goal' },
      beforeTurn: 1,
    };
    const head: MarkerUpsertOp = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'A', marker: 'goal' },
      beforeTurn: 1,
      beforeItem: 'B',
    };
    // Tail first, then the head whose successor B is still missing: with the
    // chain relation incomplete the current (arrival) order is the fallback.
    tx.apply([tail]);
    tx.apply([head]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'C', 'A', 't1']);
    // The missing middle lands: the remembered A->B->C relations re-derive
    // the historical order on this same pass.
    const middle: MarkerUpsertOp = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'B', marker: 'goal' },
      beforeTurn: 1,
      beforeItem: 'C',
    };
    tx.apply([middle]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'A', 'B', 'C', 't1']);
    // Converged: any replay is a no-op.
    expect(tx.apply([middle, head, tail]).accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'A', 'B', 'C', 't1']);
  });

  it('converges a turn-less segment anchored at ordinal 0 and keeps it ahead of the first turn', () => {
    // snapshotToOps anchors a snapshot without any turn at ordinal 0 (the
    // first visible turn), so the whole segment stays ONE placement group
    // instead of an unanchored live tail.
    const chain: Record<string, MarkerUpsertOp> = {
      A: {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'A', marker: 'goal' },
        beforeTurn: 0,
        beforeItem: 'B',
      },
      B: {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'B', marker: 'goal' },
        beforeTurn: 0,
        beforeItem: 'C',
      },
      C: {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'C', marker: 'goal' },
        beforeTurn: 0,
      },
    };
    const t0: TurnUpsertOp = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'running', origin: { kind: 'user' } },
    };
    const permutations: readonly (readonly [string, string, string])[] = [
      ['A', 'B', 'C'],
      ['A', 'C', 'B'],
      ['B', 'A', 'C'],
      ['B', 'C', 'A'],
      ['C', 'A', 'B'],
      ['C', 'B', 'A'],
    ];
    for (const order of permutations) {
      const tx = new AgentTranscript('main');
      // One apply per op, in the permutation's arrival order: the remembered
      // placements must re-derive A,B,C on the first pass, with no turn
      // present at all.
      for (const id of order) tx.apply([chain[id]!]);
      expect(tx.getItems().map(itemLabel)).toEqual(['A', 'B', 'C']);
      // The first turn lands after the anchored group, not before it.
      tx.apply([t0]);
      expect(tx.getItems().map(itemLabel)).toEqual(['A', 'B', 'C', 't0']);
      // A JSON-roundtripped replay moves nothing and accepts nothing.
      const replayed = JSON.parse(
        JSON.stringify(order.map((id) => chain[id]!)),
      ) as TranscriptOperation[];
      expect(tx.apply(replayed).accepted).toHaveLength(0);
      expect(tx.getItems().map(itemLabel)).toEqual(['A', 'B', 'C', 't0']);
    }
  });

  it('consumes remembered placements when the anchored turns arrive', () => {
    const tx = new AgentTranscript('main');
    const turn = (n: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: `t${n}`, ordinal: n, state: 'completed', origin: { kind: 'user' } },
    });
    const marker = (id: string, beforeTurn: number): MarkerUpsertOp => ({
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: id, marker: 'goal' },
      beforeTurn,
    });
    // The groups land before their anchor turns exist: they wait at the tail.
    tx.apply([turn(0), marker('G1', 1), marker('G2', 2)]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G1', 'G2']);
    // Each arriving turn pulls its anchored group back ahead of itself.
    tx.apply([turn(1)]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G1', 't1', 'G2']);
    tx.apply([turn(2)]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G1', 't1', 'G2', 't2']);
    // Header replays stay no-ops — normalization never manufactures a change.
    expect(tx.apply([turn(1)]).accepted).toHaveLength(0);
    expect(tx.apply([turn(2)]).accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G1', 't1', 'G2', 't2']);
  });

  it('consumes placements when a skeleton turn arrives via step or frame', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'G1', marker: 'goal' }, beforeTurn: 1 },
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'G2', marker: 'goal' }, beforeTurn: 2 },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['G1', 'G2']);
    // A step for a not-yet-seen turn auto-vivifies it — the anchored group
    // slots ahead of the skeleton on the same pass.
    tx.apply([
      {
        op: 'step.upsert',
        turnId: 't1',
        step: { kind: 'step', stepId: 't1.1', turnId: 't1', ordinal: 1, state: 'running' },
      },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['G1', 't1', 'G2']);
    // Same for a frame-first arrival.
    tx.apply([
      {
        op: 'frame.upsert',
        turnId: 't2',
        stepId: 't2.1',
        frame: { kind: 'thinking', frameId: 't2.1.f1', text: 'x' } satisfies ThinkingFrame,
      },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['G1', 't1', 'G2', 't2']);
  });

  it('re-slots anchored groups when a turn ordinal update moves their boundary', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'running', origin: { kind: 'user' } },
      },
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'G', marker: 'goal' }, beforeTurn: 1 },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G']);
    // The ordinal correction moves the boundary itself: the group anchored at
    // ordinal 1 now belongs ahead of this turn.
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 1, state: 'running', origin: { kind: 'user' } },
      },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['G', 't0']);
  });

  it('re-sorts the timeline when a turn ordinal update crosses another turn', () => {
    const tx = new AgentTranscript('main');
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    tx.apply([
      turn('a', 0),
      turn('b', 2),
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'G', marker: 'goal' }, beforeTurn: 2 },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['a', 'G', 'b']);

    // The correction moves `a` past `b`: an in-place replace would leave the
    // turns out of ordinal order, so the turn is re-inserted at its new
    // ordinal and the anchored group re-derives against the new boundaries.
    tx.apply([turn('a', 3)]);
    const items = tx.getItems();
    expect(items.map(itemLabel)).toEqual(['G', 'b', 'a']);
    expect(
      items.filter((i) => i.kind === 'turn').map((i) => i.kind === 'turn' && i.ordinal),
    ).toEqual([2, 3]);

    // Replaying the same header is a no-op: nothing moves, nothing is accepted.
    expect(tx.apply([turn('a', 3)]).accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['G', 'b', 'a']);
  });

  it('carries the trailing live segment along when a turn ordinal update moves the turn forward', () => {
    const tx = new AgentTranscript('main');
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    // Placement-less (live) standalone items trailing a turn belong to that
    // turn's segment: when the ordinal correction moves the turn past `b`,
    // they must follow it instead of being stranded ahead of `b`.
    tx.apply([
      turn('a', 0),
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'L', marker: 'skill' } },
      { op: 'taskref.upsert', item: { kind: 'taskref', refId: 'R', taskId: 'task-1' } },
      turn('b', 1),
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['a', 'L', 'R', 'b']);

    tx.apply([turn('a', 2)]);
    const items = tx.getItems();
    expect(items.map(itemLabel)).toEqual(['b', 'a', 'L', 'R']);
    expect(
      items.filter((i) => i.kind === 'turn').map((i) => i.kind === 'turn' && i.ordinal),
    ).toEqual([1, 2]);

    // Replaying the same header is a no-op: nothing moves, nothing is accepted.
    expect(tx.apply([turn('a', 2)]).accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['b', 'a', 'L', 'R']);
  });

  it('carries the trailing live segment along when a turn ordinal update moves the turn backward', () => {
    const tx = new AgentTranscript('main');
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    tx.apply([
      turn('a', 2),
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'L', marker: 'skill' } },
      turn('b', 3),
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['a', 'L', 'b']);

    tx.apply([turn('a', 0)]);
    const items = tx.getItems();
    expect(items.map(itemLabel)).toEqual(['a', 'L', 'b']);
    expect(
      items.filter((i) => i.kind === 'turn').map((i) => i.kind === 'turn' && i.ordinal),
    ).toEqual([0, 3]);

    // Replaying the same header is a no-op: nothing moves, nothing is accepted.
    expect(tx.apply([turn('a', 0)]).accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['a', 'L', 'b']);
  });

  it('carries the live segment past an anchored item sitting inside the gap', () => {
    const tx = new AgentTranscript('main');
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    // An anchored marker inside the gap must not stop the scan: the
    // placement-less `L` beyond it still belongs to `a`'s live segment.
    tx.apply([
      turn('a', 0),
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'H', marker: 'goal' }, beforeTurn: 1 },
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'L', marker: 'skill' } },
      turn('b', 1),
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['a', 'H', 'L', 'b']);

    // Moving `a` past `b`: `H` stays pinned by its absolute beforeTurn anchor
    // ahead of `b`, while `L` follows its turn.
    tx.apply([turn('a', 2)]);
    const items = tx.getItems();
    expect(items.map(itemLabel)).toEqual(['H', 'b', 'a', 'L']);
    expect(
      items.filter((i) => i.kind === 'turn').map((i) => i.kind === 'turn' && i.ordinal),
    ).toEqual([1, 2]);

    // Replaying the same header is a no-op: nothing moves, nothing is accepted.
    expect(tx.apply([turn('a', 2)]).accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['H', 'b', 'a', 'L']);

    // Moving back: `L` follows `a` forward again; inside the reopened gap the
    // anchored `H` still takes precedence over the unplaced `L`, restoring the
    // original layout exactly.
    tx.apply([turn('a', 0)]);
    expect(tx.getItems().map(itemLabel)).toEqual(['a', 'H', 'L', 'b']);
  });

  it('applies ops to a hand-built legacy state without standalonePlacements', () => {
    // States constructed before the reducer gained its placement memory (or
    // by hand in external stores) never carried the field: the reducer must
    // read it as empty instead of crashing on `.get`/`.has` of undefined.
    const legacyState: AgentState = {
      items: [],
      tasks: new Map(),
      interactions: new Map(),
      attachments: new Map(),
      todos: new Map(),
      prompts: new Map(),
      meta: {},
      pendingInteractions: new Set(),
      hasMoreOlder: false,
    };
    const marked = applyOperation(legacyState, {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'legacy', marker: 'notice' },
    });
    expect(marked.changed).toBe(true);
    expect(marked.state.items.map(itemLabel)).toEqual(['legacy']);

    const turned = applyOperation(legacyState, {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'running', origin: { kind: 'user' } },
    });
    expect(turned.changed).toBe(true);
    expect(turned.state.items.map(itemLabel)).toEqual(['t0']);
  });

  it('slots an anchored group ahead of unplaced live items within its segment', () => {
    const tx = new AgentTranscript('main');
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
      },
    ]);
    // A live item lands while the backfill is still reading: no placement.
    tx.apply([{ op: 'marker.upsert', item: { kind: 'marker', markerId: 'L', marker: 'skill' } }]);
    // The historical segment then backfills anchored before turn 1: inside
    // the same gap it takes precedence over the unplaced live item, without
    // displacing the live item from its gap.
    tx.apply([
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'H', marker: 'goal' }, beforeTurn: 1 },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'H', 'L']);
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'running', origin: { kind: 'user' } },
      },
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'H', 'L', 't1']);
  });

  it('items.remove clears successor edges into the drop set, even with no item left', () => {
    const t0: TurnUpsertOp = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
    };
    const t1: TurnUpsertOp = {
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId: 't1', ordinal: 1, state: 'completed', origin: { kind: 'user' } },
    };
    const marker = (id: string, beforeItem?: string): MarkerUpsertOp => ({
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: id, marker: 'goal' },
      beforeTurn: 1,
      beforeItem,
    });

    // A -> B chained; removing B must drop A's dangling edge to it.
    const tx = new AgentTranscript('main');
    tx.apply([t0, t1, marker('A', 'B'), marker('B')]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'A', 'B', 't1']);
    tx.apply([{ op: 'items.remove', ids: ['B'] }]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'A', 't1']);
    // B re-anchors, now claiming the head of the segment: had the stale
    // A -> B edge survived, the cycle fallback would pin the old order.
    tx.apply([marker('B', 'A')]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'B', 'A', 't1']);

    // The edge can also outlive its target entirely (it never arrived): a
    // remove that deletes no item still cleans the hidden placement, so the
    // op is accepted rather than dropped as a no-op.
    const hidden = new AgentTranscript('main');
    hidden.apply([t0, t1, marker('A', 'ghost')]);
    expect(hidden.getItems().map(itemLabel)).toEqual(['t0', 'A', 't1']);
    const cleaned = hidden.apply([{ op: 'items.remove', ids: ['ghost'] }]);
    expect(cleaned.accepted).toHaveLength(1);
    hidden.apply([marker('ghost', 'A')]);
    expect(hidden.getItems().map(itemLabel)).toEqual(['t0', 'ghost', 'A', 't1']);

    // A remove touching neither items nor placements stays a no-op.
    expect(hidden.apply([{ op: 'items.remove', ids: ['never-seen'] }]).accepted).toHaveLength(0);
  });

  it('absorbs a legacy beforeItem-only upsert as a tail item without leaking the orphan anchor', () => {
    // Pre-contract ops could carry beforeItem without beforeTurn (the wire
    // schema now rejects that shape); the reducer stays tolerant: the item
    // lands in the anchor-less tail group like a live append, and the orphan
    // edge never reaches the snapshot continuation.
    const tx = new AgentTranscript('main');
    tx.apply([
      {
        op: 'turn.upsert',
        turn: { kind: 'turn', turnId: 't0', ordinal: 0, state: 'completed', origin: { kind: 'user' } },
      },
      {
        op: 'marker.upsert',
        item: { kind: 'marker', markerId: 'A', marker: 'goal' },
        beforeItem: 'B',
      },
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'B', marker: 'skill' } },
    ]);
    // The orphan edge cannot pull B into a segment: A flushes in the
    // anchor-less tail group, after the gap's placement-less live items.
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'B', 'A']);

    // No anchor survives projection: the continuation ships nothing — a
    // beforeItem-only entry would fail the wire schema.
    const snapshot = tx.snapshot();
    expect(snapshot.continuation).toBeUndefined();
    const wire = JSON.parse(JSON.stringify(snapshot)) as AgentTranscriptSnapshot;
    expect(agentTranscriptSnapshotSchema.safeParse(wire).success).toBe(true);
  });

  it('items.remove drops a placement whose only anchor was the removed successor', () => {
    const freshState = (): AgentState => ({
      items: [],
      tasks: new Map(),
      interactions: new Map(),
      attachments: new Map(),
      todos: new Map(),
      prompts: new Map(),
      meta: {},
      pendingInteractions: new Set(),
      hasMoreOlder: false,
      standalonePlacements: new Map(),
    });
    const placed = applyOperation(freshState(), {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'A', marker: 'goal' },
      beforeItem: 'B',
    });
    expect(placed.state.standalonePlacements?.get('A')).toEqual({ beforeItem: 'B' });

    // B never arrived: the remove touches only the hidden placement, which
    // dies with its only anchor instead of lingering as an anchor-less entry.
    const removed = applyOperation(placed.state, { op: 'items.remove', ids: ['B'] });
    expect(removed.changed).toBe(true);
    expect(removed.state.standalonePlacements?.has('A')).toBe(false);
    expect(removed.state.items.map(itemLabel)).toEqual(['A']);

    // A turn-anchored survivor keeps its anchor; only the dangling edge cuts.
    const anchored = applyOperation(freshState(), {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'C', marker: 'goal' },
      beforeTurn: 1,
      beforeItem: 'B',
    });
    const cleaned = applyOperation(anchored.state, { op: 'items.remove', ids: ['B'] });
    expect(cleaned.changed).toBe(true);
    expect(cleaned.state.standalonePlacements?.get('C')).toEqual({ beforeTurn: 1 });
  });

  it('items.remove re-normalizes the merged gap and keeps anchored replays no-ops', () => {
    const turn = (turnId: string, ordinal: number): TurnUpsertOp => ({
      op: 'turn.upsert',
      turn: { kind: 'turn', turnId, ordinal, state: 'completed', origin: { kind: 'user' } },
    });
    const h: MarkerUpsertOp = {
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'H', marker: 'goal' },
      beforeTurn: 2,
    };
    const tx = new AgentTranscript('main');
    tx.apply([
      turn('t0', 0),
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'G', marker: 'goal' }, beforeTurn: 1 },
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'L1', marker: 'skill' } },
      turn('t1', 1),
      h,
      { op: 'marker.upsert', item: { kind: 'marker', markerId: 'L2', marker: 'skill' } },
      turn('t2', 2),
    ]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G', 'L1', 't1', 'H', 'L2', 't2']);

    // Removing t1 merges the two gaps it separated: the surviving placements
    // re-derive the combined segment — anchored groups first in ascending
    // anchor order, then the live items in their relative order.
    tx.apply([{ op: 'items.remove', ids: ['t1'] }]);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G', 'H', 'L1', 'L2', 't2']);

    // A duplicate anchored op landing on the merged gap is absorbed: nothing
    // accepted, order stable — also through a fresh-reference replay.
    expect(tx.apply([h]).accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G', 'H', 'L1', 'L2', 't2']);
    expect(tx.apply([structuredClone(h)]).accepted).toHaveLength(0);
    expect(tx.getItems().map(itemLabel)).toEqual(['t0', 'G', 'H', 'L1', 'L2', 't2']);
  });

  it('absorbs a JSON-replayed goal clear marker as an exact duplicate', () => {
    // A clear mutation carries no status: the canonical payload must not own
    // a `status: undefined` key, or the JSON roundtrip (which drops such
    // keys) would stop comparing equal and a replay would spuriously land.
    const marker = goalMarkerFromMutation({ id: 'm-clear', at: 1000, kind: 'clear', goalId: 'g1' });
    expect(marker.payload).toEqual({
      version: 1,
      mutationId: 'm-clear',
      kind: 'clear',
      goalId: 'g1',
    });
    expect(Object.hasOwn(marker.payload as object, 'status')).toBe(false);

    const tx = new AgentTranscript('main');
    const anchored: TranscriptOperation = { op: 'marker.upsert', item: marker, beforeTurn: 1 };
    tx.apply([anchored]);
    const replayedAnchored = JSON.parse(JSON.stringify(anchored)) as TranscriptOperation;
    expect(tx.apply([replayedAnchored]).accepted).toHaveLength(0);
    // The unanchored (live-style) duplicate replays as a no-op too.
    const unanchored: TranscriptOperation = { op: 'marker.upsert', item: marker };
    const replayedUnanchored = JSON.parse(JSON.stringify(unanchored)) as TranscriptOperation;
    expect(tx.apply([replayedUnanchored]).accepted).toHaveLength(0);
    expect(tx.getItems()).toHaveLength(1);
  });

  it('never structurally equates non-plain payloads such as Date', () => {
    // deepEqual only recurses into plain objects: two distinct Date instances
    // (no enumerable keys) must not be called equal, or a payload refresh
    // would be swallowed as a duplicate.
    const tx = new AgentTranscript('main');
    const dated = (ms: number): TranscriptOperation => ({
      op: 'marker.upsert',
      item: { kind: 'marker', markerId: 'd1', marker: 'notice', payload: new Date(ms) },
    });
    tx.apply([dated(1000)]);
    const replaced = tx.apply([dated(2000)]);
    expect(replaced.accepted).toHaveLength(1);
    const item = tx.getItems()[0];
    expect(item?.kind === 'marker' && item.payload instanceof Date && item.payload.getTime()).toBe(
      2000,
    );
  });

  it('appends standalone items without an anchor at the end (live order)', () => {
    const tx = new AgentTranscript('main');
    tx.apply([turn1, { op: 'marker.upsert', item: { kind: 'marker', markerId: 'm9', marker: 'notice' } }]);
    const items = tx.getItems();
    expect(items.at(-1)?.kind).toBe('marker');
  });

  it('re-applies tool frames when metadata-only fields change', () => {
    const tx = new AgentTranscript('main');
    tx.apply(toolFrame('running'));
    // Same state/output but a corrected input (e.g. a live/backfill
    // reconciliation): the upsert must not be dropped as a no-op.
    const corrected: TranscriptOperation[] = [
      turn1,
      {
        op: 'step.upsert',
        turnId: 't1',
        step: { kind: 'step', stepId: 't1.1', turnId: 't1', ordinal: 1, state: 'running' },
      },
      {
        op: 'frame.upsert',
        turnId: 't1',
        stepId: 't1.1',
        frame: {
          kind: 'tool',
          frameId: 't1.1.call_1',
          toolCallId: 'call_1',
          name: 'Read',
          state: 'running',
          input: { path: '/b' },
        } satisfies ToolCallFrame,
      },
    ];
    tx.apply(corrected);
    const turn = tx.getTurn('t1');
    const frame = turn?.steps[0]?.frames.find((f) => f.kind === 'tool');
    expect(frame?.kind === 'tool' && frame.input).toEqual({ path: '/b' });
  });
});

describe('normalizeStandaloneItems', () => {
  const turn = (n: number): TranscriptItem => ({
    kind: 'turn',
    turnId: `t${n}`,
    ordinal: n,
    state: 'completed',
    origin: { kind: 'user' },
    steps: [],
  });
  const marker = (id: string): TranscriptItem => ({ kind: 'marker', markerId: id, marker: 'goal' });

  it('re-derives the segment layout from placements without touching the map', () => {
    // A REST-prepend-style merge: the older page's fresh turn sits ahead of
    // the window, and the already-loaded H gains its anchor only now.
    const items: TranscriptItem[] = [turn(0), turn(1), turn(2), marker('H')];
    const placements: ReadonlyMap<string, StandalonePlacement> = new Map([
      ['H', { beforeTurn: 1 }],
    ]);
    const normalized = normalizeStandaloneItems(items, placements);
    expect(normalized.map(itemLabel)).toEqual(['t0', 'H', 't1', 't2']);
    // Read-only: normalization never writes the placement memory…
    expect(placements).toEqual(new Map([['H', { beforeTurn: 1 }]]));
    // …and an already-canonical layout returns the same reference, so a
    // converged merge stays a no-op for the caller.
    expect(normalizeStandaloneItems(normalized, placements)).toBe(normalized);
    // No placements at all: the window is trusted as-is.
    expect(normalizeStandaloneItems(items, undefined)).toBe(items);
  });
});

describe('TranscriptStore', () => {
  it('lazily creates agent transcripts and tracks the roster', () => {
    const store = new TranscriptStore('s1');
    expect(store.getAgent('main')).toBeUndefined();
    const tx = store.ensureAgent('main', { agentId: 'main', type: 'main' });
    expect(store.getAgent('main')).toBe(tx);
    const rosters: number[] = [];
    store.onRosterChange((agents) => rosters.push(agents.length));
    store.ensureAgent('sub-1', { agentId: 'sub-1', type: 'sub', parentAgentId: 'main' });
    store.removeAgent('sub-1');
    expect(rosters).toEqual([2, 1]);
    expect(store.agents().map((a) => a.agentId)).toEqual(['main']);
  });

  it('markDisposed stamps disposedAt on the existing descriptor only', () => {
    const store = new TranscriptStore('s1');
    store.ensureAgent('main', { agentId: 'main', type: 'main' });

    // Never-announced agents must not gain a roster entry.
    store.markDisposed('ghost', '2026-07-20T00:00:00.000Z');
    expect(store.agents().map((a) => a.agentId)).toEqual(['main']);

    const rosters: Array<readonly string[]> = [];
    store.onRosterChange((agents) => rosters.push(agents.map((a) => a.agentId)));
    store.markDisposed('main', '2026-07-20T01:00:00.000Z');
    expect(rosters).toEqual([['main']]);
    expect(store.agents()[0]).toMatchObject({
      agentId: 'main',
      type: 'main',
      disposedAt: '2026-07-20T01:00:00.000Z',
    });

    // Idempotent: the first stamp wins and no roster re-emit fires.
    store.markDisposed('main', '2026-07-20T02:00:00.000Z');
    expect(store.agents()[0]?.disposedAt).toBe('2026-07-20T01:00:00.000Z');
    expect(rosters).toHaveLength(1);
  });
});
