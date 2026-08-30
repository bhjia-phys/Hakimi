/**
 * `aitpResearch` domain — Agent-scope dynamic AITP skill listing injection contract.
 */

import { createDecorator } from '#/_base/di/instantiation';

export interface IAitpSkillVisibilityInjection {
  readonly _serviceBrand: undefined;
}

export const IAitpSkillVisibilityInjection =
  createDecorator<IAitpSkillVisibilityInjection>('aitpSkillVisibilityInjection');
