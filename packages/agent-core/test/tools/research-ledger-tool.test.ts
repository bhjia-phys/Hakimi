import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { ResearchLedgerRegistry, type ResearchLedgerEvent } from '../../src/research-ledger';
import { ProviderManager } from '../../src/session/provider-manager';
import { ResearchLedgerTool } from '../../src/tools/builtin/collaboration/research-ledger-tool';
import { testKaos } from '../fixtures/test-kaos';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;
const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('ResearchLedgerTool', () => {
  it('lists topics and events, loads an event, and compiles proposals', async () => {
    const registry = new ResearchLedgerRegistry();
    registry.register(
      event('event.fqhe.source', {
        type: 'source_excerpt',
        status: 'linked',
        candidateCapsuleKind: 'Definition',
        openQuestions: [],
        body: 'Laughlin wavefunction source excerpt.',
      }),
    );
    registry.register(
      event('event.fqhe.flux-step', {
        status: 'linked',
        candidateCapsuleKind: 'DerivationStep',
        openQuestions: ['check flux quantum convention'],
        body: 'Flux attachment derivation scratch.',
      }),
    );
    const tool = new ResearchLedgerTool(registry);

    const topics = await execute(tool, { action: 'list_topics', domain: 'topological-order' });
    const events = await execute(tool, {
      action: 'list_events',
      topic: 'fqhe-cs-effective-theory',
      status: 'linked',
    });
    const loaded = await execute(tool, {
      action: 'load_event',
      id: 'event.fqhe.flux-step',
      include_body: true,
    });
    const proposals = await execute(tool, {
      action: 'compile_proposals',
      topic: 'fqhe-cs-effective-theory',
      domain: 'topological-order',
    });

    expect(topics.output).toContain('<topic id="fqhe-cs-effective-theory" />');
    expect(events.output).toContain('event.fqhe.flux-step');
    expect(loaded.output).toContain('Flux attachment derivation scratch.');
    expect(proposals.isError).toBeUndefined();
    expect(proposals.output).toContain('proposal.event.fqhe.flux-step.derivationstep');
    expect(proposals.output).toContain('unresolved-open-question');
  });

  it('returns a tool error when load_event has no id', async () => {
    const tool = new ResearchLedgerTool(new ResearchLedgerRegistry());

    const result = await execute(tool, { action: 'load_event' });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('requires an id');
  });

  it('writes schema-checked events through the session manager and registers them immediately', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'aitp-ledger-tool-'));
    const records: AgentRecord[] = [];
    onTestFinishedRm(cwd);
    const agent = makeAgent(new ResearchLedgerRegistry(), { cwd, records });
    const manager = agent.researchLedger;
    if (manager === null) throw new Error('Expected research ledger manager');
    const tool = new ResearchLedgerTool(manager);

    const result = await execute(tool, {
      action: 'write_event',
      id: 'event.librpa.head-wing.diff',
      type: 'git_diff_observation',
      topic: 'librpa-head-wing',
      domain: 'librpa',
      status: 'captured',
      source_refs: ['git:diff:head-wing'],
      depends_on: ['event.librpa.head-wing.code'],
      candidate_capsule_kind: 'CodeMapping',
      open_questions: ['confirm head-wing convention'],
      related_objects: ['code:librpa/head-wing'],
      body: 'Captured a deterministic head-wing diff observation.',
    });

    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('event.librpa.head-wing.diff');
    expect(result.output).toContain('created="true"');
    const event = manager.registry.requireEvent('event.librpa.head-wing.diff');
    expect(event.body).toContain('deterministic head-wing diff');
    expect(event.path.replaceAll('\\', '/')).toContain('/.hakimi/research-ledger/');
    expect(await readFile(event.path, 'utf8')).toContain('git_diff_observation');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_ledger.event_written',
        source: 'model-tool',
        eventId: 'event.librpa.head-wing.diff',
        topic: 'librpa-head-wing',
        domain: 'librpa',
        eventType: 'git_diff_observation',
        status: 'captured',
        toolCallId: 'call_research_ledger',
      }),
    );

    const loaded = await execute(tool, {
      action: 'load_event',
      id: 'event.librpa.head-wing.diff',
    });
    expect(loaded.output).toContain('Captured a deterministic head-wing diff observation.');
  });

  it('generates write_event ids and rejects source excerpts without retrieved provenance', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'aitp-ledger-tool-'));
    onTestFinishedRm(cwd);
    const agent = makeAgent(new ResearchLedgerRegistry(), { cwd });
    const manager = agent.researchLedger;
    if (manager === null) throw new Error('Expected research ledger manager');
    const tool = new ResearchLedgerTool(manager);

    const generated = await execute(tool, {
      action: 'write_event',
      type: 'derivation_scratch',
      topic: 'laughlin-flux',
      domain: 'theoretical-physics/general',
      source_refs: ['builtin:laughlin-flux-insertion'],
      body: 'Model-side derivation scratch; not a retrieved source excerpt.',
    });

    expect(generated.isError).toBeUndefined();
    expect(generated.output).toContain('event.laughlin-flux.derivation_scratch.call_research_ledger');
    const event = manager.registry.requireEvent(
      'event.laughlin-flux.derivation_scratch.call_research_ledger',
    );
    expect(event.path.replaceAll('\\', '/')).toContain('/.hakimi/research-ledger/');

    const rejected = await execute(tool, {
      action: 'write_event',
      type: 'source_excerpt',
      topic: 'laughlin-flux',
      domain: 'theoretical-physics/general',
      source_refs: ['builtin:laughlin-flux-insertion'],
      body: 'This is not actually a retrieved excerpt.',
    });

    expect(rejected).toMatchObject({ isError: true });
    expect(rejected.output).toContain('type=source_excerpt requires at least one retrieved source ref');
    expect(rejected.output).toContain('use type=derivation_scratch');
  });

  it('defaults write and capture events to the generic theoretical-physics domain', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'aitp-ledger-tool-'));
    onTestFinishedRm(cwd);
    const agent = makeAgent(new ResearchLedgerRegistry(), { cwd });
    const manager = agent.researchLedger;
    if (manager === null) throw new Error('Expected research ledger manager');
    const tool = new ResearchLedgerTool(manager);

    const written = await execute(tool, {
      action: 'write_event',
      type: 'derivation_scratch',
      topic: 'random-open-boundary-ads-cavity',
      source_refs: ['model:research-session'],
      body: 'Draft derivation for a random open AdS boundary.',
    });
    const captured = await execute(tool, {
      action: 'capture_event',
      capture_class: 'benchmark_observation',
      topic: 'random-open-boundary-ads-cavity',
      title: 'Toy survival simulation',
      body: 'A finite toy simulation produced an exploratory survival curve.',
      source_refs: ['file:code/survival_simulation.py'],
      artifact_refs: ['file:ensemble_survival.png'],
    });

    expect(written.isError).toBeUndefined();
    expect(captured.isError).toBeUndefined();
    expect(manager.registry.requireEvent(
      'event.random-open-boundary-ads-cavity.derivation_scratch.call_research_ledger',
    ).metadata.domain).toBe('theoretical-physics/general');
    expect(manager.registry.listEvents({ topic: 'random-open-boundary-ads-cavity' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            domain: 'theoretical-physics/general',
            type: 'benchmark_observation',
          }),
        }),
      ]),
    );
  });

  it('captures controlled observations through the capture policy', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'aitp-ledger-tool-'));
    onTestFinishedRm(cwd);
    const agent = makeAgent(new ResearchLedgerRegistry(), { cwd });
    const manager = agent.researchLedger;
    if (manager === null) throw new Error('Expected research ledger manager');
    const tool = new ResearchLedgerTool(manager);

    const result = await execute(tool, {
      action: 'capture_event',
      capture_class: 'benchmark_observation',
      topic: 'librpa-head-wing',
      domain: 'librpa',
      title: 'Head-wing smoke benchmark',
      body: 'The smoke benchmark passed with the deterministic fixture.',
      source_refs: ['local:benchmark-smoke'],
      artifact_refs: ['artifact:benchmark-smoke.log'],
      related_objects: ['benchmark:librpa/head-wing-smoke'],
    });

    expect(result.isError).toBeUndefined();
    const event = manager.registry.listEvents({ type: 'benchmark_observation' })[0];
    expect(event?.metadata.id).toBe(
      'event.librpa-head-wing.benchmark_observation.Head-wing-smoke-benchmark',
    );
    expect(event?.metadata.sourceRefs).toEqual([
      'local:benchmark-smoke',
      'artifact:benchmark-smoke.log',
    ]);
    expect(event?.body).toContain('## Artifact Refs');

    const rejected = await execute(tool, {
      action: 'capture_event',
      capture_class: 'failure_observation',
      topic: 'librpa-head-wing',
      domain: 'librpa',
      title: 'Unprovenanced failure',
      body: 'No source.',
    });
    expect(rejected).toMatchObject({ isError: true });
    expect(rejected.output).toContain('missing-provenance');
  });
});

