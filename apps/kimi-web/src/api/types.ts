// apps/kimi-web/src/api/types.ts
// App-facing camelCase model + KimiWebApi interface.
// No daemon wire details here — Vue components consume only these types.

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  hasMore: boolean;
}

export interface PageRequest {
  beforeId?: string;
  afterId?: string;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export type AppNoticeSeverity = 'info' | 'warning' | 'error';

export interface AppNoticeDetail {
  label: string;
  value: string;
}

export interface AppNotice {
  severity: AppNoticeSeverity;
  title: string;
  message?: string;
  details?: AppNoticeDetail[];
}

export type AppWarning = string | AppNotice;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface AppSessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  contextTokens: number;
  contextLimit: number;
  turnCount: number;
}

export interface AppSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Any agent in the session holds an active turn or background lease.
   *  Awaiting states ride the approval/question channels; turn outcomes ride
   *  turn.ended. */
  busy: boolean;
  /** Whether the main agent has an active turn. Unlike busy, this excludes
   *  background tasks and sub-agent work. */
  mainTurnActive?: boolean;
  /** List-level fallback for the action-required badge. */
  pendingInteraction?: 'none' | 'approval' | 'question';
  /** Outcome of the main agent's most recent turn (when the server reports
   *  one). Presentation rule for the "aborted" tag:
   *  `!busy && (cancelled | failed)`. */
  lastTurnReason?: 'completed' | 'cancelled' | 'failed';
  archived: boolean;
  currentPromptId?: string;
  /** Text of the most recent user prompt, for search/preview. */
  lastPrompt?: string;
  cwd: string;
  model: string;
  usage: AppSessionUsage;
  messageCount: number;
  lastSeq: number;
  /**
   * The workspace this session belongs to. Present once the daemon ships the
   * workspace registry (returns `workspace_id` on Session). Until then it is
   * undefined and the composable maps sessions to workspaces by cwd === root.
   */
  workspaceId?: string;
  /**
   * Set on a child ("side chat") session — the id of the parent it was forked
   * from. Used to keep child sessions out of the main session list.
   */
  parentSessionId?: string;
}

/**
 * Live runtime state from GET /sessions/{id}/status — the source of truth for
 * the current model + context usage (Session.agent_config.model can be "").
 */
export interface AppSessionRuntimeStatus {
  /** Current model alias, or null if the daemon couldn't resolve it. */
  model: string | null;
  thinkingEffort: string;
  permission: string;
  planMode: boolean;
  swarmMode: boolean;
  contextTokens: number;
  maxContextTokens: number;
  contextUsage: number;
}

// ---------------------------------------------------------------------------
// Workspace — a real folder the client organizes sessions by.
// 1 Workspace : N Sessions. A session inherits the workspace's root as its cwd.
// ---------------------------------------------------------------------------

export interface AppWorkspace {
  /** Stable id. In fallback mode (derived from session cwds) this IS the root. */
  id: string;
  /** Absolute path to the project root. */
  root: string;
  /** Display name — defaults to basename(root), may be renamed on the daemon. */
  name: string;
  /** ISO timestamp of when this workspace was last opened. */
  lastOpenedAt?: string;
  /** Number of sessions belonging to this workspace. */
  sessionCount: number;
}

/** One directory entry from the daemon folder browser (fs:browse). */
export interface FsBrowseEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FsBrowseResult {
  path: string;
  parent: string | null;
  entries: FsBrowseEntry[];
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export type AppMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export type AppMessageContent =
  | { type: 'text'; text: string }
  | {
      type: 'toolUse';
      toolCallId: string;
      toolName: string;
      input: unknown;
      outputLines?: string[];
      /** Exactly-concatenated stream of `toolOutput` chunks (verbatim, no
       *  separator). `outputLines` keeps the chunk/line array for UI; this is
       *  the byte-faithful continuous text (see eventReducer). */
      outputText?: string;
    }
  | { type: 'toolResult'; toolCallId: string; output: unknown; isError?: boolean }
  | { type: 'image'; source: ImageSource }
  | { type: 'video'; source: ImageSource }
  | { type: 'file'; fileId: string; name: string; mediaType: string; size: number }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'unknown'; raw: unknown };

export type ImageSource =
  | { kind: 'url'; url: string; id?: string }
  | { kind: 'base64'; mediaType: string; data: string }
  | { kind: 'file'; fileId: string };

