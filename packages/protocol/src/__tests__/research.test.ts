import { describe, it, expect } from 'vitest';

import {
  researchCommandRequestSchema,
  researchStatusSnapshotSchema,
} from '../research';
import {
  agentEventSchema,
  aitpModeUpdatedEventSchema,
  researchUpdatedEventSchema,
} from '../events';

const validSnapshot = {
  mode: 'inactive',
  loopStatus: 'active',
  questions: [],
  lines: [],
  openQuestionCount: 0,
  activeQuestionCount: 0,
  blockedQuestionCount: 0,
  alerts: [],
  aitpHealth: { phase: 'inactive' },
  revision: 0,
};

describe('researchStatusSnapshotSchema', () => {
  it('accepts a minimal valid snapshot', () => {
    const parsed = researchStatusSnapshotSchema.parse(validSnapshot);
    expect(parsed.mode).toBe('inactive');
    expect(parsed.revision).toBe(0);
  });

  it('accepts a full snapshot with questions and lines', () => {
    const full = {
      mode: 'ready',
      loopStatus: 'active',
      currentLineSlug: 'main-line',
      currentFocus: { questionId: 'q1', boundedAction: 'run exp-A', revision: 1 },
      currentQuestion: {
        id: 'q1',
        lineSlug: 'main-line',
        wording: 'What is the mechanism?',
        assessment: 'candidate mechanism',
        priority: 1,
        neededEvidence: ['exp-A'],
        evidenceRefs: [],
        falsifierRefs: [],
        workflow: 'active',
        epistemic: 'candidate',
        persistence: 'working',
        revision: 1,
      },
      questions: [
        {
          id: 'q1',
          lineSlug: 'main-line',
          wording: 'What is the mechanism?',
          assessment: 'candidate mechanism',
          priority: 1,
          neededEvidence: ['exp-A'],
          evidenceRefs: [],
          falsifierRefs: [],
          workflow: 'active',
          epistemic: 'candidate',
          persistence: 'working',
          revision: 1,
        },
      ],
      lines: [
        {
          slug: 'main-line',
          title: 'Main Line',
          assessment: 'primary line',
          status: 'active',
          createdAt: 1000,
          revision: 1,
        },
      ],
      openQuestionCount: 0,
      activeQuestionCount: 1,
      blockedQuestionCount: 0,
      alerts: [],
      aitpHealth: { phase: 'ready', contractVersion: '1.0' },
      pendingCheckpoint: {
        checkpointId: 'cp1',
        questionId: 'q1',
        lineSlug: 'main-line',
        assessment: 'persist candidate mechanism',
        nextAction: 'run exp-A',
        idempotencyKey: 'key-1',
        persistence: 'pending_commit',
        createdAt: 1000,
      },
      revision: 5,
    };
    const parsed = researchStatusSnapshotSchema.parse(full);
    expect(parsed.currentQuestion?.id).toBe('q1');
    expect(parsed.aitpHealth.contractVersion).toBe('1.0');
  });

  it('rejects an invalid mode enum', () => {
    expect(() =>
      researchStatusSnapshotSchema.parse({ ...validSnapshot, mode: 'unknown' }),
    ).toThrow();
  });

  it('rejects a missing aitpHealth field', () => {
    const { aitpHealth: _drop, ...rest } = validSnapshot;
    void _drop;
    expect(() => researchStatusSnapshotSchema.parse(rest)).toThrow();
  });
});

