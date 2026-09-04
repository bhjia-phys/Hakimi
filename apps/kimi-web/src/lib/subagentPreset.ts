import type {
  AppConfig,
  AutoSubagentPresetCandidateAvailability,
  AutoSubagentPresetCandidateScore,
  AutoSubagentPresetReasonCode,
  AutoSubagentPresetStatus,
  SubagentModelConfig,
} from '../api/types';

/** Minimal i18n translator signature the label helpers accept — lets callers
 *  pass the component's `useI18n().t` (or the singleton's `i18n.global.t`) so
 *  the helpers stay pure and unit-testable against both locales. */
export type SubagentPresetT = (key: string, named?: Record<string, unknown>) => string;

export const AUTO_SUBAGENT_PRESET_FLAG_ID = 'auto_subagent_preset';

export function autoSubagentPresetSupported(
  experimentalFlags: Readonly<Record<string, boolean>>,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    experimentalFlags,
    AUTO_SUBAGENT_PRESET_FLAG_ID,
  );
}

/** The runtime switches automatically only when both its effective feature flag
 *  and the subagent-domain preference are enabled. */
export function autoSubagentPresetEnabled(
  config: Pick<AppConfig, 'subagent'> | null | undefined,
  experimentalFlags: Readonly<Record<string, boolean>>,
): boolean {
  return (
    config?.subagent?.autoPreset?.enabled === true &&
    experimentalFlags[AUTO_SUBAGENT_PRESET_FLAG_ID] === true
  );
}

export function autoSubagentPresetFlagOverridden(
  config: Pick<AppConfig, 'experimental'> | null | undefined,
  experimentalFlags: Readonly<Record<string, boolean>>,
): boolean {
  if (!autoSubagentPresetSupported(experimentalFlags)) return false;
  const configured = config?.experimental?.[AUTO_SUBAGENT_PRESET_FLAG_ID] === true;
  return configured !== experimentalFlags[AUTO_SUBAGENT_PRESET_FLAG_ID];
}

/** One user-facing switch controls both internal gates without resending any
 *  existing preset or route tables; the daemon deep-merges each config domain.
 *  Subagent preference comes first so a partial write never enables the flag
 *  before its fail-closed domain gate is in place. */
export function autoSubagentPresetPatch(enabled: boolean): Partial<AppConfig> {
  return {
    subagent: { autoPreset: { enabled } },
    experimental: { [AUTO_SUBAGENT_PRESET_FLAG_ID]: enabled },
  };
}

/**
 * `autoPreset.manualLock` — set by the server whenever a preset is activated
 * manually. While true the auto-preset runtime keeps the manual choice and
 * stops switching on its own; the UI shows the persistent "manual lock" state.
 */
export function subagentPresetManualLock(
  config: Pick<AppConfig, 'subagent'> | null | undefined,
): boolean {
  return config?.subagent?.autoPreset?.manualLock === true;
}

/** Minimal resume-auto patch: clears only `autoPreset.manualLock`. The active
 *  preset and the auto-switching preference are left untouched — resuming never
 *  rewrites routing or the two auto gates. */
export function subagentPresetResumeAutoPatch(): Partial<AppConfig> {
  return { subagent: { autoPreset: { manualLock: false } } };
}

/**
 * Priority order of the automatic-switching candidates. A configured
 * `candidates` list — including an empty list — is authoritative as-is, so a
 * subset is never extended with missing presets. Without the field, every
 * declared preset in declaration order is considered.
 */
export function subagentPresetCandidatesOrder(
  config: Pick<AppConfig, 'subagent'> | null | undefined,
  declaredOrder: string[],
): string[] {
  const candidates = config?.subagent?.autoPreset?.candidates;
  return candidates === undefined ? [...declaredOrder] : [...candidates];
}

/** Persist the candidate priority list; targets only
 *  `subagent.autoPreset.candidates` (other auto-preset fields stay untouched). */
export function subagentPresetCandidatesPatch(candidates: string[]): Partial<AppConfig> {
  return { subagent: { autoPreset: { candidates } } };
}

export function mainRouteForPreset(
  config: Pick<AppConfig, 'subagent'>,
  preset: string,
): SubagentModelConfig | undefined {
  if (preset.length === 0) return undefined;
  return config.subagent?.presets?.[preset]?.['main'];
}

