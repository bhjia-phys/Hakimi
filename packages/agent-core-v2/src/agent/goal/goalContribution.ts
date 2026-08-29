/**
 * `goal` domain — protocol-independent goal completion guard and continuation
 * participant collection tokens.
 *
 * These are the two collection contribution seams a Feature (or any unit) uses
 * to observe and steer the goal lifecycle without the goal domain importing
 * the feature: `GoalCompletionGuardContribution` gates `markComplete` before
 * the completion op is dispatched, and `GoalContinuationParticipantContribution`
 * votes on the goal's automatic continuation before a new turn is enqueued.
 * Both records are plain payloads + tokens — no scoped state — and a record is
 * withdrawn when its provider dies. The goal service folds them at Agent
 * scope, so contributions from an ancestor or descendant scope are visible.
 */

import type { Event } from '#/_base/event';
import { collection } from '#/_base/di/collection';

/**
 * A structured denial of goal completion. `reason` is the user-visible
 * message; `code` / `owner` / `nextStep` are optional machine-readable hints
 * a contributor uses to identify itself and what should happen next.
 */
export interface GoalCompletionDeny {
  readonly reason: string;
  readonly code?: string;
  readonly owner?: string;
  readonly nextStep?: string;
}

/**
 * The guard input: the goal snapshot about to be completed and the actor that
 * requested completion.
 */
export interface GoalCompletionGuardInput {
  readonly goalId: string;
  readonly objective: string;
  readonly reason?: string;
  readonly actor: string;
}

export type GoalCompletionGuardResult =
  | { readonly allow: true }
  | ({ readonly allow: false } & GoalCompletionDeny);

/**
 * A guard consulted before the goal service dispatches a completion. Return
 * `{ allow: true }` to let `markComplete` proceed, or `{ allow: false, ... }`
 * with a structured `GoalCompletionDeny` to block it. Guards may be sync or
 * async; the service awaits each guard in record order and a single deny
 * rejects the completion.
 */
export interface GoalCompletionGuardContribution {
  readonly guard: (
    input: GoalCompletionGuardInput,
  ) => Promise<GoalCompletionGuardResult> | GoalCompletionGuardResult;
}

export const GoalCompletionGuardContribution = collection<GoalCompletionGuardContribution>(
  'goal-completion-guard',
);

/**
 * The continuation decision: `abstain` leaves the decision to the default
 * behavior (continue), `continue` forces a continuation turn, and `hold`
 * blocks the automatic continuation — the goal stays active and nothing is
 * enqueued, so a later turn (e.g. a user prompt) resumes it normally.
 */
export type GoalContinuationDecision = 'abstain' | 'continue' | 'hold';

/**
 * A structured hold: `reason` is the user-visible message; `owner` identifies
 * the participant holding the continuation.
 */
export interface GoalContinuationHold {
  readonly reason: string;
  readonly owner?: string;
}

export interface GoalContinuationInput {
  readonly goalId: string;
  readonly objective: string;
  readonly turnsUsed: number;
}

export type GoalContinuationDecisionResult =
  | { readonly decision: Exclude<GoalContinuationDecision, 'hold'> }
  | ({ readonly decision: 'hold' } & GoalContinuationHold);

/**
 * A participant consulted before the goal service enqueues an automatic
 * continuation turn. The service folds all participants in record order and
 * applies the first non-`abstain` decision: a `hold` skips the enqueue and
 * leaves the goal active; `continue` forces the enqueue (the default when all
 * participants abstain).
 */
export interface GoalContinuationParticipantContribution {
  readonly decide: (
    input: GoalContinuationInput,
  ) => Promise<GoalContinuationDecisionResult> | GoalContinuationDecisionResult;
  /** Goal-owned continuation is retried after this participant observes a release. */
  readonly onDidRequestRetry?: Event<string>;
}

export const GoalContinuationParticipantContribution = collection<GoalContinuationParticipantContribution>(
  'goal-continuation-participant',
);
