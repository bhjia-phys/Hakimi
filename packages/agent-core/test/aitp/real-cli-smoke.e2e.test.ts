import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter } from 'node:path';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createAitpCliBridge,
  type AitpCommandResult,
  type AitpCommandRunner,
  type AitpCommandRunnerOptions,
} from '../../src/aitp';

const ENABLED = process.env['HAKIMI_AITP_REAL_CLI_SMOKE'] === '1';
const PYTHON = process.env['AITP_V5_PYTHON'] ?? 'python';
const AITP_REPO = process.env['AITP_V5_REPO'];

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe.skipIf(!ENABLED)('AITP real CLI bridge smoke', () => {
  it('round-trips a real AITP topic store through Hakimi read and write bridges', async () => {
    if (AITP_REPO === undefined || AITP_REPO.trim().length === 0) {
      throw new Error('AITP_V5_REPO must point at the AITP-Research-Protocol checkout.');
    }
    const workspace = await makeTempDir('hakimi-aitp-real-cli-');
    const runner = new PythonAitpCliRunner(PYTHON, AITP_REPO);

    await cli(runner, ['init', workspace]);
    await cli(runner, [
      '--base',
      workspace,
      'topic',
      'create',
      'qg',
      '--context',
      'theory',
      '--title',
      'Quantum gravity algebra',
    ]);
    const claim = await cli(runner, [
      '--base',
      workspace,
      'claim',
      'create',
      '--topic',
      'qg',
      '--statement',
      'A local algebraic split can model part of the MIPT observer role.',
      '--evidence-profile',
      'theory_derivation',
      '--confidence-state',
      'hypothesis',
      '--uncertainty',
      'source theorem and operational equivalence are unresolved',
    ]);
    const claimId = requiredString(claim, 'claim_id');
    await cli(runner, [
      '--base',
      workspace,
      'session',
      'bind',
      'session-qg',
      '--topic',
      'qg',
      '--context',
      'theory',
      '--claim',
      claimId,
    ]);
    await cli(runner, [
      '--base',
      workspace,
      'asset',
      'register',
      '--topic',
      'qg',
      '--claim',
      claimId,
      '--type',
      'paper',
      '--uri',
      'arxiv:2601.00001',
      '--title',
      'Algebraic observer source',
      '--source-kind',
      'literature',
      '--summary',
      'Raw source identity for observer/algebra backtrace.',
    ]);
    await cli(runner, [
      '--base',
      workspace,
      'exploration',
      'record',
      '--topic',
      'qg',
      '--claim',
      claimId,
      '--session',
      'session-qg',
      '--type',
      'relation_path_brainstorm',
      '--title',
      'Trace algebra to observer relation',
      '--focal-question',
      'Which definitions connect the algebraic split to the MIPT observer role?',
      '--summary',
      'Keep the relation path exploratory until source reconstruction closes.',
      '--original-question',
      'Can an algebraic split model the MIPT observer role?',
      '--local-question',
      'Trace the split definition and operational observer assumption.',
      '--candidate-path',
      'von Neumann algebra -> split property -> observer factorization',
      '--unresolved-point',
      'source theorem not reconstructed',
    ]);

    const bridge = createAitpCliBridge({
      basePath: workspace,
      command: 'aitp-v5',
      runner,
    });
    const firstSlice = await bridge.readProcessGraphSlice({
      sessionId: 'session-qg',
      claimId,
      limit: 30,
      prompt: 'Brainstorm the relation path and follow the source backtrace.',
    });

    expect(firstSlice.contextLines.join('\n')).toContain('Source assets:');
    expect(firstSlice.actionRecommendations.map((binding) => binding.actionId)).toEqual(
      expect.arrayContaining([
        'physics.brainstorm_relation_path',
        'trace.audit_original_question_drift',
      ]),
    );

    const obligation = await bridge.createProofObligation({
      topicId: 'qg',
      claimId,
      statement: 'Reconstruct the source theorem before using the observer analogy as support.',
      obligationType: 'source_support',
      status: 'open',
      maturityLevel: 'hypothesis',
      nextAction: 'follow source dependency back to the definition source',
      requiredEvidence: ['source reconstruction'],
      failureModes: ['analogy mistaken for derivation'],
    });
    const checkpoint = await bridge.requestHumanCheckpoint({
      topicId: 'qg',
      claimId,
      reason: 'Trust boundary before treating the relation path as source-supported.',
      requestedBy: 'hakimi',
      options: ['keep exploratory', 'allow source-supported transition'],
    });
    const secondSlice = await bridge.readProcessGraphSlice({
      sessionId: 'session-qg',
      claimId,
      limit: 30,
      prompt: 'Check whether the proof obligation is visible before finalizing.',
    });

    expect(obligation).toMatchObject({
      kind: 'proof_obligation',
      status: 'open',
      canUpdateClaimTrust: false,
    });
    expect(checkpoint).toMatchObject({
      kind: 'human_checkpoint',
      status: 'requested',
    });
    expect(secondSlice.obligations.blocking.map((item) => item.id)).toContain(
      obligation.obligationId,
    );
    await expect(
      access(join(workspace, '.aitp', 'registry', 'checkpoints', `${checkpoint.checkpointId}.md`)),
    ).resolves.toBeUndefined();
  }, 60_000);
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function cli(runner: AitpCommandRunner, args: readonly string[]): Promise<Record<string, unknown>> {
  const result = await runner.run('aitp-v5', args, { timeoutMs: 20_000 });
  if (result.exitCode !== 0) {
    throw new Error(`AITP CLI failed: ${result.stderr}`);
  }
  const payload = JSON.parse(result.stdout) as unknown;
  if (!isRecord(payload)) {
    throw new Error('AITP CLI returned non-object JSON.');
  }
  return payload;
}

class PythonAitpCliRunner implements AitpCommandRunner {
  constructor(
    private readonly python: string,
    private readonly repo: string,
  ) {}

  run(
    _command: string,
    args: readonly string[],
    options: AitpCommandRunnerOptions,
  ): Promise<AitpCommandResult> {
    return new Promise((resolve) => {
      const child = spawn(this.python, ['-m', 'brain.v5.cli', ...args], {
        cwd: this.repo,
        env: {
          ...process.env,
          PYTHONPATH: [this.repo, process.env['PYTHONPATH']].filter(isNonEmpty).join(delimiter),
        },
        shell: false,
        stdio: 'pipe',
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timeout =
        options.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              settle({ exitCode: 124, stdout, stderr, timedOut: true });
              child.kill();
            }, options.timeoutMs);
      const onAbort = (): void => {
        settle({ exitCode: 130, stdout, stderr });
        child.kill();
      };
      const cleanup = (): void => {
        if (timeout !== undefined) clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
      };
      const settle = (result: AitpCommandResult): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted === true) {
        onAbort();
        return;
      }
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (error) => {
        settle({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` });
      });
      child.on('close', (code) => {
        settle({ exitCode: code ?? 0, stdout, stderr });
      });
    });
  }
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(`AITP CLI payload is missing ${key}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}
