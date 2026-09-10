/**
 * `aitpResearch` domain — model-facing status disclosure.
 *
 * Pure projection for GetResearchStatus. Preserves scientific state and recovery
 * identity while summarizing repeated check receipts and separating captured
 * focus intent from current next-step guidance; session-wide commit history
 * remains explicitly distinct from evidence for the focused Question. Full
 * diagnostics are available through the same tool. Owns no state or AITP reads,
 * and does not alter the public Research snapshot. Scope-agnostic.
 */

import type {
  ResearchCheckpointCheckReceipt,
  ResearchCheckpointReceipt,
  ResearchStatusSnapshot,
} from '../types';

export function projectResearchStatusForTool(snapshot: ResearchStatusSnapshot) {
  return {
    ...snapshot,
    disclosure: {
      detail: 'summary',
      fullDetails: 'GetResearchStatus({"detail":"full"}) returns the unchanged full snapshot and exact check fingerprints.',
      omitted: 'Check fingerprint arrays are represented by counts; historical checkpoint receipts are omitted, not absent from storage.',
      historyScope: 'Latest/history checkpoints are session-wide persistence facts, not automatically evidence for the current Line or Question. Read canonical Entries before scientific synthesis.',
      focusScope: 'Focus boundedAction is captured selection intent (full only), not a live instruction; follow effectiveNextStep. Focus/Question revisions use separate counters.',
    },
    currentFocus: snapshot.currentFocus === undefined ? undefined : {
      questionId: snapshot.currentFocus.questionId,
      revision: snapshot.currentFocus.revision,
    },
    pendingCheckpoint: summarizeCheckpoint(snapshot.pendingCheckpoint),
    latestCommittedCheckpoint: summarizeCheckpoint(snapshot.latestCommittedCheckpoint),
    committedCheckpointHistory: snapshot.committedCheckpointHistory?.map((cursor) => ({
      checkpointId: cursor.checkpointId,
      entryId: cursor.entryId,
      committedAt: cursor.committedAt,
      workstreams: cursor.receipt?.prepare?.workstreams,
    })),
  };
}

export function projectResearchLineForTool(snapshot: ResearchStatusSnapshot, lineSlug: string) {
  const line = snapshot.lines.find((candidate) => candidate.slug === lineSlug);
  if (line === undefined) return undefined;
  const action = snapshot.currentAction?.lineSlug === lineSlug ? snapshot.currentAction : undefined;
  const run = action === undefined ? undefined
    : snapshot.currentRun?.actionId === action.actionId ? snapshot.currentRun : action.run;
  return {
    view: { kind: 'line_overview', readOnly: true, lineSlug, executionLineSlug: snapshot.currentLineSlug },
    revision: snapshot.revision,
    program: snapshot.program,
    line,
    questions: snapshot.questions.filter((question) => question.lineSlug === lineSlug),
    recordedWorkstreamBinding: snapshot.lineWorkstreamBindings.find((binding) => binding.lineSlug === lineSlug),
    action,
    run: run?.actionId === action?.actionId ? run : undefined,
    pendingCheckpoint: snapshot.pendingCheckpoint?.lineSlug === lineSlug
      ? summarizeCheckpoint(snapshot.pendingCheckpoint) : undefined,
    alerts: snapshot.alerts.filter((alert) => alert.lineSlug === lineSlug),
    disclosure: 'Browsing only: execution focus, Goal, tasks and canonical record ownership are unchanged. The recorded binding is not a fresh persistence authorization. Unattributed/session-wide items are omitted, not resolved. No live action shown does not prove there is no external job. Canonical evidence still requires AITP retrieval.',
  };
}

function summarizeCheckpoint<T extends { readonly receipt?: ResearchCheckpointReceipt }>(checkpoint: T | undefined) {
  if (checkpoint === undefined) return undefined;
  return { ...checkpoint, receipt: summarizeReceipt(checkpoint.receipt) };
}

function summarizeReceipt(receipt: ResearchCheckpointReceipt | undefined) {
  if (receipt === undefined) return undefined;
  return {
    prepare: receipt.prepare,
    save: receipt.save,
    preSaveCheck: summarizeCheck(receipt.preSaveCheck),
    postSaveCheck: summarizeCheck(receipt.postSaveCheck),
  };
}

function summarizeCheck(check: ResearchCheckpointCheckReceipt | undefined) {
  if (check === undefined) return undefined;
  return {
    status: check.status,
    errors: check.errors,
    warnings: check.warnings,
    checkedAt: check.checkedAt,
    findingCount: check.findingFingerprints.length,
    errorFindingCount: check.errorFindingFingerprints.length,
    newErrorFindingCount: check.newErrorFindingFingerprints?.length,
    preExistingErrorFindingCount: check.preExistingErrorFindingFingerprints?.length,
  };
}
