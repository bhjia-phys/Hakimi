import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import { afterEach, describe, expect, it } from 'vitest';

import {
  activeSubagentPreset,
  describeSubagentModelOverride,
  mergeConfigPatch,
  parseConfigString,
  resolveSubagentModelOverride,
  writeConfigFile,
} from '../../src/config';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kimi-core-subagent-models-'));
  tempDirs.push(dir);
  return dir;
}

const SUBAGENT_TOML = `
default_model = "acme/main"

[models."acme/main"]
provider = "acme"
model = "main"
max_context_size = 100000

[models."acme/mini"]
provider = "acme"
model = "mini"
max_context_size = 50000

[providers.acme]
type = "openai"
base_url = "https://acme.example/v1"

[subagent]
timeout_ms = 600000
preset = "fast"

[subagent.agents.explore]
model = "acme/mini"
thinking_effort = "low"

[subagent.presets.fast.explore]
thinking_effort = "minimal"

[subagent.presets.fast.plan]
model = "acme/mini"

[subagent.presets.deep.coder]
model = "acme/main"
thinking_effort = "high"
`;

describe('subagent model config TOML', () => {
  it('parses [subagent] agents/presets with camelCased inner fields', () => {
    const config = parseConfigString(SUBAGENT_TOML, 'config.toml');

    expect(config.subagent?.timeoutMs).toBe(600000);
    expect(config.subagent?.preset).toBe('fast');
    expect(config.subagent?.agents).toEqual({
      explore: { model: 'acme/mini', thinkingEffort: 'low' },
    });
    expect(config.subagent?.presets).toEqual({
      fast: {
        explore: { thinkingEffort: 'minimal' },
        plan: { model: 'acme/mini' },
      },
      deep: {
        coder: { model: 'acme/main', thinkingEffort: 'high' },
      },
    });
  });

  it('round-trips [subagent] agents/presets through a config write', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'config.toml');
    const config = parseConfigString(SUBAGENT_TOML, configPath);

    await writeConfigFile(configPath, config);
    const text = await readFile(configPath, 'utf-8');
    expect(text).toContain('[subagent.agents.explore]');
    expect(text).toContain('thinking_effort');

    const roundTripped = parseConfigString(text, configPath);
    expect(roundTripped.subagent).toEqual(config.subagent);
  });

  it('merges a preset switch via config patch without dropping other subagent fields', () => {
    const base = parseConfigString(SUBAGENT_TOML, 'config.toml');
    const merged = mergeConfigPatch(base, { subagent: { preset: 'deep' } });
    expect(merged.subagent?.preset).toBe('deep');
    expect(merged.subagent?.agents).toEqual(base.subagent?.agents);
    expect(merged.subagent?.presets).toEqual(base.subagent?.presets);
  });
});

describe('resolveSubagentModelOverride', () => {
  it('returns nothing when [subagent] is not configured', () => {
    const config = parseConfigString('', 'config.toml');
    expect(resolveSubagentModelOverride(config, 'explore')).toEqual({});
    expect(resolveSubagentModelOverride(undefined, 'explore')).toEqual({});
  });

  it('reads per-profile overrides from [subagent.agents]', () => {
    const config = parseConfigString(
      SUBAGENT_TOML.replace('preset = "fast"\n', ''),
      'config.toml',
    );
    expect(resolveSubagentModelOverride(config, 'explore')).toEqual({
      modelAlias: 'acme/mini',
      thinkingEffort: 'low',
    });
    expect(resolveSubagentModelOverride(config, 'plan')).toEqual({});
  });

  it('lets the active preset win field-by-field over [subagent.agents]', () => {
    const config = parseConfigString(SUBAGENT_TOML, 'config.toml');
    // preset.fast.explore only sets thinking_effort: model still comes from agents.
    expect(resolveSubagentModelOverride(config, 'explore')).toEqual({
      modelAlias: 'acme/mini',
      thinkingEffort: 'minimal',
    });
    // preset.fast.plan sets the model; no agents.plan entry exists.
    expect(resolveSubagentModelOverride(config, 'plan')).toEqual({
      modelAlias: 'acme/mini',
    });
  });

  it('drops an unknown model alias with a warning instead of failing', () => {
    const config = parseConfigString(
      `${SUBAGENT_TOML}\n[subagent.agents.coder]\nmodel = "acme/typo"\n`,
      'config.toml',
    );
    const warnings: string[] = [];
    const resolved = resolveSubagentModelOverride(config, 'coder', (message) =>
      warnings.push(message),
    );
    expect(resolved).toEqual({});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('acme/typo');
  });
});

describe('subagent preset helpers', () => {
  it('treats an unset or blank preset as inactive', () => {
    expect(activeSubagentPreset(undefined)).toBeUndefined();
    expect(activeSubagentPreset({})).toBeUndefined();
    expect(activeSubagentPreset({ preset: '' })).toBeUndefined();
    expect(activeSubagentPreset({ preset: '  ' })).toBeUndefined();
    expect(activeSubagentPreset({ preset: 'fast' })).toBe('fast');
  });

  it('describes the effective override for status display', () => {
    const config = parseConfigString(SUBAGENT_TOML, 'config.toml');
    expect(describeSubagentModelOverride(config.subagent, 'explore')).toEqual({
      model: 'acme/mini',
      thinkingEffort: 'minimal',
    });
    expect(describeSubagentModelOverride(config.subagent, 'coder')).toBeUndefined();
  });
});