describe('ToolManager ResearchLedger registration', () => {
  it('exposes ResearchLedger by default when a registry is present and hides it on explicit opt-out', () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'];
    try {
      process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'] = '0';
      const hidden = makeAgent(new ResearchLedgerRegistry());
      expect(hidden.tools.data().find((tool) => tool.name === 'ResearchLedger')).toBeUndefined();

      delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'];
      const missingRegistry = makeAgent();
      expect(missingRegistry.tools.data().find((tool) => tool.name === 'ResearchLedger')).toBeUndefined();

      const visible = makeAgent(new ResearchLedgerRegistry());
      visible.tools.setActiveTools(['ResearchLedger']);
      expect(visible.tools.data().find((tool) => tool.name === 'ResearchLedger')).toMatchObject({
        name: 'ResearchLedger',
        active: true,
        source: 'builtin',
      });
      expect(visible.tools.loopTools.find((tool) => tool.name === 'ResearchLedger')).toBeInstanceOf(
        ResearchLedgerTool,
      );
    } finally {
      if (oldFlag === undefined) {
        delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'];
      } else {
        process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'] = oldFlag;
      }
    }
  });
});

function execute(tool: ResearchLedgerTool, args: Parameters<typeof tool.resolveExecution>[0]) {
  return executeTool(tool, {
    turnId: '0',
    toolCallId: 'call_research_ledger',
    args,
    signal,
  });
}

