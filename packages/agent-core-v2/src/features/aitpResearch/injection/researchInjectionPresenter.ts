/**
 * `aitpResearch` domain — Research Mode injection presenter.
 *
 * Pure formatting helper that converts a `ResearchStatusSnapshot` plus a
 * Brief/Detail verbosity flag into the string injected by
 * `AitpResearchInjection`. Brief mode (new turn or progress change) emits the
 * full scientific state — current question, phase, current action, latest
 * progress, mainline impact, next step, human gate, current-state AITP
 * maintenance, and AITP behavior guidance. Detail mode (same turn, no progress
 * change) emits a compressed one-block summary. No AITP entry / hash / revision
 * / checkpoint id leaks.
 * Scope-agnostic.
 */

import type {
  AitpMaintenanceReceipt,
  ResearchActionSpec,
  ResearchHumanGate,
  ResearchProgressReport,
  ResearchStatusSnapshot,
} from '../types';

export type InjectionVerbosity = 'brief' | 'detail';

export interface InjectionDisclosure {
  readonly verbosity: InjectionVerbosity;
  readonly snapshotRevision: number;
  readonly phase: string;
  readonly progressRecordedAt?: number;
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
  };

  const content = verbosity === 'brief'
    ? renderBrief(snapshot)
    : renderDetail(snapshot);

  return { content, disclosure };
}

function renderBrief(snapshot: ResearchStatusSnapshot): string {
  const lines: string[] = [
    '## AITP Research Mode',
    `Phase: ${snapshot.phase} · Loop: ${snapshot.loopStatus}`,
  ];

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

  if (snapshot.latestProgress !== undefined) {
    lines.push(renderProgressBlock(snapshot.latestProgress));
  }

  const humanGate = snapshot.humanGate;
  if (humanGate?.resolvedAt === undefined) {
    if (humanGate !== undefined) lines.push(renderHumanGateBlock(humanGate));
  } else {
    lines.push(renderHumanGateBlock(humanGate));
  }

  lines.push(
    `Questions: ${snapshot.openQuestionCount} open · ${snapshot.activeQuestionCount} active · ${snapshot.blockedQuestionCount} blocked`,
  );

  const activeAlerts = snapshot.alerts.filter((alert) => alert.acknowledgedAt === undefined);
  if (activeAlerts.length > 0) {
    lines.push('Alerts:');
    for (const alert of activeAlerts.slice(0, 3)) {
      lines.push(`  [${alert.kind}] ${alert.message}`);
    }
  }

  if (snapshot.aitpMaintenance !== undefined) {
    lines.push(renderMaintenanceBlock(snapshot.aitpMaintenance));
  }

  lines.push('');
  lines.push('### Research state guidance');
  appendGuidance(lines);

  return lines.join('\n');
}

function renderDetail(snapshot: ResearchStatusSnapshot): string {
  const lines: string[] = [
    `## AITP Research Mode (continued)`,
    `Phase: ${snapshot.phase} · Loop: ${snapshot.loopStatus}`,
  ];

  if (snapshot.currentAction !== undefined) {
    lines.push(`Action: ${snapshot.currentAction.kind} — ${snapshot.currentAction.purpose}`);
  }

  if (snapshot.latestProgress !== undefined) {
    lines.push(`Latest: ${snapshot.latestProgress.headline}`);
    lines.push(`  → ${snapshot.latestProgress.mainlineImpact}`);
    if (snapshot.latestProgress.nextAction !== undefined) {
      lines.push(`  Next: ${snapshot.latestProgress.nextAction}`);
    }
  }

  if (snapshot.humanGate !== undefined && snapshot.humanGate.resolvedAt === undefined) {
    lines.push(`⚠ Awaiting human ${snapshot.humanGate.kind}: ${snapshot.humanGate.prompt}`);
  }

  if (snapshot.aitpMaintenance !== undefined) {
    lines.push(renderMaintenanceBlock(snapshot.aitpMaintenance));
  }

  return lines.join('\n');
}

