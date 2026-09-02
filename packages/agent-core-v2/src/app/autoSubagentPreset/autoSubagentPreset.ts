/**
 * `autoSubagentPreset` domain — automatic subagent-preset selection contract.
 *
 * Defines the App-scope evaluator, its process-global latest-decision snapshot,
 * structured/localizable reason codes, reproducible candidate score breakdowns,
 * and the `event.subagent.preset_evaluated` / `preset_changed` facts. A status's
 * current preset and score describe the state at evaluation start; an activated
 * preset records the committed post-evaluation choice. Payloads
 * contain routing identifiers and aggregate numeric evidence only — never
 * prompts, paths, summaries, error messages, or other user content. App scope.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type {
  SubagentAutoPresetConfig,
  SubagentRouteKind,
  SubagentRouteRequest,
} from '#/session/subagent/configSection';

export interface AutoSubagentPresetContext {
  readonly sessionId: string;
  readonly signal?: AbortSignal;
}

export type AutoSubagentPresetReasonCode =
  | 'cancelled'
  | 'flag_disabled'
  | 'auto_preset_disabled'
  | 'manual_lock'
  | 'caller_model_unavailable'
  | 'no_candidates'
  | 'explicit_preset'
  | 'no_quota_evidence'
  | 'no_healthy_candidate'
  | 'current_optimal'
  | 'score_margin_not_met'
  | 'switch_cooldown'
  | 'current_unhealthy'
  | 'circuit_breaker_escape'
  | 'higher_score'
  | 'manual_override'
  | 'preset_changed_during_evaluation'
  | 'routing_config_changed'
  | 'evaluation_failed'
  | 'activation_failed'
  | 'activation_no_effect';

export type AutoSubagentPresetCandidateAvailability =
  | 'healthy'
  | 'route_unresolved'
  | 'quota_unknown'
  | 'quota_below_floor'
  | 'circuit_open';

export type AutoSubagentPresetEvidenceScope = 'profile' | 'provider' | 'none';

export interface AutoSubagentPresetScoreContributions {
  readonly quotaRemaining?: number;
  readonly priorityBonus: number;
  readonly resetBonus: number;
  readonly routeFitBonus: number;
  readonly tokenPenalty: number;
  readonly reliabilityPenalty: number;
  readonly latencyPenalty: number;
}

export interface AutoSubagentPresetLocalEvidence {
  readonly scope: AutoSubagentPresetEvidenceScope;
  readonly sampleCount: number;
  readonly failureCount: number;
  readonly adjustedFailureRate: number;
  readonly tokenCount: number;
  readonly averageFirstTokenLatencyMs?: number;
  readonly firstTokenLatencySampleCount: number;
  readonly llmRequestCount: number;
}

export interface AutoSubagentPresetCandidateScore {
  readonly preset: string;
  readonly provider?: string;
  readonly availability: AutoSubagentPresetCandidateAvailability;
  readonly selectable: boolean;
  readonly score?: number;
  readonly quotaRemainingPercent?: number;
  readonly quotaResetAt?: number;
  readonly circuitBreakerOpenUntil?: number;
  readonly contributions: AutoSubagentPresetScoreContributions;
  readonly localEvidence: AutoSubagentPresetLocalEvidence;
}

export interface AutoSubagentPresetPolicySnapshot {
  readonly quotaFloorPercent: number;
  readonly switchMarginPercent: number;
  readonly localUsageWindowMs: number;
  readonly localUsageWeightPercent: number;
  readonly priorityWeightPercent: number;
  readonly reliabilityWeightPercent: number;
  readonly latencyWeightPercent: number;
  readonly switchCooldownMs: number;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerCooldownMs: number;
}

export interface AutoSubagentPresetStatus {
  readonly evaluatedAt: number;
  readonly route: SubagentRouteKind;
  readonly profileName?: string;
  readonly reasonCode: AutoSubagentPresetReasonCode;
  readonly currentPreset?: string;
  readonly selectedPreset?: string;
  readonly activatedPreset?: string;
  readonly currentScore?: number;
  readonly selectedScore?: number;
  readonly switchCooldownUntil?: number;
  readonly candidates: readonly AutoSubagentPresetCandidateScore[];
  readonly policy: AutoSubagentPresetPolicySnapshot;
}

export interface SubagentPresetEvaluatedPayload extends AutoSubagentPresetStatus {
  readonly sessionId: string;
}

export interface SubagentPresetChangedPayload {
  readonly sessionId: string;
  readonly previousPreset?: string;
  readonly currentPreset: string;
  readonly reasonCode: AutoSubagentPresetReasonCode;
  readonly profileName?: string;
  readonly evaluatedAt: number;
  readonly previousScore?: number;
  readonly currentScore?: number;
}

export const SUBAGENT_PRESET_EVALUATED_EVENT_TYPE = 'event.subagent.preset_evaluated';
export const SUBAGENT_PRESET_CHANGED_EVENT_TYPE = 'event.subagent.preset_changed';

export interface AutoSubagentPresetEvaluation {
  readonly request: SubagentRouteRequest;
  readonly currentPreset?: string;
  readonly activatedPreset?: string;
  readonly reason: string;
  readonly reasonCode?: AutoSubagentPresetReasonCode;
  readonly status?: AutoSubagentPresetStatus;
}

export interface IAutoSubagentPresetService {
  readonly _serviceBrand: undefined;

  evaluate(
    request: SubagentRouteRequest,
    context: AutoSubagentPresetContext,
  ): Promise<AutoSubagentPresetEvaluation>;
  status(): AutoSubagentPresetStatus | undefined;
}

export const IAutoSubagentPresetService: ServiceIdentifier<IAutoSubagentPresetService> =
  createDecorator<IAutoSubagentPresetService>('autoSubagentPresetService');

export function autoSubagentPresetPolicySnapshot(
  settings: SubagentAutoPresetConfig,
): AutoSubagentPresetPolicySnapshot {
  return {
    quotaFloorPercent: settings.quotaFloorPercent,
    switchMarginPercent: settings.switchMarginPercent,
    localUsageWindowMs: settings.localUsageWindowMs,
    localUsageWeightPercent: settings.localUsageWeightPercent,
    priorityWeightPercent: settings.priorityWeightPercent,
    reliabilityWeightPercent: settings.reliabilityWeightPercent,
    latencyWeightPercent: settings.latencyWeightPercent,
    switchCooldownMs: settings.switchCooldownMs,
    circuitBreakerFailureThreshold: settings.circuitBreakerFailureThreshold,
    circuitBreakerCooldownMs: settings.circuitBreakerCooldownMs,
  };
}