export interface AppMessage {
  id: string;
  sessionId: string;
  role: AppMessageRole;
  content: AppMessageContent[];
  createdAt: string;
  promptId?: string;
  parentMessageId?: string;
  /** Client-side measured duration from turn.started to turn.ended (ms). */
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Metadata key of the client-side compaction marker message appended on
 * compactionCompleted. The transcript keeps all prior messages (TUI parity);
 * this marker renders as a "context compacted" divider. Snapshot-loaded
 * summary messages (origin kind 'compaction_summary') render the same way
 * but carry no token stats.
 */
export const COMPACTION_MARKER_METADATA_KEY = 'kimiWeb.compaction';

export interface CompactionMarkerMetadata {
  trigger: 'manual' | 'auto';
  tokensBefore?: number;
  tokensAfter?: number;
}

/**
 * Metadata key of the client-side marker appended on `subagent.preset_changed`.
 * The transcript keeps all prior messages; the marker renders as a lightweight
 * "preset switched automatically" status separator (role 'subagentPreset').
 * It records the previous/current preset VALUES only — the display language is
 * resolved at render time via i18n, never baked into the marker — and is keyed
 * `sessionId + wire seq` so an event replay after reconnect can't duplicate it.
 */
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

export interface AutoSubagentPresetScoreContributions {
  quotaRemaining?: number;
  priorityBonus: number;
  resetBonus: number;
  routeFitBonus: number;
  tokenPenalty: number;
  reliabilityPenalty: number;
  latencyPenalty: number;
}

export interface AutoSubagentPresetLocalEvidence {
  scope: 'profile' | 'provider' | 'none';
  sampleCount: number;
  failureCount: number;
  adjustedFailureRate: number;
  tokenCount: number;
  averageFirstTokenLatencyMs?: number;
  firstTokenLatencySampleCount: number;
  llmRequestCount: number;
}

export interface AutoSubagentPresetCandidateScore {
  preset: string;
  provider?: string;
  availability: AutoSubagentPresetCandidateAvailability;
  selectable: boolean;
  score?: number;
  quotaRemainingPercent?: number;
  quotaResetAt?: number;
  circuitBreakerOpenUntil?: number;
  contributions: AutoSubagentPresetScoreContributions;
  localEvidence: AutoSubagentPresetLocalEvidence;
}

export interface AutoSubagentPresetPolicySnapshot {
  quotaFloorPercent: number;
  switchMarginPercent: number;
  localUsageWindowMs: number;
  localUsageWeightPercent: number;
  priorityWeightPercent: number;
  reliabilityWeightPercent: number;
  latencyWeightPercent: number;
  switchCooldownMs: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerCooldownMs: number;
}

/** Latest process-global automatic subagent-preset evaluation (v2 only). */
export interface AutoSubagentPresetStatus {
  evaluatedAt: number;
  route: 'agent' | 'swarm' | 'tower_worker' | 'tower_reviewer';
  profileName?: string;
  reasonCode: AutoSubagentPresetReasonCode;
  /** Preset that was active when this evaluation began. */
  currentPreset?: string;
  selectedPreset?: string;
  /** Preset activated by this evaluation, when it switched routing. */
  activatedPreset?: string;
  currentScore?: number;
  selectedScore?: number;
  switchCooldownUntil?: number;
  candidates: AutoSubagentPresetCandidateScore[];
  policy: AutoSubagentPresetPolicySnapshot;
}

export const SUBAGENT_PRESET_MARKER_METADATA_KEY = 'kimiWeb.subagentPreset';

export interface SubagentPresetMarkerMetadata {
  /** Preset active before the switch; absent when the server reports none. */
  from?: string;
  /** Preset the session switched to. */
  to: string;
  /** Structured explanation fields remain localizable at render time. */
  reasonCode?: AutoSubagentPresetReasonCode;
  profileName?: string;
  evaluatedAt?: number;
  previousScore?: number;
  currentScore?: number;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Runtime thinking level. 'off' disables extended thinking; 'on' is the
 * enable signal for legacy boolean models (those without `support_efforts`);
 * any other string is a model-declared effort level (e.g. 'low'/'high'/'max').
 *
 * `support_efforts` is the single source of truth for which concrete levels a
 * model accepts; providers silently drop unknown efforts rather than erroring.
 * Collapses to `string` at runtime — this is a semantic marker, not a closed
 * enum. Mirrors kosong's `ThinkingEffort`.
 */
export type ThinkingLevel = 'off' | 'on' | (string & {});

export interface PromptSubmission {
  content: AppMessageContent[];
  metadata?: Record<string, unknown>;
  /** Optional non-main agent id, used by BTW side-channel prompts. */
  agentId?: string;
  /** The daemon requires these on every prompt (per-prompt, not session-level). */
  model?: string;
  /** Omit to leave the session profile's thinking untouched — the daemon then
   *  resolves the config/model default (same as an unset [thinking] in the TUI). */
  thinking?: ThinkingLevel;
  permissionMode?: 'manual' | 'auto' | 'yolo';
  planMode?: boolean;
  swarmMode?: boolean;
  goalObjective?: string;
  goalControl?: 'pause' | 'resume' | 'cancel';
}

export interface PromptSubmitResult {
  promptId: string;
  userMessageId: string;
  /** 'running' when the prompt started a turn immediately; 'queued' when
      another prompt is active and the daemon parked it (steerable). */
  status?: 'running' | 'queued';
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export type ApprovalDecision = 'approved' | 'rejected' | 'cancelled';

export interface ApprovalResponse {
  decision: ApprovalDecision;
  scope?: 'session';
  feedback?: string;
  selectedLabel?: string;
}

export interface AppApprovalRequest {
  approvalId: string;
  sessionId: string;
  turnId?: number;
  toolCallId: string;
  toolName: string;
  action: string;
  display: unknown; // ToolInputDisplay — Web renders what it knows, falls back to generic
  expiresAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface QuestionItem {
  id: string;
  question: string;
  header?: string;
  body?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
  allowOther?: boolean;
  otherLabel?: string;
  otherDescription?: string;
}

export interface AppQuestionRequest {
  questionId: string;
  sessionId: string;
  turnId?: number;
  toolCallId?: string;
  questions: QuestionItem[];
  createdAt: string;
}

export type QuestionAnswer =
  | { kind: 'single'; optionId: string }
  | { kind: 'multi'; optionIds: string[] }
  | { kind: 'other'; text: string }
  | { kind: 'multiWithOther'; optionIds: string[]; otherText: string }
  | { kind: 'skipped' };

export interface QuestionResponse {
  answers: Record<string, QuestionAnswer>;
  method?: 'enter' | 'space' | 'number_key' | 'click';
  note?: string;
}

// ---------------------------------------------------------------------------
// Background Task
// ---------------------------------------------------------------------------

export type AppTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type AppSubagentPhase = 'queued' | 'working' | 'suspended' | 'completed' | 'failed';

export interface AppTask {
  id: string;
  sessionId: string;
  kind: 'subagent' | 'bash' | 'tool';
  description: string;
  status: AppTaskStatus;
  command?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  outputPreview?: string;
  outputBytes?: number;
  outputLines?: string[]; // accumulated by eventReducer from task.progress chunks
  /** The subagent's concatenated live output (assistant.delta), accumulated by
   *  the event reducer from `taskProgress` chunks of kind `text`. Grows in the
   *  right-side detail panel like a thinking block. */
  text?: string;
  agentId?: string;
  model?: string;
  thinkingEffort?: string;
  subagentPhase?: AppSubagentPhase;
  subagentType?: string;
  parentToolCallId?: string;
  suspendedReason?: string;
  swarmIndex?: number;
  /** True only for subagents detached into the background task store. Drives
   *  the dock: the dock lists background subagents, while foreground subagents
   *  render inline in the message flow as the `Agent` tool card. */
  runInBackground?: boolean;
  /** The id this same subagent has in the server's background-task store
   *  (REST `/tasks`), learned from the `task.started` registration event. The
   *  WS event stream keys the agent by agent id while REST keys it by task id;
   *  this links the two so the REST copy can be folded into this row and so
   *  cancel can target the id REST actually knows. */
  backgroundTaskId?: string;
}

// ---------------------------------------------------------------------------
// Goal
// ---------------------------------------------------------------------------

export type AppGoalStatus = 'active' | 'paused' | 'blocked' | 'complete';

export interface AppGoalWaitLease {
  taskIds: string[];
  policy: 'any' | 'all';
}

export interface AppGoalContinuation {
  state: 'idle' | 'deciding' | 'enqueued' | 'running' | 'held' | 'waiting';
  owner?: string;
  reason?: string;
}

export interface AppGoal {
  goalId: string;
  objective: string;
  completionCriterion?: string;
  status: AppGoalStatus;
  turnsUsed: number;
  tokensUsed: number;
  wallClockMs: number;
  waitingFor?: AppGoalWaitLease;
  continuation?: AppGoalContinuation;
  terminalReason?: string;
  budget: {
    tokenBudget: number | null;
    remainingTokens: number | null;
    turnBudget: number | null;
    remainingTurns: number | null;
    wallClockBudgetMs: number | null;
    remainingWallClockMs: number | null;
    overBudget: boolean;
  };
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

export type ResearchModePhase = 'inactive' | 'probing' | 'ready' | 'degraded';
export type ResearchLoopStatus = 'active' | 'paused';
export type ResearchPlanningPolicy = 'collaborative' | 'dreaming';
export type ResearchQuestionWorkflow =
  | 'open'
  | 'active'
  | 'deferred'
  | 'blocked'
  | 'closed'
  | 'cancelled';
export type ResearchQuestionEpistemic =
  | 'unknown'
  | 'candidate'
  | 'supported'
  | 'contradicted'
  | 'inconclusive';
export type ResearchQuestionPersistence =
  | 'working'
  | 'pending_commit'
  | 'committed'
  | 'degraded';
export type ResearchLineStatus = 'active' | 'paused' | 'completed' | 'blocked';
export type ResearchAlertKind =
  | 'contradiction'
  | 'blocked'
  | 'reopened'
  | 'commit_failed'
  | 'degraded'
  | 'stale';
export type ResearchNextStepSource =
  | 'research_action'
  | 'research_run'
  | 'human_gate'
  | 'aitp_maintenance'
  | 'question';
export type ResearchNextStepFreshness = 'current' | 'stale' | 'blocked';
export type ResearchAlertClassification =
  | 'active_blocker'
  | 'historical_unresolved'
  | 'superseded_by_retry'
  | 'warning';
export type ResearchAlertSource =
  | 'question'
  | 'aitp_failure'
  | 'aitp_check'
  | 'adapter'
  | 'checkpoint';
export type ResearchAlertState = 'active' | 'acknowledged' | 'cleared' | 'superseded';
export type AitpMaintenanceStatus = 'ready' | 'degraded';
export type AitpMaintenanceMemoryStatus = 'available' | 'partial' | 'not_established' | 'unknown';
export type AitpMaintenanceDegradedReason =
  | 'adapter_not_ready'
  | 'adapter_degraded'
  | 'enter_failed'
  | 'check_unavailable'
  | 'stale_generation'
  | 'workstream_unbound';
export type ResearchPhase =
  | 'idle'
  | 'orienting'
  | 'gap_analysis'
  | 'action_planned'
  | 'action_executing'
  | 'evaluating'
  | 'state_updated'
  | 'checkpoint_pending'
  | 'awaiting_human';
export type ResearchActionKind =
  | 'experiment'
  | 'derivation'
  | 'literature_review'
  | 'data_analysis'
  | 'simulation'
  | 'other';
export type ResearchActionStatus = 'planned' | 'in_progress' | 'completed' | 'abandoned';
export type ResearchRunStage =
  | 'queued'
  | 'running'
  | 'scf'
  | 'band'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'unknown';
export type ResearchSchedulerState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'unknown';
export type ResearchHumanGateKind = 'approval' | 'review' | 'decision';

export interface ResearchLine {
  slug: string;
  title: string;
  objective?: string;
  assessment?: string;
  status: ResearchLineStatus;
  createdAt: number;
  revision: number;
}

export interface ResearchLineWorkstreamBinding {
  confirmationId: string;
  lineSlug: string;
  workstream: string;
  topicId: string;
  observedRevision: number;
  confirmedBy: 'user' | 'main_agent';
  confirmedAt: number;
}

export type ResearchLineWorkstreamBindingStatus =
  | 'unbound'
  | 'unavailable'
  | 'bound'
  | 'stale'
  | 'conflict';

export interface ResearchLineWorkstreamAlignment {
  lineSlug: string;
  status: ResearchLineWorkstreamBindingStatus;
  reason: string;
  binding?: ResearchLineWorkstreamBinding;
}

export interface ResearchQuestion {
  id: string;
  lineSlug: string;
  wording: string;
  assessment?: string;
  priority: number;
  neededEvidence: string[];
  evidenceRefs: string[];
  falsifierRefs: string[];
  nextBoundedAction?: string;
  workflow: ResearchQuestionWorkflow;
  epistemic: ResearchQuestionEpistemic;
  persistence: ResearchQuestionPersistence;
  revision: number;
}

export interface ResearchFocus {
  questionId: string;
  boundedAction?: string;
  revision: number;
}

export interface ResearchEffectiveNextStep {
  text: string;
  source: ResearchNextStepSource;
  freshness: ResearchNextStepFreshness;
  observedAt: number;
  derivedFrom: {
    actionId?: string;
    entryId?: string;
    questionId?: string;
    lineSlug?: string;
  };
}

export interface ResearchAlert {
  fingerprint: string;
  kind: ResearchAlertKind;
  classification?: ResearchAlertClassification;
  source?: ResearchAlertSource;
  state?: ResearchAlertState;
  message: string;
  questionId?: string;
  lineSlug?: string;
  relatedEntryId?: string;
  workstream?: string;
  retryOfEntryId?: string;
  reason?: string;
  createdAt: number;
  acknowledgedAt?: number;
}

export interface ResearchAdapterHealth {
  phase: ResearchModePhase;
  contractVersion?: string;
  pluginVersion?: string;
  pythonVersion?: string;
  lastCheckAt?: number;
  lastError?: string;
  notInitialized?: boolean;
}

export interface AitpMaintenanceFailureSummary {
  entryId: string;
  kind: 'observation' | 'result' | 'failure' | 'decision' | 'source' | 'code_change' | 'run' | 'closeout';
  summary: string;
  source: string;
  authority: 'human' | 'agent' | 'source' | 'tool';
  createdAt?: number;
  workstream?: string;
}

export interface AitpMaintenanceNextAction {
  text: string;
  entryId: string;
  authority: 'human' | 'agent' | 'source' | 'tool';
  createdAt?: number;
  source: string;
}

export interface ResearchProgramTopic {
  id: string;
  title: string;
  goalText: string;
  goalSource: string;
}

export type ResearchGoalAlignmentRelation =
  | 'same_program_goal'
  | 'goal_parent_of_program'
  | 'goal_milestone_in_program'
  | 'unrelated';
export type ResearchGoalAlignmentStatus =
  | 'unavailable'
  | 'confirmation_required'
  | 'aligned'
  | 'stale'
  | 'conflict';
export interface ResearchGoalProgramBinding {
  relation: ResearchGoalAlignmentRelation;
  goalId: string;
  topicId: string;
  observedRevision: number;
  confirmedAt: number;
}
export interface ResearchGoalAlignment {
  status: ResearchGoalAlignmentStatus;
  reason: string;
  binding?: ResearchGoalProgramBinding;
}

export interface AitpMaintenanceReceipt {
  status: AitpMaintenanceStatus;
  refreshedAt: number;
  memoryStatus: AitpMaintenanceMemoryStatus;
  workstream?: string;
  topic?: ResearchProgramTopic;
  latestWorkingNoteAt?: number;
  activeNewerThanWorkingNote: boolean | null;
  unresolvedFailureCount: number;
  unresolvedFailures: AitpMaintenanceFailureSummary[];
  nextAction?: string;
  nextActionDetails?: AitpMaintenanceNextAction;
  warningSummaries: Array<{ level: 'warning'; code: string }>;
  check: {
    status: 'clean' | 'findings' | 'unavailable';
    counts?: { entries: number; notes: number; errors: number; warnings: number };
    findingCodes: string[];
  };
  degradedReason?: AitpMaintenanceDegradedReason;
}

export interface ResearchCheckpointCheckReceipt {
  status: 'clean' | 'findings';
  errors: number;
  warnings: number;
  findingFingerprints: string[];
  errorFindingFingerprints: string[];
  newErrorFindingFingerprints?: string[];
  preExistingErrorFindingFingerprints?: string[];
  checkedAt: number;
}

export type ResearchCheckpointPrepareReceipt =
  | {
      status: 'prepared';
      id: string;
      path: string;
      idempotencyKey?: string;
      workstreams?: string[];
    }
  | {
      status: 'existing';
      id?: string;
      path: string;
      idempotencyKey: string;
      workstreams?: string[];
    };

export interface ResearchCheckpointSaveReceipt {
  status: 'saved' | 'already_saved';
  draftPath: string;
  path: string;
  source?: 'record_save' | 'prepare_existing';
}

export interface ResearchCheckpointReceipt {
  prepare?: ResearchCheckpointPrepareReceipt;
  save?: ResearchCheckpointSaveReceipt;
  preSaveCheck?: ResearchCheckpointCheckReceipt;
  postSaveCheck?: ResearchCheckpointCheckReceipt;
}

export interface ResearchDurableCommitCandidate {
  sourceActionId: string;
  progressRecordedAt: number;
  entryKind: 'observation' | 'result' | 'failure' | 'decision' | 'source' | 'code_change' | 'run' | 'closeout';
  authority: 'human' | 'agent' | 'source' | 'tool';
  provenance: 'agent_verification' | 'tool_verification' | 'source_assessment' | 'human_assertion' | 'human_decision';
  rationale: string;
}

export interface ResearchCommittedCursor {
  checkpointId: string;
  entryId?: string;
  receipt?: ResearchCheckpointReceipt;
  committedAt: number;
}

export interface ResearchCheckpoint {
  checkpointId: string;
  committedEntryId?: string;
  questionId?: string;
  questionRevision?: number;
  lineSlug?: string;
  workstreamBinding?: ResearchLineWorkstreamBinding;
  commitCandidate?: ResearchDurableCommitCandidate;
  assessment?: string;
  nextAction?: string;
  idempotencyKey: string;
  persistence: ResearchQuestionPersistence;
  receipt?: ResearchCheckpointReceipt;
  createdAt: number;
}

export interface ResearchRunState {
  actionId: string;
  campaign: string;
  jobId: string;
  sourcePin?: string;
  binaryPin?: string;
  stage: ResearchRunStage;
  schedulerState: ResearchSchedulerState;
  lastObservedAt: number;
  nextCheckAt?: number;
  terminalState?: 'completed' | 'failed' | 'cancelled';
  artifactRefs: string[];
}

export interface ResearchEvidencePacket {
  packet_id: string;
  kind: 'observation' | 'result' | 'failure' | 'derivation' | 'literature';
  claim: string;
  evidence: string;
  question_id?: string;
  line_slug?: string;
  action_id?: string;
  method?: string;
  assumptions: string[];
  tests: string[];
  artifact_refs: string[];
  source_refs: string[];
  limitations: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface ResearchActionSpec {
  actionId: string;
  questionId?: string;
  questionRevision?: number;
  lineSlug?: string;
  lineRevision?: number;
  kind: ResearchActionKind;
  purpose: string;
  expectedEvidence: string[];
  stopCondition: string;
  allowedToolKinds: string[];
  retryOfEntryId?: string;
  status: ResearchActionStatus;
  createdAt: number;
  completedAt?: number;
  requiresHumanApproval: boolean;
  researchPlanBinding?: { planId: string; planRevision: number; milestoneId: string };
  actionPlanBinding?: {
    schema: 'hakimi/action-plan-binding-0.1';
    kind: 'minimal' | 'reviewed_plan';
    planId: string;
    planRevision: number;
  };
  run?: ResearchRunState;
}

export interface ResearchProgressDetail {
  assumptions?: string[];
  derivation?: string;
  tests?: string[];
  observations?: string[];
  sources?: string[];
  limitations?: string[];
  detailHint?: string;
  artifactRefs?: string[];
}

export interface ResearchProgressReport {
  headline: string;
  question?: string;
  motivation: string;
  workPerformed: string;
  result: string;
  mainlineImpact: string;
  uncertainties: string[];
  nextAction?: string;
  phaseChange?: { from: ResearchPhase; to: ResearchPhase };
  humanDecision?: string;
  detail?: ResearchProgressDetail;
  recordedAt: number;
}

export interface ResearchStateChange {
  beforePhase: ResearchPhase;
  afterPhase: ResearchPhase;
  actionId?: string;
  summary: string;
  changedAt: number;
}

export interface ResearchHumanGate {
  gateId: string;
  kind: ResearchHumanGateKind;
  actionId?: string;
  questionId?: string;
  prompt: string;
  resolvedAt?: number;
  resolution?: string;
  createdAt: number;
}

export interface ResearchGoalSummary {
  /** The current Goal milestone, distinct from the ResearchPlan objective. */
  goalId?: string;
  objective: string;
  completionCriterion?: string;
  status: 'active' | 'paused' | 'blocked' | 'complete';
  turnBudget?: number;
  remainingTurns?: number;
  terminalReason?: string;
  waitingFor?: {
    taskIds: string[];
    policy: 'any' | 'all';
  };
  continuation?: AppGoalContinuation;
}

export interface ResearchGoalProjection {
  schema: 'hakimi/research-goal-0.1';
  goalId: string;
  objective: string;
  completionCriterion?: string;
  scope: {
    programTopicId?: string;
    lineSlug?: string;
    questionId?: string;
  };
  nonGoals: string[];
  budget: {
    tokenBudget: number | null;
    turnBudget: number | null;
    wallClockBudgetMs: number | null;
    remainingTokens: number | null;
    remainingTurns: number | null;
    remainingWallClockMs: number | null;
    tokenBudgetReached: boolean;
    turnBudgetReached: boolean;
    wallClockBudgetReached: boolean;
    overBudget: boolean;
  };
  stopConditions: Array<{ code: string; reached: boolean; reason: string }>;
  status: 'active' | 'paused' | 'blocked' | 'complete';
  terminalReason?: string;
  waitingFor?: {
    taskIds: string[];
    policy: 'any' | 'all';
  };
  continuation?: AppGoalContinuation;
  programRelation: ResearchGoalAlignment;
  humanGates: ResearchHumanGate[];
  persistenceGuards: Array<{
    code: string;
    status: 'clear' | 'blocked' | 'inactive';
    reason: string;
  }>;
  researchRevision: number;
}

export interface ResearchProgram {
  topicId: string;
  title: string;
  goalText: string;
  goalSource: string;
  establishedAt: number;
  observedRevision: number;
}

export interface ResearchPeriod {
  id: string;
  lineSlug: string;
  startedAt: number;
  endedAt?: number;
  loopCount: number;
  currentQuestionId?: string;
  summary?: string;
}

export interface ResearchStatusProjection {
  currentLineSlug?: string;
  currentQuestionId?: string;
  currentActionId?: string;
  phase: ResearchPhase;
  nextStep?: string;
  health: 'ok' | 'attention' | 'degraded' | 'blocked';
  attention: string[];
}

export interface ResearchPlanResolution {
  planId: string;
  planRevision: number;
  outcome: 'approved';
  selectedLabel?: string;
}

export interface ResearchPlan {
  planId: string;
  researchRevision: number;
  programId?: string;
  periodId?: string;
  lineSlug?: string;
  questionId?: string;
  lineRevision?: number;
  questionRevision?: number;
  objective: string;
  steps: string[];
  expectedEvidence: string[];
  stopCondition: string;
  status: 'draft' | 'finalized' | 'discarded';
  resolution?: ResearchPlanResolution;
}

export interface ResearchPlanV2 {
  schema: 'hakimi/research-plan-0.2';
  planId: string;
  revision: number;
  goalId: string;
  programId: string;
  programObservedRevision: number;
  goalRelation: 'same_program_goal' | 'goal_parent_of_program' | 'goal_milestone_in_program';
  objective: string;
  completionCriterion?: string;
  milestones: Array<{
    milestoneId: string;
    title: string;
    objective: string;
    completionCriterion: string;
    evidenceRequirements: string[];
  }>;
  evidenceRequirements: string[];
  decisionPoints: Array<{
    decisionId: string;
    milestoneId: string;
    prompt: string;
    condition: string;
  }>;
  assumptions: string[];
  currentMilestoneId: string;
  stopConditions: string[];
  replanConditions: string[];
  status: 'draft' | 'active' | 'completed' | 'discarded';
  createdAt: number;
  updatedAt: number;
}

export interface ResearchStatusSnapshot {
  mode: ResearchModePhase;
  loopStatus: ResearchLoopStatus;
  currentLineSlug?: string;
  currentWorkstreamBinding?: ResearchLineWorkstreamAlignment;
  lineWorkstreamBindings: ResearchLineWorkstreamBinding[];
  currentFocus?: ResearchFocus;
  currentQuestion?: ResearchQuestion;
  questions: ResearchQuestion[];
  lines: ResearchLine[];
  openQuestionCount: number;
  activeQuestionCount: number;
  blockedQuestionCount: number;
  alerts: ResearchAlert[];
  effectiveNextStep?: ResearchEffectiveNextStep;
  goalSummary?: ResearchGoalSummary;
  researchGoal?: ResearchGoalProjection;
  goalAlignment?: ResearchGoalAlignment;
  aitpHealth: ResearchAdapterHealth;
  aitpMaintenance?: AitpMaintenanceReceipt;
  pendingCheckpoint?: ResearchCheckpoint;
  latestCommittedCheckpoint?: ResearchCommittedCursor;
  committedCheckpointHistory?: ResearchCommittedCursor[];
  distillationAttention?: ResearchDistillationAttention;
  phase: ResearchPhase;
  currentAction?: ResearchActionSpec;
  currentRun?: ResearchRunState;
  latestProgress?: ResearchProgressReport;
  recentStateChange?: ResearchStateChange;
  humanGate?: ResearchHumanGate;
  program?: ResearchProgram;
  period?: ResearchPeriod;
  researchPlan?: ResearchPlan;
  actionPlan?: ResearchPlan;
  researchPlanV2?: ResearchPlanV2;
  planningPolicy: ResearchPlanningPolicy;
  status?: ResearchStatusProjection;
  revision: number;
}

export type ResearchDistillationAttention =
  | {
      schema: 'hakimi/research-distillation-attention-0.1';
      status: 'review_requested';
      checkpointId: string;
      entryId: string;
      recordedAt: number;
    }
  | {
      schema: 'hakimi/research-distillation-attention-0.1';
      status: 'handoff_unavailable';
      checkpointId: string;
      entryId: string;
      reason: string;
      recordedAt: number;
    };

export type ResearchCommand =
  | { kind: 'enter_mode'; actor: 'user' | 'model'; lineSlug?: string }
  | { kind: 'exit_mode' }
  | { kind: 'pause_loop'; expectedRevision: number; reason?: string }
  | { kind: 'resume_loop'; expectedRevision: number; reason?: string }
  | {
      kind: 'create_question';
      lineSlug: string;
      wording: string;
      assessment?: string;
      priority?: number;
      neededEvidence?: string[];
    }
  | {
      kind: 'update_question';
      questionId: string;
      expectedRevision: number;
      wording?: string;
      assessment?: string;
      priority?: number;
      workflow?: ResearchQuestionWorkflow;
      epistemic?: ResearchQuestionEpistemic;
      neededEvidence?: string[];
      nextBoundedAction?: string;
      reason?: string;
    }
  | {
      kind: 'set_focus';
      questionId: string;
      expectedRevision: number;
      boundedAction?: string;
      reason?: string;
    }
  | { kind: 'switch_line'; lineSlug: string; expectedRevision: number; reason?: string }
  | { kind: 'reopen_question'; questionId: string; expectedRevision: number; reason?: string }
  | { kind: 'defer_question'; questionId: string; expectedRevision: number; reason?: string }
  | { kind: 'block_question'; questionId: string; expectedRevision: number; reason?: string }
  | { kind: 'close_question'; questionId: string; expectedRevision: number; reason?: string }
  | {
      kind: 'create_line';
      slug: string;
      title: string;
      objective?: string;
      assessment?: string;
    }
  | {
      kind: 'update_line';
      lineSlug: string;
      expectedRevision: number;
      title?: string;
      objective?: string;
      status?: ResearchLineStatus;
      assessment?: string;
      reason?: string;
    }
  | {
      kind: 'propose_checkpoint';
      expectedRevision: number;
      questionId?: string;
      lineSlug?: string;
      assessment?: string;
      nextAction?: string;
    }
  | {
      kind: 'discard_historical_checkpoint';
      checkpointId: string;
      expectedRevision: number;
    }
  | { kind: 'commit_checkpoint'; checkpointId: string; entryId: string }
  | { kind: 'confirm_goal_alignment'; relation: ResearchGoalAlignmentRelation; expectedRevision: number; goalId: string; topicId: string; observedRevision: number }
  | { kind: 'clear_goal_alignment'; expectedRevision: number; goalId: string; topicId: string; observedRevision: number }
  | { kind: 'resolve_decision'; gateId: string; resolution: string; nextPhase: ResearchPhase }
  | { kind: 'review_evidence'; packet: ResearchEvidencePacket; expectedRevision: number }
  | {
      kind: 'observe_run';
      actionId: string;
      expectedRevision: number;
      campaign: string;
      jobId: string;
      sourcePin?: string;
      binaryPin?: string;
      stage: ResearchRunStage;
      schedulerState: ResearchSchedulerState;
      nextCheckAt?: number;
      terminalState?: 'completed' | 'failed' | 'cancelled';
      artifactRefs: string[];
    }
  | { kind: 'acknowledge_alert'; fingerprint: string }
  | {
      kind: 'confirm_line_workstream_binding';
      lineSlug: string;
      workstream: string;
      expectedRevision: number;
    }
  | {
      kind: 'clear_line_workstream_binding';
      lineSlug: string;
      expectedConfirmationId: string;
      expectedRevision: number;
    }
  | { kind: 'set_planning_policy'; policy: ResearchPlanningPolicy; expectedRevision: number }
  | {
      kind: 'prepare_plan_v2';
      planId?: string;
      expectedRevision?: number;
      objective: string;
      completionCriterion?: string;
      milestones: ResearchPlanV2['milestones'];
      evidenceRequirements: string[];
      decisionPoints: ResearchPlanV2['decisionPoints'];
      assumptions: string[];
      currentMilestoneId: string;
      stopConditions: string[];
      replanConditions: string[];
    }
  | { kind: 'activate_plan_v2' | 'complete_plan_v2' | 'discard_plan_v2'; planId: string; expectedRevision: number };

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

export type AppTerminalStatus = 'running' | 'exited';

export interface AppTerminal {
  id: string;
  sessionId: string;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  status: AppTerminalStatus;
  createdAt: string;
  exitedAt?: string;
  exitCode?: number | null;
}

// ---------------------------------------------------------------------------
// File System
// ---------------------------------------------------------------------------

export type FsKind = 'file' | 'directory' | 'symlink';

export interface FsEntry {
  path: string;
  name: string;
  kind: FsKind;
  size?: number;
  modifiedAt: string;
  etag?: string;
  mime?: string;
  languageId?: string;
  isBinary?: boolean;
  isSymlinkTo?: string;
  gitStatus?: string;
  childCount?: number;
}

// ---------------------------------------------------------------------------
// Events (app-facing, camelCase)
// ---------------------------------------------------------------------------

/** Reducer-owned heuristic progress for one MAIN-agent turn. Step numbers and
 *  tool id arrays are unique event identities, not display history; subagent/
 *  side-channel events never enter this state. Terminal entries stay inactive
 *  long enough to reject late events from the same or an older turn. */
export interface AppTurnProgress {
  turnId: number;
  active: boolean;
  startedAt: number;
  stepCount: number;
  /** One-based step numbers already observed, used to make durable replay idempotent. */
  stepNumbers: number[];
  toolCallIds: string[];
  completedToolCallIds: string[];
}

export type AppTurnProgressUpdate =
  | {
      kind: 'start';
      turnId: number;
      startedAt: number;
      stepCount?: number;
      stepNumbers?: number[];
      toolCallIds?: string[];
      completedToolCallIds?: string[];
      /** Snapshot seeding replaces an equal-id live entry at its watermark. */
      replace?: boolean;
    }
  | { kind: 'step'; turnId: number; step: number }
  | { kind: 'toolCall'; turnId: number; toolCallId: string }
  | { kind: 'toolResult'; turnId: number; toolCallId: string }
  | { kind: 'end'; turnId: number }
  | { kind: 'reset' };

export type AppEvent =
  | { type: 'sessionCreated'; session: AppSession }
  | { type: 'workspaceCreated'; workspace: AppWorkspace }
  | { type: 'workspaceUpdated'; workspace: AppWorkspace }
  | { type: 'workspaceDeleted'; workspaceId: string; root: string }
  | { type: 'sessionUpdated'; session: AppSession; changedFields: string[] }
  | { type: 'sessionDeleted'; sessionId: string }
  | {
      type: 'sessionWorkChanged';
      sessionId: string;
      busy: boolean;
      mainTurnActive?: boolean;
      pendingInteraction?: 'none' | 'approval' | 'question';
      lastTurnReason?: 'completed' | 'cancelled' | 'failed';
    }
  | { type: 'sessionMetaUpdated'; sessionId: string; title?: string; lastPrompt?: string }
  | { type: 'sessionUsageUpdated'; sessionId: string; usage: AppSessionUsage; model?: string; swarmMode?: boolean; planMode?: boolean; thinking?: string }
  | { type: 'historyCompacted'; sessionId: string; beforeSeq: number; reason: string; summaryMessageId?: string }
  | { type: 'compactionStarted'; sessionId: string; trigger: 'manual' | 'auto'; instruction?: string }
  | { type: 'compactionCompleted'; sessionId: string; tokensBefore?: number; tokensAfter?: number; summary?: string }
  | { type: 'compactionCancelled'; sessionId: string }
  | { type: 'messageCreated'; message: AppMessage }
  | { type: 'messageUpdated'; sessionId: string; messageId: string; content: AppMessageContent[]; status: 'pending' | 'completed' | 'error'; durationMs?: number }
  | { type: 'assistantDelta'; sessionId: string; messageId: string; contentIndex: number; delta: { text?: string; thinking?: string } }
  // Side-channel / non-main-agent streaming: carries text/thinking deltas for a
  // specific agent (e.g. a BTW side chat) without folding them into the parent
  // transcript. The web layer routes these to the side-chat panel.
  | { type: 'agentDelta'; sessionId: string; agentId: string; delta: { text?: string; thinking?: string } }
  | { type: 'agentTurnEnded'; sessionId: string; agentId: string; reason?: string }
  | { type: 'toolOutput'; sessionId: string; toolCallId: string; outputChunk: string; stream: 'stdout' | 'stderr' }
  | { type: 'approvalRequested'; sessionId: string; approval: AppApprovalRequest }
  | { type: 'approvalResolved'; sessionId: string; approvalId: string; decision: ApprovalDecision; resolvedAt: string }
  | { type: 'approvalExpired'; sessionId: string; approvalId: string }
  | { type: 'questionRequested'; sessionId: string; question: AppQuestionRequest }
  | { type: 'questionAnswered'; sessionId: string; questionId: string; resolvedAt: string }
  | { type: 'questionDismissed'; sessionId: string; questionId: string; dismissedAt: string }
  | {
      type: 'taskCreated';
      sessionId: string;
      task: AppTask;
      /** A confirmed new subagent generation must not inherit an older detached run id. */
      resetBackgroundTaskId?: boolean;
    }
  | {
      type: 'taskMetadataUpdated';
      sessionId: string;
      taskId: string;
      model?: string;
      thinkingEffort?: string;
    }
  | {
      type: 'taskProgress';
      sessionId: string;
      taskId: string;
      outputChunk: string;
      stream: 'stdout' | 'stderr';
      /**
       * `line` (default) appends a new progress line (tool-call / tool-progress).
       * `text` concatenates onto the subagent's growing streamed output
       * (`AppTask.text`), shown live in the detail panel like a thinking block.
       */
      kind?: 'line' | 'text';
    }
  | { type: 'taskCompleted'; sessionId: string; taskId: string; status: AppTaskStatus; outputPreview?: string; outputBytes?: number }
  // Prompt-level lifecycle (distinct from turn-level): a prompt that never
  // produced a turn — blocked by a pre-submit hook, or aborted while queued —
  // gets no turn.ended and no session status flip, so these are the web layer's
  // only signal to clear the per-session in-flight state. A normal turn's
  // prompt.completed is a no-op for state (the status_changed ahead of it
  // already finished the prompt).
  | { type: 'promptCompleted'; sessionId: string; promptId: string; reason: string }
  | { type: 'promptAborted'; sessionId: string; promptId: string }
  // The MAIN agent's turn boundary — the single source of truth for "the main
  // conversation has a turn in flight" (half of the working moon, and the
  // streaming reveal). Deliberately NOT derived from session status: a
  // background subagent or BTW side chat keeps the session busy but must not
  // light up the main conversation's moon. `reason` rides on deactivation.
  | { type: 'turnActiveChanged'; sessionId: string; active: boolean; reason?: string }
  | { type: 'turnProgress'; sessionId: string; update: AppTurnProgressUpdate }
  | { type: 'goalUpdated'; sessionId: string; goal: AppGoal | null }
  | { type: 'researchUpdated'; sessionId: string; snapshot: ResearchStatusSnapshot }
  | {
      type: 'subagentPresetEvaluated';
      sessionId: string;
      status: AutoSubagentPresetStatus;
    }
  | {
      type: 'subagentPresetChanged';
      sessionId: string;
      /** Preset active before the switch; absent when the server reports none. */
      previousPreset?: string;
      currentPreset: string;
      /** Expanded fields are optional so older daemons keep their existing marker UI. */
      reasonCode?: AutoSubagentPresetReasonCode;
      profileName?: string;
      evaluatedAt?: number;
      previousScore?: number;
      currentScore?: number;
    }
  | { type: 'configChanged'; changedFields: string[]; config: AppConfig }
  | {
      type: 'modelCatalogChanged';
      changed: { providerId: string; providerName: string; added: number; removed: number }[];
      unchanged: string[];
      failed: { provider: string; reason: string }[];
    }
  | { type: 'unknown'; raw: unknown };

// ---------------------------------------------------------------------------
// WebSocket connection helpers
// ---------------------------------------------------------------------------

/** Per-session sync cursor (v2): durable seq + journal epoch. */
export interface AppSessionCursor {
  seq: number;
  epoch?: string;
}

/** In-flight (mid-turn) state recovered from the session snapshot. */
export interface AppInFlightToolCall {
  toolCallId: string;
  name: string;
  args?: unknown;
  description?: string;
  lastProgress?: { kind: string; text?: string; percent?: number };
}

export interface AppInFlightTurn {
  turnId: number;
  assistantText: string;
  thinkingText: string;
  runningTools: AppInFlightToolCall[];
  /** Client-derived progress seed from the current prompt's snapshot messages.
   *  The wire snapshot does not carry a dedicated turn-start timestamp/counts. */
  progress?: {
    startedAt: number;
    stepCount: number;
    stepNumbers: number[];
    toolCallIds: string[];
    completedToolCallIds: string[];
  };
  /** Authoritative daemon prompt_id for the active prompt, if known. */
  promptId?: string;
}

/**
 * IM-style initial sync result: everything needed to rebuild a session's UI
 * state, consistent at `asOfSeq`. The standard flow is
 * `getSessionSnapshot()` → `subscribe(sessionId, {seq: asOfSeq, epoch})`.
 */
export interface AppSessionSnapshot {
  asOfSeq: number;
  epoch: string;
  session: AppSession;
  /** Most recent messages, chronological ascending. */
  messages: AppMessage[];
  hasMoreMessages: boolean;
  inFlightTurn: AppInFlightTurn | null;
  /** Live subagent roster at the watermark — rebuilds swarm cards on refresh. */
  subagents: AppTask[];
  pendingApprovals: AppApprovalRequest[];
  pendingQuestions: AppQuestionRequest[];
}

export interface KimiEventHandlers {
  onEvent(event: AppEvent, meta: KimiEventMeta): void;
  onResync(sessionId: string, currentSeq: number, epoch?: string): void;
  onError(code: number, msg: string, fatal: boolean): void;
  onConnectionChange(connected: boolean): void;
  onTerminalOutput?(sessionId: string, terminalId: string, data: string, seq: number): void;
  onTerminalExit?(sessionId: string, terminalId: string, exitCode: number | null): void;
}

/** Raw stream coordinates are present only for kap-server assistant/thinking
    deltas. They let the render queue merge chunks without guessing continuity. */
export interface KimiEventMeta {
  sessionId: string;
  seq: number;
  stream?: {
    turnId: number;
    offset: number;
    kind: 'text' | 'thinking';
  };
}

export interface KimiEventConnection {
  subscribe(sessionId: string, cursor?: AppSessionCursor): void;
  unsubscribe(sessionId: string): void;
  /**
   * Bind the real daemon prompt_id to the next turn for a session, so the
   * client-side projector stops synthesizing a random promptId on turn.started.
   * Call right after submitPrompt() returns.
   */
  bindNextPromptId(sessionId: string, promptId: string): void;
  /**
   * Seed the client-side projector with a snapshot's in-flight turn so a
   * reconnecting client renders mid-turn state immediately; emits the
   * corresponding AppEvents through `onEvent`. Resets per-session projector
   * state first — call BEFORE subscribe(), with the snapshot's cursor.
   */
  seedSnapshot(sessionId: string, snapshot: AppSessionSnapshot): void;
  abort(sessionId: string, promptId: string): void;
  terminalAttach(sessionId: string, terminalId: string, sinceSeq?: number): void;
  terminalInput(sessionId: string, terminalId: string, data: string): void;
  terminalResize(sessionId: string, terminalId: string, cols: number, rows: number): void;
  terminalDetach(sessionId: string, terminalId: string): void;
  terminalClose(sessionId: string, terminalId: string): void;
  /**
   * Mark an agent as a side-channel (e.g. BTW side chat). The client-side
   * projector will then emit its text/thinking deltas as agent-scoped events
   * instead of dropping them like background subagents.
   */
  markSideChannelAgent(agentId: string): void;
  /**
   * Report the underlying socket's health. Used to detect a silent-half-open
   * connection after the tab was frozen in the background: the browser still
   * reports OPEN (so no auto-reconnect) yet no frames have arrived for a while.
   */
  health(): { connected: boolean; open: boolean; stale: boolean };
  /**
   * Force a clean reconnect of the underlying socket. Used to recover from a
   * silent-half-open (background-tab freeze) where onclose never fires. The
   * reconnect handshake re-subscribes at the last durable cursor. No-op after
   * close().
   */
  reconnect(): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// Model + Provider (app-facing, camelCase)
// PRESUMED — not in current daemon docs; isolated in adapter, swap when backend defines them.
// ---------------------------------------------------------------------------

export interface AppModel {
  /** Unique identifier for this model (the string passed to PATCH session agent_config.model) */
  id: string;
  /** Provider id this model belongs to */
  provider: string;
  /** Raw model name (e.g. "moonshot-v1-128k") */
  model: string;
  /** Optional human-readable display name */
  displayName?: string;
  /** Maximum context size in tokens */
  maxContextSize: number;
  /** Optional capability tags (e.g. ["vision", "thinking"]) */
  capabilities?: string[];
  /** Effort levels this model supports for extended thinking (e.g. ["low", "high", "max"]).
      Sourced from the model catalog (managed) or config [models.<id>.overrides]. */
  supportEfforts?: readonly string[];
  /** Catalog-declared default effort for extended thinking. */
  defaultEffort?: string;
}

export interface AppProvider {
  /** Provider id */
  id: string;
  /** Provider type (e.g. "moonshot", "anthropic", "openai", "custom") */
  type: string;
  /** Optional custom base URL */
  baseUrl?: string;
  /** Optional default model alias */
  defaultModel?: string;
  /** Whether an API key is stored for this provider */
  hasApiKey: boolean;
  /** Provider connectivity status */
  status: 'connected' | 'error' | 'unconfigured';
  /** Model ids available from this provider */
  models?: string[];
}

export interface ProviderRefreshResult {
  changed: Array<{
    providerId: string;
    providerName: string;
    added: number;
    removed: number;
  }>;
  unchanged: string[];
  failed: Array<{ provider: string; reason: string }>;
}

export interface AppConfigProvider {
  type: string;
  baseUrl?: string;
  defaultModel?: string;
  hasApiKey: boolean;
}

export interface SubagentModelConfig {
  model?: string;
  thinkingEffort?: string;
}

export interface SubagentAutoPresetConfig {
  enabled?: boolean;
  /** Set by the server when a preset was manually activated. While true, the
   *  auto-preset runtime keeps the manual choice; the UI shows the persistent
   *  "manual lock" state and offers a resume-auto action that clears only this
   *  field (never the active preset or the auto-switching gates). */
  manualLock?: boolean;
  candidates?: string[];
  quotaFloorPercent?: number;
  switchMarginPercent?: number;
  localUsageWindowMs?: number;
  localUsageWeightPercent?: number;
  priorityWeightPercent?: number;
  reliabilityWeightPercent?: number;
  latencyWeightPercent?: number;
  switchCooldownMs?: number;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerCooldownMs?: number;
  refreshIntervalMs?: number;
  queryTimeoutMs?: number;
  allowExtraUsage?: boolean;
}

export interface SubagentConfig {
  timeoutMs?: number;
  preset?: string;
  agents?: Record<string, SubagentModelConfig>;
  presets?: Record<string, Record<string, SubagentModelConfig>>;
  autoPreset?: SubagentAutoPresetConfig;
}

export interface SecondaryModelConfig {
  defaultModel?: string;
  models?: Record<string, string>;
  force?: boolean;
  model?: string;
  maxContextSize?: number;
  maxInputSize?: number;
  maxOutputSize?: number;
  capabilities?: string[];
  displayName?: string;
  reasoningKey?: string;
  adaptiveThinking?: boolean;
  supportEfforts?: string[];
  defaultEffort?: string;
  offEffort?: string;
}

export interface ProviderUsageRow {
  name?: string;
  window?: {
    duration: number;
    unit: 'minute' | 'hour' | 'day' | 'week';
  };
  used: number;
  limit: number;
  resetAt?: string;
}

export interface ProviderExtraUsage {
  balanceCents: number;
  totalCents: number;
  monthlyChargeLimitEnabled: boolean;
  monthlyChargeLimitCents: number;
  monthlyUsedCents: number;
  currency: string;
}

export type ProviderUsageResult =
  | {
      provider: string;
      kind: 'ok';
      summary: ProviderUsageRow | null;
      limits: ProviderUsageRow[];
      extraUsage: ProviderExtraUsage | null;
    }
  | {
      provider: string;
      kind: 'error' | 'unsupported';
      message: string;
      status?: number;
    };

export interface AppConfig {
  providers: Record<string, AppConfigProvider>;
  defaultProvider?: string;
  defaultModel?: string;
  models?: Record<string, unknown>;
  thinking?: { enabled?: boolean; effort?: string };
  planMode?: boolean;
  yolo?: boolean;
  defaultPermissionMode?: string;
  defaultPlanMode?: boolean;
  permission?: unknown;
  hooks?: unknown[];
  services?: unknown;
  mergeAllAvailableSkills?: boolean;
  extraSkillDirs?: string[];
  loopControl?: unknown;
  background?: unknown;
  subagent?: SubagentConfig;
  secondaryModel?: SecondaryModelConfig;
  experimental?: Record<string, boolean>;
  telemetry?: boolean;
  raw?: Record<string, unknown>;
}

/** A session-scoped skill the user can invoke from the slash menu. */
export interface AppSkill {
  name: string;
  description: string;
  /** Skill source (e.g. 'builtin' | 'project' | 'plugin') for grouping/labels. */
  source: string;
}

// ---------------------------------------------------------------------------
// Remote share
// ---------------------------------------------------------------------------

/**
 * Browser-facing remote-share state (`GET /api/v1/remote-share` / `:start` /
 * `:stop`). The complete control URL carries the credential in its fragment;
 * the response never exposes a separate token field.
 */
export interface AppRemoteShareStatus {
  active: boolean;
  sessionId: string | null;
  host: string | null;
  port: number | null;
  url: string | null;
  ttlSeconds: number | null;
  startedAt: string | null;
  expiresAt: string | null;
}

/**
 * Browser-facing long-lived remote-control state (`GET /api/v1/remote-persistent`
 * / `:start` / `:stop`) — the persistent `hakimi remote` systemd user service.
 * The complete control URL carries the fixed credential in its fragment; the
 * response never exposes a separate token field.
 */
export interface AppRemotePersistentStatus {
  active: boolean;
  /** Projected systemd unit state: active/inactive/failed/... or unsupported. */
  state: string;
  health: 'ok' | 'down' | 'stale' | 'unknown';
  origin: string | null;
  url: string | null;
  port: number | null;
  startedAt: string | null;
  systemdAvailable: boolean;
  message: string | null;
}

// ---------------------------------------------------------------------------
// KimiWebApi — the app-facing interface
// ---------------------------------------------------------------------------

export interface AppSessionWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface KimiWebApi {
  getHealth(): Promise<{ status: 'ok'; uptimeSec: number }>;
  getMeta(): Promise<{ serverVersion: string; serverId: string; startedAt: string; capabilities: Record<string, boolean>; openInApps: string[]; dangerousBypassAuth: boolean; experimentalFlags: Record<string, boolean>; backend: 'v1' | 'v2' }>;
  listSessions(input?: PageRequest & { busy?: boolean; workspaceId?: string; includeArchive?: boolean; archivedOnly?: boolean; excludeEmpty?: boolean }): Promise<Page<AppSession>>;
  createSession(input: { title?: string; cwd?: string; model?: string; workspaceId?: string }): Promise<AppSession>;
  /** Fetch one session by id (deep links beyond the first listSessions page). */
  getSession(sessionId: string): Promise<AppSession>;
  updateSession(sessionId: string, input: { title?: string; cwd?: string; model?: string; permissionMode?: string; planMode?: boolean; swarmMode?: boolean; goalObjective?: string; goalControl?: 'pause' | 'resume' | 'cancel'; thinking?: string }): Promise<AppSession>;
  getSessionStatus(sessionId: string): Promise<AppSessionRuntimeStatus>;
  /** Current goal snapshot, or null when the session has no active goal. */
  getSessionGoal(sessionId: string): Promise<AppGoal | null>;
  getSessionResearch(sessionId: string): Promise<ResearchStatusSnapshot>;
  commandSessionResearch(
    sessionId: string,
    command: ResearchCommand,
  ): Promise<ResearchStatusSnapshot>;
  getSessionWarnings(sessionId: string): Promise<AppSessionWarning[]>;
  archiveSession(sessionId: string): Promise<{ archived: true }>;
  restoreSession(sessionId: string): Promise<AppSession>;
  listMessages(sessionId: string, input?: PageRequest & { role?: AppMessageRole }): Promise<Page<AppMessage>>;
  /** v2 initial sync: atomic session state + `asOfSeq` watermark + epoch. */
  getSessionSnapshot(sessionId: string): Promise<AppSessionSnapshot>;
  /** Export the session archive, optionally including the bounded Web JSONL log. */
  exportSession(sessionId: string, webLog?: string): Promise<{ blob: Blob; fileName: string }>;
  submitPrompt(sessionId: string, input: PromptSubmission): Promise<PromptSubmitResult>;
  /** Steer daemon-queued prompts into the active turn (TUI ctrl+s). */
  steerPrompts(sessionId: string, promptIds: string[]): Promise<{ steered: boolean; promptIds: string[] }>;
  abortPrompt(sessionId: string, promptId: string): Promise<{ aborted: boolean; atSeq?: number }>;
  /** Cancel whatever is running in the session, including skill activations. */
  abortSession(sessionId: string): Promise<{ aborted: boolean }>;
  compactSession(sessionId: string, instruction?: string): Promise<void>;
  undoSession(sessionId: string, count?: number): Promise<void>;
  forkSession(sessionId: string, input?: { title?: string }): Promise<AppSession>;
  /** Create a child session under a parent — POST /sessions/{id}/children. */
  createChildSession(sessionId: string, input?: { title?: string }): Promise<AppSession>;
  /** List a session's child sessions — GET /sessions/{id}/children. */
  listChildSessions(sessionId: string): Promise<AppSession[]>;
  /** Start a BTW side-channel agent under the session — POST /sessions/{id}:btw. */
  startBtw(sessionId: string): Promise<{ agentId: string }>;
  respondApproval(sessionId: string, approvalId: string, response: ApprovalResponse): Promise<{ resolved: true; resolvedAt: string }>;
  respondQuestion(sessionId: string, questionId: string, response: QuestionResponse): Promise<{ resolved: true; resolvedAt: string }>;
  dismissQuestion(sessionId: string, questionId: string): Promise<{ dismissed: true; dismissedAt: string }>;
  listSkills(sessionId: string): Promise<AppSkill[]>;
  /** List skills for a workspace (no session required) — GET /workspaces/{id}/skills. */
  listSkillsForWorkspace(workspaceId: string): Promise<AppSkill[]>;
  activateSkill(sessionId: string, skillName: string, args?: string): Promise<{ activated: true; skillName: string }>;
  listTasks(sessionId: string, status?: AppTaskStatus): Promise<AppTask[]>;
  getTask(sessionId: string, taskId: string, input?: { withOutput?: boolean; outputBytes?: number }): Promise<AppTask>;
  cancelTask(sessionId: string, taskId: string): Promise<{ cancelled: true }>;
  listTerminals(sessionId: string): Promise<AppTerminal[]>;
  createTerminal(sessionId: string, input?: { cwd?: string; shell?: string; cols?: number; rows?: number }): Promise<AppTerminal>;
  getTerminal(sessionId: string, terminalId: string): Promise<AppTerminal>;
  closeTerminal(sessionId: string, terminalId: string): Promise<{ closed: true }>;
  listDirectory(sessionId: string, input: { path?: string; depth?: number; includeGitStatus?: boolean }): Promise<{ items: FsEntry[]; childrenByPath?: Record<string, FsEntry[]>; truncated: boolean }>;
  readFile(sessionId: string, input: { path: string; offset?: number; length?: number }): Promise<{ path: string; content: string; encoding: 'utf-8' | 'base64'; size: number; truncated: boolean; etag: string; mime: string; languageId?: string; lineCount?: number; isBinary: boolean }>;
  /** Search files in a workspace (no session required) — POST /workspace/fs:search. `workspace` accepts a registered workspace id or an absolute root. */
  searchFiles(workspace: string, input: { query: string; limit?: number }): Promise<{ items: Array<{ path: string; name: string; kind: FsKind; score: number; matchPositions: number[] }>; truncated: boolean }>;
  grepFiles(sessionId: string, input: { pattern: string; regex?: boolean; caseSensitive?: boolean }): Promise<{ files: Array<{ path: string; matches: Array<{ line: number; col: number; text: string; before: string[]; after: string[] }> }>; filesScanned: number; truncated: boolean; elapsedMs: number }>;
  getGitStatus(sessionId: string, paths?: string[]): Promise<{ branch: string; ahead: number; behind: number; entries: Record<string, string>; additions: number; deletions: number; pullRequest: { number: number; state: string; url: string } | null }>;
  getFileDiff(sessionId: string, path: string): Promise<{ path: string; diff: string }>;
  getFileDownloadUrl(sessionId: string, path: string): string;
  openFile(sessionId: string, input: { path: string; line?: number }): Promise<{ opened: true }>;
  revealFile(sessionId: string, input: { path: string }): Promise<{ revealed: true }>;
  /** Open the session working directory (or a session-relative path) in an external application. */
  openInApp(sessionId: string, appId: string, path: string, line?: number): Promise<void>;
  connectEvents(handlers: KimiEventHandlers): KimiEventConnection;

