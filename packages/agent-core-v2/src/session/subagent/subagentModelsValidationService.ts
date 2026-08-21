/**
 * `subagent` domain — `ISessionSubagentModelsValidationService` implementation.
 *
 * Backstop for the session lifecycle's pre-materialization check: validates
 * canonical `[subagent]` route aliases once per session at
 * `ScopeActivation.OnScopeCreated`. Eager activation failures are sticky DI
 * failures; the workspace session lifecycle explicitly observes this service
 * before publishing a materialized session. Legacy `[secondary_model]` aliases
 * are readable compatibility fallbacks and are deliberately excluded from this
 * blocker. The checks themselves live in `assertValidSubagentModelConfig`
 * (configSection). Bound at Session scope.
 */

import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { IConfigService } from '#/app/config/config';
import { IFlagService } from '#/app/flag/flag';
import { IModelCatalog } from '#/kosong/model/catalog';

import { assertValidSubagentModelConfig } from './configSection';
import { ISessionSubagentModelsValidationService } from './subagentModelsValidation';

export class SessionSubagentModelsValidationService
  implements ISessionSubagentModelsValidationService
{
  declare readonly _serviceBrand: undefined;

  constructor(
    @IConfigService config: IConfigService,
    @IFlagService flags: IFlagService,
    @IModelCatalog modelCatalog: IModelCatalog,
  ) {
    assertValidSubagentModelConfig(config, flags, modelCatalog);
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionSubagentModelsValidationService,
  SessionSubagentModelsValidationService,
  ScopeActivation.OnScopeCreated,
  'subagent',
);
