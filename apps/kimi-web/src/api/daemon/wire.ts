// apps/kimi-web/src/api/daemon/wire.ts
// Daemon wire DTOs — ALL fields stay snake_case as they appear on the wire.
// No camelCase conversions here; that is mappers.ts's job.

// ---------------------------------------------------------------------------
// Envelope & Page
// ---------------------------------------------------------------------------

export interface WireEnvelope<T> {
  code: number;
  msg: string;
  data: T | null;
  request_id: string;
  details?: unknown;
}

export interface WirePage<T> {
  items: T[];
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export type WireSessionStatus =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'awaiting_question'
  | 'aborted';

export interface WireSessionUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_cost_usd: number;
  context_tokens: number;
  context_limit: number;
  turn_count: number;
}

export interface WireSessionUsageDelta {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
}

export interface WirePermissionRule {
  id: string;
  tool_name: string;
  matcher?: {
    kind: 'command_prefix' | 'path_glob' | 'exact_input' | 'always';
    value?: string;
  };
  decision: 'approved';
  created_at: string;
  created_by: 'user' | 'agent';
}

export interface WireSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  busy: boolean;
  main_turn_active?: boolean;
  pending_interaction?: 'none' | 'approval' | 'question';
  last_turn_reason?: 'completed' | 'cancelled' | 'failed';
  archived: boolean;
  current_prompt_id?: string;
  /** Text of the most recent user prompt, for search/preview. */
  last_prompt?: string;
  // PRESUMED — daemon adds this once it ships the workspace registry; until then
  // it is absent and the client maps sessions by metadata.cwd === workspace.root.
  workspace_id?: string;
  metadata: {
    cwd: string;
    [key: string]: unknown;
  };
  agent_config: {
    model: string;
    system_prompt?: string;
    tools?: string[];
    mcp_servers?: string[];
    // Runtime controls — optional on read (the daemon may not backfill them;
    // live values come from GET /sessions/{id}/status).
    thinking?: string;
    permission_mode?: string;
    plan_mode?: boolean;
    swarm_mode?: boolean;
    goal_objective?: string;
    goal_control?: 'pause' | 'resume' | 'cancel';
  };
  usage: WireSessionUsage;
  permission_rules: WirePermissionRule[];
  message_count: number;
  last_seq: number;
}

// GET /sessions/{id}/status — live runtime state, aligned with TUI /status.
export interface WireSessionRuntimeStatus {
  model?: string;
  thinking_level: string;
  permission: string;
  plan_mode: boolean;
  swarm_mode: boolean;
  context_tokens: number;
  max_context_tokens: number;
  context_usage: number;
}

// GET /sessions/{id}/goal — camelCase, same shape as the `goal.updated` event
// payload. The endpoint returns null when no goal is active.
export interface WireGoalWaitLease {
  taskIds: string[];
  policy: 'any' | 'all';
}

export interface WireGoalContinuation {
  state: 'idle' | 'deciding' | 'enqueued' | 'running' | 'held' | 'waiting';
  owner?: string;
  reason?: string;
}

export interface WireGoalSnapshot {
  goalId: string;
  objective: string;
  completionCriterion?: string;
  status: 'active' | 'paused' | 'blocked' | 'complete';
  turnsUsed: number;
  tokensUsed: number;
  wallClockMs: number;
  waitingFor?: WireGoalWaitLease;
  continuation?: WireGoalContinuation;
  terminalReason?: string;
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
}

// GET /sessions/{id}/research and `research.updated` are camelCase protocol
// shapes. They are mirrored locally so the browser remains decoupled from Core.
export type WireResearchModePhase = 'inactive' | 'probing' | 'ready' | 'degraded';
export type WireResearchLoopStatus = 'active' | 'paused';
export type WireResearchPlanningPolicy = 'collaborative' | 'dreaming';
export type WireResearchQuestionWorkflow =
  | 'open'
  | 'active'
  | 'deferred'
  | 'blocked'
  | 'closed'
  | 'cancelled';
export type WireResearchQuestionEpistemic =
  | 'unknown'
  | 'candidate'
  | 'supported'
  | 'contradicted'
  | 'inconclusive';
export type WireResearchQuestionPersistence =
  | 'working'
  | 'pending_commit'
  | 'committed'
  | 'degraded';
export type WireResearchLineStatus = 'active' | 'paused' | 'completed' | 'blocked';
export type WireResearchAlertKind =
  | 'contradiction'
  | 'blocked'
  | 'reopened'
  | 'commit_failed'
  | 'degraded'
  | 'stale';
export type WireResearchNextStepSource =
  | 'research_action'
  | 'research_run'
  | 'human_gate'
  | 'aitp_maintenance'
  | 'question';
export type WireResearchNextStepFreshness = 'current' | 'stale' | 'blocked';
export type WireResearchAlertClassification =
  | 'active_blocker'
  | 'historical_unresolved'
  | 'superseded_by_retry'
  | 'warning';
export type WireResearchAlertSource =
  | 'question'
  | 'aitp_failure'
  | 'aitp_check'
  | 'adapter'
  | 'checkpoint';
export type WireResearchAlertState = 'active' | 'acknowledged' | 'cleared' | 'superseded';
export type WireAitpMaintenanceStatus = 'ready' | 'degraded';
export type WireAitpMaintenanceMemoryStatus =
  | 'available'
  | 'partial'
  | 'not_established'
  | 'unknown';
