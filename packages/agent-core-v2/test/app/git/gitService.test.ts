import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DisposableStore } from '#/_base/di/lifecycle';
import { createServices, type TestInstantiationService } from '#/_base/di/test';
import { IGitService } from '#/app/git/git';
import { GitService } from '#/app/git/gitService';
import { findGitWorkTree } from '#/app/git/workTree';
import { ErrorCodes } from '#/errors';
import { HostFileSystem } from '#/os/backends/node-local/hostFsService';
import { HostProcessService } from '#/os/backends/node-local/hostProcessService';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { IHostProcessService, type IHostProcess } from '#/os/interface/hostProcess';
import { IRuntimeResolver, IWorkspaceInstanceManager, type WorkspaceInstanceChange } from '#/workspace/workspaceInstance/workspaceInstanceManager';
import { Event } from '#/_base/event';
import type { Runtime } from '#/runtime/runtime';
import { normalize } from 'pathe';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString()
    .trim();
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function processWithOutput(stdoutText: string, wait: Promise<number>): IHostProcess {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.end(stdoutText);
  stderr.end('');
  return {
    _serviceBrand: undefined,
    stdin,
    stdout,
    stderr,
    pid: 1,
    exitCode: null,
    wait: () => wait,
    kill: async () => {},
    dispose: () => {
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    },
  };
}

function stubGhResponses(
  process: HostProcessService,
  responses: readonly string[],
): string[] {
  const calls: string[] = [];
  const realSpawn = process.spawn.bind(process);
  vi.spyOn(process, 'spawn').mockImplementation(async (command, args, options) => {
    if (command !== 'gh') return realSpawn(command, args, options);
    const response = responses[calls.length] ?? '';
    calls.push(options?.cwd ?? '');
    return processWithOutput(response, Promise.resolve(0));
  });
  return calls;
}

interface DeferredGhCall {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly resolve: (exitCode: number) => void;
}

function stubDeferredGhResponses(
  process: HostProcessService,
  responses: readonly string[],
): { readonly calls: DeferredGhCall[]; readonly started: readonly Promise<void>[] } {
  const calls: DeferredGhCall[] = [];
  const gates = responses.map(() => deferred<number>());
  const startedSignals = responses.map(() => deferred<void>());
  const realSpawn = process.spawn.bind(process);
  vi.spyOn(process, 'spawn').mockImplementation(async (command, args, options) => {
    if (command !== 'gh') return realSpawn(command, args, options);
    const index = calls.length;
    const response = responses[index] ?? '';
    const gate = gates[index] ?? deferred<number>();
    calls.push({
      cwd: options?.cwd ?? '',
      args: [...(args ?? [])],
      resolve: gate.resolve,
    });
    startedSignals[index]?.resolve(undefined);
    return processWithOutput(response, gate.promise);
  });
  return { calls, started: startedSignals.map(({ promise }) => promise) };
}

