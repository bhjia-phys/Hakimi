/**
 * `research` domain — pure transition authority for the Research phase
 * state machine and its scientific-state invariants.
 *
 * Single source of truth for the valid Research phase transitions plus the
 * "at most one unresolved human gate" and "at most one foreground current
 * action" and unresolved-run predicates. Both the wire ops (replay-safe no-op
 * on violation) and live service validation (coded errors) consult this
 * authority, so the phase policy can never drift between replay and live
 * paths. Protocol-independent: it depends only on the `research` types, never
 * on AITP. No DI, no mutable state — pure tables and predicates.
 * Scope-agnostic.
 */

import type {
  AwaitingHumanExitPhase,
  ResearchActionStatus,
  ResearchPhase,
  ResearchRunStage,
  ResearchSchedulerState,
} from '../types';

export const RESEARCH_ACTION_RECOVERY_PREFIX = '[research-action-recovery]';

export const AWAITING_HUMAN_EXIT_PHASES = [
  'idle',
  'gap_analysis',
  'action_planned',
  'action_executing',
  'evaluating',
] as const satisfies readonly AwaitingHumanExitPhase[];

/**
 * The canonical Research phase transition table. A transition is valid when
 * `to` is listed under `from`. This is the one and only copy of the policy;
 * replay and live validation both read it from here.
 */
export const RESEARCH_PHASE_TRANSITIONS: Readonly<Record<ResearchPhase, readonly ResearchPhase[]>> = {
  idle: ['orienting', 'gap_analysis', 'action_planned', 'awaiting_human'],
  orienting: ['gap_analysis', 'action_planned', 'idle', 'awaiting_human'],
  gap_analysis: ['action_planned', 'idle', 'awaiting_human'],
  action_planned: ['action_executing', 'idle', 'awaiting_human'],
  action_executing: ['evaluating', 'idle', 'awaiting_human'],
  evaluating: ['state_updated', 'idle', 'awaiting_human'],
  state_updated: ['checkpoint_pending', 'gap_analysis', 'action_planned', 'idle', 'awaiting_human'],
  checkpoint_pending: ['idle', 'gap_analysis', 'awaiting_human'],
  awaiting_human: AWAITING_HUMAN_EXIT_PHASES,
};

/** The phases from which a new research action may be planned. */
export const PLAN_ACTION_PHASES: readonly ResearchPhase[] = [
  'idle',
  'orienting',
  'gap_analysis',
  'state_updated',
  'action_planned',
  'awaiting_human',
];

export function isPhaseTransitionValid(from: ResearchPhase, to: ResearchPhase): boolean {
  return RESEARCH_PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedNextPhases(phase: ResearchPhase): readonly ResearchPhase[] {
  return RESEARCH_PHASE_TRANSITIONS[phase] ?? [];
}

/** True when a human gate record is outstanding (created but not yet resolved). */
export function isUnresolvedHumanGate(
  gate: { readonly resolvedAt?: number } | null | undefined,
): gate is { readonly resolvedAt?: number } {
  return gate !== null && gate !== undefined && gate.resolvedAt === undefined;
}

/** True when an action is still the foreground step (planned or in progress). */
export function isLiveForegroundAction(
  action: { readonly status: ResearchActionStatus } | null | undefined,
): boolean {
  return (
    action !== null &&
    action !== undefined &&
    (action.status === 'planned' || action.status === 'in_progress')
  );
}

export function isLiveResearchRun<TRun extends {
  readonly terminalState?: 'completed' | 'failed' | 'cancelled';
  readonly schedulerState: ResearchSchedulerState;
  readonly stage: ResearchRunStage;
}>(run: TRun | null | undefined): run is TRun {
  if (run === null || run === undefined || run.terminalState !== undefined) return false;
  if (['completed', 'failed', 'cancelled'].includes(run.schedulerState)) return false;
  return run.stage !== 'completed' && run.stage !== 'failed';
}

/** The phase owned by a live foreground action, if one exists. */
export function researchActionOwnedPhase(
  action: { readonly status: ResearchActionStatus } | null | undefined,
): Extract<ResearchPhase, 'action_planned' | 'action_executing'> | undefined {
  if (action?.status === 'planned') return 'action_planned';
  if (action?.status === 'in_progress') return 'action_executing';
  return undefined;
}

export function isRecoveredLiveAction(input: {
  readonly action?: { readonly actionId: string; readonly status: ResearchActionStatus } | null;
  readonly recentStateChange?: {
    readonly actionId?: string;
    readonly summary: string;
  } | null;
}): boolean {
  const { action, recentStateChange } = input;
  return researchActionOwnedPhase(action) !== undefined &&
    recentStateChange?.actionId === action?.actionId &&
    recentStateChange?.summary.startsWith(RESEARCH_ACTION_RECOVERY_PREFIX) === true;
}
