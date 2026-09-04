import type {
  ExportSessionManifest,
  ResumeSessionResult,
  ShellEnvironment,
  TelemetryClient,
  TelemetryContextPatch,
  TelemetryProperties,
} from '@moonshot-ai/agent-core';
import type { Kaos } from '@moonshot-ai/kaos';
import type { KimiHostIdentity, OAuthRefreshOutcome } from '@moonshot-ai/kimi-code-oauth';
import type { ContentPart } from '@moonshot-ai/kosong';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type Unsubscribe = () => void;

export interface AgentRuntimeBinding {
  readonly workspaceId: string;
  readonly runtimeId: string;
}

export type { CapabilityStatus } from '@moonshot-ai/agent-core-v2/app/capability/types';

export type {
  AgentReplayRecord,
  AgentBackgroundTaskInfo,
  BackgroundConfig,
  BackgroundTaskInfo,
  BackgroundTaskStatus,
  ConfigDiagnostics,
  ContextMessage,
  CronTaskSnapshot,
  ExperimentalFeatureState,
  ExperimentalFlagMap,
  ExperimentalFlagSource,
  ExportSessionManifest,
  GoalBudgetLimits,
  GoalBudgetReport,
  GoalChange,
  GoalChangeStats,
  GetCronTasksResult,
  GoalStatus,
  GlobalMcpServerAuthState,
  GlobalMcpServerAuthStatus,
  KimiConfig,
  KimiConfigPatch,
  LoopControl,
  McpServerInfo,
  McpStartupMetrics,
  ModelAlias,
  MoonshotServiceConfig,
  OAuthRef,
  PluginCommandDef,
  PluginGithubMetadata,
  PluginGithubRef,
  PluginInfo,
  PluginMcpServerInfo,
  PluginSource,
  PluginSummary,
  ProcessBackgroundTaskInfo,
  PromptOrigin,
  ProviderConfig,
  ProviderType,
  QuestionBackgroundTaskInfo,
  ReloadSummary,
  ResumedAgentState,
  ServicesConfig,
  ShellEnvironment,
  SkillSummary,
  ThinkingConfig,
  ToolInfo,
  GlobalMcpServerConfig as McpServerConfig,
  GlobalMcpServerTestResult as McpTestResult,
} from '@moonshot-ai/agent-core';

export type {
  GoalSnapshot,
  GoalToolResult,
  GoalWaitLease,
  GoalWaitPolicy,
} from '@moonshot-ai/agent-core-v2/agent/goal/types';

export type { KimiHostIdentity, OAuthRefreshOutcome };
export type { TelemetryClient, TelemetryContextPatch, TelemetryProperties };
export type { ContentPart, Role, ThinkingEffort, ToolCall } from '@moonshot-ai/kosong';
// Contributed commands are an agent-core-v2 seam; the type is re-exported
// from the v2 engine (v1 sessions report an empty command set).
export type { AgentCommandInfo } from '@moonshot-ai/agent-core-v2/agent/command/agentCommand';

// AITP Research Mode — wire types re-exported through agent-core (which
// re-exports from @moonshot-ai/protocol). The node-sdk does not depend on
// the protocol package directly.
export type {
  ResearchCommand,
  ResearchCommandRequest,
  ResearchCommandResponse,
  ResearchEvidencePacket,
  ResearchRunState,
  ResearchRunStage,
  ResearchSchedulerState,
} from '@moonshot-ai/agent-core';
// The snapshot and local ResearchPlan type are re-exported from agent-core-v2
// (the engine's own types, which use `readonly` arrays) so the v2 client's
// direct engine reads are type-compatible.
export type {
  ResearchPlan,
  ResearchStatusSnapshot,
} from '@moonshot-ai/agent-core-v2';

export type PermissionMode = 'yolo' | 'manual' | 'auto';

/**
 * Trust state of a workspace directory. Only meaningful on the agent-core-v2
 * engine; the v1 engine has no workspace-trust concept and reports
 * `{ trusted: true, gatedMcpServers: [] }`.
 */
export interface WorkspaceTrustMcpServerInfo {
  readonly name: string;
  readonly transport: 'stdio' | 'http' | 'sse';
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly url?: string;
}

export interface WorkspaceTrustInfo {
  readonly trusted: boolean;
  /** Safe descriptions of project-level MCP servers that trusting would enable. */
  readonly gatedMcpServers: readonly WorkspaceTrustMcpServerInfo[];
}

export interface CreateGoalInput {
  readonly objective: string;
  readonly completionCriterion?: string;
  readonly replace?: boolean;
}

export interface ResumeGoalInput {
  /** Ask the v2 Goal driver to launch a continuation after a paused lifecycle resumes. */
  readonly continueIfPaused?: boolean;
  /** Ask the v2 Goal driver to launch a continuation after a blocked lifecycle resumes. */
  readonly continueIfBlocked?: boolean;
}

