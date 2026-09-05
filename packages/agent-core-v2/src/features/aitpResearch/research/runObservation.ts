/**
 * `aitpResearch` domain — admission of external run observations.
 *
 * Live validation and replay share the same retained-run identity rules.
 * Observing a closed action's existing run changes no scientific conclusion,
 * action lifecycle, human decision, or tool execution permission. Scope-agnostic.
 */

import type { ResearchActionSpec, ResearchPhase, ResearchRunState } from '../types';

type Observation = Omit<ResearchRunState, 'lastObservedAt' | 'artifactRefs'>;

type RunObservationAdmission =
  | { readonly kind: 'active' }
  | { readonly kind: 'retained'; readonly run: ResearchRunState }
  | { readonly kind: 'denied'; readonly reason: string };

export function admitRunObservation(
  state: {
    readonly phase: ResearchPhase;
    readonly currentAction: ResearchActionSpec | null;
    readonly currentRun: ResearchRunState | null;
  },
  observation: Observation,
): RunObservationAdmission {
  const action = state.currentAction;
  if (action?.actionId !== observation.actionId) {
    return { kind: 'denied', reason: 'Run observation must target its original current Research action.' };
  }
  if (observation.terminalState === undefined && ['completed', 'failed', 'cancelled'].includes(observation.schedulerState)) {
    return { kind: 'denied', reason: `Terminal scheduler state ${observation.schedulerState} requires an explicit terminal state.` };
  }
  if (action.status === 'in_progress' && state.phase === 'action_executing') {
    return { kind: 'active' };
  }
  if (action.status !== 'completed' && action.status !== 'abandoned') {
    return { kind: 'denied', reason: 'Run observation requires an executing action or an existing run retained by a closed action.' };
  }
  const run = state.currentRun ?? action.run;
  if (run === undefined) {
    return { kind: 'denied', reason: 'A closed action cannot introduce a new external run.' };
  }
  const copies = [state.currentRun, action.run].filter((value) => value !== null && value !== undefined);
  if (copies.some((copy) =>
    copy.actionId !== action.actionId || copy.jobId !== run.jobId || copy.campaign !== run.campaign ||
    copy.sourcePin !== run.sourcePin || copy.binaryPin !== run.binaryPin ||
    copy.schedulerState !== run.schedulerState || copy.stage !== run.stage ||
    copy.terminalState !== run.terminalState,
  )) {
    return { kind: 'denied', reason: 'Retained run observations disagree; inspect their original identity and terminal evidence.' };
  }
  if (
    observation.campaign !== run.campaign || observation.jobId !== run.jobId ||
    (observation.sourcePin !== undefined && observation.sourcePin !== run.sourcePin) ||
    (observation.binaryPin !== undefined && observation.binaryPin !== run.binaryPin)
  ) {
    return { kind: 'denied', reason: 'A closed action can only observe the same retained campaign, job, source and binary identity.' };
  }
  if (observation.terminalState !== undefined && observation.terminalState !== observation.schedulerState) {
    return { kind: 'denied', reason: 'Retained run terminal evidence must agree with its scheduler state.' };
  }
  if (
    (observation.stage === 'completed' && observation.terminalState !== 'completed') ||
    (observation.stage === 'failed' && observation.terminalState !== 'failed' && observation.terminalState !== 'cancelled')
  ) {
    return { kind: 'denied', reason: 'A retained terminal stage requires consistent explicit terminal evidence.' };
  }
  const terminalState = run.terminalState ?? (
    run.schedulerState === 'completed' || run.schedulerState === 'failed' || run.schedulerState === 'cancelled'
      ? run.schedulerState
      : run.stage === 'completed' || run.stage === 'failed' ? run.stage : undefined
  );
  if (terminalState !== undefined && observation.terminalState !== terminalState) {
    return { kind: 'denied', reason: 'A retained terminal run cannot be reopened or assigned a different terminal outcome.' };
  }
  return { kind: 'retained', run };
}
