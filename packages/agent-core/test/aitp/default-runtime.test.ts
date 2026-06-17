import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  mergeDefaultAitpMcpConfig,
  resolveDefaultAitpRuntime,
  type DefaultAitpRuntime,
} from '../../src/aitp';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
  }
});

describe('default AITP runtime discovery', () => {
  it('clones a managed AITP mirror, renders remote-linked skills, and builds default MCP config', async () => {
    const root = await makeTempDir('hakimi-default-aitp-');
    const homeDir = path.join(root, 'home');
    const workDir = path.join(root, 'workspace', 'project');
    const topicsRoot = path.join(root, 'workspace', 'research', 'aitp-topics');
    const repoPath = path.join(homeDir, 'aitp', 'runtime', 'AITP-Research-Protocol');
    const git = fakeGitRunner({
      cloneRepoPath: repoPath,
      cloneTemplates: {
        'using-aitp.md': skillTemplate('using-aitp', 'Use {{REPO_ROOT}} with {{TOPICS_ROOT}}.'),
        'aitp-runtime.md': skillTemplate('aitp-runtime', 'Runtime for {{TARGET_ROOT}}.'),
      },
    });
    await mkdir(path.join(workDir, '.git'), { recursive: true });
    await mkdir(path.join(topicsRoot, '.aitp'), { recursive: true });

    const runtime = await resolveDefaultAitpRuntime({
      workDir,
      homeDir,
      env: {
        AITP_TOPICS_ROOT: topicsRoot,
        HAKIMI_AITP_REMOTE: 'https://example.test/AITP-Research-Protocol.git',
      },
      runGit: git.run,
    });

    expect(runtime?.repoPath).toBe(path.resolve(repoPath));
    expect(runtime?.topicsRoot).toBe(path.resolve(topicsRoot));
    expect(runtime?.targetRoot).toBe(path.resolve(path.join(root, 'workspace')));
    expect(runtime?.remoteSync).toEqual({
      status: 'cloned',
      remoteUrl: 'https://example.test/AITP-Research-Protocol.git',
    });
    expect(runtime?.mcpServerName).toBe('aitp');
    expect(runtime?.mcpServer).toMatchObject({
      transport: 'stdio',
      command: 'uv',
      cwd: path.resolve(repoPath),
      env: {
        AITP_REPO_ROOT: path.resolve(repoPath),
        HAKIMI_AITP_REPO: path.resolve(repoPath),
        AITP_TOPICS_ROOT: path.resolve(topicsRoot),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    expect(runtime?.mcpServer.transport === 'stdio' ? runtime.mcpServer.args : []).toEqual([
      'run',
      '--with',
      'pyyaml',
      '--with',
      'jsonschema',
      '--with',
      'fastmcp',
      'python',
      path.join(path.resolve(repoPath), 'brain', 'v5', 'native_mcp.py'),
    ]);

    const usingAitp = await readFile(path.join(runtime!.skillDir!, 'using-aitp.md'), 'utf-8');
    const aitpRuntime = await readFile(path.join(runtime!.skillDir!, 'aitp-runtime.md'), 'utf-8');
    expect(usingAitp).toContain(path.resolve(repoPath).replaceAll('\\', '/'));
    expect(usingAitp).toContain(path.resolve(topicsRoot).replaceAll('\\', '/'));
    expect(usingAitp).not.toContain('{{REPO_ROOT}}');
    expect(aitpRuntime).toContain(path.resolve(path.join(root, 'workspace')).replaceAll('\\', '/'));
    expect(git.calls).toContainEqual([
      'clone',
      '--depth',
      '1',
      'https://example.test/AITP-Research-Protocol.git',
      path.resolve(repoPath),
    ]);
  });

  it('fast-forwards a clean explicit AITP checkout before rendering skills', async () => {
    const root = await makeTempDir('hakimi-default-aitp-pull-');
    const homeDir = path.join(root, 'home');
    const workDir = path.join(root, 'workspace');
    const repoPath = path.join(root, 'repos', 'AITP-Research-Protocol');
    await makeFakeAitpRepo(repoPath, {
      'using-aitp.md': skillTemplate('using-aitp', 'first {{REPO_ROOT}}'),
      'aitp-runtime.md': skillTemplate('aitp-runtime', 'runtime'),
    });
    const git = fakeGitRunner({
      onPull: async () => {
        await writeFile(
          path.join(repoPath, 'deploy', 'templates', 'kimi-code', 'using-aitp.md'),
          skillTemplate('using-aitp', 'second {{REPO_ROOT}}'),
        );
      },
    });

    const runtime = await resolveDefaultAitpRuntime({
      workDir,
      homeDir,
      env: { HAKIMI_AITP_REPO: repoPath },
      runGit: git.run,
    });

    expect(runtime?.repoPath).toBe(path.resolve(repoPath));
    expect(runtime?.remoteSync.status).toBe('updated');
    await expect(readFile(path.join(runtime!.skillDir!, 'using-aitp.md'), 'utf-8')).resolves.toContain(
      'second',
    );
    expect(git.calls).toContainEqual(['-C', path.resolve(repoPath), 'pull', '--ff-only', '--quiet']);
    expect(git.calls).not.toContainEqual([
      '-C',
      path.resolve(repoPath),
      'remote',
      'set-url',
      'origin',
      'https://github.com/bhjia-phys/AITP-Research-Protocol.git',
    ]);
  });

  it('uses a dirty explicit AITP checkout without updating it', async () => {
    const root = await makeTempDir('hakimi-default-aitp-refresh-');
    const homeDir = path.join(root, 'home');
    const workDir = path.join(root, 'workspace');
    const repoPath = path.join(root, 'repos', 'AITP-Research-Protocol');
    await makeFakeAitpRepo(repoPath, {
      'using-aitp.md': skillTemplate('using-aitp', 'first {{REPO_ROOT}}'),
      'aitp-runtime.md': skillTemplate('aitp-runtime', 'runtime'),
    });
    const git = fakeGitRunner({ statusStdout: ' M deploy/templates/kimi-code/using-aitp.md\n' });

    const runtime = await resolveDefaultAitpRuntime({
      workDir,
      homeDir,
      env: { HAKIMI_AITP_REPO: repoPath },
      runGit: git.run,
    });

    expect(runtime?.remoteSync.status).toBe('skipped_dirty');
    await expect(readFile(path.join(runtime!.skillDir!, 'using-aitp.md'), 'utf-8')).resolves.toContain(
      'first',
    );
    expect(git.calls).not.toContainEqual(['-C', path.resolve(repoPath), 'pull', '--ff-only', '--quiet']);
  });

  it('does not override an existing AITP MCP server', () => {
    const runtime = fakeRuntime();
    const merged = mergeDefaultAitpMcpConfig(
      {
        servers: {
          aitp: {
            transport: 'stdio',
            command: 'custom-aitp',
          },
        },
      },
      runtime,
    );

    expect(merged?.servers['aitp']).toMatchObject({
      transport: 'stdio',
      command: 'custom-aitp',
    });
  });

  it('injects the default AITP MCP server when none is configured', () => {
    const runtime = fakeRuntime();
    const merged = mergeDefaultAitpMcpConfig(undefined, runtime);

    expect(merged?.servers).toEqual({
      aitp: runtime.mcpServer,
    });
  });

  it('can be disabled for sessions that do not want the default AITP runtime', async () => {
    const root = await makeTempDir('hakimi-default-aitp-disabled-');
    const repoPath = path.join(root, 'repos', 'AITP-Research-Protocol');
    await makeFakeAitpRepo(repoPath, {
      'using-aitp.md': skillTemplate('using-aitp', 'content'),
      'aitp-runtime.md': skillTemplate('aitp-runtime', 'content'),
    });

    await expect(
      resolveDefaultAitpRuntime({
        workDir: root,
        homeDir: path.join(root, 'home'),
        env: {
          HAKIMI_AITP_REPO: repoPath,
          HAKIMI_AITP_DEFAULT_DISABLED: '1',
        },
      }),
    ).resolves.toBeUndefined();
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function makeFakeAitpRepo(
  repoPath: string,
  templates: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(path.join(repoPath, 'brain', 'v5'), { recursive: true });
  await mkdir(path.join(repoPath, '.git'), { recursive: true });
  await writeFile(path.join(repoPath, 'brain', 'v5', 'cli.py'), '');
  await writeFile(path.join(repoPath, 'brain', 'v5', 'native_mcp.py'), '');
  const templateDir = path.join(repoPath, 'deploy', 'templates', 'kimi-code');
  await mkdir(templateDir, { recursive: true });
  for (const [fileName, content] of Object.entries(templates)) {
    await writeFile(path.join(templateDir, fileName), content);
  }
}

function skillTemplate(name: string, content: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: ${name} test skill`,
    '---',
    '',
    content,
    '',
  ].join('\n');
}

function fakeRuntime(): DefaultAitpRuntime {
  return {
    repoPath: 'F:/repo',
    topicsRoot: 'F:/workspace/research/aitp-topics',
    targetRoot: 'F:/workspace',
    remoteSync: { status: 'updated' },
    mcpServerName: 'aitp',
    mcpServer: {
      transport: 'stdio',
      command: 'uv',
      args: ['run', 'python', 'native_mcp.py'],
    },
  };
}

function fakeGitRunner(options: {
  readonly cloneRepoPath?: string;
  readonly cloneTemplates?: Readonly<Record<string, string>>;
  readonly statusStdout?: string;
  readonly onPull?: () => Promise<void>;
} = {}): {
  readonly calls: string[][];
  readonly run: (args: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
} {
  const calls: string[][] = [];
  return {
    calls,
    run: async (args) => {
      calls.push([...args]);
      if (args[0] === 'clone') {
        const repoPath = path.resolve(String(args[args.length - 1]));
        if (options.cloneRepoPath !== undefined && repoPath !== path.resolve(options.cloneRepoPath)) {
          return { exitCode: 1, stdout: '', stderr: 'unexpected clone target' };
        }
        await makeFakeAitpRepo(repoPath, options.cloneTemplates ?? {
          'using-aitp.md': skillTemplate('using-aitp', 'content'),
          'aitp-runtime.md': skillTemplate('aitp-runtime', 'content'),
        });
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (args.includes('status')) {
        return { exitCode: 0, stdout: options.statusStdout ?? '', stderr: '' };
      }
      if (args.includes('pull')) {
        await options.onPull?.();
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  };
}
