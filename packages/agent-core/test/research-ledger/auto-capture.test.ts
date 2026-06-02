import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { ResearchLedgerRegistry } from '../../src/research-ledger';
import { ProviderManager } from '../../src/session/provider-manager';
import { testKaos } from '../fixtures/test-kaos';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('tool lifecycle auto capture', () => {
  it('captures a git diff observation into the research ledger', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const records: AgentRecord[] = [];
    const agent = makeAgent(cwd, records);
    const manager = agent.researchLedger;
    if (manager === null) throw new Error('Expected research ledger manager');

    agent.workFrames.open(
      {
        id: 'frame.librpa',
        domain: 'librpa',
        topic: 'librpa-head-wing',
        goal: 'Inspect head-wing diff',
        sourceRefs: ['local:head-wing-plan'],
        activeObjectIds: ['code:librpa/head-wing'],
      },
      { source: 'controller' },
    );
    agent.researchAction.startActionCall(
      {
        actionId: 'code.capture_git_diff_observation',
        callId: 'call.capture-diff',
      },
      { source: 'controller' },
    );

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_git_diff',
      toolName: 'Bash',
      args: { command: 'git diff -- src/head_wing.cpp' },
      cwd,
      workFrameId: 'frame.librpa',
      actionCallId: 'call.capture-diff',
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_git_diff',
      result: {
        output: 'diff --git a/src/head_wing.cpp b/src/head_wing.cpp\n+ changed normalization',
      },
      artifactRefs: ['artifact:git-diff.patch'],
      workFrameId: 'frame.librpa',
      actionCallId: 'call.capture-diff',
    });

    const event = manager.registry.listEvents({ type: 'git_diff_observation' })[0];
    expect(event?.metadata.topic).toBe('librpa-head-wing');
    expect(event?.metadata.domain).toBe('librpa');
    expect(event?.metadata.sourceRefs).toEqual(
      expect.arrayContaining([
        'local:head-wing-plan',
        'tool:Bash',
        'git:tool-call:call_git_diff',
        'artifact:git-diff.patch',
      ]),
    );
    expect(event?.body).toContain('## Args Summary');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_ledger.event_written',
        source: 'controller',
        eventType: 'git_diff_observation',
        toolCallId: 'call_git_diff',
      }),
    );
  });

  it('captures blocking failures and preserves artifact refs', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const agent = makeAgent(cwd);
    const manager = agent.researchLedger;
    if (manager === null) throw new Error('Expected research ledger manager');

    agent.workFrames.open(
      {
        id: 'frame.fqhe',
        domain: 'topological-order',
        topic: 'fqhe-cs',
        goal: 'Check a risky derivation step',
        sourceRefs: ['arxiv:cond-mat/0101029'],
      },
      { source: 'controller' },
    );

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_fail',
      toolName: 'Bash',
      args: { command: 'run-check --step flux-quantization' },
      cwd,
      workFrameId: 'frame.fqhe',
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_fail',
      result: {
        output: 'check failed: flux quantization mismatch',
        isError: true,
      },
      artifactRefs: ['artifact:flux-check.log'],
      workFrameId: 'frame.fqhe',
    });

    const event = manager.registry.listEvents({ type: 'failure_observation' })[0];
    expect(event?.metadata.sourceRefs).toEqual(
      expect.arrayContaining(['failure:tool-call:call_fail', 'artifact:flux-check.log']),
    );
    expect(event?.body).toContain('Failure Status');
  });

  it('skips low-value tool noise and records the skip reason', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const records: AgentRecord[] = [];
    const agent = makeAgent(cwd, records);

    agent.workFrames.open(
      {
        id: 'frame.misc',
        domain: 'librpa',
        topic: 'misc-topic',
        goal: 'Avoid noisy capture',
      },
      { source: 'controller' },
    );

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_ls',
      toolName: 'LS',
      args: { path: '.' },
      cwd,
      workFrameId: 'frame.misc',
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_ls',
      result: {
        output: 'src\npackage.json\nREADME.md',
      },
      workFrameId: 'frame.misc',
    });

    expect(
      records.some(
        (record) =>
          record.type === 'research_ledger.event_written' &&
          record.toolCallId === 'call_ls',
      ),
    ).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_ledger.auto_capture_skipped',
        toolCallId: 'call_ls',
        reason: 'low-value-tool-output',
      }),
    );
  });
});

function makeAgent(cwd: string, records?: AgentRecord[]): Agent {
  const agent = new Agent({
    kaos: testKaos,
    persistence:
      records === undefined
        ? undefined
        : new InMemoryAgentRecordPersistence([], {
            onRecord: (record) => records.push(record),
          }),
    modelProvider: new ProviderManager({
      config: {
        providers: {
          test: {
            type: MOCK_PROVIDER.type,
            apiKey: MOCK_PROVIDER.apiKey,
          },
        },
        models: {
          [MOCK_PROVIDER.model]: {
            provider: 'test',
            model: MOCK_PROVIDER.model,
            maxContextSize: 1_000_000,
          },
        },
      },
    }),
    researchLedger: new ResearchLedgerRegistry(),
  });
  agent.config.update({
    cwd,
    modelAlias: MOCK_PROVIDER.model,
  });
  return agent;
}

async function tempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  onTestFinished(async () => {
    await rm(path, { recursive: true, force: true });
  });
  return path;
}
