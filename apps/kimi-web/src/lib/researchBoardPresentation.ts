import type {
  AitpMaintenanceDegradedReason,
  ResearchActionStatus,
  ResearchAlert,
  ResearchAlertClassification,
  ResearchAlertKind,
  ResearchLineWorkstreamAlignment,
  ResearchLineWorkstreamBindingStatus,
  ResearchNextStepFreshness,
  ResearchNextStepSource,
  ResearchRunStage,
  ResearchSchedulerState,
  ResearchStatusSnapshot,
} from '../api/types';

export interface ResearchWorkstreamBindingPresentation {
  lineSlug: string;
  status: ResearchLineWorkstreamBindingStatus;
  reason: string;
  workstream?: string;
  topicId?: string;
  observedRevision?: number;
  confirmedBy?: 'user' | 'main_agent';
  confirmedAt?: number;
  variant: 'neutral' | 'success' | 'warning' | 'danger';
}

export function presentResearchWorkstreamBinding(
  alignment: ResearchLineWorkstreamAlignment | undefined,
): ResearchWorkstreamBindingPresentation | undefined {
  if (alignment === undefined) return undefined;
  const variant = alignment.status === 'bound'
    ? 'success'
    : alignment.status === 'conflict'
      ? 'danger'
      : alignment.status === 'stale'
        ? 'warning'
        : 'neutral';
  return {
    lineSlug: alignment.lineSlug,
    status: alignment.status,
    reason: alignment.reason,
    workstream: alignment.binding?.workstream,
    topicId: alignment.binding?.topicId,
    observedRevision: alignment.binding?.observedRevision,
    confirmedBy: alignment.binding?.confirmedBy,
    confirmedAt: alignment.binding?.confirmedAt,
    variant,
  };
}

export interface ResearchBoardProjectSlot {
  kind: 'project';
  goalStatus?: NonNullable<ResearchStatusSnapshot['goalSummary']>['status'];
  goalContinuationState?: NonNullable<
    NonNullable<ResearchStatusSnapshot['researchGoal']>['continuation']
  >['state'];
  goalContinuationAvailable?: boolean;
  planStatus?: NonNullable<ResearchStatusSnapshot['researchPlanV2']>['status'];
  milestone?: string;
  line?: string;
  question?: string;
  questionWorkflow?: NonNullable<ResearchStatusSnapshot['currentQuestion']>['workflow'];
  questionEpistemic?: NonNullable<ResearchStatusSnapshot['currentQuestion']>['epistemic'];
}

export type ResearchBoardCycleStage =
  | 'frame_hypothesis'
  | 'test_action'
  | 'evaluate'
  | 'record'
  | 'next_ready';

export interface ResearchBoardCycleSlot {
  kind: 'cycle';
  stage: ResearchBoardCycleStage;
  researchTurns?: number;
  mode: ResearchStatusSnapshot['mode'];
  loopStatus: ResearchStatusSnapshot['loopStatus'];
  planningPolicy: ResearchStatusSnapshot['planningPolicy'];
  continuationState?: NonNullable<
    NonNullable<ResearchStatusSnapshot['researchGoal']>['continuation']
  >['state'];
  continuationAvailable?: boolean;
  actionStatus?: ResearchActionStatus | 'recovery_required';
  current?: ResearchBoardCycleCurrent;
}

export type ResearchBoardCycleCurrent =
  | {
      source: 'run';
      text: string;
      stage: ResearchRunStage;
      schedulerState: ResearchSchedulerState;
    }
  | {
      source: 'action';
      text: string;
      status: Extract<ResearchActionStatus, 'planned' | 'in_progress'>;
    }
  | {
      source: 'progress' | 'question' | 'state_change' | 'line';
      text: string;
    };

type ResearchBoardAttentionValue =
  | {
      source: 'goal_continuation';
      text: string;
      owner?: string;
    }
  | {
      source: 'alignment';
      text: string;
    }
  | {
      source: 'human_gate';
      text: string;
    }
  | {
      source: 'maintenance';
      text: AitpMaintenanceDegradedReason;
    }
  | {
      source: 'alert';
      text: string;
      alertKind: ResearchAlertKind;
    }
  | {
      source: 'adapter';
      text: string;
    }
  | {
      source: 'distillation';
      text: string;
    }
  | {
      source: 'action_recovery';
      text: string;
    }
  | {
      source: 'checkpoint';
      text: string;
    }
  | {
      source: 'workstream';
      text: string;
    };