/**
 * Label for the persistent routing control in the chat header. An active preset
 * renders by name; an absent selector renders the base-routing fallback so the
 * current choice is always visible. The preset name rides a `{preset}` i18n
 * placeholder so both locales share the target shape.
 */
export function subagentPresetLabel(
  preset: string | undefined | null,
  t: SubagentPresetT,
): string {
  const normalized = preset?.trim();
  if (!normalized) return t('header.subagentPresetBase');
  return t('header.subagentPreset', { preset: normalized });
}

export function subagentPresetReasonLabel(
  reasonCode: AutoSubagentPresetReasonCode,
  t: SubagentPresetT,
): string {
  return t(`header.subagentPresetReasons.${reasonCode}`);
}

function scoreValue(value: number): string {
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  return normalized.toFixed(1);
}

export interface SubagentPresetCurrentEvaluation {
  readonly preset?: string;
  readonly score?: number;
}

export function subagentPresetCurrentEvaluation(
  status: AutoSubagentPresetStatus,
  activePreset: string | undefined,
): SubagentPresetCurrentEvaluation {
  const preset =
    status.activatedPreset?.trim() ||
    activePreset?.trim() ||
    status.currentPreset?.trim() ||
    undefined;
  if (preset === undefined) return {};
  const candidateScore = status.candidates.find(
    (candidate) => candidate.preset === preset,
  )?.score;
  const fallbackScore =
    preset === status.activatedPreset || preset === status.selectedPreset
      ? status.selectedScore
      : preset === status.currentPreset
        ? status.currentScore
        : undefined;
  return { preset, score: candidateScore ?? fallbackScore };
}

export function formatSubagentPresetScore(
  score: number | undefined,
  t: SubagentPresetT,
): string {
  return score === undefined
    ? t('header.subagentPresetScoreNoData')
    : t('header.subagentPresetScore', { score: scoreValue(score) });
}

export function formatSubagentPresetDuration(durationMs: number, t: SubagentPresetT): string {
  const safeMs = Math.max(0, durationMs);
  if (safeMs >= 60 * 60 * 1000) {
    return t('header.subagentPresetDurationHours', {
      count: Math.ceil(safeMs / (60 * 60 * 1000)),
    });
  }
  if (safeMs >= 60 * 1000) {
    return t('header.subagentPresetDurationMinutes', {
      count: Math.ceil(safeMs / (60 * 1000)),
    });
  }
  return t('header.subagentPresetDurationSeconds', {
    count: Math.max(1, Math.ceil(safeMs / 1000)),
  });
}

export function subagentPresetRemainingLabel(
  until: number | undefined,
  now: number,
  key: 'cooldown' | 'circuit',
  t: SubagentPresetT,
): string | undefined {
  if (until === undefined || until <= now) return undefined;
  return t(
    key === 'cooldown'
      ? 'header.subagentPresetCooldownRemaining'
      : 'header.subagentPresetCircuitRemaining',
    { duration: formatSubagentPresetDuration(until - now, t) },
  );
}

export function subagentPresetAvailabilityLabel(
  availability: AutoSubagentPresetCandidateAvailability,
  t: SubagentPresetT,
): string {
  return t(`header.subagentPresetAvailability.${availability}`);
}

function contributionLabel(
  key: 'quota' | 'priority' | 'reset' | 'routeFit' | 'tokens' | 'reliability' | 'latency',
  value: number,
  positive: boolean,
  t: SubagentPresetT,
): string {
  const sign = positive ? '+' : '−';
  return t('header.subagentPresetContributionValue', {
    label: t(`header.subagentPresetContributions.${key}`),
    value: `${sign}${scoreValue(Math.abs(value))}`,
  });
}

/** Compact candidate explanation for the header menu: strongest gain/loss plus
 *  an explicit missing-evidence or circuit-breaker state. */
