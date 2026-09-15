/**
 * `providerUsageLedger` test stubs — minimal `IProviderUsageLedgerService`.
 *
 * Lives under `test/` (not `src/`). Import from a relative path.
 */

import type { LocalMeteredUsage } from '#/app/providerUsage/meteredUsage';
import { IProviderUsageLedgerService } from '#/app/providerUsageLedger/providerUsageLedger';
import { aggregateMeteredUsage } from '#/app/providerUsageLedger/providerUsageLedgerService';

export function stubProviderUsageLedger(
  overrides: Partial<IProviderUsageLedgerService> = {},
): IProviderUsageLedgerService {
  return {
    _serviceBrand: undefined,
    startAttempt: () => undefined,
    finishAttempt: () => {},
    getMeteredUsage: async (): Promise<LocalMeteredUsage> =>
      aggregateMeteredUsage([], Date.now(), false, null),
    ...overrides,
  };
}