describe('GitService', () => {
  let repo: string;
  let disposables: DisposableStore;
  let ix: TestInstantiationService;
  let service: IGitService;
  let hostProcess: HostProcessService;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'git-service-'));
    git(repo, 'init');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'commit.gpgsign', 'false');
    disposables = new DisposableStore();
    hostProcess = new HostProcessService();
    const runtime = { process: hostProcess } as unknown as Runtime;
    ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.define(IHostProcessService, HostProcessService);
        reg.define(IHostFileSystem, HostFileSystem);
        reg.defineInstance(IRuntimeResolver, {
          _serviceBrand: undefined,
          inspect: () => runtime,
          acquire: () => ({ runtime, track: (resource) => resource, dispose: () => {} }),
        });
        reg.definePartialInstance(IWorkspaceInstanceManager, {
          findByRoot: () => ({ id: 'workspace-1' } as never),
          onDidChange: Event.None as Event<WorkspaceInstanceChange>,
        });
        reg.define(IGitService, GitService);
      },
    });
    service = ix.get(IGitService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    disposables.dispose();
    rmSync(repo, { recursive: true, force: true });
  });

  function commitAll(message: string): void {
    git(repo, 'add', '-A');
    git(repo, 'commit', '-m', message);
  }

  describe('status', () => {
    it('reports a clean tree', async () => {
      writeFileSync(join(repo, 'a.txt'), 'hello\n');
      commitAll('init');

      const result = await service.status(repo);
      expect(typeof result.branch).toBe('string');
      expect(result.entries).toEqual({});
      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(0);
      expect(result.pullRequest).toBeNull();
    });

    it('reports a modified file with numstat', async () => {
      writeFileSync(join(repo, 'a.txt'), 'line1\n');
      commitAll('init');
      writeFileSync(join(repo, 'a.txt'), 'line1\nline2\nline3\n');

      const result = await service.status(repo);
      expect(result.entries).toEqual({ 'a.txt': 'modified' });
      expect(result.additions).toBe(2);
      expect(result.deletions).toBe(0);
    });

    it('restricts entries to the path filter', async () => {
      writeFileSync(join(repo, 'a.txt'), 'a\n');
      writeFileSync(join(repo, 'b.txt'), 'b\n');
      commitAll('init');
      writeFileSync(join(repo, 'a.txt'), 'a2\n');
      writeFileSync(join(repo, 'b.txt'), 'b2\n');

      const result = await service.status(repo, new Set(['a.txt']));
      expect(result.entries).toEqual({ 'a.txt': 'modified' });
    });

    it('throws FS_GIT_UNAVAILABLE when not a repo', async () => {
      const notRepo = mkdtempSync(join(tmpdir(), 'not-repo-'));
      const savedCeiling = process.env['GIT_CEILING_DIRECTORIES'];
      process.env['GIT_CEILING_DIRECTORIES'] = dirname(notRepo);
      try {
        await expect(service.status(notRepo)).rejects.toMatchObject({
          code: ErrorCodes.FS_GIT_UNAVAILABLE,
        });
      } finally {
        if (savedCeiling === undefined) delete process.env['GIT_CEILING_DIRECTORIES'];
        else process.env['GIT_CEILING_DIRECTORIES'] = savedCeiling;
        rmSync(notRepo, { recursive: true, force: true });
      }
    });
  });

  describe('pull request cache', () => {
    it('reuses a same-branch result across canonical cwd aliases within TTL', async () => {
      writeFileSync(join(repo, 'a.txt'), 'hello\n');
      commitAll('init');
      const pullRequest = {
        number: 12,
        state: 'open',
        url: 'https://github.com/example/repo/pull/12',
      };
      const ghCalls = stubGhResponses(hostProcess, [JSON.stringify({ ...pullRequest, state: 'OPEN' })]);

      const first = await service.status(repo);
      const second = await service.status(`${repo}/.`);

      expect(first.pullRequest).toEqual(pullRequest);
      expect(second.pullRequest).toEqual(pullRequest);
      expect(ghCalls).toHaveLength(1);
    });

    it('refreshes the pull request when the current branch changes within TTL', async () => {
      writeFileSync(join(repo, 'a.txt'), 'hello\n');
      commitAll('init');
      const firstPullRequest = {
        number: 12,
        state: 'open',
        url: 'https://github.com/example/repo/pull/12',
      };
      const secondPullRequest = {
        number: 13,
        state: 'open',
        url: 'https://github.com/example/repo/pull/13',
      };
      const ghCalls = stubGhResponses(hostProcess, [
        JSON.stringify({ ...firstPullRequest, state: 'OPEN' }),
        JSON.stringify({ ...secondPullRequest, state: 'OPEN' }),
      ]);

      const first = await service.status(repo);
      git(repo, 'checkout', '-b', 'branch-b');
      const second = await service.status(repo);

      expect(first.pullRequest).toEqual(firstPullRequest);
      expect(second.pullRequest).toEqual(secondPullRequest);
      expect(ghCalls).toHaveLength(2);
    });

    it('queries the captured branch when the worktree changes before gh starts', async () => {
      writeFileSync(join(repo, 'a.txt'), 'hello\n');
      commitAll('init');
      const branchA = git(repo, 'branch', '--show-current');
      const firstPullRequest = {
        number: 12,
        state: 'open',
        url: 'https://github.com/example/repo/pull/12',
      };
      const secondPullRequest = {
        number: 13,
        state: 'open',
        url: 'https://github.com/example/repo/pull/13',
      };
      const gh = stubDeferredGhResponses(hostProcess, [
        JSON.stringify({ ...firstPullRequest, state: 'OPEN' }),
        JSON.stringify({ ...secondPullRequest, state: 'OPEN' }),
      ]);
      const realpathStarted = deferred<void>();
      const releaseRealpath = deferred<string>();
      vi.spyOn(HostFileSystem.prototype, 'realpath').mockImplementationOnce(async () => {
        realpathStarted.resolve(undefined);
        return releaseRealpath.promise;
      });

      const firstPromise = service.status(repo);
      await realpathStarted.promise;
      git(repo, 'checkout', '-b', 'branch-b');
      releaseRealpath.resolve(repo);
      await gh.started[0]!;
      const firstArgs = gh.calls[0]?.args;
      gh.calls[0]!.resolve(0);
      const first = await firstPromise;

      const secondPromise = service.status(repo);
      await gh.started[1]!;
      const secondArgs = gh.calls[1]?.args;
      gh.calls[1]!.resolve(0);
      const second = await secondPromise;

      expect(first.branch).toBe(branchA);
      expect(first.pullRequest).toEqual(firstPullRequest);
      expect(firstArgs).toEqual(['pr', 'view', branchA, '--json', 'number,url,state']);
      expect(second.branch).toBe('branch-b');
      expect(second.pullRequest).toEqual(secondPullRequest);
      expect(secondArgs).toEqual(['pr', 'view', 'branch-b', '--json', 'number,url,state']);
      expect(gh.calls).toHaveLength(2);
    });

    it('does not query a pull request for detached HEAD', async () => {
      writeFileSync(join(repo, 'a.txt'), 'hello\n');
      commitAll('init');
      git(repo, 'checkout', '--detach', 'HEAD');
      const ghCalls = stubGhResponses(hostProcess, []);

      const result = await service.status(repo);

      expect(result.branch).toBe('');
      expect(result.pullRequest).toBeNull();
      expect(ghCalls).toHaveLength(0);
    });

    it('does not let a late result from the old branch poison the new branch cache', async () => {
      writeFileSync(join(repo, 'a.txt'), 'hello\n');
      commitAll('init');
      const firstPullRequest = {
        number: 12,
        state: 'open',
        url: 'https://github.com/example/repo/pull/12',
      };
      const secondPullRequest = {
        number: 13,
        state: 'open',
        url: 'https://github.com/example/repo/pull/13',
      };
      const gh = stubDeferredGhResponses(hostProcess, [
        JSON.stringify({ ...firstPullRequest, state: 'OPEN' }),
        JSON.stringify({ ...secondPullRequest, state: 'OPEN' }),
      ]);

      const firstPromise = service.status(repo);
      await gh.started[0];
      git(repo, 'checkout', '-b', 'branch-b');
      const secondPromise = service.status(repo);
      await gh.started[1];

      gh.calls[1]!.resolve(0);
      const second = await secondPromise;
      gh.calls[0]!.resolve(0);
      const first = await firstPromise;
      const afterLateResult = await service.status(repo);

      expect(first.pullRequest).toEqual(firstPullRequest);
      expect(second.pullRequest).toEqual(secondPullRequest);
      expect(afterLateResult.pullRequest).toEqual(secondPullRequest);
      expect(gh.calls).toHaveLength(2);
    });
  });

  describe('diff', () => {
    it('returns the unified diff for a tracked modified file', async () => {
      writeFileSync(join(repo, 'a.txt'), 'old\n');
      commitAll('init');
      writeFileSync(join(repo, 'a.txt'), 'new\n');

      const result = await service.diff(repo, 'a.txt', join(repo, 'a.txt'));
      expect(result.path).toBe('a.txt');
      expect(result.diff).toContain('+new');
      expect(result.diff).toContain('-old');
      expect(result.truncated).toBe(false);
    });

    it('returns an all-added diff for an untracked file', async () => {
      writeFileSync(join(repo, 'a.txt'), 'hello\n');
      commitAll('init');
      writeFileSync(join(repo, 'b.txt'), 'brand new\n');

      const result = await service.diff(repo, 'b.txt', join(repo, 'b.txt'));
      expect(result.diff).toContain('+brand new');
    });

    it('throws FS_PATH_NOT_FOUND for a missing path', async () => {
      writeFileSync(join(repo, 'a.txt'), 'hello\n');
      commitAll('init');

      await expect(
        service.diff(repo, 'missing.txt', join(repo, 'missing.txt')),
      ).rejects.toMatchObject({ code: ErrorCodes.FS_PATH_NOT_FOUND });
    });
  });

  describe('findWorkTree', () => {
    it('finds the repo root from a nested subdirectory', async () => {
      mkdirSync(join(repo, 'a', 'b'), { recursive: true });

      const result = await service.findWorkTree(join(repo, 'a', 'b'));

      expect(result).toEqual({
        root: normalize(repo),
        dotGitPath: normalize(join(repo, '.git')),
        controlDirPath: normalize(join(repo, '.git')),
      });
    });

    it('returns null when no ancestor holds a .git entry', async () => {
      const fsWithoutGitAncestors = new HostFileSystem();
      fsWithoutGitAncestors.stat = async (path) => {
        if (path.endsWith('/.git')) throw new Error('not found');
        return new HostFileSystem().stat(path);
      };

      await expect(findGitWorkTree(fsWithoutGitAncestors, '/workspace/plain')).resolves.toBeNull();
    });

    it('resolves an absolute gitdir pointer in a .git file', async () => {
      const wt = mkdtempSync(join(tmpdir(), 'git-service-wt-'));
      try {
        const control = join(repo, '.git', 'worktrees', 'wt');
        writeFileSync(join(wt, '.git'), `gitdir: ${control}\n`);

        const result = await service.findWorkTree(wt);

        expect(result?.root).toBe(normalize(wt));
        expect(result?.dotGitPath).toBe(normalize(join(wt, '.git')));
        expect(result?.controlDirPath).toBe(normalize(control));
      } finally {
        rmSync(wt, { recursive: true, force: true });
      }
    });

    it('resolves a relative gitdir pointer against the marker parent', async () => {
      const wt = mkdtempSync(join(tmpdir(), 'git-service-wt-'));
      try {
        writeFileSync(join(wt, '.git'), 'gitdir: ../gitdir-target\n');

        const result = await service.findWorkTree(wt);

        expect(result?.controlDirPath).toBe(normalize(join(wt, '..', 'gitdir-target')));
      } finally {
        rmSync(wt, { recursive: true, force: true });
      }
    });

    it('parses a BOM-prefixed gitdir pointer', async () => {
      const wt = mkdtempSync(join(tmpdir(), 'git-service-wt-'));
      try {
        writeFileSync(join(wt, '.git'), '\uFEFFgitdir: ../target\n');

        const result = await service.findWorkTree(wt);

        expect(result?.controlDirPath).toBe(normalize(join(wt, '..', 'target')));
      } finally {
        rmSync(wt, { recursive: true, force: true });
      }
    });

    it('skips a .git file without a gitdir pointer and keeps walking up', async () => {
      const inner = join(repo, 'inner');
      mkdirSync(inner, { recursive: true });
      writeFileSync(join(inner, '.git'), 'not a pointer\n');

      const result = await service.findWorkTree(inner);

      expect(result?.root).toBe(normalize(repo));
    });

    it('returns null for a relative cwd', async () => {
      await expect(findGitWorkTree(new HostFileSystem(), 'some/relative/path')).resolves.toBeNull();
    });
  });
});
