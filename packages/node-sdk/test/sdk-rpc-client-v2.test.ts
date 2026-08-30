/**
 * Scenario: v2 wiring — the harness talks to the in-process agent-core-v2
 * engine (klient memory transport) instead of the v1 KimiCore RPC pair.
 * Responsibilities: v2-client behaviors the v1↔v2 parity gate does not
 * compare (goal continuation, engine telemetry forwarding, host request
 * headers, the Windows Git Bash probe, workspace trust, the config write
 * cascade, deleteSession, foldAgentWireReplay).
 * Wiring: real v2 engine bootstrapped on a temp KIMI_CODE_HOME; remote provider calls are stubbed.
 * Run: pnpm exec vitest run test/sdk-rpc-client-v2.test.ts
 */
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FileTokenStorage,
  resolveKimiCodeOAuthRef,
  resolveKimiTokenStorageName,
} from '@moonshot-ai/kimi-code-oauth';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createKimiHarnessV2,
  ErrorCodes,
  KimiHarness,
  removeProviderFromConfig,
  SDKRpcClientV2,
  Session,
  type Event,
  type KimiConfig,
} from '#/index';
import { foldAgentWireReplay } from '#/v2/resume-replay';
import {
  drainQueryStoreDisposals,
  drainSessionIndexMirror,
  HostProcessError,
  IAgentResearchService,
  IAppendLogStore,
  ensureMainAgent,
  getLiveSessionById,
  IHostRequestHeaders,
  ISessionIndex,
  ISessionIndexMirror,
  ISessionManager,
  OsProcessErrors,
} from '@moonshot-ai/agent-core-v2';

import { McpOAuthService } from '../../agent-core/src/mcp/oauth/service';

import { TEST_IDENTITY } from './test-identity';
import { startMcpAuthStatusServer } from './mcp-auth-status-server';
import { recordingTelemetry, type TelemetryRecord } from './telemetry';

const hostEnvProbe = vi.hoisted(() => ({ failWithMissingShell: false }));

vi.mock('@moonshot-ai/agent-core-v2/_base/execEnv/environmentProbe', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@moonshot-ai/agent-core-v2/_base/execEnv/environmentProbe')
  >();
  return {
    ...actual,
    probeHostEnvironmentFromNode: () =>
      hostEnvProbe.failWithMissingShell
        ? Promise.reject(
            new actual.ProbeShellNotFoundError('Git Bash missing (stubbed)', [
              'C:\\Program Files\\Git\\bin\\bash.exe',
            ]),
          )
        : actual.probeHostEnvironmentFromNode(),
  };
});

const tempDirs: string[] = [];

afterEach(async () => {
  try {
    // The read-model mirror/query-store close asynchronously on dispose; await
    // the drains so the rm below never races their final flush (ENOTEMPTY).
    await drainSessionIndexMirror();
    await drainQueryStoreDisposals();
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  } finally {
    vi.unstubAllEnvs();
  }
});

function stubProcessPlatform(platform: NodeJS.Platform): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return () => {
    if (descriptor !== undefined) {
      Object.defineProperty(process, 'platform', descriptor);
    }
  };
}

async function makeHarness(): Promise<{ harness: KimiHarness; homeDir: string }> {
  const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
  tempDirs.push(homeDir);
  return { harness: createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY }), homeDir };
}

/** Create a project-root fixture that cannot discover this checkout's config. */
async function makeProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-project-'));
  tempDirs.push(projectRoot);
  await mkdir(join(projectRoot, '.git'));
  return projectRoot;
}

/** Whether the persisted session directory exists under `<home>/sessions/<bucket>/<id>`. */
async function sessionDirExists(homeDir: string, sessionId: string): Promise<boolean> {
  let buckets: readonly string[];
  try {
    buckets = await readdir(join(homeDir, 'sessions'));
  } catch {
    return false;
  }
  for (const bucket of buckets) {
    try {
      await readdir(join(homeDir, 'sessions', bucket, sessionId));
      return true;
    } catch {
      // Not under this bucket.
    }
  }
  return false;
}