function renderMaintenanceBlock(receipt: AitpMaintenanceReceipt): string {
  const lines: string[] = [
    '### AITP current-state maintenance',
    `Status: ${receipt.status} · Memory: ${receipt.memoryStatus}`,
  ];

  if (receipt.latestWorkingNoteAt === undefined) {
    lines.push('Working Note: not established');
  } else {
    lines.push(`Working Note age: ${formatAge(receipt.latestWorkingNoteAt)}`);
  }
  if (receipt.activeNewerThanWorkingNote === true) {
    lines.push('Current active entries are newer than the Working Note.');
  }
  lines.push(`Unresolved failures: ${receipt.unresolvedFailureCount}`);
  if (receipt.nextAction !== undefined) {
    lines.push(`Next AITP action: ${receipt.nextAction}`);
  }
  if (receipt.warningSummaries.length > 0) {
    lines.push(`Warnings: ${receipt.warningSummaries.map((warning) => warning.code).join(', ')}`);
  }

  if (receipt.check.status === 'unavailable') {
    lines.push('Check: unavailable');
  } else if (receipt.check.counts === undefined) {
    lines.push(`Check: ${receipt.check.status}`);
  } else {
    const counts = receipt.check.counts;
    lines.push(
      `Check: ${receipt.check.status} · entries ${counts.entries} · notes ${counts.notes} · errors ${counts.errors} · warnings ${counts.warnings}`,
    );
  }
  if (receipt.check.findingCodes.length > 0) {
    lines.push(`  Finding codes: ${receipt.check.findingCodes.join(', ')}`);
  }

  return lines.join('\n');
}

function formatAge(timestamp: number): string {
  const ageMs = Math.max(0, Date.now() - timestamp);
  if (ageMs < 60_000) return '<1m';
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function renderActionLine(action: ResearchActionSpec): string {
  const parts = [
    `Action: ${action.kind} [${action.status}]`,
    `Purpose: ${action.purpose}`,
    `Stop: ${action.stopCondition}`,
  ];
  return parts.join(' · ');
}

function renderProgressBlock(progress: ResearchProgressReport): string {
  const lines: string[] = [
    `Latest progress: ${progress.headline}`,
    `  Result: ${progress.result}`,
    `  Mainline impact: ${progress.mainlineImpact}`,
  ];
  if (progress.uncertainties.length > 0) {
    lines.push(`  Uncertainties: ${progress.uncertainties.join('; ')}`);
  }
  if (progress.nextAction !== undefined) {
    lines.push(`  Next step: ${progress.nextAction}`);
  }
  return lines.join('\n');
}

function renderHumanGateBlock(gate: ResearchHumanGate): string {
  const resolved = gate.resolvedAt !== undefined;
  const prefix = resolved ? 'Resolved gate' : '⚠ Pending human gate';
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
    '- If there is no current question, CreateResearchQuestion before taking any bounded action.',
  );
  lines.push(
    '- Before each bounded action, SetResearchFocus to declare the question and the next concrete step.',
  );
  lines.push(
    '- Use PlanResearchAction to declare a bounded action with a stop condition and expected evidence before executing it, then StartResearchAction and CompleteResearchAction.',
  );
  lines.push(
    '- After each bounded action, RecordResearchProgress with what was done, the result, the mainline impact, and the next step.',
  );
  lines.push(
    '- UpdateResearchQuestion only when the epistemic, workflow, or assessment state semantically changes (new evidence, falsification, failure, or sustained no-progress). Update assessment only when the scientific interpretation changes; do not update for ordinary tool calls or AITP reads.',
  );
  lines.push(
    '- CreateResearchLine for a distinct research objective and UpdateResearchLine only when its title, objective, status, or scientific assessment changes. Keep line assessments concise and semantic.',
  );
  lines.push(
    '- At a durable boundary (a committed result, a line conclusion, or a decision to persist), ProposeResearchCheckpoint then CommitResearchCheckpoint. Reserve checkpoints for genuine scientific milestones, not every turn.',
  );
  lines.push(
    '- Use RequestResearchDecision to escalate a scientific choice to the human (approval, review, or decision) and pause the loop.',
  );
  lines.push(
    '- Use Grep over .aitp/topic/ only to locate candidate entries; the canonical full read of any Entry must go through aitp_show. If aitp_show fails, report the real error — do not Read the Markdown file to simulate a successful show.',
  );
  lines.push(
    '- Research Lines and AITP workstreams are different namespaces. When names diverge (e.g. "magnetic-groups" vs "magnetic-symmetry"), you may read from either, but persisting an alias or creating a registry entry requires an explicit researcher decision first.',
  );
  lines.push(
    '- A candidate research question can be created as working state, but do not SetResearchFocus or write a durable AITP decision until the question is confirmed.',
  );
  lines.push(
    '- Follow the using-aitp skill when deciding whether a current-state maintenance read is needed; this summary is read-only and never automatically writes a semantic handoff, Entry, or Note.',
  );
  lines.push(
    '- Treat maintenance warnings and check findings as action signals, not scientific contradictions; inspect and report them without changing epistemic state automatically.',
  );
}