  // Workspaces + daemon folder browser. /workspaces now ships and includes
  // derived workspaces (cwds with sessions that were never explicitly registered).
  listWorkspaces(): Promise<AppWorkspace[]>;
  addWorkspace(input: { root: string; name?: string }): Promise<AppWorkspace>;
  updateWorkspace(id: string, input: { name: string }): Promise<AppWorkspace>;
  deleteWorkspace(id: string): Promise<void>;
  browseFs(path?: string): Promise<FsBrowseResult>;
  getFsHome(): Promise<{ home: string; recentRoots: string[] }>;

  // PRESUMED — not in current daemon docs; isolated in adapter, swap when backend defines them.
  listModels(): Promise<AppModel[]>;
  listProviders(): Promise<AppProvider[]>;
  addProvider(input: { type: string; apiKey?: string; baseUrl?: string; defaultModel?: string }): Promise<AppProvider>;
  deleteProvider(id: string): Promise<{ deleted: true }>;
  refreshProvider(id: string): Promise<ProviderRefreshResult>;
  refreshAllProviders(): Promise<ProviderRefreshResult>;
  refreshOAuthProviderModels(): Promise<ProviderRefreshResult>;

  // File upload / download
  uploadFile(input: { file: Blob; name?: string }): Promise<{ id: string; name: string; mediaType: string; size: number }>;
  getFileUrl(fileId: string): string;
  /** Fetch a file's bytes with auth — feed the resulting Blob to a blob URL for <video>/<img> src. */
  getFileBlob(fileId: string): Promise<Blob>;

