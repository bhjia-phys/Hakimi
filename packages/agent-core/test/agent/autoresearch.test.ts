import { describe, expect, it } from 'vitest';

import type { AitpWriteBridgeExecutor } from '../../src';
import {
  AGENT_WIRE_PROTOCOL_VERSION,
  InMemoryAgentRecordPersistence,
} from '../../src/agent/records';
import { testAgent } from './harness/agent';

describe('AutoresearchMode', () => {
  it('starts an AITP-backed research run before storing local runtime state', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const { agent } = testAgent({
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          return {
            ok: true,
            kind: 'research_run',
            runId: 'research-run-fqhe',
            topicId: 'fqhe',
            objective: 'Audit source support for the edge-counting claim.',
            researchQuestion: 'Does the source establish the edge-counting claim?',
            operator: 'kimi',
            status: 'active',
            phase: 'planning',
            terminalAnswerState: '',
            eventIds: ['event-start'],
            orientationOnly: true,
            canUpdateKernelState: true,
            canUpdateClaimTrust: false,
            raw: {},
          };
        },
      },
    });

    const snapshot = await agent.autoresearch.start({
      topicId: 'fqhe',
      claimId: 'claim-edge-counting',
      objective: 'Audit source support for the edge-counting claim.',
      researchQuestion: 'Does the source establish the edge-counting claim?',
      operator: 'kimi',
      title: 'FQHE edge counting source audit',
    });

    expect(bridgeCalls).toEqual([
      expect.objectContaining({
        operation: 'startResearchRun',
        payload: expect.objectContaining({
          topicId: 'fqhe',
          claimId: 'claim-edge-counting',
          objective: 'Audit source support for the edge-counting claim.',
          researchQuestion: 'Does the source establish the edge-counting claim?',
          operator: 'kimi',
        }),
      }),
    ]);
    expect(snapshot).toMatchObject({
      aitpRunId: 'research-run-fqhe',
      topicId: 'fqhe',
      status: 'active',
      phase: 'planning',
      orientationOnly: true,
      canUpdateClaimTrust: false,
    });
    expect(agent.autoresearch.getAutoresearch().autoresearch).toMatchObject({
      aitpRunId: 'research-run-fqhe',
      claimId: 'claim-edge-counting',
    });
  });

  it('updates and records events through the same AITP run id', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const { agent } = testAgent({
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          if (input.operation === 'recordResearchRunEvent') {
            return {
              ok: true,
              kind: 'research_run_event',
              eventId: 'event-checkpoint',
              runId: 'research-run-fqhe',
              topicId: 'fqhe',
              operator: 'human',
              eventType: 'operator_checkpoint',
              status: 'recorded',
              phase: 'source_review',
              orientationOnly: true,
              canUpdateKernelState: true,
              canUpdateClaimTrust: false,
              raw: {},
            };
          }
          if (input.operation !== 'startResearchRun' && input.operation !== 'updateResearchRun') {
            throw new Error(`Unexpected operation ${input.operation}`);
          }
          return {
            ok: true,
            kind: 'research_run',
            runId: 'research-run-fqhe',
            topicId: 'fqhe',
            objective: 'Audit source support.',
            researchQuestion: 'Does the source establish the claim?',
            operator: input.payload.operator,
            status: input.operation === 'startResearchRun' ? 'active' : 'paused',
            phase: input.operation === 'startResearchRun' ? 'planning' : 'awaiting_approval',
            terminalAnswerState: input.operation === 'startResearchRun' ? '' : 'draft_only',
            eventIds: input.operation === 'startResearchRun' ? ['event-start'] : ['event-start', 'event-pause'],
            orientationOnly: true,
            canUpdateKernelState: true,
            canUpdateClaimTrust: false,
            raw: {},
          };
        },
      },
    });

    await agent.autoresearch.start({
      topicId: 'fqhe',
      objective: 'Audit source support.',
      researchQuestion: 'Does the source establish the claim?',
      operator: 'kimi',
    });
    await agent.autoresearch.pause({ reason: 'Needs human source review.', operator: 'hakimi' });
    const snapshot = await agent.autoresearch.recordEvent({
      eventType: 'operator_checkpoint',
      summary: 'Human approved continuing the source review.',
      operator: 'human',
      phase: 'source_review',
    });

    expect(bridgeCalls.map((call) => call.operation)).toEqual([
      'startResearchRun',
      'updateResearchRun',
      'recordResearchRunEvent',
    ]);
    expect(bridgeCalls[1]).toMatchObject({
      operation: 'updateResearchRun',
      payload: {
        runId: 'research-run-fqhe',
        topicId: 'fqhe',
        operator: 'hakimi',
        status: 'paused',
        phase: 'awaiting_approval',
        stopReason: 'Needs human source review.',
        eventType: 'status_changed',
      },
    });
    expect(bridgeCalls[2]).toMatchObject({
      operation: 'recordResearchRunEvent',
      payload: {
        runId: 'research-run-fqhe',
        topicId: 'fqhe',
        operator: 'human',
        eventType: 'operator_checkpoint',
        summary: 'Human approved continuing the source review.',
      },
    });
    expect(snapshot.eventIds).toContain('event-checkpoint');
    expect(snapshot.operator).toBe('human');
  });

  it('keeps the existing snapshot when replace fails before AITP creates a run', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    let failNextStart = false;
    const { agent } = testAgent({
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          if (input.operation !== 'startResearchRun') {
            throw new Error(`Unexpected operation ${input.operation}`);
          }
          if (failNextStart) {
            throw new Error('AITP start failed');
          }
          return {
            ok: true,
            kind: 'research_run',
            runId: 'research-run-original',
            topicId: input.payload.topicId,
            objective: input.payload.objective,
            researchQuestion: input.payload.researchQuestion,
            operator: input.payload.operator,
            status: 'active',
            phase: 'planning',
            terminalAnswerState: '',
            eventIds: ['event-start-original'],
            orientationOnly: true,
            canUpdateKernelState: true,
            canUpdateClaimTrust: false,
            raw: {},
          };
        },
      },
    });

    await agent.autoresearch.start({
      topicId: 'fqhe',
      objective: 'Audit source support.',
      researchQuestion: 'Does the source establish the claim?',
      operator: 'kimi',
    });

    failNextStart = true;
    await expect(
      agent.autoresearch.start({
        topicId: 'ising',
        objective: 'Replace the run.',
        researchQuestion: 'Can the new source support the claim?',
        operator: 'hakimi',
        replace: true,
      }),
    ).rejects.toThrow('AITP start failed');

    expect(bridgeCalls.map((call) => call.operation)).toEqual([
      'startResearchRun',
      'startResearchRun',
    ]);
    expect(agent.autoresearch.getAutoresearch().autoresearch).toMatchObject({
      aitpRunId: 'research-run-original',
      topicId: 'fqhe',
      objective: 'Audit source support.',
      operator: 'kimi',
    });
  });

  it('restores autoresearch records during replay', async () => {
    const persistence = new InMemoryAgentRecordPersistence([
      { type: 'metadata', protocol_version: AGENT_WIRE_PROTOCOL_VERSION, created_at: 1 },
      {
        type: 'autoresearch.create',
        id: 'local-autoresearch',
        aitpRunId: 'research-run-fqhe',
        topicId: 'fqhe',
        objective: 'Audit source support.',
        researchQuestion: 'Does the source establish the claim?',
        operator: 'kimi',
        claimId: 'claim-edge',
        status: 'active',
        phase: 'planning',
        terminalAnswerState: '',
        eventIds: ['event-start'],
        createdAt: 10,
        updatedAt: 10,
        orientationOnly: true,
        canUpdateKernelState: true,
        canUpdateClaimTrust: false,
      },
      {
        type: 'autoresearch.update',
        status: 'paused',
        phase: 'awaiting_approval',
        terminalAnswerState: 'draft_only',
        stopReason: 'Needs human source review.',
        operator: 'human',
        eventIds: ['event-start', 'event-pause'],
        updatedAt: 20,
      },
    ]);
    const { agent } = testAgent({ persistence });

    await expect(agent.records.replay()).resolves.toEqual({ warning: undefined });

    expect(agent.autoresearch.getAutoresearch().autoresearch).toMatchObject({
      id: 'local-autoresearch',
      aitpRunId: 'research-run-fqhe',
      status: 'paused',
      phase: 'awaiting_approval',
      terminalAnswerState: 'draft_only',
      stopReason: 'Needs human source review.',
      operator: 'human',
      eventIds: ['event-start', 'event-pause'],
    });
  });
});