export type TextPromptPart = Extract<ContentPart, { type: 'text' }>;
export type PromptPart = Extract<ContentPart, { type: 'text' | 'image_url' | 'video_url' }>;

export type PromptInput = readonly PromptPart[];

export interface PromptSkillActivation {
  readonly name: string;
  readonly args?: string;
}

export interface KimiHarnessOptions {
  readonly identity?: KimiHostIdentity | undefined;
  readonly homeDir?: string | undefined;
  readonly configPath?: string | undefined;
  readonly autoLoadConfig?: boolean | undefined;
  readonly uiMode?: string;
  readonly skillDirs?: readonly string[];
  readonly telemetry?: TelemetryClient | undefined;
  readonly onOAuthRefresh?: ((outcome: OAuthRefreshOutcome) => void) | undefined;
  readonly sessionStartedProperties?: TelemetryProperties;
}

export interface CreateSessionOptions {
  readonly id?: string | undefined;
  readonly workDir: string;
  readonly model?: string | undefined;
  readonly thinking?: string | undefined;
  readonly permission?: PermissionMode | undefined;
  readonly planMode?: boolean;
  readonly metadata?: JsonObject | undefined;
  readonly kaos?: Kaos | undefined;
  readonly persistenceKaos?: Kaos | undefined;
  readonly additionalDirs?: readonly string[];
  /**
   * Main-agent profile name (`--agent`): a builtin profile or one defined by
   * an agentfile discovered from the user/project agent directories.
   */
  readonly agentProfile?: string;
  /**
   * Explicit agentfiles (`--agent-file`) loaded for this session with the
   * highest precedence; an invalid file fails session creation.
   */
  readonly agentFiles?: readonly string[];
  readonly sessionStartedProperties?: TelemetryProperties;
  /**
   * Print-mode (`kimi -p`) only: when the main agent ends a turn while
   * background subagents (`kind === 'agent'`) are still running, hold the turn
   * open and idle-wait until they all finish, flushing their completions into
   * the turn so the model can react before the run exits. Ignored by
   * interactive / SDK sessions.
   */
  readonly drainAgentTasksOnStop?: boolean;
}

export interface RenameSessionInput {
  readonly id: string;
  readonly title: string;
}

export interface GenerateSessionTitleInput {
  readonly id: string;
  /** Regenerate even when the session already has a generated/custom title. */
  readonly force?: boolean;
  /** Conversation excerpt to generate from (default `user_prompts`). */
  readonly source?: 'user_prompts' | 'first_turn' | 'digest';
}

export interface ResumeSessionInput {
  readonly id: string;
  readonly kaos?: Kaos | undefined;
  readonly persistenceKaos?: Kaos | undefined;
  readonly additionalDirs?: readonly string[];
  /** Re-select the session's already-bound main profile; a different name fails. */
  readonly agentProfile?: string;
  /** Include persisted subagent states in the returned replay snapshot. */
  readonly includeSubagents?: boolean;
  /**
   * Limit each returned agent replay to the most recent N user turns. Omit to
   * return the full replay. Lets UI callers that only render the tail avoid
   * transferring the entire history over the RPC boundary.
   */
  readonly replayTurnLimit?: number;
  readonly sessionStartedProperties?: TelemetryProperties;
}

export interface ReloadSessionInput extends ResumeSessionInput {
  readonly forcePluginSessionStartReminder?: boolean;
}

export interface AddAdditionalDirInput {
  readonly id: string;
  readonly path: string;
  readonly persist: boolean;
}

export interface AddAdditionalDirOptions {
  /** When true, share the directory through workspace local config. When false,
   * keep it scoped to this session while still restoring it on session resume. */
  readonly persist: boolean;
}

export interface ForkSessionInput {
  readonly id: string;
  readonly forkId?: string;
  readonly title?: string;
  readonly metadata?: JsonObject;
  /**
   * Zero-based index of the user-visible turn to retain through. Omit it to
   * preserve the existing full-session fork behavior.
   */
  readonly turnIndex?: number;
}

export interface ExportSessionInput {
  readonly id: string;
  readonly outputPath?: string | undefined;
  readonly includeGlobalLog?: boolean | undefined;
  /** Host version to record in the export manifest. */
  readonly version: string;
  /** How the CLI was installed (e.g. 'npm-global', 'native'). */
  readonly installSource?: string | undefined;
  readonly shellEnv?: ShellEnvironment | undefined;
}

export interface ExportSessionResult {
  readonly zipPath: string;
  readonly entries: readonly string[];
  readonly sessionDir: string;
  readonly manifest: ExportSessionManifest;
}