  // Config — REAL endpoints
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  /** Latest process-global automatic routing evaluation; absent on old daemons or before first run. */
  getAutoSubagentPresetStatus(): Promise<AutoSubagentPresetStatus | undefined>;
  /** Validate and serialize a manual preset choice; empty selects base routing. */
  activateSubagentPreset(preset: string): Promise<{ config: AppConfig; warning?: string }>;
  /** Query current plan limits and Extra Usage without exposing provider credentials. */
  getProviderUsage(providerId?: string): Promise<ProviderUsageResult[]>;

  // Remote share — gated by the `remote_control` experimental flag; the host
  // UI only calls these from non-remote mode.
  getRemoteShare(): Promise<AppRemoteShareStatus>;
  /** Start a share with `sessionId` as its initial landing point and an optional
   *  TTL (the client offers 30m/1h/8h/24h presets, 8h default). */
  startRemoteShare(sessionId: string, ttlSeconds?: number): Promise<AppRemoteShareStatus>;
  /** Stop the active share (idempotent; returns the inactive status). */
  stopRemoteShare(): Promise<AppRemoteShareStatus>;

  // Long-lived remote control — the persistent `hakimi remote` systemd user
  // service (no TTL, fixed token). Same `remote_control` flag gate and only
  // reachable from non-remote mode.
  getRemotePersistent(): Promise<AppRemotePersistentStatus>;
  /** Start the persistent systemd user service (idempotent; returns fresh status). */
  startRemotePersistent(): Promise<AppRemotePersistentStatus>;
  /** Stop the persistent systemd user service (idempotent; returns fresh status). */
  stopRemotePersistent(): Promise<AppRemotePersistentStatus>;

  // Auth — REAL endpoints
  getAuth(): Promise<{
    ready: boolean;
    providersCount: number;
    defaultModel: string | null;
    managedProvider: { status: string } | null;
  }>;
  startOAuthLogin(): Promise<OAuthLoginStartResult>;
  pollOAuthLogin(): Promise<{
    flowId: string;
    status: 'pending' | 'authenticated' | 'expired' | 'cancelled';
    resolvedAt?: string;
  } | null>;
  cancelOAuthLogin(): Promise<{ cancelled: boolean; status: string }>;
  logout(): Promise<{ loggedOut: boolean }>;
}

/** Result of `startOAuthLogin()`, mirroring the wire discriminated union. */
export type OAuthLoginStartResult =
  | {
      flowId: string;
      provider: string;
      status: 'pending';
      verificationUri: string;
      verificationUriComplete: string;
      userCode: string;
      expiresIn: number;
      interval: number;
      expiresAt: string;
    }
  | {
      flowId: string;
      provider: string;
      status: 'authenticated';
    };
