import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import { IConfigService } from '#/app/config/config';
import { IFlagService } from '#/app/flag/flag';
import { Error2, ErrorCodes, isError2 } from '#/errors';
import { IModelCatalog, type Model } from '#/kosong/model/catalog';
import {
  SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE,
  SUBAGENT_PRESET_TOWER_WORKER_ROUTE,
  SUBAGENT_SECTION,
  SECONDARY_MODEL_SECTION,
} from '#/session/subagent/configSection';
import { SECONDARY_MODEL_FLAG_ID } from '#/session/subagent/flag';
import { ISessionSubagentModelsValidationService } from '#/session/subagent/subagentModelsValidation';
import { SessionSubagentModelsValidationService } from '#/session/subagent/subagentModelsValidationService';

import { stubFlag } from '../../app/flag/stubs';
import { StubConfigService } from '../../kosong/stubs';

describe('SessionSubagentModelsValidationService', () => {
  let disposables: DisposableStore;
  let ix: TestInstantiationService;
  let modelIds: Set<string>;

  beforeEach(() => {
    disposables = new DisposableStore();
    ix = disposables.add(new TestInstantiationService());
    modelIds = new Set();
  });

  afterEach(() => {
    disposables.dispose();
  });

  function setup(configValues: Record<string, unknown>, flagEnabled = true): void {
    ix.stub(IConfigService, new StubConfigService(configValues));
    ix.stub(IFlagService, stubFlag((id) => flagEnabled && id === SECONDARY_MODEL_FLAG_ID));
    ix.stub(IModelCatalog, {
      _serviceBrand: undefined,
      get: (id: string) => {
        if (!modelIds.has(id)) {
          throw new Error2(
            ErrorCodes.CONFIG_INVALID,
            `Model "${id}" is not configured in config.toml.`,
            { details: { model: id } },
          );
        }
        return { id } as Model;
      },
    } as unknown as IModelCatalog);
    ix.set(
      ISessionSubagentModelsValidationService,
      new SyncDescriptor(SessionSubagentModelsValidationService),
    );
  }

  function resolve(): unknown {
    try {
      ix.get(ISessionSubagentModelsValidationService);
      return undefined;
    } catch (error) {
      return error;
    }
  }

  it('is a no-op when no canonical subagent routes are configured', () => {
    setup({
      [SECONDARY_MODEL_SECTION]: {
        defaultModel: 'provider/removed',
        models: { 'provider/removed': 'legacy compatibility value' },
      },
    });

    expect(resolve()).toBeUndefined();
  });

  it('rejects an invalid canonical section shape before route validation', () => {
    setup({
      [SUBAGENT_SECTION]: {
        agents: {
          coder: { model: 123 },
        },
      },
    });

    const error = resolve();
    expect(isError2(error)).toBe(true);
    expect((error as Error2).code).toBe(ErrorCodes.CONFIG_INVALID);
    expect((error as Error2).message).toContain('[subagent] is invalid');
  });

  it('does not validate aliases or blank fields in an inactive preset', () => {
    setup({
      [SUBAGENT_SECTION]: {
        presets: {
          inactive: {
            coder: { model: '   ', thinkingEffort: '\t' },
          },
        },
      },
    });

    expect(resolve()).toBeUndefined();
  });

  it('rejects a dangling canonical agents alias', () => {
    setup({
      [SUBAGENT_SECTION]: {
        agents: {
          coder: { model: 'provider/removed' },
        },
      },
    });

    const error = resolve();
    expect(isError2(error)).toBe(true);
    expect((error as Error2).code).toBe(ErrorCodes.CONFIG_INVALID);
    expect((error as Error2).message).toContain(
      '[subagent] model alias "provider/removed" from agents.coder could not be resolved',
    );
  });

  it('validates only the active preset routes', () => {
    modelIds.add('provider/coder').add('provider/worker').add('provider/reviewer');
    setup({
      [SUBAGENT_SECTION]: {
        preset: 'research',
        presets: {
          research: {
            coder: { model: 'provider/coder' },
            [SUBAGENT_PRESET_TOWER_WORKER_ROUTE]: { model: 'provider/worker' },
            [SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE]: { model: 'provider/reviewer' },
          },
          inactive: {
            coder: { model: 'provider/removed' },
          },
        },
      },
    });

    expect(resolve()).toBeUndefined();
  });

  it('rejects a dangling alias in the active preset', () => {
    setup({
      [SUBAGENT_SECTION]: {
        preset: 'research',
        presets: {
          research: {
            coder: { model: 'provider/removed' },
          },
        },
      },
    });

    const error = resolve();
    expect(isError2(error)).toBe(true);
    expect((error as Error2).code).toBe(ErrorCodes.CONFIG_INVALID);
    expect((error as Error2).message).toContain(
      '[subagent] model alias "provider/removed" from presets.research.coder could not be resolved',
    );
  });

  it('rejects an active preset name that is not configured', () => {
    setup({
      [SUBAGENT_SECTION]: {
        preset: 'missing',
        presets: {},
      },
    });

    const error = resolve();
    expect(isError2(error)).toBe(true);
    expect((error as Error2).code).toBe(ErrorCodes.CONFIG_INVALID);
    expect((error as Error2).message).toContain(
      '[subagent].preset "missing" does not name a configured preset',
    );
  });

  it('ignores a dangling legacy fallback even when its experiment flag is enabled', () => {
    setup({
      [SECONDARY_MODEL_SECTION]: {
        defaultModel: 'provider/removed',
      },
    });

    expect(resolve()).toBeUndefined();
  });
});