export interface ListSessionsOptions {
  readonly workDir?: string;
  readonly sessionId?: string;
  /**
   * Maximum number of summaries in one page. Only consulted by
   * `listSessionsPage`; plain `listSessions` always returns the whole
   * filtered set.
   */
  readonly limit?: number;
  /** Keyset cursor: return the page strictly older than this session id. */
  readonly before?: string;
}

export interface SessionSummaryPage {
  readonly items: readonly SessionSummary[];
  /** Pass as `before` for the next older page; absent when the listing is exhausted. */
  readonly nextCursor?: string;
}

export interface GetConfigOptions {
  readonly reload?: boolean | undefined;
}

export interface AuthenticateMcpServerOptions {
  readonly onAuthorizationUrl: (
    url: string,
  ) => void | boolean | PromiseLike<void | boolean>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface TestMcpServerOptions {
  readonly cwd?: string;
}

export interface CompactOptions {
  readonly instruction?: string | undefined;
}

export interface ReloadSessionOptions {
  readonly forcePluginSessionStartReminder?: boolean;
}

export interface PlanInfo {
  readonly id: string;
  readonly content: string;
  readonly path: string;
}

export type SessionPlan = PlanInfo | null;

export interface TokenUsage {
  readonly inputOther: number;
  readonly output: number;
  readonly inputCacheRead: number;
  readonly inputCacheCreation: number;
}

export interface SessionUsage {
  readonly byModel?: Record<string, TokenUsage> | undefined;
  readonly currentTurn?: TokenUsage | undefined;
  readonly total?: TokenUsage | undefined;
}

export interface SessionStatus {
  readonly model?: string;
  readonly thinkingEffort: string;
  readonly permission: PermissionMode;
  readonly planMode: boolean;
  readonly swarmMode?: boolean | undefined;
  readonly contextTokens: number;
  readonly maxContextTokens: number;
  readonly contextUsage: number;
  readonly usage?: SessionUsage;
}

/**
 * The engine's canonical title state: `replaceable` (a prompt-derived easy
 * title auto generation may overwrite), `generated` (an auto-generated title
 * already landed), `custom` (a user-set title that is never overwritten).
 * Only populated by the v2 engine on live / resumed sessions (read off the
 * metadata document); v1 backends leave it undefined, and the v2 list path
 * does not project it.
 */
export type SessionTitleKind = 'replaceable' | 'generated' | 'custom';

export interface SessionSummary {
  readonly id: string;
  readonly title?: string | undefined;
  readonly titleKind?: SessionTitleKind;
  readonly lastPrompt?: string;
  readonly workDir: string;
  readonly sessionDir: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived?: boolean | undefined;
  readonly metadata?: JsonObject | undefined;
  readonly additionalDirs?: readonly string[];
  /** Terminal outcome of the session's latest main turn, when one ended. */
  readonly lastTurnReason?: 'completed' | 'cancelled' | 'failed';
}

export interface AddAdditionalDirResult {
  readonly additionalDirs: readonly string[];
  readonly projectRoot: string;
  readonly configPath: string;
  readonly persisted: boolean;
}

export type ResumedSessionState = Pick<ResumeSessionResult, 'sessionMetadata' | 'agents' | 'warning'>;

export interface ResumedSessionSummary extends SessionSummary, ResumedSessionState { }

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

/** Latest process-global automatic subagent-preset evaluation (v2 only). */
export interface AutoSubagentPresetStatus {
  readonly evaluatedAt: number;
  readonly route: 'agent' | 'swarm' | 'tower_worker' | 'tower_reviewer';
  readonly profileName?: string;
  readonly reasonCode: AutoSubagentPresetReasonCode;
  /** Preset that was active when this evaluation began. */
  readonly currentPreset?: string;
  readonly selectedPreset?: string;
  /** Preset activated by this evaluation, when it switched routing. */
  readonly activatedPreset?: string;
  readonly currentScore?: number;
  readonly selectedScore?: number;
  readonly switchCooldownUntil?: number;
  readonly candidates: readonly AutoSubagentPresetCandidateScore[];
  readonly policy: AutoSubagentPresetPolicySnapshot;
}

/** One automatic subagent-preset evaluation notification (v2 engine only). */
export interface SubagentPresetEvaluatedEvent extends AutoSubagentPresetStatus {
  readonly sessionId: string;
}

/** Automatic subagent-preset switch notification (v2 engine only). */
export interface SubagentPresetChangedEvent {
  /** The session whose `[subagent].preset` was switched by the automatic selector. */
  readonly sessionId: string;
  /** The preset active before the switch (absent for a first automatic choice). */
  readonly previousPreset?: string;
  /** The newly activated preset. */
  readonly currentPreset: string;
  readonly reasonCode: AutoSubagentPresetReasonCode;
  readonly profileName?: string;
  readonly evaluatedAt: number;
  readonly previousScore?: number;
  readonly currentScore?: number;
}
