/**
 * `aitpResearch` domain — Research Mode injection presenter.
 *
 * Pure formatting + semantic-diff helper for the context injected by
 * `AitpResearchInjection`. `renderResearchInjection` turns a
 * `ResearchStatusSnapshot` plus a Brief/Delta verbosity flag into the string
 * injected into the model context, and `resolveResearchVerbosity` decides,
 * against the previous `InjectionDisclosure`, whether a turn needs a Brief
 * re-statement, a Delta update, or nothing (no semantic change → undefined, so
 * no duplicate text is appended). Brief mode (new turn, prior disclosure
 * missing, or a semantic change in program / Goal milestone / phase / progress
 * / action / run / next step / attention) emits a trimmed scientific summary
 * — the durable Research goal, the Goal-mode execution milestone, current
 * question, phase, action and run digest, latest physical progress digest, the
 * single effective next step, the pending human gate, and only the attention
 * the model must handle. Delta mode (a deferred refresh with only an attention
 * change) emits just that attention. The disclosure carries semantic
 * fingerprints so the next step can deduplicate reliably. No AITP entry / hash
 * / revision / checkpoint id, receipt, checkpoint history, or finding detail
 * leaks.
 * Scope-agnostic.
 */

import type {
  AitpMaintenanceReceipt,
  ResearchActionSpec,
  ResearchAlert,
  ResearchEffectiveNextStep,
  ResearchHumanGate,
  ResearchProgressReport,
  ResearchRunState,
  ResearchPlan,
  ResearchStatusSnapshot,
} from '../types';

export type InjectionVerbosity = 'brief' | 'delta';

export interface InjectionDisclosure {
  readonly verbosity: InjectionVerbosity;
  readonly snapshotRevision: number;
  readonly phase: string;
  readonly progressRecordedAt?: number;
  readonly programFingerprint?: string;
  readonly goalSummaryFingerprint?: string;
  readonly goalAlignmentFingerprint?: string;
  readonly currentQuestionFingerprint?: string;
  readonly currentActionId?: string;
  readonly currentRunFingerprint?: string;
  readonly researchPlanFingerprint?: string;
  readonly nextStepFingerprint?: string;
  readonly attentionFingerprint?: string;
}

export function renderResearchInjection(
  snapshot: ResearchStatusSnapshot,
  verbosity: InjectionVerbosity,
): { readonly content: string; readonly disclosure: InjectionDisclosure } {
  const disclosure: InjectionDisclosure = {
    verbosity,
    snapshotRevision: snapshot.revision,
    phase: snapshot.phase,
    progressRecordedAt: snapshot.latestProgress?.recordedAt,
    programFingerprint: programFingerprint(snapshot),
    goalSummaryFingerprint: goalSummaryFingerprint(snapshot),
    goalAlignmentFingerprint: goalAlignmentFingerprint(snapshot),
    currentQuestionFingerprint: currentQuestionFingerprint(snapshot),
    currentActionId: snapshot.currentAction?.actionId,
    currentRunFingerprint: runFingerprint(snapshot.currentRun),
    researchPlanFingerprint: researchPlanFingerprint(snapshot.researchPlan),
    nextStepFingerprint: nextStepFingerprint(snapshot.effectiveNextStep),
    attentionFingerprint: attentionFingerprint(snapshot),
  };

  const content = verbosity === 'brief'
    ? renderBrief(snapshot)
    : renderDelta(snapshot);

  return { content, disclosure };
}

/**
 * Decide whether the current snapshot needs another injection. A new turn or a
 * missing prior disclosure re-arms a full Brief; otherwise only a semantic
 * change in the research state or the attention the model must handle produces
 * output — no change returns undefined so nothing is appended twice.
 */
