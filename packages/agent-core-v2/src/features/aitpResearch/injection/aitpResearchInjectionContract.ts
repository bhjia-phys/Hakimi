/**
 * `aitpResearch` domain — `IAitpResearchInjection` contract.
 *
 * Agent-scope context injection unit for AITP Research Mode. Bound at Agent
 * scope.
 */

import { createDecorator } from '#/_base/di/instantiation';

export interface IAitpResearchInjection {
  readonly _serviceBrand: undefined;
}

export const IAitpResearchInjection =
  createDecorator<IAitpResearchInjection>('aitpResearchInjection');
