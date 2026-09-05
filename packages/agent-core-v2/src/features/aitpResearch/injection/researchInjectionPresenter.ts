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
 * missing, or a semantic change in program / Research Goal / phase / progress
 * / action / run / next step / attention) emits a trimmed scientific summary
 * — the durable AITP goal, the Hakimi Research Goal projection, current
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
  ResearchPlanV2,
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
  readonly workstreamBindingFingerprint?: string;
  readonly currentQuestionFingerprint?: string;
  readonly currentActionId?: string;
  readonly currentRunFingerprint?: string;
  readonly researchPlanFingerprint?: string;
  readonly researchPlanV2Fingerprint?: string;
  readonly planningPolicy: ResearchStatusSnapshot['planningPolicy'];
  readonly nextStepFingerprint?: string;
  readonly attentionFingerprint?: string;
}

export function renderResearchInjection(
  snapshot: ResearchStatusSnapshot,
  verbosity: InjectionVerbosity,
): { readonly content: string; readonly disclosure: InjectionDisclosure } {
  const action = currentLineAction(snapshot);
  const run = currentLineRun(snapshot, action);
  const disclosure: InjectionDisclosure = {
    verbosity,
    snapshotRevision: snapshot.revision,
    phase: snapshot.phase,
    progressRecordedAt: snapshot.latestProgress?.recordedAt,
    programFingerprint: programFingerprint(snapshot),
    goalSummaryFingerprint: goalSummaryFingerprint(snapshot),
    goalAlignmentFingerprint: goalAlignmentFingerprint(snapshot),
    workstreamBindingFingerprint: workstreamBindingFingerprint(snapshot),
    currentQuestionFingerprint: currentQuestionFingerprint(snapshot),
    currentActionId: action?.actionId,
    currentRunFingerprint: runFingerprint(run),
    researchPlanFingerprint: researchPlanFingerprint(snapshot.researchPlan),
    researchPlanV2Fingerprint: researchPlanV2Fingerprint(snapshot.researchPlanV2),
    planningPolicy: snapshot.planningPolicy,
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
  const action = currentLineAction(snapshot);
  const run = currentLineRun(snapshot, action);
  if (last === undefined) return 'brief';
  if (snapshot.phase !== last.phase) return 'brief';
  if (snapshot.latestProgress?.recordedAt !== last.progressRecordedAt) return 'brief';
  if (programFingerprint(snapshot) !== last.programFingerprint) return 'brief';
  if (goalSummaryFingerprint(snapshot) !== last.goalSummaryFingerprint) return 'brief';
  if (goalAlignmentFingerprint(snapshot) !== last.goalAlignmentFingerprint) return 'brief';
  if (workstreamBindingFingerprint(snapshot) !== last.workstreamBindingFingerprint) return 'brief';
  if (currentQuestionFingerprint(snapshot) !== last.currentQuestionFingerprint) return 'brief';
  if (action?.actionId !== last.currentActionId) return 'brief';
  if (runFingerprint(run) !== last.currentRunFingerprint) return 'brief';
  if (researchPlanFingerprint(snapshot.researchPlan) !== last.researchPlanFingerprint) return 'brief';
  if (researchPlanV2Fingerprint(snapshot.researchPlanV2) !== last.researchPlanV2Fingerprint) return 'brief';
  if (snapshot.planningPolicy !== last.planningPolicy) return 'brief';
  if (nextStepFingerprint(snapshot.effectiveNextStep) !== last.nextStepFingerprint) return 'brief';
  if (attentionFingerprint(snapshot) !== last.attentionFingerprint) return 'delta';
  return undefined;
}

function currentLineAction(snapshot: ResearchStatusSnapshot): ResearchActionSpec | undefined {
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

function currentLineRun(
  snapshot: ResearchStatusSnapshot,
  action: ResearchActionSpec | undefined,
): ResearchRunState | undefined {
  if (action === undefined) return snapshot.lines.length <= 1 ? snapshot.currentRun : undefined;
  if (action.run?.actionId === action.actionId) return action.run;
  return snapshot.currentRun?.actionId === action.actionId ? snapshot.currentRun : undefined;
}

function currentLineHumanGate(
  snapshot: ResearchStatusSnapshot,
  action: ResearchActionSpec | undefined,
): ResearchHumanGate | undefined {
  const gate = snapshot.humanGate;
  if (gate === undefined) return undefined;
  if (gate.actionId !== undefined && gate.actionId !== action?.actionId) return undefined;
  if (gate.questionId !== undefined) {
    const question = snapshot.questions.find((candidate) => candidate.id === gate.questionId);
    if (question === undefined || question.lineSlug !== snapshot.currentLineSlug) return undefined;
  }
  return gate;
}

function renderBrief(snapshot: ResearchStatusSnapshot): string {
  const action = currentLineAction(snapshot);
  const run = currentLineRun(snapshot, action);
  const lines: string[] = [
    '## AITP Research Mode',
    `Phase: ${snapshot.phase} · Loop: ${snapshot.loopStatus}`,
    `Planning policy: ${snapshot.planningPolicy}`,
    snapshot.program === undefined
      ? 'AITP Research Goal (observed): not established'
      : `AITP Research Goal (observed): ${snapshot.program.goalText}`,
  ];

  if (snapshot.program !== undefined) {
    lines.push(`  AITP Research Goal source: ${snapshot.program.goalSource}`);
  }

  const researchGoal = snapshot.researchGoal ?? snapshot.goalSummary;
  if (researchGoal !== undefined) {
    lines.push(`Hakimi Research Goal: ${researchGoal.objective}`);
    lines.push(`  status: ${researchGoal.status}`);
    if (researchGoal.completionCriterion !== undefined) {
      lines.push(`  Completion criterion: ${researchGoal.completionCriterion}`);
    }
    if (researchGoal.continuation !== undefined) {
      lines.push(`  Continuation: ${researchGoal.continuation.state}` +
        (researchGoal.continuation.reason === undefined ? '' : ` — ${researchGoal.continuation.reason}`));
    }
  }

  if (snapshot.researchGoal !== undefined) {
    const scope = [
      snapshot.researchGoal.scope.programTopicId === undefined
        ? undefined
        : `program ${snapshot.researchGoal.scope.programTopicId}`,
      snapshot.researchGoal.scope.lineSlug === undefined
        ? undefined
        : `line ${snapshot.researchGoal.scope.lineSlug}`,
      snapshot.researchGoal.scope.questionId === undefined
        ? undefined
        : `question ${snapshot.researchGoal.scope.questionId}`,
    ].filter((item): item is string => item !== undefined);
    if (scope.length > 0) lines.push(`  scope: ${scope.join(' · ')}`);
    const blockers = snapshot.researchGoal.persistenceGuards.filter((guard) =>
      guard.status === 'blocked',
    );
    if (blockers.length > 0) {
      lines.push(`  persistence blockers: ${blockers.map((guard) => guard.reason).join(' · ')}`);
    }
  }

  if (snapshot.goalAlignment !== undefined) {
    lines.push(`Goal alignment: ${snapshot.goalAlignment.status} — ${snapshot.goalAlignment.reason}`);
  }
  if (snapshot.currentWorkstreamBinding !== undefined) {
    const binding = snapshot.currentWorkstreamBinding.binding;
    lines.push(
      `AITP workstream binding: ${snapshot.currentWorkstreamBinding.status}` +
      (binding === undefined ? '' : ` — ${binding.workstream}`),
    );
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

  if (action !== undefined) {
    lines.push(renderActionLine(action));
  }
  if (snapshot.researchPlanV2 !== undefined) {
    lines.push(renderResearchPlanV2Digest(snapshot.researchPlanV2));
  }
  if (snapshot.researchPlan !== undefined) {
    lines.push(renderResearchPlanDigest(snapshot.researchPlan));
  }
  if (run !== undefined) {
    lines.push(renderRunDigest(run));
  }

  if (snapshot.latestProgress !== undefined) {
    lines.push(renderProgressDigest(snapshot.latestProgress));
  }

  const humanGate = currentLineHumanGate(snapshot, action);
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
  appendGuidance(lines, snapshot, action);

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
  const alerts = activeAlerts(snapshot.alerts, snapshot.currentLineSlug);
  if (alerts.length > 0) {
    lines.push('Attention:');
    for (const alert of alerts.slice(0, 3)) {
      lines.push(`  [${alert.kind}] ${alert.message}`);
    }
  }

  const binding = snapshot.currentWorkstreamBinding;
  if (snapshot.currentLineSlug !== undefined && binding?.status !== 'bound') {
    lines.push(
      `AITP scoped persistence: blocked — ${binding?.reason ?? 'the current Research Line has no explicit workstream confirmation.'}`,
    );
  }

  const candidate = snapshot.pendingCheckpoint?.commitCandidate;
  if (candidate !== undefined) {
    lines.push(
      `Durable commit candidate: ${candidate.entryKind} / ${candidate.authority} / ${candidate.provenance}. ` +
      (snapshot.mode === 'degraded'
        ? 'Retained locally, not yet committed to AITP. Resume this candidate after AITP is ready; do not repeat the conclusion or relabel it no_durable_delta.'
        : 'Continue the existing prepare, fill, save, show/check, and checkpoint barrier; do not record the conclusion again.'),
    );
  }

  if (snapshot.mode === 'degraded') {
    lines.push('Provisional research: user-directed bounded Actions may continue with their existing scope and tool permissions. AITP writes, automatic Goal continuation and completion remain blocked; do not claim recorded state is freshly verified or turn adapter repair into a repeated prerequisite for exploration.');
  }

  const receipt = snapshot.aitpMaintenance;
  if (receipt === undefined) return;
  const maintainedWorkstream = maintainedScope(snapshot);
  if (maintainedWorkstream !== undefined) {
    lines.push(`Native AITP maintenance: enter/check completed for the confirmed current workstream ${maintainedWorkstream}. Reuse this recorded read result for orientation unless new external changes or stale evidence require refresh; it is not a claim of perpetual health. Loading a Skill, compaction, or a phase change alone does not require another enter/check. Preserve required checkpoint and Note pre/post-save verification and inspect the evidence you rely on.`);
  }
  if (receipt.status === 'degraded') {
    lines.push(receipt.degradedReason === 'workstream_unbound'
      ? 'AITP maintenance: degraded — no explicit Line-to-workstream binding is available.'
      : 'AITP maintenance: degraded — restore a ready adapter before canonical persistence or automatic Goal continuation.');
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
    issues.push(`${receipt.unresolvedFailureCount} unresolved failure(s). Historical context, not a current blocker unless separately classified as active.`);
  }
  if (receipt.nextAction !== undefined) {
    issues.push(`Next AITP action: ${receipt.nextAction}`);
  }
  if (receipt.warningSummaries.length > 0) {
    issues.push(`Warnings: ${receipt.warningSummaries.map((warning) => warning.code).join(', ')}`);
  }
  return issues;
}

function maintainedScope(snapshot: ResearchStatusSnapshot): string | undefined {
  const receipt = snapshot.aitpMaintenance;
  const alignment = snapshot.currentWorkstreamBinding;
  const binding = alignment?.binding;
  const program = snapshot.program;
  if (
    snapshot.mode !== 'ready' || receipt?.status !== 'ready' ||
    receipt.check.status === 'unavailable' ||
    alignment?.status !== 'bound' || binding === undefined || program === undefined ||
    alignment.lineSlug !== snapshot.currentLineSlug || binding.lineSlug !== snapshot.currentLineSlug ||
    binding.topicId !== program.topicId || binding.observedRevision !== program.observedRevision ||
    receipt.workstream !== binding.workstream || receipt.topic?.id !== program.topicId ||
    receipt.topic.title !== program.title || receipt.topic.goalText !== program.goalText ||
    receipt.topic.goalSource !== program.goalSource || receipt.refreshedAt < binding.confirmedAt
  ) return undefined;
  return binding.workstream;
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
    `Action plan (${plan.status}): ${plan.objective}`,
    `  Steps: ${steps}`,
    `  Expected evidence: ${evidence}`,
    `  Stop condition: ${plan.stopCondition}`,
  ].join('\n');
}

function renderResearchPlanV2Digest(plan: ResearchPlanV2): string {
  const milestone = plan.milestones.find((candidate) =>
    candidate.milestoneId === plan.currentMilestoneId,
  );
  return [
    `Research Plan v2 (${plan.status}, version ${plan.revision}): ${plan.objective}`,
    `  Current milestone: ${milestone?.title ?? plan.currentMilestoneId}`,
    `  Milestone evidence: ${milestone?.evidenceRequirements.join('; ') || 'none listed'}`,
    `  Stop conditions: ${plan.stopConditions.join('; ')}`,
    `  Replan conditions: ${plan.replanConditions.join('; ')}`,
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

function appendGuidance(
  lines: string[],
  snapshot: ResearchStatusSnapshot,
  action: ResearchActionSpec | undefined,
): void {
  const planningPolicy = snapshot.planningPolicy;
  if (
    action !== undefined &&
    snapshot.effectiveNextStep?.source === 'research_action' &&
    snapshot.effectiveNextStep.freshness === 'blocked' &&
    snapshot.effectiveNextStep.derivedFrom.actionId === action.actionId
  ) {
    lines.push(
      `- Recovery owns this turn: inspect the already-recorded evidence for action ${action.actionId}, continue only missing in-scope work, then call ConcludeResearchAction once with completed or abandoned. Do not start another action and do not ask the user merely to repair Research bookkeeping; ask only if a genuinely scientific or authorization decision remains.`,
    );
  }
  if (planningPolicy === 'collaborative') {
    lines.push(
      '- Planning policy is collaborative. Before preparing or revising Research Plan v2, ask through AskUserQuestion only when a consequential unknown cannot be resolved from the active Goal, current Research state, prior human direction, or checked evidence and the answer would materially change the plan. If the host permission mode suppresses AskUserQuestion, do not guess a consequential scientific choice: keep the plan draft and either gather non-committing evidence or use RequestResearchDecision, which remains human-owned in every permission mode, for the genuinely non-delegable choice. A dismissed, empty, or ambiguous answer is a no-op.',
    );
  } else {
    lines.push(
      '- Planning policy is dreaming. Once the Goal, scope, and completion criterion are clear, continue the project through Goal-owned Research turns without per-step confirmation. For unresolved choices, select only reversible, low-cost, in-scope defaults and record every chosen default in Research Plan v2 assumptions. Never dream through expensive or irreversible work, scientific-convention ambiguity, Goal or scope changes, or an AITP/human gate; use RequestResearchDecision for those non-delegable choices.',
    );
  }
  lines.push(
    '- Research planning policy and tool permission mode are orthogonal. auto removes routine tool-risk prompts and may suppress AskUserQuestion, but it cannot grant a Research capability, answer RequestResearchDecision or an AITP human gate, confirm Goal-to-Program meaning, widen scope, or bypass an action stop condition.',
  );
  lines.push(
    '- Treat the active Goal objective, completion criterion, scope, confirmed Program relation, current Plan decisions, and prior explicit human direction as already supplied. Never ask the user to restate or re-approve them; continue autonomously when they determine a reversible, low-cost, in-scope next step.',
  );
  lines.push(
    '- Prefer the simplest sufficient explanation or experiment and the cheapest decisive evidence first; do not escalate to remote, long-running, or multi-branch work until a smaller local check shows it is necessary.',
  );
  lines.push(
    '- Every bounded research action: declare it with BeginResearchAction (purpose, expected evidence, stop condition), perform only that work, then call ConcludeResearchAction once with the physical result, next step, and one explicit durability assessment. Do not repeat the same conclusion through RecordResearchProgress.',
  );
  lines.push(
    '- In active Research Mode, allowed_tool_kinds is a runtime capability grant, not prose: use only workspace_read, workspace_write, web_search, web_fetch, shell, task, subagent, scheduler, or tool:<exact-tool-name>. BeginResearchAction and work tools must be in separate tool batches.',
  );
  lines.push(
    '- Use planning_level=simple for a small reversible action whose purpose, expected evidence, and stop condition are sufficient. Use planning_level=planned for work needing a reviewed multi-step local Action Plan. Bind its finalized version; if a non-terminal Research Plan exists, also bind its active version and current milestone. Local exploration needs no Goal or full Research Plan; do not invent either just to perform a bounded inquiry.',
  );
  lines.push(
    '- Update Research state only on a semantic change; resolve pending human gates with ResolveResearchDecision, and read AITP entries through aitp_show (never Read the Markdown file directly).',
  );
  lines.push(
    '- Follow the using-aitp Skill, including its native-coordinator versus fallback ownership rule. Reuse a completed, applicable native enter/check receipt rather than repeating session-start maintenance merely to load or re-read the Skill; absent, degraded, out-of-scope or stale receipts and new external changes still require appropriate refresh. Before executing a potentially covered procedure, retrieve applicable Method cards by their generic marker and inspect their pinned basis. This summary is read-only and never auto-writes AITP.',
  );
  lines.push(
    '- A no_durable_delta conclusion is a strict no-op for AITP. A durable_delta conclusion already emits one pending candidate: continue in the same turn when possible with candidate-exact aitp_record_prepare, model-authored draft fill, aitp_record_save, and CommitResearchCheckpoint. For reusable execution evidence, load and follow the external distilling-methods Skill before filling the Entry; that Skill alone decides exact-card trial pins, observation-marker eligibility, triggers, revisions, and human gates. A first successful commit schedules one same-turn best-effort review of only the touched Entry; a duplicate commit or unavailable Skill is a non-blocking no-op. Keep human assertions/decisions in their own human-authority Entry, separate from agent/tool/source verification. Use ProposeResearchCheckpoint only for recovery or a durable boundary outside the normal conclude path.',
  );
}

function activeAlerts(
  alerts: readonly ResearchAlert[],
  currentLineSlug?: string,
): readonly ResearchAlert[] {
  return alerts.filter((alert) =>
    alert.state !== 'acknowledged' &&
    alert.state !== 'cleared' &&
    alert.state !== 'superseded' &&
    alert.acknowledgedAt === undefined &&
    alert.classification !== 'historical_unresolved' &&
    alert.classification !== 'superseded_by_retry' &&
    (alert.lineSlug === undefined || alert.lineSlug === currentLineSlug),
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

function workstreamBindingFingerprint(snapshot: ResearchStatusSnapshot): string | undefined {
  const alignment = snapshot.currentWorkstreamBinding;
  if (alignment === undefined) return undefined;
  return stableJson({
    lineSlug: alignment.lineSlug,
    status: alignment.status,
    reason: alignment.reason,
    binding: alignment.binding,
  });
}

function goalSummaryFingerprint(snapshot: ResearchStatusSnapshot): string | undefined {
  const goal = snapshot.researchGoal ?? snapshot.goalSummary;
  if (goal === undefined) return undefined;
  const projection = snapshot.researchGoal;
  return stableJson({
    goalId: goal.goalId,
    objective: goal.objective,
    completionCriterion: goal.completionCriterion,
    status: goal.status,
    terminalReason: goal.terminalReason,
    waitingFor: goal.waitingFor,
    continuation: goal.continuation,
    scope: projection?.scope,
    nonGoals: projection?.nonGoals,
    budget: projection === undefined ? undefined : {
      tokenBudget: projection.budget.tokenBudget,
      turnBudget: projection.budget.turnBudget,
      wallClockBudgetMs: projection.budget.wallClockBudgetMs,
      tokenBudgetReached: projection.budget.tokenBudgetReached,
      turnBudgetReached: projection.budget.turnBudgetReached,
      wallClockBudgetReached: projection.budget.wallClockBudgetReached,
      overBudget: projection.budget.overBudget,
    },
    turnBudget: projection === undefined ? snapshot.goalSummary?.turnBudget : undefined,
    stopConditions: projection?.stopConditions,
    programRelation: projection?.programRelation,
    humanGates: projection?.humanGates,
    persistenceGuards: projection?.persistenceGuards,
  });
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

function researchPlanV2Fingerprint(plan: ResearchPlanV2 | undefined): string | undefined {
  if (plan === undefined) return undefined;
  return stableJson({
    planId: plan.planId,
    revision: plan.revision,
    status: plan.status,
    currentMilestoneId: plan.currentMilestoneId,
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
  const alerts = activeAlerts(snapshot.alerts, snapshot.currentLineSlug).map((alert) => ({
    kind: alert.kind,
    message: alert.message,
  }));
  const receipt = snapshot.aitpMaintenance;
  const degraded = snapshot.mode === 'degraded' || receipt?.status === 'degraded';
  const issues = receipt === undefined ? [] : maintenanceIssues(receipt);
  const maintainedWorkstream = maintainedScope(snapshot);
  if (alerts.length === 0 && !degraded && issues.length === 0 && maintainedWorkstream === undefined) return undefined;
  return stableJson({
    alerts,
    degraded,
    maintainedWorkstream,
    maintenance: receipt === undefined ? undefined : {
      status: receipt.status,
      issues,
    },
  });
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
