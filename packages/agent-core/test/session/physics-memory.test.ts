import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'pathe';

import type { ProviderConfig } from '@moonshot-ai/kosong';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';
import { ProviderManager } from '../../src/session/provider-manager';
import { PhysicsMemoryTool } from '../../src/tools/builtin/collaboration/physics-memory-tool';
import { testKaos } from '../fixtures/test-kaos';
import { executeTool } from '../tools/fixtures/execute-tool';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const satisfies ProviderConfig;

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('Session physics memory', () => {
  it('loads .aitp/physics-memory into agents when the feature flag is enabled', async () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'];
    process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'] = '1';
    try {
      const workDir = await makeTempDir('kimi-physics-memory-work-');
      const userHome = await makeTempDir('kimi-physics-memory-home-');
      const sessionDir = await makeTempDir('kimi-physics-memory-session-');
      await mkdir(join(workDir, '.git'));
      await writeCapsule(
        join(workDir, '.aitp', 'physics-memory', 'fqhe', 'formula-flux.md'),
        'formula.fqhe.flux_quantization',
      );
      const records: AgentRecord[] = [];
      const session = new Session({
        id: 'test-physics-memory',
        kaos: testKaos.withCwd(workDir),
        homedir: sessionDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        physicsMemory: { userHomeDir: userHome },
        providerManager: testProviderManager(),
      });

      const { agent } = await session.createAgent({
        type: 'main',
        persistence: new InMemoryAgentRecordPersistence([], {
          onRecord: (record) => records.push(record),
        }),
      });
      agent.config.update({
        cwd: workDir,
        modelAlias: MOCK_PROVIDER.model,
      });
      agent.tools.setActiveTools(['PhysicsMemory']);
      const tool = agent.tools.loopTools.find((candidate) => candidate.name === 'PhysicsMemory');
      if (!(tool instanceof PhysicsMemoryTool)) {
        throw new Error('Expected PhysicsMemory tool to be active');
      }

      const result = await executeTool(tool, {
        turnId: '0',
        toolCallId: 'call_physics_memory',
        args: {
          action: 'compile_context',
          domain: 'fqhe',
          focus: ['formula.fqhe.flux_quantization'],
          include_body: false,
        },
        signal: new AbortController().signal,
      });
      const loaded = await executeTool(tool, {
        turnId: '0',
        toolCallId: 'call_load_capsule',
        args: {
          action: 'load_capsule',
          id: 'formula.fqhe.flux_quantization',
          include_body: false,
        },
        signal: new AbortController().signal,
      });

      expect(result.isError).toBeUndefined();
      expect(loaded.isError).toBeUndefined();
      expect(result.output).toContain('formula.fqhe.flux_quantization');
      expect(agent.physicsMemory?.registry.listDomains()).toEqual(['fqhe']);
      const rootsLoaded = records.find((record) => record.type === 'physics_memory.roots_loaded');
      expect(rootsLoaded).toMatchObject({
        type: 'physics_memory.roots_loaded',
        source: 'session-start',
        capsuleCount: 1,
        domains: ['fqhe'],
        diagnostics: [],
      });
      expect(rootsLoaded).toMatchObject({
        roots: [
          expect.objectContaining({
            source: 'project',
            path: expect.stringContaining('/.aitp/physics-memory'),
          }),
        ],
      });
      expect(records).toContainEqual(
        expect.objectContaining({
          type: 'physics_memory.context_compiled',
          source: 'model-tool',
          domain: 'fqhe',
          focus: ['formula.fqhe.flux_quantization'],
          capsuleIds: ['formula.fqhe.flux_quantization'],
          toolCallId: 'call_physics_memory',
        }),
      );
      expect(records).toContainEqual(
        expect.objectContaining({
          type: 'physics_memory.capsule_loaded',
          source: 'model-tool',
          capsuleId: 'formula.fqhe.flux_quantization',
          domain: 'fqhe',
          kind: 'Formula',
          toolCallId: 'call_load_capsule',
        }),
      );
    } finally {
      if (oldFlag === undefined) {
        delete process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'];
      } else {
        process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'] = oldFlag;
      }
    }
  });

  it('keeps existing sessions without physics memory unchanged when the flag is disabled', async () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'];
    delete process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'];
    try {
      const workDir = await makeTempDir('kimi-physics-memory-off-work-');
      const sessionDir = await makeTempDir('kimi-physics-memory-off-session-');
      await mkdir(join(workDir, '.git'));
      await writeCapsule(
        join(workDir, '.aitp', 'physics-memory', 'fqhe', 'formula-flux.md'),
        'formula.fqhe.flux_quantization',
      );
      const records: AgentRecord[] = [];
      const session = new Session({
        id: 'test-physics-memory-off',
        kaos: testKaos.withCwd(workDir),
        homedir: sessionDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        providerManager: testProviderManager(),
      });

      const { agent } = await session.createAgent({
        type: 'main',
        persistence: new InMemoryAgentRecordPersistence([], {
          onRecord: (record) => records.push(record),
        }),
      });
      agent.config.update({
        cwd: workDir,
        modelAlias: MOCK_PROVIDER.model,
      });
      agent.tools.setActiveTools(['PhysicsMemory']);

      expect(agent.physicsMemory).toBeNull();
      expect(agent.tools.data().find((tool) => tool.name === 'PhysicsMemory')).toBeUndefined();
      expect(records.some((record) => record.type.startsWith('physics_memory.'))).toBe(false);
    } finally {
      if (oldFlag === undefined) {
        delete process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'];
      } else {
        process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'] = oldFlag;
      }
    }
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeCapsule(path: string, id: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    [
      '---',
      `id: ${id}`,
      'kind: Formula',
      'domain: fqhe',
      'title: Flux quantization convention',
      'reliability: linked',
      'symbols:',
      '  - Phi_0',
      'source_refs:',
      '  - local:test',
      'required_checks:',
      '  - id: check.flux_quantization_convention',
      '    kind: convention',
      '    severity: blocking',
      '---',
      'Flux quantum convention details.',
    ].join('\n'),
    'utf-8',
  );
}

function createSessionRpc(): SDKSessionRPC {
  return {
    emitEvent: vi.fn(),
    requestApproval: vi.fn(),
    requestQuestion: vi.fn(),
    toolCall: vi.fn(),
  } as unknown as SDKSessionRPC;
}

function testProviderManager(): ProviderManager {
  return new ProviderManager({
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
  });
}