export type ResearchBoardAttentionSlot = {
  kind: 'attention';
  additionalCount: number;
} & ResearchBoardAttentionValue;

export interface ResearchBoardNextSlot {
  kind: 'next';
  source: ResearchNextStepSource | 'progress' | 'focus';
  text: string;
  freshness?: ResearchNextStepFreshness;
  observedAt?: number;
  derivedFrom?: NonNullable<ResearchStatusSnapshot['effectiveNextStep']>['derivedFrom'];
}

export type ResearchBoardCompactSlot =
  | ResearchBoardProjectSlot
  | ResearchBoardCycleSlot
  | ResearchBoardAttentionSlot
  | ResearchBoardNextSlot;

export interface ResearchBoardExpandedRecord {
  planningPolicy: ResearchStatusSnapshot['planningPolicy'];
  period: ResearchStatusSnapshot['period'];
  plan: ResearchStatusSnapshot['researchPlan'];
  actionPlan: ResearchStatusSnapshot['actionPlan'];
  researchPlanV2: ResearchStatusSnapshot['researchPlanV2'];
  status: ResearchStatusSnapshot['status'];
  distillationAttention: ResearchStatusSnapshot['distillationAttention'];
}

function presentText(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text === '' ? undefined : text;
}

export function presentResearchAlertClassification(
  alert: ResearchAlert,
): ResearchAlertClassification {
  return alert.classification ?? (alert.kind === 'blocked' ? 'active_blocker' : 'warning');
}

function focusedQuestion(snapshot: ResearchStatusSnapshot) {
  const questionId = snapshot.currentFocus?.questionId;
  const question = questionId === undefined
    ? snapshot.currentQuestion
    : snapshot.questions.find((candidate) => candidate.id === questionId)
      ?? snapshot.currentQuestion;
  return question?.lineSlug === snapshot.currentLineSlug ? question : undefined;
}

function currentAction(snapshot: ResearchStatusSnapshot) {
  const action = snapshot.currentAction;
  if (action === undefined) return undefined;
  const question = action.questionId === undefined
    ? undefined
    : snapshot.questions.find((candidate) => candidate.id === action.questionId);
  if (
    action.lineSlug !== undefined &&
    question !== undefined &&
    action.lineSlug !== question.lineSlug
  ) return undefined;
  const lineSlug = action.lineSlug ?? question?.lineSlug;
  if (snapshot.currentLineSlug === undefined) {
    return lineSlug === undefined && snapshot.lines.length <= 1 ? action : undefined;
  }
  if (lineSlug !== undefined) return lineSlug === snapshot.currentLineSlug ? action : undefined;
  return snapshot.lines.length === 0 ||
    (snapshot.lines.length === 1 && snapshot.lines[0]?.slug === snapshot.currentLineSlug)
    ? action
    : undefined;
}

function currentRun(snapshot: ResearchStatusSnapshot) {
  const action = currentAction(snapshot);
  if (action === undefined) return snapshot.lines.length <= 1 ? snapshot.currentRun : undefined;
  if (action.run?.actionId === action.actionId) return action.run;
  return snapshot.currentRun?.actionId === action.actionId ? snapshot.currentRun : undefined;
}

function currentHumanGate(snapshot: ResearchStatusSnapshot) {
  const gate = snapshot.humanGate;
  if (gate === undefined) return undefined;
  const action = currentAction(snapshot);
  if (gate.actionId !== undefined && gate.actionId !== action?.actionId) return undefined;
  if (gate.questionId !== undefined) {
    const question = snapshot.questions.find((candidate) => candidate.id === gate.questionId);
    if (question === undefined || question.lineSlug !== snapshot.currentLineSlug) return undefined;
  }
  return gate;
}

function actionNeedsRecovery(snapshot: ResearchStatusSnapshot): boolean {
  const action = currentAction(snapshot);
  if (action === undefined || (action.status !== 'planned' && action.status !== 'in_progress')) {
    return false;
  }
  const gate = currentHumanGate(snapshot);
  if (gate !== undefined && gate.resolvedAt === undefined) return false;
  if (
    snapshot.effectiveNextStep?.source === 'research_action' &&
    snapshot.effectiveNextStep.freshness === 'blocked' &&
    snapshot.effectiveNextStep.derivedFrom.actionId === action.actionId
  ) return true;
  return action.status === 'planned'
    ? snapshot.phase !== 'action_planned'
    : snapshot.phase !== 'action_executing';
}