function makeAgent(
  researchLedger?: ResearchLedgerRegistry,
  options: { readonly cwd?: string; readonly records?: AgentRecord[] } = {},
): Agent {
  const records = options.records;
  const agent = new Agent({
    kaos: testKaos,
    rpc: {
      emitEvent: vi.fn(),
      requestApproval: vi.fn(),
      requestQuestion: vi.fn(),
      toolCall: vi.fn(),
    },
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
    researchLedger,
  });
  agent.config.update({
    cwd: options.cwd ?? process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  agent.tools.initializeBuiltinTools();
  return agent;
}

function onTestFinishedRm(path: string): void {
  onTestFinished(async () => {
    await rm(path, { recursive: true, force: true });
  });
}

function event(
  id: string,
  overrides: Partial<ResearchLedgerEvent['metadata']> & {
    readonly body?: string;
  } = {},
): ResearchLedgerEvent {
  return {
    path: `/tmp/${id}.md`,
    body: overrides.body ?? '',
    root: { path: '/tmp', source: 'project' },
    metadata: {
      id,
      type: 'derivation_scratch',
      topic: 'fqhe-cs-effective-theory',
      domain: 'topological-order',
      status: 'linked',
      sourceRefs: ['local:test'],
      dependsOn: [],
      candidateCapsuleKind: 'DerivationStep',
      openQuestions: [],
      relatedObjects: [],
      ...overrides,
    },
  };
}