export type WireAitpMaintenanceDegradedReason =
  | 'adapter_not_ready'
  | 'adapter_degraded'
  | 'enter_failed'
  | 'check_unavailable'
  | 'stale_generation'
  | 'workstream_unbound';
export type WireResearchPhase =
  | 'idle'
  | 'orienting'
  | 'gap_analysis'
  | 'action_planned'
  | 'action_executing'
  | 'evaluating'
  | 'state_updated'
  | 'checkpoint_pending'
  | 'awaiting_human';
export type WireResearchActionKind =
  | 'experiment'
  | 'derivation'
  | 'literature_review'
  | 'data_analysis'
  | 'simulation'
  | 'other';
export type WireResearchActionStatus = 'planned' | 'in_progress' | 'completed' | 'abandoned';
export type WireResearchRunStage =
  | 'queued'
  | 'running'
  | 'scf'
  | 'band'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'unknown';
export type WireResearchSchedulerState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'unknown';
export type WireResearchHumanGateKind = 'approval' | 'review' | 'decision';

export interface WireResearchLine {
  slug: string;
  title: string;
  objective?: string;
  assessment?: string;
  status: WireResearchLineStatus;
  createdAt: number;
  revision: number;
}

export interface WireResearchLineWorkstreamBinding {
  confirmationId: string;
  lineSlug: string;
  workstream: string;
  topicId: string;
  observedRevision: number;
  confirmedBy: 'user' | 'main_agent';
  confirmedAt: number;
}

export type WireResearchLineWorkstreamBindingStatus =
  | 'unbound'
  | 'unavailable'
  | 'bound'
  | 'stale'
  | 'conflict';

export interface WireResearchLineWorkstreamAlignment {
  lineSlug: string;
  status: WireResearchLineWorkstreamBindingStatus;
  reason: string;
  binding?: WireResearchLineWorkstreamBinding;
}

export interface WireResearchQuestion {
  id: string;
  lineSlug: string;
  wording: string;
  assessment?: string;
  priority: number;
  neededEvidence: string[];
  evidenceRefs: string[];
  falsifierRefs: string[];
  nextBoundedAction?: string;
  workflow: WireResearchQuestionWorkflow;
  epistemic: WireResearchQuestionEpistemic;
  persistence: WireResearchQuestionPersistence;
  revision: number;
}

export interface WireResearchEffectiveNextStep {
  text: string;
  source: WireResearchNextStepSource;
  freshness: WireResearchNextStepFreshness;
  observedAt: number;
  derivedFrom: {
    actionId?: string;
    entryId?: string;
    questionId?: string;
    lineSlug?: string;
  };
}

