import type {
  AitpMaintenanceDegradedReason,
  ResearchActionStatus,
  ResearchAlert,
  ResearchAlertClassification,
  ResearchAlertKind,
  ResearchNextStepFreshness,
  ResearchNextStepSource,
  ResearchRunStage,
  ResearchSchedulerState,
  ResearchStatusSnapshot,
} from '../api/types';

export interface ResearchBoardGoalSlot {
  kind: 'goal';
  text: string;
}

type ResearchBoardAttentionValue =
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
    };

export type ResearchBoardAttentionSlot = {
  kind: 'attention';
  additionalCount: number;
} & ResearchBoardAttentionValue;

export type ResearchBoardNowSlot =
  | {
      kind: 'now';
      source: 'run';
      text: string;
      stage: ResearchRunStage;
      schedulerState: ResearchSchedulerState;
    }
  | {
      kind: 'now';
      source: 'action';
      text: string;
      status: Extract<ResearchActionStatus, 'planned' | 'in_progress'>;
    }
  | {
      kind: 'now';
      source: 'progress' | 'question' | 'state_change' | 'line';
      text: string;
    };

export interface ResearchBoardNextSlot {
  kind: 'next';
  source: ResearchNextStepSource | 'progress' | 'focus';
  text: string;
  freshness?: ResearchNextStepFreshness;
}

export type ResearchBoardCompactSlot =
  | ResearchBoardGoalSlot
  | ResearchBoardAttentionSlot
  | ResearchBoardNowSlot
  | ResearchBoardNextSlot;

export interface ResearchBoardExpandedRecord {
  period: ResearchStatusSnapshot['period'];
  plan: ResearchStatusSnapshot['researchPlan'];
  status: ResearchStatusSnapshot['status'];
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
  if (questionId === undefined) return snapshot.currentQuestion;
  return snapshot.questions.find((question) => question.id === questionId)
    ?? snapshot.currentQuestion;
}

function goalSlot(snapshot: ResearchStatusSnapshot): ResearchBoardGoalSlot | undefined {
  const text = presentText(snapshot.program?.goalText);
  return text === undefined ? undefined : { kind: 'goal', text };
}

function attentionSlot(
  snapshot: ResearchStatusSnapshot,
): ResearchBoardAttentionSlot | undefined {
  const candidates: ResearchBoardAttentionValue[] = [];
  const goalAlignment = snapshot.goalAlignment;
  if (
    snapshot.goalSummary?.status === 'active'
    && goalAlignment !== undefined
    && goalAlignment.status !== 'aligned'
  ) {
    candidates.push({ source: 'alignment', text: goalAlignment.reason });
  }
  const humanGateText = snapshot.humanGate?.resolvedAt === undefined
    ? presentText(snapshot.humanGate?.prompt)
    : undefined;
  if (humanGateText !== undefined) {
    candidates.push({ source: 'human_gate', text: humanGateText });
  }

  const activeAlerts = snapshot.alerts
    .filter((alert) =>
      (alert.state === undefined || alert.state === 'active')
      && alert.acknowledgedAt === undefined)
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

function nowSlot(snapshot: ResearchStatusSnapshot): ResearchBoardNowSlot | undefined {
  const run = [snapshot.currentRun, snapshot.currentAction?.run]
    .find((candidate) => candidate !== undefined && runIsActive(candidate));
  if (run !== undefined) {
    return {
      kind: 'now',
      source: 'run',
      text: `${run.campaign} / ${run.jobId}`,
      stage: run.stage,
      schedulerState: run.schedulerState,
    };
  }

  const action = snapshot.currentAction;
  const actionText = presentText(action?.purpose);
  if (actionText !== undefined
    && (action?.status === 'planned' || action?.status === 'in_progress')) {
    return {
      kind: 'now',
      source: 'action',
      text: actionText,
      status: action.status,
    };
  }

  const progressText = presentText(snapshot.latestProgress?.headline);
  if (progressText !== undefined) {
    return { kind: 'now', source: 'progress', text: progressText };
  }

  const questionText = presentText(focusedQuestion(snapshot)?.wording);
  if (questionText !== undefined) {
    return { kind: 'now', source: 'question', text: questionText };
  }

  const stateChangeText = presentText(snapshot.recentStateChange?.summary);
  if (stateChangeText !== undefined) {
    return { kind: 'now', source: 'state_change', text: stateChangeText };
  }

  const currentLine = snapshot.lines.find(
    (line) => line.slug === snapshot.currentLineSlug,
  );
  const lineText = presentText(currentLine?.title)
    ?? presentText(snapshot.currentLineSlug);
  return lineText === undefined
    ? undefined
    : { kind: 'now', source: 'line', text: lineText };
}

function nextSlot(snapshot: ResearchStatusSnapshot): ResearchBoardNextSlot | undefined {
  const effectiveNextStep = snapshot.effectiveNextStep;
  const effectiveText = presentText(effectiveNextStep?.text);
  if (effectiveText !== undefined && effectiveNextStep !== undefined) {
    return {
      kind: 'next',
      source: effectiveNextStep.source,
      text: effectiveText,
      freshness: effectiveNextStep.freshness,
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
    goalSlot(snapshot),
    attentionSlot(snapshot),
    nowSlot(snapshot),
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
    period: snapshot.period,
    plan: snapshot.researchPlan,
    status: snapshot.status,
  };
}