export function resolveResearchVerbosity(
  context: {
    readonly isNewTurn: boolean;
    readonly lastDisclosure?: InjectionDisclosure;
  },
  snapshot: ResearchStatusSnapshot,
): InjectionVerbosity | undefined {
  if (context.isNewTurn) return 'brief';
  const last = context.lastDisclosure;
  if (last === undefined) return 'brief';
  if (snapshot.phase !== last.phase) return 'brief';
  if (snapshot.latestProgress?.recordedAt !== last.progressRecordedAt) return 'brief';
  if (programFingerprint(snapshot) !== last.programFingerprint) return 'brief';
  if (goalSummaryFingerprint(snapshot) !== last.goalSummaryFingerprint) return 'brief';
  if (goalAlignmentFingerprint(snapshot) !== last.goalAlignmentFingerprint) return 'brief';
  if (currentQuestionFingerprint(snapshot) !== last.currentQuestionFingerprint) return 'brief';
  if (snapshot.currentAction?.actionId !== last.currentActionId) return 'brief';
  if (runFingerprint(snapshot.currentRun) !== last.currentRunFingerprint) return 'brief';
  if (researchPlanFingerprint(snapshot.researchPlan) !== last.researchPlanFingerprint) return 'brief';
  if (nextStepFingerprint(snapshot.effectiveNextStep) !== last.nextStepFingerprint) return 'brief';
  if (attentionFingerprint(snapshot) !== last.attentionFingerprint) return 'delta';
  return undefined;
}

function renderBrief(snapshot: ResearchStatusSnapshot): string {
  const lines: string[] = [
    '## AITP Research Mode',
    `Phase: ${snapshot.phase} · Loop: ${snapshot.loopStatus}`,
    snapshot.program === undefined
      ? 'AITP Research Goal (observed): not established'
      : `AITP Research Goal (observed): ${snapshot.program.goalText}`,
  ];

  if (snapshot.program !== undefined) {
    lines.push(`  AITP Research Goal source: ${snapshot.program.goalSource}`);
  }

  if (snapshot.goalSummary !== undefined) {
    lines.push(`Hakimi Goal: ${snapshot.goalSummary.objective}`);
    lines.push(`  status: ${snapshot.goalSummary.status}`);
  }

  if (snapshot.goalAlignment !== undefined) {
    lines.push(`Goal alignment: ${snapshot.goalAlignment.status} — ${snapshot.goalAlignment.reason}`);
  }

  lines.push('Local Research Loop: current line/question and bounded action state.');

  const currentQuestion = snapshot.currentQuestion ?? snapshot.questions.find((question) =>
    question.lineSlug === snapshot.currentLineSlug &&
    (question.workflow === 'active' || question.workflow === 'open'),
  );
  if (currentQuestion !== undefined) {
    lines.push(`Current question: ${currentQuestion.wording}`);
    lines.push(
      `  workflow: ${currentQuestion.workflow} · epistemic: ${currentQuestion.epistemic}`,
    );
  }

  if (snapshot.currentAction !== undefined) {
    lines.push(renderActionLine(snapshot.currentAction));
  }
  if (snapshot.researchPlan !== undefined) {
    lines.push(renderResearchPlanDigest(snapshot.researchPlan));
  }
  if (snapshot.currentRun !== undefined) {
    lines.push(renderRunDigest(snapshot.currentRun));
  }

  if (snapshot.latestProgress !== undefined) {
    lines.push(renderProgressDigest(snapshot.latestProgress));
  }

  const humanGate = snapshot.humanGate;
  if (humanGate?.resolvedAt === undefined) {
    if (humanGate !== undefined) lines.push(renderHumanGateBlock(humanGate));
  } else {
    lines.push(renderHumanGateBlock(humanGate));
  }

  const nextStep = snapshot.effectiveNextStep;
  if (nextStep !== undefined) {
    lines.push(`Next: ${nextStep.text}`);
  }

  appendAttention(lines, snapshot);

  lines.push('');
  lines.push('### Research state guidance');
  appendGuidance(lines);

  return lines.join('\n');
}

function renderDelta(snapshot: ResearchStatusSnapshot): string {
  const lines: string[] = [
    `## AITP Research Mode (update)`,
    `Phase: ${snapshot.phase} · Loop: ${snapshot.loopStatus}`,
  ];
  appendAttention(lines, snapshot);
  return lines.join('\n');
}

