import { describe, expect, it, vi } from 'vitest';

import { Agent } from '../../src/agent';
import { PhysicsMemoryRegistry, type PhysicsCapsule } from '../../src/physics-memory';
import { ProviderManager } from '../../src/session/provider-manager';
import { PhysicsMemoryTool } from '../../src/tools/builtin/collaboration/physics-memory-tool';
import { testKaos } from '../fixtures/test-kaos';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;
const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('PhysicsMemoryTool', () => {
  it('lists, loads, and compiles domain-scoped physics capsules', async () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(
      capsule('assumption.gauge', 'fqhe', 'Assumption', {
        body: 'Gauge field convention.',
      }),
    );
    registry.register(
      capsule('formula.flux_quantization', 'fqhe', 'Formula', {
        body: 'Flux quantum is h/e in this convention.',
        dependsOn: ['assumption.gauge'],
        symbols: ['Phi_0'],
        requiredChecks: [
          {
            id: 'check.flux_quantization_convention',
            kind: 'convention',
            severity: 'blocking',
            description: 'Confirm h/e versus 2pi convention before reuse.',
          },
        ],
        actionAffordances: [
          {
            actionId: 'derive.check_convention',
            intent: 'required',
            reason: 'Convention mistakes change the Chern-Simons level.',
          },
        ],
      }),
    );
    registry.register(
      capsule('benchmark.flux_quantization', 'fqhe', 'BenchmarkCase', {
        dependsOn: ['formula.flux_quantization'],
      }),
    );
    const tool = new PhysicsMemoryTool(registry);

    const domains = await execute(tool, { action: 'list_domains' });
    const list = await execute(tool, { action: 'list_capsules', domain: 'fqhe', kind: 'Formula' });
    const loaded = await execute(tool, { action: 'load_capsule', id: 'formula.flux_quantization' });
    const context = await execute(tool, {
      action: 'compile_context',
      domain: 'fqhe',
      focus: ['formula.flux_quantization'],
    });

    expect(domains.output).toContain('<domain id="fqhe" />');
    expect(list.output).toContain('formula.flux_quantization');
    expect(loaded.output).toContain('Flux quantum is h/e');
    expect(context.isError).toBeUndefined();
    expect(context.output).toContain('<required_checks>');
    expect(context.output).toContain('derive.check_convention');
    expect(context.output).toContain('assumption.gauge');
  });

  it('returns a tool error when context compilation finds missing focus capsules', async () => {
    const registry = new PhysicsMemoryRegistry();
    const tool = new PhysicsMemoryTool(registry);

    const result = await execute(tool, {
      action: 'compile_context',
      domain: 'fqhe',
      focus: ['missing'],
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('missing-focus-capsule');
  });
});

describe('ToolManager PhysicsMemory registration', () => {
  it('keeps PhysicsMemory hidden unless the feature flag and registry are both present', () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'];
    try {
      delete process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'];
      const hidden = makeAgent(new PhysicsMemoryRegistry());
      expect(hidden.tools.data().find((tool) => tool.name === 'PhysicsMemory')).toBeUndefined();

      process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'] = '1';
      const missingRegistry = makeAgent();
      expect(missingRegistry.tools.data().find((tool) => tool.name === 'PhysicsMemory')).toBeUndefined();

      const visible = makeAgent(new PhysicsMemoryRegistry());
      visible.tools.setActiveTools(['PhysicsMemory']);
      expect(visible.tools.data().find((tool) => tool.name === 'PhysicsMemory')).toMatchObject({
        name: 'PhysicsMemory',
        active: true,
        source: 'builtin',
      });
      expect(visible.tools.loopTools.find((tool) => tool.name === 'PhysicsMemory')).toBeInstanceOf(
        PhysicsMemoryTool,
      );
    } finally {
      if (oldFlag === undefined) {
        delete process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'];
      } else {
        process.env['KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY'] = oldFlag;
      }
    }
  });
});

function execute(tool: PhysicsMemoryTool, args: Parameters<typeof tool.resolveExecution>[0]) {
  return executeTool(tool, {
    turnId: '0',
    toolCallId: 'call_physics_memory',
    args,
    signal,
  });
}

function makeAgent(physicsMemory?: PhysicsMemoryRegistry): Agent {
  const agent = new Agent({
    kaos: testKaos,
    rpc: {
      emitEvent: vi.fn(),
      requestApproval: vi.fn(),
      requestQuestion: vi.fn(),
      toolCall: vi.fn(),
    },
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
    physicsMemory,
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  agent.tools.initializeBuiltinTools();
  return agent;
}

function capsule(
  id: string,
  domain: string,
  kind: PhysicsCapsule['metadata']['kind'],
  overrides: Partial<PhysicsCapsule> & {
    readonly dependsOn?: readonly string[];
    readonly symbols?: readonly string[];
    readonly requiredChecks?: PhysicsCapsule['metadata']['requiredChecks'];
    readonly actionAffordances?: PhysicsCapsule['metadata']['actionAffordances'];
  } = {},
): PhysicsCapsule {
  return {
    path: `/tmp/${id}.md`,
    source: 'project',
    body: overrides.body ?? '',
    metadata: {
      id,
      domain,
      kind,
      title: id,
      reliability: 'linked',
      symbols: overrides.symbols ?? [],
      assumes: [],
      dependsOn: overrides.dependsOn ?? [],
      sourceRefs: ['local:test'],
      graphRefs: [],
      expansionHandles: [],
      requiredChecks: overrides.requiredChecks ?? [],
      actionAffordances: overrides.actionAffordances ?? [],
      allowCrossDomain: false,
    },
  };
}
