/**
 * `autoSubagentPreset` test stubs — minimal `IAutoSubagentPresetService` for
 * unit tests.
 *
 * Lives under `test/` (not `src/`). Import from a relative path.
 */

import { vi } from 'vitest';

import {
  IAutoSubagentPresetService,
  type AutoSubagentPresetContext,
  type AutoSubagentPresetEvaluation,
} from '#/app/autoSubagentPreset/autoSubagentPreset';
import type { SubagentRouteRequest } from '#/session/subagent/configSection';

export function stubAutoSubagentPreset(
  evaluate?: (
    request: SubagentRouteRequest,
    context: AutoSubagentPresetContext,
  ) => Promise<AutoSubagentPresetEvaluation>,
): IAutoSubagentPresetService {
  return {
    _serviceBrand: undefined,
    evaluate:
      evaluate ??
      vi.fn(async (request: SubagentRouteRequest) => ({ request, reason: 'stubbed' })),
    status: () => undefined,
  } as unknown as IAutoSubagentPresetService;
}