function projectSlot(snapshot: ResearchStatusSnapshot): ResearchBoardProjectSlot {
  const goal = snapshot.researchGoal ?? snapshot.goalSummary;
  const plan = snapshot.researchPlanV2;
  const milestone = plan?.milestones.find((candidate) =>
    candidate.milestoneId === plan.currentMilestoneId);
  const line = snapshot.lines.find((candidate) => candidate.slug === snapshot.currentLineSlug);
  const question = focusedQuestion(snapshot);
  return {
    kind: 'project',
    goalStatus: goal?.status,
    goalContinuationState: goal?.continuation?.state,
    goalContinuationAvailable: goal === undefined ? undefined : goal.continuation !== undefined,
    planStatus: plan?.status,
    milestone: presentText(milestone?.title) ?? presentText(plan?.currentMilestoneId),
    line: presentText(line?.title) ?? presentText(snapshot.currentLineSlug),
    question: presentText(question?.wording),
    questionWorkflow: question?.workflow,
    questionEpistemic: question?.epistemic,
  };
}

function cycleStage(snapshot: ResearchStatusSnapshot): ResearchBoardCycleStage {
  switch (snapshot.phase) {
    case 'orienting':
    case 'gap_analysis':
      return 'frame_hypothesis';
    case 'action_planned':
    case 'action_executing':
      return 'test_action';
    case 'evaluating':
      return 'evaluate';
    case 'state_updated':
    case 'checkpoint_pending':
      return 'record';
    case 'awaiting_human':
      if (snapshot.pendingCheckpoint !== undefined) return 'record';
      if (currentAction(snapshot) !== undefined) return 'test_action';
      return 'frame_hypothesis';
    case 'idle':
      return 'next_ready';
  }
}

function cycleSlot(snapshot: ResearchStatusSnapshot): ResearchBoardCycleSlot {
  const action = currentAction(snapshot);
  const goal = snapshot.researchGoal ?? snapshot.goalSummary;
  return {
    kind: 'cycle',
    stage: cycleStage(snapshot),
    researchTurns: snapshot.period?.loopCount,
    mode: snapshot.mode,
    loopStatus: snapshot.loopStatus,
    planningPolicy: snapshot.planningPolicy,
    continuationState: goal?.continuation?.state,
    continuationAvailable: goal === undefined ? undefined : goal.continuation !== undefined,
    actionStatus: actionNeedsRecovery(snapshot)
      ? 'recovery_required'
      : action?.status === 'planned' || action?.status === 'in_progress'
        ? action.status
        : undefined,
    current: cycleCurrent(snapshot),
  };
}

