/**
 * `subagent` domain — shared preset validation and App-scope activation contract.
 *
 * Defines the single process-wide serialization boundary used by manual and
 * automatic `[subagent].preset` activation, including a manual clear to base
 * routing. The public `activate` is the manual boundary: it stamps
 * `auto_preset.manual_lock = true` atomically with the preset so the automatic
 * decider defers to the human choice. The serialized `SubagentPresetActivationTransaction.activate`
 * used by the automatic decider patches only `preset` and never the lock. A
 * transaction validates against the live config and may be cancelled before
 * its User-layer commit starts; once that commit starts, its result is never
 * reported as cancelled. Both paths best-effort align a matching Memory-layer
 * patch when an overlay exists. App scope.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { IConfigService } from '#/app/config/config';
import type { IModelCatalog } from '#/kosong/model/catalog';

import {
  assertCanonicalSubagentModelEntry,
  SUBAGENT_SECTION,
  type SubagentConfig,
} from './configSection';

export type SubagentPresetActivationResult =
  | { readonly kind: 'activated'; readonly warning?: string }
  | { readonly kind: 'cancelled'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string; readonly commitStarted: boolean };

export interface SubagentPresetActivationTransaction {
  activate(preset: string, signal?: AbortSignal): Promise<SubagentPresetActivationResult>;
}

export interface ISubagentPresetActivationService {
  readonly _serviceBrand: undefined;
  readonly manualRevision: number;

  activate(preset: string, signal?: AbortSignal): Promise<SubagentPresetActivationResult>;
  runExclusive<T>(
    task: (transaction: SubagentPresetActivationTransaction) => Promise<T>,
  ): Promise<T>;
}

export const ISubagentPresetActivationService: ServiceIdentifier<ISubagentPresetActivationService> =
  createDecorator<ISubagentPresetActivationService>('subagentPresetActivationService');

export function validateSubagentPreset(
  config: IConfigService,
  modelCatalog: IModelCatalog,
  preset: string,
): string | undefined {
  if (preset === '') return undefined;
  const subagent = config.get<SubagentConfig | undefined>(SUBAGENT_SECTION);
  const presets = subagent?.presets ?? {};
  if (Object.keys(presets).length === 0) {
    return 'No [subagent].presets are configured.';
  }
  if (!Object.hasOwn(presets, preset)) {
    return `Invalid subagent preset "${preset}". Available presets: ${Object.keys(presets).join(', ')}.`;
  }
  const routes = presets[preset]!;
  for (const [profile, route] of Object.entries(routes)) {
    try {
      assertCanonicalSubagentModelEntry(
        route,
        `presets.${preset}.${profile}`,
        modelCatalog,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return `Subagent preset "${preset}" route "${profile}" is invalid: ${reason}`;
    }
  }
  return undefined;
}
