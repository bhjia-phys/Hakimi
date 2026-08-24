import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DisposableStore } from '#/_base/di/lifecycle';
import { Service } from '#/_base/di/service';
import { SyncDescriptor } from '#/_base/di/descriptors';
import { createServices } from '#/_base/di/test';
import {
  IAgentSkillVisibilityService,
  SkillVisibilityContribution,
} from '#/agent/skillVisibility/skillVisibility';
import { AgentSkillVisibilityService } from '#/agent/skillVisibility/skillVisibilityService';
import { createDecorator, type ServicesAccessor } from '#/_base/di/instantiation';
import type { SkillDefinition } from '#/app/skillCatalog/types';

function makeSkill(name: string, pluginId?: string): SkillDefinition {
  return {
    name,
    description: `Skill ${name}`,
    path: `/skills/${name}/SKILL.md`,
    dir: `/skills/${name}`,
    content: '',
    metadata: {},
    source: 'project',
    plugin: pluginId !== undefined ? { id: pluginId } : undefined,
  };
}

const ITestModeService = createDecorator<{ readonly _serviceBrand: undefined; readonly isActive: boolean }>('testModeService');

describe('AgentSkillVisibilityService', () => {
  let disposables: DisposableStore;

  beforeEach(() => {
    disposables = new DisposableStore();
  });

  afterEach(() => disposables.dispose());

  it('allows all skills when no filters are registered', () => {
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.define(IAgentSkillVisibilityService, AgentSkillVisibilityService);
      },
    });
    const svc = ix.get(IAgentSkillVisibilityService);
    const skill = makeSkill('test');
    expect(svc.isSkillVisible(skill)).toBe(true);
    expect(svc.hiddenReason(skill)).toBeUndefined();
  });

  it('hides a skill when a filter rejects it', () => {
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.define(IAgentSkillVisibilityService, AgentSkillVisibilityService);
      },
    });

    class FilterProvider extends Service {
      declare readonly _serviceBrand: undefined;
      constructor() {
        super();
        this.provide(SkillVisibilityContribution, {
          id: 'test-filter',
          isVisible: (skill: SkillDefinition, _accessor: ServicesAccessor) => skill.name !== 'hidden',
          describeHidden: (skill: SkillDefinition, _accessor: ServicesAccessor) =>
            skill.name === 'hidden' ? 'blocked by test-filter' : undefined,
        });
      }
    }
    disposables.add(ix.createInstance(FilterProvider));

    const svc = ix.get(IAgentSkillVisibilityService);
    expect(svc.isSkillVisible(makeSkill('visible'))).toBe(true);
    expect(svc.isSkillVisible(makeSkill('hidden'))).toBe(false);
    expect(svc.hiddenReason(makeSkill('hidden'))).toBe('blocked by test-filter');
  });

  it('dynamic filter reads runtime state through accessor (mode inactive → hidden, mode active → visible)', () => {
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(ITestModeService, { _serviceBrand: undefined, isActive: false });
        reg.define(IAgentSkillVisibilityService, AgentSkillVisibilityService);
      },
    });

    class ModeFilterProvider extends Service {
      declare readonly _serviceBrand: undefined;
      constructor() {
        super();
        this.provide(SkillVisibilityContribution, {
          id: 'aitpResearch',
          isVisible: (skill: SkillDefinition, accessor: ServicesAccessor) => {
            if (skill.plugin?.id !== 'aitp-research-protocol') return true;
            return accessor.get(ITestModeService).isActive;
          },
          describeHidden: (skill: SkillDefinition, accessor: ServicesAccessor) => {
            if (skill.plugin?.id === 'aitp-research-protocol' && !accessor.get(ITestModeService).isActive) {
              return 'AITP Research Mode is not active.';
            }
            return undefined;
          },
        });
      }
    }
    disposables.add(ix.createInstance(ModeFilterProvider));

    const svc = ix.get(IAgentSkillVisibilityService);
    const aitpSkill = makeSkill('aitp', 'aitp-research-protocol');
    const normalSkill = makeSkill('normal');

    expect(svc.isSkillVisible(aitpSkill)).toBe(false);
    expect(svc.isSkillVisible(normalSkill)).toBe(true);
    expect(svc.hiddenReason(aitpSkill)).toBe('AITP Research Mode is not active.');

    (ix.get(ITestModeService) as { isActive: boolean }).isActive = true;
    expect(svc.isSkillVisible(aitpSkill)).toBe(true);
    expect(svc.hiddenReason(aitpSkill)).toBeUndefined();
  });

  it('filterVisible returns only visible skills', () => {
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.define(IAgentSkillVisibilityService, AgentSkillVisibilityService);
      },
    });

    class FilterProvider extends Service {
      declare readonly _serviceBrand: undefined;
      constructor() {
        super();
        this.provide(SkillVisibilityContribution, {
          id: 'test-filter',
          isVisible: (skill: SkillDefinition, _accessor: ServicesAccessor) => !skill.name.startsWith('blocked'),
          describeHidden: (skill: SkillDefinition, _accessor: ServicesAccessor) =>
            skill.name.startsWith('blocked') ? 'blocked' : undefined,
        });
      }
    }
    disposables.add(ix.createInstance(FilterProvider));

    const svc = ix.get(IAgentSkillVisibilityService);
    const skills = [makeSkill('ok1'), makeSkill('blocked1'), makeSkill('ok2'), makeSkill('blocked2')];
    const visible = svc.filterVisible(skills);
    expect(visible.map((s) => s.name)).toEqual(['ok1', 'ok2']);
  });
});