function appendAttention(lines: string[], snapshot: ResearchStatusSnapshot): void {
  const alerts = activeAlerts(snapshot.alerts);
  if (alerts.length > 0) {
    lines.push('Attention:');
    for (const alert of alerts.slice(0, 3)) {
      lines.push(`  [${alert.kind}] ${alert.message}`);
    }
  }

  const receipt = snapshot.aitpMaintenance;
  if (receipt === undefined) return;
  if (receipt.status === 'degraded') {
    lines.push(receipt.degradedReason === 'workstream_unbound'
      ? 'AITP maintenance: degraded — no research line is bound. Set or switch to a research line to scope current-state maintenance.'
      : 'AITP maintenance: degraded — restore a ready adapter before continuing.');
    return;
  }
  const issues = maintenanceIssues(receipt);
  if (issues.length === 0) return;
  lines.push('AITP maintenance:');
  for (const issue of issues) {
    lines.push(`  - ${issue}`);
  }
}

function maintenanceIssues(receipt: AitpMaintenanceReceipt): readonly string[] {
  const issues: string[] = [];
  if (receipt.activeNewerThanWorkingNote === true) {
    issues.push('Active entries are newer than the latest Working Note; review current state before following the previous handoff.');
  }
  if (receipt.unresolvedFailureCount > 0) {
    issues.push(`${receipt.unresolvedFailureCount} unresolved failure(s).`);
  }
  if (receipt.nextAction !== undefined) {
    issues.push(`Next AITP action: ${receipt.nextAction}`);
  }
  if (receipt.warningSummaries.length > 0) {
    issues.push(`Warnings: ${receipt.warningSummaries.map((warning) => warning.code).join(', ')}`);
  }
  return issues;
}

function renderRunDigest(run: ResearchRunState): string {
  return `Run ${run.jobId}: ${run.schedulerState} / ${run.stage}`;
}

function renderActionLine(action: ResearchActionSpec): string {
  const parts = [
    `Action: ${action.kind} [${action.status}]`,
    `Purpose: ${action.purpose}`,
    `Stop: ${action.stopCondition}`,
  ];
  return parts.join(' · ');
}

function renderResearchPlanDigest(plan: ResearchPlan): string {
  const steps = plan.steps.length === 0 ? 'no steps' : plan.steps.join('; ');
  const evidence = plan.expectedEvidence.length === 0 ? 'no expected evidence listed' : plan.expectedEvidence.join('; ');
  return [
    `Research plan (${plan.status}): ${plan.objective}`,
    `  Steps: ${steps}`,
    `  Expected evidence: ${evidence}`,
    `  Stop condition: ${plan.stopCondition}`,
  ].join('\n');
}

function renderProgressDigest(progress: ResearchProgressReport): string {
  const lines: string[] = [
    `Latest progress: ${progress.headline}`,
    `  Result: ${progress.result}`,
    `  Mainline impact: ${progress.mainlineImpact}`,
  ];
  if (progress.nextAction !== undefined) {
    lines.push(`  Next step: ${progress.nextAction}`);
  }
  return lines.join('\n');
}

function renderHumanGateBlock(gate: ResearchHumanGate): string {
  const resolved = gate.resolvedAt !== undefined;
  const prefix = resolved ? 'Resolved gate' : 'Pending human gate';
  const lines: string[] = [
    `${prefix} (${gate.kind}): ${gate.prompt}`,
  ];
  if (resolved && gate.resolution !== undefined) {
    lines.push(`  Resolution: ${gate.resolution}`);
  } else {
    lines.push('  The research loop is paused pending this decision.');
  }
  return lines.join('\n');
}

