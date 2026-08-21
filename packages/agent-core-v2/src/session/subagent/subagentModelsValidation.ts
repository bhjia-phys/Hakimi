/**
 * `subagent` domain — `ISessionSubagentModelsValidationService` contract:
 * startup validation of canonical `[subagent]` model routes.
 *
 * Canonical `agents` routes and the active preset's routes are primarily
 * validated before session materialization by the session lifecycle (see
 * `workspace/sessionLifecycle`); this service repeats the same check at
 * Session-scope activation as a backstop, so a configured route with an
 * unresolvable alias fails the session with `Error2(CONFIG_INVALID)` instead
 * of degrading into a mid-conversation tool failure handed back to the
 * parent model. Deprecated `[secondary_model]` aliases are not startup
 * blockers. Session-scoped — one instance per session; the contract carries
 * no methods because the validation is the construction side effect.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

export interface ISessionSubagentModelsValidationService {
  readonly _serviceBrand: undefined;
}

export const ISessionSubagentModelsValidationService: ServiceIdentifier<ISessionSubagentModelsValidationService> =
  createDecorator<ISessionSubagentModelsValidationService>(
    'sessionSubagentModelsValidationService',
  );
