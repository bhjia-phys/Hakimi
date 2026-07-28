import { describe, expect, it } from 'vitest';

import {
  AITP_FLAG_IDS,
  applyAitpMasterSwitch,
  FlagResolver,
  type FlagId,
} from '../../src/flags';

type Env = Record<string, string | undefined>;

function makeResolver(env: Env, experimental: Record<string, boolean> | undefined) {
  const resolver = new FlagResolver(env);
  resolver.setConfigOverrides(experimental);
  return (id: string) => resolver.enabled(id as FlagId);
}

describe('applyAitpMasterSwitch', () => {
  it('passes overrides through unchanged when the master switch is on or unset', () => {
    expect(applyAitpMasterSwitch(undefined, undefined)).toBeUndefined();
    expect(applyAitpMasterSwitch(undefined, true)).toBeUndefined();
    const experimental = { 'physics-memory': true };
    expect(applyAitpMasterSwitch(experimental, true)).toBe(experimental);
  });

  it('forces every AITP flag off at the config layer when disabled', () => {
    const merged = applyAitpMasterSwitch(undefined, false);
    expect(merged).toBeDefined();
    for (const id of AITP_FLAG_IDS) {
      expect(merged?.[id]).toBe(false);
    }
  });

  it('lets an explicit [experimental] entry win over the master switch', () => {
    const merged = applyAitpMasterSwitch({ 'physics-memory': true }, false);
    expect(merged?.['physics-memory']).toBe(true);
    expect(merged?.['research-ledger']).toBe(false);
  });
});

describe('aitp master switch via FlagResolver', () => {
  it('turns all AITP flags off while leaving non-AITP flags at their defaults', () => {
    const enabled = makeResolver({}, applyAitpMasterSwitch(undefined, false));
    for (const id of AITP_FLAG_IDS) {
      expect(enabled(id)).toBe(false);
    }
    // Non-AITP flags keep their registry defaults.
    expect(enabled('goal-command')).toBe(true);
    expect(enabled('reasoning-audit')).toBe(false);
  });

  it('keeps env per-flag precedence above the master switch', () => {
    const enabled = makeResolver(
      { KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY: '1' },
      applyAitpMasterSwitch(undefined, false),
    );
    expect(enabled('physics-memory')).toBe(true);
    expect(enabled('research-ledger')).toBe(false);
  });

  it('restores registry defaults when the master switch is back on', () => {
    const enabled = makeResolver({}, applyAitpMasterSwitch(undefined, true));
    for (const id of AITP_FLAG_IDS) {
      expect(enabled(id)).toBe(true);
    }
  });
});