describe('researchUpdatedEventSchema', () => {
  it('accepts a valid research.updated event', () => {
    const event = { type: 'research.updated', snapshot: validSnapshot };
    const parsed = researchUpdatedEventSchema.parse(event);
    expect(parsed).toEqual(event);
    expect(parsed.type).toBe('research.updated');
    expect(parsed.snapshot.revision).toBe(0);
  });

  it('round-trips through JSON', () => {
    const event = { type: 'research.updated', snapshot: validSnapshot };
    const json = JSON.stringify(event);
    const parsed = researchUpdatedEventSchema.parse(JSON.parse(json));
    expect(parsed).toEqual(event);
  });

  it('rejects a wrong event type', () => {
    expect(() =>
      researchUpdatedEventSchema.parse({ type: 'goal.updated', snapshot: validSnapshot }),
    ).toThrow();
  });

  it('is part of the agentEventSchema union', () => {
    const parsed = agentEventSchema.parse({
      type: 'research.updated',
      snapshot: validSnapshot,
    });
    expect(parsed.type).toBe('research.updated');
  });
});

describe('aitpModeUpdatedEventSchema', () => {
  it('accepts a valid aitp_mode.updated event', () => {
    const event = { type: 'aitp_mode.updated' };
    const parsed = aitpModeUpdatedEventSchema.parse(event);
    expect(parsed).toEqual(event);
    expect(parsed.type).toBe('aitp_mode.updated');
  });

  it('round-trips through JSON', () => {
    const event = { type: 'aitp_mode.updated' };
    const json = JSON.stringify(event);
    const parsed = aitpModeUpdatedEventSchema.parse(JSON.parse(json));
    expect(parsed).toEqual(event);
  });

  it('is part of the agentEventSchema union', () => {
    const parsed = agentEventSchema.parse({ type: 'aitp_mode.updated' });
    expect(parsed.type).toBe('aitp_mode.updated');
  });
});

describe('researchCommandRequestSchema', () => {
  it('accepts an enter_mode command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: { kind: 'enter_mode', actor: 'user' },
    });
    expect(parsed.command.kind).toBe('enter_mode');
  });

  it('accepts a create_question command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'create_question',
        lineSlug: 'main',
        wording: 'Why?',
        assessment: 'candidate mechanism',
      },
    });
    expect(parsed.command.kind).toBe('create_question');
  });

  it('accepts an update_line command with assessment and optimistic revision', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'update_line',
        lineSlug: 'main',
        expectedRevision: 4,
        title: 'Updated line',
        assessment: 'supported direction',
        status: 'paused',
        reason: 'new evidence',
      },
    });
    expect(parsed.command.kind).toBe('update_line');
  });

  it('accepts a set_focus command with boundedAction and expectedRevision', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'set_focus',
        questionId: 'q1',
        boundedAction: 'run the next experiment',
        expectedRevision: 3,
      },
    });
    expect(parsed.command).toMatchObject({ boundedAction: 'run the next experiment', expectedRevision: 3 });
  });

  it('preserves both questionId and lineSlug on a related checkpoint command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'propose_checkpoint',
        questionId: 'q1',
        lineSlug: 'main',
        assessment: 'supported mechanism',
        nextAction: 'commit the result',
      },
    });
    expect(parsed.command).toMatchObject({
      questionId: 'q1',
      lineSlug: 'main',
      assessment: 'supported mechanism',
      nextAction: 'commit the result',
    });
  });

  it('accepts a commit_checkpoint command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'commit_checkpoint',
        checkpointId: 'cp1',
        entryId: 'entry-1',
      },
    });
    expect(parsed.command.kind).toBe('commit_checkpoint');
  });

  it('accepts a pause_loop command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: { kind: 'pause_loop', expectedRevision: 3 },
    });
    expect(parsed.command.kind).toBe('pause_loop');
  });

  it('rejects an unknown command kind', () => {
    expect(() =>
      researchCommandRequestSchema.parse({ command: { kind: 'unknown' } }),
    ).toThrow();
  });

  it('rejects a missing command field', () => {
    expect(() => researchCommandRequestSchema.parse({})).toThrow();
  });

  it('rejects a create_question missing required lineSlug', () => {
    expect(() =>
      researchCommandRequestSchema.parse({
        command: { kind: 'create_question', wording: 'Why?' },
      }),
    ).toThrow();
  });
});
