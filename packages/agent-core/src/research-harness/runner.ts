import type {
  ResearchActionRecord,
  ResearchEvalCase,
  ResearchEvalValidation,
} from '../research-action';
import type {
  PromoteHarnessCandidateInput,
  ResearchEvalCheckResult,
  ResearchEvalRunInput,
  ResearchEvalRunResult,
  ResearchEvalSequenceResult,
  ResearchEvalValidationResult,
} from './types';

export function promoteHarnessCandidateToEvalCase(
  input: PromoteHarnessCandidateInput,
): ResearchEvalCase {
  const candidate = input.candidate;
  return {
    id: input.id ?? candidate.id.replace('harness.candidate.', 'harness.eval.'),
    title: input.title ?? candidate.title.replace('Harness candidate', 'Harness eval'),
    task: input.task,
    domain: input.domain,
    capsuleRefs: candidate.capsuleRefs,
    actionSequence: input.actionSequence ?? [candidate.sourceActionId],
    validations: [
      ...candidate.suggestedValidations,
      ...(input.additionalValidations ?? []),
    ],
    timeoutSeconds: input.timeoutSeconds,
  };
}

export function runResearchEvalCase(input: ResearchEvalRunInput): ResearchEvalRunResult {
  const sequence = evaluateActionSequence(input.evalCase.actionSequence, input.actionRecords);
  const validations = input.evalCase.validations.map((validation) =>
    evaluateValidation(validation, input),
  );
  const diagnostics = [
    ...(sequence.outcome === 'pass' ? [] : [sequence.reason]),
    ...validations
      .filter((validation) => validation.outcome === 'fail')
      .map((validation) => validation.reason),
  ];
  return {
    evalCaseId: input.evalCase.id,
    outcome:
      sequence.outcome === 'pass' &&
      validations.every((validation) => validation.outcome === 'pass')
        ? 'pass'
        : 'fail',
    sequence,
    validations,
    diagnostics,
  };
}

function evaluateActionSequence(
  expectedActionSequence: readonly string[],
  actionRecords: readonly ResearchActionRecord[],
): ResearchEvalSequenceResult {
  const observedActionSequence = actionRecords.map((record) => record.actionId);
  if (expectedActionSequence.length === 0) {
    return {
      expectedActionSequence,
      observedActionSequence,
      outcome: 'pass',
      reason: 'No action sequence required.',
    };
  }

  let searchFrom = 0;
  for (const expectedAction of expectedActionSequence) {
    const index = observedActionSequence
      .slice(searchFrom)
      .findIndex((observedAction) => observedAction === expectedAction);
    if (index === -1) {
      return {
        expectedActionSequence,
        observedActionSequence,
        outcome: 'fail',
        reason: `Missing expected action ${expectedAction} in order.`,
      };
    }
    searchFrom += index + 1;
  }

  return {
    expectedActionSequence,
    observedActionSequence,
    outcome: 'pass',
    reason: 'Observed actions satisfy expected sequence.',
  };
}

function evaluateValidation(
  validation: ResearchEvalValidation,
  input: ResearchEvalRunInput,
): ResearchEvalValidationResult {
  switch (validation.type) {
    case 'action_outcome':
      return evaluateActionOutcome(validation, input.actionRecords);
    case 'evidence_ref':
      return evaluateEvidenceRef(validation.pattern, input);
    case 'required_check':
      return evaluateRequiredCheck(validation.check, input.checkResults ?? []);
  }
}

function evaluateActionOutcome(
  validation: Extract<ResearchEvalValidation, { readonly type: 'action_outcome' }>,
  actionRecords: readonly ResearchActionRecord[],
): ResearchEvalValidationResult {
  const matched = actionRecords.find(
    (record) => record.actionId === validation.actionId && record.outcome === validation.outcome,
  );
  return {
    validation,
    outcome: matched ? 'pass' : 'fail',
    reason: matched
      ? `Observed ${validation.actionId} with outcome ${validation.outcome}.`
      : `Did not observe ${validation.actionId} with outcome ${validation.outcome}.`,
  };
}

function evaluateEvidenceRef(
  pattern: string,
  input: ResearchEvalRunInput,
): ResearchEvalValidationResult {
  const evidenceRefs = new Set([
    ...(input.evidenceRefs ?? []),
    ...input.actionRecords.flatMap((record) => record.evidenceRefs),
  ]);
  const matched = [...evidenceRefs].some((ref) => ref.includes(pattern));
  return {
    validation: {
      type: 'evidence_ref',
      pattern,
    },
    outcome: matched ? 'pass' : 'fail',
    reason: matched ? `Evidence ref matched ${pattern}.` : `Missing evidence ref ${pattern}.`,
  };
}

function evaluateRequiredCheck(
  check: Extract<ResearchEvalValidation, { readonly type: 'required_check' }>['check'],
  checkResults: readonly ResearchEvalCheckResult[],
): ResearchEvalValidationResult {
  const matched = checkResults.find((result) => result.checkId === check.id);
  return {
    validation: {
      type: 'required_check',
      check,
    },
    outcome: matched?.status === 'passed' ? 'pass' : 'fail',
    reason:
      matched?.status === 'passed'
        ? `Required check ${check.id} passed.`
        : `Required check ${check.id} did not pass.`,
  };
}
