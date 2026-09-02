/**
 * `WsConnectionV1` — outbound send buffer: coalescing of high-frequency
 * volatile text deltas, batch flush, backpressure deferral, and close flush.
 */

import type { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REMOTE_ACCESS_FORBIDDEN_CODE } from '../src/middleware/remoteAccess';
import type { IConnectionRegistry } from '../src/transport/ws/connectionRegistry';
import type { SessionEventBroadcaster } from '../src/transport/ws/v1/sessionEventBroadcaster';
import type { EventEnvelope } from '../src/transport/ws/v1/sessionEventJournal';
import {
  type WsConnectionV1Options,
  WsConnectionV1,
  coalesceFrames,
} from '../src/transport/ws/v1/wsConnectionV1';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeSocket {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  private readonly handlers = new Map<string, Array<(...a: unknown[]) => void>>();

  on(event: string, cb: (...a: unknown[]) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = this.CLOSED;
    this.emit('close');
  }

  terminate(): void {
    this.readyState = this.CLOSED;
    this.emit('close');
  }

  emit(event: string, ...a: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...a);
  }

  frames(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

function makeBroadcaster(): SessionEventBroadcaster {
  return {
    subscribe: async () => true,
    unsubscribe: () => {},
    addGlobalTarget: () => {},
    removeGlobalTarget: () => {},
    getCursor: async () => ({ seq: 0, epoch: '' }),
    getBufferedSince: async () => ({
      events: [],
      resyncRequired: false,
      currentSeq: 0,
      epoch: '',
    }),
  } as unknown as SessionEventBroadcaster;
}

function makeRegistry(): IConnectionRegistry {
  return {
    add: () => {},
    remove: () => {},
    get: () => undefined,
    values: () => [],
    closeAll: () => {},
    size: () => 0,
  };
}

function makeConn(socket: FakeSocket, opts: Partial<WsConnectionV1Options> = {}): WsConnectionV1 {
  return new WsConnectionV1({
    socket: socket as unknown as WebSocket,
    broadcaster: makeBroadcaster(),
    connectionRegistry: makeRegistry(),
    remoteAddress: null,
    userAgent: null,
    ...opts,
  });
}

function delta(
  sessionId: string,
  agentId: string,
  turnId: number,
  text: string,
  offset: number,
  type: 'assistant.delta' | 'thinking.delta' = 'assistant.delta',
) {
  return {
    type,
    seq: 1,
    volatile: true as const,
    offset,
    session_id: sessionId,
    timestamp: '2026-01-01T00:00:00.000Z',
    payload: { type, agentId, sessionId, turnId, delta: text },
  };
}

function durable(type: string, sessionId: string, seq: number) {
  return {
    type,
    seq,
    session_id: sessionId,
    timestamp: '2026-01-01T00:00:00.000Z',
    payload: { type, agentId: 'main', sessionId },
  };
}

// ---------------------------------------------------------------------------
// coalesceFrames — pure
// ---------------------------------------------------------------------------

describe('coalesceFrames', () => {
  it('merges adjacent compatible assistant deltas', () => {
    const out = coalesceFrames([
      delta('s1', 'main', 1, 'Hello', 0),
      delta('s1', 'main', 1, ' ', 5),
      delta('s1', 'main', 1, 'world', 6),
    ]);
    expect(out).toHaveLength(1);
    const f = out[0] as { offset: number; volatile: boolean; seq: number; payload: { delta: string } };
    expect(f.payload.delta).toBe('Hello world');
    expect(f.offset).toBe(0);
    expect(f.volatile).toBe(true);
    expect(f.seq).toBe(1);
  });

  it('does not merge across a durable frame', () => {
    const out = coalesceFrames([
      delta('s1', 'main', 1, 'a', 0),
      durable('turn.ended', 's1', 2),
      delta('s1', 'main', 1, 'b', 1),
    ]);
    expect(out).toHaveLength(3);
    expect((out[0] as { payload: { delta: string } }).payload.delta).toBe('a');
    expect((out[1] as { type: string }).type).toBe('turn.ended');
    expect((out[2] as { payload: { delta: string } }).payload.delta).toBe('b');
  });

  it('does not merge different delta types', () => {
    const out = coalesceFrames([
      delta('s1', 'main', 1, 'hi', 0, 'assistant.delta'),
      delta('s1', 'main', 1, 'think', 0, 'thinking.delta'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('does not merge deltas from different sessions / agents / turns', () => {
    expect(
      coalesceFrames([delta('s1', 'main', 1, 'a', 0), delta('s2', 'main', 1, 'b', 0)]),
    ).toHaveLength(2);
    expect(
      coalesceFrames([delta('s1', 'main', 1, 'a', 0), delta('s1', 'sub', 1, 'b', 0)]),
    ).toHaveLength(2);
    expect(
      coalesceFrames([delta('s1', 'main', 1, 'a', 0), delta('s1', 'main', 2, 'b', 0)]),
    ).toHaveLength(2);
  });

  it('leaves non-volatile and non-text frames untouched', () => {
    const toolCallDelta = {
      type: 'tool.call.delta',
      seq: 1,
      volatile: true as const,
      session_id: 's1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { type: 'tool.call.delta', agentId: 'main', turnId: 1, args: { x: 1 } },
    };
    expect(coalesceFrames([toolCallDelta, toolCallDelta])).toHaveLength(2);
  });

  it('does not mutate the input frames', () => {
    const a = delta('s1', 'main', 1, 'a', 0);
    const b = delta('s1', 'main', 1, 'b', 1);
    const out = coalesceFrames([a, b]);
    expect(out).toHaveLength(1);
    expect(a.payload.delta).toBe('a');
    expect(b.payload.delta).toBe('b');
  });

  it('handles empty and single-element input', () => {
    expect(coalesceFrames([])).toEqual([]);
    const only = delta('s1', 'main', 1, 'x', 0);
    const out = coalesceFrames([only]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(only);
  });
});

// ---------------------------------------------------------------------------
// WsConnectionV1 — transcript subscription parsing
// ---------------------------------------------------------------------------

describe('WsConnectionV1 transcript subscriptions (subscribe_v2)', () => {
  interface SubscribeCall {
    sessionId: string;
    filter: unknown;
    grades: unknown;
    opts?: { deferTranscriptReset?: boolean; transcriptSince?: Record<string, number> };
  }

  function makeCapturingBroadcaster(): {
    broadcaster: SessionEventBroadcaster;
    calls: SubscribeCall[];
    detaches: { sessionId: string; agentIds?: readonly string[] }[];
  } {
    const calls: SubscribeCall[] = [];
    const detaches: { sessionId: string; agentIds?: readonly string[] }[] = [];
    const broadcaster = {
      subscribe: async (
        sessionId: string,
        _target: unknown,
        filter: unknown,
        grades: unknown,
        opts?: { deferTranscriptReset?: boolean; transcriptSince?: Record<string, number> },
      ) => {
        calls.push({ sessionId, filter, grades, opts });
        return true;
      },
      unsubscribe: () => {},
      unsubscribeTranscript: (sessionId: string, _target: unknown, agentIds?: readonly string[]) => {
        detaches.push({ sessionId, agentIds });
      },
      addGlobalTarget: () => {},
      removeGlobalTarget: () => {},
      getCursor: async () => ({ seq: 0, epoch: '' }),
      getBufferedSince: async () => ({
        events: [],
        resyncRequired: false,
        currentSeq: 0,
        epoch: '',
      }),
    } as unknown as SessionEventBroadcaster;
    return { broadcaster, calls, detaches };
  }

  function controlFrame(type: string, payload: Record<string, unknown>): string {
    return JSON.stringify({ type, id: 'req-1', payload });
  }

  it('forwards subscribe_v2 grades and transcript_since to the broadcaster and stores them per session', async () => {
    const socket = new FakeSocket();
    const { broadcaster, calls } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit(
      'message',
      controlFrame('subscribe_v2', {
        session_id: 's1',
        transcript: { '*': 'delta' },
        transcript_since: { main: 7, '*': 3 },
      }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0]).toMatchObject({
      sessionId: 's1',
      grades: { '*': 'delta' },
      opts: { transcriptSince: { main: 7, '*': 3 } },
    });
    expect(conn.subscriptions.get('s1')).toEqual({
      agentFilter: undefined,
      transcriptGrades: { '*': 'delta' },
    });
    await vi.waitFor(() =>
      expect(socket.sent.some((f) => JSON.parse(f).type === 'ack')).toBe(true),
    );
    const ack = socket.sent.map((f) => JSON.parse(f)).find((f) => f.type === 'ack');
    expect(ack).toMatchObject({ code: 0, payload: { accepted: ['s1'], not_found: [] } });
    conn.close();
  });

  it('ignores legacy transcript fields on client_hello and subscribe', async () => {
    const socket = new FakeSocket();
    const { broadcaster, calls } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit(
      'message',
      controlFrame('client_hello', {
        client_id: 'c1',
        subscriptions: ['s1'],
        transcript: { s1: { '*': 'delta' } },
        transcript_since: { s1: { main: 7 } },
      }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ sessionId: 's1', grades: undefined });
    expect(calls[0]!.opts?.transcriptSince).toBeUndefined();
    expect(conn.subscriptions.get('s1')).toEqual({
      agentFilter: undefined,
      transcriptGrades: undefined,
    });

    socket.emit(
      'message',
      controlFrame('subscribe', {
        session_ids: ['s2'],
        transcript: { s2: { '*': 'delta' } },
      }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ sessionId: 's2', grades: undefined });
    expect(conn.subscriptions.get('s2')).toEqual({
      agentFilter: undefined,
      transcriptGrades: undefined,
    });
    conn.close();
  });

  it('acks an invalid subscribe_v2 payload with an error and does not attach', async () => {
    const socket = new FakeSocket();
    const { broadcaster, calls } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit(
      'message',
      controlFrame('subscribe_v2', {
        session_id: 's1',
        transcript: { main: 'everything' },
      }),
    );
    await vi.waitFor(() =>
      expect(socket.sent.some((f) => JSON.parse(f).type === 'ack')).toBe(true),
    );

    expect(calls).toHaveLength(0);
    expect(conn.subscriptions.size).toBe(0);
    const ack = socket.sent.map((f) => JSON.parse(f)).find((f) => f.type === 'ack');
    expect(ack.code).toBe(1);
    conn.close();
  });

  it('preserves the existing agent filter when subscribe_v2 updates the grades', async () => {
    const socket = new FakeSocket();
    const { broadcaster, calls } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit(
      'message',
      controlFrame('subscribe', { session_ids: ['s1'], agent_filter: { s1: ['main'] } }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    socket.emit(
      'message',
      controlFrame('subscribe_v2', { session_id: 's1', transcript: { main: 'block' } }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    expect(calls[1]).toMatchObject({ sessionId: 's1', grades: { main: 'block' } });
    expect(calls[1]!.filter).toEqual(new Set(['main']));
    expect(conn.subscriptions.get('s1')).toEqual({
      agentFilter: new Set(['main']),
      transcriptGrades: { main: 'block' },
    });
    conn.close();
  });

  it('keeps subscribe_v2 grades across a plain re-subscribe and filters the cursor replay through them', async () => {
    const socket = new FakeSocket();
    const backlog = [
      durable('turn.started', 's1', 3),
      durable('assistant.delta', 's1', 4),
      durable('event.session.work_changed', 's1', 5),
    ];
    // Mirror the real broadcaster's replay crop: with a transcript grade spec
    // the projected types drop out, retained (global/lifecycle) events stay.
    // The dedicated suppression coverage lives in sessionEventBroadcaster's
    // tests — here we only verify the preserved grade spec reaches
    // `getBufferedSince`.
    const PROJECTED = new Set(['turn.started', 'assistant.delta']);
    let seenGrades: unknown;
    const broadcaster = {
      subscribe: async (
        _sid: string,
        target: { send: (e: unknown) => void },
        _filter: unknown,
        _grades: unknown,
        opts?: { deferTranscriptReset?: boolean },
      ) => {
        if (opts?.deferTranscriptReset !== true) {
          target.send({ type: 'transcript.reset', seq: 10, session_id: 's1', payload: {} });
        }
        return true;
      },
      flushTranscriptSeed: async (_sid: string, target: { send: (e: unknown) => void }) => {
        target.send({ type: 'transcript.reset', seq: 10, session_id: 's1', payload: {} });
      },
      unsubscribe: () => {},
      addGlobalTarget: () => {},
      removeGlobalTarget: () => {},
      getCursor: async () => ({ seq: 10, epoch: 'e1' }),
      getBufferedSince: async (_sid: string, _cursor: unknown, _filter: unknown, grades: unknown) => {
        seenGrades = grades;
        return {
          events: backlog
            .filter((envelope) => grades === undefined || !PROJECTED.has(envelope.type))
            .map((envelope) => ({ seq: envelope.seq, envelope })),
          resyncRequired: false,
          currentSeq: 10,
          epoch: 'e1',
        };
      },
    } as unknown as SessionEventBroadcaster;
    const conn = makeConn(socket, { broadcaster, flushIntervalMs: 1 });

    // Grades arrive via subscribe_v2 first (no cursor → immediate baseline)…
    socket.emit(
      'message',
      controlFrame('subscribe_v2', { session_id: 's1', transcript: { '*': 'delta' } }),
    );
    await vi.waitFor(() => {
      const types = socket.frames().map((f) => (f as { type: string }).type);
      expect(types).toContain('transcript.reset');
    });
    expect(conn.subscriptions.get('s1')?.transcriptGrades).toEqual({ '*': 'delta' });

    // …then a plain re-subscribe with a durable cursor must not wipe them.
    socket.emit(
      'message',
      controlFrame('subscribe', {
        session_ids: ['s1'],
        cursors: { s1: { seq: 2, epoch: 'e1' } },
      }),
    );
    await vi.waitFor(() => expect(seenGrades).toEqual({ '*': 'delta' }));
    expect(conn.subscriptions.get('s1')?.transcriptGrades).toEqual({ '*': 'delta' });

    const types = socket.frames().map((f) => (f as { type: string }).type);
    // The replay is filtered through the preserved grades: projected events
    // are suppressed; only the retained global event replays, and the
    // deferred baseline reset lands after it.
    expect(types).not.toContain('turn.started');
    expect(types).not.toContain('assistant.delta');
    expect(
      types.slice(types.indexOf('event.session.work_changed'), types.lastIndexOf('transcript.reset') + 1),
    ).toEqual(['event.session.work_changed', 'transcript.reset']);
    conn.close();
  });

  it('reports an unknown session in the subscribe_v2 ack not_found list', async () => {
    const socket = new FakeSocket();
    const { broadcaster } = makeCapturingBroadcaster();
    broadcaster.subscribe = async () => false;
    const conn = makeConn(socket, { broadcaster });

    socket.emit(
      'message',
      controlFrame('subscribe_v2', { session_id: 'gone', transcript: { '*': 'delta' } }),
    );
    await vi.waitFor(() =>
      expect(socket.sent.some((f) => JSON.parse(f).type === 'ack')).toBe(true),
    );

    const ack = socket.sent.map((f) => JSON.parse(f)).find((f) => f.type === 'ack');
    expect(ack).toMatchObject({ code: 0, payload: { accepted: [], not_found: ['gone'] } });
    expect(conn.subscriptions.size).toBe(0);
    conn.close();
  });

  it('unsubscribe_v2 detaches listed agents with an explicit off, keeping the filter and other grades', async () => {
    const socket = new FakeSocket();
    const { broadcaster, calls, detaches } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit(
      'message',
      controlFrame('subscribe', { session_ids: ['s1'], agent_filter: { s1: ['main'] } }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    socket.emit(
      'message',
      controlFrame('subscribe_v2', { session_id: 's1', transcript: { '*': 'delta' } }),
    );
    await vi.waitFor(() =>
      expect(conn.subscriptions.get('s1')?.transcriptGrades).toEqual({ '*': 'delta' }),
    );

    socket.emit(
      'message',
      controlFrame('unsubscribe_v2', { session_id: 's1', agent_ids: ['main'] }),
    );
    await vi.waitFor(() => expect(detaches).toHaveLength(1));

    expect(detaches[0]).toEqual({ sessionId: 's1', agentIds: ['main'] });
    // An explicit 'off' — deleting the key would fall back to the '*' default.
    expect(conn.subscriptions.get('s1')).toEqual({
      agentFilter: new Set(['main']),
      transcriptGrades: { '*': 'delta', main: 'off' },
    });
    const ack = socket.sent.map((f) => JSON.parse(f)).findLast((f) => f.type === 'ack');
    expect(ack).toMatchObject({ code: 0, payload: { accepted: ['s1'], not_found: [] } });
    conn.close();
  });

  it('unsubscribe_v2 without agent_ids detaches the whole transcript stream', async () => {
    const socket = new FakeSocket();
    const { broadcaster, detaches } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit(
      'message',
      controlFrame('subscribe_v2', { session_id: 's1', transcript: { '*': 'delta' } }),
    );
    await vi.waitFor(() =>
      expect(conn.subscriptions.get('s1')?.transcriptGrades).toEqual({ '*': 'delta' }),
    );

    socket.emit('message', controlFrame('unsubscribe_v2', { session_id: 's1' }));
    await vi.waitFor(() => expect(detaches).toHaveLength(1));

    expect(detaches[0]).toEqual({ sessionId: 's1', agentIds: undefined });
    expect(conn.subscriptions.get('s1')).toEqual({
      agentFilter: undefined,
      transcriptGrades: undefined,
    });
    conn.close();
  });

  it('unsubscribe_v2 is idempotent for an unsubscribed session and never touches the broadcaster', async () => {
    const socket = new FakeSocket();
    const { broadcaster, calls, detaches } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit('message', controlFrame('unsubscribe_v2', { session_id: 's1' }));
    await vi.waitFor(() =>
      expect(socket.sent.some((f) => JSON.parse(f).type === 'ack')).toBe(true),
    );

    expect(calls).toHaveLength(0);
    expect(detaches).toHaveLength(0);
    const ack = socket.sent.map((f) => JSON.parse(f)).find((f) => f.type === 'ack');
    expect(ack).toMatchObject({ code: 0, payload: { accepted: ['s1'] } });
    conn.close();
  });

  it('acks an invalid unsubscribe_v2 payload with an error', async () => {
    const socket = new FakeSocket();
    const { broadcaster, detaches } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit('message', controlFrame('unsubscribe_v2', { agent_ids: ['main'] }));
    socket.emit(
      'message',
      controlFrame('unsubscribe_v2', { session_id: 's1', agent_ids: [] }),
    );
    await vi.waitFor(() =>
      expect(socket.sent.filter((f) => JSON.parse(f).type === 'ack')).toHaveLength(2),
    );

    expect(detaches).toHaveLength(0);
    const acks = socket.sent.map((f) => JSON.parse(f)).filter((f) => f.type === 'ack');
    expect(acks.every((a) => a.code === 1)).toBe(true);
    conn.close();
  });

  it('serializes back-to-back control frames: subscribe then subscribe_v2 lands filter and grades', async () => {
    const socket = new FakeSocket();
    const { broadcaster, calls } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    // No awaits between the frames — the second handler reads state the
    // first one stores, so they must run in receive order.
    socket.emit(
      'message',
      controlFrame('subscribe', { session_ids: ['s1'], agent_filter: { s1: ['main'] } }),
    );
    socket.emit(
      'message',
      controlFrame('subscribe_v2', { session_id: 's1', transcript: { '*': 'delta' } }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    expect(conn.subscriptions.get('s1')).toEqual({
      agentFilter: new Set(['main']),
      transcriptGrades: { '*': 'delta' },
    });
    conn.close();
  });

  it('re-subscribes an agent at full grade after it was detached', async () => {
    const socket = new FakeSocket();
    const { broadcaster, calls } = makeCapturingBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    socket.emit(
      'message',
      controlFrame('subscribe_v2', { session_id: 's1', transcript: { '*': 'delta' } }),
    );
    socket.emit('message', controlFrame('unsubscribe_v2', { session_id: 's1' }));
    await vi.waitFor(() =>
      expect(conn.subscriptions.get('s1')?.transcriptGrades).toBeUndefined(),
    );

    socket.emit(
      'message',
      controlFrame('subscribe_v2', { session_id: 's1', transcript: { main: 'turn' } }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    expect(calls[1]).toMatchObject({ sessionId: 's1', grades: { main: 'turn' } });
    expect(conn.subscriptions.get('s1')?.transcriptGrades).toEqual({ main: 'turn' });
    conn.close();
  });
});

// ---------------------------------------------------------------------------
// WsConnectionV1 — flush / backpressure / close
// ---------------------------------------------------------------------------

describe('WsConnectionV1 outbound buffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends server_hello immediately', () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { flushIntervalMs: 16 });
    expect(socket.frames().map((f) => (f as { type: string }).type)).toEqual(['server_hello']);
    conn.close();
  });

  it('buffers subscribe_v2 transcript frames without merging them', async () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { flushIntervalMs: 16 });
    socket.sent = [];

    conn.send(durable('transcript.reset', 's1', 7));
    conn.send(durable('transcript.ops', 's1', 8));
    expect(socket.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(15);
    expect(socket.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    const frames = socket.frames() as Array<{ type: string; seq: number }>;
    expect(frames.map((frame) => frame.type)).toEqual(['transcript.reset', 'transcript.ops']);
    expect(frames.map((frame) => frame.seq)).toEqual([7, 8]);
    conn.close();
  });

  it('coalesces adjacent subscribed deltas into one socket.send', async () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { flushIntervalMs: 16 });
    socket.sent = [];

    conn.send(delta('s1', 'main', 1, 'Hello', 0));
    conn.send(delta('s1', 'main', 1, ' ', 5));
    conn.send(delta('s1', 'main', 1, 'world', 6));
    expect(socket.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(16);

    const frames = socket.frames();
    expect(frames).toHaveLength(1);
    const f = frames[0] as { type: string; offset: number; payload: { delta: string } };
    expect(f.type).toBe('assistant.delta');
    expect(f.offset).toBe(0);
    expect(f.payload.delta).toBe('Hello world');
    conn.close();
  });

  it('sends public events immediately and preserves FIFO with subscribed events', async () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { flushIntervalMs: 16 });
    socket.sent = [];

    conn.send(delta('s1', 'main', 1, 'before', 0));
    expect(socket.sent).toHaveLength(0);
    conn.send(durable('event.session.work_changed', 's1', 2), 'immediate');

    expect(socket.frames().map((f) => (f as { type: string }).type)).toEqual([
      'assistant.delta',
      'event.session.work_changed',
    ]);
    await vi.advanceTimersByTimeAsync(16);
    expect(socket.sent).toHaveLength(2);
    conn.close();
  });

  it('flushes immediately once the subscribed batch reaches maxBatchSize', () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { flushIntervalMs: 1000, maxBatchSize: 3 });
    socket.sent = [];

    conn.send(delta('s1', 'main', 1, 'a', 0));
    conn.send(delta('s1', 'main', 1, 'b', 1));
    conn.send(delta('s1', 'main', 1, 'c', 2));

    const frames = socket.frames();
    expect(frames).toHaveLength(1);
    expect((frames[0] as { payload: { delta: string } }).payload.delta).toBe('abc');
    conn.close();
  });

  it('defers flushing while the peer is above the watermark, then coalesces on drain', async () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, {
      flushIntervalMs: 16,
      highWaterMarkBytes: 100,
    });
    socket.sent = [];

    socket.bufferedAmount = 200;
    conn.send(delta('s1', 'main', 1, 'Hello', 0));
    await vi.advanceTimersByTimeAsync(16);
    expect(socket.sent).toHaveLength(0);

    conn.send(delta('s1', 'main', 1, ' world', 5));
    await vi.advanceTimersByTimeAsync(5);
    expect(socket.sent).toHaveLength(0);

    socket.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(5);
    const frames = socket.frames();
    expect(frames).toHaveLength(1);
    expect((frames[0] as { payload: { delta: string } }).payload.delta).toBe('Hello world');
    conn.close();
  });

  it('force-flushes buffered subscription frames on close', () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { flushIntervalMs: 1000 });
    socket.sent = [];

    conn.send(delta('s1', 'main', 1, 'tail', 0));
    expect(socket.sent).toHaveLength(0);

    conn.close();
    const frames = socket.frames();
    expect(frames).toHaveLength(1);
    expect((frames[0] as { payload: { delta: string } }).payload.delta).toBe('tail');
  });

  it('drops buffered frames when the socket is already closed at flush time', async () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { flushIntervalMs: 16 });
    socket.sent = [];

    socket.readyState = socket.CLOSED;
    conn.send(delta('s1', 'main', 1, 'lost', 0));
    await vi.advanceTimersByTimeAsync(16);
    expect(socket.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// WsConnectionV1 — heartbeat
// ---------------------------------------------------------------------------

describe('WsConnectionV1 heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function sentTypes(socket: FakeSocket): string[] {
    return socket.frames().map((f) => (f as { type: string }).type);
  }

  function sentPings(socket: FakeSocket): Array<{ type: string; payload: { nonce: string } }> {
    return socket.frames() as Array<{ type: string; payload: { nonce: string } }>;
  }

  it('advertises the heartbeat interval in server_hello', () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { heartbeatIntervalMs: 10 });
    const hello = socket.frames()[0] as { type: string; payload: { heartbeat_ms?: number } };
    expect(hello.type).toBe('server_hello');
    expect(hello.payload.heartbeat_ms).toBe(10);
    conn.close();
  });

  it('defaults to a 10s heartbeat interval', () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket);
    const hello = socket.frames()[0] as { payload: { heartbeat_ms?: number } };
    expect(hello.payload.heartbeat_ms).toBe(10_000);
    conn.close();
  });

  it('sends a ping every interval while the peer keeps answering', () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { heartbeatIntervalMs: 10 });
    socket.sent = [];

    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(10);
      expect(sentTypes(socket)).toHaveLength(i + 1);
      socket.emit('message', JSON.stringify({ type: 'pong', payload: { nonce: 'n' } }));
    }

    const pings = sentPings(socket);
    expect(pings.every((f) => f.type === 'ping')).toBe(true);
    expect(typeof pings[0]!.payload.nonce).toBe('string');
    expect(new Set(pings.map((f) => f.payload.nonce)).size).toBe(3);
    expect(socket.closeCalls).toHaveLength(0);
    conn.close();
  });

  it('reaps the connection after two silent cycles', () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { heartbeatIntervalMs: 10 });
    socket.sent = [];

    vi.advanceTimersByTime(10);
    expect(sentTypes(socket)).toEqual(['ping']);
    expect(socket.closeCalls).toHaveLength(0);

    // Second silent cycle: the tick closes instead of pinging again.
    vi.advanceTimersByTime(10);
    expect(socket.closeCalls).toEqual([{ code: 1001, reason: 'heartbeat timeout' }]);
    expect(sentTypes(socket)).toEqual(['ping']);

    // The heartbeat stops with the connection.
    vi.advanceTimersByTime(100);
    expect(sentTypes(socket)).toEqual(['ping']);
    expect(socket.closeCalls).toHaveLength(1);
  });

  it('treats any inbound frame — not just pong — as proof of life', () => {
    const socket = new FakeSocket();
    const conn = makeConn(socket, { heartbeatIntervalMs: 10 });
    socket.sent = [];

    // t=10: ping. t=15: an unknown control frame still resets the window.
    vi.advanceTimersByTime(15);
    socket.emit('message', JSON.stringify({ type: 'some_future_frame', payload: {} }));

    // t=20 (silence 5) and t=30 (silence 15): pings, no reap.
    vi.advanceTimersByTime(20);
    expect(sentTypes(socket)).toEqual(['ping', 'ping', 'ping']);
    expect(socket.closeCalls).toHaveLength(0);

    // t=40: silence 25 ≥ 2 cycles — reaped.
    vi.advanceTimersByTime(5);
    expect(socket.closeCalls).toEqual([{ code: 1001, reason: 'heartbeat timeout' }]);
  });

  it('stops heartbeating once the socket closes on its own', () => {
    const socket = new FakeSocket();
    makeConn(socket, { heartbeatIntervalMs: 10 });
    socket.sent = [];

    vi.advanceTimersByTime(10);
    expect(sentTypes(socket)).toEqual(['ping']);

    socket.terminate();
    vi.advanceTimersByTime(100);
    expect(sentTypes(socket)).toEqual(['ping']);
    expect(socket.closeCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// WsConnectionV1 — global-event registration lifecycle
// ---------------------------------------------------------------------------

describe('WsConnectionV1 global target registration', () => {
  function makeGlobalTargetBroadcaster() {
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const diOptIns: unknown[] = [];
    const broadcaster = {
      subscribe: async () => true,
      unsubscribe: () => {},
      addGlobalTarget: (target: unknown) => added.push(target),
      removeGlobalTarget: (target: unknown) => removed.push(target),
      addDiEventTarget: (target: unknown) => diOptIns.push(target),
      getCursor: async () => ({ seq: 0, epoch: '' }),
      getBufferedSince: async () => ({
        events: [],
        resyncRequired: false,
        currentSeq: 0,
        epoch: '',
      }),
    } as unknown as SessionEventBroadcaster;
    return { broadcaster, added, removed, diOptIns };
  }

  it('registers the connection as a global target on construction and unregisters on close', () => {
    const socket = new FakeSocket();
    const { broadcaster, added, removed } = makeGlobalTargetBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    expect(added).toEqual([conn]);
    expect(removed).toEqual([]);

    conn.close();
    expect(removed).toEqual([conn]);
  });

  it('unregisters when the socket closes on its own', () => {
    const socket = new FakeSocket();
    const { broadcaster, added, removed } = makeGlobalTargetBroadcaster();
    const conn = makeConn(socket, { broadcaster });
    expect(added).toEqual([conn]);

    socket.emit('close');
    expect(removed).toEqual([conn]);
  });

  it('opts only kimi-inspect connections into the event.di.* debug feed on client_hello', async () => {
    const socket = new FakeSocket();
    const { broadcaster, diOptIns } = makeGlobalTargetBroadcaster();
    const conn = makeConn(socket, { broadcaster });

    // Another client id (or none) never joins the DI fan-out.
    socket.emit(
      'message',
      JSON.stringify({ type: 'client_hello', id: 'h1', payload: { client_id: 'kimi-web' } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(diOptIns).toEqual([]);

    socket.emit(
      'message',
      JSON.stringify({
        type: 'client_hello',
        id: 'h2',
        payload: { client_id: 'kimi-inspect' },
      }),
    );
    await vi.waitFor(() => expect(diOptIns).toEqual([conn]));
    conn.close();
  });
});

// ---------------------------------------------------------------------------
// WsConnectionV1 — remote session boundary
// ---------------------------------------------------------------------------

describe('WsConnectionV1 remote session boundary', () => {
  function remoteBroadcaster(replayEvents: readonly EventEnvelope[] = []) {
    const subscriptions: string[] = [];
    const diOptIns: unknown[] = [];
    const broadcaster = {
      subscribe: async (sessionId: string) => {
        subscriptions.push(sessionId);
        return true;
      },
      unsubscribe: () => {},
      unsubscribeTranscript: () => {},
      addGlobalTarget: () => {},
      removeGlobalTarget: () => {},
      addDiEventTarget: (target: unknown) => diOptIns.push(target),
      getCursor: async () => ({ seq: 0, epoch: 'remote' }),
      getBufferedSince: async () => ({
        events: replayEvents.map((envelope) => ({ seq: envelope.seq, envelope })),
        resyncRequired: false,
        currentSeq: replayEvents.at(-1)?.seq ?? 0,
        epoch: 'remote',
      }),
    } as unknown as SessionEventBroadcaster;
    return { broadcaster, subscriptions, diOptIns };
  }

  it('accepts only the shared session across legacy and transcript subscriptions', async () => {
    const socket = new FakeSocket();
    const { broadcaster, subscriptions, diOptIns } = remoteBroadcaster();
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
    });
    socket.sent = [];

    socket.emit(
      'message',
      JSON.stringify({
        type: 'client_hello',
        id: 'hello',
        payload: { client_id: 'kimi-inspect', subscriptions: ['shared'] },
      }),
    );
    await vi.waitFor(() => {
      expect(subscriptions).toEqual(['shared']);
    });
    expect(diOptIns).toEqual([]);

    socket.emit(
      'message',
      JSON.stringify({
        type: 'subscribe_v2',
        id: 'transcript-shared',
        payload: { session_id: 'shared', transcript: { '*': 'delta' } },
      }),
    );
    await vi.waitFor(() => {
      expect(subscriptions).toEqual(['shared', 'shared']);
    });

    socket.emit(
      'message',
      JSON.stringify({
        type: 'subscribe',
        id: 'foreign',
        payload: { session_ids: ['foreign'] },
      }),
    );
    socket.emit(
      'message',
      JSON.stringify({
        type: 'subscribe_v2',
        id: 'foreign-v2',
        payload: { session_id: 'foreign', transcript: { '*': 'delta' } },
      }),
    );
    await vi.waitFor(() => {
      const denied = socket
        .frames()
        .filter(
          (frame) =>
            (frame as { type?: string; code?: number }).type === 'ack' &&
            (frame as { code?: number }).code === REMOTE_ACCESS_FORBIDDEN_CODE,
        );
      expect(denied).toHaveLength(2);
    });
    expect(subscriptions).toEqual(['shared', 'shared']);
    expect(conn.subscriptionSessionIds).toEqual(['shared']);
    conn.close();
  });

  it('applies the remote projection to durable cursor replay', async () => {
    const replayEvents: EventEnvelope[] = [
      {
        ...durable('hook.result', 'shared', 1),
        payload: { type: 'hook.result', content: 'REPLAY_HOOK_SECRET' },
      },
      {
        ...durable('permission.approval.requested', 'shared', 2),
        payload: {
          type: 'permission.approval.requested',
          action: 'Running: cat /srv/private REPLAY_APPROVAL_SECRET',
          toolInput: { token: 'REPLAY_TOKEN_SECRET' },
        },
      },
      {
        ...durable('event.session.work_changed', 'shared', 3),
        payload: {
          type: 'event.session.work_changed',
          agentId: 'main',
          sessionId: 'shared',
          busy: true,
          main_turn_active: true,
          pending_interaction: 'none',
        },
      },
    ];
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster(replayEvents);
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
    });
    socket.sent = [];

    socket.emit(
      'message',
      JSON.stringify({
        type: 'subscribe',
        id: 'remote-replay',
        payload: {
          session_ids: ['shared'],
          cursors: { shared: { seq: 0, epoch: 'remote' } },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(socket.frames()).toContainEqual(
        expect.objectContaining({
          type: 'event.session.work_changed',
          payload: expect.objectContaining({ busy: true, main_turn_active: true }),
        }),
      );
    });
    const serialized = JSON.stringify(socket.frames());
    expect(serialized).not.toContain('REPLAY_HOOK_SECRET');
    expect(serialized).not.toContain('REPLAY_APPROVAL_SECRET');
    expect(serialized).not.toContain('REPLAY_TOKEN_SECRET');
    conn.close();
  });

  it('rejects fs watches without invoking the workspace watcher', async () => {
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster();
    const addWatch = vi.fn();
    const removeWatch = vi.fn();
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
      fsWatchBridge: { addWatch, removeWatch, detachConnection: () => {} } as never,
    });
    socket.sent = [];

    socket.emit(
      'message',
      JSON.stringify({
        type: 'watch_fs_add',
        id: 'watch',
        payload: { session_id: 'shared', paths: ['/private/path'] },
      }),
    );
    await vi.waitFor(() => {
      expect(socket.frames()).toContainEqual(
        expect.objectContaining({ type: 'ack', code: REMOTE_ACCESS_FORBIDDEN_CODE }),
      );
    });
    expect(addWatch).not.toHaveBeenCalled();
    expect(removeWatch).not.toHaveBeenCalled();
    conn.close();
  });

  it('drops shared-session shell/task output and sanitizes process lifecycle events', () => {
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster();
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
    });
    socket.sent = [];

    conn.send(
      {
        ...durable('shell.output', 'shared', 1),
        payload: {
          type: 'shell.output',
          agentId: 'main',
          sessionId: 'shared',
          commandId: 'cmd-1',
          update: { kind: 'stdout', text: 'secret from /home/example/private.log' },
        },
      },
      'immediate',
    );
    conn.send(
      {
        ...durable('tool.progress', 'shared', 2),
        payload: {
          type: 'tool.progress',
          agentId: 'main',
          sessionId: 'shared',
          toolCallId: 'call-1',
          update: { kind: 'progress', text: 'reading /tmp/private', percent: 50 },
        },
      },
      'immediate',
    );
    conn.send(
      {
        ...durable('task.output.chunk', 'shared', 3),
        payload: { type: 'task.output.chunk', taskId: 'task-1', text: 'secret chunk' },
      },
      'immediate',
    );
    conn.send(
      {
        ...durable('task.started', 'shared', 4),
        payload: {
          type: 'task.started',
          agentId: 'main',
          sessionId: 'shared',
          info: {
            taskId: 'task-1',
            kind: 'process',
            status: 'running',
            description: 'Running: cat /home/example/private.log LIFECYCLE_DESCRIPTION_SECRET',
            detached: true,
            command: 'cat /home/example/private.log',
            pid: 4242,
            output: 'secret output',
            path: '/home/example/private.log',
            startedAt: 1,
            endedAt: null,
          },
        },
      },
      'immediate',
    );

    const frames = socket.frames() as Array<{ type: string; payload: Record<string, unknown> }>;
    expect(frames.map((frame) => frame.type)).toEqual(['task.started']);
    expect(frames[0]).toMatchObject({
      payload: {
        type: 'task.started',
        agentId: 'main',
        sessionId: 'shared',
        info: {
          taskId: 'task-1',
          kind: 'process',
          status: 'running',
          description: 'Running shell task',
          detached: true,
        },
      },
    });
    const serialized = JSON.stringify(frames);
    expect(serialized).not.toContain('command');
    expect(serialized).not.toContain('pid');
    expect(serialized).not.toContain('secret output');
    expect(serialized).not.toContain('/home/example');
    conn.close();
  });

  it('drops internal approval, hook, and unknown payloads by default', () => {
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster();
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
    });
    socket.sent = [];

    for (const [type, payload] of [
      [
        'permission.approval.requested',
        {
          action: 'Running: cat /srv/private PERMISSION_ACTION_SECRET',
          display: { detail: 'PERMISSION_DISPLAY_SECRET' },
          toolInput: { content: 'PERMISSION_CONTENT_SECRET', token: 'PERMISSION_TOKEN_SECRET' },
        },
      ],
      [
        'permission.approval.resolved',
        {
          action: 'Running: cat /srv/private PERMISSION_RESOLVED_SECRET',
          toolInput: { old_string: 'PERMISSION_OLD_SECRET', new_string: 'PERMISSION_NEW_SECRET' },
        },
      ],
      [
        'hook.result',
        {
          content: 'HOOK_CONTENT_SECRET',
          prompt: 'HOOK_PROMPT_SECRET',
          args: { token: 'HOOK_TOKEN_SECRET' },
          detail: 'HOOK_DETAIL_SECRET',
        },
      ],
      [
        'custom.remote.event',
        {
          content: 'CUSTOM_CONTENT_SECRET',
          display: { before: 'CUSTOM_BEFORE_SECRET', after: 'CUSTOM_AFTER_SECRET' },
          secret: 'CUSTOM_SECRET',
        },
      ],
    ] as const) {
      conn.send(
        {
          ...durable(type, 'shared', 20),
          payload: { type, agentId: 'main', sessionId: 'shared', ...payload },
        },
        'immediate',
      );
    }
    conn.send(
      {
        ...durable('event.session.work_changed', 'shared', 21),
        payload: {
          type: 'event.session.work_changed',
          agentId: 'main',
          sessionId: 'shared',
          busy: true,
          main_turn_active: true,
          pending_interaction: 'none',
        },
      },
      'immediate',
    );
    conn.send(
      {
        ...durable('turn.started', 'shared', 22),
        payload: {
          type: 'turn.started',
          agentId: 'main',
          sessionId: 'shared',
          turnId: 1,
          prompt: 'TURN_PROMPT_SECRET',
          origin: {
            kind: 'skill_activation',
            commandArgs: 'COMMAND_ARGS_SECRET',
            skillActivations: [{ skill: 'example', skillArgs: 'SKILL_ARGS_SECRET' }],
          },
        },
      },
      'immediate',
    );

    expect(socket.frames()).toEqual([
      expect.objectContaining({
        type: 'event.session.work_changed',
        payload: expect.objectContaining({ busy: true, main_turn_active: true }),
      }),
      expect.objectContaining({
        type: 'turn.started',
        payload: expect.objectContaining({
          turnId: 1,
          origin: {
            kind: 'skill_activation',
            skillActivations: [{ skill: 'example' }],
          },
        }),
      }),
    ]);
    const serialized = JSON.stringify(socket.frames());
    expect(serialized).not.toContain('SECRET');
    conn.close();
  });

  it('keeps remote question text while replacing approval action and input', () => {
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster();
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
    });
    socket.sent = [];

    conn.send(
      {
        ...durable('event.approval.requested', 'shared', 5),
        payload: {
          type: 'event.approval.requested',
          session_id: 'shared',
          approval_id: 'approval-1',
          tool_name: 'Bash',
          action: 'Running: cat /home/example/action.md APPROVAL_ACTION_SECRET',
          tool_input_display: {
            kind: 'command',
            command: 'cat /srv/remote-private/action.log',
            cwd: '/srv/remote-private',
            content: 'APPROVAL_CONTENT_SECRET',
            old_string: 'APPROVAL_OLD_SECRET',
            new_string: 'APPROVAL_NEW_SECRET',
            prompt: 'APPROVAL_PROMPT_SECRET',
            args: { token: 'APPROVAL_TOKEN_SECRET' },
            detail: 'APPROVAL_DETAIL_SECRET',
          },
        },
      },
      'immediate',
    );
    conn.send(
      {
        ...durable('event.question.requested', 'shared', 6),
        payload: {
          type: 'event.question.requested',
          session_id: 'shared',
          question_id: 'question-1',
          created_at: '2026-01-01T00:00:00.000Z',
          questions: [
            {
              id: 'q_0',
              question: 'Open /home/example/question.md?',
              options: [
                { id: 'yes', label: 'Use C:\\Users\\Example\\answer.txt' },
                { id: 'no', label: 'Skip /home/example/question.md' },
              ],
            },
          ],
        },
      },
      'immediate',
    );

    const frames = socket.frames();
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      payload: {
        tool_name: 'Bash',
        action: 'Review tool request',
        tool_input_display: '[details omitted]',
      },
    });
    expect(frames[1]).toMatchObject({
      payload: {
        questions: [
          {
            question: 'Open /home/example/question.md?',
            options: [
              { label: 'Use C:\\Users\\Example\\answer.txt' },
              { label: 'Skip /home/example/question.md' },
            ],
          },
        ],
      },
    });
    const serialized = JSON.stringify(frames);
    for (const secret of [
      'APPROVAL_ACTION_SECRET',
      'APPROVAL_CONTENT_SECRET',
      'APPROVAL_OLD_SECRET',
      'APPROVAL_NEW_SECRET',
      'APPROVAL_PROMPT_SECRET',
      'APPROVAL_TOKEN_SECRET',
      'APPROVAL_DETAIL_SECRET',
      '/srv/remote-private',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    conn.close();
  });

  it('projects transcript opaque fields while preserving ordinary text remotely', () => {
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster();
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
    });
    socket.sent = [];

    conn.send(
      {
        ...durable('transcript.ops', 'shared', 5),
        payload: {
          type: 'transcript.ops',
          agent_id: 'main',
          seq: 9,
          ops: [
            {
              op: 'append',
              target: { type: 'task', taskId: 'task-1' },
              offset: 0,
              text: 'private task output /tmp/task.log',
            },
            {
              op: 'task.upsert',
              task: {
                taskId: 'task-1',
                kind: 'shell',
                state: 'running',
                detached: true,
                description: 'Running: cat /srv/remote-private/task.log TRANSCRIPT_TASK_SECRET',
                outputTail: 'private task output',
                resultSummary: 'wrote /tmp/task.log',
                error: 'failed at /srv/remote-private/task',
              },
            },
            {
              op: 'frame.upsert',
              turnId: 't1',
              stepId: 't1.s1',
              frame: {
                kind: 'tool',
                frameId: 't1.s1.call-1',
                toolCallId: 'call-1',
                name: 'Bash',
                state: 'running',
                input: { command: 'cat /srv/remote-private/tool.log' },
                output: 'private output',
                progress: { kind: 'stdout', text: 'private chunk' },
                taskId: 'task-1',
              },
            },
            {
              op: 'frame.upsert',
              turnId: 't1',
              stepId: 't1.s1',
              frame: {
                kind: 'text',
                frameId: 't1.s1.f1',
                role: 'assistant',
                text: 'assistant keeps /home/example/assistant.txt readable',
              },
            },
            {
              op: 'frame.upsert',
              turnId: 't1',
              stepId: 't1.s1',
              frame: {
                kind: 'thinking',
                frameId: 't1.s1.f2',
                text: 'thinking keeps C:\\Users\\Example\\thinking.txt readable',
              },
            },
            {
              op: 'turn.upsert',
              turn: {
                kind: 'turn',
                turnId: 't1',
                ordinal: 1,
                state: 'running',
                origin: {
                  kind: 'user',
                  payload: { path: '/srv/remote-private/origin.json', label: 'user prompt' },
                },
                prompt: 'turn prompt keeps /home/example/turn.md readable',
                attachmentIds: ['attachment-private'],
              },
            },
            {
              op: 'prompt.upsert',
              prompt: {
                promptId: 'prompt-1',
                status: 'queued',
                content: [
                  {
                    type: 'text',
                    text: 'prompt keeps /home/example/prompt.md and C:\\Users\\Example\\prompt.txt readable',
                  },
                  {
                    type: 'image_url',
                    imageUrl: { url: 'https://media.example.test/prompt.png' },
                  },
                ],
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            },
            {
              op: 'interaction.upsert',
              interaction: {
                interactionId: 'approval-1',
                interactionKind: 'approval',
                toolCallId: 'call-1',
                state: 'pending',
                request: {
                  toolCallId: 'call-1',
                  toolName: 'Bash',
                  action: 'Running: cat /home/example/approval.md TRANSCRIPT_APPROVAL_ACTION_SECRET',
                  display: {
                    kind: 'command',
                    command: 'cat /srv/remote-private/approval.log',
                    cwd: '/srv/remote-private',
                    content: 'TRANSCRIPT_APPROVAL_CONTENT_SECRET',
                    before: 'TRANSCRIPT_APPROVAL_BEFORE_SECRET',
                    after: 'TRANSCRIPT_APPROVAL_AFTER_SECRET',
                    old_string: 'TRANSCRIPT_APPROVAL_OLD_SECRET',
                    new_string: 'TRANSCRIPT_APPROVAL_NEW_SECRET',
                    prompt: 'TRANSCRIPT_APPROVAL_PROMPT_SECRET',
                    args: { token: 'TRANSCRIPT_APPROVAL_TOKEN_SECRET' },
                    detail: 'TRANSCRIPT_APPROVAL_DETAIL_SECRET',
                  },
                },
              },
            },
            {
              op: 'interaction.upsert',
              interaction: {
                interactionId: 'question-1',
                interactionKind: 'question',
                state: 'pending',
                request: {
                  id: 'question-1',
                  questions: [
                    {
                      question: 'Use /home/example/question.md?',
                      options: [
                        { label: 'Use C:\\Users\\Example\\answer.txt' },
                        { label: 'Skip /home/example/question.md' },
                      ],
                    },
                  ],
                },
              },
            },
            {
              op: 'marker.upsert',
              item: {
                kind: 'marker',
                markerId: 'marker-private',
                key: 'custom:private',
                payload: {
                  content: 'MARKER_CONTENT_SECRET',
                  prompt: 'MARKER_PROMPT_SECRET',
                  args: { token: 'MARKER_TOKEN_SECRET' },
                  display: { detail: 'MARKER_DETAIL_SECRET' },
                },
              },
            },
            {
              op: 'attachment.upsert',
              attachment: {
                attachmentId: 'attachment-private',
                mediaType: 'image/png',
                source: { kind: 'url', url: 'https://media.example.test/private.png' },
              },
            },
          ],
        },
      },
      'immediate',
    );

    const frame = socket.frames()[0] as {
      payload: { ops: Array<Record<string, unknown>> };
    };
    expect(frame.payload.ops.map((op) => op['op'])).toEqual([
      'task.upsert',
      'frame.upsert',
      'frame.upsert',
      'frame.upsert',
      'prompt.upsert',
    ]);
    expect(frame.payload.ops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: expect.objectContaining({
            taskId: 'task-1',
            state: 'running',
            description: 'Running shell task',
            outputTail: '',
          }),
        }),
        expect.objectContaining({
          frame: expect.objectContaining({
            kind: 'tool',
            toolCallId: 'call-1',
            state: 'running',
            taskId: 'task-1',
          }),
        }),
        expect.objectContaining({
          frame: expect.objectContaining({
            kind: 'text',
            text: 'assistant keeps /home/example/assistant.txt readable',
          }),
        }),
        expect.objectContaining({
          frame: expect.objectContaining({
            kind: 'thinking',
            text: 'thinking keeps C:\\Users\\Example\\thinking.txt readable',
          }),
        }),
      ]),
    );
    const serialized = JSON.stringify(frame);
    expect(serialized).toContain('/home/example/assistant.txt');
    expect(serialized).toContain('C:\\\\Users\\\\Example\\\\thinking.txt');
    expect(serialized).toContain('/home/example/prompt.md');
    expect(serialized).toContain('C:\\\\Users\\\\Example\\\\prompt.txt');
    expect(serialized).not.toContain('private task output');
    expect(serialized).not.toContain('private output');
    expect(serialized).not.toContain('private chunk');
    expect(serialized).not.toContain('/tmp/task.log');
    expect(serialized).not.toContain('/srv/remote-private');
    expect(serialized).not.toContain('"command":');
    expect(serialized).not.toContain('"cwd":');
    expect(serialized).not.toContain('attachment-private');
    expect(serialized).not.toContain('media.example.test');
    for (const secret of [
      'TRANSCRIPT_TASK_SECRET',
      'TRANSCRIPT_APPROVAL_ACTION_SECRET',
      'TRANSCRIPT_APPROVAL_CONTENT_SECRET',
      'TRANSCRIPT_APPROVAL_BEFORE_SECRET',
      'TRANSCRIPT_APPROVAL_AFTER_SECRET',
      'TRANSCRIPT_APPROVAL_OLD_SECRET',
      'TRANSCRIPT_APPROVAL_NEW_SECRET',
      'TRANSCRIPT_APPROVAL_PROMPT_SECRET',
      'TRANSCRIPT_APPROVAL_TOKEN_SECRET',
      'TRANSCRIPT_APPROVAL_DETAIL_SECRET',
      'MARKER_CONTENT_SECRET',
      'MARKER_PROMPT_SECRET',
      'MARKER_TOKEN_SECRET',
      'MARKER_DETAIL_SECRET',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    conn.close();
  });

  it('reconstructs transcript resets without marker, interaction, todo, or meta payloads', () => {
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster();
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
    });
    socket.sent = [];

    conn.send(
      {
        ...durable('transcript.reset', 'shared', 30),
        payload: {
          type: 'transcript.reset',
          agent_id: 'main',
          seq: 7,
          has_more_older: true,
          snapshot: {
            items: [
              {
                kind: 'marker',
                markerId: 'marker-reset',
                key: 'custom:private',
                payload: { content: 'RESET_MARKER_SECRET', token: 'RESET_MARKER_TOKEN' },
              },
            ],
            tasks: [
              {
                taskId: 'task-reset',
                kind: 'shell',
                state: 'running',
                detached: true,
                description: 'Running: cat /srv/private RESET_TASK_SECRET',
                outputTail: 'RESET_OUTPUT_SECRET',
              },
            ],
            interactions: [
              {
                interactionId: 'approval-reset',
                interactionKind: 'approval',
                state: 'pending',
                request: { display: { content: 'RESET_INTERACTION_SECRET' } },
              },
            ],
            attachments: [{ data: 'RESET_ATTACHMENT_SECRET' }],
            todos: [{ content: 'RESET_TODO_SECRET' }],
            prompts: [],
            meta: { custom: { args: 'RESET_META_SECRET' } },
            continuation: { standalonePlacements: [{ detail: 'RESET_CONTINUATION_SECRET' }] },
            hasMoreOlder: true,
          },
        },
      },
      'immediate',
    );

    const frames = socket.frames() as Array<{
      type: string;
      payload: { snapshot: Record<string, unknown> };
    }>;
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      type: 'transcript.reset',
      payload: {
        snapshot: {
          items: [],
          tasks: [expect.objectContaining({ description: 'Running shell task', outputTail: '' })],
          interactions: [],
          attachments: [],
          todos: [],
          prompts: [],
          meta: {},
          hasMoreOlder: true,
        },
      },
    });
    expect(JSON.stringify(frames)).not.toContain('SECRET');
    conn.close();
  });

  it('keeps sensitive event payloads unchanged on an ordinary socket', () => {
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster();
    const conn = makeConn(socket, { broadcaster });
    socket.sent = [];

    const shell = {
      ...durable('shell.output', 'shared', 1),
      payload: {
        type: 'shell.output',
        commandId: 'cmd-1',
        update: { kind: 'stdout', text: 'ordinary output /home/example/private.log' },
      },
    };
    const task = {
      ...durable('task.started', 'shared', 2),
      payload: {
        type: 'task.started',
        info: {
          taskId: 'task-1',
          kind: 'process',
          status: 'running',
          description: 'ordinary build',
          command: 'cat /home/example/private.log',
          pid: 4242,
          output: 'ordinary output',
        },
      },
    };
    conn.send(shell, 'immediate');
    conn.send(task, 'immediate');

    expect(socket.frames()).toEqual([shell, task]);
    conn.close();
  });

  it('filters foreign and __global__ fan-out while preserving shared-session events', () => {
    const socket = new FakeSocket();
    const { broadcaster } = remoteBroadcaster();
    const conn = makeConn(socket, {
      broadcaster,
      remoteAccess: { sessionId: 'shared' },
    });
    socket.sent = [];

    conn.send(durable('event.session.work_changed', 'foreign', 1), 'immediate');
    conn.send(durable('event.config.changed', '__global__', 2), 'immediate');
    conn.send(durable('event.session.work_changed', 'shared', 3), 'immediate');

    expect(socket.frames()).toEqual([
      expect.objectContaining({
        type: 'event.session.work_changed',
        session_id: 'shared',
        seq: 3,
      }),
    ]);
    conn.close();
  });
});
