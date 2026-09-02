/**
 * `autoSubagentPreset` domain — `IAutoSubagentPresetService` implementation.
 *
 * Scores configured subagent presets from provider quota/reset evidence, local
 * priority, route/model fit, token use, profile-aware reliability and latency,
 * then applies margin, process-local switch cooldown, and ledger-rebuilt circuit
 * breakers. Provider evidence and ledger hydration stay outside the shared
 * `subagent` activation critical section; the section, manual revision, flag,
 * manual lock, and routing snapshot are rechecked before a write. Every result
 * updates a structured App-scope status and emits a sanitized evaluated fact;
 * committed switches emit the corresponding changed fact. Failures are
 * best-effort and fail open. Bound at App scope.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { IConfigService } from '#/app/config/config';
import { ILogService } from '#/_base/log/log';
import { IFlagService } from '#/app/flag/flag';
import { IEventService } from '#/app/event/event';
import { isUnknownCapability } from '#/kosong/contract/capability';
import { IModelCatalog } from '#/kosong/model/catalog';
import { grandTotal } from '#/kosong/contract/usage';
import {
  IProviderUsageService,
  type ProviderUsageResult,
} from '#/app/providerUsage/providerUsage';
import {
  IAgentRunUsageService,
  type AgentRunUsageEntry,
} from '#/app/agentRunUsage/agentRunUsage';
import { AUTO_SUBAGENT_PRESET_FLAG_ID } from '#/session/subagent/flag';
import {
  SUBAGENT_SECTION,
  activeSubagentPreset,
  resolveSubagentAutoPresetConfig,
  resolveSubagentBindingForPreset,
  type SubagentAutoPresetConfig,
  type SubagentConfig,
  type SubagentRouteRequest,
} from '#/session/subagent/configSection';
import { ISubagentPresetActivationService } from '#/session/subagent/presetActivation';

import {
  autoSubagentPresetPolicySnapshot,
  type AutoSubagentPresetCandidateAvailability,
  type AutoSubagentPresetCandidateScore,
  type AutoSubagentPresetContext,
  type AutoSubagentPresetEvaluation,
  type AutoSubagentPresetEvidenceScope,
  type AutoSubagentPresetLocalEvidence,
  type AutoSubagentPresetReasonCode,
  type AutoSubagentPresetStatus,
  IAutoSubagentPresetService,
  SUBAGENT_PRESET_CHANGED_EVENT_TYPE,
  SUBAGENT_PRESET_EVALUATED_EVENT_TYPE,
  type SubagentPresetChangedPayload,
  type SubagentPresetEvaluatedPayload,
} from './autoSubagentPreset';

export const MAX_TRACKED_FINISHED_RUNS = 10_000;
export const AUTO_PRESET_RESET_BONUS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const AUTO_PRESET_MAX_RESET_BONUS = 2;
export const AUTO_PRESET_EXPLICIT_ROUTE_BONUS = 2;
export const AUTO_PRESET_THINKING_FIT_BONUS = 1;
export const AUTO_PRESET_PROFILE_SAMPLE_THRESHOLD = 3;
export const AUTO_PRESET_FULL_CONFIDENCE_SAMPLE_COUNT = 5;

const PROVIDER_FAILURE_CODES = new Set([
  'provider.rate_limit',
  'provider.connection_error',
  'provider.overloaded',
  'provider.auth_error',
]);

export interface ProviderQuotaEvidence {
  readonly remainingPercent: number;
  readonly resetAt?: number;
}

interface CandidateDraft {
  readonly preset: string;
  readonly index: number;
  provider?: string;
  routeFitBonus: number;
  quota?: ProviderQuotaEvidence;
  tokenCount: number;
  localEvidence: AutoSubagentPresetLocalEvidence;
  circuitBreakerOpenUntil?: number;
}

interface QuotaCacheEntry {
  readonly result: ProviderUsageResult | undefined;
  readonly resolvedAt: number;
}

interface HydrationFlight {
  readonly promise: Promise<boolean>;
}

interface LocalStats {
  readonly evidence: AutoSubagentPresetLocalEvidence;
  readonly circuitBreakerOpenUntil?: number;
}

interface Decision {
  readonly selectedPreset?: string;
  readonly activatePreset?: string;
  readonly reasonCode: AutoSubagentPresetReasonCode;
}

interface CommitOutcome {
  readonly currentPreset?: string;
  readonly selectedPreset?: string;
  readonly activatedPreset?: string;
  readonly reasonCode: AutoSubagentPresetReasonCode;
}

interface EvaluationDetails extends CommitOutcome {
  readonly candidates?: readonly AutoSubagentPresetCandidateScore[];
}

export function providerQuotaEvidence(
  result: ProviderUsageResult | undefined,
  allowExtraUsage: boolean,
  now: number = Date.now(),
): ProviderQuotaEvidence | undefined {
  if (result === undefined || result.kind !== 'ok') return undefined;
  const rows = result.summary === null ? [...result.limits] : [result.summary, ...result.limits];
  let plan: ProviderQuotaEvidence | undefined;
  for (const row of rows) {
    const remainingPercent = windowRemainingPercent(row.limit, row.used);
    if (remainingPercent === undefined) continue;
    const resetAt = futureResetAt(row.resetAt, now);
    if (
      plan === undefined ||
      remainingPercent < plan.remainingPercent ||
      (remainingPercent === plan.remainingPercent &&
        resetAt !== undefined &&
        (plan.resetAt === undefined || resetAt < plan.resetAt))
    ) {
      plan = { remainingPercent, resetAt };
    }
  }

  const wallet = walletRemainingPercent(result, allowExtraUsage);
  if (plan === undefined) {
    return wallet === undefined ? undefined : { remainingPercent: wallet };
  }
  if (wallet !== undefined && wallet > plan.remainingPercent) {
    return { remainingPercent: wallet };
  }
  return plan;
}

export function providerQuotaPercent(
  result: ProviderUsageResult | undefined,
  allowExtraUsage: boolean,
): number | undefined {
  return providerQuotaEvidence(result, allowExtraUsage)?.remainingPercent;
}

function windowRemainingPercent(limit: number, used: number): number | undefined {
  if (!Number.isFinite(limit) || limit <= 0) return undefined;
  const consumed = Number.isFinite(used) && used > 0 ? used : 0;
  return Math.min(100, Math.max(0, ((limit - consumed) / limit) * 100));
}

function walletRemainingPercent(
  result: Extract<ProviderUsageResult, { readonly kind: 'ok' }>,
  allowExtraUsage: boolean,
): number | undefined {
  if (!allowExtraUsage || result.extraUsage === null) return undefined;
  const { balanceCents, totalCents } = result.extraUsage;
  if (
    !Number.isFinite(totalCents) ||
    totalCents <= 0 ||
    !Number.isFinite(balanceCents) ||
    balanceCents <= 0
  ) {
    return undefined;
  }
  return Math.min(100, Math.max(0, (balanceCents / totalCents) * 100));
}

function futureResetAt(raw: string | undefined, now: number): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > now ? parsed : undefined;
}

export class AutoSubagentPresetService extends Disposable implements IAutoSubagentPresetService {
  declare readonly _serviceBrand: undefined;

  private readonly quotaCache = new Map<string, QuotaCacheEntry>();
  private readonly inFlightQuota = new Map<string, Promise<ProviderUsageResult | undefined>>();
  private readonly finishedRuns = new Map<string, AgentRunUsageEntry>();
  private maxTrackedRuns = MAX_TRACKED_FINISHED_RUNS;
  private hydrated = false;
  private hydration: HydrationFlight | undefined;
  private hydrationGeneration = 0;
  private switchCooldownUntil: number | undefined;
  private latestStatus: AutoSubagentPresetStatus | undefined;

  constructor(
    @IConfigService private readonly config: IConfigService,
    @IFlagService private readonly flags: IFlagService,
    @IModelCatalog private readonly modelCatalog: IModelCatalog,
    @IProviderUsageService private readonly usage: IProviderUsageService,
    @IAgentRunUsageService private readonly runUsage: IAgentRunUsageService,
    @ISubagentPresetActivationService
    private readonly activation: ISubagentPresetActivationService,
    @IEventService private readonly eventService: IEventService,
    @ILogService private readonly log: ILogService,
  ) {
    super();
    this._register(this.runUsage.onDidFinishRun(this.onRunFinished));
  }

  status(): AutoSubagentPresetStatus | undefined {
    return this.latestStatus;
  }

  async evaluate(
    request: SubagentRouteRequest,
    context: AutoSubagentPresetContext,
  ): Promise<AutoSubagentPresetEvaluation> {
    const evaluatedAt = Date.now();
    try {
      return await this.evaluateInner(request, context, evaluatedAt);
    } catch {
      this.log.warn('auto subagent preset evaluation failed; keeping the current preset');
      const section = this.readSection();
      const settings = resolveSubagentAutoPresetConfig(section);
      return this.completeEvaluation(request, context, evaluatedAt, settings, {
        currentPreset: activeSubagentPreset(section),
        reasonCode: 'evaluation_failed',
      });
    }
  }

  private async evaluateInner(
    request: SubagentRouteRequest,
    context: AutoSubagentPresetContext,
    evaluatedAt: number,
  ): Promise<AutoSubagentPresetEvaluation> {
    const section = this.readSection();
    const settings = resolveSubagentAutoPresetConfig(section);
    const currentPreset = activeSubagentPreset(section);
    if (isAborted(context.signal)) {
      return this.completeEvaluation(request, context, evaluatedAt, settings, {
        currentPreset,
        reasonCode: 'cancelled',
      });
    }
    if (!this.flags.enabled(AUTO_SUBAGENT_PRESET_FLAG_ID)) {
      this.disarm();
      return this.completeEvaluation(request, context, evaluatedAt, settings, {
        currentPreset,
        reasonCode: 'flag_disabled',
      });
    }
    if (!settings.enabled) {
      this.disarm();
      return this.completeEvaluation(request, context, evaluatedAt, settings, {
        currentPreset,
        reasonCode: 'auto_preset_disabled',
      });
    }
    if (settings.manualLock) {
      this.disarm();
      return this.completeEvaluation(request, context, evaluatedAt, settings, {
        currentPreset,
        reasonCode: 'manual_lock',
      });
    }
    if (
      typeof request.caller.modelAlias !== 'string' ||
      request.caller.modelAlias.trim().length === 0
    ) {
      return this.completeEvaluation(request, context, evaluatedAt, settings, {
        currentPreset,
        reasonCode: 'caller_model_unavailable',
      });
    }

    const candidates = this.candidatePresets(settings, section);
    if (candidates.length === 0) {
      return this.completeEvaluation(request, context, evaluatedAt, settings, {
        currentPreset,
        reasonCode: 'no_candidates',
      });
    }
    if (currentPreset !== undefined && !candidates.includes(currentPreset)) {
      return this.completeEvaluation(request, context, evaluatedAt, settings, {
        currentPreset,
        reasonCode: 'explicit_preset',
      });
    }

    const assumedManualRevision = this.activation.manualRevision;
    const assumedDecisionSnapshot = autoDecisionSnapshot(section);
    const states = await this.scoreCandidates(request, candidates, settings, evaluatedAt, context.signal);
    const outcome = await this.commitDecision(
      request,
      states,
      currentPreset,
      assumedManualRevision,
      assumedDecisionSnapshot,
      context,
      evaluatedAt,
    );
    return this.completeEvaluation(request, context, evaluatedAt, settings, {
      ...outcome,
      candidates: states,
    });
  }

  private async scoreCandidates(
    request: SubagentRouteRequest,
    candidates: readonly string[],
    settings: SubagentAutoPresetConfig,
    now: number,
    signal: AbortSignal | undefined,
  ): Promise<readonly AutoSubagentPresetCandidateScore[]> {
    await this.ensureUsageHydrated();

    const drafts = candidates.map<CandidateDraft>((preset, index) => ({
      preset,
      index,
      routeFitBonus: 0,
      tokenCount: 0,
      localEvidence: emptyLocalEvidence(),
    }));
    for (const draft of drafts) this.resolveCandidateRoute(draft, request);

    const tokenTotals = this.tokenTotals(settings.localUsageWindowMs, now);
    for (const draft of drafts) {
      if (draft.provider === undefined) continue;
      draft.tokenCount = tokenTotals.get(draft.provider) ?? 0;
      const stats = this.localStats(
        draft.provider,
        request.profileName,
        settings,
        now,
      );
      draft.localEvidence = { ...stats.evidence, tokenCount: draft.tokenCount };
      draft.circuitBreakerOpenUntil = stats.circuitBreakerOpenUntil;
    }

    await Promise.all(
      drafts.map(async (draft) => {
        if (draft.provider === undefined) return;
        const result = await this.quotaResultOf(draft.provider, settings, signal);
        draft.quota = providerQuotaEvidence(result, settings.allowExtraUsage, now);
      }),
    );

    const maxTokens = Math.max(0, ...drafts.map((draft) => draft.tokenCount));
    const maxLatency = Math.max(
      0,
      ...drafts.map((draft) => draft.localEvidence.averageFirstTokenLatencyMs ?? 0),
    );
    return Object.freeze(
      drafts.map((draft) => this.finalizeCandidate(draft, candidates.length, settings, now, maxTokens, maxLatency)),
    );
  }

  private resolveCandidateRoute(draft: CandidateDraft, request: SubagentRouteRequest): void {
    try {
      const resolution = resolveSubagentBindingForPreset(
        this.config,
        this.flags,
        this.modelCatalog,
        draft.preset,
        request,
      );
      const model = this.modelCatalog.get(resolution.model);
      draft.provider = model.providerName;
      if (resolution.modelSource === 'preset') {
        draft.routeFitBonus += AUTO_PRESET_EXPLICIT_ROUTE_BONUS;
      }
      if (model.capabilities !== undefined && !isUnknownCapability(model.capabilities)) {
        const wantsThinking = resolution.thinking !== undefined && resolution.thinking !== 'off';
        if (model.capabilities.thinking === wantsThinking) {
          draft.routeFitBonus += AUTO_PRESET_THINKING_FIT_BONUS;
        }
      }
    } catch {
      draft.provider = undefined;
    }
  }

  private finalizeCandidate(
    draft: CandidateDraft,
    candidateCount: number,
    settings: SubagentAutoPresetConfig,
    now: number,
    maxTokens: number,
    maxLatency: number,
  ): AutoSubagentPresetCandidateScore {
    const priorityBonus = priorityBonusFor(draft.index, candidateCount, settings.priorityWeightPercent);
    const resetBonus = resetBonusFor(draft.quota?.resetAt, now);
    const tokenPenalty =
      maxTokens === 0
        ? 0
        : settings.localUsageWeightPercent * Math.min(1, draft.tokenCount / maxTokens);
    const reliabilityPenalty =
      settings.reliabilityWeightPercent * draft.localEvidence.adjustedFailureRate;
    const latencyConfidence = evidenceConfidence(
      draft.localEvidence.firstTokenLatencySampleCount,
    );
    const latencyPenalty =
      maxLatency === 0 || draft.localEvidence.averageFirstTokenLatencyMs === undefined
        ? 0
        : settings.latencyWeightPercent *
          Math.min(1, draft.localEvidence.averageFirstTokenLatencyMs / maxLatency) *
          latencyConfidence;
    const score =
      draft.quota === undefined
        ? undefined
        : draft.quota.remainingPercent +
          priorityBonus +
          resetBonus +
          draft.routeFitBonus -
          tokenPenalty -
          reliabilityPenalty -
          latencyPenalty;
    const availability = candidateAvailability(draft, settings, now);
    return Object.freeze({
      preset: draft.preset,
      provider: draft.provider,
      availability,
      selectable: availability === 'healthy',
      score,
      quotaRemainingPercent: draft.quota?.remainingPercent,
      quotaResetAt: draft.quota?.resetAt,
      circuitBreakerOpenUntil: activeDeadline(draft.circuitBreakerOpenUntil, now),
      contributions: Object.freeze({
        quotaRemaining: draft.quota?.remainingPercent,
        priorityBonus,
        resetBonus,
        routeFitBonus: draft.routeFitBonus,
        tokenPenalty,
        reliabilityPenalty,
        latencyPenalty,
      }),
      localEvidence: Object.freeze(draft.localEvidence),
    });
  }

  private commitDecision(
    request: SubagentRouteRequest,
    states: readonly AutoSubagentPresetCandidateScore[],
    assumedCurrent: string | undefined,
    assumedManualRevision: number,
    assumedDecisionSnapshot: string,
    context: AutoSubagentPresetContext,
    evaluatedAt: number,
  ): Promise<CommitOutcome> {
    return this.activation.runExclusive(async (transaction) => {
      if (isAborted(context.signal)) return { reasonCode: 'cancelled' };
      if (!this.flags.enabled(AUTO_SUBAGENT_PRESET_FLAG_ID)) {
        this.disarm();
        return { reasonCode: 'flag_disabled' };
      }

      const section = this.readSection();
      const settings = resolveSubagentAutoPresetConfig(section);
      if (!settings.enabled) {
        this.disarm();
        return { reasonCode: 'auto_preset_disabled' };
      }
      if (settings.manualLock) {
        this.disarm();
        return { reasonCode: 'manual_lock' };
      }
      const candidates = this.candidatePresets(settings, section);
      if (candidates.length === 0) return { reasonCode: 'no_candidates' };
      const currentPreset = activeSubagentPreset(section);
      if (this.activation.manualRevision !== assumedManualRevision) {
        return { currentPreset, reasonCode: 'manual_override' };
      }
      if (currentPreset !== assumedCurrent) {
        return { currentPreset, reasonCode: 'preset_changed_during_evaluation' };
      }
      if (currentPreset !== undefined && !candidates.includes(currentPreset)) {
        return { currentPreset, reasonCode: 'explicit_preset' };
      }
      if (autoDecisionSnapshot(section) !== assumedDecisionSnapshot) {
        return { currentPreset, reasonCode: 'routing_config_changed' };
      }

      const now = Date.now();
      const decision = this.decide(states, currentPreset, settings, now);
      if (decision.activatePreset === undefined || decision.activatePreset === currentPreset) {
        return {
          currentPreset,
          selectedPreset: decision.selectedPreset,
          reasonCode: decision.reasonCode,
        };
      }

      const result = await transaction.activate(decision.activatePreset, context.signal);
      if (result.kind === 'cancelled') return { currentPreset, reasonCode: 'cancelled' };
      if (result.kind === 'failed') {
        this.log.warn('auto subagent preset activation failed; keeping the current preset');
        return {
          currentPreset,
          selectedPreset: decision.selectedPreset,
          reasonCode: 'activation_failed',
        };
      }
      if (result.warning !== undefined) {
        this.log.warn('auto subagent preset activation completed with a runtime warning');
      }
      const effectivePreset = activeSubagentPreset(this.readSection());
      if (effectivePreset !== decision.activatePreset) {
        return {
          currentPreset: effectivePreset,
          selectedPreset: decision.selectedPreset,
          reasonCode: 'activation_no_effect',
        };
      }

      this.switchCooldownUntil = Date.now() + settings.switchCooldownMs;
      const previousScore = scoreOf(states, currentPreset);
      const currentScore = scoreOf(states, decision.activatePreset);
      const payload: SubagentPresetChangedPayload = {
        sessionId: context.sessionId,
        previousPreset: currentPreset,
        currentPreset: decision.activatePreset,
        reasonCode: decision.reasonCode,
        profileName: request.profileName,
        evaluatedAt,
        previousScore,
        currentScore,
      };
      this.eventService.publish({ type: SUBAGENT_PRESET_CHANGED_EVENT_TYPE, payload });
      return {
        currentPreset,
        selectedPreset: decision.selectedPreset,
        activatedPreset: decision.activatePreset,
        reasonCode: decision.reasonCode,
      };
    });
  }

  private decide(
    states: readonly AutoSubagentPresetCandidateScore[],
    currentPreset: string | undefined,
    settings: SubagentAutoPresetConfig,
    now: number,
  ): Decision {
    const target = highestScoringHealthy(states, currentPreset);
    if (target === undefined) {
      return {
        reasonCode: states.some((state) => state.quotaRemainingPercent !== undefined)
          ? 'no_healthy_candidate'
          : 'no_quota_evidence',
      };
    }
    if (currentPreset === undefined) {
      return {
        selectedPreset: target.preset,
        activatePreset: target.preset,
        reasonCode: 'higher_score',
      };
    }

    const current = states.find((state) => state.preset === currentPreset);
    if (target.preset === currentPreset) {
      return { selectedPreset: currentPreset, reasonCode: 'current_optimal' };
    }
    if (current?.selectable !== true) {
      return {
        selectedPreset: target.preset,
        activatePreset: target.preset,
        reasonCode:
          current?.availability === 'circuit_open'
            ? 'circuit_breaker_escape'
            : 'current_unhealthy',
      };
    }

    const lead = (target.score ?? Number.NEGATIVE_INFINITY) - (current.score ?? 0);
    if (lead < settings.switchMarginPercent) {
      return { selectedPreset: target.preset, reasonCode: 'score_margin_not_met' };
    }
    if (activeDeadline(this.switchCooldownUntil, now) !== undefined) {
      return { selectedPreset: target.preset, reasonCode: 'switch_cooldown' };
    }
    return {
      selectedPreset: target.preset,
      activatePreset: target.preset,
      reasonCode: 'higher_score',
    };
  }

  private completeEvaluation(
    request: SubagentRouteRequest,
    context: AutoSubagentPresetContext,
    evaluatedAt: number,
    settings: SubagentAutoPresetConfig,
    details: EvaluationDetails,
  ): AutoSubagentPresetEvaluation {
    const candidates = details.candidates ?? [];
    const status: AutoSubagentPresetStatus = Object.freeze({
      evaluatedAt,
      route: request.route,
      profileName: request.profileName,
      reasonCode: details.reasonCode,
      currentPreset: details.currentPreset,
      selectedPreset: details.selectedPreset,
      activatedPreset: details.activatedPreset,
      currentScore: scoreOf(candidates, details.currentPreset),
      selectedScore: scoreOf(candidates, details.selectedPreset),
      switchCooldownUntil: activeDeadline(this.switchCooldownUntil, evaluatedAt),
      candidates,
      policy: Object.freeze(autoSubagentPresetPolicySnapshot(settings)),
    });
    this.latestStatus = status;
    const payload: SubagentPresetEvaluatedPayload = { ...status, sessionId: context.sessionId };
    try {
      this.eventService.publish({ type: SUBAGENT_PRESET_EVALUATED_EVENT_TYPE, payload });
    } catch {
      this.log.warn('auto subagent preset evaluated event publish failed');
    }
    return {
      request,
      currentPreset: details.currentPreset,
      activatedPreset: details.activatedPreset,
      reason: legacyReason(details.reasonCode),
      reasonCode: details.reasonCode,
      status,
    };
  }

  private readSection(): SubagentConfig | undefined {
    try {
      return this.config.get<SubagentConfig | undefined>(SUBAGENT_SECTION);
    } catch {
      return undefined;
    }
  }

  private candidatePresets(
    settings: SubagentAutoPresetConfig,
    section: SubagentConfig | undefined,
  ): string[] {
    const configured = Object.keys(section?.presets ?? {});
    if (settings.candidates === undefined) return configured;
    return settings.candidates.filter((name) => configured.includes(name));
  }

  private async quotaResultOf(
    provider: string,
    settings: SubagentAutoPresetConfig,
    signal: AbortSignal | undefined,
  ): Promise<ProviderUsageResult | undefined> {
    const now = Date.now();
    const cached = this.quotaCache.get(provider);
    if (cached !== undefined && now - cached.resolvedAt < settings.refreshIntervalMs) {
      return cached.result;
    }
    const existing = this.inFlightQuota.get(provider);
    if (existing !== undefined) return awaitWithCallerAbort(existing, signal);

    const pending = this.queryQuota(provider, settings, signal);
    this.inFlightQuota.set(provider, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlightQuota.get(provider) === pending) this.inFlightQuota.delete(provider);
    }
  }

  private async queryQuota(
    provider: string,
    settings: SubagentAutoPresetConfig,
    signal: AbortSignal | undefined,
  ): Promise<ProviderUsageResult | undefined> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onCallerAbort: (() => void) | undefined;
    const query = Promise.resolve()
      .then(() => this.usage.queryUsage(provider, { signal: controller.signal }))
      .then(
        (results) => ({ kind: 'result' as const, result: results[0] }),
        () => ({ kind: 'failed' as const }),
      );
    const timedOut = new Promise<{ readonly kind: 'timeout' }>((resolve) => {
      timeout = setTimeout(() => resolve({ kind: 'timeout' }), settings.queryTimeoutMs);
    });
    const callerAborted = new Promise<{ readonly kind: 'caller-abort' }>((resolve) => {
      if (signal === undefined) return;
      onCallerAbort = () => resolve({ kind: 'caller-abort' });
      signal.addEventListener('abort', onCallerAbort, { once: true });
    });

    try {
      const outcome = await Promise.race([query, timedOut, callerAborted]);
      if (outcome.kind === 'timeout' || outcome.kind === 'caller-abort') controller.abort();
      if (outcome.kind === 'caller-abort' || isAborted(signal)) return undefined;
      const result = outcome.kind === 'result' ? outcome.result : undefined;
      this.quotaCache.set(provider, { result, resolvedAt: Date.now() });
      return result;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (onCallerAbort !== undefined) signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private localStats(
    provider: string,
    profileName: string | undefined,
    settings: SubagentAutoPresetConfig,
    now: number,
  ): LocalStats {
    const localCutoff = now - settings.localUsageWindowMs;
    const providerSamples = this.providerRuns(provider)
      .filter((entry) => entry.finished !== undefined && entry.finished.endedAt >= localCutoff)
      .filter((entry) => entry.finished?.status !== 'cancelled');
    const profileSamples =
      profileName === undefined
        ? []
        : providerSamples.filter((entry) => entry.started.profileName === profileName);
    const useProfile = profileSamples.length >= AUTO_PRESET_PROFILE_SAMPLE_THRESHOLD;
    const samples = useProfile ? profileSamples : providerSamples;
    const scope: AutoSubagentPresetEvidenceScope =
      samples.length === 0 ? 'none' : useProfile ? 'profile' : 'provider';
    const failureCount = samples.filter((entry) => isReliabilityFailure(entry)).length;
    const rawFailureRate = samples.length === 0 ? 0 : failureCount / samples.length;
    let latencyTotalMs = 0;
    let firstTokenLatencySampleCount = 0;
    let llmRequestCount = 0;
    for (const entry of samples) {
      const average = entry.finished?.averageFirstTokenLatencyMs;
      if (average === undefined) continue;
      const sampleCount = entry.finished?.firstTokenLatencySampleCount ?? 1;
      if (sampleCount <= 0) continue;
      latencyTotalMs += average * sampleCount;
      firstTokenLatencySampleCount += sampleCount;
      llmRequestCount += entry.finished?.llmRequestCount ?? 0;
    }
    const evidence: AutoSubagentPresetLocalEvidence = {
      scope,
      sampleCount: samples.length,
      failureCount,
      adjustedFailureRate: rawFailureRate * evidenceConfidence(samples.length),
      tokenCount: 0,
      averageFirstTokenLatencyMs:
        firstTokenLatencySampleCount === 0
          ? undefined
          : latencyTotalMs / firstTokenLatencySampleCount,
      firstTokenLatencySampleCount,
      llmRequestCount,
    };
    return {
      evidence,
      circuitBreakerOpenUntil: this.circuitBreakerOpenUntil(provider, settings, now),
    };
  }

  private circuitBreakerOpenUntil(
    provider: string,
    settings: SubagentAutoPresetConfig,
    now: number,
  ): number | undefined {
    const runs = this.providerRuns(provider)
      .filter((entry) => entry.finished?.status !== 'cancelled')
      .toSorted((left, right) => right.finished!.endedAt - left.finished!.endedAt);
    let consecutiveFailures = 0;
    let lastFailureAt: number | undefined;
    for (const entry of runs) {
      if (entry.finished?.status === 'completed') break;
      if (entry.finished?.status === 'failed') {
        lastFailureAt ??= entry.finished.endedAt;
        consecutiveFailures += 1;
      }
    }
    if (
      consecutiveFailures < settings.circuitBreakerFailureThreshold ||
      lastFailureAt === undefined
    ) {
      return undefined;
    }
    return activeDeadline(lastFailureAt + settings.circuitBreakerCooldownMs, now);
  }

  private providerRuns(provider: string): AgentRunUsageEntry[] {
    const entries: AgentRunUsageEntry[] = [];
    for (const entry of this.finishedRuns.values()) {
      if (this.providerOfRun(entry) === provider) entries.push(entry);
    }
    return entries;
  }

  private providerOfRun(entry: AgentRunUsageEntry): string | undefined {
    const alias = entry.started.modelAlias;
    if (alias === undefined) return undefined;
    try {
      return this.modelCatalog.get(alias).providerName;
    } catch {
      return undefined;
    }
  }

  private tokenTotals(windowMs: number, now: number): Map<string, number> {
    const totals = new Map<string, number>();
    const cutoff = now - windowMs;
    for (const entry of this.finishedRuns.values()) {
      const finished = entry.finished;
      if (finished === undefined || finished.endedAt < cutoff || finished.usage === undefined) continue;
      const provider = this.providerOfRun(entry);
      if (provider === undefined) continue;
      totals.set(provider, (totals.get(provider) ?? 0) + grandTotal(finished.usage));
    }
    return totals;
  }

  private onRunFinished = (entry: AgentRunUsageEntry): void => {
    this.quotaCache.clear();
    if (!this.hydrated && this.hydration === undefined) return;
    if (!this.flags.enabled(AUTO_SUBAGENT_PRESET_FLAG_ID)) {
      this.disarm();
      return;
    }
    const settings = resolveSubagentAutoPresetConfig(this.readSection());
    if (!settings.enabled || settings.manualLock) {
      this.disarm();
      return;
    }
    if (entry.finished === undefined) return;
    this.rememberRun(entry);
  };

  private disarm(): void {
    this.hydrated = false;
    this.hydrationGeneration += 1;
    this.finishedRuns.clear();
  }

  private rememberRun(entry: AgentRunUsageEntry): void {
    this.rememberRunIn(this.finishedRuns, entry);
  }

  private rememberRunIn(
    runs: Map<string, AgentRunUsageEntry>,
    entry: AgentRunUsageEntry,
  ): void {
    const runId = entry.started.runId;
    if (runs.has(runId)) runs.delete(runId);
    if (runs.size >= this.maxTrackedRuns) {
      const oldest = runs.keys().next().value;
      if (oldest !== undefined) runs.delete(oldest);
    }
    runs.set(runId, entry);
  }

  private async ensureUsageHydrated(): Promise<void> {
    if (this.hydrated) return;
    const existing = this.hydration;
    if (existing !== undefined) {
      const succeeded = await existing.promise;
      if (!succeeded || this.hydrated) return;
      return this.ensureUsageHydrated();
    }

    const generation = this.hydrationGeneration;
    const promise = this.hydrateUsage(generation);
    const flight = { promise };
    this.hydration = flight;
    try {
      await promise;
    } finally {
      if (this.hydration === flight) this.hydration = undefined;
    }
  }

  private async hydrateUsage(generation: number): Promise<boolean> {
    let entries: readonly AgentRunUsageEntry[];
    try {
      entries = await this.runUsage.read();
    } catch {
      return false;
    }
    if (generation !== this.hydrationGeneration) return false;

    const byRunId = new Map<string, AgentRunUsageEntry>();
    for (const entry of entries) {
      if (entry.finished !== undefined) byRunId.set(entry.started.runId, entry);
    }
    for (const entry of this.finishedRuns.values()) {
      if (entry.finished !== undefined) byRunId.set(entry.started.runId, entry);
    }
    const sorted = [...byRunId.values()].toSorted(
      (left, right) => left.finished!.endedAt - right.finished!.endedAt,
    );
    const retained = sorted.slice(Math.max(0, sorted.length - this.maxTrackedRuns));
    if (generation !== this.hydrationGeneration) return false;

    this.finishedRuns.clear();
    for (const entry of retained) this.rememberRun(entry);
    this.hydrated = true;
    return true;
  }
}

function isReliabilityFailure(entry: AgentRunUsageEntry): boolean {
  const finished = entry.finished;
  if (finished?.status !== 'failed') return false;
  if (finished.errorCode !== undefined && PROVIDER_FAILURE_CODES.has(finished.errorCode)) return true;
  return finished.status === 'failed';
}

function legacyReason(reasonCode: AutoSubagentPresetReasonCode): string {
  switch (reasonCode) {
    case 'cancelled':
      return 'cancelled';
    case 'flag_disabled':
      return 'flag disabled';
    case 'auto_preset_disabled':
      return 'auto preset disabled';
    case 'manual_lock':
    case 'manual_override':
      return 'manual preset selection';
    case 'caller_model_unavailable':
      return 'no caller model';
    case 'no_candidates':
      return 'no candidate presets';
    case 'explicit_preset':
      return 'explicit preset selection';
    case 'no_quota_evidence':
      return 'no quota evidence';
    case 'no_healthy_candidate':
      return 'no candidate above quota floor';
    case 'current_optimal':
      return 'current preset already optimal';
    case 'score_margin_not_met':
      return 'candidate lead below switch margin';
    case 'switch_cooldown':
      return 'switch cooldown active';
    case 'current_unhealthy':
      return 'switched from unhealthy current preset';
    case 'circuit_breaker_escape':
      return 'switched from open circuit breaker';
    case 'higher_score':
      return 'switched to higher score';
    case 'preset_changed_during_evaluation':
      return 'preset changed during evaluation';
    case 'routing_config_changed':
      return 'routing config changed during evaluation';
    case 'evaluation_failed':
      return 'preset evaluation failed';
    case 'activation_failed':
      return 'preset activation failed';
    case 'activation_no_effect':
      return 'preset activation did not change the active preset';
  }
}

function emptyLocalEvidence(): AutoSubagentPresetLocalEvidence {
  return {
    scope: 'none',
    sampleCount: 0,
    failureCount: 0,
    adjustedFailureRate: 0,
    tokenCount: 0,
    firstTokenLatencySampleCount: 0,
    llmRequestCount: 0,
  };
}

function candidateAvailability(
  draft: CandidateDraft,
  settings: SubagentAutoPresetConfig,
  now: number,
): AutoSubagentPresetCandidateAvailability {
  if (draft.provider === undefined) return 'route_unresolved';
  if (activeDeadline(draft.circuitBreakerOpenUntil, now) !== undefined) return 'circuit_open';
  if (draft.quota === undefined) return 'quota_unknown';
  if (draft.quota.remainingPercent < settings.quotaFloorPercent) return 'quota_below_floor';
  return 'healthy';
}

function priorityBonusFor(index: number, count: number, weight: number): number {
  if (count <= 1) return weight;
  return weight * ((count - 1 - index) / (count - 1));
}

function resetBonusFor(resetAt: number | undefined, now: number): number {
  if (resetAt === undefined) return 0;
  const remainingMs = resetAt - now;
  if (remainingMs <= 0 || remainingMs > AUTO_PRESET_RESET_BONUS_WINDOW_MS) return 0;
  return AUTO_PRESET_MAX_RESET_BONUS *
    (1 - remainingMs / AUTO_PRESET_RESET_BONUS_WINDOW_MS);
}

function evidenceConfidence(sampleCount: number): number {
  return Math.min(1, Math.max(0, sampleCount) / AUTO_PRESET_FULL_CONFIDENCE_SAMPLE_COUNT);
}

function highestScoringHealthy(
  states: readonly AutoSubagentPresetCandidateScore[],
  currentPreset: string | undefined,
): AutoSubagentPresetCandidateScore | undefined {
  let best: AutoSubagentPresetCandidateScore | undefined;
  for (const state of states) {
    if (!state.selectable || state.score === undefined) continue;
    if (best === undefined || state.score > best.score!) {
      best = state;
      continue;
    }
    if (state.score === best.score && state.preset === currentPreset) best = state;
  }
  return best;
}

function scoreOf(
  states: readonly AutoSubagentPresetCandidateScore[],
  preset: string | undefined,
): number | undefined {
  if (preset === undefined) return undefined;
  return states.find((state) => state.preset === preset)?.score;
}

function activeDeadline(deadline: number | undefined, now: number): number | undefined {
  return deadline !== undefined && deadline > now ? deadline : undefined;
}

function autoDecisionSnapshot(section: SubagentConfig | undefined): string {
  return JSON.stringify({
    preset: section?.preset,
    agents: section?.agents,
    presets: section?.presets,
    autoPreset: section?.autoPreset,
  });
}

async function awaitWithCallerAbort(
  pending: Promise<ProviderUsageResult | undefined>,
  signal: AbortSignal | undefined,
): Promise<ProviderUsageResult | undefined> {
  if (signal === undefined) return pending;
  if (signal.aborted) return undefined;
  let onAbort!: () => void;
  const aborted = new Promise<undefined>((resolve) => {
    onAbort = () => resolve(undefined);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([pending, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

registerScopedService(
  LifecycleScope.App,
  IAutoSubagentPresetService,
  AutoSubagentPresetService,
  ScopeActivation.OnDemand,
  'autoSubagentPreset',
);
