import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRPC, KimiCore, type CoreAPI, type SDKAPI } from '../../src';

const BASE_CONFIG = `
default_model = "kimi-code/kimi-for-coding"

[providers."managed:kimi-code"]
type = "kimi"
api_key = "test-key"
base_url = "https://api.example/v1"

[models."kimi-code/kimi-for-coding"]
provider = "managed:kimi-code"
model = "kimi-for-coding"
max_context_size = 1000000
`;

describe('default AITP runtime in sessions', () => {
  let tmp: string;
  let homeDir: string;
  let workDir: string;
  let repoPath: string;
  let configPath: string;
  let previousHakimiAitpRepo: string | undefined;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'kimi-default-aitp-runtime-'));
    homeDir = path.join(tmp, 'home');
    workDir = path.join(tmp, 'workspace');
    repoPath = path.join(tmp, 'repos', 'AITP-Research-Protocol');
    configPath = path.join(tmp, 'config.toml');
    previousHakimiAitpRepo = process.env['HAKIMI_AITP_REPO'];
    process.env['HAKIMI_AITP_REPO'] = repoPath;
    await mkdir(workDir, { recursive: true });
    await mkdir(path.join(workDir, '.git'), { recursive: true });
    await writeFile(configPath, BASE_CONFIG);
    await makeFakeAitpRepo(repoPath);
  });

  afterEach(async () => {
    if (previousHakimiAitpRepo === undefined) {
      delete process.env['HAKIMI_AITP_REPO'];
    } else {
      process.env['HAKIMI_AITP_REPO'] = previousHakimiAitpRepo;
    }
    await rm(tmp, { recursive: true, force: true });
  });

  it('loads rendered AITP skills by default when a local AITP repo is available', async () => {
    const rpc = await createTestRpc();
    const created = await rpc.createSession({
      workDir,
      mcpServers: {
        aitp: {
          transport: 'stdio',
          command: 'test-disabled-aitp',
          enabled: false,
        },
      },
    });

    const skills = await rpc.listSkills({ sessionId: created.id });
    const mcpServers = await rpc.listMcpServers({ sessionId: created.id });

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'aitp-runtime', source: 'extra' }),
        expect.objectContaining({ name: 'using-aitp', source: 'extra' }),
      ]),
    );
    expect(mcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aitp',
          transport: 'stdio',
        }),
      ]),
    );
    expect(mcpServers.find((server) => server.name === 'aitp')?.status).toBe('disabled');

    await rpc.closeSession({ sessionId: created.id });
  });

  it('keeps caller MCP entries ahead of the default AITP server in sessions', async () => {
    const rpc = await createTestRpc();
    const created = await rpc.createSession({
      workDir,
      mcpServers: {
        aitp: {
          transport: 'stdio',
          command: 'custom-aitp',
          args: ['serve'],
          enabled: false,
        },
      },
    });

    const mcpServers = await rpc.listMcpServers({ sessionId: created.id });

    expect(mcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aitp',
          transport: 'stdio',
        }),
      ]),
    );
    expect(mcpServers.find((server) => server.name === 'aitp')?.status).toBe('disabled');

    await rpc.closeSession({ sessionId: created.id });
  });

  async function createTestRpc() {
    const [coreRpc, sdkRpc] = createRPC<CoreAPI, SDKAPI>();
    void new KimiCore(coreRpc, { homeDir, configPath });
    return sdkRpc({
      emitEvent: vi.fn(),
      requestApproval: vi.fn(async () => ({ decision: 'rejected' as const })),
      requestQuestion: vi.fn(async () => null),
      toolCall: vi.fn(async () => ({ output: '' })),
    });
  }
});

async function makeFakeAitpRepo(repoPath: string): Promise<void> {
  await mkdir(path.join(repoPath, 'brain', 'v5'), { recursive: true });
  await writeFile(path.join(repoPath, 'brain', 'v5', 'cli.py'), '');
  await writeFile(path.join(repoPath, 'brain', 'v5', 'native_mcp.py'), '');
  const templateDir = path.join(repoPath, 'deploy', 'templates', 'kimi-code');
  await mkdir(templateDir, { recursive: true });
  await writeFile(
    path.join(templateDir, 'using-aitp.md'),
    skillTemplate('using-aitp', 'Using {{REPO_ROOT}} {{TOPICS_ROOT}} {{TARGET_ROOT}}'),
  );
  await writeFile(
    path.join(templateDir, 'aitp-runtime.md'),
    skillTemplate('aitp-runtime', 'Runtime {{REPO_ROOT}} {{TOPICS_ROOT}} {{TARGET_ROOT}}'),
  );
}

function skillTemplate(name: string, content: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: ${name} default runtime test skill`,
    '---',
    '',
    content,
    '',
  ].join('\n');
}
