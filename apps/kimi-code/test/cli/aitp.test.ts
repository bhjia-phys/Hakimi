import { describe, expect, it } from 'vitest';

import {
  AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
  type AitpCommandRunner,
} from '@moonshot-ai/agent-core';
import { Command } from 'commander';

import { handleAitpDoctor, registerAitpCommand } from '#/cli/sub/aitp';

function makeDeps(runner: AitpCommandRunner): {
  deps: Parameters<typeof handleAitpDoctor>[0];
  stdout: string[];
  stderr: string[];
  exitCodes: number[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  return {
    deps: {
      cwd: () => 'F:/workspace',
      stdout: { write: (chunk) => stdout.push(chunk) > 0 },
      stderr: { write: (chunk) => stderr.push(chunk) > 0 },
      exit: (code) => {
        exitCodes.push(code);
        throw new Error(`exit ${String(code)}`);
      },
      runner,
      fileExists: (path) => path.endsWith('.aitp'),
    },
    stdout,
    stderr,
    exitCodes,
  };
}

describe('hakimi aitp doctor', () => {
  it('prints a ready status when the AITP runtime is discoverable', async () => {
    const runner: AitpCommandRunner = {
      async run() {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            runtime_payload_profiles: fakeRuntimePayloadProfilesCatalog(),
          }),
          stderr: '',
        };
      },
    };
    const { deps, stdout, stderr } = makeDeps(runner);

    const code = await handleAitpDoctor(deps, { json: true });

    expect(code).toBe(0);
    expect(stderr.join('')).toBe('');
    const parsed = JSON.parse(stdout.join(''));
    expect(parsed.status).toBe('ready');
    expect(parsed.payloadProfilesReadable).toBe(true);
  });

  it('routes degraded or missing status to stderr', async () => {
    const runner: AitpCommandRunner = {
      async run() {
        return {
          exitCode: 127,
          stdout: '',
          stderr: 'aitp-v5 not found',
        };
      },
    };
    const { deps, stdout, stderr } = makeDeps(runner);

    const code = await handleAitpDoctor(deps, {});

    expect(code).toBe(1);
    expect(stdout.join('')).toBe('');
    const err = stderr.join('');
    expect(err).toContain('Hakimi AITP doctor: missing');
    expect(err).toContain('payload-profiles');
    expect(err).toContain('aitp-v5 not found');
  });

  it('registers the nested commander command', async () => {
    const runner: AitpCommandRunner = {
      async run() {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            runtime_payload_profiles: fakeRuntimePayloadProfilesCatalog(),
          }),
          stderr: '',
        };
      },
    };
    const { deps, stdout, exitCodes } = makeDeps(runner);
    const program = new Command('hakimi');
    registerAitpCommand(program, deps);

    await program.parseAsync(['node', 'hakimi', 'aitp', 'doctor', '--json']);

    expect(exitCodes).toEqual([]);
    expect(JSON.parse(stdout.join('')).status).toBe('ready');
  });
});

function fakeRuntimePayloadProfilesCatalog(): any {
  return {
    kind: 'runtime_payload_profiles',
    catalog_version: AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
    truth_source: 'runtime_payload_profile_catalog',
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
    host_usage_policy: {
      read_surface_effect: 'metadata_only',
      allowed_uses: [
        'payload_construction',
        'capture_policy_diagnostics',
        'bridge_readiness_diagnostics',
      ],
      forbidden_uses: [
        'evidence_support',
        'validation_result',
        'claim_trust_update',
        'trust_apply',
        'bulk_auto_capture',
      ],
      records_validation_result: false,
      claim_trust_mutation: 'none',
      summary_inputs_trusted: false,
      can_update_claim_trust: false,
    },
    profile_count: 0,
    profile_index: [],
    profiles: [],
  };
}
