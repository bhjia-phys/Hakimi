/**
 * `aitpResearch` domain — Research Mode injection presenter.
 *
 * Pure formatting + semantic-diff helper for the context injected by
 * `AitpResearchInjection`. `renderResearchInjection` turns a
 * `ResearchStatusSnapshot` plus a Brief/Delta verbosity flag into the string
 * injected into the model context, and `resolveResearchVerbosity` decides,
 * against the previous `InjectionDisclosure`, whether a turn needs a Brief
 * re-statement, a Delta update, or nothing (no semantic change → undefined, so
 * no duplicate text is appended). Brief mode (prior disclosure
 * missing, or a semantic change in program / Research Goal / phase / progress
 * / action / run / next step / attention) emits a trimmed scientific summary
 * — the durable AITP goal, the Hakimi Research Goal projection, current
 * question, phase, action and run digest, latest physical progress digest, the
 * single effective next step, the pending human gate, and only the attention
 * the model must handle. Delta mode (a deferred refresh with only an attention
 * change) emits just that attention. The disclosure carries semantic
 * fingerprints so the next step can deduplicate reliably. Pending-record
 * attention includes exact checkpoint/revision arguments needed for its tools;
 * it does not include full receipts, checkpoint history or finding details.
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
  readonly humanGateFingerprint?: string;
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
    humanGateFingerprint: humanGateFingerprint(snapshot, action),
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
 * Decide whether the current snapshot needs another injection. A
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
  if (humanGateFingerprint(snapshot, action) !== last.humanGateFingerprint) return 'brief';
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
  const origin = action.observedRunActionId ?? action.actionId;
  if (action.run?.actionId === origin) return action.run;
  return snapshot.currentRun?.actionId === origin ? snapshot.currentRun : undefined;
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
    lines.push(`Hakimi Goal status: ${researchGoal.status} (objective and completion criterion are supplied by the Goal reminder)`);
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
  lines.push('For independent delegation, Agent(task_scope="research-line:<existing Line slug>") captures task ownership without a new Research Action. Keep scope on resume; use a new agent for another direction. This does not confirm an AITP workstream, grant permissions, or answer a pending human decision. Return evidence and limitations to the main agent for synthesis.');
  appendGuidance(lines, snapshot);

  return lines.join('\n');
}

function humanGateFingerprint(
  snapshot: ResearchStatusSnapshot,
  action: ResearchActionSpec | undefined,
): string | undefined {
  const gate = currentLineHumanGate(snapshot, action);
  return gate === undefined ? undefined : renderHumanGateBlock(gate);
}

function renderDelta(snapshot: ResearchStatusSnapshot): string {
  const lines: string[] = [
    `## AITP Research Mode (update)`,
    `Phase: ${snapshot.phase} · Loop: ${snapshot.loopStatus}`,
    'This replaces the previous Research attention summary; omitted memory notices are no longer current. It does not resolve human decisions or validate scientific results.',
  ];
  appendAttention(lines, snapshot);
  return lines.join('\n');
}

function appendAttention(lines: string[], snapshot: ResearchStatusSnapshot): void {
  if (snapshot.localConclusion !== undefined) {
    lines.push(`Local durable conclusion ${snapshot.localConclusion.candidate.sourceActionId}: ${snapshot.localConclusion.progress.headline}. The Action is closed; its full result is local, not recorded in AITP. Confirm only missing ownership: fresh agent conclusions with original captured scope recover automatically after explicit Line/workstream binding. Do not request a second Manager acceptance, repeat work, downgrade durability, or call RecordResearchProgress. Unscoped, stale or possibly committed evidence needs explicit recovery; ordinary checkpoint persistence still uses AITP.`);
  }
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

  const checkpoint = snapshot.pendingCheckpoint;
  const candidate = checkpoint?.commitCandidate;
  if (checkpoint !== undefined && candidate !== undefined) {
    lines.push(
      `Durable commit candidate: ${candidate.entryKind} / ${candidate.authority} / ${candidate.provenance}. ` +
      (snapshot.mode === 'degraded'
        ? 'Retained locally, not yet committed to AITP. Resume this candidate after AITP is ready; do not repeat the conclusion or relabel it no_durable_delta.'
        : `Continue the existing prepare, fill, save, show/check, and checkpoint barrier; do not record the conclusion again. For existing evidence files use ReadResearchCheckpointEvidence (checkpoint_id=${checkpoint.checkpointId}, expected_revision=${snapshot.revision}), not Bash hashing or a new Action. If Research state changes, refresh GetResearchStatus before retrying; never guess the revision.`),
    );
  }

  if (snapshot.mode === 'degraded' && snapshot.localConclusion === undefined) {
    lines.push('AITP is unavailable: retain unsaved findings locally and do not claim they were recorded or freshly verified. Independent research continues under normal permissions; memory availability does not control Goal continuation or completion. Retry affected persistence after recovery, without repeating the scientific work.');
  }

  const receipt = snapshot.aitpMaintenance;
  if (receipt === undefined) return;
  const maintainedWorkstream = maintainedScope(snapshot);
  if (maintainedWorkstream !== undefined) {
    lines.push(`Native AITP maintenance: enter/check completed for the confirmed current workstream ${maintainedWorkstream}. Reuse this recorded read result for orientation unless new external changes or stale evidence require refresh; it is not a claim of perpetual health. Loading a Skill, compaction, or a phase change alone does not require another enter/check. Preserve required checkpoint and Note pre/post-save verification and inspect the evidence you rely on.`);
    lines.push(`For needed Note content without a scoped locator, use aitp_enter(${JSON.stringify({ workstream: maintainedWorkstream, recent: 1 })}) → latest_working_note.source → Read the exact Note and verify its workstreams; not Glob order or another Line's Note. This is on-demand retrieval, not a health cycle or write trigger. A missing scoped Note is not evidence of an empty Topic.`);
  }
  if (receipt.status === 'degraded') {
    lines.push(receipt.degradedReason === 'workstream_unbound'
      ? 'AITP maintenance: degraded — no explicit Line-to-workstream binding is available.'
      : 'AITP maintenance: degraded — restore a ready adapter before canonical persistence; independent research remains available.');
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
    `Research Plan v2 (${plan.status}): ${plan.objective}`,
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
    lines.push(gate.dependentGoalIds === undefined
      ? '  Goal dependency is unknown; automatic continuation is conservatively held. Independent ordinary work remains available.'
      : `  Only dependent Goals wait: ${gate.dependentGoalIds.join(', ')}. Independent work can continue.`);
  }
  return lines.join('\n');
}

function appendGuidance(
  lines: string[],
  snapshot: ResearchStatusSnapshot,
): void {
  const planningPolicy = snapshot.planningPolicy;
  if (snapshot.lines.length > 1) {
    lines.push('- To inspect another existing direction, call GetResearchStatus with line_slug. This is browsing only: it does not switch execution focus or move tasks, checkpoints or AITP record ownership. Do not switch lines merely to read their questions.');
  }
  if (planningPolicy === 'collaborative') {
    lines.push(
      '- Planning policy is collaborative. Before preparing or revising Research Plan v2, ask through AskUserQuestion only when a consequential unknown cannot be resolved from the active Goal, current Research state, prior human direction, or checked evidence and the answer would materially change the plan. If the host permission mode suppresses AskUserQuestion, do not guess a consequential scientific choice: keep the plan draft and either gather non-committing evidence or use RequestResearchDecision, which remains human-owned in every permission mode, for the genuinely non-delegable choice. A dismissed, empty, or ambiguous answer is a no-op.',
    );
  } else {
    lines.push(
      '- Planning policy is dreaming. Once the Goal, scope, and completion criterion are clear, continue without per-step confirmation. Choose reversible, low-cost, in-scope defaults and retain consequential assumptions in the plan. Ask for genuinely non-delegable scientific choices or new authority; memory warnings are not human decisions.',
    );
  }
  lines.push(
    '- Research planning policy and tool permissions are independent. auto does not answer human scientific decisions, widen scope or authorize extra resources. Research actions, phases and memory warnings do not grant or revoke ordinary tool permissions.',
  );
  lines.push(
    '- Reuse the supplied Goal, scope, plan and explicit human direction; never ask the user to restate or re-approve them. Continue with reversible, low-cost, in-scope steps.',
  );
  lines.push(
    '- Prefer the simplest sufficient explanation and cheapest decisive evidence; use remote or multi-branch work when the question needs it, not as a ritual.',
  );
  lines.push(
    '- Work directly under normal tool permissions: read, derive, search literature, edit, test or inspect existing jobs as the scientific question requires. A Research action is optional context for a coherent attempt, not an execution prerequisite. Do not create a hypothesis, plan or action merely to perform a routine check.',
  );
  lines.push(
    '- Follow the active question and revise the plan with new evidence. Pending memory or old action state does not block independent work or justify repeating experiments.',
  );
  lines.push(
    '- Keep planning proportional: routine checks need no new plan. For a difficult question, state the candidate explanation, smallest discriminating test and what its outcomes would mean; revise the plan as evidence changes. Exploration does not require a Goal or a finalized Research Plan.',
  );
  lines.push(
    '- Update Research state only on a semantic change. ResolveResearchDecision records an explicit human answer; never invent one. Prefer aitp_show for canonical Entries and relationships. Reading is not validation or write authorization.',
  );
  if (snapshot.currentRun !== undefined && snapshot.currentRun !== null) {
    lines.push(
      '- Query existing jobs using known host/job/path identities under normal permissions. Avoid duplicate submissions. Scheduler completion is not scientific validation.',
    );
  }
  lines.push(
    '- Follow using-aitp and its native-coordinator versus fallback ownership rule: reuse applicable native enter/check receipts; refresh absent, degraded, out-of-scope or stale memory and relevant external changes. Loading a Skill alone is not a refresh trigger. Retrieve relevant Method cards by their generic marker and inspect their basis. This summary never auto-writes AITP.',
  );
  lines.push(
    '- Record durable findings with evidence in the intended AITP workstream without creating an Action merely to record them; no new information means no write. Recover an existing checkpoint instead of duplicating it. Use Notes for derivations/synthesis and distilling-methods for reusable methods, not every observation. Distinguish human statements, agent conclusions and verified evidence; never invent human approval or publication authority.',
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
  return plan === undefined ? undefined : renderResearchPlanDigest(plan);
}

function researchPlanV2Fingerprint(plan: ResearchPlanV2 | undefined): string | undefined {
  return plan === undefined ? undefined : renderResearchPlanV2Digest(plan);
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
  const checkpoint = snapshot.pendingCheckpoint;
  const pendingEvidence = checkpoint?.commitCandidate === undefined ? undefined : {
    checkpointId: checkpoint.checkpointId,
    entryKind: checkpoint.commitCandidate.entryKind,
    authority: checkpoint.commitCandidate.authority,
    provenance: checkpoint.commitCandidate.provenance,
  };
  if (alerts.length === 0 && !degraded && issues.length === 0 && maintainedWorkstream === undefined && pendingEvidence === undefined) return undefined;
  return stableJson({
    alerts,
    degraded,
    maintainedWorkstream,
    pendingEvidence,
    maintenance: receipt === undefined ? undefined : {
      status: receipt.status,
      issues,
    },
  });
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
