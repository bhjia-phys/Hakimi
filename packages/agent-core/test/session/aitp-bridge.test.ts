import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentOptions } from '../../src/agent';
import type { AitpCommandRunner } from '../../src/aitp';
import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';
import { testKaos } from '../fixtures/test-kaos';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('Session AITP bridge wiring', () => {
  it('configures dynamic AITP read and write bridges by default', async () => {
    const workDir = await makeTempDir('hakimi-aitp-work-a-');
    const nextWorkDir = await makeTempDir('hakimi-aitp-work-b-');
    const sessionDir = await makeTempDir('hakimi-aitp-session-');
    const calls: string[][] = [];
    const session = new Session({
      id: 'test-aitp-bridge',
      kaos: testKaos.withCwd(workDir),
      homedir: sessionDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      aitp: {
        runner: recordingRunner(calls),
        graphSliceLimit: 6,
      },
    });

    const { agent } = await session.createAgent({ type: 'main' });
    agent.config.update({ cwd: nextWorkDir });
    agent.workFrames.open(
      {
        id: 'frame.qg',
        domain: 'theoretical-physics/general',
        topic: 'qg',
        goal: 'Trace QG/MIPT relation.',
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
      },
      { source: 'controller' },
    );

    const compiled = await agent.aitpProcessGraphProvider?.getProcessGraphSlice({
      workFrame: agent.workFrames.requireFrame('frame.qg'),
      prompt: [{ type: 'text', text: 'Open the source backtrace.' }],
    });
    const result = await agent.aitpWriteBridge?.executeWrite({
      operation: 'requestHumanCheckpoint',
      payload: {
        topicId: 'qg',
        claimId: 'claim-mipt',
        reason: 'Trust boundary before using this source chain as support.',
        requestedBy: 'hakimi',
        options: ['keep provisional'],
      },
    });

    expect(agent.aitpProcessGraphProvider).toBeDefined();
    expect(agent.aitpWriteBridge).toBeDefined();
    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(result).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg',
    });
    expect(calls[0]).toEqual(
      expect.arrayContaining(['--base', nextWorkDir, 'graph', 'slice', 'session-qg']),
    );
    expect(calls[0]).toEqual(expect.arrayContaining(['--limit', '6']));
    expect(calls[1]).toEqual(
      expect.arrayContaining(['--base', nextWorkDir, 'checkpoint', 'request']),
    );
  });

  it('keeps explicit AgentOptions bridges ahead of the default Session bridge', async () => {
    const workDir = await makeTempDir('hakimi-aitp-work-');
    const sessionDir = await makeTempDir('hakimi-aitp-session-');
    const writeBridge = {
      executeWrite: vi.fn(),
    } satisfies NonNullable<AgentOptions['aitpWriteBridge']>;
    const processGraphProvider = {
      getProcessGraphSlice: vi.fn(),
    } satisfies NonNullable<AgentOptions['aitpProcessGraphProvider']>;
    const session = new Session({
      id: 'test-aitp-explicit-bridge',
      kaos: testKaos.withCwd(workDir),
      homedir: sessionDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
    });

    const { agent } = await session.createAgent({
      type: 'main',
      aitpProcessGraphProvider: processGraphProvider,
      aitpWriteBridge: writeBridge,
    });

    expect(agent.aitpProcessGraphProvider).toBe(processGraphProvider);
    expect(agent.aitpWriteBridge).toBe(writeBridge);
  });

  it('can disable automatic AITP bridge configuration', async () => {
    const workDir = await makeTempDir('hakimi-aitp-work-');
    const sessionDir = await makeTempDir('hakimi-aitp-session-');
    const session = new Session({
      id: 'test-aitp-disabled',
      kaos: testKaos.withCwd(workDir),
      homedir: sessionDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      aitp: { enabled: false },
    });

    const { agent } = await session.createAgent({ type: 'main' });

    expect(agent.aitpProcessGraphProvider).toBeUndefined();
    expect(agent.aitpWriteBridge).toBeUndefined();
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createSessionRpc(): SDKSessionRPC {
  return {
    emitEvent: vi.fn(),
    requestApproval: vi.fn(),
    requestQuestion: vi.fn(),
    toolCall: vi.fn(),
  } as unknown as SDKSessionRPC;
}

function recordingRunner(calls: string[][]): AitpCommandRunner {
  return {
    async run(command, args) {
      calls.push([command, ...args]);
      if (args.includes('graph')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeSlicePayload()),
          stderr: '',
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          kind: 'human_checkpoint',
          checkpoint_id: 'checkpoint-qg',
          topic_id: 'qg',
          claim_id: 'claim-mipt',
          status: 'requested',
        }),
        stderr: '',
      };
    },
  };
}

function fakeSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-mipt',
        type: 'claim',
        record: {
          statement: 'MIPT observer role may be represented by an algebraic split.',
          status: 'hypothesis',
        },
      },
    ],
    edges: [],
    open_obligations: [],
    source_backtrace: [
      {
        claim_id: 'claim-mipt',
        complete: false,
        missing_components: ['source theorem'],
      },
    ],
    relation_neighborhood: [],
    exploratory_records: [],
    trust_boundary_reasons: ['source_support'],
    recommended_moments: [],
  };
}
