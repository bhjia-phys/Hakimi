import type {
  ResearchActionBinding,
  ResearchActionId,
  ResearchEvalActionExpectation,
} from './types';

export function researchActionBinding(
  binding: ResearchActionBinding,
): ResearchActionBinding {
  return binding;
}

export function actionIdFromExpectation(
  expectation: ResearchEvalActionExpectation,
): ResearchActionId {
  return typeof expectation === 'string' ? expectation : expectation.actionId;
}

export function actionIdsFromExpectations(
  expectations: readonly ResearchEvalActionExpectation[],
): readonly ResearchActionId[] {
  return expectations.map(actionIdFromExpectation);
}