export function subagentPresetCandidateSummary(
  candidate: AutoSubagentPresetCandidateScore,
  now: number,
  t: SubagentPresetT,
): string {
  const circuit = subagentPresetRemainingLabel(
    candidate.circuitBreakerOpenUntil,
    now,
    'circuit',
    t,
  );
  if (circuit !== undefined) return circuit;
  if (candidate.availability !== 'healthy') {
    return subagentPresetAvailabilityLabel(candidate.availability, t);
  }

  const gains = [
    ['quota', candidate.contributions.quotaRemaining] as const,
    ['priority', candidate.contributions.priorityBonus] as const,
    ['reset', candidate.contributions.resetBonus] as const,
    ['routeFit', candidate.contributions.routeFitBonus] as const,
  ]
    .filter(
      (entry): entry is readonly ['quota' | 'priority' | 'reset' | 'routeFit', number] =>
        entry[1] !== undefined && entry[1] > 0,
    )
    .toSorted((a, b) => b[1] - a[1]);
  const penalties = [
    ['tokens', candidate.contributions.tokenPenalty] as const,
    ['reliability', candidate.contributions.reliabilityPenalty] as const,
    ['latency', candidate.contributions.latencyPenalty] as const,
  ]
    .filter((entry) => entry[1] > 0)
    .toSorted((a, b) => b[1] - a[1]);
  const parts: string[] = [];
  const gain = gains[0];
  const penalty = penalties[0];
  if (gain !== undefined) parts.push(contributionLabel(gain[0], gain[1], true, t));
  if (penalty !== undefined) {
    parts.push(contributionLabel(penalty[0], penalty[1], false, t));
  }
  if (candidate.localEvidence.scope === 'none') {
    parts.push(t('header.subagentPresetNoLocalEvidence'));
  }
  return parts.length > 0 ? parts.join(' · ') : t('header.subagentPresetNoData');
}

/** Full deterministic score breakdown for the read-only Settings diagnostics. */
export function subagentPresetCandidateBreakdown(
  candidate: AutoSubagentPresetCandidateScore,
  t: SubagentPresetT,
): string {
  const c = candidate.contributions;
  const parts = [
    c.quotaRemaining === undefined
      ? t('header.subagentPresetQuotaNoData')
      : contributionLabel('quota', c.quotaRemaining, true, t),
    contributionLabel('priority', c.priorityBonus, true, t),
    contributionLabel('reset', c.resetBonus, true, t),
    contributionLabel('routeFit', c.routeFitBonus, true, t),
    contributionLabel('tokens', c.tokenPenalty, false, t),
    contributionLabel('reliability', c.reliabilityPenalty, false, t),
    contributionLabel('latency', c.latencyPenalty, false, t),
  ];
  return parts.join(' · ');
}

export function subagentPresetEvidenceLabel(
  candidate: AutoSubagentPresetCandidateScore,
  t: SubagentPresetT,
): string {
  if (candidate.localEvidence.scope === 'none') {
    return t('header.subagentPresetNoLocalEvidence');
  }
  return t(
    candidate.localEvidence.scope === 'profile'
      ? 'header.subagentPresetProfileEvidence'
      : 'header.subagentPresetProviderEvidence',
    { count: candidate.localEvidence.sampleCount },
  );
}

/** Preset values carried by a `subagentPreset` status turn (marker metadata). */
export interface SubagentPresetSwitchView {
  from?: string;
  to: string;
  reasonCode?: AutoSubagentPresetReasonCode;
  profileName?: string;
  evaluatedAt?: number;
  previousScore?: number;
  currentScore?: number;
}

/** Localized transcript separator for one automatic preset switch. */
export function subagentPresetChangedLabel(
  view: SubagentPresetSwitchView | undefined,
  t: SubagentPresetT,
): string {
  const to = view?.to ?? '';
  const switched = Boolean(view?.from && view.from !== view.to);
  const base = switched
    ? t('conversation.subagentPresetAutoSwitched', { from: view?.from, to })
    : t('conversation.subagentPresetAutoSet', { preset: to });
  if (view?.reasonCode === undefined) return base;
  let reason = subagentPresetReasonLabel(view.reasonCode, t);
  if (view.profileName) {
    reason = t('conversation.subagentPresetReasonWithProfile', {
      reason,
      profile: view.profileName,
    });
  }
  return t('conversation.subagentPresetSwitchWithReason', { switch: base, reason });
}