function attentionSlot(
  snapshot: ResearchStatusSnapshot,
): ResearchBoardAttentionSlot | undefined {
  const candidates: ResearchBoardAttentionValue[] = [];
  const continuationGoal = snapshot.researchGoal ?? snapshot.goalSummary;
  const continuation = continuationGoal?.continuation;
  if (continuationGoal?.status === 'active' && continuation?.state === 'held') {
    const text = presentText(continuation.reason) ?? 'Automatic continuation is held.';
    candidates.push({
      source: 'goal_continuation',
      text,
      ...(continuation.owner === undefined ? {} : { owner: continuation.owner }),
    });
  }
  const humanGate = currentHumanGate(snapshot);
  const humanGateText = humanGate?.resolvedAt === undefined
    ? presentText(humanGate?.prompt)
    : undefined;
  if (humanGateText !== undefined) {
    candidates.push({ source: 'human_gate', text: humanGateText });
  }
  if (actionNeedsRecovery(snapshot)) {
    const action = currentAction(snapshot)!;
    const projected = currentEffectiveNextStep(snapshot);
    candidates.push({
      source: 'action_recovery',
      text: projected?.source === 'research_action' && projected.freshness === 'blocked'
        ? projected.text
        : `Action ${action.actionId} is ${action.status} while the Research phase is ${snapshot.phase}; conclude or abandon it before starting another action.`,
    });
  }
  if (snapshot.pendingCheckpoint !== undefined) {
    candidates.push({
      source: 'checkpoint',
      text: `Checkpoint ${snapshot.pendingCheckpoint.checkpointId} must be committed or its proposal undone before automatic continuation.`,
    });
  }
  const goalAlignment = snapshot.goalAlignment;
  if (
    (snapshot.researchGoal?.status ?? snapshot.goalSummary?.status) === 'active'
    && goalAlignment !== undefined
    && goalAlignment.status !== 'aligned'
  ) {
    candidates.push({ source: 'alignment', text: goalAlignment.reason });
  }
  const distillation = snapshot.distillationAttention;
  if (distillation?.status === 'handoff_unavailable') {
    candidates.push({
      source: 'distillation',
      text: `Entry ${distillation.entryId}: ${distillation.reason}`,
    });
  }

  const activeAlerts = snapshot.alerts
    .filter((alert) =>
      (alert.state === undefined || alert.state === 'active')
      && alert.acknowledgedAt === undefined)
    .filter((alert) =>
      alert.lineSlug === undefined || alert.lineSlug === snapshot.currentLineSlug)
    .toSorted((left, right) => {
      const rank = (classification: typeof left.classification): number => {
        if (classification === 'active_blocker') return 0;
        if (classification === 'warning' || classification === undefined) return 1;
        if (classification === 'historical_unresolved') return 2;
        return 3;
      };
      return rank(presentResearchAlertClassification(left))
        - rank(presentResearchAlertClassification(right))
        || left.createdAt - right.createdAt;
    });
  const currentBlockers = activeAlerts.filter(
    (alert) => presentResearchAlertClassification(alert) === 'active_blocker',
  );
  for (const alert of currentBlockers) {
    const text = presentText(alert.message);
    if (text !== undefined) {
      candidates.push({ source: 'alert', text, alertKind: alert.kind });
    }
  }

  const degradedReason = snapshot.aitpMaintenance?.degradedReason;
  if (degradedReason !== undefined) {
    candidates.push({ source: 'maintenance', text: degradedReason });
  }

  for (const alert of activeAlerts) {
    if (presentResearchAlertClassification(alert) === 'active_blocker') continue;
    const text = presentText(alert.message);
    if (text !== undefined) {
      candidates.push({ source: 'alert', text, alertKind: alert.kind });
    }
  }

  const adapterError = presentText(snapshot.aitpHealth.lastError);
  if (adapterError !== undefined) {
    candidates.push({ source: 'adapter', text: adapterError });
  }

  if (
    snapshot.currentLineSlug !== undefined
    && snapshot.currentWorkstreamBinding?.status !== 'bound'
  ) {
    candidates.push({
      source: 'workstream',
      text: snapshot.currentWorkstreamBinding?.reason
        ?? 'Confirm an explicit Line-to-workstream binding before scoped persistence.',
    });
  }

  const [primary] = candidates;
  if (primary === undefined) return undefined;
  return {
    kind: 'attention',
    ...primary,
    additionalCount: candidates.length - 1,
  };
}

function runIsActive(
  run: NonNullable<ResearchStatusSnapshot['currentRun']>,
): boolean {
  if (run.terminalState !== undefined) return false;
  if (run.schedulerState === 'completed'
    || run.schedulerState === 'failed'
    || run.schedulerState === 'cancelled') {
    return false;
  }
  if (run.stage === 'completed' || run.stage === 'failed') return false;
  return run.schedulerState === 'pending'
    || run.schedulerState === 'running'
    || run.stage === 'queued'
    || run.stage === 'running'
    || run.stage === 'scf'
    || run.stage === 'band'
    || run.stage === 'analyzing';
}

function cycleCurrent(snapshot: ResearchStatusSnapshot): ResearchBoardCycleCurrent | undefined {
  const actionRecoveryRequired = actionNeedsRecovery(snapshot);
  const action = currentAction(snapshot);
  const run = (actionRecoveryRequired ? [] : [currentRun(snapshot)])
    .find((candidate) => candidate !== undefined && runIsActive(candidate));
  if (run !== undefined) {
    return {
      source: 'run',
      text: `${run.campaign} / ${run.jobId}`,
      stage: run.stage,
      schedulerState: run.schedulerState,
    };
  }

  const actionText = presentText(action?.purpose);
  if (!actionRecoveryRequired && actionText !== undefined
    && (action?.status === 'planned' || action?.status === 'in_progress')) {
    return {
      source: 'action',
      text: actionText,
      status: action.status,
    };
  }

  const progressText = presentText(snapshot.latestProgress?.headline);
  if (progressText !== undefined) {
    return { source: 'progress', text: progressText };
  }

  const questionText = presentText(focusedQuestion(snapshot)?.wording);
  if (questionText !== undefined) {
    return { source: 'question', text: questionText };
  }

  const stateChangeText = presentText(snapshot.recentStateChange?.summary);
  if (stateChangeText !== undefined) {
    return { source: 'state_change', text: stateChangeText };
  }

  const currentLine = snapshot.lines.find(
    (line) => line.slug === snapshot.currentLineSlug,
  );
  const lineText = presentText(currentLine?.title)
    ?? presentText(snapshot.currentLineSlug);
  return lineText === undefined
    ? undefined
    : { source: 'line', text: lineText };
}

