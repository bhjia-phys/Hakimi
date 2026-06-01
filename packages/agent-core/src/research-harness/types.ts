import type { CheckContract } from '../physics-memory';
import type {
  HarnessCandidate,
  ResearchActionRecord,
  ResearchEvalCase,
  ResearchEvalValidation,
} from '../research-action';

export type ResearchEvalRunOutcome = 'pass' | 'fail';
export type ResearchEvalValidationOutcome = 'pass' | 'fail';
export type ResearchEvalCheckStatus = 'passed' | 'failed' | 'missing';

export interface ResearchEvalCheckResult {
  readonly checkId: string;
  readonly kind: CheckContract['kind'];
  readonly status: ResearchEvalCheckStatus;
  readonly evidenceRefs: readonly string[];
}

export interface ResearchEvalValidationResult {
  readonly validation: ResearchEvalValidation;
  readonly outcome: ResearchEvalValidationOutcome;
  readonly reason: string;
}

export interface ResearchEvalSequenceResult {
  readonly expectedActionSequence: readonly string[];
  readonly observedActionSequence: readonly string[];
  readonly outcome: ResearchEvalValidationOutcome;
  readonly reason: string;
}

export interface ResearchEvalRunInput {
  readonly evalCase: ResearchEvalCase;
  readonly actionRecords: readonly ResearchActionRecord[];
  readonly checkResults?: readonly ResearchEvalCheckResult[] | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
}

export interface ResearchEvalRunResult {
  readonly evalCaseId: string;
  readonly outcome: ResearchEvalRunOutcome;
  readonly sequence: ResearchEvalSequenceResult;
  readonly validations: readonly ResearchEvalValidationResult[];
  readonly diagnostics: readonly string[];
}

export interface PromoteHarnessCandidateInput {
  readonly candidate: HarnessCandidate;
  readonly id?: string | undefined;
  readonly title?: string | undefined;
  readonly task: string;
  readonly domain?: string | undefined;
  readonly actionSequence?: readonly string[] | undefined;
  readonly additionalValidations?: readonly ResearchEvalValidation[] | undefined;
  readonly timeoutSeconds?: number | undefined;
}
