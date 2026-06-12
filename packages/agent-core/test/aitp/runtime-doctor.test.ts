import { describe, expect, it } from 'vitest';

import {
  AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
  createDefaultAitpCommandRunner,
  inspectAitpRuntime,
  type AitpCommandRunner,
} from '../../src/aitp';

describe('AITP runtime doctor', () => {
  it('reports ready when .aitp exists and payload profiles are readable', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
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

    const report = await inspectAitpRuntime({
      basePath: 'F:/workspace',
      runner,
      fileExists: (path) => path.endsWith('.aitp'),
    });

    expect(report.status).toBe('ready');
    expect(report.payloadProfilesReadable).toBe(true);
    expect(report.profileCount).toBe(0);
    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: ['adapter', 'payload-profiles'],
      },
    ]);
  });

  it('fails closed when the CLI fallback cannot read payload profiles', async () => {
    const runner: AitpCommandRunner = {
      async run() {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'command not found',
        };
      },
    };

    const report = await inspectAitpRuntime({
      basePath: 'F:/workspace',
      runner,
      fileExists: () => false,
    });

    expect(report.status).toBe('missing');
    expect(report.payloadProfilesReadable).toBe(false);
    expect(report.checks.map((check) => check.status)).toEqual(['warn', 'error']);
    expect(report.nextSteps.join('\n')).toContain('aitp-v5');
  });

  it('falls back to a bundled local AITP repo when aitp-v5 is missing', async () => {
    const calls: { command: string; args: readonly string[]; cwd?: string | undefined }[] = [];
    const primaryRunner: AitpCommandRunner = {
      async run(command, args, options) {
        calls.push({ command, args, cwd: options.cwd });
        if (command === 'aitp-v5') {
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'spawn aitp-v5 ENOENT',
          };
        }
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
    const runner = createDefaultAitpCommandRunner({
      primaryRunner,
      cwd: () => 'F:/AI_Workspace/repos/hakimi/apps/kimi-code',
      fileExists: (path) =>
        path.replace(/\\/g, '/') ===
        'F:/AI_Workspace/repos/AITP-Research-Protocol/brain/v5/cli.py',
    });

    const report = await inspectAitpRuntime({
      basePath: 'F:/AI_Workspace/Theoretical-Physics',
      cwd: 'F:/AI_Workspace/repos/hakimi/apps/kimi-code',
      runner,
      fileExists: (path) => path.endsWith('.aitp'),
    });

    expect(report.status).toBe('ready');
    expect(report.fallbackUsed).toBe(true);
    expect(report.resolvedCommand).toBe('uv');
    expect(report.resolvedCwd?.replace(/\\/g, '/')).toBe('F:/AI_Workspace/repos/AITP-Research-Protocol');
    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: ['adapter', 'payload-profiles'],
        cwd: 'F:/AI_Workspace/repos/hakimi/apps/kimi-code',
      },
      {
        command: 'uv',
        args: [
          'run',
          '--with',
          'pyyaml',
          'python',
          '-m',
          'brain.v5.cli',
          'adapter',
          'payload-profiles',
        ],
        cwd: 'F:\\AI_Workspace\\repos\\AITP-Research-Protocol',
      },
    ]);
  });

  it('does not replace an explicit custom AITP command with the bundled fallback', async () => {
    const calls: string[] = [];
    const runner = createDefaultAitpCommandRunner({
      primaryRunner: {
        async run(command) {
          calls.push(command);
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'custom command not found',
          };
        },
      },
      fileExists: (path) => path.replace(/\\/g, '/').endsWith('/AITP-Research-Protocol/brain/v5/cli.py'),
    });

    const report = await inspectAitpRuntime({
      basePath: 'F:/workspace',
      command: 'custom-aitp',
      runner,
      fileExists: () => true,
    });

    expect(report.status).toBe('missing');
    expect(report.fallbackUsed).toBeUndefined();
    expect(calls).toEqual(['custom-aitp']);
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