export interface WireResearchAlert {
  fingerprint: string;
  kind: WireResearchAlertKind;
  classification?: WireResearchAlertClassification;
  source?: WireResearchAlertSource;
  state?: WireResearchAlertState;
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

export interface WireAitpAdapterHealth {
  phase: WireResearchModePhase;
  contractVersion?: string;
  pluginVersion?: string;
  pythonVersion?: string;
  lastCheckAt?: number;
  lastError?: string;
  notInitialized?: boolean;
}

export interface WireAitpMaintenanceFailureSummary {
  entryId: string;
  kind: 'observation' | 'result' | 'failure' | 'decision' | 'source' | 'code_change' | 'run' | 'closeout';
  summary: string;
  source: string;
  authority: 'human' | 'agent' | 'source' | 'tool';
  createdAt?: number;
  workstream?: string;
}

export interface WireAitpMaintenanceNextAction {
  text: string;
  entryId: string;
  authority: 'human' | 'agent' | 'source' | 'tool';
  createdAt?: number;
  source: string;
}

export interface WireResearchProgramTopic {
  id: string;
  title: string;
  goalText: string;
  goalSource: string;
}

export interface WireAitpMaintenanceReceipt {
  status: WireAitpMaintenanceStatus;
  refreshedAt: number;
  memoryStatus: WireAitpMaintenanceMemoryStatus;
  workstream?: string;
  topic?: WireResearchProgramTopic;
  latestWorkingNoteAt?: number;
  activeNewerThanWorkingNote: boolean | null;
  unresolvedFailureCount: number;
  unresolvedFailures: WireAitpMaintenanceFailureSummary[];
  nextAction?: string;
  nextActionDetails?: WireAitpMaintenanceNextAction;
  warningSummaries: Array<{ level: 'warning'; code: string }>;
  check: {
    status: 'clean' | 'findings' | 'unavailable';
    counts?: { entries: number; notes: number; errors: number; warnings: number };
    findingCodes: string[];
  };
  degradedReason?: WireAitpMaintenanceDegradedReason;
}

export interface WireResearchCheckpointCheckReceipt {
  status: 'clean' | 'findings';
  errors: number;
  warnings: number;
  findingFingerprints: string[];
  errorFindingFingerprints: string[];
  newErrorFindingFingerprints?: string[];
  preExistingErrorFindingFingerprints?: string[];
  checkedAt: number;
}

export type WireResearchCheckpointPrepareReceipt =
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

export interface WireResearchCheckpointSaveReceipt {
  status: 'saved' | 'already_saved';
  draftPath: string;
  path: string;
  source?: 'record_save' | 'prepare_existing';
}

export interface WireResearchCheckpointReceipt {
  prepare?: WireResearchCheckpointPrepareReceipt;
  save?: WireResearchCheckpointSaveReceipt;
  preSaveCheck?: WireResearchCheckpointCheckReceipt;
  postSaveCheck?: WireResearchCheckpointCheckReceipt;
}

export interface WireResearchDurableCommitCandidate {
  sourceActionId: string;
  progressRecordedAt: number;
  entryKind: 'observation' | 'result' | 'failure' | 'decision' | 'source' | 'code_change' | 'run' | 'closeout';
  authority: 'human' | 'agent' | 'source' | 'tool';
  provenance: 'agent_verification' | 'tool_verification' | 'source_assessment' | 'human_assertion' | 'human_decision';
  rationale: string;
}

export interface WireResearchCommittedCursor {
  checkpointId: string;
  entryId?: string;
  receipt?: WireResearchCheckpointReceipt;
  committedAt: number;
}

export interface WireResearchCheckpoint {
  checkpointId: string;
  committedEntryId?: string;
  questionId?: string;
  questionRevision?: number;
  lineSlug?: string;
  workstreamBinding?: WireResearchLineWorkstreamBinding;
  commitCandidate?: WireResearchDurableCommitCandidate;
  assessment?: string;
  nextAction?: string;
  idempotencyKey: string;
  persistence: WireResearchQuestionPersistence;
  receipt?: WireResearchCheckpointReceipt;
  createdAt: number;
}

export interface WireResearchRunState {
  actionId: string;
  campaign: string;
  jobId: string;
  sourcePin?: string;
  binaryPin?: string;
  stage: WireResearchRunStage;
  schedulerState: WireResearchSchedulerState;
  lastObservedAt: number;
  nextCheckAt?: number;
  terminalState?: 'completed' | 'failed' | 'cancelled';
  artifactRefs: string[];
}

export interface WireResearchEvidencePacket {
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

export interface WireResearchActionSpec {
  actionId: string;
  questionId?: string;
  lineSlug?: string;
  kind: WireResearchActionKind;
  purpose: string;
  expectedEvidence: string[];
  stopCondition: string;
  allowedToolKinds: string[];
  retryOfEntryId?: string;
  status: WireResearchActionStatus;
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
  run?: WireResearchRunState;
}

export interface WireResearchProgressDetail {
  assumptions?: string[];
  derivation?: string;
  tests?: string[];
  observations?: string[];
  sources?: string[];
  limitations?: string[];
  detailHint?: string;
  artifactRefs?: string[];
}

export interface WireResearchProgressReport {
  headline: string;
  question?: string;
  motivation: string;
  workPerformed: string;
  result: string;
  mainlineImpact: string;
  uncertainties: string[];
  nextAction?: string;
  phaseChange?: { from: WireResearchPhase; to: WireResearchPhase };
  humanDecision?: string;
  detail?: WireResearchProgressDetail;
  recordedAt: number;
}

export interface WireResearchStateChange {
  beforePhase: WireResearchPhase;
  afterPhase: WireResearchPhase;
  actionId?: string;
  summary: string;
  changedAt: number;
}

export interface WireResearchHumanGate {
  gateId: string;
  kind: WireResearchHumanGateKind;
  actionId?: string;
  questionId?: string;
  prompt: string;
  resolvedAt?: number;
  resolution?: string;
  createdAt: number;
}

export interface WireResearchProgram {
  topicId: string;
  title: string;
  goalText: string;
  goalSource: string;
  establishedAt: number;
  observedRevision: number;
}

export interface WireResearchGoalProgramBinding {
  relation: 'same_program_goal' | 'goal_parent_of_program' | 'goal_milestone_in_program' | 'unrelated';
  goalId: string;
  topicId: string;
  observedRevision: number;
  confirmedAt: number;
}

export interface WireResearchGoalAlignment {
  status: 'unavailable' | 'confirmation_required' | 'aligned' | 'stale' | 'conflict';
  reason: string;
  binding?: WireResearchGoalProgramBinding;
}

export interface WireResearchPeriod {
  id: string;
  lineSlug: string;
  startedAt: number;
  endedAt?: number;
  loopCount: number;
  currentQuestionId?: string;
  summary?: string;
}

export interface WireResearchStatusProjection {
  currentLineSlug?: string;
  currentQuestionId?: string;
  currentActionId?: string;
  phase: WireResearchPhase;
  nextStep?: string;
  health: 'ok' | 'attention' | 'degraded' | 'blocked';
  attention: string[];
}

export interface WireResearchPlanResolution {
  planId: string;
  planRevision: number;
  outcome: 'approved';
  selectedLabel?: string;
}

export interface WireResearchPlan {
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
  resolution?: WireResearchPlanResolution;
}

export interface WireResearchPlanV2 {
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

export interface WireResearchGoalProjection {
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
  waitingFor?: { taskIds: string[]; policy: 'any' | 'all' };
  continuation?: WireGoalContinuation;
  programRelation: WireResearchGoalAlignment;
  humanGates: WireResearchHumanGate[];
  persistenceGuards: Array<{
    code: string;
    status: 'clear' | 'blocked' | 'inactive';
    reason: string;
  }>;
  researchRevision: number;
}

export interface WireResearchStatusSnapshot {
  mode: WireResearchModePhase;
  loopStatus: WireResearchLoopStatus;
  currentLineSlug?: string;
  currentWorkstreamBinding?: WireResearchLineWorkstreamAlignment;
  lineWorkstreamBindings: WireResearchLineWorkstreamBinding[];
  currentFocus?: { questionId: string; boundedAction?: string; revision: number };
  currentQuestion?: WireResearchQuestion;
  questions: WireResearchQuestion[];
  lines: WireResearchLine[];
  openQuestionCount: number;
  activeQuestionCount: number;
  blockedQuestionCount: number;
  alerts: WireResearchAlert[];
  effectiveNextStep?: WireResearchEffectiveNextStep;
  goalSummary?: {
    /** The current Goal milestone, distinct from the ResearchPlan objective. */
    goalId?: string;
    objective: string;
    completionCriterion?: string;
    status: 'active' | 'paused' | 'blocked' | 'complete';
    turnBudget?: number;
    remainingTurns?: number;
    terminalReason?: string;
    waitingFor?: { taskIds: string[]; policy: 'any' | 'all' };
  };
  researchGoal?: WireResearchGoalProjection;
  goalAlignment?: WireResearchGoalAlignment;
  aitpHealth: WireAitpAdapterHealth;
  aitpMaintenance?: WireAitpMaintenanceReceipt;
  pendingCheckpoint?: WireResearchCheckpoint;
  latestCommittedCheckpoint?: WireResearchCommittedCursor;
  committedCheckpointHistory?: WireResearchCommittedCursor[];
  distillationAttention?: WireResearchDistillationAttention;
  phase: WireResearchPhase;
  currentAction?: WireResearchActionSpec;
  currentRun?: WireResearchRunState;
  latestProgress?: WireResearchProgressReport;
  recentStateChange?: WireResearchStateChange;
  humanGate?: WireResearchHumanGate;
  program?: WireResearchProgram;
  period?: WireResearchPeriod;
  researchPlan?: WireResearchPlan;
  actionPlan?: WireResearchPlan;
  researchPlanV2?: WireResearchPlanV2;
  planningPolicy: WireResearchPlanningPolicy;
  status?: WireResearchStatusProjection;
  revision: number;
}

export type WireResearchDistillationAttention =
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

export type WireResearchCommand =
  | { kind: 'enter_mode'; actor: 'user' | 'model'; lineSlug?: string }
  | { kind: 'exit_mode' }
  | { kind: 'pause_loop'; expectedRevision: number; reason?: string }
  | { kind: 'resume_loop'; expectedRevision: number; reason?: string }
  | { kind: 'create_question'; lineSlug: string; wording: string; assessment?: string; priority?: number; neededEvidence?: string[] }
  | { kind: 'update_question'; questionId: string; expectedRevision: number; wording?: string; assessment?: string; priority?: number; workflow?: WireResearchQuestionWorkflow; epistemic?: WireResearchQuestionEpistemic; neededEvidence?: string[]; nextBoundedAction?: string; reason?: string }
  | { kind: 'set_focus'; questionId: string; expectedRevision: number; boundedAction?: string; reason?: string }
  | { kind: 'switch_line'; lineSlug: string; expectedRevision: number; reason?: string }
  | { kind: 'reopen_question'; questionId: string; expectedRevision: number; reason?: string }
  | { kind: 'defer_question'; questionId: string; expectedRevision: number; reason?: string }
  | { kind: 'block_question'; questionId: string; expectedRevision: number; reason?: string }
  | { kind: 'close_question'; questionId: string; expectedRevision: number; reason?: string }
  | { kind: 'create_line'; slug: string; title: string; objective?: string; assessment?: string }
  | { kind: 'update_line'; lineSlug: string; expectedRevision: number; title?: string; objective?: string; status?: WireResearchLineStatus; assessment?: string; reason?: string }
  | { kind: 'propose_checkpoint'; expectedRevision: number; questionId?: string; lineSlug?: string; assessment?: string; nextAction?: string }
  | { kind: 'commit_checkpoint'; checkpointId: string; entryId: string }
  | { kind: 'confirm_goal_alignment'; relation: 'same_program_goal' | 'goal_parent_of_program' | 'goal_milestone_in_program' | 'unrelated'; expectedRevision: number; goalId: string; topicId: string; observedRevision: number }
  | { kind: 'clear_goal_alignment'; expectedRevision: number; goalId: string; topicId: string; observedRevision: number }
  | { kind: 'resolve_decision'; gateId: string; resolution: string; nextPhase: WireResearchPhase }
  | { kind: 'review_evidence'; packet: WireResearchEvidencePacket; expectedRevision: number }
  | {
      kind: 'observe_run';
      actionId: string;
      expectedRevision: number;
      campaign: string;
      jobId: string;
      sourcePin?: string;
      binaryPin?: string;
      stage: WireResearchRunStage;
      schedulerState: WireResearchSchedulerState;
      nextCheckAt?: number;
      terminalState?: 'completed' | 'failed' | 'cancelled';
      artifactRefs: string[];
    }
  | { kind: 'acknowledge_alert'; fingerprint: string }
  | { kind: 'confirm_line_workstream_binding'; lineSlug: string; workstream: string; expectedRevision: number }
  | {
      kind: 'clear_line_workstream_binding';
      lineSlug: string;
      expectedConfirmationId: string;
      expectedRevision: number;
    }
  | { kind: 'set_planning_policy'; policy: WireResearchPlanningPolicy; expectedRevision: number }
  | {
      kind: 'prepare_plan_v2';
      planId?: string;
      expectedRevision?: number;
      objective: string;
      completionCriterion?: string;
      milestones: WireResearchPlanV2['milestones'];
      evidenceRequirements: string[];
      decisionPoints: WireResearchPlanV2['decisionPoints'];
      assumptions: string[];
      currentMilestoneId: string;
      stopConditions: string[];
      replanConditions: string[];
    }
  | { kind: 'activate_plan_v2' | 'complete_plan_v2' | 'discard_plan_v2'; planId: string; expectedRevision: number };

export interface WireResearchCommandResponse {
  snapshot: WireResearchStatusSnapshot;
}

// GET /sessions/{id}/warnings — session-level warnings (e.g. oversized AGENTS.md).
export interface WireSessionWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface WireSessionWarningsResponse {
  warnings: WireSessionWarning[];
}

// ---------------------------------------------------------------------------
// Workspace + daemon folder browser wire DTOs
// PRESUMED — not in the live daemon yet; isolated here, swap when backend ships.
// ---------------------------------------------------------------------------

export interface WireWorkspace {
  id: string;
  root: string;
  name: string;
  last_opened_at?: string;
  session_count: number;
}

export interface WireFsBrowseEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface WireFsBrowseResult {
  path: string;
  parent: string | null;
  entries: WireFsBrowseEntry[];
}

export interface WireFsHomeResult {
  home: string;
  recent_roots: string[];
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export type WireMessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool_call_id: string; tool_name: string; input: unknown }
  | { type: 'tool_result'; tool_call_id: string; output: unknown; is_error?: boolean }
  | { type: 'image'; source: WireImageSource }
  | { type: 'video'; source: WireImageSource }
  | { type: 'file'; file_id: string; name: string; media_type: string; size: number }
  | { type: 'thinking'; thinking: string; signature?: string };

export type WireImageSource =
  | { kind: 'url'; url: string; id?: string }
  | { kind: 'base64'; media_type: string; data: string }
  | { kind: 'file'; file_id: string };

export interface WireMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: WireMessageContent[];
  created_at: string;
  prompt_id?: string;
  parent_message_id?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export interface WirePromptSubmission {
  content: WireMessageContent[];
  metadata?: Record<string, unknown>;
  agent_id?: string;
  model?: string;
  thinking?: string;
  permission_mode?: string;
  plan_mode?: boolean;
  swarm_mode?: boolean;
  goal_objective?: string;
  goal_control?: 'pause' | 'resume' | 'cancel';
}

export interface WirePromptSubmitResult {
  prompt_id: string;
  user_message_id: string;
  /** 'running' = started immediately; 'queued' = parked behind the active prompt. */
  status?: 'running' | 'queued';
}

export interface WirePromptSteerResult {
  steered: boolean;
  prompt_ids: string[];
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export interface WireApprovalRequest {
  approval_id: string;
  session_id: string;
  turn_id?: number;
  tool_call_id: string;
  tool_name: string;
  action: string;
  /** ToolInputDisplay — 12 discriminated kinds; client falls back to generic.
      The daemon protocol field is `tool_input_display` (protocol/approval.ts);
      `display` is the stub daemon's older shape, kept for compatibility. */
  tool_input_display?: unknown;
  display?: unknown;
  expires_at: string;
  created_at: string;
}

export interface WireApprovalResponse {
  decision: 'approved' | 'rejected' | 'cancelled';
  scope?: 'session';
  feedback?: string;
  selected_label?: string;
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export interface WireQuestionOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  is_recommended?: boolean;
}

export interface WireQuestionItem {
  id: string;
  question: string;
  header?: string;
  body?: string;
  options: WireQuestionOption[];
  multi_select?: boolean;
  allow_other?: boolean;
  other_label?: string;
  other_description?: string;
}

export interface WireQuestionRequest {
  question_id: string;
  session_id: string;
  turn_id?: number;
  tool_call_id?: string;
  questions: WireQuestionItem[];
  created_at: string;
}

export type WireQuestionAnswer =
  | { kind: 'single'; option_id: string }
  | { kind: 'multi'; option_ids: string[] }
  | { kind: 'other'; text: string }
  | { kind: 'multi_with_other'; option_ids: string[]; other_text: string }
  | { kind: 'skipped' };

export interface WireQuestionResponse {
  answers: Record<string, WireQuestionAnswer>;
  method?: 'enter' | 'space' | 'number_key' | 'click';
  note?: string;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export type WireTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface WireTask {
  id: string;
  session_id: string;
  kind: 'subagent' | 'bash' | 'tool';
  description: string;
  status: WireTaskStatus;
  command?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  output_preview?: string;
  output_bytes?: number;
  subagent_phase?: 'queued' | 'working' | 'suspended' | 'completed' | 'failed';
  subagent_type?: string;
  parent_tool_call_id?: string;
  suspended_reason?: string;
  swarm_index?: number;
  run_in_background?: boolean;
}

// ---------------------------------------------------------------------------
// File System
// ---------------------------------------------------------------------------

export type WireFsKind = 'file' | 'directory' | 'symlink';

export interface WireFsEntry {
  path: string;
  name: string;
  kind: WireFsKind;
  size?: number;
  modified_at: string;
  etag?: string;
  mime?: string;
  language_id?: string;
  is_binary?: boolean;
  is_symlink_to?: string;
  git_status?: string;
  child_count?: number;
}

// ---------------------------------------------------------------------------
// Model + Provider wire DTOs
// PRESUMED — not in current daemon docs; isolated here, swap when backend defines them.
// ---------------------------------------------------------------------------

export interface WireModel {
  provider: string;
  model: string;
  display_name?: string;
  max_context_size: number;
  capabilities?: string[];
  support_efforts?: string[];
  default_effort?: string;
}

export interface WireProvider {
  id: string;
  type: string;
  base_url?: string;
  default_model?: string;
  has_api_key: boolean;
  status: 'connected' | 'error' | 'unconfigured';
  models?: string[];
}

export interface WireProviderRefreshResult {
  changed: Array<{
    provider_id: string;
    provider_name: string;
    added: number;
    removed: number;
  }>;
  unchanged: string[];
  failed: Array<{ provider: string; reason: string }>;
}

export interface WireConfigProvider {
  type: string;
  base_url?: string;
  default_model?: string;
  has_api_key: boolean;
}

/** Nested config domains are projected by Core and retain camelCase fields. */
export interface WireSubagentModelConfig {
  model?: string;
  thinkingEffort?: string;
}

export interface WireSubagentConfig {
  timeoutMs?: number;
  preset?: string;
  agents?: Record<string, WireSubagentModelConfig>;
  presets?: Record<string, Record<string, WireSubagentModelConfig>>;
}

export interface WireSecondaryModelConfig {
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

export interface WireConfig {
  providers: Record<string, WireConfigProvider>;
  default_provider?: string;
  default_model?: string;
  models?: Record<string, unknown>;
  thinking?: unknown;
  plan_mode?: boolean;
  yolo?: boolean;
  default_permission_mode?: string;
  default_plan_mode?: boolean;
  permission?: unknown;
  hooks?: unknown[];
  services?: unknown;
  merge_all_available_skills?: boolean;
  extra_skill_dirs?: string[];
  loop_control?: unknown;
  background?: unknown;
  subagent?: WireSubagentConfig;
  secondary_model?: WireSecondaryModelConfig;
  experimental?: Record<string, boolean>;
  telemetry?: boolean;
  raw?: Record<string, unknown>;
}

export interface WireProviderUsageRow {
  name?: string;
  window?: {
    duration: number;
    unit: 'minute' | 'hour' | 'day' | 'week';
  };
  used: number;
  limit: number;
  reset_at?: string;
}

export interface WireProviderExtraUsage {
  balance_cents: number;
  total_cents: number;
  monthly_charge_limit_enabled: boolean;
  monthly_charge_limit_cents: number;
  monthly_used_cents: number;
  currency: string;
}

export type WireProviderUsageItem =
  | {
      provider: string;
      kind: 'ok';
      summary: WireProviderUsageRow | null;
      limits: WireProviderUsageRow[];
      extra_usage: WireProviderExtraUsage | null;
    }
  | {
      provider: string;
      kind: 'error' | 'unsupported';
      message: string;
      status?: number;
    };

export interface WireProviderUsageResponse {
  providers: WireProviderUsageItem[];
}

// ---------------------------------------------------------------------------
// Auth wire DTOs — REAL endpoints (GET /api/v1/auth, POST/GET/DELETE /api/v1/oauth/login, POST /api/v1/oauth/logout)
// ---------------------------------------------------------------------------

export interface WireManagedProvider {
  status: string;
  [key: string]: unknown;
}

export interface WireAuthResult {
  ready: boolean;
  providers_count: number;
  default_model: string | null;
  managed_provider: WireManagedProvider | null;
}

// `POST /oauth/login` returns one of two shapes, discriminated by `status`:
//   - `pending`: a real device-code flow was started; all device fields are
//     populated so the client can render the device-code step and poll.
//   - `authenticated`: the toolkit already had a usable token and short-
//     circuited via its `ensureFresh` fast path, so no device code was
//     issued; the client can skip the device-code step and treat the login
//     as already complete.
interface WireOAuthLoginStartPending {
  flow_id: string;
  provider: string;
  status: 'pending';
  verification_uri: string;
  verification_uri_complete: string;
  user_code: string;
  expires_in: number;
  interval: number;
  expires_at: string;
}

interface WireOAuthLoginStartAuthenticated {
  flow_id: string;
  provider: string;
  status: 'authenticated';
}

export type WireOAuthLoginStartResult =
  | WireOAuthLoginStartPending
  | WireOAuthLoginStartAuthenticated;

export interface WireOAuthLoginPollResult {
  flow_id: string;
  status: 'pending' | 'authenticated' | 'expired' | 'cancelled';
  resolved_at?: string;
}

export interface WireOAuthCancelResult {
  cancelled: boolean;
  status: string;
}

export interface WireLogoutResult {
  logged_out: boolean;
}

// ---------------------------------------------------------------------------
// File upload wire DTOs
// ---------------------------------------------------------------------------

export interface WireFileMeta {
  id: string;
  name: string;
  media_type: string;
  size: number;
  created_at: string;
  expires_at?: string;
}

// ---------------------------------------------------------------------------
// WS Server frames (S→C)
// ---------------------------------------------------------------------------

/** All typed server-to-client WS frames */
export type WireServerFrame =
  | WireServerHello
  | WireAck
  | WirePing
  | WireResyncRequired
  | WireErrorFrame
  | WireEvent;

export interface WireServerHello {
  type: 'server_hello';
  timestamp: string;
  payload: {
    server_id: string;
    /** Advisory only — kap-server omits this since it sends no heartbeat. */
    heartbeat_ms?: number;
    max_event_buffer_size: number;
    capabilities: {
      event_batching: boolean;
      compression: boolean;
    };
  };
}

export interface WireAck {
  type: 'ack';
  id: string;
  code: number;
  msg: string;
  payload: unknown;
}

export interface WirePing {
  type: 'ping';
  timestamp: string;
  payload: { nonce: string };
}

export interface WireResyncRequired {
  type: 'resync_required';
  timestamp: string;
  payload: {
    session_id: string;
    reason: 'buffer_overflow' | 'session_recreated' | 'epoch_changed';
    current_seq: number;
    /** Current journal epoch — adopt it after resyncing (v2 sync protocol). */
    epoch?: string;
  };
}

// ---------------------------------------------------------------------------
// v2 sync protocol: cursors + session snapshot
// ---------------------------------------------------------------------------

/** Per-session sync cursor: durable seq + journal epoch. */
export interface WireSessionCursor {
  seq: number;
  epoch?: string;
}

export interface WireInFlightToolCall {
  tool_call_id: string;
  name: string;
  args?: unknown;
  description?: string;
  display?: unknown;
  last_progress?: {
    kind: 'stdout' | 'stderr' | 'progress' | 'status' | 'custom';
    text?: string;
    percent?: number;
  };
}

export interface WireInFlightTurn {
  turn_id: number;
  assistant_text: string;
  thinking_text: string;
  running_tools: WireInFlightToolCall[];
  current_prompt_id?: string;
}

/** `GET /sessions/{sid}/snapshot` — atomic rebuild state at a watermark. */
export interface WireSessionSnapshot {
  as_of_seq: number;
  epoch: string;
  session: WireSession;
  messages: { items: WireMessage[]; has_more: boolean };
  in_flight_turn: WireInFlightTurn | null;
  /** Live subagent roster at the watermark (absent on older servers). */
  subagents?: WireTask[];
  pending_approvals: WireApprovalRequest[];
  pending_questions: WireQuestionRequest[];
}

export interface WireSessionAbortResult {
  aborted: boolean;
}

export interface WireErrorFrame {
  type: 'error';
  timestamp: string;
  payload: {
    code: number;
    msg: string;
    fatal: boolean;
    request_id?: string;
    details?: unknown;
  };
}

// ---------------------------------------------------------------------------
// WS Client control messages (C→S)
// ---------------------------------------------------------------------------

export type WireClientControl =
  | WireClientHello
  | WireSubscribe
  | WireUnsubscribe
  | WireAbort
  | WirePong;

export interface WireClientHello {
  type: 'client_hello';
  id: string;
  payload: {
    client_id: string;
    subscriptions: string[];
    cursors?: Record<string, WireSessionCursor>;
  };
}

export interface WireSubscribe {
  type: 'subscribe';
  id: string;
  payload: {
    session_ids: string[];
    cursors?: Record<string, WireSessionCursor>;
  };
}

export interface WireUnsubscribe {
  type: 'unsubscribe';
  id: string;
  payload: { session_ids: string[] };
}

export interface WireAbort {
  type: 'abort';
  id: string;
  payload: {
    session_id: string;
    prompt_id: string;
  };
}

export interface WirePong {
  type: 'pong';
  payload: { nonce: string };
}

// ---------------------------------------------------------------------------
// WS Events (S→C) — all type: "event.*"
// ---------------------------------------------------------------------------

/** Base shape for all WS event frames */
interface WireEventBase<T extends string, P> {
  type: T;
  seq: number;
  session_id: string;
  timestamp: string;
  payload: P;
}

// Session lifecycle
type WireEventSessionCreated = WireEventBase<'event.session.created', { session: WireSession }>;
type WireEventSessionUpdated = WireEventBase<'event.session.updated', { session: WireSession; changed_fields: string[] }>;
type WireEventSessionDeleted = WireEventBase<'event.session.deleted', { session_id: string }>;
type WireEventSessionWorkChanged = WireEventBase<'event.session.work_changed', {
  busy: boolean;
  main_turn_active?: boolean;
  pending_interaction?: 'none' | 'approval' | 'question';
  last_turn_reason?: 'completed' | 'cancelled' | 'failed';
}>;
/** @deprecated Old journals may still carry this; mapped onto busy for replay. */
type WireEventSessionStatusChanged = WireEventBase<'event.session.status_changed', {
  status: WireSessionStatus;
  previous_status: WireSessionStatus;
  current_prompt_id?: string;
}>;
type WireEventSessionUsageUpdated = WireEventBase<'event.session.usage_updated', {
  usage: WireSessionUsage;
  delta: WireSessionUsageDelta;
}>;
type WireEventSessionHistoryCompacted = WireEventBase<'event.session.history_compacted', {
  before_seq: number;
  reason: 'auto_compact' | 'manual_compact' | 'history_rewrite';
  summary_message_id?: string;
}>;
type WireEventResearchUpdated = WireEventBase<'event.research.updated', {
  snapshot: WireResearchStatusSnapshot;
}>;

// Workspace lifecycle (global — not session-scoped)
type WireEventWorkspaceCreated = WireEventBase<'event.workspace.created', { workspace: WireWorkspace }>;
type WireEventWorkspaceUpdated = WireEventBase<'event.workspace.updated', { workspace: WireWorkspace }>;
type WireEventWorkspaceDeleted = WireEventBase<'event.workspace.deleted', { workspace_id: string; root: string }>;

// Message lifecycle
type WireEventMessageCreated = WireEventBase<'event.message.created', { message: WireMessage }>;
type WireEventMessageUpdated = WireEventBase<'event.message.updated', {
  message_id: string;
  content: WireMessageContent[];
  status: 'pending' | 'completed' | 'error';
}>;

// Assistant streaming
type WireEventAssistantDelta = WireEventBase<'event.assistant.delta', {
  message_id: string;
  content_index: number;
  delta: { text?: string; thinking?: string };
}>;
// No-op-but-known streaming events (advance lastSeq, no UI change)
type WireEventAssistantToolUseStarted = WireEventBase<'event.assistant.tool_use_started', {
  message_id: string;
  tool_call_id: string;
  tool_name: string;
  content_index: number;
}>;
type WireEventAssistantToolUseDelta = WireEventBase<'event.assistant.tool_use_delta', {
  message_id: string;
  tool_call_id: string;
  input_delta: string;
}>;
type WireEventAssistantToolUseCompleted = WireEventBase<'event.assistant.tool_use_completed', {
  message_id: string;
  tool_call_id: string;
  input: unknown;
}>;
type WireEventAssistantCompleted = WireEventBase<'event.assistant.completed', {
  message_id: string;
  finish_reason: 'stop' | 'tool_use' | 'length' | 'cancelled' | 'error';
}>;

// Tool execution (no-op-but-known)
type WireEventToolStarted = WireEventBase<'event.tool.started', {
  tool_call_id: string;
  tool_name: string;
  input: unknown;
  parent_message_id: string;
}>;
type WireEventToolOutput = WireEventBase<'event.tool.output', {
  tool_call_id: string;
  chunk: string;
  stream: 'stdout' | 'stderr';
}>;
type WireEventToolProgress = WireEventBase<'event.tool.progress', {
  tool_call_id: string;
  progress: number;
  message?: string;
}>;
type WireEventToolCompleted = WireEventBase<'event.tool.completed', {
  tool_call_id: string;
  output: unknown;
  is_error: boolean;
  duration_ms: number;
}>;

// Approval
type WireEventApprovalRequested = WireEventBase<'event.approval.requested', WireApprovalRequest>;
type WireEventApprovalResolved = WireEventBase<'event.approval.resolved', {
  approval_id: string;
  decision: 'approved' | 'rejected' | 'cancelled';
  scope?: 'session';
  feedback?: string;
  selected_label?: string;
  resolved_by: string;
  resolved_at: string;
}>;
type WireEventApprovalExpired = WireEventBase<'event.approval.expired', { approval_id: string }>;

// Question
type WireEventQuestionRequested = WireEventBase<'event.question.requested', WireQuestionRequest>;
type WireEventQuestionAnswered = WireEventBase<'event.question.answered', {
  question_id: string;
  answers: Record<string, WireQuestionAnswer>;
  method?: string;
  note?: string;
  resolved_by: string;
  resolved_at: string;
}>;
type WireEventQuestionDismissed = WireEventBase<'event.question.dismissed', {
  question_id: string;
  dismissed_by: string;
  dismissed_at: string;
}>;
// Tasks
type WireEventTaskCreated = WireEventBase<'event.task.created', { task: WireTask }>;
type WireEventTaskProgress = WireEventBase<'event.task.progress', {
  task_id: string;
  output_chunk: string;
  stream: 'stdout' | 'stderr';
}>;
type WireEventTaskCompleted = WireEventBase<'event.task.completed', {
  task_id: string;
  status: WireTaskStatus;
  output_preview?: string;
  output_bytes?: number;
}>;

type WireEventConfigChanged = WireEventBase<'event.config.changed', {
  /** Core v2 emits camelCase; legacy servers used snake_case. */
  changedFields?: string[];
  changed_fields?: string[];
  config: WireConfig;
}>;

type WireEventModelCatalogChanged = WireEventBase<'event.model_catalog.changed', {
  changed: Array<{
    provider_id: string;
    provider_name: string;
    added: number;
    removed: number;
  }>;
  unchanged: string[];
  failed: Array<{ provider: string; reason: string }>;
}>;

/** Catch-all for unrecognised event frames — keeps lastSeq advancing without warnings */
type WireEventUnknown = { type: string; seq: number; session_id: string; timestamp: string; payload: unknown };

/**
 * Union of all WS event frames the client will process.
 * Visible events (UI updates) + no-op-but-known events (lastSeq only).
 * The catch-all at the end handles future server events gracefully.
 */
export type WireEvent =
  // Session lifecycle
  | WireEventSessionCreated
  | WireEventSessionUpdated
  | WireEventSessionDeleted
  | WireEventSessionWorkChanged
  | WireEventSessionStatusChanged
  | WireEventSessionUsageUpdated
  | WireEventSessionHistoryCompacted
  | WireEventResearchUpdated
  // Workspace lifecycle
  | WireEventWorkspaceCreated
  | WireEventWorkspaceUpdated
  | WireEventWorkspaceDeleted
  // Message lifecycle
  | WireEventMessageCreated
  | WireEventMessageUpdated
  // Assistant streaming
  | WireEventAssistantDelta
  | WireEventAssistantToolUseStarted
  | WireEventAssistantToolUseDelta
  | WireEventAssistantToolUseCompleted
  | WireEventAssistantCompleted
  // Tool execution
  | WireEventToolStarted
  | WireEventToolOutput
  | WireEventToolProgress
  | WireEventToolCompleted
  // Approval
  | WireEventApprovalRequested
  | WireEventApprovalResolved
  | WireEventApprovalExpired
  // Question
  | WireEventQuestionRequested
  | WireEventQuestionAnswered
  | WireEventQuestionDismissed
  // Tasks
  | WireEventTaskCreated
  | WireEventTaskProgress
  | WireEventTaskCompleted
  // Config
  | WireEventConfigChanged
  | WireEventModelCatalogChanged
  // Unknown / future events
  | WireEventUnknown;