describe('SDKRpcClientV2 (agent-core-v2 wiring)', () => {
  it('exposes the validated runtime binding through Session', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    const session = await harness.createSession({ id: 'ses_runtime', workDir });
    try {
      const binding = await session.getRuntime();
      expect(binding.runtimeId).toBe('local');
      expect(binding.workspaceId.length).toBeGreaterThan(0);
      await expect(session.switchRuntime('missing-runtime')).rejects.toThrow(/missing-runtime/);
      expect(await session.getRuntime()).toEqual(binding);
    } finally {
      await harness.close();
    }
  });

  it('round-trips completionCriterion through the v2 goal RPC', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    try {
      const session = await harness.createSession({ id: 'ses_goal_criterion', workDir });
      await expect(
        session.createGoal({
          objective: 'finish the bounded task',
          completionCriterion: 'the verification command passes',
        }),
      ).resolves.toMatchObject({
        objective: 'finish the bounded task',
        completionCriterion: 'the verification command passes',
        status: 'active',
      });
    } finally {
      await harness.close();
    }
  });

  it('starts a goal continuation when resume explicitly opts in', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    try {
      const session = await harness.createSession({ id: 'ses_goal_resume', workDir });
      const events: Event[] = [];
      const unsubscribe = session.onEvent((event) => {
        events.push(event);
      });
      try {
        await session.createGoal({ objective: 'finish the bounded task' });
        await session.pauseGoal();

        await session.resumeGoal({ continueIfPaused: true });

        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'turn.started',
            sessionId: session.id,
            origin: expect.objectContaining({
              kind: 'system_trigger',
              name: 'goal_continuation',
            }),
          }),
        );
      } finally {
        unsubscribe();
      }
    } finally {
      await harness.close();
    }
  });

  it('rejects a missing active preset before creating a session directory', async () => {
    const { harness, homeDir } = await makeHarness();
    const workDir = await makeProjectRoot();
    const id = 'ses_missing_preset';
    try {
      await harness.setConfig({ subagent: { preset: 'missing', presets: {} } });

      await expect(harness.createSession({ id, workDir })).rejects.toMatchObject({
        code: ErrorCodes.CONFIG_INVALID,
      });
      expect(harness.getSession(id)).toBeUndefined();
      expect(await sessionDirExists(homeDir, id)).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('does not treat a prototype name as an active preset', async () => {
    const { harness, homeDir } = await makeHarness();
    const workDir = await makeProjectRoot();
    const id = 'ses_prototype_preset';
    try {
      await harness.setConfig({ subagent: { preset: 'toString', presets: {} } });

      await expect(harness.createSession({ id, workDir })).rejects.toMatchObject({
        code: ErrorCodes.CONFIG_INVALID,
        message: expect.stringContaining('does not name a configured preset'),
      });
      expect(harness.getSession(id)).toBeUndefined();
      expect(await sessionDirExists(homeDir, id)).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('rejects a dangling canonical agents route without leaving a session directory', async () => {
    const { harness, homeDir } = await makeHarness();
    const workDir = await makeProjectRoot();
    const id = 'ses_dangling_agents_route';
    try {
      await harness.setConfig({
        subagent: { agents: { coder: { model: 'provider/removed' } } },
      });

      await expect(harness.createSession({ id, workDir })).rejects.toMatchObject({
        code: ErrorCodes.CONFIG_INVALID,
        message: expect.stringContaining('from agents.coder could not be resolved'),
      });
      expect(harness.getSession(id)).toBeUndefined();
      expect(await sessionDirExists(homeDir, id)).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('removes a materialized create failure before allowing the id to retry', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const workDir = await makeProjectRoot();
    const id = 'ses_materialized_create_failure';
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });

    try {
      const appendLogStore = client.engineAccessor.get(IAppendLogStore);
      const removeIndexSpy = vi.spyOn(client.engineAccessor.get(ISessionIndex), 'remove');
      const originalAppend = appendLogStore.append.bind(appendLogStore);
      const appendSpy = vi
        .spyOn(appendLogStore, 'append')
        .mockImplementation((scope, key, record) => {
          if (
            scope === '' &&
            key === 'session_index.jsonl' &&
            (record as { readonly sessionId?: string }).sessionId === id
          ) {
            throw new Error('create index append failed');
          }
          originalAppend(scope, key, record);
        });

      try {
        await expect(client.createSession({ id, workDir })).rejects.toThrow(
          'create index append failed',
        );
      } finally {
        appendSpy.mockRestore();
      }

      expect(client.engineAccessor.get(ISessionManager).get(id)).toBeUndefined();
      expect(await sessionDirExists(homeDir, id)).toBe(false);
      expect(
        client.engineAccessor
          .get(ISessionIndexMirror)
          .pending()
          .some((summary) => summary.id === id),
      ).toBe(false);
      expect(removeIndexSpy).toHaveBeenCalledWith(id);
      expect(await client.listSessions({ sessionId: id })).toEqual([]);
      removeIndexSpy.mockRestore();

      await expect(client.createSession({ id, workDir })).resolves.toMatchObject({ id });
    } finally {
      await client.close();
    }
  });

  it('allows a dangling legacy secondary-model alias as a compatibility fallback', async () => {
    const { harness, homeDir } = await makeHarness();
    const workDir = await makeProjectRoot();
    const id = 'ses_dangling_legacy_alias';
    try {
      await harness.setConfig({
        secondaryModel: { defaultModel: 'provider/removed' },
      });

      const session = await harness.createSession({ id, workDir });
      expect(harness.getSession(id)).toBe(session);
      expect(await sessionDirExists(homeDir, id)).toBe(true);
      await session.close();
      expect(harness.getSession(id)).toBeUndefined();
      expect(await sessionDirExists(homeDir, id)).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('keeps an existing session directory when canonical validation rejects resume', async () => {
    const { harness, homeDir } = await makeHarness();
    const workDir = await makeProjectRoot();
    const id = 'ses_resume_dangling_route';
    try {
      const session = await harness.createSession({ id, workDir });
      await session.close();
      expect(await sessionDirExists(homeDir, id)).toBe(true);

      await harness.setConfig({
        subagent: { agents: { coder: { model: 'provider/removed' } } },
      });
      await expect(harness.resumeSession({ id })).rejects.toMatchObject({
        code: ErrorCodes.CONFIG_INVALID,
      });
      expect(harness.getSession(id)).toBeUndefined();
      expect(await sessionDirExists(homeDir, id)).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('cleans a materialized fork failure without announcing or retaining the target', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const workDir = await makeProjectRoot();
    const sourceId = 'ses_fork_cleanup_source';
    const targetId = 'ses_fork_cleanup_target';
    const records: TelemetryRecord[] = [];
    const client = new SDKRpcClientV2({
      homeDir,
      identity: TEST_IDENTITY,
      telemetry: recordingTelemetry(records),
    });

    try {
      await client.createSession({ id: sourceId, workDir });
      const appendLogStore = client.engineAccessor.get(IAppendLogStore);
      const removeIndexSpy = vi.spyOn(client.engineAccessor.get(ISessionIndex), 'remove');
      const originalAppend = appendLogStore.append.bind(appendLogStore);
      const appendSpy = vi
        .spyOn(appendLogStore, 'append')
        .mockImplementation((scope, key, record) => {
          if (
            scope === '' &&
            key === 'session_index.jsonl' &&
            (record as { readonly sessionId?: string }).sessionId === targetId
          ) {
            throw new Error('fork index append failed');
          }
          originalAppend(scope, key, record);
        });

      try {
        await expect(client.forkSession({ id: sourceId, forkId: targetId })).rejects.toThrow(
          'fork index append failed',
        );
      } finally {
        appendSpy.mockRestore();
      }

      expect(client.engineAccessor.get(ISessionManager).get(targetId)).toBeUndefined();
      expect(await sessionDirExists(homeDir, targetId)).toBe(false);
      expect(
        client.engineAccessor
          .get(ISessionIndexMirror)
          .pending()
          .some((summary) => summary.id === targetId),
      ).toBe(false);
      expect(await client.listSessions({ sessionId: targetId })).toEqual([]);
      expect(
        records.some((record) => record.event === 'session_started' && record.sessionId === targetId),
      ).toBe(false);
      expect(await sessionDirExists(homeDir, sourceId)).toBe(true);
      expect(removeIndexSpy).toHaveBeenCalledWith(targetId);
      removeIndexSpy.mockRestore();

      await expect(client.forkSession({ id: sourceId, forkId: targetId })).resolves.toMatchObject({
        id: targetId,
      });
    } finally {
      await client.close();
    }
  });

  it('does not delete a live source session on duplicate fork', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const workDir = await makeProjectRoot();
    const sourceId = 'ses_duplicate_fork_source';
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });

    try {
      await client.createSession({ id: sourceId, workDir });

      await expect(client.forkSession({ id: sourceId, forkId: sourceId })).rejects.toMatchObject({
        code: ErrorCodes.SESSION_ALREADY_EXISTS,
      });
      expect(client.engineAccessor.get(ISessionManager).get(sourceId)).toBeDefined();
      expect(await sessionDirExists(homeDir, sourceId)).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('reports global MCP authorization from the persisted v2 credential store', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const statusServer = await startMcpAuthStatusServer();
    const authorizedUrl = 'https://authorized.example.test/mcp';
    const requiredUrl = 'https://required.example.test/mcp';
    const externalOAuth = new McpOAuthService({ kimiHomeDir: homeDir });
    await externalOAuth
      .getProvider('oauth-authorized', authorizedUrl)
      .saveTokens({ access_token: 'test-access-token', token_type: 'Bearer' });
    await externalOAuth
      .getProvider('sse', statusServer.oauthUrl)
      .saveTokens({ access_token: 'stale-sse-token', token_type: 'Bearer' });
    await writeFile(
      join(homeDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          stdio: { command: 'local-command' },
          plain: { transport: 'http', url: statusServer.plainUrl },
          detected: { transport: 'http', url: statusServer.oauthUrl },
          sse: { transport: 'sse', url: statusServer.oauthUrl },
          'sse-oauth': { transport: 'sse', url: statusServer.oauthUrl, auth: 'oauth' },
          bearer: {
            transport: 'http',
            url: 'https://bearer.example.test/mcp',
            bearerTokenEnvVar: 'EXAMPLE_MCP_TOKEN',
          },
          'oauth-required': {
            transport: 'http',
            url: requiredUrl,
            auth: 'oauth',
          },
          'oauth-authorized': {
            transport: 'http',
            url: authorizedUrl,
            auth: 'oauth',
          },
        },
      }),
      'utf-8',
    );
    const harness = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });

    try {
      await expect(harness.listMcpServerAuthStatuses()).resolves.toEqual([
        { name: 'stdio', authStatus: 'not-applicable' },
        { name: 'plain', authStatus: 'not-applicable' },
        { name: 'detected', authStatus: 'oauth-required' },
        { name: 'sse', authStatus: 'not-applicable' },
        { name: 'sse-oauth', authStatus: 'oauth-required' },
        { name: 'bearer', authStatus: 'bearer-token' },
        { name: 'oauth-required', authStatus: 'oauth-required' },
        { name: 'oauth-authorized', authStatus: 'oauth-authorized' },
      ]);

      await externalOAuth
        .getProvider('oauth-required', requiredUrl)
        .saveTokens({ access_token: 'new-test-access-token', token_type: 'Bearer' });
      await externalOAuth.invalidate('oauth-authorized', authorizedUrl, 'tokens');

      await expect(harness.listMcpServerAuthStatuses()).resolves.toEqual([
        { name: 'stdio', authStatus: 'not-applicable' },
        { name: 'plain', authStatus: 'not-applicable' },
        { name: 'detected', authStatus: 'oauth-required' },
        { name: 'sse', authStatus: 'not-applicable' },
        { name: 'sse-oauth', authStatus: 'oauth-required' },
        { name: 'bearer', authStatus: 'bearer-token' },
        { name: 'oauth-required', authStatus: 'oauth-authorized' },
        { name: 'oauth-authorized', authStatus: 'oauth-required' },
      ]);
    } finally {
      await harness.close();
      await statusServer.close();
    }
  }, 15_000);

  it('seeds the host request headers (User-Agent + X-Msh-*) into the engine', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    try {
      // Without this seed the managed vendors go out with the SDK's default
      // User-Agent and no X-Msh-* — the interactive-v2 path's identity bug.
      const headers = client.engineAccessor.get(IHostRequestHeaders).headers;
      expect(headers['User-Agent']).toBe(`kimi-code-cli/${TEST_IDENTITY.version}`);
      expect(headers['X-Msh-Platform']).toBe('kimi_code_cli');
      expect(headers['X-Msh-Version']).toBe(TEST_IDENTITY.version);
      expect(headers['X-Msh-Device-Id']).toBeTruthy();
    } finally {
      await client.close();
    }
  });

  it('surfaces a missing Git Bash probe failure during ensureConfigFile on Windows', async () => {
    hostEnvProbe.failWithMissingShell = true;
    const restorePlatform = stubProcessPlatform('win32');
    try {
      const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
      tempDirs.push(homeDir);
      const harness = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
      try {
        await expect(harness.ensureConfigFile()).rejects.toBeInstanceOf(HostProcessError);
        await expect(harness.ensureConfigFile()).rejects.toMatchObject({
          code: OsProcessErrors.codes.SHELL_GIT_BASH_NOT_FOUND,
        });
      } finally {
        await harness.close();
      }
    } finally {
      hostEnvProbe.failWithMissingShell = false;
      restorePlatform();
    }
  });

  it('does not block ensureConfigFile on the host environment probe on POSIX', async () => {
    hostEnvProbe.failWithMissingShell = true;
    const restorePlatform = stubProcessPlatform('darwin');
    try {
      const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
      tempDirs.push(homeDir);
      const harness = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
      try {
        await expect(harness.ensureConfigFile()).resolves.toBeUndefined();
      } finally {
        await harness.close();
      }
    } finally {
      hostEnvProbe.failWithMissingShell = false;
      restorePlatform();
    }
  });

  it('serves getExperimentalFeatures from the v2 engine', async () => {
    const { harness } = await makeHarness();
    try {
      const features = await harness.getExperimentalFeatures();
      expect(Array.isArray(features)).toBe(true);
      expect(features.length).toBeGreaterThan(0);
      expect(features.map((feature) => feature.id)).not.toEqual(
        expect.arrayContaining(['openai-codex-oauth', 'aitp_research_mode']),
      );
      for (const feature of features) {
        expect(typeof feature.id).toBe('string');
        expect(typeof feature.title).toBe('string');
        expect(typeof feature.env).toBe('string');
        expect(typeof feature.enabled).toBe('boolean');
        expect(typeof feature.defaultEnabled).toBe('boolean');
      }
    } finally {
      await harness.close();
    }
  });

  it('keeps graduated legacy inputs inert in the v2 catalog', async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_FLAG', '1');
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_OPENAI_CODEX_OAUTH', '0');
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE', '0');
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-legacy-flags-'));
    tempDirs.push(homeDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      '[experimental]\nopenai-codex-oauth = false\naitp_research_mode = true\n',
      'utf8',
    );
    const harness = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });

    try {
      const features = await harness.getExperimentalFeatures();
      const ids = features.map((feature) => feature.id);
      expect(ids).not.toContain('openai-codex-oauth');
      expect(ids).not.toContain('aitp_research_mode');
      expect(features.length).toBeGreaterThan(0);
      expect(features.every((feature) => feature.enabled)).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('emits one complete metadata event when a generated title is applied', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    const titleBaseUrl = 'https://api.example.test/coding/v1';
    const titleOAuthRef = resolveKimiCodeOAuthRef({ baseUrl: titleBaseUrl });
    // Storage names strip the `oauth/` prefix (FileTokenStorage rejects
    // namespaced keys); the engine resolves the same name when reading.
    await new FileTokenStorage(join(homeDir, 'credentials')).save(
      resolveKimiTokenStorageName({ oauthKey: titleOAuthRef.key }),
      {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        scope: '',
        tokenType: 'Bearer',
        expiresIn: 3600,
      },
    );
    await writeFile(
      join(homeDir, 'config.toml'),
      `
default_model = "stub"

[experimental]
auto_session_title = true

[providers.stub]
type = "openai"
base_url = "https://model.example.test/v1"
api_key = "stub"

[models.stub]
provider = "stub"
model = "stub"
max_context_size = 1000

[providers."managed:kimi-code"]
type = "kimi"
base_url = "${titleBaseUrl}"

[providers."managed:kimi-code".oauth]
storage = "file"
key = "${titleOAuthRef.key}"
`,
      'utf-8',
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://api.example.test/coding/v1/tools') {
        return new Response(JSON.stringify({ title: 'Generated title' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const harness = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_generated_title_event', workDir });
      await session.importContext(
        'Generate a concise title for this session',
        "session 'source-session'",
      );
      await expect(
        harness.auth.getCachedAccessToken('managed:kimi-code', {
          storage: titleOAuthRef.storage,
          key: titleOAuthRef.key,
        }),
      ).resolves.toBe('test-access-token');
      await expect(session.getContext()).resolves.toMatchObject({
        history: [
          expect.objectContaining({
            role: 'user',
            origin: { kind: 'user' },
          }),
        ],
      });
      const events: Event[] = [];
      const unsubscribe = session.onEvent((event) => {
        if (event.type === 'session.meta.updated' && event.title === 'Generated title') {
          events.push(event);
        }
      });

      await expect(harness.generateSessionTitle({ id: session.id })).resolves.toBe(
        'Generated title',
      );
      unsubscribe();

      expect(events).toEqual([
        expect.objectContaining({
          type: 'session.meta.updated',
          sessionId: session.id,
          agentId: 'main',
          title: 'Generated title',
          patch: { title: 'Generated title', isCustomTitle: false },
        }),
      ]);
    } finally {
      await harness.close();
      fetchSpy.mockRestore();
    }
  });

  it('serializes a temporary title-generation close against a public resume', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    const titleBaseUrl = 'https://api.example.test/coding/v1';
    const titleOAuthRef = resolveKimiCodeOAuthRef({ baseUrl: titleBaseUrl });
    await new FileTokenStorage(join(homeDir, 'credentials')).save(
      resolveKimiTokenStorageName({ oauthKey: titleOAuthRef.key }),
      {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        scope: '',
        tokenType: 'Bearer',
        expiresIn: 3600,
      },
    );
    await writeFile(
      join(homeDir, 'config.toml'),
      `
default_model = "stub"

[experimental]
auto_session_title = true

[providers.stub]
type = "openai"
base_url = "https://model.example.test/v1"
api_key = "stub"

[models.stub]
provider = "stub"
model = "stub"
max_context_size = 1000

[providers."managed:kimi-code"]
type = "kimi"
base_url = "${titleBaseUrl}"

[providers."managed:kimi-code".oauth]
storage = "file"
key = "${titleOAuthRef.key}"
`,
      'utf-8',
    );
    let markFetchStarted!: () => void;
    let resolveFetch!: (response: Response) => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetchResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://api.example.test/coding/v1/tools') {
        markFetchStarted();
        return fetchResponse;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });

    try {
      await client.createSession({ id: 'ses_title_race', workDir });
      await client.importContext({
        sessionId: 'ses_title_race',
        content: 'Generate a concise title for this session',
        source: "session 'source-session'",
      });
      await client.closeSession({ sessionId: 'ses_title_race' });

      // The cold session is temporarily resumed for generation; block its
      // cleanup close inside the will-close hooks so the public resume below
      // lands while the close is still in flight.
      const titlePromise = client.generateSessionTitle({ id: 'ses_title_race' });
      await fetchStarted;
      const sessionManager = client.engineAccessor.get(ISessionManager);
      const tempHandle = sessionManager.get('ses_title_race');
      expect(tempHandle).toBeDefined();
      let markCloseStarted!: () => void;
      let openCloseGate!: () => void;
      const closeStarted = new Promise<void>((resolve) => {
        markCloseStarted = resolve;
      });
      const closeGate = new Promise<void>((resolve) => {
        openCloseGate = resolve;
      });
      sessionManager.onWillCloseSession!((event) => {
        if (event.sessionId !== 'ses_title_race') return;
        markCloseStarted();
        event.waitUntil(closeGate);
      });

      resolveFetch(
        new Response(JSON.stringify({ title: 'Generated title' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await closeStarted;

      // The resume must queue behind the in-flight close instead of merging
      // into the handle that is being torn down.
      const order: string[] = [];
      const resumePromise = client.resumeSession({ id: 'ses_title_race' }).then((summary) => {
        order.push('resumed');
        return summary;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(order).toEqual([]);

      openCloseGate();
      await expect(titlePromise).resolves.toBe('Generated title');
      const summary = await resumePromise;
      expect(summary.id).toBe('ses_title_race');
      expect(order).toEqual(['resumed']);

      // The resumed session is a fresh, fully usable scope — not the handle
      // the temporary path just tore down.
      await client.renameSession({ id: 'ses_title_race', title: 'Resumed title' });
      const sessions = await client.listSessions({ workDir });
      expect(sessions.find((item) => item.id === 'ses_title_race')?.title).toBe('Resumed title');
    } finally {
      await client.close();
      fetchSpy.mockRestore();
    }
  });

  it('re-resumes a fresh session facade while the public close is in flight', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);

    try {
      const session = await harness.createSession({ id: 'ses_resume_race', workDir });
      // close() flips `isClosed` synchronously; the engine close settles
      // asynchronously. The public resume must not hand back the closing
      // facade — it queues behind the close and materializes a fresh one.
      const closing = session.close();
      const resumed = await harness.resumeSession({ id: 'ses_resume_race' });
      await closing;

      expect(resumed).not.toBe(session);
      expect(session.isClosed).toBe(true);
      expect(resumed.isClosed).toBe(false);
      expect(resumed.getResumeState()).toBeTruthy();
      // The stale facade's late onClose must not evict the live session.
      expect(harness.getSession('ses_resume_race')).toBe(resumed);
    } finally {
      await harness.close();
    }
  });

  it('rejects one of two concurrent creates with the same explicit session id', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);

    try {
      const [first, second] = await Promise.allSettled([
        harness.createSession({ id: 'ses_same_id', workDir }),
        harness.createSession({ id: 'ses_same_id', workDir }),
      ]);

      const outcomes = [first, second].map((result) => result.status);
      expect(outcomes.sort()).toEqual(['fulfilled', 'rejected']);
      const rejection = [first, second].find((result) => result.status === 'rejected');
      expect((rejection as PromiseRejectedResult).reason).toMatchObject({
        code: 'session.already_exists',
      });
      await expect(harness.resumeSession({ id: 'ses_same_id' })).resolves.toMatchObject({
        id: 'ses_same_id',
      });
    } finally {
      await harness.close();
    }
  });

  it('coalesces concurrent public resumes onto one session facade', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);

    try {
      const session = await harness.createSession({ id: 'ses_coalesce', workDir });
      await session.close();

      const [first, second] = await Promise.all([
        harness.resumeSession({ id: 'ses_coalesce' }),
        harness.resumeSession({ id: 'ses_coalesce' }),
      ]);

      // One engine handle, one facade: a later close on either reference
      // must not strand a second live facade over the same handle.
      expect(first).toBe(second);
      expect(harness.getSession('ses_coalesce')).toBe(first);
    } finally {
      await harness.close();
    }
  });

  it('does not coalesce resumes with different options onto one facade', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);

    try {
      const session = await harness.createSession({ id: 'ses_no_coalesce', workDir });
      await session.close();

      const [plain, withReplay] = await Promise.all([
        harness.resumeSession({ id: 'ses_no_coalesce' }),
        harness.resumeSession({ id: 'ses_no_coalesce', replayTurnLimit: 3 }),
      ]);

      // Different options must not be silently dropped onto the first
      // caller's facade — each gets its own resume.
      expect(plain).not.toBe(withReplay);
    } finally {
      await harness.close();
    }
  });

  it('reports the title state in the resumed summary', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);

    try {
      const session = await harness.createSession({ id: 'ses_title_kind', workDir });
      await harness.renameSession({ id: session.id, title: '我的标题' });

      // The resumed summary is read off the live metadata document, so it
      // carries the canonical title state; the list path (index projection)
      // intentionally does not.
      await session.close();
      const resumed = await harness.resumeSession({ id: session.id });
      expect(resumed.summary?.titleKind).toBe('custom');
    } finally {
      await harness.close();
    }
  });

  it('serves listWorkspaceSkills through the engineAccessor escape hatch', async () => {
    const { harness, homeDir } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    await writeSkill(join(homeDir, 'skills', 'demo-user-skill'), 'demo-user-skill');
    await writeSkill(join(workDir, '.kimi-code', 'skills', 'demo-project-skill'), 'demo-project-skill');
    try {
      const skills = await harness.listWorkspaceSkills(workDir);
      const byName = new Map(skills.map((skill) => [skill.name, skill]));
      expect(byName.get('demo-user-skill')).toMatchObject({
        description: 'Skill demo-user-skill for the escape-hatch test',
        source: 'user',
      });
      expect(byName.get('demo-project-skill')).toMatchObject({
        description: 'Skill demo-project-skill for the escape-hatch test',
        source: 'project',
      });
    } finally {
      await harness.close();
    }
  });

  it('honors skillDirs (explicit dirs) over default user / project discovery', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    const explicitBase = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-explicit-'));
    tempDirs.push(explicitBase);
    const explicitDir = join(explicitBase, 'skills');
    await writeSkill(join(homeDir, 'skills', 'demo-user-skill'), 'demo-user-skill');
    await writeSkill(join(workDir, '.kimi-code', 'skills', 'demo-project-skill'), 'demo-project-skill');
    await writeSkill(join(explicitDir, 'demo-explicit-skill'), 'demo-explicit-skill');
    const harness = createKimiHarnessV2({
      homeDir,
      identity: TEST_IDENTITY,
      skillDirs: [explicitDir],
    });
    try {
      const skills = await harness.listWorkspaceSkills(workDir);
      const byName = new Map(skills.map((skill) => [skill.name, skill]));
      expect(byName.get('demo-explicit-skill')).toMatchObject({
        description: 'Skill demo-explicit-skill for the escape-hatch test',
        source: 'user',
      });
      expect(byName.has('demo-user-skill')).toBe(false);
      expect(byName.has('demo-project-skill')).toBe(false);

      // The session skill catalog (the Skill tool's listing) goes through the
      // seeded engine runtime options, so it sees the same explicit source.
      const session = await harness.createSession({ workDir });
      const sessionNames = new Set((await session.listSkills()).map((skill) => skill.name));
      expect(sessionNames.has('demo-explicit-skill')).toBe(true);
      expect(sessionNames.has('demo-user-skill')).toBe(false);
      expect(sessionNames.has('demo-project-skill')).toBe(false);
      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('serves the plugin catalog from the v2 engine on an empty home', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-'));
    tempDirs.push(homeDir);
    const rpc = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    try {
      expect(await rpc.listPlugins()).toEqual([]);
      expect(await rpc.reloadPlugins()).toEqual({ added: [], removed: [], errors: [] });
      await expect(rpc.getPluginInfo('missing-plugin')).rejects.toThrow();
    } finally {
      await rpc.close();
    }
  });

  it('persists removeProvider as one atomic cascade (providers, models, defaults)', async () => {
    const { harness } = await makeHarness();
    try {
      await harness.setConfig({
        providers: {
          a: { type: 'openai', baseUrl: 'https://a.example.test/v1', apiKey: 'sk-a' },
          b: { type: 'openai', baseUrl: 'https://b.example.test/v1', apiKey: 'sk-b' },
        },
        models: {
          'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
          'b/m1': { provider: 'b', model: 'm1', maxContextSize: 100 },
        },
        defaultModel: 'b/m1',
        defaultProvider: 'b',
      });
      const next = await harness.removeProvider('b');
      expect(next.providers['b']).toBeUndefined();
      expect(next.providers['a']).toBeDefined();
      expect(next.models?.['b/m1']).toBeUndefined();
      expect(next.models?.['a/m1']).toBeDefined();
      expect(next.defaultModel).toBeUndefined();
      expect(next.defaultProvider).toBeUndefined();
      // A fresh read from disk sees the same state — the cascade landed as a
      // single atomic write, never a halfway-removed intermediate.
      const reread = await harness.getConfig({ reload: true });
      expect(reread.providers['b']).toBeUndefined();
      expect(reread.models?.['b/m1']).toBeUndefined();
      expect(reread.defaultModel).toBeUndefined();
      expect(reread.defaultProvider).toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it('preserves the deprecated secondary_model pool during provider removal', async () => {
    const { harness } = await makeHarness();
    try {
      const legacyPool = {
        defaultModel: 'a/m1',
        models: { 'a/m1': 'fast', 'b/m1': 'smart' },
      };
      await harness.setConfig({
        providers: {
          a: { type: 'openai', baseUrl: 'https://a.example.test/v1', apiKey: 'sk-a' },
          b: { type: 'openai', baseUrl: 'https://b.example.test/v1', apiKey: 'sk-b' },
        },
        models: {
          'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
          'b/m1': { provider: 'b', model: 'm1', maxContextSize: 100 },
        },
        secondaryModel: legacyPool,
      });

      const removed = await harness.removeProvider('b');
      expect(removed.secondaryModel).toEqual(legacyPool);
      const reread = await harness.getConfig({ reload: true });
      expect(reread.secondaryModel).toEqual(legacyPool);
    } finally {
      await harness.close();
    }
  });

  it('replaces config sections atomically and clears undefined sections', async () => {
    const { harness } = await makeHarness();
    try {
      expect(harness.supportsAtomicSectionReplace()).toBe(true);
      await harness.setConfig({
        providers: { a: { type: 'openai', baseUrl: 'https://a.example.test/v1', apiKey: 'sk-a' } },
        models: { 'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 } },
        defaultModel: 'a/m1',
      });
      await harness.replaceConfigSections({ defaultModel: undefined });
      const next = await harness.getConfig({ reload: true });
      expect(next.defaultModel).toBeUndefined();
      // Sections absent from the write stay untouched.
      expect(next.providers['a']).toBeDefined();
      expect(next.models?.['a/m1']).toBeDefined();
    } finally {
      await harness.close();
    }
  });

  it('round-trips the secondaryModel pool field to the [secondary_model] config section', async () => {
    const { harness, homeDir } = await makeHarness();
    try {
      await harness.setConfig({
        secondaryModel: {
          defaultModel: 'provider/fast',
          models: { 'provider/fast': 'fast and cheap' },
        },
      });

      const toml = await readFile(join(homeDir, 'config.toml'), 'utf-8');
      expect(toml).toContain('[secondary_model]');
      expect(toml).toContain('default_model');
      expect(toml).toContain('[secondary_model.models]');
      expect(toml).not.toContain('[subagent.models]');

      const reread = await harness.getConfig({ reload: true });
      expect(reread.secondaryModel).toEqual({
        defaultModel: 'provider/fast',
        models: { 'provider/fast': 'fast and cheap' },
      });
    } finally {
      await harness.close();
    }
  });

  it('deleteSession removes a session and rejects a missing id with session_not_found', async () => {
    const { harness, homeDir } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    try {
      const session = await harness.createSession({ workDir });
      await harness.deleteSession(session.id);
      await expect(harness.resumeSession({ id: session.id })).rejects.toMatchObject({
        code: ErrorCodes.SESSION_NOT_FOUND,
      });
      expect(await sessionDirExists(homeDir, session.id)).toBe(false);
      await expect(harness.deleteSession('session_missing')).rejects.toMatchObject({
        code: ErrorCodes.SESSION_NOT_FOUND,
      });
    } finally {
      await harness.close();
    }
  });
});

describe('SDKRpcClientV2 workspace trust', () => {
  it('reports an untrusted workspace with the project MCP servers it gates', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    await writeFile(
      join(workDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'root-server': {
            command: 'root-cmd',
            args: ['--safe'],
            cwd: '/tmp/root',
            env: { SECRET: 'hidden' },
          },
          'http-server': {
            transport: 'http',
            url: 'https://example.test/mcp',
            headers: { Authorization: 'Bearer hidden' },
            bearerTokenEnvVar: 'TOKEN',
          },
        },
      }),
      'utf-8',
    );
    await mkdir(join(workDir, '.kimi-code'), { recursive: true });
    await writeFile(
      join(workDir, '.kimi-code', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'nested-server': { command: 'nested-cmd' } } }),
      'utf-8',
    );
    try {
      const info = await harness.getWorkspaceTrustInfo(workDir);
      expect(info.trusted).toBe(false);
      expect(info.gatedMcpServers).toEqual([
        { name: 'http-server', transport: 'http', url: 'https://example.test/mcp' },
        { name: 'nested-server', transport: 'stdio', command: 'nested-cmd' },
        { name: 'root-server', transport: 'stdio', command: 'root-cmd', args: ['--safe'], cwd: '/tmp/root' },
      ]);
      const serialized = JSON.stringify(info);
      expect(serialized).not.toContain('hidden');
      expect(serialized).not.toContain('SECRET');
      expect(serialized).not.toContain('TOKEN');
    } finally {
      await harness.close();
    }
  });

  it('degrades the gated-server list to empty on an invalid project mcp.json', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    await writeFile(join(workDir, '.mcp.json'), '{not json', 'utf-8');
    try {
      const info = await harness.getWorkspaceTrustInfo(workDir);
      expect(info).toEqual({ trusted: false, gatedMcpServers: [] });
    } finally {
      await harness.close();
    }
  });

  it('trustWorkspace flips the state and persists the marker in the kimi home', async () => {
    const { harness, homeDir } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-work-'));
    tempDirs.push(workDir);
    try {
      await harness.trustWorkspace(workDir);
      expect(await harness.getWorkspaceTrustInfo(workDir)).toEqual({
        trusted: true,
        gatedMcpServers: [],
      });
      // The trust marker lives in the kimi home, never in the checkout.
      const markers = await readdir(join(homeDir, 'workspace-trust'));
      expect(markers.length).toBe(1);
      expect(await readdir(workDir)).not.toContain('workspace-trust');
    } finally {
      await harness.close();
    }
  });
});

