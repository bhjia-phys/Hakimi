import { z } from 'zod';

export const providerConfigResponseSchema = z.object({
  type: z.string(),
  base_url: z.string().optional(),
  default_model: z.string().optional(),
  has_api_key: z.boolean(),
});
export type ProviderConfigResponse = z.infer<typeof providerConfigResponseSchema>;

export const configResponseSchema = z.object({
  providers: z.record(z.string(), providerConfigResponseSchema).default({}),
  default_provider: z.string().optional(),
  default_model: z.string().optional(),
  models: z.record(z.string(), z.unknown()).optional(),
  thinking: z.unknown().optional(),
  plan_mode: z.boolean().optional(),
  yolo: z.boolean().optional(),
  default_permission_mode: z.string().optional(),
  default_plan_mode: z.boolean().optional(),
  permission: z.unknown().optional(),
  hooks: z.array(z.unknown()).optional(),
  services: z.unknown().optional(),
  merge_all_available_skills: z.boolean().optional(),
  extra_skill_dirs: z.array(z.string()).optional(),
  loop_control: z.unknown().optional(),
  background: z.unknown().optional(),
  subagent: z.unknown().optional(),
  secondary_model: z.unknown().optional(),
  experimental: z.record(z.string(), z.boolean()).optional(),
  telemetry: z.boolean().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type ConfigResponse = z.infer<typeof configResponseSchema>;

export const subagentPresetActivationRequestSchema = z.object({
  /** Empty clears the active preset and returns subagents to base routing. */
  preset: z.string(),
});
export type SubagentPresetActivationRequest = z.infer<
  typeof subagentPresetActivationRequestSchema
>;

export const subagentPresetActivationResponseSchema = z.object({
  config: configResponseSchema,
  warning: z.string().optional(),
});
export type SubagentPresetActivationResponse = z.infer<
  typeof subagentPresetActivationResponseSchema
>;

export const autoSubagentPresetReasonCodeSchema = z.enum([
  'cancelled',
  'flag_disabled',
  'auto_preset_disabled',
  'manual_lock',
  'caller_model_unavailable',
  'no_candidates',
  'explicit_preset',
  'no_quota_evidence',
  'no_healthy_candidate',
  'current_optimal',
  'score_margin_not_met',
  'switch_cooldown',
  'current_unhealthy',
  'circuit_breaker_escape',
  'higher_score',
  'manual_override',
  'preset_changed_during_evaluation',
  'routing_config_changed',
  'evaluation_failed',
  'activation_failed',
  'activation_no_effect',
]);

const finiteNumberSchema = z.number().finite();
const nonNegativeNumberSchema = finiteNumberSchema.nonnegative();
const nonNegativeIntegerSchema = nonNegativeNumberSchema.int();
const rateSchema = nonNegativeNumberSchema.max(1);
const percentSchema = nonNegativeNumberSchema.max(100);
const nonEmptyStringSchema = z.string().min(1);

const autoSubagentPresetScoreContributionsCoreSchema = z.object({
  quotaRemaining: percentSchema.optional(),
  priorityBonus: nonNegativeNumberSchema,
  resetBonus: nonNegativeNumberSchema,
  routeFitBonus: nonNegativeNumberSchema,
  tokenPenalty: nonNegativeNumberSchema,
  reliabilityPenalty: nonNegativeNumberSchema,
  latencyPenalty: nonNegativeNumberSchema,
});

const autoSubagentPresetLocalEvidenceCoreSchema = z.object({
  scope: z.enum(['profile', 'provider', 'none']),
  sampleCount: nonNegativeIntegerSchema,
  failureCount: nonNegativeIntegerSchema,
  adjustedFailureRate: rateSchema,
  tokenCount: nonNegativeIntegerSchema,
  averageFirstTokenLatencyMs: nonNegativeNumberSchema.optional(),
  firstTokenLatencySampleCount: nonNegativeIntegerSchema,
  llmRequestCount: nonNegativeIntegerSchema,
});

const autoSubagentPresetCandidateScoreCoreSchema = z.object({
  preset: nonEmptyStringSchema,
  provider: nonEmptyStringSchema.optional(),
  availability: z.enum([
    'healthy',
    'route_unresolved',
    'quota_unknown',
    'quota_below_floor',
    'circuit_open',
  ]),
  selectable: z.boolean(),
  score: finiteNumberSchema.optional(),
  quotaRemainingPercent: percentSchema.optional(),
  quotaResetAt: nonNegativeNumberSchema.optional(),
  circuitBreakerOpenUntil: nonNegativeNumberSchema.optional(),
  contributions: autoSubagentPresetScoreContributionsCoreSchema,
  localEvidence: autoSubagentPresetLocalEvidenceCoreSchema,
});

const autoSubagentPresetPolicySnapshotCoreSchema = z.object({
  quotaFloorPercent: percentSchema,
  switchMarginPercent: percentSchema,
  localUsageWindowMs: nonNegativeNumberSchema,
  localUsageWeightPercent: percentSchema,
  priorityWeightPercent: percentSchema,
  reliabilityWeightPercent: percentSchema,
  latencyWeightPercent: percentSchema,
  switchCooldownMs: nonNegativeNumberSchema,
  circuitBreakerFailureThreshold: nonNegativeIntegerSchema,
  circuitBreakerCooldownMs: nonNegativeNumberSchema,
});

const autoSubagentPresetStatusCoreSchema = z.object({
  evaluatedAt: nonNegativeNumberSchema,
  route: z.enum(['agent', 'swarm', 'tower_worker', 'tower_reviewer']),
  profileName: nonEmptyStringSchema.optional(),
  reasonCode: autoSubagentPresetReasonCodeSchema,
  currentPreset: nonEmptyStringSchema.optional(),
  selectedPreset: nonEmptyStringSchema.optional(),
  activatedPreset: nonEmptyStringSchema.optional(),
  currentScore: finiteNumberSchema.optional(),
  selectedScore: finiteNumberSchema.optional(),
  switchCooldownUntil: nonNegativeNumberSchema.optional(),
  candidates: z.array(autoSubagentPresetCandidateScoreCoreSchema),
  policy: autoSubagentPresetPolicySnapshotCoreSchema,
});

const subagentPresetScoreContributionsSchema = z.object({
  quota_remaining: percentSchema.optional(),
  priority_bonus: nonNegativeNumberSchema,
  reset_bonus: nonNegativeNumberSchema,
  route_fit_bonus: nonNegativeNumberSchema,
  token_penalty: nonNegativeNumberSchema,
  reliability_penalty: nonNegativeNumberSchema,
  latency_penalty: nonNegativeNumberSchema,
});

const subagentPresetLocalEvidenceSchema = z.object({
  scope: z.enum(['profile', 'provider', 'none']),
  sample_count: nonNegativeIntegerSchema,
  failure_count: nonNegativeIntegerSchema,
  adjusted_failure_rate: rateSchema,
  token_count: nonNegativeIntegerSchema,
  average_first_token_latency_ms: nonNegativeNumberSchema.optional(),
  first_token_latency_sample_count: nonNegativeIntegerSchema,
  llm_request_count: nonNegativeIntegerSchema,
});

const subagentPresetCandidateScoreSchema = z.object({
  preset: nonEmptyStringSchema,
  provider: nonEmptyStringSchema.optional(),
  availability: z.enum([
    'healthy',
    'route_unresolved',
    'quota_unknown',
    'quota_below_floor',
    'circuit_open',
  ]),
  selectable: z.boolean(),
  score: finiteNumberSchema.optional(),
  quota_remaining_percent: percentSchema.optional(),
  quota_reset_at: nonNegativeNumberSchema.optional(),
  circuit_breaker_open_until: nonNegativeNumberSchema.optional(),
  contributions: subagentPresetScoreContributionsSchema,
  local_evidence: subagentPresetLocalEvidenceSchema,
});

const subagentPresetPolicySnapshotSchema = z.object({
  quota_floor_percent: percentSchema,
  switch_margin_percent: percentSchema,
  local_usage_window_ms: nonNegativeNumberSchema,
  local_usage_weight_percent: percentSchema,
  priority_weight_percent: percentSchema,
  reliability_weight_percent: percentSchema,
  latency_weight_percent: percentSchema,
  switch_cooldown_ms: nonNegativeNumberSchema,
  circuit_breaker_failure_threshold: nonNegativeIntegerSchema,
  circuit_breaker_cooldown_ms: nonNegativeNumberSchema,
});

export const subagentPresetStatusSchema = z.object({
  evaluated_at: nonNegativeNumberSchema,
  route: z.enum(['agent', 'swarm', 'tower_worker', 'tower_reviewer']),
  profile_name: nonEmptyStringSchema.optional(),
  reason_code: autoSubagentPresetReasonCodeSchema,
  current_preset: nonEmptyStringSchema.optional(),
  selected_preset: nonEmptyStringSchema.optional(),
  activated_preset: nonEmptyStringSchema.optional(),
  current_score: finiteNumberSchema.optional(),
  selected_score: finiteNumberSchema.optional(),
  switch_cooldown_until: nonNegativeNumberSchema.optional(),
  candidates: z.array(subagentPresetCandidateScoreSchema),
  policy: subagentPresetPolicySnapshotSchema,
});
export type SubagentPresetStatus = z.infer<typeof subagentPresetStatusSchema>;

/** No automatic evaluation has run yet when the response data is `null`. */
export const subagentPresetStatusResponseSchema = subagentPresetStatusSchema.nullable();
export type SubagentPresetStatusResponse = z.infer<typeof subagentPresetStatusResponseSchema>;

export function projectSubagentPresetStatus(status: unknown): SubagentPresetStatus | undefined {
  const parsed = autoSubagentPresetStatusCoreSchema.safeParse(status);
  if (!parsed.success) return undefined;
  return projectParsedSubagentPresetStatus(parsed.data);
}

export function projectSubagentPresetEvaluatedPayload(
  payload: unknown,
): { sessionId: string; status: SubagentPresetStatus } | undefined {
  const parsed = autoSubagentPresetStatusCoreSchema
    .extend({ sessionId: nonEmptyStringSchema })
    .safeParse(payload);
  if (!parsed.success) return undefined;
  return {
    sessionId: parsed.data.sessionId,
    status: projectParsedSubagentPresetStatus(parsed.data),
  };
}

function projectParsedSubagentPresetStatus(
  status: z.infer<typeof autoSubagentPresetStatusCoreSchema>,
): SubagentPresetStatus {
  return {
    evaluated_at: status.evaluatedAt,
    route: status.route,
    profile_name: status.profileName,
    reason_code: status.reasonCode,
    current_preset: status.currentPreset,
    selected_preset: status.selectedPreset,
    activated_preset: status.activatedPreset,
    current_score: status.currentScore,
    selected_score: status.selectedScore,
    switch_cooldown_until: status.switchCooldownUntil,
    candidates: status.candidates.map((candidate) => ({
      preset: candidate.preset,
      provider: candidate.provider,
      availability: candidate.availability,
      selectable: candidate.selectable,
      score: candidate.score,
      quota_remaining_percent: candidate.quotaRemainingPercent,
      quota_reset_at: candidate.quotaResetAt,
      circuit_breaker_open_until: candidate.circuitBreakerOpenUntil,
      contributions: {
        quota_remaining: candidate.contributions.quotaRemaining,
        priority_bonus: candidate.contributions.priorityBonus,
        reset_bonus: candidate.contributions.resetBonus,
        route_fit_bonus: candidate.contributions.routeFitBonus,
        token_penalty: candidate.contributions.tokenPenalty,
        reliability_penalty: candidate.contributions.reliabilityPenalty,
        latency_penalty: candidate.contributions.latencyPenalty,
      },
      local_evidence: {
        scope: candidate.localEvidence.scope,
        sample_count: candidate.localEvidence.sampleCount,
        failure_count: candidate.localEvidence.failureCount,
        adjusted_failure_rate: candidate.localEvidence.adjustedFailureRate,
        token_count: candidate.localEvidence.tokenCount,
        average_first_token_latency_ms: candidate.localEvidence.averageFirstTokenLatencyMs,
        first_token_latency_sample_count:
          candidate.localEvidence.firstTokenLatencySampleCount,
        llm_request_count: candidate.localEvidence.llmRequestCount,
      },
    })),
    policy: {
      quota_floor_percent: status.policy.quotaFloorPercent,
      switch_margin_percent: status.policy.switchMarginPercent,
      local_usage_window_ms: status.policy.localUsageWindowMs,
      local_usage_weight_percent: status.policy.localUsageWeightPercent,
      priority_weight_percent: status.policy.priorityWeightPercent,
      reliability_weight_percent: status.policy.reliabilityWeightPercent,
      latency_weight_percent: status.policy.latencyWeightPercent,
      switch_cooldown_ms: status.policy.switchCooldownMs,
      circuit_breaker_failure_threshold: status.policy.circuitBreakerFailureThreshold,
      circuit_breaker_cooldown_ms: status.policy.circuitBreakerCooldownMs,
    },
  };
}

export const patchConfigRequestSchema = z.object({
  providers: z.record(z.string(), z.unknown()).optional(),
  default_provider: z.string().optional(),
  default_model: z.string().optional(),
  models: z.record(z.string(), z.unknown()).optional(),
  thinking: z.unknown().optional(),
  plan_mode: z.boolean().optional(),
  yolo: z.boolean().optional(),
  default_permission_mode: z.string().optional(),
  default_plan_mode: z.boolean().optional(),
  permission: z.unknown().optional(),
  hooks: z.array(z.unknown()).optional(),
  services: z.unknown().optional(),
  merge_all_available_skills: z.boolean().optional(),
  extra_skill_dirs: z.array(z.string()).optional(),
  loop_control: z.unknown().optional(),
  background: z.unknown().optional(),
  subagent: z.unknown().optional(),
  secondary_model: z.unknown().optional(),
  experimental: z.record(z.string(), z.boolean()).optional(),
  telemetry: z.boolean().optional(),
});
export type PatchConfigRequest = z.infer<typeof patchConfigRequestSchema>;