function currentEffectiveNextStep(snapshot: ResearchStatusSnapshot) {
  const step = snapshot.effectiveNextStep;
  if (step === undefined) return undefined;
  const derived = step.derivedFrom;
  if (derived.lineSlug !== undefined && derived.lineSlug !== snapshot.currentLineSlug) {
    return undefined;
  }
  if (derived.questionId !== undefined) {
    const question = snapshot.questions.find((candidate) => candidate.id === derived.questionId);
    if (question === undefined || question.lineSlug !== snapshot.currentLineSlug) return undefined;
  }
  if (derived.actionId !== undefined && currentAction(snapshot)?.actionId !== derived.actionId) {
    return undefined;
  }
  return step;
}

function nextSlot(snapshot: ResearchStatusSnapshot): ResearchBoardNextSlot | undefined {
  if (actionNeedsRecovery(snapshot)) {
    const action = currentAction(snapshot)!;
    const projected = currentEffectiveNextStep(snapshot);
    if (
      projected?.source === 'research_action' &&
      projected.freshness === 'blocked' &&
      projected.derivedFrom.actionId === action.actionId
    ) {
      return {
        kind: 'next',
        source: projected.source,
        text: projected.text,
        freshness: projected.freshness,
        observedAt: projected.observedAt,
        derivedFrom: projected.derivedFrom,
      };
    }
    return {
      kind: 'next',
      source: 'research_action',
      text: `Recover action ${action.actionId}: it is ${action.status} while the Research phase is ${snapshot.phase}; conclude or abandon it before starting another action.`,
      freshness: 'blocked',
      observedAt: action.createdAt,
      derivedFrom: {
        actionId: action.actionId,
        questionId: action.questionId,
        lineSlug: action.lineSlug,
      },
    };
  }
  const effectiveNextStep = currentEffectiveNextStep(snapshot);
  const effectiveText = presentText(effectiveNextStep?.text);
  if (effectiveText !== undefined && effectiveNextStep !== undefined) {
    return {
      kind: 'next',
      source: effectiveNextStep.source,
      text: effectiveText,
      freshness: effectiveNextStep.freshness,
      observedAt: effectiveNextStep.observedAt,
      derivedFrom: effectiveNextStep.derivedFrom,
    };
  }

  const progressText = presentText(snapshot.latestProgress?.nextAction);
  if (progressText !== undefined) {
    return { kind: 'next', source: 'progress', text: progressText };
  }

  const questionText = presentText(focusedQuestion(snapshot)?.nextBoundedAction);
  if (questionText !== undefined) {
    return { kind: 'next', source: 'question', text: questionText };
  }

  const focusText = presentText(snapshot.currentFocus?.boundedAction);
  return focusText === undefined
    ? undefined
    : { kind: 'next', source: 'focus', text: focusText };
}

export function buildResearchBoardCompactSlots(
  snapshot: ResearchStatusSnapshot,
): ResearchBoardCompactSlot[] {
  return [
    projectSlot(snapshot),
    cycleSlot(snapshot),
    attentionSlot(snapshot),
    nextSlot(snapshot),
  ].filter((slot): slot is ResearchBoardCompactSlot => slot !== undefined);
}

/**
 * Keep the protocol-owned period, plan, and status records intact for the
 * expanded board. The component renders every field instead of reducing these
 * durable records to another compact summary.
 */
export function selectResearchBoardExpandedRecord(
  snapshot: ResearchStatusSnapshot,
): ResearchBoardExpandedRecord {
  return {
    planningPolicy: snapshot.planningPolicy,
    period: snapshot.period,
    plan: snapshot.researchPlan,
    actionPlan: snapshot.actionPlan,
    researchPlanV2: snapshot.researchPlanV2,
    status: snapshot.status,
    distillationAttention: snapshot.distillationAttention,
  };
}