function appendGuidance(lines: string[]): void {
  lines.push(
    '- Prefer the simplest sufficient explanation or experiment and the cheapest decisive evidence first; do not escalate to remote, long-running, or multi-branch work until a smaller local check shows it is necessary.',
  );
  lines.push(
    '- Every bounded research action: declare it with BeginResearchAction (purpose, expected evidence, stop condition), perform only that work, then ConcludeResearchAction with the physical result and next step.',
  );
  lines.push(
    '- Update Research state only on a semantic change; resolve pending human gates with ResolveResearchDecision, and read AITP entries through aitp_show (never Read the Markdown file directly).',
  );
  lines.push(
    '- Follow the using-aitp skill before any current-state maintenance read; this summary is read-only and never auto-writes AITP.',
  );
  lines.push(
    '- At a durable scientific milestone, ProposeResearchCheckpoint then CommitResearchCheckpoint; reserve checkpoints for milestones, not every turn.',
  );
}

function activeAlerts(alerts: readonly ResearchAlert[]): readonly ResearchAlert[] {
  return alerts.filter((alert) =>
    alert.state !== 'acknowledged' &&
    alert.state !== 'cleared' &&
    alert.state !== 'superseded' &&
    alert.acknowledgedAt === undefined,
  );
}

function currentQuestionFingerprint(snapshot: ResearchStatusSnapshot): string | undefined {
  const question = snapshot.currentQuestion ?? snapshot.questions.find((candidate) =>
    candidate.lineSlug === snapshot.currentLineSlug &&
    (candidate.workflow === 'active' || candidate.workflow === 'open'),
  );
  if (question === undefined) return undefined;
  return stableJson({
    id: question.id,
    wording: question.wording,
    workflow: question.workflow,
    epistemic: question.epistemic,
  });
}

function programFingerprint(snapshot: ResearchStatusSnapshot): string | undefined {
  if (snapshot.program === undefined) return undefined;
  return stableJson({
    topicId: snapshot.program.topicId,
    title: snapshot.program.title,
    goalText: snapshot.program.goalText,
    goalSource: snapshot.program.goalSource,
  });
}

function goalSummaryFingerprint(snapshot: ResearchStatusSnapshot): string | undefined {
  if (snapshot.goalSummary === undefined) return undefined;
  return stableJson(snapshot.goalSummary);
}

function goalAlignmentFingerprint(snapshot: ResearchStatusSnapshot): string | undefined {
  const alignment = snapshot.goalAlignment;
  if (alignment === undefined) return undefined;
  return stableJson({
    status: alignment.status,
    reason: alignment.reason,
    binding: alignment.binding,
  });
}

function runFingerprint(run: ResearchRunState | undefined): string | undefined {
  if (run === undefined) return undefined;
  return stableJson({
    actionId: run.actionId,
    jobId: run.jobId,
    stage: run.stage,
    schedulerState: run.schedulerState,
    terminalState: run.terminalState,
  });
}

function researchPlanFingerprint(plan: ResearchPlan | undefined): string | undefined {
  if (plan === undefined) return undefined;
  return stableJson({
    planId: plan.planId,
    status: plan.status,
    objective: plan.objective,
    steps: plan.steps,
    expectedEvidence: plan.expectedEvidence,
    stopCondition: plan.stopCondition,
    resolution: plan.resolution,
  });
}

function nextStepFingerprint(nextStep: ResearchEffectiveNextStep | undefined): string | undefined {
  if (nextStep === undefined) return undefined;
  return stableJson({
    text: nextStep.text,
    source: nextStep.source,
    freshness: nextStep.freshness,
  });
}

function attentionFingerprint(snapshot: ResearchStatusSnapshot): string | undefined {
  const alerts = activeAlerts(snapshot.alerts).map((alert) => ({
    kind: alert.kind,
    message: alert.message,
  }));
  const receipt = snapshot.aitpMaintenance;
  const degraded = receipt?.status === 'degraded';
  const issues = receipt === undefined ? [] : maintenanceIssues(receipt);
  if (alerts.length === 0 && !degraded && issues.length === 0) return undefined;
  return stableJson({
    alerts,
    maintenance: receipt === undefined ? undefined : {
      status: receipt.status,
      issues,
    },
  });
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