describe('foldAgentWireReplay', () => {
  it('folds a journal into v1 replay records and the tool store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-fold-'));
    tempDirs.push(dir);
    const wirePath = join(dir, 'wire.jsonl');
    const records = [
      { type: 'metadata', protocol_version: '1.5', created_at: 1000 },
      {
        type: 'context.append_message',
        message: { role: 'user', content: [{ type: 'text', text: 'hello' }], toolCalls: [] },
        time: 1001,
      },
      { type: 'permission.set_mode', mode: 'auto', time: 1002 },
      {
        type: 'tools.update_store',
        key: 'todo',
        value: [{ title: 'old', status: 'done' }],
        time: 1003,
      },
      {
        type: 'tools.update_store',
        key: 'todo',
        value: [{ title: 'new', status: 'pending' }],
        time: 1004,
      },
      // A v2-only op the v1 restore switch does not know: ignored.
      { type: 'profile.bind', profileName: 'agent', systemPrompt: 'x', thinkingEffort: 'off', disallowedTools: [], time: 1005 },
    ];
    await writeFile(wirePath, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf-8');
    const folded = await foldAgentWireReplay(wirePath);
    expect(folded.replay).toEqual([
      {
        type: 'message',
        message: { role: 'user', content: [{ type: 'text', text: 'hello' }], toolCalls: [] },
        time: 1001,
      },
      { type: 'permission_updated', mode: 'auto', time: 1002 },
    ]);
    // Last write wins per store key.
    expect(folded.toolStore).toEqual({ todo: [{ title: 'new', status: 'pending' }] });
  });

  it('degrades to an empty fold on a missing or corrupt journal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-fold-'));
    tempDirs.push(dir);
    const empty = { replay: [], toolStore: {} };
    await expect(foldAgentWireReplay(join(dir, 'missing.jsonl'))).resolves.toEqual(empty);
    const emptyFile = join(dir, 'empty.jsonl');
    await writeFile(emptyFile, '', 'utf-8');
    await expect(foldAgentWireReplay(emptyFile)).resolves.toEqual(empty);
    const corrupt = join(dir, 'corrupt.jsonl');
    await writeFile(
      corrupt,
      '{"type":"metadata","protocol_version":"1.5","created_at":1}\n{not json\n{"type":"permission.set_mode","mode":"auto"}\n',
      'utf-8',
    );
    await expect(foldAgentWireReplay(corrupt)).resolves.toEqual(empty);
    // A truncated TAIL line is tolerated: everything before it still folds.
    const truncatedTail = join(dir, 'truncated.jsonl');
    await writeFile(
      truncatedTail,
      '{"type":"metadata","protocol_version":"1.5","created_at":1}\n{"type":"permission.set_mode","mode":"auto","time":2}\n{"type":"context.append_messa',
      'utf-8',
    );
    const folded = await foldAgentWireReplay(truncatedTail);
    expect(folded.replay).toEqual([{ type: 'permission_updated', mode: 'auto', time: 2 }]);
  });
});

