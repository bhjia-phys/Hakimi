import { describe, expect, it, vi } from 'vitest';

import { Session } from '#/session';
import type { SDKRpcClientBase } from '#/rpc';

function makeSession() {
  const rpc = {
    startAutoresearch: vi.fn(async () => ({ id: 'ar1' })),
    getAutoresearch: vi.fn(async () => ({ autoresearch: null })),
    updateAutoresearch: vi.fn(async () => ({ id: 'ar1' })),
    recordAutoresearchEvent: vi.fn(async () => ({ id: 'ar1' })),
    pauseAutoresearch: vi.fn(async () => ({ id: 'ar1' })),
    resumeAutoresearch: vi.fn(async () => ({ id: 'ar1' })),
    stopAutoresearch: vi.fn(async () => ({ id: 'ar1' })),
    clearSessionHandlers: vi.fn(),
  } as unknown as SDKRpcClientBase;
  const session = new Session({ id: 'ses_research', workDir: '/tmp/work', rpc });
  return { session, rpc };
}

describe('Session autoresearch methods', () => {
  it('startAutoresearch forwards AITP scope with sessionId', async () => {
    const { session, rpc } = makeSession();
    await session.startAutoresearch({
      topicId: 'fqhe',
      objective: 'Audit source support.',
      researchQuestion: 'Does the source establish the claim?',
      operator: 'kimi',
      aitpSessionId: 'aitp-session',
      replace: true,
    });

    expect(rpc.startAutoresearch).toHaveBeenCalledWith({
      sessionId: 'ses_research',
      topicId: 'fqhe',
      objective: 'Audit source support.',
      researchQuestion: 'Does the source establish the claim?',
      operator: 'kimi',
      aitpSessionId: 'aitp-session',
      replace: true,
    });
  });

  it('lifecycle helpers forward sessionId and optional operator metadata', async () => {
    const { session, rpc } = makeSession();
    await session.pauseAutoresearch({ reason: 'Needs approval.' });
    await session.resumeAutoresearch({ operator: 'hakimi' });
    await session.stopAutoresearch({ reason: 'Done enough.', operator: 'human' });

    expect(rpc.pauseAutoresearch).toHaveBeenCalledWith({
      sessionId: 'ses_research',
      reason: 'Needs approval.',
    });
    expect(rpc.resumeAutoresearch).toHaveBeenCalledWith({
      sessionId: 'ses_research',
      operator: 'hakimi',
    });
    expect(rpc.stopAutoresearch).toHaveBeenCalledWith({
      sessionId: 'ses_research',
      reason: 'Done enough.',
      operator: 'human',
    });
  });

  it('event helpers expose explicit AITP process events', async () => {
    const { session, rpc } = makeSession();
    await session.recordAutoresearchEvent({
      eventType: 'operator_checkpoint',
      summary: 'Human approved continuation.',
      operator: 'human',
    });

    expect(rpc.recordAutoresearchEvent).toHaveBeenCalledWith({
      sessionId: 'ses_research',
      eventType: 'operator_checkpoint',
      summary: 'Human approved continuation.',
      operator: 'human',
    });
  });
});