describe('SDKRpcClientV2 engine telemetry', () => {
  it('forwards engine-side events to the host-supplied telemetry client', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-tel-'));
    tempDirs.push(homeDir);
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-tel-work-'));
    tempDirs.push(workDir);
    const records: TelemetryRecord[] = [];
    const harness = createKimiHarnessV2({
      homeDir,
      identity: TEST_IDENTITY,
      telemetry: recordingTelemetry(records),
    });
    try {
      const session = await harness.createSession({ workDir });
      await session.setPermission('yolo');
      expect(records.some((record) => record.event === 'yolo_toggle')).toBe(true);
      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('honors telemetry = false for engine-side events', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-tel-off-'));
    tempDirs.push(homeDir);
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-tel-off-work-'));
    tempDirs.push(workDir);
    await writeFile(join(homeDir, 'config.toml'), 'telemetry = false\n', 'utf-8');
    const records: TelemetryRecord[] = [];
    const harness = createKimiHarnessV2({
      homeDir,
      identity: TEST_IDENTITY,
      telemetry: recordingTelemetry(records),
    });
    try {
      const session = await harness.createSession({ workDir });
      await session.setPermission('yolo');
      expect(records.some((record) => record.event === 'yolo_toggle')).toBe(false);
      await session.close();
    } finally {
      await harness.close();
    }
  });
});

describe('removeProviderFromConfig', () => {
  it('drops the provider, its models and dangling default pointers without mutating the input', () => {
    const config = {
      providers: {
        a: { type: 'openai', baseUrl: 'https://a.example.test/v1' },
        b: { type: 'openai', baseUrl: 'https://b.example.test/v1' },
      },
      models: {
        'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
        'b/m1': { provider: 'b', model: 'm1', maxContextSize: 100 },
        'my-b': { provider: 'b', model: 'm1', maxContextSize: 100 },
      },
      defaultModel: 'my-b',
      defaultProvider: 'b',
    } as unknown as KimiConfig;

    const next = removeProviderFromConfig(config, 'b');

    expect(Object.keys(next.providers)).toEqual(['a']);
    expect(Object.keys(next.models ?? {})).toEqual(['a/m1']);
    expect(next.defaultModel).toBeUndefined();
    expect(next.defaultProvider).toBeUndefined();
    // The input config is left untouched (the staging host threads the copy).
    expect(config.providers['b']).toBeDefined();
    expect(config.models?.['b/m1']).toBeDefined();
    expect(config.defaultModel).toBe('my-b');
  });

  it('keeps the default pointers when they do not dangle', () => {
    const config = {
      providers: {
        a: { type: 'openai' },
        b: { type: 'openai' },
      },
      models: {
        'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
        'b/m1': { provider: 'b', model: 'm1', maxContextSize: 100 },
      },
      defaultModel: 'a/m1',
      defaultProvider: 'a',
    } as unknown as KimiConfig;

    const next = removeProviderFromConfig(config, 'b');

    expect(Object.keys(next.providers)).toEqual(['a']);
    expect(Object.keys(next.models ?? {})).toEqual(['a/m1']);
    expect(next.defaultModel).toBe('a/m1');
    expect(next.defaultProvider).toBe('a');
  });

  it('preserves the secondary_model section unchanged, including dangling aliases', () => {
    const config = {
      providers: { a: { type: 'openai' }, b: { type: 'openai' } },
      models: {
        'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
        'b/m1': { provider: 'b', model: 'm1', maxContextSize: 100 },
      },
      secondaryModel: {
        defaultModel: 'b/m1',
        models: { 'a/m1': 'fast', 'b/m1': 'smart' },
      },
    } as unknown as KimiConfig;

    expect(removeProviderFromConfig(config, 'b').secondaryModel).toEqual(
      config.secondaryModel,
    );
  });

  it('leaves the secondary_model section untouched when nothing dangles', () => {
    const config = {
      providers: { a: { type: 'openai' }, b: { type: 'openai' } },
      models: {
        'a/m1': { provider: 'a', model: 'm1', maxContextSize: 100 },
        'b/m1': { provider: 'b', model: 'm1', maxContextSize: 100 },
      },
      secondaryModel: { defaultModel: 'a/m1' },
    } as unknown as KimiConfig;

    const next = removeProviderFromConfig(config, 'b');

    expect(next.secondaryModel).toEqual({ defaultModel: 'a/m1' });
  });
});

describe('SDKRpcClientV2 AITP Research Mode', () => {
  it('getResearch returns an inactive snapshot without triggering AITP I/O', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-'));
    tempDirs.push(workDir);
    const session = await harness.createSession({ id: 'ses_research_get', workDir });
    try {
      const snapshot = await session.getResearch();
      expect(snapshot.mode).toBe('inactive');
      expect(snapshot.loopStatus).toBe('active');
      expect(snapshot.revision).toBe(0);
      expect(snapshot.questions).toHaveLength(0);
      expect(snapshot.aitpHealth.phase).toBe('inactive');
    } finally {
      await harness.close();
    }
  });

  it('commandResearch resolves human decisions and acknowledges lifecycle alerts', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-attention-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-attention-work-'));
    tempDirs.push(homeDir, workDir);
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    const summary = await client.createSession({ id: 'ses_research_attention', workDir });
    const session = new Session({
      id: summary.id,
      workDir: summary.workDir,
      summary,
      rpc: client,
    });
    try {
      await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
      const liveSession = getLiveSessionById(client.engineAccessor, session.id);
      expect(liveSession).toBeDefined();
      const agent = await ensureMainAgent(liveSession!);
      const research = agent.accessor.get(IAgentResearchService);
      const gate = research.requestHumanDecision({
        kind: 'decision',
        prompt: 'Choose the next research direction.',
      });
      const waiting = await session.getResearch();
      expect(waiting.phase).toBe('awaiting_human');
      expect(waiting.humanGate?.gateId).toBe(gate.gateId);

      const resolved = await session.commandResearch({
        kind: 'resolve_decision',
        gateId: gate.gateId,
        resolution: 'Continue with the measured path.',
        nextPhase: 'idle',
      });
      expect(resolved.snapshot.phase).toBe('idle');
      expect(resolved.snapshot.humanGate).toMatchObject({
        gateId: gate.gateId,
        resolution: 'Continue with the measured path.',
        resolvedAt: expect.any(Number),
      });

      const line = await session.commandResearch({
        kind: 'create_line',
        slug: 'main',
        title: 'Main line',
      });
      const question = await session.commandResearch({
        kind: 'create_question',
        lineSlug: 'main',
        wording: 'Why?',
      });
      const questionId = question.snapshot.questions[0]!.id;
      const closed = await session.commandResearch({
        kind: 'close_question',
        questionId,
        expectedRevision: question.snapshot.revision,
      });
      const reopened = await session.commandResearch({
        kind: 'reopen_question',
        questionId,
        expectedRevision: closed.snapshot.revision,
      });
      const alert = reopened.snapshot.alerts.find(
        (candidate) => candidate.fingerprint === `research.alert.reopened.question.${questionId}`,
      );
      expect(line.snapshot.lines[0]?.slug).toBe('main');
      expect(alert).toBeDefined();

      const acknowledged = await session.commandResearch({
        kind: 'acknowledge_alert',
        fingerprint: alert!.fingerprint,
      });
      expect(acknowledged.snapshot.alerts.find(
        (candidate) => candidate.fingerprint === alert!.fingerprint,
      )).toMatchObject({ acknowledgedAt: expect.any(Number) });
    } finally {
      await session.close();
      await client.close();
    }
  });

  it('commandResearch preserves line and question assessments through dedicated methods', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-update-'));
    tempDirs.push(workDir);
    const session = await harness.createSession({ id: 'ses_research_update', workDir });
    try {
      await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
      await session.commandResearch({
        kind: 'create_line',
        slug: 'main',
        title: 'Main line',
        assessment: 'initial direction',
      });
      const updated = await session.commandResearch({
        kind: 'update_line',
        lineSlug: 'main',
        expectedRevision: 1,
        assessment: 'supported direction',
      });
      expect(updated.snapshot.lines[0]).toMatchObject({
        slug: 'main',
        assessment: 'supported direction',
        revision: 2,
      });

      const withQuestion = await session.commandResearch({
        kind: 'create_question',
        lineSlug: 'main',
        wording: 'Why?',
        assessment: 'candidate mechanism',
      });
      expect(withQuestion.snapshot.questions[0]).toMatchObject({
        wording: 'Why?',
        assessment: 'candidate mechanism',
      });
    } finally {
      await harness.close();
    }
  });

  it('commandResearch dispatches typed evidence review and run observation', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-run-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-run-work-'));
    tempDirs.push(homeDir, workDir);
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    const sessionSummary = await client.createSession({ id: 'ses_research_run', workDir });
    const session = new Session({
      id: sessionSummary.id,
      workDir: sessionSummary.workDir,
      summary: sessionSummary,
      rpc: client,
    });
    try {
      await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
      const liveSession = getLiveSessionById(client.engineAccessor, session.id);
      const agent = await ensureMainAgent(liveSession!);
      const research = agent.accessor.get(IAgentResearchService);
      research.setPhase('gap_analysis');
      const action = research.planAction({
        kind: 'simulation',
        purpose: 'Run the bounded HPC calculation.',
        stopCondition: 'Stop after the declared analyzer evidence exists.',
      });
      research.startAction(action.actionId);
      const before = await session.getResearch();

      const reviewed = await session.commandResearch({
        kind: 'review_evidence',
        expectedRevision: before.revision,
        packet: {
          packet_id: 'packet-sdk-1',
          kind: 'observation',
          claim: 'The scheduler has started the bounded calculation.',
          evidence: 'The scheduler reports a running job.',
          action_id: action.actionId,
          assumptions: [],
          tests: [],
          artifact_refs: [],
          source_refs: [],
          limitations: [],
          confidence: 'medium',
        },
      });
      expect(reviewed.snapshot.revision).toBe(before.revision);

      const observed = await session.commandResearch({
        kind: 'observe_run',
        actionId: action.actionId,
        expectedRevision: before.revision,
        campaign: 'bi2se3-r2',
        jobId: '3128781',
        stage: 'scf',
        schedulerState: 'running',
        artifactRefs: ['scf.log'],
      });
      expect(observed.snapshot.currentRun).toMatchObject({
        actionId: action.actionId,
        jobId: '3128781',
        schedulerState: 'running',
      });
    } finally {
      await session.close();
      await client.close();
    }
  });

  it('commandResearch forwards stale checkpoint revisions without creating pending state', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-checkpoint-'));
    tempDirs.push(workDir);
    const session = await harness.createSession({ id: 'ses_research_checkpoint', workDir });
    try {
      const entered = await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
      const expectedRevision = entered.snapshot.revision;
      const advanced = await session.commandResearch({
        kind: 'create_line',
        slug: 'main',
        title: 'Main line',
      });
      expect(advanced.snapshot.revision).toBeGreaterThan(expectedRevision);

      await expect(session.commandResearch({
        kind: 'propose_checkpoint',
        expectedRevision,
        lineSlug: 'main',
      })).rejects.toMatchObject({ code: 'research.revision_stale' });
      expect((await session.getResearch()).pendingCheckpoint).toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it('commandResearch returns the post-mutation snapshot for synchronous mutations', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-sync-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-sync-work-'));
    tempDirs.push(homeDir, workDir);
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    const summary = await client.createSession({ id: 'ses_research_sync', workDir });
    const session = new Session({
      id: summary.id,
      workDir: summary.workDir,
      summary,
      rpc: client,
    });
    try {
      await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
      const liveSession = getLiveSessionById(client.engineAccessor, session.id);
      const agent = await ensureMainAgent(liveSession!);
      const research = agent.accessor.get(IAgentResearchService);
      const createLine = vi.spyOn(research, 'createLine');

      const result = await session.commandResearch({
        kind: 'create_line',
        slug: 'sync',
        title: 'Synchronous line',
      });

      expect(createLine).toHaveBeenCalledWith({
        slug: 'sync',
        title: 'Synchronous line',
        objective: undefined,
        assessment: undefined,
      });
      expect(result.snapshot.lines).toContainEqual(
        expect.objectContaining({ slug: 'sync', title: 'Synchronous line' }),
      );
      expect(result.snapshot.revision).toBeGreaterThan(0);
    } finally {
      await session.close();
      await client.close();
    }
  });

  it('commandResearch propagates synchronous mutation errors', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-error-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-error-work-'));
    tempDirs.push(homeDir, workDir);
    const client = new SDKRpcClientV2({ homeDir, identity: TEST_IDENTITY });
    const summary = await client.createSession({ id: 'ses_research_error', workDir });
    const session = new Session({
      id: summary.id,
      workDir: summary.workDir,
      summary,
      rpc: client,
    });
    try {
      await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
      const liveSession = getLiveSessionById(client.engineAccessor, session.id);
      const agent = await ensureMainAgent(liveSession!);
      const research = agent.accessor.get(IAgentResearchService);
      const failure = new Error('research mutation failed');
      const createLine = vi.spyOn(research, 'createLine').mockImplementation(() => {
        throw failure;
      });

      try {
        await expect(session.commandResearch({
          kind: 'create_line',
          slug: 'error',
          title: 'Error line',
        })).rejects.toBe(failure);
      } finally {
        createLine.mockRestore();
      }
    } finally {
      await session.close();
      await client.close();
    }
  });

  it('commandResearch pause_loop and resume_loop return real loopStatus snapshots', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-loop-'));
    tempDirs.push(workDir);
    const session = await harness.createSession({ id: 'ses_research_loop', workDir });
    try {
      const entered = await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
      expect(entered.snapshot.mode).not.toBe('inactive');

      const revision = entered.snapshot.revision;
      const paused = await session.commandResearch({ kind: 'pause_loop', expectedRevision: revision });
      expect(paused.snapshot.loopStatus).toBe('paused');

      await expect(
        session.commandResearch({ kind: 'resume_loop', expectedRevision: revision + 1 }),
      ).rejects.toMatchObject({ code: 'research.revision_stale' });

      const resumed = await session.commandResearch({ kind: 'resume_loop', expectedRevision: revision });
      expect(resumed.snapshot.loopStatus).toBe('active');
    } finally {
      await session.close();
      await harness.close();
    }
  });

  it('commandResearch enter_mode is available without an experimental flag', async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE', '0');
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-enter-'));
    tempDirs.push(workDir);
    const session = await harness.createSession({ id: 'ses_research_enter', workDir });
    try {
      const entered = await session.commandResearch({ kind: 'enter_mode', actor: 'user' });
      expect(entered.snapshot.mode).not.toBe('inactive');
    } finally {
      await harness.close();
      vi.unstubAllEnvs();
    }
  });

  it('commandResearch pause_loop with stale revision throws research.revision_stale', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-pause-'));
    tempDirs.push(workDir);
    const session = await harness.createSession({ id: 'ses_research_pause', workDir });
    try {
      // pause_loop routes through the dedicated mode service, which enforces
      // the public Research revision. Revision 0 is the initial state, so 999 is stale.
      await expect(
        session.commandResearch({ kind: 'pause_loop', expectedRevision: 999 }),
      ).rejects.toMatchObject({
        code: 'research.revision_stale',
      });
    } finally {
      await harness.close();
    }
  });

  it('commandResearch set_focus reports inactive before validating the question', async () => {
    const { harness } = await makeHarness();
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-sdk-v2-research-focus-'));
    tempDirs.push(workDir);
    const session = await harness.createSession({ id: 'ses_research_focus', workDir });
    try {
      await expect(
        session.commandResearch({
          kind: 'set_focus',
          questionId: 'q-nonexistent',
          expectedRevision: 999,
        }),
      ).rejects.toMatchObject({
        code: 'aitp.mode_inactive',
      });
    } finally {
      await harness.close();
    }
  });
});

async function writeSkill(dir: string, name: string): Promise<void> {  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Skill ${name} for the escape-hatch test\n---\n\nBody of ${name}.\n`,
    'utf-8',
  );
}
